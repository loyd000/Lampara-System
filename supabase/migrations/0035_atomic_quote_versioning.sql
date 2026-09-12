-- createQuote and reviseQuote each allocated the next quote version with a
-- client-side `select max(version) ... limit 1`, then inserted — no lock, so
-- two concurrent "New Quote" clicks on the same lead could compute the same
-- next version and race (caught only by the lead_id/version unique
-- constraint, as a confusing failure rather than a clean sequence). reviseQuote
-- additionally inserted the cloned header and its items as two separate
-- calls, so a failure on the second left an orphaned empty draft behind.
--
-- One function serves both: a plain create (p_items empty, p_based_on_version
-- null) and a revision (p_items holds the cloned lines, p_based_on_version is
-- the quote being revised, purely for the activity-log wording).
--
-- SECURITY INVOKER — quotes_insert / quote_items_insert RLS still decide who
-- may call this. The lock is taken on the *lead*, not the quotes table, since
-- there is no existing quote row to lock the first time a lead gets one —
-- serializing on the parent is what actually closes the race.

create or replace function public.create_quote_version(
    p_lead_id          uuid,
    p_prepared_by_id   uuid,
    p_valid_until      date,
    p_notes            text,
    p_total_php        numeric,
    p_items            jsonb default '[]'::jsonb,
    p_based_on_version integer default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_next_version integer;
    v_quote_id     uuid;
    v_quotation_no text;
begin
    perform 1 from public.leads where id = p_lead_id for update;
    if not found then
        raise exception 'Project not found' using errcode = '23514';
    end if;

    select coalesce(max(version), 0) + 1 into v_next_version
    from public.quotes where lead_id = p_lead_id;

    insert into public.quotes (
        lead_id, version, status, total_php, notes, valid_until, prepared_by_id, created_by
    )
    values (
        p_lead_id, v_next_version, 'in_progress', p_total_php, p_notes, p_valid_until,
        coalesce(p_prepared_by_id, auth.uid()), auth.uid()
    )
    returning id, quotation_no into v_quote_id, v_quotation_no;

    if jsonb_array_length(p_items) > 0 then
        insert into public.quote_items (
            quote_id, description, qty, unit, unit_price_php, line_total_php, source_package_id, sort_order
        )
        select
            v_quote_id,
            item->>'description',
            (item->>'qty')::numeric,
            item->>'unit',
            (item->>'unit_price_php')::numeric,
            (item->>'line_total_php')::numeric,
            nullif(item->>'source_package_id', '')::uuid,
            (item->>'sort_order')::integer
        from jsonb_array_elements(p_items) as item;
    end if;

    insert into public.activity_log(lead_id, user_id, action, details, entity_type, entity_id)
    values(
        p_lead_id, auth.uid(),
        case when p_based_on_version is null
             then 'Quote v' || v_next_version || ' created'
             else 'Quote revised to v' || v_next_version
        end,
        case when p_based_on_version is null
             then coalesce(v_quotation_no, 'Version ' || v_next_version)
             else 'Based on v' || p_based_on_version || ' · ' || v_quotation_no
        end,
        'quote', v_quote_id::text
    );

    return v_quote_id;
end;
$$;

revoke all on function public.create_quote_version(uuid, uuid, date, text, numeric, jsonb, integer) from public, anon;
grant execute on function public.create_quote_version(uuid, uuid, date, text, numeric, jsonb, integer) to authenticated;
