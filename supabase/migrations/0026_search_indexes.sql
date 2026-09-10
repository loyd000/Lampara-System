-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — make search use an index, and make it search more
--
-- `0001` built a GIN trigram index over a *concatenated expression*:
--
--     create index leads_search_idx on public.leads using gin ((
--         coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' ||
--         coalesce(email,'')      || ' ' || coalesce(phone,'')
--     ) gin_trgm_ops);
--
-- but `searchLeads` asked four separate per-column questions:
--
--     first_name.ilike.%q%, last_name.ilike.%q%, email.ilike.%q%, phone.ilike.%q%
--
-- Postgres only uses an expression index when the predicate *matches the
-- indexed expression*, so that index has never once been used and every lead
-- search has been a sequential scan since the first migration.
--
-- Two ways to fix it: change the query to match the index, or make the
-- expression addressable as a column. This does the second, because PostgREST
-- can only filter on columns — there is no way to phrase "the concatenation of
-- these four" over the REST API. A stored generated column is that expression,
-- given a name.
--
-- It also fixes a user-visible bug for free: searching "Juan Dela" matched
-- nothing when first_name='Juan' and last_name='Dela Cruz', because no single
-- column contained both words. One concatenated column does.
--
-- The same treatment for `properties` (so location search is indexed, and can
-- be asked as one predicate instead of an embedded multi-column filter) and
-- `service_tickets` (which `feature_plan.md` Phase 5 asked for and never got).
--
-- Apply after 0025. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── leads ────────────────────────────────────────────────────────────────
-- Immutable expression, so it can be `stored`: concatenation and coalesce
-- both qualify.

alter table public.leads
    add column if not exists search_text text
    generated always as (
        coalesce(first_name, '') || ' ' ||
        coalesce(last_name, '')  || ' ' ||
        coalesce(email, '')      || ' ' ||
        coalesce(phone, '')
    ) stored;

create index if not exists leads_search_text_idx
    on public.leads using gin (search_text gin_trgm_ops);

-- Superseded: nothing can use it, and it costs writes to maintain.
drop index if exists public.leads_search_idx;

-- ─── properties ───────────────────────────────────────────────────────────
-- `address`, `city`, `state` and `zip` are the composed, always-populated
-- legacy fields (see 0024) — `city` already carries "barangay,
-- city_municipality" and `state` carries the province, so the granular columns
-- would only repeat what is here.

alter table public.properties
    add column if not exists search_text text
    generated always as (
        coalesce(address, '') || ' ' ||
        coalesce(city, '')    || ' ' ||
        coalesce(state, '')   || ' ' ||
        coalesce(zip, '')
    ) stored;

create index if not exists properties_search_text_idx
    on public.properties using gin (search_text gin_trgm_ops);

-- ─── service_tickets ──────────────────────────────────────────────────────

alter table public.service_tickets
    add column if not exists search_text text
    generated always as (
        coalesce(title, '') || ' ' || coalesce(description, '')
    ) stored;

create index if not exists service_tickets_search_text_idx
    on public.service_tickets using gin (search_text gin_trgm_ops);
