-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — initial schema
--
-- Port of the former Convex document schema to PostgreSQL.
--   · Convex document IDs        → uuid / gen_random_uuid()
--   · Convex v.union(v.literal)  → text + CHECK constraint
--   · Convex _creationTime       → created_at timestamptz
--   · Convex _storage IDs        → Supabase Storage object paths (text)
--
-- public.users.id is the SAME uuid as auth.users.id, so auth.uid() can be
-- compared directly against ownership columns in the RLS policies (0002).
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;
-- gin_trgm_ops backs the case-insensitive lead search index below.
create extension if not exists pg_trgm;

-- ─── Shared trigger: keep updated_at fresh ─────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- ─── Users ────────────────────────────────────────────────────────────────
create table if not exists public.users (
    id         uuid primary key references auth.users (id) on delete cascade,
    name       text,
    email      text,
    role       text not null default 'sales'
               check (role in ('admin', 'sales', 'surveyor', 'installer', 'office')),
    avatar_url text,
    is_active  boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists users_role_idx on public.users (role);

create trigger users_set_updated_at
    before update on public.users
    for each row execute function public.set_updated_at();

-- Mirror every new auth user into public.users.
-- The first account to sign up becomes the admin; everyone after is a sales rep
-- (this reproduces the old convex/users.ts `updateCurrentUser` behaviour).
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role text;
begin
    select case when exists (select 1 from public.users) then 'sales' else 'admin' end
      into v_role;

    insert into public.users as u (id, name, email, role, avatar_url, is_active)
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
        true
    )
    -- A profile can already exist if the same person signs up again through a
    -- second provider; never overwrite a name an admin has since corrected.
    on conflict (id) do update
        set email      = excluded.email,
            name       = coalesce(u.name, excluded.name),
            avatar_url = coalesce(u.avatar_url, excluded.avatar_url);

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();

-- Keep email/name in sync when the auth record changes (e.g. email confirmed).
create or replace function public.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.users
       set email = new.email,
           name  = coalesce(
               name,
               nullif(new.raw_user_meta_data ->> 'full_name', ''),
               nullif(new.raw_user_meta_data ->> 'name', '')
           )
     where id = new.id;
    return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
    after update on auth.users
    for each row execute function public.handle_auth_user_updated();

-- ─── Leads / Customers ────────────────────────────────────────────────────
create table if not exists public.leads (
    id                    uuid primary key default gen_random_uuid(),
    first_name            text not null,
    last_name             text not null,
    phone                 text not null,
    email                 text,
    source                text not null
                          check (source in ('referral', 'facebook_ad', 'website_form', 'walk_in', 'other')),
    referred_by           text,
    stage                 text not null default 'lead'
                          check (stage in (
                              'lead', 'survey_scheduled', 'survey_completed', 'proposal_sent',
                              'contract_signed', 'permitting', 'installation_scheduled',
                              'installation_complete', 'active_customer'
                          )),
    assigned_sales_rep_id uuid references public.users (id) on delete set null,
    last_activity_at      timestamptz not null default now(),
    converted_at          timestamptz,
    notes                 text,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

create index if not exists leads_stage_idx         on public.leads (stage);
create index if not exists leads_sales_rep_idx     on public.leads (assigned_sales_rep_id);
create index if not exists leads_last_activity_idx on public.leads (last_activity_at desc);

-- Backs the `searchLeads` ilike query across name / email / phone.
create index if not exists leads_search_idx on public.leads
    using gin ((
        coalesce(first_name, '') || ' ' ||
        coalesce(last_name, '')  || ' ' ||
        coalesce(email, '')      || ' ' ||
        coalesce(phone, '')
    ) gin_trgm_ops);

create trigger leads_set_updated_at
    before update on public.leads
    for each row execute function public.set_updated_at();

-- ─── Properties / Sites ───────────────────────────────────────────────────
create table if not exists public.properties (
    id            uuid primary key default gen_random_uuid(),
    lead_id       uuid not null references public.leads (id) on delete cascade,
    address       text not null,
    city          text not null,
    state         text not null,
    zip           text not null,
    property_type text not null default 'residential'
                  check (property_type in ('residential', 'commercial', 'agricultural')),
    notes         text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create index if not exists properties_lead_idx on public.properties (lead_id);

create trigger properties_set_updated_at
    before update on public.properties
    for each row execute function public.set_updated_at();

-- ─── Site Surveys ─────────────────────────────────────────────────────────
create table if not exists public.surveys (
    id                       uuid primary key default gen_random_uuid(),
    lead_id                  uuid not null references public.leads (id) on delete cascade,
    property_id              uuid not null references public.properties (id) on delete cascade,
    assigned_surveyor_id     uuid not null references public.users (id) on delete restrict,
    scheduled_at             timestamptz not null,
    completed_at             timestamptz,
    status                   text not null default 'scheduled'
                             check (status in ('scheduled', 'completed', 'cancelled')),
    roof_type                text check (roof_type in ('asphalt_shingle', 'metal', 'tile', 'flat', 'other')),
    shading_notes            text,
    estimated_system_size_kw double precision,
    roof_age_years           integer,
    additional_notes         text,
    -- Storage object paths in the `photos` bucket (was: array of Convex _storage IDs)
    photo_paths              text[] not null default '{}',
    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now()
);

create index if not exists surveys_lead_idx     on public.surveys (lead_id);
create index if not exists surveys_surveyor_idx on public.surveys (assigned_surveyor_id);
create index if not exists surveys_status_idx   on public.surveys (status);

create trigger surveys_set_updated_at
    before update on public.surveys
    for each row execute function public.set_updated_at();

-- ─── Quotes ───────────────────────────────────────────────────────────────
create table if not exists public.quotes (
    id               uuid primary key default gen_random_uuid(),
    lead_id          uuid not null references public.leads (id) on delete cascade,
    version          integer not null,
    status           text not null default 'draft'
                     check (status in ('draft', 'sent', 'accepted', 'rejected', 'superseded')),
    panel_count      integer not null,
    panel_model      text not null,
    inverter_type    text not null,
    system_size_kw   double precision not null,
    total_price_usd  numeric(12, 2) not null,
    financing_option text not null check (financing_option in ('cash', 'loan', 'lease', 'ppa')),
    valid_until      date,
    notes            text,
    created_by       uuid not null references public.users (id) on delete restrict,
    sent_at          timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    unique (lead_id, version)
);

create index if not exists quotes_lead_idx on public.quotes (lead_id);

create trigger quotes_set_updated_at
    before update on public.quotes
    for each row execute function public.set_updated_at();

-- Allocates the next version number for a lead. Runs SECURITY DEFINER so the
-- read of sibling quotes is not filtered by RLS (a sales rep must still see
-- v1 exists even if the row was created by someone else).
create or replace function public.next_quote_version(p_lead_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(max(version), 0) + 1 from public.quotes where lead_id = p_lead_id;
$$;

-- ─── Contracts ────────────────────────────────────────────────────────────
create table if not exists public.contracts (
    id            uuid primary key default gen_random_uuid(),
    lead_id       uuid not null unique references public.leads (id) on delete cascade,
    -- Cascade rather than restrict: deleting a lead cascades into its quotes,
    -- and a RESTRICT here would fire before the contract's own cascade ran.
    -- Deleting a quote out from under a live contract is prevented by policy
    -- instead — quotes_delete only permits drafts, and contracts are only ever
    -- created from an accepted quote.
    quote_id      uuid not null references public.quotes (id) on delete cascade,
    status        text not null default 'pending_signature'
                  check (status in ('pending_signature', 'signed', 'cancelled')),
    signed_at     timestamptz,
    -- Storage object path in the `documents` bucket
    document_path text,
    notes         text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create index if not exists contracts_lead_idx on public.contracts (lead_id);

create trigger contracts_set_updated_at
    before update on public.contracts
    for each row execute function public.set_updated_at();

-- ─── Permits ──────────────────────────────────────────────────────────────
create table if not exists public.permits (
    id             uuid primary key default gen_random_uuid(),
    lead_id        uuid not null references public.leads (id) on delete cascade,
    type           text not null check (type in (
                       'building_permit', 'electrical_permit', 'hoa_approval',
                       'utility_interconnection', 'other'
                   )),
    status         text not null default 'not_submitted'
                   check (status in ('not_submitted', 'submitted', 'approved', 'rejected')),
    submitted_at   timestamptz,
    approved_at    timestamptz,
    rejected_at    timestamptz,
    due_date       date,
    document_path  text,
    notes          text,
    assigned_to_id uuid references public.users (id) on delete set null,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create index if not exists permits_lead_idx   on public.permits (lead_id);
create index if not exists permits_status_idx on public.permits (status);

create trigger permits_set_updated_at
    before update on public.permits
    for each row execute function public.set_updated_at();

-- ─── Installation Projects ────────────────────────────────────────────────
create table if not exists public.installations (
    id                  uuid primary key default gen_random_uuid(),
    lead_id             uuid not null unique references public.leads (id) on delete cascade,
    status              text not null default 'scheduled'
                        check (status in ('scheduled', 'in_progress', 'completed', 'on_hold')),
    scheduled_date      date not null,
    completed_at        timestamptz,
    assigned_crew_ids   uuid[] not null default '{}',
    lead_installer_note text,
    -- [{ "item": "…", "checked": false }, …]
    materials_checklist jsonb not null default '[]'::jsonb,
    completion_photo_paths text[] not null default '{}',
    notes               text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists installations_lead_idx   on public.installations (lead_id);
create index if not exists installations_status_idx on public.installations (status);
create index if not exists installations_crew_idx   on public.installations using gin (assigned_crew_ids);

create trigger installations_set_updated_at
    before update on public.installations
    for each row execute function public.set_updated_at();

-- ─── Maintenance / Service Tickets ────────────────────────────────────────
create table if not exists public.service_tickets (
    id                 uuid primary key default gen_random_uuid(),
    lead_id            uuid not null references public.leads (id) on delete cascade,
    installation_id    uuid not null references public.installations (id) on delete cascade,
    title              text not null,
    description        text not null,
    status             text not null default 'open'
                       check (status in ('open', 'in_progress', 'resolved', 'closed')),
    priority           text not null default 'medium' check (priority in ('low', 'medium', 'high')),
    assigned_to_id     uuid references public.users (id) on delete set null,
    resolved_at        timestamptz,
    scheduled_visit_at timestamptz,
    warranty_related   boolean not null default false,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

create index if not exists service_tickets_lead_idx         on public.service_tickets (lead_id);
create index if not exists service_tickets_installation_idx on public.service_tickets (installation_id);
create index if not exists service_tickets_status_idx       on public.service_tickets (status);

create trigger service_tickets_set_updated_at
    before update on public.service_tickets
    for each row execute function public.set_updated_at();

-- ─── Activity Log / Audit Trail ───────────────────────────────────────────
create table if not exists public.activity_log (
    id          uuid primary key default gen_random_uuid(),
    lead_id     uuid not null references public.leads (id) on delete cascade,
    user_id     uuid not null references public.users (id) on delete cascade,
    action      text not null,
    details     text,
    entity_type text,
    entity_id   text,
    created_at  timestamptz not null default now()
);

create index if not exists activity_log_lead_idx on public.activity_log (lead_id, created_at desc);

-- ─── Stage-advance + activity helper ──────────────────────────────────────
-- Writing a lead stage change, its timestamp bump and the audit row in one
-- statement keeps them atomic; the old Convex mutations relied on Convex's
-- transactional mutations for this.
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
security invoker
set search_path = public
as $$
begin
    insert into public.activity_log (lead_id, user_id, action, details, entity_type, entity_id)
    values (p_lead_id, auth.uid(), p_action, p_details, p_entity_type, p_entity_id);

    if p_touch_lead then
        update public.leads set last_activity_at = now() where id = p_lead_id;
    end if;
end;
$$;
