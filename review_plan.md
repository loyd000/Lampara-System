# Lampara CRM — post-migration review

A pass over the Supabase migration looking for bugs, data-integrity risks and
places the Convex→Postgres translation left something behind. Ordered by
severity; each item says what breaks, and what the fix is.

Verified by reading: `supabase/migrations/*`, `src/lib/supabase/**`,
`src/components/providers/*`, and every migrated page/component.

---

> **Status:** P0 (#1–#4), most of P1 (#5–#9) and P2 (#10–#14) are fixed — see
> `supabase/migrations/0005_p0_fixes.sql`, `0006_atomic_writes.sql` and
> `0007_report_functions.sql`, plus the notes under each item. P3 and P4 are
> still open.

## P0 — Security and correctness ✅ done

### 1. Surveyors and installers can rewrite any column on a lead — FIXED

`leads_update_field_staff` (0002_rls.sql) exists so field staff can advance a
lead's stage when they finish their own work. But it ends with:

```sql
with check (true);
```

The `USING` clause controls *which rows* they may touch; `WITH CHECK (true)`
puts no constraint on the *values* they write. Supabase grants `authenticated`
UPDATE on every column by default, so a surveyor assigned to one survey can
reassign that lead's sales rep, rewrite the customer's phone and email, or jump
the stage to `active_customer`.

Postgres RLS cannot restrict columns, and a column-level `GRANT` would apply to
every role at once — so it would break admin/sales editing too.

**Fix:** drop the policy and move stage advancement into a `SECURITY DEFINER`
function that writes only `stage` and `last_activity_at` after checking the
caller is genuinely on that survey or installation crew:

```sql
create function public.advance_lead_stage(p_lead_id uuid, p_stage text)
returns void language plpgsql security definer set search_path = public as $$
begin
    if not (
        public.has_role('admin', 'office', 'sales')
        or exists (select 1 from public.surveys
                    where lead_id = p_lead_id and assigned_surveyor_id = auth.uid())
        or exists (select 1 from public.installations
                    where lead_id = p_lead_id and auth.uid() = any(assigned_crew_ids))
    ) then
        raise exception 'Insufficient permissions' using errcode = '42501';
    end if;

    update public.leads
       set stage = p_stage, last_activity_at = now()
     where id = p_lead_id;
end $$;
```

**Done.** `leads_update_field_staff` is dropped and every stage change in the
app now goes through `advance_lead_stage(p_lead_id, p_stage, p_only_from)`,
wrapped as `advanceLeadStage()` in `queries/leads.ts`. It writes only `stage`,
`last_activity_at` and `converted_at`, and re-derives permission server-side —
surveyors may only set the two `survey_*` stages and installers the two
`installation_*` ones. The `p_only_from` guard replaces the `.eq("stage", …)`
filters that used to express "don't drag a lead backwards", and the function
returns the previous stage so callers can write an accurate activity entry
without a second read.

`log_lead_activity` became SECURITY DEFINER at the same time: with the
field-staff UPDATE policy gone its `last_activity_at` bump would otherwise have
silently no-oped for surveyors and installers. It now checks `can_see_lead()`
and still pins `user_id` to the caller, so the guarantees are unchanged.

### 2. The password reset link goes nowhere — FIXED

`sendPasswordReset` is wired to the "Forgot your password?" link and sends a
recovery email pointing at `/auth/callback`. But `Callback.tsx` only waits for a
session and then navigates home — there is no `supabase.auth.updateUser({ password })`
call anywhere in the codebase.

The practical effect: clicking the reset link silently signs the user in and
drops them on the dashboard with the same password they could not remember.

**Done.** The provider now tracks the `PASSWORD_RECOVERY` event as
`isPasswordRecovery` and exposes `updatePassword()`. A new
`<PasswordRecoveryGate>` sits just inside the router in `App.tsx` and replaces
the whole app with a set-a-new-password form while recovery is in progress.

Gating at the router rather than on `/auth/callback` was deliberate: it removes
the race between the redirect landing and the event firing, and works whichever
route the link resolves to. There is a "Skip for now" escape hatch for someone
who opened the link by accident.

### 3. The materials checklist silently loses concurrent edits — FIXED

`InstallationSection.handleToggleItem` rebuilds the whole array from the copy in
React state and overwrites the column:

```ts
const checklist = (installation.materialsChecklist ?? []).map((item, i) =>
    i === idx ? { ...item, checked: !item.checked } : item,
);
await updateChecklist({ installationId: installation._id, checklist });
```

Two crew members ticking items on their phones at the same time is the expected
usage, and the second write discards the first. Realtime makes it worse: the
item visibly un-ticks a moment later.

`addChecklistItem` and `addCompletionPhotos` have the same read-modify-write
shape — an added item can vanish.

**Done.** Three RPCs in 0005 — `toggle_checklist_item`, `add_checklist_item`
and `append_completion_photos` — each a single `UPDATE` that mutates in place
with `jsonb_set` / `||`. The client now sends the *index* rather than the whole
array, so a stale copy can no longer overwrite someone else's tick.

These are deliberately `SECURITY INVOKER`: one statement is already atomic, and
leaving RLS in force means `installations_update` still decides who may write —
no permission logic to duplicate and keep in sync.

`useUpdateChecklist` is replaced by `useToggleChecklistItem`. `completeSurvey`
and `addCompletionPhotos` also now delete their uploads if the row write fails,
which closes P1 #8 as a side effect.

### 4. A deactivated user gets a blank dashboard, not an explanation — FIXED

`auth_role()` returns null when `is_active` is false, so every policy denies the
row — correct. But the UI has no path for it: `getCurrentUser()` returns the
profile with `isActive: false`, `Index.tsx` hits `if (!user) return null` or
renders a dashboard with empty queries, and the user sees a working-looking app
with no data and no message. The same blank screen appears in the brief window
where the signup trigger has not yet created the profile row.

**Done.** A new `<AccountGate>` wraps the app shell inside `<Authenticated>` in
`AppLayout`. It distinguishes four states — loading, query error, profile not
yet provisioned, and deactivated — and gives each its own screen with a way
out. Because Realtime is subscribed to `users`, the provisioning case resolves
on its own the moment the trigger's row lands.

`Index.tsx` shed its duplicate loading branch as a result: it now runs only
once the gate has established there is an active profile.

---

## P1 — Data integrity ✅ mostly done

### 5. Multi-step writes are no longer atomic — FIXED (partly)

Convex mutations were transactions. Several flows are now sequences of
independent requests, and a failure part-way leaves inconsistent state:

| Flow | If it fails half way |
|------|----------------------|
| `createContract` | the quote has already been flipped to `accepted`, but no contract exists |
| `reviseQuote` | the old quote is `superseded` with no replacement — the lead has no live quote |
| `createLead` | handled, but see #6 |
| `scheduleSurvey`, `createPermit`, `createInstallation` | the row exists but the lead stage never advanced |

**Done for the top four.** `0006_atomic_writes.sql` adds
`create_lead_with_property`, `create_quote`, `revise_quote` and
`create_contract`, each one `plpgsql` function so Postgres rolls the whole thing
back. All are `SECURITY INVOKER` — every statement inside is an ordinary
insert/update the existing policies already govern, so there is no permission
logic duplicated. `create_contract` catches the `lead_id` unique violation and
re-raises it as a readable message.

**Deliberately not done:** `scheduleSurvey`, `createPermit` and
`createInstallation` are still insert-then-advance-stage. Their failure mode is
"the row exists but the lead did not move", which is visible on the lead page
and fixable from the stage dropdown — versus four more functions to write and
keep in sync against a schema I cannot exercise locally. Worth revisiting if it
turns out to happen in practice.

### 6. `createLead`'s rollback cannot run for the office role — FIXED

When the property insert fails, `createLead` deletes the orphaned lead. But
`leads_delete` allows `admin` or the owning `sales` rep — **not `office`**. An
office user hitting a failed property insert leaves a permanent address-less
lead behind, and the delete failure is discarded without logging.

**Done** by #5 — `create_lead_with_property` makes both inserts in one
transaction, so there is no rollback to perform and no `leads_delete` grant
needed. The function also decides the sales-rep assignment, which removed the
client's round trip to read its own role.

### 7. Deleting anything orphans its files in Storage — FIXED for the app's own paths

`removeFiles` is exported from `storage.ts` and never called. Deleting a permit
or contract drops the row and leaves the PDF in the `documents` bucket; deleting
a lead cascades every child row and strands all of its survey photos and
installation photos in `photos`. Nothing ever reclaims them, and they stay
readable to any member who can guess a path.

**Done.** `deleteLead` now collects every survey photo, installation photo,
contract document and permit document belonging to the lead *before* issuing the
delete — once the rows cascade, nothing points at the files any more — and
removes them after. `deletePermit` drops its attachment with the row, and both
`attachPermitDocument` and `attachContractDocument` delete the object they
replace instead of leaving it behind. Cleanup is best-effort: the row is already
gone, so a storage hiccup must not surface as a failed delete.

**Still open:** deletes performed outside the app (SQL editor, a future admin
tool) still strand files, because the cleanup lives in the client rather than in
a trigger. The durable version is a `before delete` trigger writing paths to a
queue table, drained by a scheduled Edge Function — worth doing if bucket cost
ever shows up, or if deletes start happening outside the UI.

### 8. Failed survey completion strands uploaded photos — FIXED

`completeSurvey` uploaded to Storage *before* updating the row, so a denied or
failed update left files in the bucket with nothing referencing them.

**Done** alongside P0 #3: both `completeSurvey` and `addCompletionPhotos` now
call `removeFiles` on the uploads if the row write fails. Note this only covers
the failure path — the wider "nothing ever reclaims deleted files" problem in
#7 is still open.

### 9. Concurrent quote creation collides — FIXED

`next_quote_version()` is `STABLE`, so two reps creating a quote for the same
lead in the same moment both read the same version and the second insert trips
the `unique (lead_id, version)` constraint. It surfaces as "That record already
exists", which does not describe what happened.

**Done** by #5. `create_quote` and `revise_quote` both take
`pg_advisory_xact_lock(hashtextextended(lead_id::text, 0))` before reading
`max(version)`, so quote creation is serialised per lead and two reps get v1 and
v2. An advisory lock rather than `SELECT … FOR UPDATE` on the lead, so the
function does not need UPDATE rights on a row it is only reading.
`next_quote_version()` is dropped as superseded.

---

## P2 — Scale ✅ done

### 10. Nothing is paginated — FIXED

`listLeads`, `listEnrichedLeads`, and all four report queries select every
matching row with no `.limit()` or `.range()`. The leads table and pipeline board
render the entire dataset. Worth confirming your project's PostgREST
`max-rows` setting too — if one is configured, these queries will *silently
truncate* rather than error, which would make the reports quietly wrong.

**Done.** Every list query is explicitly bounded now. `listEnrichedLeads` takes
a `limit` (default `LEAD_LIST_LIMIT`, 500) and asks for `{ count: "exact" }`,
returning `{ leads, total, truncated }` — so the leads page can say "Showing 500
of 1,240 — narrow with search or filters" and the pipeline board "showing the
500 most recent of 1,240" instead of presenting a short list as complete. That
is what makes a `max-rows` truncation visible rather than silent.

The dashboards stopped fetching leads to count them at all: both now derive
their stat cards from `usePipelineSummary()` (see #11) and fetch only the six
rows they actually display.

**Not done:** there is still no page-by-page navigation, so lead 501 is only
reachable through search or a filter. A real paginated table is the follow-up;
this change is about removing the silent wrongness, not about browsing depth.

### 11. Reports aggregate in the browser — FIXED

`reports.ts` pulled every lead, permit, quote and installation over the wire to
count them.

**Done.** `0007_report_functions.sql` adds four `SECURITY INVOKER` functions —
`report_pipeline_summary`, `report_permits_summary`, `report_revenue_summary`,
`report_installations_summary` — each one aggregate query returning a single
jsonb object shaped exactly like what the components already consume, so
`reports.ts` became four thin RPC calls.

Invoker rights matter here: RLS still scopes `leads`, so a sales rep calling
`report_pipeline_summary()` gets their own pipeline and an admin gets the whole
business, which is the same behaviour as the client-side version — now enforced
in one place instead of by whatever rows happened to come back.

The permits report keeps a LEFT JOIN to `leads` on purpose: permits are visible
to every member but the lead behind one may not be, and the row should still be
counted (with "Unknown" as the customer) rather than dropped.

### 12. Realtime invalidation is broad and double-fires — FIXED

Every mutation invalidates via `onSuccess`, then the Realtime event for the same
write invalidates again — two refetches per action for the user who made it.
And because the handler invalidates the whole domain prefix, one lead edit
refetches every mounted lead query for every connected user.

**Done**, by making the Realtime side cheap rather than by removing the
`onSuccess` invalidation. Dropping the latter was tempting but wrong: it would
make every mutation's visible result depend on the Realtime socket being
connected, so a dropped connection would look like "the save did nothing".

`realtime.ts` now does two things instead. It **coalesces** — one user action
can touch several tables (a contract insert also writes the quote, the lead and
an activity row), so keys are collected and flushed once every 250 ms. And it
**targets** — the payload carries the changed row, so a change to one lead
invalidates that lead's detail cache rather than every lead detail anyone has
open. Where the row's `lead_id` cannot be recovered it falls back to the old
domain-wide invalidation, so correctness never depends on the payload shape.

### 13. Signed URLs are minted one request per row — FIXED

`listPermitsForLead` calls `signedUrl` inside a `Promise.all` — one HTTP request
per permit. `listSurveysForLead` does one batch call per survey.

**Done.** A new `signedUrlMap(bucket, paths)` in `storage.ts` signs every path in
one request and returns them keyed by path. `listSurveysForLead` and
`listPermitsForLead` collect paths across the whole list, call it once, then look
each row's URLs back up. Paths that fail to sign are simply absent from the map,
so a deleted object renders as missing rather than as a broken link.

### 13b. The whole app ships as one 976 kB chunk — FIXED

A clean build is a single `index-*.js` of 976 kB (270 kB gzipped) across 2208
modules, with no code splitting. `vite.config.ts` sets
`chunkSizeWarningLimit: 1000`, which sits just above the current size and so
suppresses the warning that would otherwise be flagging this.

**Done.** Routes are `React.lazy` in `App.tsx` behind a `<Suspense>`, with the
landing page, app shell and dashboard kept in the entry chunk since that is what
a signed-in user sees first. The entry bundle went **975 kB → 419 kB**
(gzip 270 → 128 kB), with the lead detail, reports, team and pipeline trees and
their form/validation dependencies now loading on navigation.

`chunkSizeWarningLimit` is removed from `vite.config.ts`, so Vite's default
500 kB warning is live again — the raised limit was sitting just above the
actual size and suppressing the one signal that would have caught this.

Still open: **`motion` is a direct dependency that nothing in `src` imports.**
Confirm with `pnpm why motion` before removing, since something may pull it in
transitively.

### 14. `replica identity full` on every table — KEPT, deliberately

0004 sets it on all ten tables so the client can see `old` values. My original
read was that only `leads` needed it and the rest were paying WAL for nothing.

Fixing #12 changed that. Targeted invalidation needs the changed row's
`lead_id`, and on a DELETE only `old` is populated — with the default replica
identity that would be the primary key alone, so every delete would fall back to
invalidating a whole domain. It is now load-bearing for all ten.

The fallback is implemented either way, so this is a precision-vs-WAL trade
rather than a correctness one: if WAL volume ever becomes a problem, dropping
back to `default` on the low-traffic tables costs only invalidation precision on
deletes, which are rare here.

---

## P3 — UX and polish

- **Search results look unassigned.** `useLeadSearch` returns bare `Lead` rows
  cast to `EnrichedLead`, so `assignedRepName` and `property` are `undefined`
  and the table renders "Unassigned" and "—" for leads that do have both. Either
  give `searchLeads` the same embedded select as `listEnrichedLeads`, or hide
  those columns while searching.
- **No route-level role guards.** Nav items are filtered by role, but typing
  `/team` or `/reports` renders the page for any signed-in user. RLS keeps the
  data safe and the Team page hides its role selects for non-admins, so it
  degrades rather than leaks — but the route should redirect.
- **Missing env vars produce a white screen.** `client.ts` throws at module
  load, which kills the render with only a console message. Render a readable
  "configuration missing" screen instead.
- **The pipeline board is pointer-only.** `draggable` + `onDragStart` with no
  keyboard equivalent, so stage changes are unreachable without a mouse. The
  lead detail page's stage dropdown is the workaround; the board needs a
  per-card menu.
- **Search strips `%` and `_`** while sanitising the ilike pattern, so searching
  for a literal `50%` matches `50`.

## P4 — Engineering

- **There are no tests.** `convex-test` went away with the backend and nothing
  replaced it; `vitest run` reports "No test files found". The query layer's
  row→document mappers are pure functions and the cheapest possible thing to
  cover — start there, then the RLS policies via a seeded test project.
- **`Id<T>` is `string`.** Deliberate, to keep the migration's diff small, but it
  means nothing stops a `Id<"users">` being passed where a `Id<"leads">` is
  expected. Worth revisiting as a branded type once the churn has settled.
- **Cross-rep visibility is wider than lead visibility.** Leads are scoped to the
  owning sales rep, but `quotes`, `surveys`, `contracts`, `permits`,
  `installations` and `service_tickets` are all `using (public.is_member())` —
  any member can read every quote and contract in the business, including for
  leads they cannot see. This matches the old Convex behaviour (those handlers
  had no ownership check either) and the migration plan's own table, so it is a
  deliberate carry-over rather than a regression — but it is worth an explicit
  decision now rather than by inheritance. `public.can_see_lead(lead_id)` is
  already written and would scope them consistently.
- **Deleting a lead erases its audit trail.** `activity_log` has no DELETE policy,
  but `ON DELETE CASCADE` is performed by the system and bypasses RLS. Since a
  sales rep can delete their own leads, they can erase the record of what they
  did to them. If the audit trail is meant to be authoritative, change the FK to
  `ON DELETE SET NULL` and keep the rows.
- **Unused exports** — `useAllTickets`, `useUpdateUserStatus`, `useDeleteUser`,
  `useUpdateOwnProfile`, `useUpdateContractNotes` and `removeFiles` have no
  callers. Each is either a missing feature (deactivating a user, editing
  contract notes, a global service-ticket queue) or dead code. Decide per item.

---

## Suggested order

1. ~~**#1**, **#4** — the RLS hole and the account states.~~ Done.
2. ~~**#2**, **#3** — the two user-visible broken flows.~~ Done (#8 fell out of #3).
3. ~~**#5–#7**, **#9** — the multi-step writes.~~ Done, except the three
   lower-risk insert-then-advance flows noted under #5 and the out-of-app
   storage cleanup noted under #7.
4. ~~**#10–#14** — scale.~~ Done, except real page-by-page navigation (#10) and
   the unused `motion` dependency (#13b).
5. **P3** in whatever order the complaints arrive.
6. **Tests** — the mappers now, policies before the next schema change.

## Applying 0005, 0006 and 0007

None of the three has been run — the connector here cannot reach the Lampara CRM
project. Paste them into the SQL editor in order, after 0001–0004. All are
idempotent, so re-running is safe, with one caveat noted at the bottom of 0006:
it drops `next_quote_version`, which 0002 grants EXECUTE on, so replay 0002
before 0006 rather than after.

**Nothing in the P0/P1/P2 client changes works until they are applied** — the
RPCs they call will 404, which means the dashboards and the reports page will
error rather than degrade.

Worth spot-checking afterwards, since none of this could be exercised locally:

- sign in as a surveyor, complete a survey, confirm the lead moves to
  `survey_completed` and that the surveyor cannot change the lead's name
- as an installer, tick two checklist items from two browsers and confirm
  neither tick disappears
- request a password reset and confirm the link lands on the new-password
  screen rather than the dashboard
- deactivate a user (`update public.users set is_active = false` — there is
  still no UI, see P4) and confirm they get the deactivated screen
- create a lead and confirm both the lead and its property exist, then create
  two quotes on it and confirm they come out v1 and v2
- create a contract, then try to create a second one on the same lead and
  confirm the message reads "A contract already exists for this lead"
- delete a lead that has survey photos and a permit document, then check the
  `photos` and `documents` buckets no longer hold them
- open the Reports page and confirm every card populates — all four now come
  from RPCs, so a missing 0007 shows up here first
- sign in as a sales rep and confirm the dashboard's numbers cover only their
  own leads, and as an admin that they cover the whole business
- open the same lead in two browsers and confirm an edit in one appears in the
  other within a second or so (Realtime, now coalesced)
