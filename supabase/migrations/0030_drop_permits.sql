-- Removes permit tracking. The company doesn't process permits through the
-- CRM, so the feature goes entirely: the table, its storage area, the report
-- function, the notification preference, and the `permitting` pipeline stage
-- that only existed to hand a lead to that tab.
--
-- Safe to run: at the time of writing `permits` held 1 test row, no lead was
-- in the `permitting` stage, and one orphaned document sat under
-- `documents/permits/`.

begin;

-- ── Storage ──────────────────────────────────────────────────────────────
-- MANUAL STEP: dropping the table leaves its uploads behind, and Postgres
-- refuses `delete from storage.objects` ("Direct deletion from storage tables
-- is not allowed"), so the one orphaned object has to go through the Storage
-- API — Dashboard -> Storage -> documents -> delete the `permits/` folder:
--
--   permits/3fbadf58-e2f3-4917-ad0d-f6868b5e297f/
--       7546bd32-5c47-4bde-a6a4-3568396029a4-IMG_8823.png
--
-- Leaving it costs a few hundred KB and nothing else: with the policy below
-- there is no longer any way to read or add to that prefix.

-- The insert policy routes by top-level folder. With no permits table there is
-- nothing legitimate to write under `permits/`, so the branch is removed
-- rather than left as an unreachable grant.
drop policy if exists lampara_documents_insert on storage.objects;

create policy lampara_documents_insert on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'documents'
        and case (storage.foldername(name))[1]
            when 'contracts' then public.has_role('superadmin', 'admin')
            when 'leads' then public.has_role('superadmin', 'admin', 'field')
            else false
        end
    );

-- ── The table ────────────────────────────────────────────────────────────
-- `cascade` here only reaches the table's own policies, indexes and
-- constraints; nothing else in the schema references permits.
drop table if exists public.permits cascade;

-- ── Reporting ────────────────────────────────────────────────────────────
drop function if exists public.report_permits_summary();

-- ── Notification preference ──────────────────────────────────────────────
-- The `permit_overdue` event can no longer fire, so the per-user toggle for it
-- is dead weight on every row.
alter table public.notification_preferences
    drop column if exists permit_overdue;

-- ── Pipeline stage ───────────────────────────────────────────────────────
-- Leads now run Contract Signed -> Install Scheduled. Any lead somehow left in
-- `permitting` is moved forward first, so the new constraint can be validated
-- without a rewrite failing on existing data.
update public.leads set stage = 'installation_scheduled' where stage = 'permitting';

alter table public.leads drop constraint if exists leads_stage_check;

alter table public.leads add constraint leads_stage_check check (
    stage = any (array[
        'lead',
        'survey_scheduled',
        'survey_completed',
        'proposal_sent',
        'contract_signed',
        'installation_scheduled',
        'installation_complete',
        'active_customer',
        'cancelled'
    ])
);

commit;
