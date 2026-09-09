-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — merge `surveyor` + `installer` into one `field` role
--
-- One person now does both site ocular inspections and installations, so the
-- two field roles collapse into `field` ("Field Technician"). Everything that
-- branched on the old pair has to be rewritten in one pass, because a policy
-- left behind referencing 'surveyor' silently denies every field technician:
-- `has_role('surveyor')` is simply false once the backfill lands.
--
-- Also here, because it belongs to the same release:
--   · append_survey_photos() — lets photos be added to an inspection outside
--     the completion flow, the same way append_completion_photos() works for
--     installations.
--   · a cosmetic relabel of historical activity_log rows to the new
--     "site ocular inspection" wording.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. The role itself ───────────────────────────────────────────────────
-- Drop the constraint first, then backfill, then re-add it. Dropping before
-- the update means there is never a moment where existing rows violate the
-- constraint in force, so the whole thing works in one transaction and can be
-- replayed against an already-migrated database without erroring.

alter table public.users drop constraint if exists users_role_check;

update public.users
   set role = 'field'
 where role in ('surveyor', 'installer');

alter table public.users
    add constraint users_role_check
    check (role in ('admin', 'sales', 'field', 'office'));

-- ─── 2. Row Level Security ────────────────────────────────────────────────
-- Rewrites of the four policies in 0002_rls.sql that named the old roles.
-- Everything else in 0002 is untouched.

-- leads: field staff read the whole pipeline (they need customer names and
-- addresses on their jobs); sales stay scoped to their own.
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
    for select to authenticated
    using (
        public.has_role('admin', 'office', 'field')
        or (public.has_role('sales') and assigned_sales_rep_id = auth.uid())
    );

-- surveys: schedulers edit any inspection; a technician only their own.
drop policy if exists surveys_update on public.surveys;
create policy surveys_update on public.surveys
    for update to authenticated
    using (
        public.has_role('admin', 'office', 'sales')
        or (public.has_role('field') and assigned_surveyor_id = auth.uid())
    )
    with check (
        public.has_role('admin', 'office', 'sales')
        or (public.has_role('field') and assigned_surveyor_id = auth.uid())
    );

-- installations: a technician edits only the jobs they are crewed on.
drop policy if exists installations_update on public.installations;
create policy installations_update on public.installations
    for update to authenticated
    using (
        public.has_role('admin', 'office')
        or (public.has_role('field') and auth.uid() = any(assigned_crew_ids))
    )
    with check (
        public.has_role('admin', 'office')
        or (public.has_role('field') and auth.uid() = any(assigned_crew_ids))
    );

-- service tickets: field staff raise and work them.
drop policy if exists service_tickets_insert on public.service_tickets;
create policy service_tickets_insert on public.service_tickets
    for insert to authenticated
    with check (public.has_role('admin', 'sales', 'office', 'field'));

drop policy if exists service_tickets_update on public.service_tickets;
create policy service_tickets_update on public.service_tickets
    for update to authenticated
    using (public.has_role('admin', 'sales', 'office', 'field'))
    with check (public.has_role('admin', 'sales', 'office', 'field'));

-- ─── 3. Storage ───────────────────────────────────────────────────────────
-- One role now writes to both prefixes: inspection photos under `surveys/`
-- and completion photos under `installations/`.
drop policy if exists lampara_photos_insert on storage.objects;
create policy lampara_photos_insert on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'photos'
        and case (storage.foldername(name))[1]
                when 'surveys'       then public.has_role('admin', 'office', 'sales', 'field')
                when 'installations' then public.has_role('admin', 'office', 'field')
                else false
            end
    );

-- ─── 4. Stage advancement ─────────────────────────────────────────────────
-- Replaces the version in 0005_p0_fixes.sql. The two field branches collapse
-- into one, but the per-stage scoping is preserved: a technician may only move
-- a lead through the step they actually performed, and only on a job they are
-- assigned to. Someone who does both an inspection and the install on the same
-- lead now passes both checks — which is the point of the merge.
create or replace function public.advance_lead_stage(
    p_lead_id   uuid,
    p_stage     text,
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

    if v_role in ('admin', 'office') then
        null;

    elsif v_role = 'sales' then
        if not exists (
            select 1 from public.leads
             where id = p_lead_id and assigned_sales_rep_id = auth.uid()
        ) then
            raise exception 'Insufficient permissions' using errcode = '42501';
        end if;

    elsif v_role = 'field' then
        if not (
            (p_stage in ('survey_scheduled', 'survey_completed') and exists (
                select 1 from public.surveys
                 where lead_id = p_lead_id and assigned_surveyor_id = auth.uid()
            ))
            or (p_stage in ('installation_scheduled', 'installation_complete') and exists (
                select 1 from public.installations
                 where lead_id = p_lead_id and auth.uid() = any(assigned_crew_ids)
            ))
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
           end
     where id = p_lead_id;

    return v_previous;
end;
$$;

grant execute on function public.advance_lead_stage(uuid, text, text[]) to authenticated;

-- ─── 5. Inspection photos outside the completion flow ─────────────────────
-- The mirror of append_completion_photos (0005). `security invoker` on purpose:
-- the surveys_update policy above is what decides whether this caller may touch
-- this inspection, so the guard lives in exactly one place.
--
-- Appending in SQL rather than read-modify-write in the client means two
-- technicians uploading at the same time cannot drop each other's photos.
create or replace function public.append_survey_photos(
    p_survey_id uuid,
    p_paths     text[]
)
returns text[]
language sql
security invoker
set search_path = public
as $$
    update public.surveys
       set photo_paths = photo_paths || p_paths
     where id = p_survey_id
    returning photo_paths;
$$;

grant execute on function public.append_survey_photos(uuid, text[]) to authenticated;

-- ─── 6. Activity log wording ──────────────────────────────────────────────
-- Cosmetic only — the log's substance (who, when, which entity) is untouched.
-- Without this the history reads "Site survey scheduled" above
-- "Site ocular inspection scheduled" for the same kind of event. Delete this
-- block if you would rather keep the historical wording verbatim.
update public.activity_log
   set action = 'Site ocular inspection scheduled'
 where action = 'Site survey scheduled';

update public.activity_log
   set action = 'Site ocular inspection completed'
 where action = 'Site survey completed';

update public.activity_log
   set action = 'Ocular inspection cancelled'
 where action = 'Survey cancelled';

-- ═══════════════════════════════════════════════════════════════════════════
-- After applying, spot-check:
--
--   select role, count(*) from public.users group by role;
--     -- expect only admin / sales / field / office
--
--   select polname from pg_policy
--    where pg_get_expr(polqual, polrelid)      like '%''surveyor''%'
--       or pg_get_expr(polqual, polrelid)      like '%''installer''%'
--       or pg_get_expr(polwithcheck, polrelid) like '%''surveyor''%'
--       or pg_get_expr(polwithcheck, polrelid) like '%''installer''%';
--     -- expect zero rows. The quotes matter: assigned_surveyor_id is a column
--     -- name, not a role literal, and legitimately survives in surveys_update.
-- ═══════════════════════════════════════════════════════════════════════════
