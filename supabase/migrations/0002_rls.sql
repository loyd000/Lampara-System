-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — Row Level Security
--
-- These policies replace the getCurrentUser() / requireRole() / requireAdmin()
-- guards that used to live in convex/lib/auth.ts. Because the browser now talks
-- to Postgres directly, every rule that was enforced in a Convex mutation has
-- to be expressed here — the client is not trusted.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Role helpers ─────────────────────────────────────────────────────────
-- SECURITY DEFINER so that reading the caller's own role does not re-enter the
-- policies on public.users (which would recurse).
create or replace function public.auth_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select role from public.users where id = auth.uid() and is_active;
$$;

create or replace function public.has_role(variadic p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.auth_role() = any(p_roles);
$$;

-- A signed-in, non-deactivated member of the org.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.auth_role() is not null;
$$;

-- Sales reps are scoped to the leads assigned to them; every other role sees
-- the whole pipeline (surveyors and installers need lead names on their jobs).
create or replace function public.can_see_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select case
        when public.auth_role() is null then false
        when public.auth_role() <> 'sales' then true
        else exists (
            select 1 from public.leads
             where id = p_lead_id and assigned_sales_rep_id = auth.uid()
        )
    end;
$$;

grant execute on function public.auth_role()          to authenticated;
grant execute on function public.has_role(text[])     to authenticated;
grant execute on function public.is_member()          to authenticated;
grant execute on function public.can_see_lead(uuid)   to authenticated;
grant execute on function public.next_quote_version(uuid) to authenticated;
grant execute on function public.log_lead_activity(uuid, text, text, text, text, boolean) to authenticated;

-- ─── Enable RLS everywhere ────────────────────────────────────────────────
alter table public.users           enable row level security;
alter table public.leads           enable row level security;
alter table public.properties      enable row level security;
alter table public.surveys         enable row level security;
alter table public.quotes          enable row level security;
alter table public.contracts       enable row level security;
alter table public.permits         enable row level security;
alter table public.installations   enable row level security;
alter table public.service_tickets enable row level security;
alter table public.activity_log    enable row level security;

-- ─── users ────────────────────────────────────────────────────────────────
-- Read: every member (the team page, assignment dropdowns and name lookups all
-- need the roster). Role/status changes: admin only. Self-service is limited to
-- the caller's own display name / avatar.
drop policy if exists users_select on public.users;
create policy users_select on public.users
    for select to authenticated
    using (id = auth.uid() or public.is_member());

-- Self-service is limited to name/avatar: the WITH CHECK pins role to whatever
-- auth_role() already reports and requires the row to stay active, so a user
-- cannot promote themselves. Both comparisons go through the SECURITY DEFINER
-- helper rather than a sub-select on public.users, which would re-enter this
-- policy and recurse.
drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
    for update to authenticated
    using (id = auth.uid())
    with check (
        id = auth.uid()
        and role = public.auth_role()
        and is_active
    );

drop policy if exists users_update_admin on public.users;
create policy users_update_admin on public.users
    for update to authenticated
    using (public.has_role('admin'))
    with check (public.has_role('admin'));

drop policy if exists users_delete_admin on public.users;
create policy users_delete_admin on public.users
    for delete to authenticated
    using (public.has_role('admin') and id <> auth.uid());

-- No INSERT policy: rows are created only by the SECURITY DEFINER signup
-- trigger in 0001, never by the client.

-- ─── leads ────────────────────────────────────────────────────────────────
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
    for select to authenticated
    using (
        public.has_role('admin', 'office', 'surveyor', 'installer')
        or (public.has_role('sales') and assigned_sales_rep_id = auth.uid())
    );

drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads
    for insert to authenticated
    with check (
        public.has_role('admin', 'office')
        or (public.has_role('sales') and assigned_sales_rep_id = auth.uid())
    );

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads
    for update to authenticated
    using (
        public.has_role('admin', 'office')
        or (public.has_role('sales') and assigned_sales_rep_id = auth.uid())
    )
    with check (
        public.has_role('admin', 'office')
        or (public.has_role('sales') and assigned_sales_rep_id = auth.uid())
    );

-- Surveyors and installers advance the lead stage as a side effect of
-- completing their own work (survey completed → survey_completed, etc.).
drop policy if exists leads_update_field_staff on public.leads;
create policy leads_update_field_staff on public.leads
    for update to authenticated
    using (
        (public.has_role('surveyor') and exists (
            select 1 from public.surveys s
             where s.lead_id = leads.id and s.assigned_surveyor_id = auth.uid()
        ))
        or (public.has_role('installer') and exists (
            select 1 from public.installations i
             where i.lead_id = leads.id and auth.uid() = any(i.assigned_crew_ids)
        ))
    )
    with check (true);

drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads
    for delete to authenticated
    using (
        public.has_role('admin')
        or (public.has_role('sales') and assigned_sales_rep_id = auth.uid())
    );

-- ─── properties ───────────────────────────────────────────────────────────
drop policy if exists properties_select on public.properties;
create policy properties_select on public.properties
    for select to authenticated
    using (public.can_see_lead(lead_id));

drop policy if exists properties_write on public.properties;
create policy properties_write on public.properties
    for all to authenticated
    using (public.has_role('admin', 'office', 'sales') and public.can_see_lead(lead_id))
    with check (public.has_role('admin', 'office', 'sales') and public.can_see_lead(lead_id));

-- ─── surveys ──────────────────────────────────────────────────────────────
drop policy if exists surveys_select on public.surveys;
create policy surveys_select on public.surveys
    for select to authenticated
    using (public.is_member());

drop policy if exists surveys_insert on public.surveys;
create policy surveys_insert on public.surveys
    for insert to authenticated
    with check (public.has_role('admin', 'office', 'sales'));

-- Schedulers can edit any survey; a surveyor only their own.
drop policy if exists surveys_update on public.surveys;
create policy surveys_update on public.surveys
    for update to authenticated
    using (
        public.has_role('admin', 'office', 'sales')
        or (public.has_role('surveyor') and assigned_surveyor_id = auth.uid())
    )
    with check (
        public.has_role('admin', 'office', 'sales')
        or (public.has_role('surveyor') and assigned_surveyor_id = auth.uid())
    );

drop policy if exists surveys_delete on public.surveys;
create policy surveys_delete on public.surveys
    for delete to authenticated
    using (public.has_role('admin'));

-- ─── quotes ───────────────────────────────────────────────────────────────
drop policy if exists quotes_select on public.quotes;
create policy quotes_select on public.quotes
    for select to authenticated
    using (public.is_member());

drop policy if exists quotes_insert on public.quotes;
create policy quotes_insert on public.quotes
    for insert to authenticated
    with check (public.has_role('admin', 'sales', 'office') and created_by = auth.uid());

drop policy if exists quotes_update on public.quotes;
create policy quotes_update on public.quotes
    for update to authenticated
    using (public.has_role('admin', 'sales', 'office'))
    with check (public.has_role('admin', 'sales', 'office'));

-- Only drafts may be deleted — the old deleteQuote mutation enforced this.
drop policy if exists quotes_delete on public.quotes;
create policy quotes_delete on public.quotes
    for delete to authenticated
    using (public.has_role('admin', 'sales') and status = 'draft');

-- ─── contracts ────────────────────────────────────────────────────────────
drop policy if exists contracts_select on public.contracts;
create policy contracts_select on public.contracts
    for select to authenticated
    using (public.is_member());

-- Split rather than FOR ALL: permissive policies are OR-ed, so a FOR ALL write
-- policy would hand sales and office the DELETE that is meant to be admin-only.
drop policy if exists contracts_write on public.contracts;
drop policy if exists contracts_insert on public.contracts;
create policy contracts_insert on public.contracts
    for insert to authenticated
    with check (public.has_role('admin', 'sales', 'office'));

drop policy if exists contracts_update on public.contracts;
create policy contracts_update on public.contracts
    for update to authenticated
    using (public.has_role('admin', 'sales', 'office'))
    with check (public.has_role('admin', 'sales', 'office'));

drop policy if exists contracts_delete on public.contracts;
create policy contracts_delete on public.contracts
    for delete to authenticated
    using (public.has_role('admin'));

-- ─── permits ──────────────────────────────────────────────────────────────
drop policy if exists permits_select on public.permits;
create policy permits_select on public.permits
    for select to authenticated
    using (public.is_member());

drop policy if exists permits_insert on public.permits;
create policy permits_insert on public.permits
    for insert to authenticated
    with check (public.has_role('admin', 'office', 'sales'));

drop policy if exists permits_update on public.permits;
create policy permits_update on public.permits
    for update to authenticated
    using (public.has_role('admin', 'office', 'sales'))
    with check (public.has_role('admin', 'office', 'sales'));

drop policy if exists permits_delete on public.permits;
create policy permits_delete on public.permits
    for delete to authenticated
    using (public.has_role('admin', 'office'));

-- ─── installations ────────────────────────────────────────────────────────
drop policy if exists installations_select on public.installations;
create policy installations_select on public.installations
    for select to authenticated
    using (public.is_member());

drop policy if exists installations_insert on public.installations;
create policy installations_insert on public.installations
    for insert to authenticated
    with check (public.has_role('admin', 'office', 'sales'));

drop policy if exists installations_update on public.installations;
create policy installations_update on public.installations
    for update to authenticated
    using (
        public.has_role('admin', 'office')
        or (public.has_role('installer') and auth.uid() = any(assigned_crew_ids))
    )
    with check (
        public.has_role('admin', 'office')
        or (public.has_role('installer') and auth.uid() = any(assigned_crew_ids))
    );

drop policy if exists installations_delete on public.installations;
create policy installations_delete on public.installations
    for delete to authenticated
    using (public.has_role('admin'));

-- ─── service_tickets ──────────────────────────────────────────────────────
drop policy if exists service_tickets_select on public.service_tickets;
create policy service_tickets_select on public.service_tickets
    for select to authenticated
    using (public.is_member());

drop policy if exists service_tickets_insert on public.service_tickets;
create policy service_tickets_insert on public.service_tickets
    for insert to authenticated
    with check (public.has_role('admin', 'sales', 'office', 'installer'));

drop policy if exists service_tickets_update on public.service_tickets;
create policy service_tickets_update on public.service_tickets
    for update to authenticated
    using (public.has_role('admin', 'sales', 'office', 'installer'))
    with check (public.has_role('admin', 'sales', 'office', 'installer'));

drop policy if exists service_tickets_delete on public.service_tickets;
create policy service_tickets_delete on public.service_tickets
    for delete to authenticated
    using (public.has_role('admin', 'office'));

-- ─── activity_log ─────────────────────────────────────────────────────────
-- The audit trail is append-only. Convex wrote these rows server-side; with no
-- server in the loop the client inserts them, so the WITH CHECK pins user_id to
-- the caller and there is deliberately no UPDATE or DELETE policy.
drop policy if exists activity_log_select on public.activity_log;
create policy activity_log_select on public.activity_log
    for select to authenticated
    using (public.can_see_lead(lead_id));

drop policy if exists activity_log_insert on public.activity_log;
create policy activity_log_insert on public.activity_log
    for insert to authenticated
    with check (public.is_member() and user_id = auth.uid());
