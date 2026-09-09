-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — lead notes and lead files (Overview tab)
--
-- Two things the Overview could not hold before:
--
--   · `lead_notes` — dated, attributed notes people choose to write. Distinct
--     from `activity_log`, which is the system's own record of what happened
--     and stays machine-written. A note is prose; a log line is a fact.
--   · `lead_files` — photos and documents attached to the lead itself.
--
-- **The Overview file list is a view over two sources, not a copy.** Ocular
-- report photos already live in `survey_photos`; the client reads
-- `lead_files ∪ survey_photos` and labels the latter with the report slot it
-- came from. Copying them instead would double every inspection photo against
-- a 1 GB quota.
--
-- Also here, because it belongs to the same release:
--   · both buckets drop to a 10 MB per-file limit (see the storage note below)
--   · `lampara_files_update` / `lampara_files_delete` still named the `office`
--     role that 0013 removed, which left `superadmin` unable to touch anyone
--     else's uploads — fixed alongside the new `leads/` prefix.
--
-- Apply after 0013. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. lead_notes ────────────────────────────────────────────────────────

create table if not exists public.lead_notes (
    id         uuid primary key default gen_random_uuid(),
    lead_id    uuid not null references public.leads (id) on delete cascade,
    -- Nulled rather than cascaded: losing the account should not erase what
    -- that person wrote about a customer.
    author_id  uuid references public.users (id) on delete set null,
    body       text not null check (btrim(body) <> ''),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Newest first for one lead is the only way this table is ever read.
create index if not exists lead_notes_lead_idx
    on public.lead_notes (lead_id, created_at desc);

drop trigger if exists lead_notes_set_updated_at on public.lead_notes;
create trigger lead_notes_set_updated_at
    before update on public.lead_notes
    for each row execute function public.set_updated_at();

-- An edit may change the body and nothing else. Without this, the `with check`
-- on the update policy would still let an author move their note to another
-- lead or backdate it — the policy proves *who* is writing, this proves *what*
-- they are allowed to change.
create or replace function public.lead_notes_freeze_provenance()
returns trigger
language plpgsql
as $$
begin
    new.id         := old.id;
    new.lead_id    := old.lead_id;
    new.author_id  := old.author_id;
    new.created_at := old.created_at;
    return new;
end;
$$;

drop trigger if exists lead_notes_freeze on public.lead_notes;
create trigger lead_notes_freeze
    before update on public.lead_notes
    for each row execute function public.lead_notes_freeze_provenance();

alter table public.lead_notes enable row level security;

drop policy if exists lead_notes_select on public.lead_notes;
create policy lead_notes_select on public.lead_notes
    for select to authenticated
    using (public.is_member());

-- Field technicians write notes too — a note from the crew on site is exactly
-- the kind of thing the office needs to read.
drop policy if exists lead_notes_insert on public.lead_notes;
create policy lead_notes_insert on public.lead_notes
    for insert to authenticated
    with check (
        public.has_role('superadmin', 'admin', 'field')
        and author_id = auth.uid()
    );

-- Your own note stays yours to correct, for as long as it exists. The
-- `updated_at` stamp is what tells a reader the text has changed since it was
-- posted; the UI shows it as "edited".
drop policy if exists lead_notes_update on public.lead_notes;
create policy lead_notes_update on public.lead_notes
    for update to authenticated
    using (author_id = auth.uid())
    with check (author_id = auth.uid());

drop policy if exists lead_notes_delete on public.lead_notes;
create policy lead_notes_delete on public.lead_notes
    for delete to authenticated
    using (author_id = auth.uid() or public.has_role('superadmin'));

-- ─── 2. lead_files ────────────────────────────────────────────────────────
-- `kind` picks the bucket as well as the icon: photo → `photos`,
-- document → `documents`. Both live under a `leads/<lead_id>/` prefix, which
-- is what the storage policies in §4 check.

create table if not exists public.lead_files (
    id          uuid primary key default gen_random_uuid(),
    lead_id     uuid not null references public.leads (id) on delete cascade,
    path        text not null,
    -- The name the uploader saw. `path` is uuid-prefixed and sanitised, so it
    -- is not something to show a person.
    name        text not null,
    mime        text not null,
    size_bytes  bigint not null check (size_bytes >= 0),
    kind        text not null check (kind in ('photo', 'document')),
    uploaded_by uuid references public.users (id) on delete set null,
    created_at  timestamptz not null default now()
);

create index if not exists lead_files_lead_idx
    on public.lead_files (lead_id, created_at desc);

-- One row per object, so a retried upload cannot list the same file twice.
create unique index if not exists lead_files_path_key
    on public.lead_files (path);

alter table public.lead_files enable row level security;

drop policy if exists lead_files_select on public.lead_files;
create policy lead_files_select on public.lead_files
    for select to authenticated
    using (public.is_member());

drop policy if exists lead_files_insert on public.lead_files;
create policy lead_files_insert on public.lead_files
    for insert to authenticated
    with check (
        public.has_role('superadmin', 'admin', 'field')
        and uploaded_by = auth.uid()
    );

-- No update policy: a file is replaced by deleting it and uploading again.
-- Renaming a row while the object keeps its old name would make `name` a lie.

drop policy if exists lead_files_delete on public.lead_files;
create policy lead_files_delete on public.lead_files
    for delete to authenticated
    using (uploaded_by = auth.uid() or public.has_role('superadmin', 'admin'));

-- ─── 3. Bucket limits ─────────────────────────────────────────────────────
-- 10 MB per file, enforced here because a client-side size check is only a
-- suggestion — anything holding an access token can call the storage API
-- directly.
--
-- This *lowers* both buckets (photos was 15 MB, documents 25 MB). Deliberate:
-- the free tier is 1 GB, photos are compressed in the browser to ~250 KB
-- before they ever reach the bucket (src/lib/image.ts), and a single 25 MB
-- permit scan is 2.5% of the whole quota. Objects already stored above the new
-- limit are unaffected; only new uploads are checked.

update storage.buckets
   set file_size_limit = 10485760  -- 10 MB
 where id in ('photos', 'documents');

-- Spreadsheets join the document types: quotations and load schedules arrive
-- as .xls/.xlsx often enough to be worth naming.
update storage.buckets
   set allowed_mime_types = array[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg', 'image/png', 'image/webp'
   ]
 where id = 'documents';

-- ─── 4. Storage policies ──────────────────────────────────────────────────
-- The new `leads/` prefix, plus the role names 0013 missed.

drop policy if exists lampara_photos_insert on storage.objects;
create policy lampara_photos_insert on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'photos'
        and case (storage.foldername(name))[1]
                when 'surveys'       then public.has_role('superadmin', 'admin', 'field')
                when 'installations' then public.has_role('superadmin', 'admin', 'field')
                when 'leads'         then public.has_role('superadmin', 'admin', 'field')
                else false
            end
    );

drop policy if exists lampara_documents_insert on storage.objects;
create policy lampara_documents_insert on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'documents'
        and case (storage.foldername(name))[1]
                when 'contracts' then public.has_role('superadmin', 'admin')
                when 'permits'   then public.has_role('superadmin', 'admin')
                -- Field staff attach documents to a lead (a signed waiver, a
                -- photographed bill) even though they never touch contracts.
                when 'leads'     then public.has_role('superadmin', 'admin', 'field')
                else false
            end
    );

-- 0003 wrote these as `has_role('admin', 'office')` and 0013 did not revisit
-- them, so after the role collapse a superadmin could not remove a file
-- someone else had uploaded — the top role with less access than the one
-- below it, which is exactly what 0013 set out to avoid.
drop policy if exists lampara_files_update on storage.objects;
create policy lampara_files_update on storage.objects
    for update to authenticated
    using (
        bucket_id in ('photos', 'documents')
        and (owner = auth.uid() or public.has_role('superadmin', 'admin'))
    )
    with check (bucket_id in ('photos', 'documents'));

drop policy if exists lampara_files_delete on storage.objects;
create policy lampara_files_delete on storage.objects
    for delete to authenticated
    using (
        bucket_id in ('photos', 'documents')
        and (owner = auth.uid() or public.has_role('superadmin', 'admin'))
    );

-- ─── 5. Realtime ──────────────────────────────────────────────────────────
do $$
declare
    t text;
begin
    foreach t in array array['lead_notes', 'lead_files']
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
--   select id, file_size_limit from storage.buckets
--    where id in ('photos', 'documents');
--     -- expect 10485760 for both
--
--   select tablename, policyname from pg_policies
--    where schemaname in ('public', 'storage')
--      and (qual ilike '%office%' or with_check ilike '%office%');
--     -- expect zero rows (0013's check, re-run now that storage is fixed)
--
--   select policyname from pg_policies
--    where schemaname = 'public' and tablename in ('lead_notes', 'lead_files');
--     -- expect 4 for lead_notes, 3 for lead_files (no update on files)
-- ═══════════════════════════════════════════════════════════════════════════
