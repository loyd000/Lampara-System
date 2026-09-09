-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — packages and package items (Phase 5)
--
-- A package is a saved solar system bundle — "6kWp Hybrid PV System" — with
-- the line items it expands into when added to a quote (Phase 6). Prices live
-- on the items so a quote can be rebuilt if a component price changes, with
-- `base_price_php` as the headline figure the quote shows.
--
-- Archive rather than delete: a package referenced by an old quote must not
-- vanish from the record. `is_active` controls whether it appears in the
-- quote builder's picker.
--
-- Apply after 0014. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. packages ──────────────────────────────────────────────────────────

create table if not exists public.packages (
    id              uuid primary key default gen_random_uuid(),
    name            text not null check (btrim(name) <> ''),
    description     text,
    system_size_kw  numeric(6,2),
    base_price_php  numeric(12,2) not null check (base_price_php >= 0),
    is_active       boolean not null default true,
    sort_order      integer not null default 0,
    created_by      uuid references public.users (id) on delete set null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists packages_sort_idx
    on public.packages (sort_order, name);

drop trigger if exists packages_set_updated_at on public.packages;
create trigger packages_set_updated_at
    before update on public.packages
    for each row execute function public.set_updated_at();

alter table public.packages enable row level security;

-- Everyone can read packages (needed for the quote builder in Phase 6).
drop policy if exists packages_select on public.packages;
create policy packages_select on public.packages
    for select to authenticated
    using (public.is_member());

-- Only superadmin can create packages.
drop policy if exists packages_insert on public.packages;
create policy packages_insert on public.packages
    for insert to authenticated
    with check (public.has_role('superadmin'));

-- Only superadmin can update packages (including archive via is_active).
drop policy if exists packages_update on public.packages;
create policy packages_update on public.packages
    for update to authenticated
    using (public.has_role('superadmin'))
    with check (public.has_role('superadmin'));

-- No delete policy — archive instead. If absolutely needed, a superadmin
-- can do it through the Supabase dashboard, but the app never offers it.

-- ─── 2. package_items ─────────────────────────────────────────────────────

create table if not exists public.package_items (
    id              uuid primary key default gen_random_uuid(),
    package_id      uuid not null references public.packages (id) on delete cascade,
    name            text,
    description     text,
    qty             numeric(10,2) not null default 1 check (qty > 0),
    unit            text not null default 'pc' check (btrim(unit) <> ''),
    unit_price_php  numeric(12,2) not null default 0 check (unit_price_php >= 0),
    sort_order      integer not null default 0,
    created_at      timestamptz not null default now()
);

create index if not exists package_items_package_idx
    on public.package_items (package_id, sort_order);

alter table public.package_items enable row level security;

-- Same visibility as the parent package.
drop policy if exists package_items_select on public.package_items;
create policy package_items_select on public.package_items
    for select to authenticated
    using (public.is_member());

drop policy if exists package_items_insert on public.package_items;
create policy package_items_insert on public.package_items
    for insert to authenticated
    with check (public.has_role('superadmin'));

drop policy if exists package_items_update on public.package_items;
create policy package_items_update on public.package_items
    for update to authenticated
    using (public.has_role('superadmin'))
    with check (public.has_role('superadmin'));

-- Items cascade-delete with their package, but the app also needs to replace
-- items when editing a package (delete all + re-insert).
drop policy if exists package_items_delete on public.package_items;
create policy package_items_delete on public.package_items
    for delete to authenticated
    using (public.has_role('superadmin'));

-- ─── 3. Realtime ──────────────────────────────────────────────────────────
do $$
declare
    t text;
begin
    foreach t in array array['packages', 'package_items']
    loop
        execute format('alter table public.%I replica identity full', t);

        if not exists (
            select 1 from pg_publication_tables
             where pubname = 'supabase_realtime'
               and schemaname = 'public'
               and tablename = t
        ) then
            execute format('alter publication supabase_realtime add table public.%I', t);
        end if;
    end loop;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- After applying, spot-check:
--
--   select policyname from pg_policies
--    where schemaname = 'public' and tablename in ('packages', 'package_items');
--     -- expect 3 for packages (select, insert, update)
--     -- expect 4 for package_items (select, insert, update, delete)
--
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime'
--      and tablename in ('packages', 'package_items');
--     -- expect both rows
-- ═══════════════════════════════════════════════════════════════════════════
