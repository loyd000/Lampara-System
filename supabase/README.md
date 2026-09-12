# Supabase setup — Lampara CRM

Everything the app needs lives in `migrations/`. Apply them **in order**, once,
against the Lampara CRM project.

## 1. Run the migrations

Easiest path — the SQL editor in the Supabase dashboard. Paste and run each file
top to bottom:

| File | What it creates |
|------|-----------------|
| `0001_initial_schema.sql` | 10 tables, indexes, `updated_at` triggers, the signup trigger that mirrors `auth.users` into `public.users`, and the `log_lead_activity` / `next_quote_version` helpers |
| `0002_rls.sql` | Role helper functions and the Row Level Security policies that replace the old Convex `requireRole()` guards |
| `0003_storage.sql` | The private `photos` and `documents` buckets plus their object policies |
| `0004_realtime.sql` | Publishes the tables so the app receives live updates |
| `0005_p0_fixes.sql` | Atomic stage and field-operation fixes |
| `0006_atomic_writes.sql` | Atomic lead, quote, revision and contract writes |
| `0007_report_functions.sql` | RLS-scoped aggregate report RPCs |
| `0008_field_role.sql` | Merged field role and field workflow policies |
| `0009_ocular_report.sql` | Full ocular report fields, photos and sign-off workflow |
| `0010_recommended_vehicle.sql` | Recommended vehicle report field |
| `0011_workflow_authorization.sql` | Approval authorization and quote/contract integrity hardening |
| `0012_shared_report_editing.sql` | Shared editable ocular reports without an approval handoff |
| `0013_roles_and_approval.sql` | Three roles (`superadmin`/`admin`/`field`), account approval, the `cancelled` lead stage |
| `0014_lead_notes_and_files.sql` | `lead_notes`, `lead_files`, a 10 MB per-file bucket limit and the `leads/` storage prefix |
| `0015_packages.sql` | `packages`/`package_items` — saved solar system bundles a quote can be built from |
| `0016_quote_items.sql` | `quote_items`, `total_php`/`quotation_no`/`prepared_by_id` on quotes, simplified `in_progress`/`approved` status |
| `0017_package_items_name.sql` | `package_items.name`, relaxed description constraint, fixes an overloaded `advance_lead_stage` ambiguity |
| `0018_contracts.sql` | Contract DOCX snapshot fields (`homeowner_name`, `price_php`, etc.) and `update_contract_details` |
| `0019_bugfixes.sql` | Role-check fixes left over from the 0013 role collapse |
| `0020_notifications.sql` | `notification_preferences`/`notification_log` for the `notify` Edge Function |
| `0021_seed_packages.sql` | Seeds the five standard hybrid packages |
| `0022_property_type_industrial.sql` | Replaces property type `agricultural` with `industrial` |
| `0023_package_design_type.sql` | `packages.design_type` (Hybrid/Off-Grid/Grid-Tie) |
| `0024_ph_address_fields.sql` | Granular Philippine address fields (barangay, city/municipality, province, etc.) on properties |
| `0025_drop_lead_source.sql` | Drops the unused "how did this lead find us" field |
| `0026_search_indexes.sql` | Reworks the lead search trigram index to actually get used, and to search more fields |
| `0027_report_guards_and_revenue_fix.sql` | Restricts report RPCs to admins; fixes revenue reading the wrong price column/status |
| `0028_survey_completion.sql` | `complete_survey_report`/`reopen_survey_report` — a way to mark an inspection done |
| `0029_drop_orphans.sql` | Removes functions/columns left behind by superseded workflows |
| `0030_drop_permits.sql` | Removes permit tracking entirely (table, storage, reports, pipeline stage) |
| `0031_auto_stage_advance.sql` | Lead stage now advances automatically and forward-only from the work itself, not hand-nudged |
| `0032_installation_date_range.sql` | `installations.scheduled_end_date` — a job runs over a date range, not one day |
| `0033_atomic_save_quote.sql` | `save_quote` RPC — header + line items replace atomically instead of update/delete/insert |
| `0034_atomic_mark_contract_signed.sql` | `mark_contract_signed` RPC — signing, stage-advance and the activity log in one transaction |
| `0035_atomic_quote_versioning.sql` | `create_quote_version` RPC — version allocation + insert (+ optional item clone) atomically |
| `0036_installation_column_guard.sql` | Column/status-transition guard trigger on `installations`, auto-advances the lead on completion |

With the CLI instead:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

## 2. Configure Auth

**Authentication → Providers**

- **Email** — enable. Leave "Confirm email" on for production; turning it off
  makes local testing quicker (sign-up returns a session immediately).
- **Google** — enable, then paste the Client ID and Client Secret from a Google
  Cloud OAuth 2.0 Web client. In Google Cloud, the **Authorised redirect URI**
  must be the callback Supabase shows on that page:
  `https://<project-ref>.supabase.co/auth/v1/callback`.

**Authentication → URL Configuration**

- Site URL: `http://localhost:5173` in development, your deployed origin in
  production.
- Redirect URLs: add `http://localhost:5173/auth/callback` and
  `https://<your-domain>/auth/callback`.

## 3. Point the app at the project

```bash
cp .env.example .env.local
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from
**Project Settings → API**. Never put the `service_role` key in a `VITE_`
variable — it bypasses RLS and would ship in the browser bundle.

## 4. Create the first account

The `handle_new_auth_user` trigger gives the **first** account to sign up the
`admin` role and everyone after it `sales`. So sign up yourself first, then
invite the team — you can change anyone's role from the Team page afterwards.

---

## How the pieces map to the old Convex backend

| Convex | Supabase |
|--------|----------|
| `ctx.auth.getUserIdentity()` | `auth.uid()` — `public.users.id` **is** the `auth.users.id` |
| `requireRole(ctx, [...])` | `public.has_role('admin', ...)` inside RLS policies |
| `users.updateCurrentUser` mutation | `on_auth_user_created` trigger |
| `ctx.storage.generateUploadUrl()` | `supabase.storage.from(bucket).upload(path, file)` |
| `ctx.storage.getUrl(id)` | `createSignedUrl(path, 3600)` — buckets are private |
| Transactional mutations | `log_lead_activity()`, plus targeted `.eq()` guards on stage transitions |
| Automatic query subscriptions | Realtime → React Query invalidation (`src/lib/supabase/realtime.ts`) |

## Regenerating types

`src/lib/supabase/database.types.ts` is hand-maintained to match these
migrations. After any schema change, regenerate rather than editing it:

```bash
npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
```

The camelCase document types the UI works with live in
`src/lib/supabase/types.ts` and are mapped from the generated row types by the
`to*` functions there.

## Things worth knowing

- **The audit trail is client-written.** With no server in the loop, the browser
  inserts `activity_log` rows. The `activity_log_insert` policy pins `user_id`
  to `auth.uid()` and there is no UPDATE or DELETE policy, so entries are
  append-only and correctly attributed — but a determined user could add an
  entry with arbitrary `action` text. If that matters, move `log_lead_activity`
  behind an Edge Function.
- **Reports aggregate in the browser** over the rows RLS lets the caller see.
  That is fine for a few thousand leads; past that, move each summary in
  `src/lib/supabase/queries/reports.ts` into a SQL view or RPC.
- **Deleting a user** removes their `public.users` row only — the `auth.users`
  record needs the service role. Without a profile row `auth_role()` returns
  null, so every policy denies them. Deactivating (`is_active = false`) is the
  gentler option and has the same effect on access.
