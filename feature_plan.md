# Lampara CRM — feature roadmap plan

Implementation plan for the next batch of work: the field-role merge, the lead
detail rework, and the seven feature tracks (UX polish, calendar, map, PDF, CSV,
email, AI).

Grounded in a read of `src/**`, `supabase/migrations/*`, `package.json` and
`vercel.json` as of commit `4382bdf`.

---

## Decisions locked before planning

| Question | Decision | Consequence |
| --- | --- | --- |
| Surveyor/Installer merge | **Merge the roles into one** | DB `CHECK` change + backfill + RLS/RPC/storage-policy updates + one merged dashboard |
| "Survey" → "Site Ocular Inspection" | **UI labels only** | No migration. Table stays `surveys`, column stays `assigned_surveyor_id`, hooks keep their names |
| Map stack | **Google Maps** | Browser key (referrer-restricted) for Maps JS + client-side `google.maps.Geocoder`; new `lat`/`lng` columns |
| Email + AI backend | **Supabase Edge Functions** | New `supabase/functions/` tree, secrets held server-side, a deploy step this repo does not have yet |

Two things worth naming now because they shape everything below:

1. **The MCP Supabase connector cannot see the org that holds this project.**
   Every migration ships as a numbered file in `supabase/migrations/` and is
   applied by hand or by `supabase db push`. Same for edge functions.
2. **Migrations continue at `0008`.** `0001`–`0007` are already applied.

---

## Sequencing

The order is dependency-driven, not wish-list order:

```
Phase 1  Field role merge + ocular rename + logout confirm   <- done
Phase 2  Lead detail tabs rework                             <- done
Phase 3  PDF generation (incl. the ocular inspection report) <- done (superseded by v2, see status note)
Phase 4  CSV import & export
Phase 5  UX polish & global search
Phase 6  Calendar view                                       <- done
Phase 7  Lead map view                                       <- needs the geocoding migration from its own step
Phase 8  Email notifications                                 <- done, not deployed (see status note)
Phase 9  AI assistant                                        <- reuses phase 8's function infra
```

Phases 3–7 are independent of each other and can be parallelised once 1 and 2
land. Phase 9 is cheapest right after 8 because both share the same function
scaffolding, secret handling and CORS config.

Rough sizing: **Phase 1** ~1.5 days · **2** ~1 day · **3** ~2.5 days ·
**4** ~1.5 days · **5** ~3 days · **6** ~2 days · **7** ~2.5 days ·
**8** ~2.5 days · **9** ~2 days.

---

## Phase 1 — Field role merge, ocular rename, logout confirmation ✅ built

> **Status:** implemented. `supabase/migrations/0008_field_role.sql` is written
> but **not applied** — nothing works until it is. Two deviations from the plan
> below: the `leads` policy naming the old roles is `leads_select` (line 125),
> not `leads_insert`; and a `canEdit` / `canWork` split was added to
> `SurveysSection` and `InstallationSection`, without which a field technician
> could open their own job and change nothing (see 1e).

### 1a. Merge `surveyor` + `installer` into `field`

Role value `field`, label **"Field Technician"**. (Say the word if you'd rather
have `field_tech` / "Field Crew" — it is a one-line change now and a second
migration later.)

**`supabase/migrations/0008_field_role.sql`**

Order matters — widen the constraint, backfill, then narrow it:

1. `alter table public.users drop constraint users_role_check;`
2. Re-add allowing `('admin','sales','field','office')` **plus** the old values,
   backfill `update public.users set role = 'field' where role in ('surveyor','installer')`,
   then drop and re-add the constraint without the old values. Doing it in three
   steps inside one transaction keeps the migration re-runnable and avoids a
   window where existing rows violate the constraint.
3. Replace every role reference found in the audit below.

Exact SQL sites that reference the old roles (verified by grep):

| File | Lines | What changes |
| --- | --- | --- |
| `0001_initial_schema.sql:35` | role CHECK | superseded by 0008 |
| `0002_rls.sql:125` | `leads_insert` — `has_role('admin','office','surveyor','installer')` | to `'field'` |
| `0002_rls.sql:152–166` | `leads_update_field_staff` | already dropped by `0005`; confirm it is gone rather than re-adding |
| `0002_rls.sql:197–211` | `surveys_update` — `has_role('surveyor') and assigned_surveyor_id = auth.uid()` | to `'field'` |
| `0002_rls.sql:297–309` | `installations_update` — `has_role('installer') and auth.uid() = any(assigned_crew_ids)` | to `'field'` |
| `0002_rls.sql:320–328` | `service_tickets_*` — `'installer'` in three policies | to `'field'` |
| `0003_storage.sql:52–53` | `surveys` prefix allows `'surveyor'`, `installations` prefix allows `'installer'` | both to `'field'` (one role now writes to both prefixes) |
| `0005_p0_fixes.sql:56–70` | `advance_lead_stage` branches `elsif v_role = 'surveyor'` / `elsif v_role = 'installer'` | collapse into one `elsif v_role = 'field'` whose `exists` check ORs the survey-assignee and crew-member conditions |

`can_see_lead` (`0002:46`) needs no change — it only special-cases `sales`.

**Client changes**

| File | Change |
| --- | --- |
| `src/lib/constants.ts` | `ROLE_LABELS`: drop `surveyor`/`installer`, add `field: "Field Technician"` |
| `src/lib/supabase/database.types.ts` | `UserRole` union becomes `'admin' \| 'sales' \| 'field' \| 'office'` |
| `src/pages/Index.tsx` | replace the `surveyor`/`installer` cases with one `case "field": return <FieldDashboard user={user} />` |
| `src/pages/_components/SurveyorDashboard.tsx` + `InstallerDashboard.tsx` | merge into `FieldDashboard.tsx` (below) |
| `src/pages/leads/_components/ScheduleSurveyDialog.tsx:36` | `["surveyor","admin"]` to `["field","admin"]` |
| `src/pages/leads/_components/ScheduleInstallationDialog.tsx:36` | `["installer","admin"]` to `["field","admin"]` |
| `src/pages/leads/_components/CreateTicketDialog.tsx:42` | `["admin","office","installer"]` to `["admin","office","field"]` |
| `src/pages/team/page.tsx:17–26` | one `field` entry in `ROLE_ICONS` / `ROLE_COLORS`; the role `<Select>` options shrink to four |
| `src/lib/supabase/queries/surveys.ts:70` | `profile?.role === "surveyor"` becomes `=== "field"` |
| `src/lib/supabase/queries/installations.ts` | same treatment in `listInstallationsForInstaller` |
| `src/lib/supabase/realtime.ts:98` | the `["surveys","surveyor"]` invalidation key — rename to `["surveys","field"]` and match `queryKeys` |

**`FieldDashboard.tsx`** — one page, two job types, sorted into one chronological
list rather than two stacked sections:

- Stats row: Today · This week · Open jobs · Completed (last 30d)
- **Today** section: inspections and installs interleaved by time, each card
  badged by type (`Ocular` / `Install`) and status
- **Upcoming**, **On hold**, **Recently completed** sections below
- Cards keep the existing tap-through to `/leads/:id`
- Data: keep `useSurveysForSurveyor` and `useInstallationsForInstaller`,
  normalise both into a shared `FieldJob` shape in the component. Rename the
  hooks to `useMyInspections` / `useMyInstalls` while you are in there.

**Risks**

- The `users_role_check` rewrite is the only irreversible step. Take a snapshot
  of `select id, role from public.users` before applying.
- Anyone signed in as a surveyor when the migration runs keeps a stale role only
  until their next `useCurrentUser` refetch — `auth_role()` reads the row live,
  so RLS is correct immediately.

### 1b. "Site Ocular Inspection" rename (labels only)

Add to `src/lib/constants.ts`:

```ts
export const INSPECTION_LABEL = "Site Ocular Inspection";
export const INSPECTION_LABEL_SHORT = "Ocular Inspection";
export const INSPECTION_LABEL_PLURAL = "Site Ocular Inspections";
```

Then sweep visible strings — do **not** rename files, hooks, types, tables or
columns:

- `SurveysSection.tsx` — card title, empty state, "Schedule first survey"
- `ScheduleSurveyDialog.tsx` / `CompleteSurveyDialog.tsx` — titles, the
  "Select surveyor…" placeholder becomes "Select technician…"
- `FieldDashboard.tsx` — section headings, badge text
- `AppLayout.tsx` landing page — the "Surveys & Quotes" feature card
- `queries/surveys.ts` — the two `logActivity` action strings
  (`"Site survey scheduled"` becomes `"Site ocular inspection scheduled"`).
  **Note:** existing `activity_log` rows keep the old wording; either accept the
  mixed history or add a one-line `update public.activity_log set action = ...`
  to 0008.
- `STAGE_LABELS` — `survey_scheduled` becomes "Inspection Scheduled",
  `survey_completed` becomes "Inspection Done". Stage *values* stay as they are.

### 1c. Photo upload outside the completion flow

Today photos can only be attached while completing an inspection
(`CompleteSurveyDialog`). Add an **Add photos** action on every inspection card
(scheduled or completed):

- New `appendSurveyPhotos({ surveyId, photos })` in `queries/surveys.ts`,
  mirroring `addCompletionPhotos` in `installations.ts` — upload via
  `uploadFiles("photos", "surveys", surveyId, files)`, then append to
  `photo_paths`. Use a `SECURITY DEFINER` append RPC like
  `append_completion_photos` (0005:185) so two technicians uploading at once
  don't clobber each other's array.
- Migration `0008` gains `append_survey_photos(p_survey_id uuid, p_paths text[])`.
- UI: a small dropzone + thumbnail grid, reusing the preview/remove logic
  already in `CompleteSurveyDialog:56–72`.

### 1d. Logout confirmation

Extract a `src/components/sign-out-button.tsx` wrapping the existing
`signOut()` in an `AlertDialog` ("Sign out of Lampara? You'll need to sign in
again."). Replace both call sites: `AppSidebar.tsx:96` and the mobile top bar in
`AppLayout.tsx:58`.

### 1e. Let field staff actually work their own jobs (found during 1a)

Not in the original plan. The lead detail page computes one permission —
`canEdit = admin|sales|office` — and passes it to every section, so a field
technician opening their own job could not complete an inspection, tick a
materials item, move an installation's status or upload completion photos.
RLS permits all of it (`surveys_update`, `installations_update`); only the UI
was in the way, which made the merged role largely decorative.

The fix splits the two ideas apart inside the sections, which is where the
assignment data already lives:

- `SurveysSection` — per inspection, `canWork = canSchedule || currentUser is
  the assigned technician`. Gates Complete and Add photos. Cancelling stays a
  scheduling action.
- `InstallationSection` — `canWork = canEdit || currentUser is on
  `assignedCrewIds``. Gates the status buttons, the checklist and completion
  photos. "Activate as Customer" stays on `canEdit`, since
  `advance_lead_stage` refuses `active_customer` from the field role anyway —
  showing that button to a technician would only produce a 42501.

---

## Phase 2 — Lead detail tabs rework ✅ built

> **Status:** implemented, and larger than planned. `public/Ocular report sample.pdf`
> turned out to be a ~40-field form with eight *named* photo slots and a
> prepared/approved sign-off, so the Ocular Inspection tab is a full report
> form rather than the existing six-field dialog. That work is
> `supabase/migrations/0009_ocular_report.sql` plus
> `src/pages/leads/_components/ocular/*`, and is described in 2b below.
> Migration **not applied**.

`src/pages/leads/[id]/page.tsx` is a 379-line three-column grid that stacks six
sections into the middle column. Convert to tabs.

**Tabs:** Overview · Ocular Inspection · Quotes · Permits · Installation ·
Maintenance · Activity History

**One gap in that list:** there is no Contracts tab, but `ContractSection`
exists and is a real pipeline step. Built as decided — it shares the **Quotes**
tab, side by side with the quote list, since a contract is always derived from
an accepted quote (`createContract` takes a `quoteId`).

**Structure**

```
Header (unchanged: name, stage badge, stale badge, edit/delete, stage select)
└── <Tabs value={tab} onValueChange={...}>   <- synced to ?tab= in the URL
    ├── Overview           Contact card · Property card · Notes card · next-action summary
    ├── Ocular Inspection  <SurveysSection>
    ├── Quotes             <QuotesSection> + <ContractSection>
    ├── Permits            <PermitsSection>
    ├── Installation       <InstallationSection>
    ├── Maintenance        <ServiceTicketsSection>
    └── Activity History   note composer + full log (no 420px scroll cap)
```

**Details that matter**

- Use the existing `src/components/ui/tabs.tsx`; no new dep.
- **URL-sync the active tab** (`useSearchParams`) so the calendar, map, global
  search and email links can deep-link straight to `/leads/:id?tab=installation`.
- **Count badges** on each tab (2 quotes, 3 permits, 1 open ticket) — the
  sections already fetch this data via their own hooks; hoist the queries to the
  page so the badges render without mounting hidden tabs.
- Keep every `*Section` component's props identical. This phase is a layout
  change, not a rewrite of the sections.
- Mobile: horizontally scrollable `TabsList` with a sticky top offset.
- Activity History gets breathing room — the note composer moves to the top of
  that tab and the log renders full-height, which is the main UX win here.

### 2b. The Site Ocular Report (found when the sample PDF arrived)

The printed form is the deliverable, so the tab models it field for field.

**`supabase/migrations/0009_ocular_report.sql`**

- Status becomes `scheduled → submitted → approved` (plus `cancelled`).
  Historical `completed` rows fold into `approved` — they were accepted at the
  time and quotes were written against them.
- ~40 typed columns on `surveys`, one per field on the page, all nullable: the
  report is filled across a visit. Arrays (`support_purlins`, `mounting`,
  `roof_orientation`) are validated by a trigger, since a CHECK cannot constrain
  array *elements*.
- `survey_photos (survey_id, category, path, caption, sort_order)` with the ten
  slots the report prints. Existing `photo_paths` entries are backfilled into
  `other`; the column stays for one release, commented as superseded.
- `submit_survey_report` / `approve_survey_report` / `reopen_survey_report`,
  all `SECURITY DEFINER`. Approval stamps "Approved by", sets `completed_at`
  and calls `advance_lead_stage(..., 'survey_completed')` — that is what
  unlocks quoting. The technician who prepared a report cannot approve it.
- `can_edit_survey(uuid)` backs the `survey_photos` policies so the write rule
  lives in one place.

**Client**

- `src/pages/leads/_components/ocular/` — `OcularInspectionTab` (status bar,
  sign-off blocks, submit/approve/send-back/reopen), `OcularReportForm` (the
  whole form), `PhotoSlots` (per-slot uploads with caps), `fields.tsx`
  (radios for exclusive groups, checkboxes for the rest, appliance rows).
- Form values are held as strings and coerced once on save; binding number
  inputs straight to numbers fights the typist ("1." is NaN mid-keystroke).
- "Coordinates" reads the device's GPS, which also seeds the `lat`/`lng` the
  Phase 7 map needs.
- Editability follows the lifecycle: technician while `scheduled`, office once
  `submitted`, read-only once `approved` or `cancelled`.
- `CompleteSurveyDialog` and `SurveysSection` are deleted — superseded.

---

## Phase 3 — PDF generation

**Library:** `@react-pdf/renderer`, lazy-loaded. Rationale: the requirement says
"Print PDF **with Format**" — a real document, not the browser's print dialog
where margins, headers and page breaks are the user's problem. Cost is ~1MB
gzipped, so it must live behind `React.lazy` in its own chunk and never enter
the entry bundle.

**New files**

```
src/lib/pdf/
  theme.ts            brand tokens: logo, colours, Plus Jakarta Sans registration
  Document.tsx        shared page frame — header w/ logo, footer w/ page numbers
  InspectionReport.tsx
  QuotePdf.tsx
  ContractSummaryPdf.tsx
  LeadReportPdf.tsx
  download.ts         pdf(<Doc/>).toBlob() -> object URL -> anchor click
```

**Documents**

1. **Site Ocular Inspection report** — customer + property block, technician,
   scheduled/completed timestamps, roof type/age, estimated system size, shading
   and additional notes, then a photo grid.
2. **Quote** — Lampara branding, itemised system detail (panel count/model,
   inverter, kW), pricing, financing option, validity date, quote version.
3. **Contract summary** — parties, linked quote version, status, signed date,
   notes.
4. **Lead report** (from `/reports`) — the KPI cards and per-stage/permit/revenue
   tables currently rendered on the page.

**Download buttons:** `SurveysSection` card (per completed inspection),
`QuotesSection` card, `ContractSection` card, and a "Download PDF" in the
Reports page header.

**Two known snags**

- **Photos in the PDF.** `@react-pdf/renderer`'s `<Image>` fetches the URL
  itself. Supabase signed URLs are CORS-open, but to be safe — and to avoid a
  URL expiring mid-render — fetch each photo to a blob and pass a data URI.
  Cap at ~12 photos to keep the blob under a few MB.
- **Font registration.** `@fontsource/plus-jakarta-sans` ships woff2;
  `Font.register` wants a TTF/OTF URL. Either add the TTF to `public/fonts/` or
  fall back to Helvetica for PDFs. Decide before building `theme.ts`.

---

## Phase 4 — CSV import & export

**Export** — no dependency. A `src/lib/csv/export.ts` with RFC-4180 escaping
(quote-wrap anything containing a comma, a double quote or a newline; double
interior quotes) and a `downloadCsv(filename, rows)` helper.

- **Leads export** respects current filters. `listEnrichedLeads` is capped and
  returns `{ leads, total, truncated }` — export must re-query *unfiltered by
  the page cap*, so add an `exportLeads(filters)` query that pages through with
  `.range()` until exhausted rather than exporting only what's on screen. This
  is the single most likely bug in this phase.
- **Reports export** — one CSV per section, or a combined one; the four RPCs
  already return flat shapes.

**Import** — add `papaparse` (~45KB, streams, handles quoted newlines). A
hand-rolled parser is a trap here.

New route `/leads/import` (admin/office/sales only), four steps:

1. **Upload** — drag/drop, 5MB cap, first 20 rows previewed
2. **Map fields** — a `<Select>` per CRM field against detected headers, with
   fuzzy auto-match (`first_name` / `First Name` / `fname`). Required: first
   name, last name, phone. Optional: email, source, stage, address, city, state,
   zip, property type, notes, assigned rep (matched by email)
3. **Validate** — a zod schema per row; a table of errors with row numbers plus
   a count of valid rows. Duplicate detection on phone against existing leads
4. **Confirm** — insert in batches of 100 via the existing
   `create_lead_with_property` RPC (0006:25) so lead + property stay atomic and
   the activity log entry is written. Show progress; on partial failure report
   which rows landed

Add `import_batch_id uuid` to `leads` in migration `0009` so a bad import can be
rolled back with one delete. Cheap insurance.

---

## Phase 5 — UX polish & global search

**Global search (Cmd+K)** — `cmdk` and `src/components/ui/command.tsx` are
already installed and unused. Add `src/components/global-search.tsx` mounted in
`AppLayout`, opened by Cmd+K / Ctrl+K and a search affordance in the sidebar.

Backing query: today only `searchLeads` exists (`queries/leads.ts:239`, backed by
the trigram index at `0001:146`). Add **`0009_search.sql`** with a
`search_all(p_query text)` function returning
`(kind text, id uuid, lead_id uuid, title text, subtitle text, rank real)` —
`security invoker` so RLS narrows sales reps to their own leads automatically.
Union over:

- leads — name, phone, email (existing trigram index)
- contacts — same table today; there is no separate contacts entity, so this is
  the lead's contact fields unless you want a contacts table (out of scope here)
- service tickets — needs `create index service_tickets_search_idx on
  public.service_tickets using gin ((title || ' ' || description) gin_trgm_ops)`

Results grouped by kind, keyboard-navigable, Enter routes to
`/leads/:id?tab=...` (deep-linking earned in Phase 2).

**Motion** — `motion` v12 is already a dependency and unused.

- Route transitions: an `AnimatePresence` wrapper in `AppLayout` around
  `<Outlet/>`, 150ms fade + 4px rise. Keep it under 200ms; anything slower reads
  as lag on a CRM people use all day.
- Micro-animations: stage badge changes, card mount stagger on dashboards,
  number roll-up on KPI cards.
- **Respect `prefers-reduced-motion`** — one `useReducedMotion()` guard.

**Mobile**

- Swipeable lead cards: below `md`, the leads table becomes a card list;
  swipe-left reveals Call / Message, swipe-right reveals stage-advance. `vaul`
  is installed for the detail drawer.
- Sticky headers: page header + filter row stick on scroll; the `TabsList` on
  lead detail sticks under it.

**Empty states** — `src/components/ui/empty.tsx` exists and is unused. Replace
the ad-hoc empty blocks (leads table, dashboards, every `*Section`) with it, each
carrying a real CTA.

**Toasts** — `sonner` is wired. Audit for silent mutations: `handleAddNote`
(lead detail) only toasts on failure, checklist toggles are silent, photo uploads
are silent. Add success toasts with an Undo action where the mutation is
reversible.

**Visual pass** — spacing scale audit (the codebase mixes `gap-2/2.5/3/3.5/4`),
one type scale, consistent card padding, and a single source for the
status-badge colour maps, which are currently duplicated across
`constants.ts`, `SurveyorDashboard.tsx`, `InstallerDashboard.tsx`,
`SurveysSection.tsx` and `reports/page.tsx`.

---

## Phase 6 — Calendar view ✅ built

> **Status:** implemented as planned, no migration needed — the calendar reads
> `surveys`/`installations` directly rather than owning its own table.
> `src/lib/supabase/queries/calendar.ts`'s `listCalendarEvents({from, to})`
> merges both, scoped to "mine" for `field` role exactly like
> `listMyInspections`/`listMyInstallations` already do. `CalendarEvent` keeps
> inspections (`allDay: false`, a real time) and installations (`allDay: true`,
> a date only) as a discriminated union rather than forcing both into one
> instant — the plan's own "watch out" about `scheduled_date` being a plain
> date turned out to matter for the event *shape*, not just rendering.
> Route + `src/pages/calendar/page.tsx` (month grid with a `+N more` popover,
> plus a week list view — mobile defaults to week via an initial
> `window.innerWidth` check, both toggleable). Added to both
> `AppSidebar.tsx` (unconditional, matches Dashboard/Pipeline/Leads) and
> `MobileNavbar.tsx`'s curated slot list, unconditional as well.

New route `/calendar`, sidebar + mobile nav entry.

**Build the grid rather than adding FullCalendar.** `date-fns` is already a
dependency; a month grid plus a week column view is ~250 lines and matches the
design system exactly. FullCalendar would be ~300KB and fight the Tailwind
theme. (`react-day-picker` is a date *picker*, not an event calendar — don't
reach for it.)

**Data** — `queries/calendar.ts`:

```ts
listCalendarEvents({ from, to }): Promise<CalendarEvent[]>
// CalendarEvent = { id, kind: "inspection" | "installation", leadId,
//                   leadName, address, at, status, assigneeNames }
```

Two parallel selects (`surveys` by `scheduled_at`, `installations` by
`scheduled_date`) merged client-side. Role scoping mirrors what's already there:
`field` sees only rows they're assigned to; everyone else sees all. RLS already
permits the read, so this is a filter, not a security boundary.

**Views**

- Month grid: up to 3 events per day cell, "+N more" opens a day popover
- Week: 7 columns, time-ordered
- Mobile default is week; month is available but scrolls horizontally
- Colour by kind (inspection vs installation), opacity/border by status
- Click an event to open `/leads/:id?tab=ocular-inspection` (or `installation`)

**Watch out:** `surveys.scheduled_at` is `timestamptz` but
`installations.scheduled_date` is a plain date (`0001:304`). The calendar must
render installs as all-day events rather than pinning them to midnight UTC,
which would land them on the wrong day for anyone east of UTC — including
Manila.

---

## Phase 7 — Lead map view

### 7a. Geocoding (its own migration + backfill)

**`0010_property_geocoding.sql`** — `alter table public.properties add column
lat double precision, add column lng double precision, add column geocoded_at
timestamptz;` plus an index on `(lat, lng)`.

**Where geocoding happens:** client-side, using the Maps JS API's
`google.maps.Geocoder` at property create/update time in `createLead` /
`updateProperty`. This matters — the *Geocoding Web Service* does not support
HTTP-referrer key restrictions, so calling it from the browser would expose an
unrestricted key. The Maps JS `Geocoder` class runs under the referrer-restricted
browser key and is the correct client-side path.

**Backfill:** a one-off Node script (`scripts/geocode-backfill.ts`) run locally
with a *separate, server-restricted* key and the service-role key, walking
properties where `lat is null` at ~10 req/s. Not committed to the client bundle,
never a `VITE_` variable.

### 7b. Map view

- Dep: `@vis.gl/react-google-maps` (Google's official React wrapper) plus its
  clustering utility, lazy-loaded.
- `VITE_GOOGLE_MAPS_API_KEY` in `.env.example` / `.env.local`, restricted by
  HTTP referrer to the Vercel domain and `localhost`.
- Leads page gets a list/map toggle (`ToggleGroup`, already installed),
  persisted in the URL (`?view=map`) so it survives a refresh and is shareable.
- Pins coloured by `STAGE_COLORS`; the map honours the page's existing stage and
  source filters.
- Cluster at low zoom; click a pin for a card overlay with name, address, stage,
  phone, "Open lead" and a "Directions" link to Google Maps.
- Leads with no geocode: a count chip — "6 leads not on the map" — that filters
  the list to them, rather than silently dropping them.
- Field techs get "today's route": their day's inspections and installs pinned
  in sequence.

---

## Phase 8 — Email notifications ✅ built

> **Status:** implemented — schema, Edge Function code, client wiring and a
> preferences UI are all written, but **nothing is deployed**. Same limitation
> as every migration in this repo: no reachable Supabase org from here, so
> `supabase/migrations/0020_notifications.sql` needs applying and
> `supabase functions deploy notify` needs running by hand, with
> `RESEND_API_KEY` / `NOTIFY_FROM` set via `supabase secrets set` first —
> nothing will actually send email until both of those happen.
>
> Deviations from the plan below:
> - **Migration is `0020`, not `0011`** — `0011` was already
>   `0011_workflow_authorization.sql` by the time this phase started; the
>   ledger at the bottom of this doc was written against a much earlier state
>   of the migrations directory.
> - **The client never sends a recipient's email address.** Every
>   `notifyEvent()` call passes user *ids* (`recipientUserIds`); the `notify`
>   function resolves the actual address server-side with the service-role
>   key, exactly as this phase's "Function responsibilities" note demanded —
>   just clarifying that "never trust the recipient address from the request
>   body" is satisfied by never putting an address in the body at all, not by
>   validating one that's there.
> - **Preferences live on the Team page**, not a new `/settings` route — the
>   plan named this as an acceptable alternative, and there was no other
>   reason for a `/settings` page to exist yet.
> - **Permit-overdue has no trigger.** It's a real event in the schema and the
>   function's template list, but nothing fires it — the plan's own note that
>   this needs `pg_cron`/`pg_net` and "an extra extension enable" is exactly
>   right, and enabling extensions is a dashboard-level step this migration
>   left as a commented-out, ready-to-uncomment block rather than guessing at
>   your project ref and service-role key.
> - **The other five events are wired into the mutations that already
>   existed**, not new ones: `createLead` and `updateLead` (rep reassignment,
>   detected by fetching the previous `assigned_sales_rep_id` before the
>   write — `updateLead` had no such check before), `scheduleSurvey`,
>   `createInstallation`, `approveQuote` (widened its `select()` to join the
>   lead's assigned rep), and `markContractSigned` (same join). All fire
>   *after* the write succeeds and never throw on failure — same fire-and-forget
>   contract as `logActivity`, and for the same reason: a notification email
>   failing must never read as the user's actual action having failed.

**Infrastructure this repo does not have yet.** This phase pays that setup cost.

```
supabase/functions/
  _shared/cors.ts, supabase.ts, email.ts   (Resend client)
  notify/index.ts
```

Add to `supabase/README.md`: `supabase functions deploy notify` and
`supabase secrets set RESEND_API_KEY=... NOTIFY_FROM=...`.

**Migration `0011_notifications.sql`**

```sql
create table public.notification_preferences (
    user_id                uuid primary key references public.users (id) on delete cascade,
    lead_assigned          boolean not null default true,
    inspection_scheduled   boolean not null default true,
    installation_scheduled boolean not null default true,
    permit_overdue         boolean not null default true,
    quote_accepted         boolean not null default true,
    contract_signed        boolean not null default true,
    updated_at             timestamptz not null default now()
);
```

RLS: read/write your own row; admins read all. Defaults are created lazily on
first read (`upsert`) so existing users need no backfill.

**Triggering** — the app layer invokes the function after each write, via
`supabase.functions.invoke("notify", { body })` in `queries/*.ts`, wrapped so a
notification failure never fails the user's action. Six events:

| Event | Fired from | Recipient |
| --- | --- | --- |
| Lead created & assigned | `createLead`, `updateLead` (rep change) | assigned rep |
| Inspection scheduled | `scheduleSurvey` | assigned technician |
| Installation scheduled | `createInstallation` | every crew member |
| Quote accepted | `updateQuoteStatus` to `accepted` | lead's rep |
| Contract signed | `markContractSigned` | lead's rep |
| Permit overdue | scheduled job | admin + office |

**Permit overdue is the odd one out** — nothing in the app fires when a date
passes. It needs `pg_cron` + `pg_net` calling the function daily, or Supabase's
Scheduled Functions. That's an extra extension enable; budget for it during
setup.

**Function responsibilities:** verify the caller's JWT, look up recipients and
their preferences with the service-role key, render the template, send via
Resend, and write a row to a `notification_log` table so delivery is debuggable.
Never trust the recipient address from the request body — resolve it server-side
from `public.users`.

**Preferences UI:** a Notifications card on a new `/settings` page (or on the
Team page for your own row) with a switch per event.

---

## Phase 9 — AI assistant

```
supabase/functions/ai-assist/index.ts
```

Holds `ANTHROPIC_API_KEY` as a secret. Model: `claude-sonnet-5` — fast enough for
an interactive panel and well within budget for these prompt sizes.

**Contract**

```ts
POST /ai-assist  { leadId, action: "summary" | "next_actions" | "draft_note" }
// -> { text: string }   (or an SSE stream for the summary)
```

**Critical:** the function must build the lead context itself using a Supabase
client constructed from **the caller's JWT**, not the service-role key.
Otherwise a sales rep could summarise a lead RLS says they cannot see. Assemble:
the lead row, property, inspections, quotes, contract, permits, installation,
open tickets, and the last ~30 activity entries.

**Panel** — `src/pages/leads/_components/AIPanel.tsx`, a collapsible card in the
Overview tab:

- **Summarise this lead** — one paragraph plus 3–5 bullets of history
- **Suggest next actions** — 2–4 concrete actions from stage + last activity,
  each with a button that performs it (schedule inspection, create quote, add
  permit) rather than just describing it
- **Draft a follow-up note** — pre-fills the Activity History composer; the user
  edits and saves. Never writes to the activity log on its own.

Cache summaries in React Query with a 10-minute stale time keyed on the lead's
`lastActivityAt`, so reopening the panel doesn't re-bill. Label every output as
AI-generated, and keep a visible "regenerate" so a bad output isn't sticky.

---

## Migration ledger

**This table was written before Phase 1 landed and the numbers below never
matched what actually got applied** — Phase 1 alone consumed `0008`, and by
the time Phase 8 was built the migrations directory was up to `0019`. Treat
the table as historical intent, not a lookup: the real, current file for a
built phase is named in that phase's own status note above (Phase 1 → `0008`,
Phase 8 → `0020_notifications.sql`). Phases 4, 5, 7, 9 haven't been built, so
their numbers below remain unclaimed guesses until whoever builds them checks
`supabase/migrations/` for the actual next-available number.

| # | File | Phase |
| --- | --- | --- |
| 0008 | `0008_field_role.sql` — role merge, `append_survey_photos`, optional activity-log relabel | 1 |
| 0009 | `0009_import_and_search.sql` — `leads.import_batch_id`, ticket trigram index, `search_all()` | 4, 5 |
| 0010 | `0010_property_geocoding.sql` — `lat` / `lng` / `geocoded_at` | 7 |
| 0011 | ~~`0011_notifications.sql`~~ — superseded by `0020_notifications.sql`, see Phase 8 above | 8 |

Each is idempotent and applied by hand (`supabase db push` or the SQL editor) —
the MCP connector cannot reach this project's org.

## New dependencies

| Package | Phase | Size | Why |
| --- | --- | --- | --- |
| `@react-pdf/renderer` | 3 | ~1MB gz | Real formatted PDFs; lazy-loaded |
| `papaparse` | 4 | ~45KB | CSV parsing that survives quoted newlines |
| `@vis.gl/react-google-maps` | 7 | ~60KB | Official Google Maps React bindings |
| *(none)* | 5, 6 | — | `motion`, `cmdk`, `date-fns`, `vaul` and `empty.tsx` are already installed and unused |

## New environment variables

```
VITE_GOOGLE_MAPS_API_KEY=      # browser, referrer-restricted (Phase 7)
```

Edge-function secrets — never `VITE_`, never in the bundle:

```
RESEND_API_KEY, NOTIFY_FROM    # Phase 8
ANTHROPIC_API_KEY              # Phase 9
GOOGLE_GEOCODING_API_KEY       # Phase 7 backfill script only, server-restricted
```

## Verification checklist

Nothing below can be exercised without a real Supabase project, so this is the
manual pass after each phase:

- **1** — sign in as a migrated technician: they see one dashboard with both
  inspections and installs; they can complete an inspection and the lead
  advances; they still cannot change the lead's name or rep; storage upload
  works for both the `surveys/` and `installations/` prefixes
- **2** — deep links (`/leads/:id?tab=permits`) open the right tab; tab badge
  counts match the sections; back/forward navigate tabs
- **3** — an inspection PDF with 10 photos renders in under ~3s and the images
  actually appear; a quote PDF matches the on-screen numbers to the cent
- **4** — export with a stage filter applied returns every matching lead, not
  just the first page; an import of 500 rows with 3 bad ones reports exactly
  those 3 and inserts 497
- **5** — Cmd+K as a sales rep surfaces only their own leads; reduced-motion
  disables transitions
- **6** — an installation scheduled for the 1st shows on the 1st, not the 31st
- **7** — pins match the list under the same filters; the un-geocoded count is
  accurate
- **8** — a rep with `lead_assigned` off receives nothing; the outbound address
  comes from the DB, not the request body
- **9** — a sales rep cannot summarise another rep's lead (expect a 403)
