-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — the real Site Ocular Report
--
-- `surveys` held six fields and a flat array of photos. The form the crew
-- actually fills (public/Ocular report sample.pdf) has ~40 and eight *named*
-- photo slots — a shot of the Meralco meter is not interchangeable with a shot
-- of the roof. This migration models the form as it is printed:
--
--   · typed columns on public.surveys, one per field on the paper form
--   · public.survey_photos, so every photo knows which slot it belongs in
--   · a prepared/approved sign-off, matching the two signature blocks at the
--     end of the report
--
-- Status flow changes from (scheduled → completed) to
-- (scheduled → submitted → approved), with `cancelled` unchanged. Approval is
-- what advances the lead to `survey_completed` and unlocks quoting.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Status: add submitted / approved ──────────────────────────────────
-- Historical `completed` rows are folded into `approved`: they were accepted at
-- the time and quotes were written against them, so leaving them in a pending
-- state would misrepresent the history.

alter table public.surveys drop constraint if exists surveys_status_check;

update public.surveys set status = 'approved' where status = 'completed';

alter table public.surveys
    add constraint surveys_status_check
    check (status in ('scheduled', 'submitted', 'approved', 'cancelled'));

-- ─── 2. Report fields ─────────────────────────────────────────────────────
-- Grouped in the order they appear on the form, so the migration reads like
-- the page. All nullable: the report is filled over a visit, not in one shot.

alter table public.surveys
    -- CLIENT DETAILS ──────────────────────────────────────────────────────
    add column if not exists inspection_date        date,
    -- The "Coordinates:" line. Captured from the technician's device on site,
    -- and the same pair the lead map will read later.
    add column if not exists latitude               double precision,
    add column if not exists longitude              double precision,
    add column if not exists usage_habit            text
        check (usage_habit in ('morning', 'evening', 'both')),
    add column if not exists monthly_consumption_kwh numeric(10, 2),
    add column if not exists monthly_bill_php        numeric(12, 2),

    -- Appliances: a tick plus a free line each on the form. Booleans rather
    -- than a jsonb blob so "how many sites run aircon" stays a plain query.
    add column if not exists appliance_aircon       boolean not null default false,
    add column if not exists appliance_aircon_note  text,
    add column if not exists appliance_tv           boolean not null default false,
    add column if not exists appliance_tv_note      text,
    add column if not exists appliance_ref          boolean not null default false,
    add column if not exists appliance_ref_note     text,
    add column if not exists appliance_washer       boolean not null default false,
    add column if not exists appliance_washer_note  text,
    add column if not exists appliance_others       text,

    -- ROOF ────────────────────────────────────────────────────────────────
    -- roof_type already exists (0001). The sample writes "N/A (structural
    -- support)", so the qualifier gets its own line rather than widening the
    -- enum.
    add column if not exists roof_type_note         text,
    -- Arrays where a real roof can genuinely be more than one thing.
    add column if not exists support_purlins        text[] not null default '{}',
    add column if not exists roof_area_sqm          numeric(10, 2),
    add column if not exists roof_width_m           numeric(10, 2),
    add column if not exists roof_length_m          numeric(10, 2),
    add column if not exists roof_access            text
        check (roof_access in ('ladder', 'scaffolding', 'both')),
    add column if not exists mounting               text[] not null default '{}',
    add column if not exists roof_orientation       text[] not null default '{}',
    add column if not exists est_dc_run_m           numeric(10, 2),
    add column if not exists est_ac_run_m           numeric(10, 2),

    -- ELECTRIC METER ──────────────────────────────────────────────────────
    add column if not exists meter_phase            text
        check (meter_phase in ('single', 'three')),
    add column if not exists transformer_count      integer,
    add column if not exists meter_kind             text
        check (meter_kind in ('main', 'sub')),
    add column if not exists meter_form             text
        check (meter_form in ('round', 'st5_7', 'ct_rated')),
    add column if not exists service_disconnect     boolean,
    add column if not exists service_disconnect_rating text,

    -- PANEL / NETWORK ─────────────────────────────────────────────────────
    add column if not exists grounding              boolean,
    add column if not exists main_distribution_panel text,
    add column if not exists cb_size_rating         text,
    add column if not exists wire_size              text,
    add column if not exists connection_type        text
        check (connection_type in ('gprs', 'wifi')),
    add column if not exists floor_count            integer,

    -- SYSTEM PACKAGE / DETAILS ────────────────────────────────────────────
    add column if not exists system_capacity        text
        check (system_capacity in ('3kwp', '6kwp', '8kwp', '12kwp', '16kwp')),
    add column if not exists package_type           text
        check (package_type in ('with_battery', 'no_battery')),
    add column if not exists battery_option         text
        check (battery_option in ('100ah_5kwh', '314ah_16kwh')),
    add column if not exists panel_option           text
        check (panel_option in ('610_630wp', '710_730wp')),
    add column if not exists report_notes           text,

    -- SIGN-OFF ────────────────────────────────────────────────────────────
    add column if not exists prepared_by_id         uuid references public.users (id) on delete set null,
    add column if not exists prepared_at            timestamptz,
    add column if not exists approved_by_id         uuid references public.users (id) on delete set null,
    add column if not exists approved_at            timestamptz;

comment on column public.surveys.photo_paths is
    'Superseded by public.survey_photos, which records which slot on the report '
    'each photo fills. Backfilled into that table by 0009; kept for one release '
    'so nothing is lost if the new flow needs backing out.';

-- Array contents are validated in one place rather than with a CHECK per
-- column, which Postgres cannot express against array elements directly.
create or replace function public.survey_arrays_valid()
returns trigger
language plpgsql
as $$
begin
    if not (new.support_purlins <@ array['wood', 'steel', 'concrete']) then
        raise exception 'Invalid support_purlins value' using errcode = '23514';
    end if;
    if not (new.mounting <@ array['l_foot', 'u_type', 'tegula', 'hanger_bolt']) then
        raise exception 'Invalid mounting value' using errcode = '23514';
    end if;
    if not (new.roof_orientation <@ array['north', 'east', 'west', 'south']) then
        raise exception 'Invalid roof_orientation value' using errcode = '23514';
    end if;
    return new;
end;
$$;

drop trigger if exists surveys_arrays_valid on public.surveys;
create trigger surveys_arrays_valid
    before insert or update on public.surveys
    for each row execute function public.survey_arrays_valid();

-- ─── 3. Photos, by slot ───────────────────────────────────────────────────
-- The categories are the headed sections of the printed report. `other` exists
-- so the backfill below has somewhere to put photos taken before slots existed.

create table if not exists public.survey_photos (
    id         uuid primary key default gen_random_uuid(),
    survey_id  uuid not null references public.surveys (id) on delete cascade,
    category   text not null check (category in (
                   'building_front',
                   'roof_view',
                   'meralco_meter',
                   'main_circuit_breaker',
                   'meralco_bill',
                   'roof_panel_design',
                   'inverter_battery',
                   'dc_conduit',
                   'ac_conduit',
                   'other'
               )),
    -- Object path in the private `photos` bucket, under the `surveys/` prefix.
    path       text not null,
    caption    text,
    sort_order integer not null default 0,
    created_by uuid references public.users (id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists survey_photos_survey_idx
    on public.survey_photos (survey_id, category, sort_order);

-- One row per object, so a double-submit cannot record the same file twice.
create unique index if not exists survey_photos_path_key
    on public.survey_photos (path);

-- Backfill: everything already in photo_paths becomes an uncategorised photo,
-- in the order it was stored.
insert into public.survey_photos (survey_id, category, path, sort_order)
select s.id, 'other', p.path, p.ord - 1
  from public.surveys s
  cross join lateral unnest(s.photo_paths) with ordinality as p(path, ord)
 where s.photo_paths is not null
on conflict (path) do nothing;

-- ─── 4. RLS for survey_photos ─────────────────────────────────────────────
-- Mirrors surveys_select / surveys_update (0008): every member reads, but only
-- the schedulers and the technician actually sent out may write.

create or replace function public.can_edit_survey(p_survey_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.has_role('admin', 'office', 'sales')
        or exists (
            select 1 from public.surveys
             where id = p_survey_id and assigned_surveyor_id = auth.uid()
        );
$$;

grant execute on function public.can_edit_survey(uuid) to authenticated;

alter table public.survey_photos enable row level security;

drop policy if exists survey_photos_select on public.survey_photos;
create policy survey_photos_select on public.survey_photos
    for select to authenticated
    using (public.is_member());

drop policy if exists survey_photos_insert on public.survey_photos;
create policy survey_photos_insert on public.survey_photos
    for insert to authenticated
    with check (public.can_edit_survey(survey_id));

drop policy if exists survey_photos_update on public.survey_photos;
create policy survey_photos_update on public.survey_photos
    for update to authenticated
    using (public.can_edit_survey(survey_id))
    with check (public.can_edit_survey(survey_id));

drop policy if exists survey_photos_delete on public.survey_photos;
create policy survey_photos_delete on public.survey_photos
    for delete to authenticated
    using (public.can_edit_survey(survey_id));

-- ─── 5. Submit and approve ────────────────────────────────────────────────
-- Both stamp the signature blocks and move the status. They are SECURITY
-- DEFINER because approval also advances the lead, which field staff cannot do
-- directly — and because the caller must not be able to choose whose name goes
-- on the report.

create or replace function public.submit_survey_report(p_survey_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_status text;
begin
    if not public.can_edit_survey(p_survey_id) then
        raise exception 'Insufficient permissions' using errcode = '42501';
    end if;

    select status into v_status from public.surveys where id = p_survey_id for update;
    if not found then
        raise exception 'Inspection not found' using errcode = 'P0002';
    end if;
    if v_status = 'cancelled' then
        raise exception 'This inspection was cancelled' using errcode = '22023';
    end if;

    update public.surveys
       set status       = 'submitted',
           prepared_by_id = coalesce(prepared_by_id, auth.uid()),
           prepared_at    = coalesce(prepared_at, now())
     where id = p_survey_id;
end;
$$;

create or replace function public.approve_survey_report(p_survey_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_lead_id uuid;
    v_status  text;
begin
    -- Approval is the office's quality gate; the technician who prepared the
    -- report cannot wave their own work through.
    if not public.has_role('admin', 'office') then
        raise exception 'Only admin or office staff can approve a report'
            using errcode = '42501';
    end if;

    select lead_id, status into v_lead_id, v_status
      from public.surveys where id = p_survey_id for update;
    if not found then
        raise exception 'Inspection not found' using errcode = 'P0002';
    end if;
    if v_status <> 'submitted' then
        raise exception 'Only a submitted report can be approved'
            using errcode = '22023';
    end if;

    update public.surveys
       set status         = 'approved',
           completed_at   = coalesce(completed_at, now()),
           approved_by_id = auth.uid(),
           approved_at    = now()
     where id = p_survey_id;

    -- Approval is what opens quoting.
    perform public.advance_lead_stage(v_lead_id, 'survey_completed');
end;
$$;

-- Sends a submitted report back for changes.
create or replace function public.reopen_survey_report(p_survey_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.has_role('admin', 'office') then
        raise exception 'Only admin or office staff can reopen a report'
            using errcode = '42501';
    end if;

    -- Clear the approval stamps too: a reopened report is no longer approved,
    -- and leaving a name in the "Approved by" block would print a signature on
    -- a document nobody has signed off.
    --
    -- The lead's stage is deliberately left where it is. Dragging a lead back
    -- from `survey_completed` could strand a quote or a contract that has since
    -- been written against it; whoever reopens the report can move the stage
    -- back by hand if that is really what they mean.
    update public.surveys
       set status         = 'scheduled',
           approved_by_id = null,
           approved_at    = null,
           completed_at   = null
     where id = p_survey_id and status in ('submitted', 'approved');
end;
$$;

grant execute on function public.submit_survey_report(uuid)  to authenticated;
grant execute on function public.approve_survey_report(uuid) to authenticated;
grant execute on function public.reopen_survey_report(uuid)  to authenticated;

-- ─── 6. Realtime ──────────────────────────────────────────────────────────
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = 'survey_photos'
    ) then
        alter publication supabase_realtime add table public.survey_photos;
    end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- After applying, spot-check:
--
--   select status, count(*) from public.surveys group by status;
--     -- expect scheduled / submitted / approved / cancelled, no `completed`
--
--   select count(*) from public.survey_photos where category = 'other';
--     -- should equal the total length of every old photo_paths array
-- ═══════════════════════════════════════════════════════════════════════════
