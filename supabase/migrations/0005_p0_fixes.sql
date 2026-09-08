-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — P0 fixes (see review_plan.md)
--
--   1. Replace the leads_update_field_staff policy, which let any assigned
--      surveyor or installer rewrite every column on a lead.
--   3. Make the materials checklist and completion photos atomic, so two crew
--      members working at once stop overwriting each other.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Stage advancement ─────────────────────────────────────────────────
-- The old policy gated *which rows* field staff could update but not *which
-- columns*, and Postgres RLS cannot express that. Everything that advances a
-- lead now goes through this function instead: it writes exactly `stage`,
-- `last_activity_at` and (on conversion) `converted_at`, and nothing else.

drop policy if exists leads_update_field_staff on public.leads;

-- Returns the PREVIOUS stage, or null when no row was updated — either because
-- the lead is gone or because `p_only_from` did not match. Callers use the
-- return value to decide whether to write an activity entry.
create or replace function public.advance_lead_stage(
    p_lead_id   uuid,
    p_stage     text,
    -- When given, the move only happens if the lead is currently in one of
    -- these stages. Keeps a re-sent quote from dragging a lead backwards.
    p_only_from text[] default null
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

    -- Office staff run the pipeline; sales run their own leads; field staff may
    -- only move a lead through the part of it they actually perform.
    if v_role in ('admin', 'office') then
        null;

    elsif v_role = 'sales' then
        if not exists (
            select 1 from public.leads
             where id = p_lead_id and assigned_sales_rep_id = auth.uid()
        ) then
            raise exception 'Insufficient permissions' using errcode = '42501';
        end if;

    elsif v_role = 'surveyor' then
        if p_stage not in ('survey_scheduled', 'survey_completed')
           or not exists (
               select 1 from public.surveys
                where lead_id = p_lead_id and assigned_surveyor_id = auth.uid()
           ) then
            raise exception 'Insufficient permissions' using errcode = '42501';
        end if;

    elsif v_role = 'installer' then
        if p_stage not in ('installation_scheduled', 'installation_complete')
           or not exists (
               select 1 from public.installations
                where lead_id = p_lead_id and auth.uid() = any(assigned_crew_ids)
           ) then
            raise exception 'Insufficient permissions' using errcode = '42501';
        end if;

    else
        raise exception 'Insufficient permissions' using errcode = '42501';
    end if;

    -- Read the current stage under a row lock, so the p_only_from guard and the
    -- write below cannot be interleaved with another stage change.
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
           -- Stamp the conversion once, the first time a contract is signed.
           converted_at     = case
               when p_stage = 'contract_signed' and converted_at is null then now()
               else converted_at
           end
     where id = p_lead_id;

    return v_previous;
end;
$$;

grant execute on function public.advance_lead_stage(uuid, text, text[]) to authenticated;

-- ─── 1b. Keep the activity log usable for field staff ─────────────────────
-- log_lead_activity bumps leads.last_activity_at. With the field-staff UPDATE
-- policy gone, that bump would silently no-op for surveyors and installers, so
-- the function now runs SECURITY DEFINER and enforces the same guarantees the
-- RLS policies gave: the caller must be able to see the lead, and user_id is
-- always the caller.
create or replace function public.log_lead_activity(
    p_lead_id     uuid,
    p_action      text,
    p_details     text default null,
    p_entity_type text default null,
    p_entity_id   text default null,
    p_touch_lead  boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.can_see_lead(p_lead_id) then
        raise exception 'Insufficient permissions' using errcode = '42501';
    end if;

    insert into public.activity_log (lead_id, user_id, action, details, entity_type, entity_id)
    values (p_lead_id, auth.uid(), p_action, p_details, p_entity_type, p_entity_id);

    if p_touch_lead then
        update public.leads set last_activity_at = now() where id = p_lead_id;
    end if;
end;
$$;

-- ─── 3. Atomic installation edits ─────────────────────────────────────────
-- SECURITY INVOKER on purpose: each is a single UPDATE, so it is atomic on its
-- own, and leaving RLS in force means installations_update still decides who
-- may write. No permission logic to duplicate.

-- Flips one checklist entry in place. Appends never reorder the array, so the
-- index the client holds stays valid.
create or replace function public.toggle_checklist_item(
    p_installation_id uuid,
    p_index           integer
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
    update public.installations
       set materials_checklist = jsonb_set(
               materials_checklist,
               array[p_index::text, 'checked'],
               to_jsonb(not coalesce(
                   (materials_checklist -> p_index ->> 'checked')::boolean, false
               ))
           )
     where id = p_installation_id
       and materials_checklist -> p_index is not null
    returning materials_checklist;
$$;

create or replace function public.add_checklist_item(
    p_installation_id uuid,
    p_item            text
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
    update public.installations
       set materials_checklist =
               materials_checklist
               || jsonb_build_array(jsonb_build_object('item', p_item, 'checked', false))
     where id = p_installation_id
    returning materials_checklist;
$$;

create or replace function public.append_completion_photos(
    p_installation_id uuid,
    p_paths           text[]
)
returns text[]
language sql
security invoker
set search_path = public
as $$
    update public.installations
       set completion_photo_paths = completion_photo_paths || p_paths
     where id = p_installation_id
    returning completion_photo_paths;
$$;

grant execute on function public.toggle_checklist_item(uuid, integer)   to authenticated;
grant execute on function public.add_checklist_item(uuid, text)         to authenticated;
grant execute on function public.append_completion_photos(uuid, text[]) to authenticated;
