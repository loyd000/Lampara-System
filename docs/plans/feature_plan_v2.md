# Lampara CRM — roles, statuses, files, packages, quotes, contracts

Plan for the second batch of work. Written against the tree at `14d5f55`, which
already carries `0011_workflow_authorization.sql` and
`0012_shared_report_editing.sql` — note that **0012 removed the ocular report's
submit/approve handoff**: reports are now `scheduled | cancelled`, shared
between admins and the assigned technician, and printing is the completion step.
Everything below assumes that model.

Migrations continue at **0013**.

---

## Decisions locked

| Question | Decision |
| --- | --- |
| Role set | **superadmin · admin · field** — `sales` and `office` both collapse into `admin` |
| Lead statuses | Three groups over the existing stage values, **installation stages kept** under In Progress |
| Overview files | Photos **and** documents, 10 MB per file |
| Contract format | **DOCX** — see §7 for the reasoning; the quote stays PDF |

---

## Sequencing

```
Phase 3  Roles + account approval + status groups   ← done
Phase 4  Overview notes + files (+ storage plan)    ← done
Phase 5  Packages page (superadmin)                 ← done
Phase 6  Quote builder + quote PDF                  ← done
Phase 7  Contract generation (DOCX)                 ← done
```

Phase 5 must precede 6. Phase 7 needs 6's approved-quote state. 4 is independent
of 5–7 and can be done in parallel by another pair of hands.

---

## 3. Roles, account approval, and status groups ✅ built

> **Status:** implemented as planned, plus a few things found along the way.
> `supabase/migrations/0013_roles_and_approval.sql` is written but **not
> applied** — nothing in this phase works until it and the two migrations
> already ahead of it (`0011`, `0012`, both from the prior "ocular fix" work)
> are applied in order. `deguzman.johnlloyd12@gmail.com` is promoted
> unconditionally by the migration, and a same-transaction safety net promotes
> the earliest-created user if that address hasn't signed up yet.
>
> Deviations from the plan below:
> - `can_write_survey_object`/`guard_survey_write` etc. from 0011 were already
>   superseded by 0012's simpler shared-editing model before this phase
>   started; 0013 rewrites roles on top of *that* baseline, not the one this
>   plan was written against.
> - `SalesDashboard.tsx` deleted outright — sales role absorbed by admin, and
>   the dashboard had nothing an admin's own view doesn't already cover.
> - Added a superadmin-gated Deactivate/Reactivate toggle on the Team roster.
>   The plan didn't call for it, but "approve accounts" with no way to later
>   revoke access is a one-way door — `useUpdateUserStatus` already existed
>   server-side with no UI wired to it.
> - `report_pipeline_summary()` (0007) and every client staleness check
>   (`Leads page`, lead detail, Pipeline, `AdminDashboard`'s Active count) got
>   `cancelled` added to their "not actionable" exclusion list — a cancelled
>   lead has nothing left to follow up on, but nothing previously said so.

### 3a. Three roles

`superadmin` is new; `sales` and `office` both become `admin`.

**`0013_roles_and_approval.sql`**

1. Drop `users_role_check`, backfill `update public.users set role = 'admin'
   where role in ('sales', 'office')`, re-add the check as
   `('superadmin', 'admin', 'field')`.
2. Promote exactly one account to `superadmin` — the plan can't choose it, so
   the migration ends with a commented `update … set role = 'superadmin' where
   email = '…'` for you to fill in. Without that step nobody can approve
   accounts.
3. Rewrite every policy that names `sales` or `office`. The audit is large —
   `0002_rls.sql` alone has 27 references — but mechanical: anywhere the set is
   `('admin','office')` or `('admin','sales','office')` it becomes
   `('superadmin','admin')`. **`superadmin` must be added everywhere `admin`
   appears**, or the top role ends up with less access than the one below it.
4. `can_see_lead` currently narrows `sales` to their own leads. With sales gone,
   that branch is dead — every non-field role sees the whole pipeline. Simplify
   it rather than leave a branch that can never fire.

**Client:** `ROLE_LABELS` → `{superadmin: "Superadmin", admin: "Admin", field:
"Technician"}`. `UserRole` union. Every `["admin","sales","office"]` array in
the UI — the lead page's `canEdit`, the assignee filters in the schedule
dialogs, the ticket dialog, the nav's `roles` lists — collapses to
`["superadmin","admin"]`.

Naming note: the DB value stays `field` (0008 established it and 0011/0012 build
on it); only the label becomes "Technician". Renaming the value would mean
touching every policy again for a word nobody sees.

### 3b. Account approval

Today `handle_new_auth_user` mirrors every new auth user into `public.users`
with `is_active = true` — anyone who can reach the sign-up screen is inside.

- Change the trigger's default to `is_active = false`, and to `role = 'field'`
  rather than `sales`. The **first** account still becomes an active
  `superadmin`, so a fresh database is not locked out of itself.
- `AccountGate` already handles a deactivated account; it needs a third state,
  *pending approval*, worded as waiting rather than as a refusal.
- Superadmin gets a **Pending accounts** section on the Team page: name, email,
  when they signed up, Approve / Decline, and a role picker on approval.
- `users_update_admin` becomes superadmin-only for `role` and `is_active`.
  Admins keep the roster read; they no longer grant access.

Because `auth_role()` returns null for an inactive user, every RLS policy
already denies them. Approval is a real gate, not a UI screen.

### 3c. Status groups

**Do not restructure the stage column.** The nine existing values map one-to-one
onto your substatuses; what's missing is the grouping and one new value.

```
New Lead      lead
In Progress   survey_scheduled → "Inspection Scheduled"
              survey_completed → "Inspection Done"
              proposal_sent
              contract_signed
              permitting
              installation_scheduled
              installation_complete
Completed     active_customer
              cancelled                ← new
```

- `0013` extends the stage check with `'cancelled'`.
- A `STAGE_GROUPS` constant in `constants.ts` maps group → stages, and
  `groupOf(stage)` gives the reverse. Nothing is stored twice, so a stage and
  its group can never disagree.
- **Leads page:** the stage filter becomes two-level — pick a group, or a
  specific substatus.
- **Pipeline board:** three swimlanes with the substatus columns nested, rather
  than nine equal columns. This also fixes the board's current problem of not
  fitting on a laptop.
- **Cancelled** needs a reason. Add `cancelled_reason text` and
  `cancelled_at timestamptz` to `leads`, and prompt for the reason when the
  stage is set — a cancelled lead with no explanation is a lead someone will
  reopen by accident.
- `advance_lead_stage` gains `cancelled` as a stage admins may set; field staff
  must not be able to cancel a lead.

---

## 4. Overview — notes and files ✅ built

> **Status:** implemented as planned.
> `supabase/migrations/0014_lead_notes_and_files.sql` is written but **not
> applied** — it lands after 0013, which is itself still pending. Nothing in
> this phase works until both are run, in order.
>
> Decisions taken where the plan asked:
> - **Notes are editable by their author, indefinitely** (open question 1).
>   `updated_at` drifting from `created_at` is what marks a note "edited", and
>   both writing and deleting a note leave a line in the activity log — so the
>   record of *that a note existed* survives even when its text does not.
> - **Storage levers 1, 5 and 6 shipped; 2 and 7 deferred.** Compression is the
>   one that matters; thumbnails and the storage meter can land later without
>   redoing any of this.
>
> Deviations from the plan below:
> - **The Activity tab's note composer is gone**, and `useAddNote` /
>   `leadsApi.addNote` with it. It wrote note text into `activity_log.details`,
>   which is precisely the thing 4a says notes must not be. Two composers
>   writing to two tables under the same word would have been a bug waiting to
>   be reported. Pre-existing "Note added" log rows keep their text and still
>   render; nothing new is written there.
> - **Compression applies to ocular report photos too**, not just Overview
>   uploads — it lives in `prepareUpload()` in `storage.ts`, so every path that
>   uploads an image gets it. The report is where the photo volume actually is.
> - **0014 fixes two things 0013 left behind.** `lampara_files_update` and
>   `lampara_files_delete` still named the `office` role, which meant a
>   superadmin could not touch anyone else's uploads — the exact inversion 0013
>   set out to prevent, missed because the storage policies live outside
>   `pg_policies`' public schema. Both now read `superadmin, admin`.
> - **`deleteLead` was leaking objects.** It collected `surveys.photo_paths` —
>   the *legacy* column — and never `survey_photos`, so every inspection photo
>   taken since 0009 outlived its lead in the bucket. Fixed alongside adding
>   `lead_files` to the same cleanup.
> - Both buckets drop from 15 MB / 25 MB to a **10 MB** per-file limit. This is
>   what the plan asked for, but it is worth saying out loud that it also
>   applies to contract and permit documents, not only Overview uploads.
> - Notes carry a 4,000-character cap. Past that it wants to be a document, and
>   an unbounded text column on a table read on every Overview render is a
>   payload problem nobody notices until it is one.

### 4a. Dated notes

`lead_notes (id, lead_id, author_id, body, created_at, updated_at)`.

Distinct from the existing `activity_log`, which is the system's own record of
what happened and must stay append-only and machine-written. Notes are what
people choose to write down.

- RLS: read for any member; insert for `superadmin`/`admin`/`field`; update and
  delete only your own note, and only within a short window — or never, if you
  would rather notes be a permanent record. **Say which you want.**
- UI: newest first on the Overview tab, each showing author, date and body. A
  composer at the top.

### 4b. Files

`lead_files (id, lead_id, path, name, mime, size_bytes, kind, uploaded_by,
created_at)` where `kind` is `photo | document`.

**The Overview file list is a view over two sources, not a copy.** Ocular report
photos already live in `survey_photos`; the Overview reads
`lead_files ∪ survey_photos` and labels the latter with the slot they came from.

This is the direct answer to "photos uploaded on the ocular report should also
appear in Overview" — and copying them instead would double every inspection
photo on a 1 GB quota. One object, two places it is listed.

Uploads: images and PDF/Word/Excel, 10 MB each, enforced in the storage policy
(`file_size_limit` on the bucket) as well as in the client — a client-side check
alone is a suggestion.

Downloads: a signed URL per file, as the report photos already use.

---

### 4c. Storage plan for the Supabase free tier

Check your dashboard for current limits; at time of writing the free tier is
**1 GB storage and 5 GB egress per month**. Egress is what you will hit first —
a page showing twenty photos to three staff members costs egress every time.

Seven levers, in order of how much they buy you:

**1. Compress in the browser before upload — 10–20× (the whole ballgame).**
A 12MP phone photo is 3–5 MB. Draw it to a canvas, cap the long edge at 1600px,
re-encode as WebP at quality 0.75 (JPEG fallback for older Safari) and it lands
at 200–350 KB with no visible loss at the sizes this app displays or prints.
Do it client-side: it costs no server time and makes uploads far faster for a
technician on mobile data at a site. **Nothing else on this list matters as
much.**

**2. Store a thumbnail alongside — the egress lever.**
A 320px thumb is ~15–25 KB. Galleries, the Overview list and the photo slots
render thumbs; the full image is fetched only when someone opens it or when a
PDF is built. A lead page with twenty photos drops from ~5 MB to ~400 KB.

**3. Never store generated PDFs.**
Quotes, contracts and ocular reports are regenerated from data on demand. Saving
every one of them is the fastest way to fill a gigabyte with files nobody opens
twice.

**4. Reference, don't duplicate** — as in 4b above.

**5. Cap counts, and cap sizes at the bucket.**
Per-slot limits already exist on the ocular report. Add a per-lead soft cap
(say 40 files) that warns rather than blocks, plus the 10 MB hard limit.

**6. Cache hard.**
Uploads currently set `cacheControl: 3600`. Object paths carry a UUID and are
never rewritten, so they are immutable — set a year. Repeat views then come from
the browser, not from your egress budget.

**7. Sweep orphans, and show the meter.**
Deleting a row already removes its objects in most paths; a periodic reconcile
catches the rest. Give superadmin a storage panel: total bytes per bucket,
largest leads, count of files with no owning row.

**What that buys you.** At ~250 KB per photo plus a ~20 KB thumb, 1 GB is
roughly **3,700 photos** — about 230 fully documented inspections at sixteen
photos each. Documents are the heavy tail: a hundred 2 MB permit scans is
200 MB on its own, so it is worth compressing PDFs on the way in too, or
accepting that documents will dominate the quota before photos do.

Without lever 1 the same gigabyte holds roughly **250 photos** — about fifteen
inspections. That is the difference between hitting the wall in month three and
in month thirty. If and when you outgrow it, Supabase Pro is $25/month for
100 GB, and none of the work above is wasted.

---

## 5. Packages (superadmin)

```
packages       (id, name, description, system_size_kw, base_price_php,
                is_active, sort_order, created_by, created_at, updated_at)
package_items  (id, package_id, description, qty, unit, unit_price_php, sort_order)
```

A package is a saved bundle — "6kWp Hybrid PV System" — with the line items it
expands into. Prices live on the items so a quote can be rebuilt if a component
price changes, with `base_price_php` as the headline figure the quote shows.

- New `/packages` route, superadmin only, in the nav behind the same role check.
- List, create, edit, archive. Archive rather than delete: a package referenced
  by an old quote must not vanish from the record.
- `is_active` controls whether it appears in the quote builder's picker.

---

## 6. Quote builder and quote PDF

### 6a. Schema

The current `quotes` table describes a single system inline — `panel_count`,
`panel_model`, `inverter_type`, `total_price_usd`. That cannot express an
itemised quote, and `total_price_usd` is misnamed for a peso business.

**`0014_quote_items.sql`**

- New `quote_items (id, quote_id, description, qty, unit, unit_price_php,
  line_total_php, source_package_id, sort_order)`.
- `quotes` gains `total_php numeric(12,2)`, `quotation_no text`,
  `prepared_by_id`, and `status` becomes `in_progress | approved`.
- Migrate existing rows: one quote item synthesised from the old inline fields,
  `total_php := total_price_usd`, `status` mapped (`draft`/`sent` →
  `in_progress`, `accepted` → `approved`, `rejected`/`superseded` →
  `in_progress` with a flag, or archived — **your call**).
- Keep the old columns for one release rather than dropping them, as 0009 did
  with `photo_paths`.

`quotation_no` follows the sample's `PV System Quotation-294`. There is already
a `src/lib/report-number.ts` in the tree from the other session — reuse its
sequence rather than inventing a second one.

### 6b. The builder

Modelled on the Ocular Inspection tab, which is the pattern you liked:

- The Quotes tab opens on a **list** of quotes for the lead, with **New quote**.
- Opening one turns the page into a form: customer block (read-only, from the
  lead), quotation number, date, then the item table.
- **Add item** opens a picker with two tabs: *Packages* (the active packages
  from Phase 5, which expand into their items) and *Custom* (a blank line for a
  panel, inverter or extra the package doesn't include).
- Items are editable inline — description, qty, unit, unit price — with the line
  total and grand total computed live.
- A sticky save bar, as the ocular form has.

**Status:** `In Progress` is editable; `Approved` is locked, and the item table,
totals and header all become read-only. An admin can move it back to In
Progress, which is the escape hatch — but that should write to the activity log,
because unlocking an approved quote is exactly the kind of thing someone will
need to explain later.

### 6c. The PDF

Same approach as the ocular report — `@react-pdf/renderer`, already installed,
lazy-loaded. From `Quotation Sample.docx`:

- Letterhead: company name, preparer, both addresses, phone, email, TIN.
- To / Quotation# / Date block.
- The itemised table: `# · DESCRIPTION · QTY · PRICE · TOTAL`, then GRAND TOTAL.
- The two pages of Terms & Conditions — long, but fixed text that never varies
  per quote, so it is written once.
- Payment instructions (BDO account block) and the authorised signature line.
- The sample ends with **"Proposed location of Inverter and Battery"** and
  **"Proposed location of Panels"**. Those are exactly the `inverter_battery`
  and `roof_panel_design` slots on the ocular report — the quote PDF can pull
  them straight from the lead's inspection, so the crew's photos end up in the
  customer's quote with nobody re-uploading anything.

---

## 7. Contract — and why DOCX ✅ built

> **Status:** implemented, but on top of a codebase that had moved past what
> this plan assumed. Phases 5 and 6 were already fully built (packages page,
> itemised quote builder, quote PDF) by the time this phase started, and a
> **manual-upload contract feature already existed** — `contracts` (from
> `0001_initial_schema.sql`) plus `ContractSection.tsx` /
> `CreateContractDialog.tsx`, wired to `create_contract()`. That flow handles
> sign / cancel / delete / attach-the-signed-file and is exercised from an
> approved quote exactly as this plan describes — so Phase 7 **extends it in
> place** with DOCX *generation*, rather than replacing it.
>
> `supabase/migrations/0018_contracts.sql` is written but **not applied** —
> apply it after `0017_package_items_name.sql`. `0017` was already
> consumed by an unrelated packages fix before this phase started, so the
> contracts migration is `0018`, not the `0017` the ledger below originally
> named.
>
> Deviations from the plan below:
> - **The template is hand-tokenised, not built from scratch.** The provided
>   `Contract Sample.docx` is a filled-in example, not a template — its
>   twelve values (homeowner name, site address, phone, system size, the
>   three equipment lines, price in figures, price in words, preparer name,
>   contract date) were byte-surgically replaced with `{docxtemplater}`
>   tokens directly in `word/document.xml`, since Word commonly splits a
>   single visible value across several XML runs and a naive find/replace on
>   the raw text corrupts the document. The result is
>   `public/Contract Template.docx`; `Contract Sample.docx` is left alone as
>   a reference. Verified by an actual `docxtemplater` render round-trip, not
>   just by eye.
> - **Price-in-words is not a stored column.** It's derived client-side from
>   `contracts.price_php` at generation time (`number-to-words.ts`), so it
>   can never drift out of sync with the number it's supposed to spell out —
>   the alternative (a stored, independently-editable `price_words`) is
>   exactly the kind of two-places-to-update bug 4a's notes/activity-log
>   split was written to avoid.
> - **The other nine fields *are* snapshotted onto `contracts`** at creation
>   time by `create_contract()` (homeowner name, site address, phone from the
>   lead/property; price and preparer from the quote; equipment lines
>   best-effort matched from `quote_items` by keyword — `%panel%`,
>   `%invert%`, `%batter%`), matching 0016's "snapshot so the document
>   doesn't silently change later" precedent for quote items. Staff can edit
>   the snapshot in a new **Contract Details** form on the Contract tab
>   before generating — auto-fill is a starting point, not a constraint —
>   via `update_contract_details()`.
> - **Generate is download-only, not auto-attached.** The DOCX button
>   produces an editable working document for the office to review, sign, or
>   turn into a PDF — exactly the "generated file is an internal working
>   document, not the thing you hand over" caveat below. The existing signed-
>   document upload dropzone is untouched; generating and attaching stay two
>   separate, deliberate steps.
> - **No tab-locking was added.** The empty-state CTA already in
>   `ContractSection.tsx` ("approve a quote, then Create Contract") already
>   satisfies "unlocks when approved" without introducing a disabled-tab
>   pattern the codebase has no other precedent for.

**Recommendation: generate the contract as a `.docx`, and keep the quote as a
PDF.** They are different documents with different jobs.

**Why DOCX suits the contract**

- `Contract Sample.docx` is about twelve pages of fixed legal text with roughly
  eight variables in it: homeowner name, site address, phone, system size, the
  three equipment lines, the price in figures and the price in words. They sit
  inline in flowing paragraphs — trivial to tokenise in Word. This is nothing
  like the ocular form, where 103 drawn shapes made the same approach
  impractical.
- The wording *will* change — payment split, warranty periods, timeline. In a
  Word file the office edits it directly. In code, every wording tweak is a
  developer and a deploy.
- Contracts get negotiated. A clause gets struck or added for one deal. An
  editable file is a feature here, not a risk.
- Cost is small: `docxtemplater` + `pizzip`, ~90 KB, and no image module —
  the contract has no photographs.

**Why the quote stays PDF**

- It is customer-facing and priced, and must not be editable in transit.
- Its item table is generated from data with a variable number of rows —
  the thing a code renderer does well and a Word template does badly.
- No new dependency; it extends what the ocular report already established.

**The obvious objection** — "a customer could edit the .docx" — is handled the
way it is handled today: export a PDF from Word, or print it, before it leaves
the office. The generated file is an internal working document, not the thing
you hand over.

**If you would rather have one pipeline**, the contract can be rebuilt in
`@react-pdf/renderer` like the ocular report. It costs a day of laying out
static legal text and means every future wording change comes through a
developer. I would not, but the option is real and reversible either way, since
both read from the same contract record.

**Trigger:** the Contract section unlocks when the lead has an `approved` quote.
It reads the customer from the lead, the system spec and price from that quote,
and the price-in-words is generated — nobody should be typing "THREE HUNDRED
SIXTY SIX THOUSAND FIVE HUNDRED PESOS ONLY" by hand.

---

## Migration ledger

| # | File | Phase |
| --- | --- | --- |
| 0013 | `0013_roles_and_approval.sql` — role collapse, superadmin, approval default, `cancelled` stage, cancel reason | 3 |
| 0014 | `0014_lead_notes_and_files.sql` — `lead_notes`, `lead_files`, bucket size limit | 4 |
| 0015 | `0015_packages.sql` — `packages`, `package_items` | 5 |
| 0016 | `0016_quote_items.sql` — `quote_items`, quote status, totals in PHP | 6 |
| 0017 | `0017_package_items_name.sql` — packages follow-up fix, unrelated to Phase 7 | 5 |
| 0018 | `0018_contracts.sql` — contract fields the template needs | 7 |

## New dependencies

| Package | Phase | Why |
| --- | --- | --- |
| `docxtemplater` + `pizzip` | 7 | Fill the contract template; ~90 KB, no image module needed |
| *(none)* | 3–6 | `@react-pdf/renderer` is installed; everything else is schema and UI |

## Open questions

1. ~~**Lead notes** — editable by their author, or permanent once written?~~
   **Answered:** editable by their author, with no time limit and an "edited"
   marker. Deletions are logged, so the audit trail does not depend on the note
   surviving.
2. **Existing quotes** — `rejected` and `superseded` rows have no home in the
   new two-status model. Archive them, or fold them into `in_progress`?
3. ~~**Superadmin account** — which email should 0013 promote?~~
   **Answered:** `deguzman.johnlloyd12@gmail.com`, promoted unconditionally by
   0013, with the earliest-created user as a fallback.
