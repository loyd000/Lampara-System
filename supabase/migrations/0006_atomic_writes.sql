-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — atomic multi-step writes (review_plan.md P1 #5, #6, #9)
--
-- Convex mutations were transactions. Four flows became sequences of
-- independent PostgREST requests during the migration, and a failure part way
-- through left the pipeline inconsistent:
--
--   create lead     lead inserted, property insert fails → address-less lead,
--                   and the client-side rollback could not run as `office`
--   create quote    two reps quoting at once read the same version number
--   revise quote    old quote superseded, replacement insert fails → no live quote
--   create contract quote flipped to accepted, contract insert fails
--
-- Each is now one function, so Postgres rolls the whole thing back.
--
-- All four are SECURITY INVOKER: every statement inside is an ordinary
-- insert/update that the existing RLS policies already govern correctly, so
-- there is no permission logic to duplicate here. The only SECURITY DEFINER
-- call is advance_lead_stage, which does its own checks.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Lead + property + opening audit entry ────────────────────────────────
create or replace function public.create_lead_with_property(
    p_first_name    text,
    p_last_name     text,
    p_phone         text,
    p_source        text,
    p_address       text,
    p_city          text,
    p_state         text,
    p_zip           text,
    p_property_type text,
    p_email         text default null,
    p_referred_by   text default null,
    p_notes         text default null,
    p_assigned_sales_rep_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_lead_id  uuid;
    v_assigned uuid;
begin
    -- A sales rep always owns what they create; leads_insert requires it, and
    -- deciding it here saves the client a round trip to read its own role.
    v_assigned := coalesce(
        p_assigned_sales_rep_id,
        case when public.auth_role() = 'sales' then auth.uid() end
    );

    insert into public.leads (
        first_name, last_name, phone, email, source, referred_by,
        stage, assigned_sales_rep_id, last_activity_at, notes
    )
    values (
        p_first_name, p_last_name, p_phone, nullif(p_email, ''), p_source,
        nullif(p_referred_by, ''), 'lead', v_assigned, now(), nullif(p_notes, '')
    )
    returning id into v_lead_id;

    insert into public.properties (lead_id, address, city, state, zip, property_type)
    values (v_lead_id, p_address, p_city, p_state, p_zip, p_property_type);

    insert into public.activity_log (lead_id, user_id, action, details, entity_type, entity_id)
    values (v_lead_id, auth.uid(), 'Lead created', 'Source: ' || p_source, 'lead', v_lead_id::text);

    return v_lead_id;
end;
$$;

-- ─── Quote creation, with the version race closed ─────────────────────────
create or replace function public.create_quote(
    p_lead_id          uuid,
    p_panel_count      integer,
    p_panel_model      text,
    p_inverter_type    text,
    p_system_size_kw   double precision,
    p_total_price_usd  numeric,
    p_financing_option text,
    p_valid_until      date default null,
    p_notes            text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_version  integer;
    v_quote_id uuid;
begin
    -- Serialise quote creation per lead. Without this, two reps read the same
    -- max(version) and the second insert trips unique (lead_id, version).
    -- An advisory lock rather than SELECT ... FOR UPDATE on the lead, so this
    -- does not need UPDATE rights on a row it is only reading.
    perform pg_advisory_xact_lock(hashtextextended(p_lead_id::text, 0));

    select coalesce(max(version), 0) + 1 into v_version
      from public.quotes where lead_id = p_lead_id;

    insert into public.quotes (
        lead_id, version, status, panel_count, panel_model, inverter_type,
        system_size_kw, total_price_usd, financing_option, valid_until, notes, created_by
    )
    values (
        p_lead_id, v_version, 'draft', p_panel_count, p_panel_model, p_inverter_type,
        p_system_size_kw, p_total_price_usd, p_financing_option,
        p_valid_until, nullif(p_notes, ''), auth.uid()
    )
    returning id into v_quote_id;

    insert into public.activity_log (lead_id, user_id, action, details, entity_type, entity_id)
    values (
        p_lead_id, auth.uid(),
        'Quote v' || v_version || ' created',
        '$' || trim(to_char(p_total_price_usd, 'FM999,999,999,990'))
            || ' · ' || p_system_size_kw || ' kW · ' || p_panel_count || ' panels',
        'quote', v_quote_id::text
    );

    update public.leads set last_activity_at = now() where id = p_lead_id;

    return v_quote_id;
end;
$$;

-- ─── Revision: supersede + clone, or neither ──────────────────────────────
create or replace function public.revise_quote(p_quote_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    q          public.quotes;
    v_version  integer;
    v_new_id   uuid;
begin
    select * into q from public.quotes where id = p_quote_id;
    if not found then
        raise exception 'Quote not found';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(q.lead_id::text, 0));

    update public.quotes set status = 'superseded' where id = p_quote_id;

    select coalesce(max(version), 0) + 1 into v_version
      from public.quotes where lead_id = q.lead_id;

    insert into public.quotes (
        lead_id, version, status, panel_count, panel_model, inverter_type,
        system_size_kw, total_price_usd, financing_option, valid_until, notes, created_by
    )
    values (
        q.lead_id, v_version, 'draft', q.panel_count, q.panel_model, q.inverter_type,
        q.system_size_kw, q.total_price_usd, q.financing_option,
        q.valid_until, q.notes, auth.uid()
    )
    returning id into v_new_id;

    insert into public.activity_log (lead_id, user_id, action, details, entity_type, entity_id)
    values (
        q.lead_id, auth.uid(),
        'Quote revised to v' || v_version,
        'Based on v' || q.version,
        'quote', v_new_id::text
    );

    update public.leads set last_activity_at = now() where id = q.lead_id;

    return v_new_id;
end;
$$;

-- ─── Contract: accept the quote and open the contract together ────────────
create or replace function public.create_contract(
    p_lead_id  uuid,
    p_quote_id uuid,
    p_notes    text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_version     integer;
    v_contract_id uuid;
begin
    select version into v_version from public.quotes where id = p_quote_id;
    if not found then
        raise exception 'Quote not found';
    end if;

    update public.quotes
       set status = 'accepted'
     where id = p_quote_id and status <> 'accepted';

    begin
        insert into public.contracts (lead_id, quote_id, status, notes)
        values (p_lead_id, p_quote_id, 'pending_signature', nullif(p_notes, ''))
        returning id into v_contract_id;
    exception when unique_violation then
        -- contracts.lead_id is unique; re-raise as a plain message so the
        -- client shows this rather than the generic duplicate-row wording.
        raise exception 'A contract already exists for this lead';
    end;

    -- Stamps converted_at on the first move into contract_signed.
    perform public.advance_lead_stage(p_lead_id, 'contract_signed');

    insert into public.activity_log (lead_id, user_id, action, details, entity_type, entity_id)
    values (
        p_lead_id, auth.uid(),
        'Contract created — pending signature',
        'Based on quote v' || v_version,
        'contract', v_contract_id::text
    );

    return v_contract_id;
end;
$$;

grant execute on function public.create_lead_with_property(
    text, text, text, text, text, text, text, text, text, text, text, text, uuid
) to authenticated;
grant execute on function public.create_quote(
    uuid, integer, text, text, double precision, numeric, text, date, text
) to authenticated;
grant execute on function public.revise_quote(uuid)                   to authenticated;
grant execute on function public.create_contract(uuid, uuid, text)    to authenticated;

-- next_quote_version is superseded by create_quote's in-transaction allocation.
-- Note: 0002 grants EXECUTE on it, so if you ever replay 0002 *after* this file
-- that grant will fail. Replay 0002 then 0006, or drop the grant line first.
drop function if exists public.next_quote_version(uuid);
