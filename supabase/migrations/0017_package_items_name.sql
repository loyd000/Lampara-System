-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — package items schema refinement & advance_lead_stage fix
--
-- 1. Adds `name` column to package_items, relaxes description check constraint,
--    and allows unit_price_php to default to 0.
-- 2. Drops older overloaded signatures of `advance_lead_stage` that cause:
--    "ERROR: function public.advance_lead_stage(uuid, unknown) is not unique"
--    when creating a contract from an approved quote.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. package_items refinements ─────────────────────────────────────────

alter table public.package_items
    add column if not exists name text;

alter table public.package_items
    alter column description drop not null;

alter table public.package_items
    drop constraint if exists package_items_description_check;

alter table public.package_items
    alter column unit_price_php set default 0;

-- ─── 2. Fix overloaded advance_lead_stage ambiguity ───────────────────────

-- Drop obsolete overloaded variants that create signature ambiguity with 2 arguments
drop function if exists public.advance_lead_stage(uuid, text);
drop function if exists public.advance_lead_stage(uuid, text, text[]);

-- Ensure canonical 4-argument advance_lead_stage is cleanly defined
create or replace function public.advance_lead_stage(
    p_lead_id           uuid,
    p_stage             text,
    p_only_from         text[] default null,
    p_cancelled_reason  text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role     text := public.auth_role();
    v_previous text;
begin
    if v_role is null then
        raise exception 'Not signed in' using errcode = '42501';
    end if;

    if v_role in ('superadmin', 'admin') then
        null;
    elsif v_role = 'field' then
        if not coalesce(
            (p_stage = 'survey_scheduled' and exists (
                select 1 from public.surveys
                 where lead_id = p_lead_id and assigned_surveyor_id = auth.uid()
            ))
            or (p_stage in ('installation_scheduled', 'installation_complete') and exists (
                select 1 from public.installations
                 where lead_id = p_lead_id and auth.uid() = any(assigned_crew_ids)
            )),
            false
        ) then
            raise exception 'Insufficient permissions' using errcode = '42501';
        end if;
    else
        raise exception 'Insufficient permissions' using errcode = '42501';
    end if;

    select stage into v_previous from public.leads where id = p_lead_id for update;
    if not found then
        return null;
    end if;
    if p_only_from is not null and not (v_previous = any(p_only_from)) then
        return null;
    end if;

    update public.leads
       set stage            = p_stage,
           last_activity_at = now(),
           converted_at     = case
               when p_stage = 'contract_signed' and converted_at is null then now()
               else converted_at
           end,
           cancelled_reason = case
               when p_stage = 'cancelled' then nullif(p_cancelled_reason, '')
               else null
           end,
           cancelled_at = case
               when p_stage = 'cancelled' then now()
               else null
           end
     where id = p_lead_id;

    return v_previous;
end;
$$;

grant execute on function public.advance_lead_stage(uuid, text, text[], text) to authenticated;

-- ─── 3. Re-synchronise create_contract ────────────────────────────────────

create or replace function public.create_contract(
    p_lead_id   uuid,
    p_quote_id  uuid,
    p_notes     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_version     integer;
    v_contract_id uuid;
begin
    if not public.has_role('superadmin', 'admin') then
        raise exception 'Insufficient permissions' using errcode = '42501';
    end if;

    select version into v_version
      from public.quotes
     where id = p_quote_id and lead_id = p_lead_id for update;

    if not found then
        raise exception 'Quote does not belong to this lead' using errcode = '23514';
    end if;

    update public.quotes
       set status = 'approved'
     where id = p_quote_id and status <> 'approved';

    begin
        insert into public.contracts(lead_id, quote_id, status, notes)
        values(p_lead_id, p_quote_id, 'pending_signature', nullif(p_notes, ''))
        returning id into v_contract_id;
    exception when unique_violation then
        raise exception 'A contract already exists for this lead';
    end;

    perform public.advance_lead_stage(p_lead_id, 'contract_signed'::text);

    insert into public.activity_log(lead_id, user_id, action, details, entity_type, entity_id)
    values(p_lead_id, auth.uid(), 'Contract created — pending signature',
           'Based on quote v' || v_version, 'contract', v_contract_id::text);

    return v_contract_id;
end;
$$;

grant execute on function public.create_contract(uuid, uuid, text) to authenticated;
