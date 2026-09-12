-- saveQuote (queries/quotes.ts) used to update the quote header, delete all
-- quote_items, then insert the new list as three separate round trips. A
-- failure between the delete and the insert — a dropped connection, a
-- constraint violation on one bad line — left the quote saved with zero line
-- items, silently disagreeing with its own total_php. Folding all of it into
-- one function, the way create_contract already does, makes the whole save
-- succeed or fail as a unit.
--
-- SECURITY INVOKER on purpose, same reasoning as create_contract: RLS still
-- decides who may update quotes / quote_items, this function only removes the
-- gap between the three statements. The `for update` lock matches
-- create_contract's — it's what stops a concurrent save from reading the
-- pre-lock status and racing past the approved check.

create or replace function public.save_quote(
    p_quote_id       uuid,
    p_notes          text,
    p_valid_until    date,
    p_prepared_by_id uuid,
    p_total_php      numeric,
    p_items          jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_status  text;
    v_lead_id uuid;
begin
    select status, lead_id into v_status, v_lead_id
    from public.quotes
    where id = p_quote_id
    for update;

    if not found then
        raise exception 'Quote not found' using errcode = '23514';
    end if;

    if v_status = 'approved' then
        raise exception 'Approved quotes are locked. Unlock the quote to make changes.' using errcode = '23514';
    end if;

    update public.quotes
       set total_php     = p_total_php,
           notes          = p_notes,
           valid_until    = p_valid_until,
           prepared_by_id = p_prepared_by_id
     where id = p_quote_id;

    delete from public.quote_items where quote_id = p_quote_id;

    insert into public.quote_items (
        quote_id, description, qty, unit, unit_price_php, line_total_php, source_package_id, sort_order
    )
    select
        p_quote_id,
        item->>'description',
        (item->>'qty')::numeric,
        item->>'unit',
        (item->>'unit_price_php')::numeric,
        (item->>'line_total_php')::numeric,
        nullif(item->>'source_package_id', '')::uuid,
        (item->>'sort_order')::integer
    from jsonb_array_elements(p_items) as item;

    update public.leads set last_activity_at = now() where id = v_lead_id;
end;
$$;

revoke all on function public.save_quote(uuid, text, date, uuid, numeric, jsonb) from public, anon;
grant execute on function public.save_quote(uuid, text, date, uuid, numeric, jsonb) to authenticated;
