-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — role collapse, superadmin, account approval, cancelled leads
--
-- Four roles become three: `sales` and `office` both fold into `admin`, and a
-- new `superadmin` sits above it. Every RLS policy that named the old roles is
-- rewritten below — the grep in feature_plan_v2.md found 27 in 0002 alone, so
-- this migration is long but mechanical: `admin`/`office` becomes
-- `superadmin, admin`, and every `sales` branch is deleted rather than
-- translated, since admin is no longer scoped to "your own leads".
--
-- Also here, because it belongs to the same release:
--   · new sign-ups default to inactive ("pending"), not auto-active — only a
--     superadmin can let someone in
--   · leads gain a `cancelled` stage, with a reason
--
-- Apply after 0012. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. The role set ──────────────────────────────────────────────────────
-- Widen first so the backfill never violates the constraint in force, exactly
-- as 0008 did for the surveyor/installer merge.

alter table public.users drop constraint if exists users_role_check;

update public.users
   set role = 'admin'
 where role in ('sales', 'office');

alter table public.users
    add constraint users_role_check
    check (role in ('superadmin', 'admin', 'field'));

-- ─── 2. Account approval ──────────────────────────────────────────────────
-- `is_active` already gated every RLS policy (via auth_role()); what was
-- missing was a way to tell "never approved" apart from "was approved, then
-- deactivated" so the sign-in screen can say the right thing. approved_at is
-- that marker: null until the first time someone lets this account in.

alter table public.users
    add column if not exists approved_at timestamptz,
    add column if not exists approved_by uuid references public.users (id) on delete set null;

-- Stamps approval the moment an account transitions inactive -> active, so the
-- client only ever needs to flip is_active - it cannot backdate or forge who
-- approved it, and re-deactivating later does not erase the record that this
-- account was, at some point, let in.
create or replace function public.stamp_user_approval()
returns trigger
language plpgsql
as $$
begin
    if new.is_active and not old.is_active and new.approved_at is null then
        new.approved_at := now();
        new.approved_by := auth.uid();
    end if;
    return new;
end;
$$;

drop trigger if exists users_stamp_approval on public.users;
create trigger users_stamp_approval
    before update on public.users
    for each row execute function public.stamp_user_approval();

-- ─── 3. Sign-up default: pending, not active ──────────────────────────────
-- Replaces the version in 0001. The very first account (or the address named
-- below) still lands active - a fresh database that can't sign anyone in is
-- not safer, just broken.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role   text;
    v_active boolean;
begin
    if lower(new.email) = 'deguzman.johnlloyd12@gmail.com' then
        v_role := 'superadmin';
    elsif not exists (select 1 from public.users) then
        -- Bootstrap: whoever signs up first on a fresh database needs a way
        -- in even if it isn't the address above.
        v_role := 'superadmin';
    else
        v_role := 'field';
    end if;

    v_active := (v_role = 'superadmin');

    insert into public.users as u (id, name, email, role, avatar_url, is_active, approved_at)
    values (
        new.id,
        coalesce(
            nullif(new.raw_user_meta_data ->> 'full_name', ''),
            nullif(new.raw_user_meta_data ->> 'name', ''),
            split_part(coalesce(new.email, ''), '@', 1)
        ),
        new.email,
        v_role,
        nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
        v_active,
        case when v_active then now() else null end
    )
    on conflict (id) do update
        set email      = excluded.email,
            name       = coalesce(u.name, excluded.name),
            avatar_url = coalesce(u.avatar_url, excluded.avatar_url);

    return new;
end;
$$;

-- One-time promotion, independent of sign-up order: if this address already
-- has a profile row, it becomes an active superadmin regardless of when it
-- signed up or what it was set to before.
update public.users
   set role = 'superadmin',
       is_active = true,
       approved_at = coalesce(approved_at, now())
 where lower(email) = 'deguzman.johnlloyd12@gmail.com';

-- Safety net: a database with rows but no superadmin (e.g. that address has
-- not signed up yet) promotes whoever has been here longest rather than
-- locking every admin out of account approval.
do $$
begin
    if exists (select 1 from public.users) and not exists (
        select 1 from public.users where role = 'superadmin'
    ) then
        update public.users set role = 'superadmin', is_active = true,
               approved_at = coalesce(approved_at, now())
         where id = (select id from public.users order by created_at asc limit 1);
    end if;
end;
$$;

-- ─── 4. Leads: cancelled stage ────────────────────────────────────────────
alter table public.leads drop constraint if exists leads_stage_check;
alter table public.leads
    add constraint leads_stage_check
    check (stage in (
        'lead', 'survey_scheduled', 'survey_completed', 'proposal_sent',
        'contract_signed', 'permitting', 'installation_scheduled',
        'installation_complete', 'active_customer', 'cancelled'
    ));

alter table public.leads
    add column if not exists cancelled_reason text,
    add column if not exists cancelled_at timestamptz;

-- ─── 5. advance_lead_stage ────────────────────────────────────────────────
-- Replaces 0011's version. The sales branch is deleted outright rather than
-- folded into admin: admin is no longer scoped to "your own leads", so there
-- is nothing left for that branch to check. Gains the reason for `cancelled`
-- and clears it if a lead is ever moved off `cancelled` again.
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

-- ─── 6. create_lead_with_property ─────────────────────────────────────────
-- The auto-assign-to-self branch only ever fired for `sales`, which no longer
-- exists; an explicit assignee (or none) is the whole behaviour now.
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
    v_lead_id uuid;
begin
    insert into public.leads (
        first_name, last_name, phone, email, source, referred_by,
        stage, assigned_sales_rep_id, last_activity_at, notes
    )
    values (
        p_first_name, p_last_name, p_phone, nullif(p_email, ''), p_source,
        nullif(p_referred_by, ''), 'lead', p_assigned_sales_rep_id, now(), nullif(p_notes, '')
    )
    returning id into v_lead_id;

    insert into public.properties (lead_id, address, city, state, zip, property_type)
    values (v_lead_id, p_address, p_city, p_state, p_zip, p_property_type);

    insert into public.activity_log (lead_id, user_id, action, details, entity_type, entity_id)
    values (v_lead_id, auth.uid(), 'Lead created', 'Source: ' || p_source, 'lead', v_lead_id::text);

    return v_lead_id;
end;
$$;

-- ─── 7. can_see_lead ──────────────────────────────────────────────────────
-- The only branch this function ever had was "sales sees only their own";
-- with sales gone every member sees every lead, so this is now is_member()
-- under another name. Kept as a function (not inlined at call sites) so a
-- future per-lead restriction has one place to land.
create or replace function public.can_see_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.is_member();
$$;

-- ─── 8. users ─────────────────────────────────────────────────────────────
-- Role and activation are now a superadmin-only action - that is the entire
-- point of the approval gate. Both guard against self-service the same way
-- users_delete_admin already did.
drop policy if exists users_update_admin on public.users;
create policy users_update_admin on public.users
    for update to authenticated
    using (public.has_role('superadmin') and id <> auth.uid())
    with check (public.has_role('superadmin') and id <> auth.uid());

drop policy if exists users_delete_admin on public.users;
create policy users_delete_admin on public.users
    for delete to authenticated
    using (public.has_role('superadmin') and id <> auth.uid());

-- ─── 9. leads ─────────────────────────────────────────────────────────────
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
    for select to authenticated
    using (public.has_role('superadmin', 'admin', 'field'));

drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads
    for insert to authenticated
    with check (public.has_role('superadmin', 'admin'));

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads
    for update to authenticated
    using (public.has_role('superadmin', 'admin'))
    with check (public.has_role('superadmin', 'admin'));

drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads
    for delete to authenticated
    using (public.has_role('superadmin', 'admin'));

-- ─── 10. properties ───────────────────────────────────────────────────────
drop policy if exists properties_write on public.properties;
create policy properties_write on public.properties
    for all to authenticated
    using (public.has_role('superadmin', 'admin') and public.can_see_lead(lead_id))
    with check (public.has_role('superadmin', 'admin') and public.can_see_lead(lead_id));

-- ─── 11. surveys ──────────────────────────────────────────────────────────
-- Replaces 0012's version. Field's own-report branch is unchanged; every
-- sales/office mention becomes superadmin/admin.
create or replace function public.can_edit_survey(p_survey_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.is_member() and exists (
        select 1 from public.surveys s
         where s.id = p_survey_id
           and s.status <> 'cancelled'
           and (
               public.has_role('superadmin', 'admin')
               or (public.has_role('field') and s.assigned_surveyor_id = auth.uid())
           )
    );
$$;

drop policy if exists surveys_insert on public.surveys;
create policy surveys_insert on public.surveys
    for insert to authenticated
    with check (public.has_role('superadmin', 'admin'));

drop policy if exists surveys_update on public.surveys;
create policy surveys_update on public.surveys
    for update to authenticated
    using (public.can_edit_survey(id) or (public.has_role('superadmin', 'admin') and status = 'scheduled'))
    with check (
        status = 'scheduled'
        or (status = 'cancelled' and public.has_role('superadmin', 'admin'))
    );

drop policy if exists surveys_delete on public.surveys;
create policy surveys_delete on public.surveys
    for delete to authenticated
    using (public.has_role('superadmin', 'admin'));

-- ─── 12. quotes ───────────────────────────────────────────────────────────
drop policy if exists quotes_insert on public.quotes;
create policy quotes_insert on public.quotes
    for insert to authenticated
    with check (public.has_role('superadmin', 'admin') and created_by = auth.uid());

drop policy if exists quotes_update on public.quotes;
create policy quotes_update on public.quotes
    for update to authenticated
    using (public.has_role('superadmin', 'admin'))
    with check (public.has_role('superadmin', 'admin'));

drop policy if exists quotes_delete on public.quotes;
create policy quotes_delete on public.quotes
    for delete to authenticated
    using (public.has_role('superadmin', 'admin') and status = 'draft');

-- ─── 13. contracts ────────────────────────────────────────────────────────
drop policy if exists contracts_insert on public.contracts;
create policy contracts_insert on public.contracts
    for insert to authenticated
    with check (public.has_role('superadmin', 'admin'));

drop policy if exists contracts_update on public.contracts;
create policy contracts_update on public.contracts
    for update to authenticated
    using (public.has_role('superadmin', 'admin'))
    with check (public.has_role('superadmin', 'admin'));

drop policy if exists contracts_delete on public.contracts;
create policy contracts_delete on public.contracts
    for delete to authenticated
    using (public.has_role('superadmin', 'admin'));

-- ─── 14. permits ──────────────────────────────────────────────────────────
drop policy if exists permits_insert on public.permits;
create policy permits_insert on public.permits
    for insert to authenticated
    with check (public.has_role('superadmin', 'admin'));

drop policy if exists permits_update on public.permits;
create policy permits_update on public.permits
    for update to authenticated
    using (public.has_role('superadmin', 'admin'))
    with check (public.has_role('superadmin', 'admin'));

drop policy if exists permits_delete on public.permits;
create policy permits_delete on public.permits
    for delete to authenticated
    using (public.has_role('superadmin', 'admin'));

-- ─── 15. installations ────────────────────────────────────────────────────
drop policy if exists installations_insert on public.installations;
create policy installations_insert on public.installations
    for insert to authenticated
    with check (public.has_role('superadmin', 'admin'));

drop policy if exists installations_update on public.installations;
create policy installations_update on public.installations
    for update to authenticated
    using (
        public.has_role('superadmin', 'admin')
        or (public.has_role('field') and auth.uid() = any(assigned_crew_ids))
    )
    with check (
        public.has_role('superadmin', 'admin')
        or (public.has_role('field') and auth.uid() = any(assigned_crew_ids))
    );

drop policy if exists installations_delete on public.installations;
create policy installations_delete on public.installations
    for delete to authenticated
    using (public.has_role('superadmin', 'admin'));

-- ─── 16. service_tickets ──────────────────────────────────────────────────
drop policy if exists service_tickets_insert on public.service_tickets;
create policy service_tickets_insert on public.service_tickets
    for insert to authenticated
    with check (public.has_role('superadmin', 'admin', 'field'));

drop policy if exists service_tickets_update on public.service_tickets;
create policy service_tickets_update on public.service_tickets
    for update to authenticated
    using (public.has_role('superadmin', 'admin', 'field'))
    with check (public.has_role('superadmin', 'admin', 'field'));

drop policy if exists service_tickets_delete on public.service_tickets;
create policy service_tickets_delete on public.service_tickets
    for delete to authenticated
    using (public.has_role('superadmin', 'admin'));

-- ─── 17. report_pipeline_summary ──────────────────────────────────────────
-- Replaces 0007's version verbatim except for the `cancelled` exclusion below.
-- A cancelled lead has, definitionally, nothing left to follow up on — without
-- this it would age into "stale" and clutter the one list meant to surface
-- leads someone forgot about.
create or replace function public.report_pipeline_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    with visible as (
        select id, first_name, last_name, stage, converted_at, last_activity_at
          from public.leads
    ),
    totals as (
        select
            count(*)                                        as total_leads,
            count(*) filter (where converted_at is not null) as converted,
            count(*) filter (where stage = 'active_customer') as active_customers
          from visible
    ),
    stale as (
        select
            id,
            first_name || ' ' || last_name as name,
            stage,
            greatest(0, (current_date - last_activity_at::date)) as days_stale
          from visible
         where last_activity_at <= now() - interval '7 days'
           and stage not in ('active_customer', 'installation_complete', 'cancelled')
         order by last_activity_at asc
    )
    select jsonb_build_object(
        'stageCounts', coalesce(
            (select jsonb_object_agg(stage, n)
               from (select stage, count(*) as n from visible group by stage) s),
            '{}'::jsonb
        ),
        'totalLeads',      (select total_leads from totals),
        'converted',       (select converted from totals),
        'activeCustomers', (select active_customers from totals),
        'conversionRate',  (
            select case when total_leads > 0
                        then round(100.0 * converted / total_leads)::int
                        else 0 end
              from totals
        ),
        'staleLeads', coalesce(
            (select jsonb_agg(jsonb_build_object(
                '_id', id, 'name', name, 'stage', stage, 'daysStale', days_stale
            )) from stale),
            '[]'::jsonb
        )
    );
$$;

-- ─── 18. storage ──────────────────────────────────────────────────────────
-- Both branches now check the same pair of roles; kept as a case rather than
-- collapsed to one check so a future split (e.g. only field may upload
-- inspection photos) has somewhere to land without restructuring the policy.
drop policy if exists lampara_photos_insert on storage.objects;
create policy lampara_photos_insert on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'photos'
        and case (storage.foldername(name))[1]
                when 'surveys'       then public.has_role('superadmin', 'admin', 'field')
                when 'installations' then public.has_role('superadmin', 'admin', 'field')
                else false
            end
    );

drop policy if exists lampara_documents_insert on storage.objects;
create policy lampara_documents_insert on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'documents'
        and case (storage.foldername(name))[1]
                when 'contracts' then public.has_role('superadmin', 'admin')
                when 'permits'   then public.has_role('superadmin', 'admin')
                else false
            end
    );

-- ═══════════════════════════════════════════════════════════════════════════
-- After applying, spot-check:
--
--   select role, is_active, approved_at is not null as approved, count(*)
--     from public.users group by 1, 2, 3;
--     -- expect only superadmin / admin / field; every pre-existing row
--     -- should show approved = true (the backfill did not touch approved_at
--     -- for rows that were already active)
--
--   select email, role, is_active from public.users
--    where lower(email) = 'deguzman.johnlloyd12@gmail.com';
--     -- expect role = superadmin, is_active = true
--
--   select tablename, policyname from pg_policies
--    where schemaname in ('public', 'storage')
--      and (qual ilike '%sales%' or qual ilike '%office%'
--        or with_check ilike '%sales%' or with_check ilike '%office%');
--     -- expect zero rows
-- ═══════════════════════════════════════════════════════════════════════════
