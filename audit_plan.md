# Lampara CRM — audit & implementation plan

A read-only scan of `src/**` (163 files, ~29.6k lines), `supabase/migrations/*`,
`public/sw.js` and `package.json`, looking for correctness bugs, security gaps,
performance problems and cleanup worth doing. **No code was changed.**

Two things worth saying up front:

1. **The codebase is in good shape.** No `any` casts, two `eslint-disable`s (both
   deliberate and documented), a real error boundary, route-level code splitting,
   money stored as `numeric(12,2)`, RLS on every table, and a realtime layer that
   coalesces and targets its invalidations. The findings below are mostly narrow.
2. **I could not run anything against the database.** Every finding marked
   *unverified* is reasoned from the schema and query code, not observed. Those
   need one query in the SQL editor before acting on them.

---

> **Status:** Phase A is done — findings 2, 3, 4 and 11 are fixed and verified
> (`tsc`, `eslint`, 30 tests, `vite build`, impeccable detector all clean).
> Everything else below is still outstanding.

## P0 — correctness and access

### 1. The lead-search index has never been used ⭐ biggest single win

`0001_initial_schema.sql:145` builds a GIN trigram index over a **concatenated
expression**:

```sql
create index leads_search_idx on public.leads
    using gin ((coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' ||
                coalesce(email,'') || ' ' || coalesce(phone,'')) gin_trgm_ops);
```

But `searchLeads` (`queries/leads.ts`) asks four separate per-column questions:

```ts
.or(`first_name.ilike.${p},last_name.ilike.${p},email.ilike.${p},phone.ilike.${p}`)
```

Postgres can only use an expression index when the predicate *matches the indexed
expression*. Four per-column `ILIKE`s cannot use an index built on their
concatenation, so **every lead search is a sequential scan** and has been since
the first migration.

It also causes a user-visible bug: searching a full name across the boundary
("Juan Dela" where `first_name = 'Juan'`, `last_name = 'Dela Cruz'`) matches
nothing, because no single column contains both words.

**Fix:** add a generated column and index it, then search that one column —
which fixes the index *and* full-name search in the same change:

```sql
alter table public.leads add column if not exists search_text text
    generated always as (
        coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' ||
        coalesce(email,'') || ' ' || coalesce(phone,'')
    ) stored;
create index if not exists leads_search_text_idx
    on public.leads using gin (search_text gin_trgm_ops);
drop index if exists leads_search_idx;
```

then `.ilike("search_text", pattern)` replaces the four-way `.or()`.

*Effort: ~1h including the migration.*

### 2. `/reports` has no role guard — a field tech can read company financials ✅ fixed

`pages/reports/page.tsx` has no guard. `AppSidebar` hides the link from `field`
users (`roles: ["superadmin","admin"]`), but typing `/reports` renders the page,
and the data follows:

- the four report RPCs are `security invoker` (`0007_report_functions.sql`), so
  they return whatever RLS allows the caller to see, and
- `leads_select` (`0013_roles_and_approval.sql:303`) allows `field` to select
  **every lead**.

Net effect: a field technician can see pipeline value, closed value, average deal
size and the full stale-lead list. Every other role-restricted page guards itself
(`packages/page.tsx:61` redirects non-superadmins) — Reports is the one that
doesn't.

**Fix:** mirror the Packages guard. Decide separately whether the *data* should
also be restricted server-side; the UI guard closes the immediate hole, but a
determined `field` user with the anon key could still call the RPC directly.

**Fixed as:** a route-level `<RequireRole>` (`components/require-role.tsx`)
wrapping `/reports` and `/packages` in `App.tsx`, rather than a guard inside each
page — a guard placed inside a page still fires that page's queries before it
redirects, which for `/reports` means calling the revenue RPCs on behalf of
someone who may not read them. Packages' own in-page guard was removed as
redundant. **The server-side question is still open** — see "Needs your
decision".

### 3. Design Type goes stale on the Leads list after a quote is approved ✅ fixed

Regression from the Design Type column I added this session. `realtime.ts`'s
`keysFor()` invalidates `["leads","enriched"]` for `leads` and `properties`
changes, but the `quotes` and `quote_items` cases return only
`quotesForLead` / `quoteWithItems` / `reports`.

Since the Leads list now derives Design Type from the approved quote's line
items, approving a quote changes what that list should show — and it won't
update until the 5-minute `staleTime` lapses or the page is reloaded.

**Fix:** add `["leads","enriched"]` (and `["leads","search"]`) to the `quotes`
and `quote_items` cases. Add `["leads","search"]` to `properties` too, since
search results now carry property data and match on location.

**Fixed as:** `["leads","enriched"]` and `["leads","search"]` added to the
`quotes` and `quote_items` cases, and `["leads","search"]` to `properties`.
Covered by `realtime.test.ts` — a new test file for `keysFor`, verified to fail
when the fix is reverted.

### 4. Cancelling from the Pipeline board records no reason ✅ fixed

`leads/[id]/page.tsx` intercepts a move to `cancelled` and prompts for a reason
before writing (`handleStageChange`). `pipeline/page.tsx`'s `moveLead` calls
`updateStage` directly — so the same business event silently loses its reason
depending on which screen it was done from. The `cancelled_reason` column ends
up populated or null based on UI path, not intent.

**Fixed as:** the prompt is now `components/cancel-lead-dialog.tsx`, used by both
screens. On the Pipeline board every move funnels through one `moveLead`, so
**drag-and-drop onto the Cancelled column now asks too** — that path was bypassing
the prompt as well, not just the stage picker.

---

## P1 — performance and data

### 5. The Leads list over-fetches every quote of every lead

`ENRICHED_LEAD_SELECT` embeds `quotes(status, quote_items(packages(design_type)))`
unfiltered, then throws away everything but the *approved* quote client-side. A
lead with 5 quote versions × 20 line items is 100 embedded rows fetched to render
one "Hybrid" label — multiplied by up to 500 leads.

**Fix:** filter the embed server-side to the approved quote only. A non-`!inner`
embedded filter narrows the embedded rows without dropping parent leads:

```ts
.eq("quotes.status", "approved")   // or .or("status.eq.approved", { referencedTable: "quotes" })
```

*Unverified* — I could not test the embedded-filter semantics against the live
database. Confirm the row count drops and that leads without an approved quote
still appear before shipping.

*Effort: ~45min including verification.*

### 6. Two searches have no supporting index

- **Location search** (`properties.city` / `properties.state`, added this
  session) — no trigram index on either column; the `!inner` join scans.
- **Ticket search** (`service_tickets.title` / `description`) — no index.
  `feature_plan.md` Phase 5 explicitly called for
  `service_tickets_search_idx ... gin_trgm_ops`; it was never added.

Both are seq scans today. Harmless at current data volume, quietly not at 10k
rows.

**Fix:** one migration adding trigram indexes for both, ideally alongside the
finding-1 migration.

*Effort: ~30min, same migration as #1.*

### 7. Client-side filters silently cap at 500 records

Stage (main status), Property Type and Design Type all filter the *fetched page*
rather than the database. `LEAD_LIST_LIMIT` is 500, so past that the filters
describe a truncated set while appearing authoritative. The truncation banner is
suppressed whenever a filter is active, so nothing tells the user.

Fine at current scale, wrong later, and the failure is silent — the worst kind.

**Fix (pick one):**
- *Cheap:* keep client-side filtering, but keep the "Showing N of M" banner
  visible when filters are active so the ceiling is never hidden.
- *Proper:* push all three to the server — stage-group via `.in("stage", …)`,
  property type via a `properties!inner` filter, design type via the nested
  approved-quote join from #5.

*Effort: 20min cheap / ~3h proper.*

### 8. Money is rounded on write but not on display

`queries/quotes.ts:177` rounds correctly (`Math.round(qty * unitPrice * 100)/100`)
before writing to `numeric(12,2)`. `QuoteBuilder.tsx:168` accumulates the on-screen
subtotal with raw float arithmetic and no rounding. The two can disagree by
fractions of a centavo, and the displayed subtotal is the one a customer reads.

**Fix:** round in the same place, the same way — ideally one shared
`lineTotal()` / `subtotal()` helper used by the builder, the PDF and the write
path.

*Effort: ~45min.*

---

## P2 — cleanup and hygiene

| # | Finding | Evidence | Effort |
|---|---|---|---|
| 9 | **27 of 57 shadcn components are unused** — accordion, carousel, chart, drawer, menubar, sidebar, table, resizable, input-otp, slider… | scan of `src/components/ui/*` | 1h |
| 10 | **Dependencies only those dead components use**: `recharts`, `embla-carousel-react`, `vaul`, `react-resizable-panels`, `input-otp`. Bundle impact is probably small (tree-shaking already drops them) — the real win is install time and supply-chain surface, not KB | `package.json` | 30min |
| 11 | ~~**`supabase/.temp/` is untracked and not ignored**~~ ✅ fixed — added to `.gitignore` | `git status`, `.gitignore` | done |
| 12 | **Service worker handles `push` / `notificationclick`, but nothing ever subscribes** — no `pushManager` call anywhere in `src` | `public/sw.js:94`, `:110` | 30min to remove, or wire it up |
| 13 | **`quotes.total_price_usd numeric(12,2)`** still in the schema next to `total_php` — a dead USD column from before the PHP switch | `0001_initial_schema.sql:219` | 15min |
| 14 | **Every table is hand-rolled `<table>` markup** while `ui/table.tsx` sits unused — 4 pages each re-declaring the same header cell classes | leads / reports / packages / dashboards | 2h |
| 15 | **No component or integration tests** — 23 tests, all pure functions. Nothing covers global search, the stage control, the filters, or any query builder | `src/**/*.test.ts` | ongoing |

---

## Open bug I could not diagnose

**Location search reportedly matches uppercase but not lowercase.**

This shouldn't be possible: `ILIKE` is case-insensitive by definition, and the
same `%pattern%` syntax already works for the name/phone/email branch. I ran out
of ways to test it from here without database access.

**Diagnostic before fixing** — run both directly in the SQL editor and compare:

```sql
select id, city, state from public.properties where city ilike '%malabon%';
select id, city, state from public.properties where city ilike '%MALABON%';
```

- Same rows → the SQL is fine and the bug is in the request layer. Next suspect:
  PostgREST's raw `or=()` filter string, where `*` is the documented wildcard;
  try `city.ilike.*term*` instead of `%term%`.
- Different rows → something is genuinely off with collation or the data, and
  the hypothesis changes entirely.

Finding #1's `search_text` rework may make this moot for leads, but the property
branch would still need it.

---

## Suggested sequencing

Grouped so related work shares a migration and one verification pass.

**Phase A — safety and correctness. ✅ done.** Findings 2, 3, 4, 11.
No migration, no schema risk. Closed the access gap, the stale-data regression
and the cancel-reason inconsistency (including the drag-and-drop path, which
turned out to bypass the prompt too). Added `realtime.test.ts`; suite is 23 → 30
tests.

**Phase B — search and indexes, one migration (~2.5h).** Findings 1, 6, and the
open bug's diagnostic. `0026_search_indexes.sql` adds the generated `search_text`
column plus trigram indexes for it, `properties.city/state` and
`service_tickets`; `searchLeads` switches to the single-column predicate. Ship
the diagnostic query first so the lowercase bug is understood before the rewrite
lands on top of it.

**Phase C — data volume honesty (~1.5h, or 4h for the proper fix).**
Findings 5 and 7. Cut the leads-list over-fetch, then decide cheap-banner vs
server-side filtering.

**Phase D — money consistency (~45min).** Finding 8. Small, isolated, worth doing
before anyone quotes a real customer.

**Phase E — cleanup (~4h, whenever).** Findings 9, 10, 12, 13, 14. Pure
maintenance; no user-visible change. Good filler work.

Phases A–D are ~7h of focused work and cover everything that can bite a real
user. Phase E is optional.

---

## Needs your decision

1. **Should a field technician be able to see company financials at all?**
   Finding 2's UI guard assumes no. If that's right, the *server* should enforce
   it too — which means either restricting the report RPCs by role, or narrowing
   `leads_select` so `field` only sees leads they're assigned to. The second is a
   meaningful behaviour change (it would also narrow their Leads list and
   Pipeline), so I'd want you to confirm before touching RLS.

2. **Client-side or server-side filtering** for finding 7 — 20 minutes of honesty
   vs 3 hours of correctness. Depends how many leads you expect this year.

3. **Push notifications** (finding 12) — wire up the half-built support, or
   delete it? Email already covers the same events.
