-- Makes the pipeline stage follow the work, instead of being nudged by hand.
--
-- The pieces were already there but disagreed with each other. Scheduling an
-- inspection set the stage unconditionally, so booking a re-visit for a live
-- customer dragged the lead back to Inspection Scheduled. Approving a quote
-- only moved a lead that was exactly at `survey_completed`, so a lead that
-- skipped the inspection never reached Proposal Sent at all. Completing an
-- inspection report moved nothing. And a contract set the stage to Contract
-- Signed the moment it was *created*, days before anyone signed it.
--
-- The rule is now one rule: an automatic advance only ever moves a lead
-- forward. `p_only_from` — a different guard at each call site, each with its
-- own gap — is replaced by `p_allow_backwards`, which only the explicit
-- "change the stage" control in the UI passes.

begin;

-- ── Where each stage sits in the pipeline ────────────────────────────────
-- `cancelled` is deliberately -1 rather than last. It is an exit, not a late
-- stage, so nothing automatic should ever move a lead to it or out of it.
create or replace function public.lead_stage_rank(p_stage text)
returns integer
language sql
immutable
as $$
    select case p_stage
        when 'lead'                   then 0
        when 'survey_scheduled'       then 1
        when 'survey_completed'       then 2
        when 'proposal_sent'          then 3
        when 'contract_signed'        then 4
        when 'installation_scheduled' then 5
        when 'installation_complete'  then 6
        when 'active_customer'        then 7
        else -1
    end
$$;

grant execute on function public.lead_stage_rank(text) to authenticated;

-- ── The advance itself ───────────────────────────────────────────────────
-- The parameter list changes shape, so the old function has to go rather than
-- be replaced in place.
drop function if exists public.advance_lead_stage(uuid, text, text[], text);

create function public.advance_lead_stage(
    p_lead_id          uuid,
    p_stage            text,
    p_allow_backwards  boolean default false,
    p_cancelled_reason text default null
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
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
        -- Field staff move only the stages that mirror their own work, and
        -- only on a job they are actually on. `survey_completed` is here
        -- because completing the inspection report is a field action —
        -- without it, complete_survey_report below fails for the very people
        -- who file the report.
        if not coalesce(
            (p_stage in ('survey_scheduled', 'survey_completed') and exists (
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

    if not p_allow_backwards then
        -- A cancelled lead is only revived deliberately, never by someone
        -- filing a report against it.
        if v_previous = 'cancelled' then
            return null;
        end if;
        -- Already at this stage or past it: nothing to do. Returning null
        -- matches what the old `p_only_from` miss returned, so callers that
        -- log on a real move keep working unchanged.
        if public.lead_stage_rank(p_stage) <= public.lead_stage_rank(v_previous) then
            return null;
        end if;
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
$function$;

grant execute on function public.advance_lead_stage(uuid, text, boolean, text) to authenticated;

-- ── Completing an inspection report moves the lead ───────────────────────
create or replace function public.complete_survey_report(p_survey_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_lead_id uuid;
begin
    if not public.can_edit_survey(p_survey_id) then
        raise exception 'Not allowed to complete this inspection' using errcode = '42501';
    end if;

    -- `coalesce` so completing twice keeps the original timestamp: the first
    -- answer to "when was this done" is the true one.
    update public.surveys
       set completed_at = coalesce(completed_at, now())
     where id = p_survey_id
    returning lead_id into v_lead_id;

    if not found then
        raise exception 'Inspection not found' using errcode = 'P0002';
    end if;

    perform public.advance_lead_stage(v_lead_id, 'survey_completed');
end;
$function$;

grant execute on function public.complete_survey_report(uuid) to authenticated;

-- ── Creating a contract no longer claims it is signed ────────────────────
-- Everything else in this function is unchanged; only the stage advance at the
-- end goes. The lead reaches Contract Signed when someone marks it signed,
-- which is also when `converted_at` should start counting.
create or replace function public.create_contract(
    p_lead_id uuid, p_quote_id uuid, p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_version        integer;
    v_contract_id    uuid;
    v_lead           record;
    v_property       record;
    v_quote          record;
    v_panel_item     record;
    v_inverter_item  record;
    v_battery_item   record;
    v_prepared_by    text;
begin
    if not public.has_role('superadmin', 'admin') then
        raise exception 'Insufficient permissions' using errcode = '42501';
    end if;

    select version, total_php, prepared_by_id
      into v_quote
      from public.quotes
     where id = p_quote_id and lead_id = p_lead_id
       for update;

    if not found then
        raise exception 'Quote does not belong to this lead' using errcode = '23514';
    end if;
    v_version := v_quote.version;

    update public.quotes
       set status = 'approved'
     where id = p_quote_id and status <> 'approved';

    select first_name, last_name, phone into v_lead
      from public.leads
     where id = p_lead_id;

    select address, city, state, zip into v_property
      from public.properties
     where lead_id = p_lead_id
     order by created_at
     limit 1;

    select name into v_prepared_by
      from public.users
     where id = v_quote.prepared_by_id;

    select description, qty, unit into v_panel_item
      from public.quote_items
     where quote_id = p_quote_id and description ilike '%panel%'
     order by sort_order
     limit 1;

    select description, qty, unit into v_inverter_item
      from public.quote_items
     where quote_id = p_quote_id and description ilike '%invert%'
     order by sort_order
     limit 1;

    select description, qty, unit into v_battery_item
      from public.quote_items
     where quote_id = p_quote_id and description ilike '%batter%'
     order by sort_order
     limit 1;

    begin
        insert into public.contracts(
            lead_id, quote_id, status, notes,
            homeowner_name, site_address, phone_number,
            panel_line, inverter_line, battery_line,
            price_php, prepared_by_name, contract_date
        )
        values(
            p_lead_id, p_quote_id, 'pending_signature', nullif(p_notes, ''),
            nullif(btrim(concat_ws(' ', v_lead.first_name, v_lead.last_name)), ''),
            case when v_property.address is not null
                 then concat_ws(', ', v_property.address, v_property.city,
                                 concat_ws(' ', v_property.state, v_property.zip))
                 else null end,
            v_lead.phone,
            case when v_panel_item.description is not null
                 then '( ' || trim(to_char(v_panel_item.qty, 'FM999999990')) || ' ' ||
                      v_panel_item.unit || ' ) ' || v_panel_item.description
                 else null end,
            case when v_inverter_item.description is not null
                 then '( ' || trim(to_char(v_inverter_item.qty, 'FM999999990')) || ' ' ||
                      v_inverter_item.unit || ' ) ' || v_inverter_item.description
                 else null end,
            case when v_battery_item.description is not null
                 then '( ' || trim(to_char(v_battery_item.qty, 'FM999999990')) || ' ' ||
                      v_battery_item.unit || ' ) ' || v_battery_item.description
                 else null end,
            v_quote.total_php,
            v_prepared_by,
            current_date
        )
        returning id into v_contract_id;
    exception when unique_violation then
        raise exception 'A contract already exists for this lead';
    end;

    -- Approving the quote is what moved this lead to Proposal Sent; signing
    -- the contract is what moves it on from there.
    insert into public.activity_log(lead_id, user_id, action, details, entity_type, entity_id)
    values(p_lead_id, auth.uid(), 'Contract created — pending signature',
           'Based on quote v' || v_version, 'contract', v_contract_id::text);

    return v_contract_id;
end;
$function$;

grant execute on function public.create_contract(uuid, uuid, text) to authenticated;

commit;
