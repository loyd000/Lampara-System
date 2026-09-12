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

> **Status:** all phases complete. Every finding is fixed except 14 (declined
> on purpose) and 15 (a standing gap, not a task). Migrations `0026`–`0029` are
> **applied**. Test suite 23 → 37; UI components 57 → 28; dependencies 30 → 24.
>
> Findings **16–19 were not in the original scan.** Each surfaced only by
> querying the live database, and between them they include the worst problems
> found: a revenue report stuck at ₱0, two type unions asserting values the
> schema forbids, inspections that could never be completed, and a quote-revision
> function that raises on every call.
>
> **The most useful thing in this document is that last sentence.** The
> original scan read 29.6k lines and found real problems, but the three worst
> — a revenue report stuck at ₱0, two type unions asserting values the database
> forbids, and inspections that could never be completed — were all invisible
> to it, because the code was *internally consistent* and only disagreed with
> the database. They surfaced within minutes of getting live query access
> (`supabase db query --linked`).
>
> Schema drift is the dominant bug class in this codebase, and reading cannot
> catch it. Anything below still marked outstanding should be checked against
> the live database, not just the source.

## P0 — correctness and access

### 1. The lead-search index has never been used ⭐ biggest single win ✅ fixed

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

**Fixed as:** `0026_search_indexes.sql` — the generated column above plus its
trigram index, and the dead `leads_search_idx` dropped. `searchLeads` now
filters the single `search_text` column. Verified on live data: the column
populates (`"asd asd as@gmail.com 09123456789"`) and multi-word terms that span
the old column boundaries now match.

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

### 16. The Reports page reported ₱0 revenue, always ⭐ found only by querying live data ✅ fixed

Not in the original scan — reading the code could not have caught it, and it is
the most consequential thing in this document.

`report_revenue_summary` was written in `0007` against the original schema and
never revisited. Two independent drifts:

- **Wrong column.** It summed `total_price_usd`. Quotes have been priced in PHP
  since `0016` (`total_php`); the USD column is dead and holds `0` in every row.
- **Wrong statuses.** It filtered `status in ('accepted','sent')` and
  `status = 'accepted'`. The vocabulary is now `('in_progress','approved')` —
  the CHECK constraint does not even permit the old values, so those filters
  could never match a row.

Observed on live data before the fix: one quote at `total_php = 215,000.00`,
`total_price_usd = 0`, and the function returning a pipeline value of `0`.
Pipeline Value, Closed Value, Avg Deal Size, Accepted Quotes and Financing Mix
were **all** reading zero or empty regardless of the real business.

**Fixed as:** `0027`, alongside the role guard. The old statuses map onto the
new ones directly — `accepted` → `approved` (won), `sent` → `in_progress` (out
with the customer) — so this restores `0007`'s intent rather than inventing a
rule. Verified after applying: pipeline ₱215,000, closed ₱215,000, avg deal
₱215,000, 1 accepted quote.

**Worth drawing the lesson:** a static scan reads what the code *says*. This
disagreed with what the database *contains*, and only a query could tell. The
other report functions were checked against the live schema at the same time
and are fine.

### 17. Two type unions declared values the database forbids ✅ fixed

The root cause of finding 16, and the reason it survived review: `QuoteStatus`
listed `draft`, `sent`, `accepted`, `rejected`, `superseded` when the CHECK
constraint permits only `in_progress` and `approved`. Someone wrote a filter
against `'accepted'`, TypeScript agreed it was a valid status, and the query
matched nothing forever.

`SurveyStatus` had the same rot — `submitted` and `approved` against a
constraint permitting only `scheduled`/`cancelled`.

**Fixed as:** both unions narrowed to what the database actually allows. Worth
noting what happened next: `tsc` immediately failed on
`FieldDashboard.tsx:115`, `done: s.status === "approved"` — *"This comparison
appears to be unintentional because the types have no overlap."* The honest
type found finding 18 by itself, at compile time, in one run.

### 18. A field technician's inspection could never be completed ✅ fixed

`0012` collapsed the submit/approve handoff ("printing is the completion step")
and narrowed `surveys.status` to `('scheduled','cancelled')` — but left nothing
that marks an inspection *finished*. Nothing has written `completed_at` since.

The field dashboard never caught up, still computing `done: status ===
'approved'`. For a technician that means an inspection can never leave the open
list: once its date passes it sits in **Overdue permanently**, "Done (30d)"
never counts one, and "Recently Completed" stays empty — on the field role's
main daily screen.

Latent only because `surveys` is empty today. It would have started
accumulating with the first real inspection.

**Fixed as:** `0028` adds `complete_survey_report` / `reopen_survey_report`,
both gated on `can_edit_survey`, so the assigned technician records their own
visit without waiting on the office. Completion is `completed_at`, not a
resurrected status. The inspection view gets a "Mark complete" button (and
"Reopen" to undo a mistap), the list row shows "Completed", and the dashboard
now reads `done: completedAt != null`.

Also cleaned up: the orphaned `reopen_survey_report` from `0009`, whose body
required `status in ('submitted','approved')` and therefore raised on every
call. Nothing referenced it.

---

## P1 — performance and data

### 5. The Leads list over-fetches every quote of every lead ✅ fixed

`ENRICHED_LEAD_SELECT` embeds `quotes(status, quote_items(packages(design_type)))`
unfiltered, then throws away everything but the *approved* quote client-side. A
lead with 5 quote versions × 20 line items is 100 embedded rows fetched to render
one "Hybrid" label — multiplied by up to 500 leads.

**Fixed as:** the quotes embed is gone entirely. Design types now come from a
separate `fetchApprovedDesignTypes()` query — `quotes?status=eq.approved` with
its line items — run **in parallel** with the leads query and merged by
`lead_id`.

The obvious fix was a filtered embed (`.eq("quotes.status","approved")`), and
it would probably have worked. It was rejected on risk: filtering an embed
narrows the embedded rows, while `!inner` additionally restricts which
*parents* return, and getting that distinction wrong would silently hide every
lead without an approved quote from the main list. RLS meant that could not be
empirically confirmed as an anonymous caller, and "probably correct" is the
wrong standard for the primary list view. The parallel query cannot drop a
lead because it never touches the lead query.

Same round-trip latency (parallel, not sequential), and the volume win scales
with quote versions — on current data, one approved quote of 4 line items, it
fetches identically. Verified the design types resolve correctly against live
data (`["hybrid"]`, 4 items).

### 6. Two searches have no supporting index ✅ fixed

- **Location search** (`properties.city` / `properties.state`, added this
  session) — no trigram index on either column; the `!inner` join scans.
- **Ticket search** (`service_tickets.title` / `description`) — no index.
  `feature_plan.md` Phase 5 explicitly called for
  `service_tickets_search_idx ... gin_trgm_ops`; it was never added.

Both are seq scans today. Harmless at current data volume, quietly not at 10k
rows.

**Fixed as:** same migration, same shape — `properties.search_text` (address,
city, state, zip) and `service_tickets.search_text` (title, description), each
trigram indexed, each queried as a single `.ilike()`.

### 7. Client-side filters silently cap at 500 records ✅ fixed (cheap option)

Stage (main status), Property Type and Design Type all filter the *fetched page*
rather than the database. `LEAD_LIST_LIMIT` is 500, so past that the filters
describe a truncated set while appearing authoritative. The truncation banner is
suppressed whenever a filter is active, so nothing tells the user.

Fine at current scale, wrong later, and the failure is silent — the worst kind.

**Fixed as (your call — cheap):** the count line no longer hides the cap when
filters are active. With filters on and the page truncated it now reads
*"12 records — filtered from the first 500 of 1,234"*, so the ceiling is always
on screen. Filtering is still client-side.

**Still open:** pushing all three filters to the server (stage-group via
`.in("stage", …)`, property type via a `properties` join, design type via the
approved-quote join from #5) — worth revisiting if lead count approaches 500.

### 8. Money is rounded on write but not on display ✅ fixed

`queries/quotes.ts:177` rounds correctly (`Math.round(qty * unitPrice * 100)/100`)
before writing to `numeric(12,2)`. `QuoteBuilder.tsx:168` accumulates the on-screen
subtotal with raw float arithmetic and no rounding. The two can disagree by
fractions of a centavo, and the displayed subtotal is the one a customer reads.

**Fixed as:** `src/lib/money.ts` — `lineTotalPhp()` and `sumLineTotalsPhp()`,
used by both the write path and the builder's live subtotal. Order matters and
is now explicit: each line is rounded *before* summing, because the stored
`line_total_php` values are the rounded ones — so the on-screen subtotal equals
the sum of the numbers printed above it. Covered by 7 tests.

The PDF turned out to be fine already: it sums the *stored* `lineTotalPhp`
values rather than recomputing, so it always agreed with the database. Only the
builder's live preview diverged. All three paths now agree.

**Also consolidated while in there:** `formatPhp` existed in six copies. Four
were byte-identical UI duplicates and are now one import. The remaining two are
kept deliberately and documented as such — the PDF spells out "PHP" because the
₱ glyph isn't guaranteed in its embedded font, and the contract DOCX prints a
bare number because the template supplies the currency word. Those are
requirements, not drift.

---

## P2 — cleanup and hygiene

| # | Finding | Evidence | Effort |
|---|---|---|---|
| 9 | ~~**27 of 57 shadcn components are unused**~~ ✅ fixed — **28** removed. Resolved transitively: deleting `sidebar` orphaned `sheet`, so the sweep repeated until stable. 57 → 28 components | `src/components/ui/*` | done |
| 10 | ~~**Dependencies only those dead components use**~~ ✅ fixed — `recharts`, `embla-carousel-react`, `vaul`, `react-resizable-panels`, `input-otp`, `react-day-picker` removed (44 packages, deps 30 → 24). **Bundle unchanged at ~993 kB, exactly as predicted** — tree-shaking already excluded them. The win is install time and supply-chain surface, not KB | `package.json` | done |
| 11 | ~~**`supabase/.temp/` is untracked and not ignored**~~ ✅ fixed — added to `.gitignore` | `git status`, `.gitignore` | done |
| 12 | ~~**Service worker handles `push` / `notificationclick`, but nothing ever subscribes**~~ ✅ fixed — handlers deleted, with a comment recording what wiring push up would actually require | `public/sw.js` | done |
| 13 | ~~**`quotes.total_price_usd`** dead USD column~~ ✅ fixed in `0029` — and it was nothing like the 15 minutes estimated here; see finding 19 | `0029_drop_orphans.sql` | done |
| 14 | ~~Hand-rolled tables vs unused `ui/table.tsx`~~ — **deliberately not done.** ~2h of churn across four pages just restyled in the Apple pass, no user-visible benefit, real regression risk, and shadcn's Table doesn't provide the per-breakpoint column hiding these rely on. `ui/table.tsx` was deleted instead (finding 9) | — | won't do |
| 15 | **No component or integration tests** — now 37, still all pure functions. Nothing covers global search, the stage control, the filters, or any query builder | `src/**/*.test.ts` | ongoing |

---

## Location search — resolved ✅

**Confirmed working after the Phase B rewrite.** The investigation below is kept
because its conclusion held: every layer was already case-insensitive, so the
original report was environmental rather than a defect in the query. Worth
remembering the next time something "obviously" looks like a data bug.

**Location search reportedly matched uppercase but not lowercase.**

Phase B had live database access, so this got tested properly rather than
guessed at. **Every layer checks out, and none of them is case-sensitive.**

Against the real row (`state = 'AGUSAN DEL NORTE'`):

| Query | Result |
|---|---|
| `state ilike '%agusan%'` (lowercase) | **1** |
| `state ilike '%AGUSAN%'` (uppercase) | **1** |
| `state like '%agusan%'` (plain LIKE) | 0 |

`ILIKE` matches regardless of case; only plain `LIKE` is case-sensitive, which
confirms both that the data is uppercase and that the operator in use is the
right one. Then, at the PostgREST layer, all three filter forms — the new
`or=(search_text.ilike…,id.in…)`, the new `search_text=ilike…`, and even the
*old* embedded `properties.or=(city.ilike…,state.ilike…)` — returned HTTP 200,
so none was malformed. And in SQL, the old embedded query's join semantics and
the new two-step approach return the same single row.

**So the reported case-sensitivity could not be reproduced at any layer.** The
most likely explanation is environmental — a stale bundle in the browser when it
was tested, since this was minutes after the location feature first shipped.

**What this means:** the Phase B rewrite is still worth having (the index is now
actually usable, and multi-word terms spanning fields work), but it should not be
described as *the fix* for the reported bug, because there was no reproducible
bug to fix. **Please re-test location search on a hard refresh.** If lowercase
still fails, the next place to look is the client — React Query's cache key is
the raw term, so `"agusan"` and `"AGUSAN"` are separate cache entries — and I'd
want the browser's Network tab for the actual request that comes back empty.

---

## Suggested sequencing

Grouped so related work shares a migration and one verification pass.

**Phase A — safety and correctness. ✅ done.** Findings 2, 3, 4, 11.
No migration, no schema risk. Closed the access gap, the stale-data regression
and the cancel-reason inconsistency (including the drag-and-drop path, which
turned out to bypass the prompt too). Added `realtime.test.ts`; suite is 23 → 30
tests.

**Phase B — search and indexes. ✅ done.** Findings 1 and 6, plus the open bug's
diagnostic. `0026_search_indexes.sql` adds a `search_text` generated column and
trigram index to `leads`, `properties` and `service_tickets`, and drops the dead
`leads_search_idx`; all three searches became a single indexed `.ilike()`.
Location search no longer goes through an embedded `referencedTable` filter.
The lowercase bug turned out not to be reproducible — see above.

One trade-off taken knowingly: `select("*")` now also returns `search_text`,
which duplicates name/email/phone on every leads-list row. PostgREST has no
"all except" syntax, so the alternatives were enumerating every column by hand
(brittle) or accepting a few tens of KB on a 500-row page. Took the bloat.

**Phase C — data volume honesty. ✅ done.** Findings 5 and 7.

**Phase D — money consistency. ✅ done.** Finding 8, plus consolidating
`formatPhp` from six copies to three (two of which are deliberate).

**Phase E — cleanup. ✅ done**, except finding 14, declined on its merits.
Billed as pure maintenance with no user-visible change, and mostly was — 28
components and 44 packages removed, bundle unchanged at ~993 kB exactly as
predicted. But the "15-minute" dead-column drop turned up finding 19, a
quote-revision function that raises on every call. Cleanup kept earning its
keep right to the end.

**All phases complete.** The estimate for this work was ~7 hours across A–D
plus ~4 optional. What it actually produced was four findings the plan never
contained, three of them more serious than anything in it.

---

## Decisions taken

1. **Field techs and financials** → *restrict the report RPCs by role.* All four
   `report_*` functions now refuse anyone who isn't superadmin/admin
   (`0027`). Targeted: field technicians keep full Leads/Pipeline visibility,
   they just can't pull the reports. `leads_select` was deliberately left
   alone — narrowing it would have shrunk their day-to-day views too.

2. **Filter cap** → *cheap option.* Ceiling stays visible; filtering stays
   client-side. Revisit if lead count nears 500.

3. **Push notifications** → *deleted.* Email covers the same six events.

## 19. A broken `revise_quote` was sitting in the database ⭐ found while dropping a "dead" column ✅ fixed

Finding 13 was estimated at 15 minutes: drop one unused column. Checking what
referenced it first turned up six functions, and one of them mattered.

`revise_quote(uuid)` reads as the canonical way to revise a quote — and it
cannot work. It sets `status = 'superseded'` and inserts `'draft'`, neither of
which the CHECK constraint has permitted since the vocabulary narrowed to
`('in_progress','approved')`. Every call raises a constraint violation; it also
never sets `quotation_no` or `total_php`. The client is unaffected because it
hand-rolls its own `reviseQuote` and never calls this — but anyone who found
this function and used it, reasonably assuming it was the supported path, would
have hit a wall.

`create_quote` was likewise uncalled, and `reporting_sales_metrics` summed
`total_price_usd`, carrying the identical bug `0027` fixed in
`report_revenue_summary` — a second wrong-revenue report, just one nobody ran.
`approve_survey_report`, `guard_survey_write` and `guard_survey_photo_write`
are leftovers of the workflow `0012` removed.

**Fixed as:** `0029` drops all six, then the five dead columns. No `CASCADE`
anywhere — if something still depended on one, the migration should fail loudly
rather than quietly take the dependency with it. It applied clean, which is
itself the confirmation.

Deliberately kept, because checking showed they are still live:
`survey_arrays_valid` (trigger-attached), `can_write_survey_object` (three
storage policies), `quotes.prepared_by_id`, `users.approved_at`,
`permits.approved_at`. The last three share column names with dropped ones on
*different tables* — a good reason to check rather than pattern-match.

**The lesson repeats:** the estimate assumed the column was isolated because the
*code* didn't reference it. The database disagreed.

---

## Drift sweep — every status vocabulary, code vs database

Run once the pattern became clear. Compares each CHECK constraint against the
type union the client declares.

| Table | Verdict |
|---|---|
| `leads.stage` | ✅ all 10 values match |
| `permits.status` | ✅ matches |
| `installations.status` | ✅ matches |
| `service_tickets.status` | ✅ matches |
| `quotes.status` | ❌ 5 impossible values — finding 17, fixed |
| `surveys.status` | ❌ 2 impossible values — finding 17/18, fixed |

Columns still on the table but no longer read by anything:
`quotes.total_price_usd`, and `surveys.prepared_by_id` / `prepared_at` /
`approved_by_id` / `approved_at` (orphans of the `0012` workflow removal).
Harmless, but each one is a future trap of exactly the kind that produced
finding 16. Worth a `0029` that drops them.

## Still open

- **Finding 5** — the Leads list fetches every quote and line item of every lead
  to render one Design Type label. Needs an embedded filter to the approved
  quote only, and verification that non-`!inner` embedded filters don't drop
  parent rows. *(~45min — and this one can now be verified against the live
  database rather than reasoned about.)*
- **Finding 8** — quote money rounded on write, not on display. *(~45min)*
- **P2 list** — findings 9, 10, 13, 14, 15. Pure maintenance.
- **`quotes.total_price_usd`** (finding 13) is now not just dead but *proven*
  dead — nothing reads it since `0027`. Safe to drop whenever.
