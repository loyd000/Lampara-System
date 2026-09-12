# Project audit — 9 September 2026

Three subagents reviewed database/security, lead and ocular workflows, and auth/runtime behavior. The parent reviewed their findings, reporting/search behavior, and build checks. No application source or remote data was changed.

Validation: production build passed; lint failed with two react-hooks/set-state-in-effect errors at theme-toggle.tsx:30 and :107; Vitest exited successfully with **zero test files**. The ocular numeric parser was exercised directly. Other findings are verified by tracing source and the cumulative migration state; no authenticated browser flow or live database exploit was executed. Deployed schema parity is unverified.

P1 means high priority; P2 means normal priority.

## High-priority bugs

### 1. P1 — Deactivated accounts can reopen ocular reports

[supabase/migrations/0009_ocular_report.sql:314](<C:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara System/supabase/migrations/0009_ocular_report.sql:314>)

The SECURITY DEFINER reopen function rejects callers using IF NOT has_role(...). The helper returns SQL NULL for inactive or missing profiles, so the rejection branch is skipped. A deactivated account retaining a session and a known report ID can call the RPC and clear approval. The submit guard has the same nullable check; can_edit_survey also accepts assignment without requiring active membership.

Fix: use IS NOT TRUE for authorization guards, make role helpers return definite booleans, and require active membership for assignment-based permissions. Test inactive and missing-profile callers.

### 2. P1 — Field technicians can bypass office approval

[supabase/migrations/0008_field_role.sql:52](<C:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara System/supabase/migrations/0008_field_role.sql:52>)

The existing survey UPDATE policy lets an assigned technician update every column. Migration 0009 adds sign-off columns without restricting direct updates. The technician can set an approved status and another user's approval identity/timestamps, or modify already signed content. Photo writes also lack status restrictions. The field branch of advance_lead_stage still allows survey_completed directly.

Fix: enforce protected columns and allowed state transitions in the database, reserve approval for guarded operations, and restrict edits/photos after submission or approval. Hiding UI controls does not enforce these rules.

### 3. P1 — Submitting or approving loses unsaved report edits

[src/pages/leads/_components/ocular/OcularInspectionTab.tsx:396](<C:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara System/src/pages/leads/_components/ocular/OcularInspectionTab.tsx:396>); [src/pages/leads/_components/ocular/OcularReportForm.tsx:253](<C:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara System/src/pages/leads/_components/ocular/OcularReportForm.tsx:253>)

Enter findings and click Submit for approval before Save report. The status action sends only surveyId; it cannot access the separate form's dirty state. The subsequent status change resets the form from persisted data, discarding the edits. Office approval has the same issue.

Fix: validate and save dirty fields before transitioning, or block transitions until saved. Coordinate saving, submission, and approval so they cannot race.

### 4. P1 — Role changes retain previously privileged cached data

[src/lib/supabase/realtime.ts:131](<C:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara System/src/lib/supabase/realtime.ts:131>)

When an admin/office account becomes sales, the users event refreshes its profile and roster but leaves lead/report caches intact. Existing pages can continue displaying business-wide results even though subsequent database reads would be restricted. Auth cache clearing handles account changes/sign-out, not role changes; window-focus refetch is disabled.

Fix: detect current-profile authorization changes, cancel/remove protected cached queries, and fetch them again under the new permissions. Test a demotion with a leads/report page already open.

## Other confirmed bugs

### 5. P2 — Follow-up report approval moves a lead backwards

[supabase/migrations/0009_ocular_report.sql:302](<C:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara System/supabase/migrations/0009_ocular_report.sql:302>)

Approving an additional inspection for a lead already at proposal_sent, contract_signed, or active_customer calls advance_lead_stage without a source-stage restriction. The helper writes survey_completed regardless of the current stage, moving the lead backwards in pipeline displays and reports.

Fix: pass the allowed early source stages, or enforce monotonic advancement for this operation. Verify that approving a return visit preserves later commercial/installation stages.

### 6. P2 — Contracts can reference another customer's quote

[supabase/migrations/0006_atomic_writes.sql:196](<C:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara System/supabase/migrations/0006_atomic_writes.sql:196>)

create_contract loads a quote by ID and separately accepts a lead ID. Neither the function nor independent foreign keys require quote.lead_id to match the contract lead. An API caller can associate one customer's quote with another lead and mark that quote accepted.

Fix: validate the relationship in the RPC and enforce it with a database constraint or trigger so direct writes cannot bypass it. Check equivalent parent relationships for survey/property and ticket/installation records.

### 7. P2 — Formatted amounts silently become empty values

[src/pages/leads/_components/ocular/OcularReportForm.tsx:162](<C:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara System/src/pages/leads/_components/ocular/OcularReportForm.tsx:162>)

The bill input suggests 10,000, but Number("10,000") is invalid. The parser converts it to undefined and the save layer writes NULL, then shows Report saved. Direct parser execution confirmed this behavior. Other invalid nonblank numeric inputs are also silently cleared.

Fix: validate numeric input, explicitly support intended number formatting, and distinguish blank values from invalid values.

### 8. P2 — Clearing lead fields and unassigning a rep silently fails

[src/pages/_components/EditLeadDialog.tsx:107](<C:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara System/src/pages/_components/EditLeadDialog.tsx:107>); [src/lib/supabase/queries/leads.ts:328](<C:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara System/src/lib/supabase/queries/leads.ts:328>)

The dialog converts cleared email/referral/notes and the Unassigned selection into undefined. The update function treats undefined as leave unchanged. Existing values remain despite a successful save. Property notes have the same problem.

Fix: use explicit clearing values distinct from omitted fields, and exercise clear/save/reopen for every optional field. The lead detail route uses this dialog; a similarly named second dialog also exists.

### 9. P2 — Quote revision creates an uneditable duplicate

[src/pages/leads/_components/QuotesSection.tsx:68](<C:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara System/src/pages/leads/_components/QuotesSection.tsx:68>)

Revise clones the old quote's terms unchanged into a new draft, but draft controls only support sending/deleting. There is no editor or update API for revised pricing/specifications. A salesperson cannot apply the requested changes through the revision flow.

Fix: open the cloned draft in an editor, persist its revised terms, and allow sending after validation.

### 10. P2 — Query failures look like loading or successful empty results

[src/pages/reports/page.tsx:31](<C:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara System/src/pages/reports/page.tsx:31>); [src/pages/_components/FieldDashboard.tsx:93](<C:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara System/src/pages/_components/FieldDashboard.tsx:93>)

Reports, Team, and Field views use undefined data as loading state, so failed requests remain skeletons after retries end. Reports also blocks all cards if any one query has no data. Admin/Sales dashboards can show all-caught-up messages when a report failed.

Fix: distinguish pending/error/success states, provide retry actions, and render independently fetched cards independently. Never infer a successful empty result from missing data.

### 11. P2 — Corrected job addresses remain stale on the field dashboard

[src/lib/supabase/realtime.ts:79](<C:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara System/src/lib/supabase/realtime.ts:79>)

Personal inspection and installation queries embed lead names and property addresses. Lead/property events invalidate lead caches but not those job queries, so a technician with the dashboard open retains the old destination after office corrects it.

Fix: invalidate the dependent job queries on relevant lead/property changes, or normalize shared customer/property data.

### 12. P2 — Auth outages appear as unfinished account setup

[src/lib/supabase/queries/users.ts:15](<C:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara System/src/lib/supabase/queries/users.ts:15>)

getCurrentUser ignores getUser's error and returns null when Auth fails. With a persisted session, the account gate treats that successful null query result as a missing profile and displays account setup instead of an error.

Fix: propagate authentication errors to the existing retry/error screen. Reserve null for an actual absent session/profile.

### 13. P2 — Searching ignores visible filters and loses enrichment

[src/pages/leads/page.tsx:35](<C:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara System/src/pages/leads/page.tsx:35>)

Once a search term has two characters, the table switches to useLeadSearch results. That query receives neither stage nor source filters, although both controls remain selected. It also returns bare leads cast as enriched rows, losing assignment names and locations.

Fix: use one search/filter query with the same joined fields as the normal list, and include all filters in its query key.

## Engineering and usability improvements

- **Establish real regression coverage.** [vitest.config.ts:19](<C:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara System/vitest.config.ts:19>) allows zero-test success. Start with the permission and report-transition cases above, field-clearing behavior, parsing, and query failure states. Add database integration tests before changing authorization policies.
- **Restore a clean lint gate.** [src/components/theme-toggle.tsx:30](<C:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara System/src/components/theme-toggle.tsx:30>) and line 107 fail the current configured lint rule. Review the mount-only state pattern in this client-rendered app.
- **Reduce startup JavaScript.** The build emits an approximately 725 kB entry chunk (206 kB gzip). The PDF renderer is already split into a separate approximately 1.20 MB chunk (445 kB gzip); measure startup separately from download-time PDF costs.
- **Add real pagination.** The lead list is capped at 500 and search at 20. Truncation messaging helps, but users still cannot browse every match.
- **Handle Realtime recovery.** Subscribe with connection status handling and refresh data after reconnect to recover missed events.
- **Refresh setup documentation.** The Supabase README migration table stops at 0004 although the app requires migrations through 0010. Its report and transaction descriptions also describe older behavior.
- **Improve keyboard access.** Use links/buttons for clickable rows and job cards; provide a keyboard equivalent to pipeline drag actions.
- **Expose account deactivation controls.** The status mutation exists but Team exposes role changes only.
- **Decide cross-rep child-record visibility explicitly.** Several child-table policies allow all active members to read data for leads sales reps cannot see. Existing review notes describe this as deliberate inherited behavior, so it is a policy decision rather than a newly assumed requirement.

Suggested order: fix authorization and unsaved-edit loss first; then relationship/stage integrity, clearing/parsing, and error/cache behavior; then coverage, pagination, and performance.

