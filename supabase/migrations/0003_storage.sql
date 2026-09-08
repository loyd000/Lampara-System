-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — Storage buckets
--
-- Replaces Convex `_storage`. Both buckets are PRIVATE: nothing is reachable by
-- URL alone, and the app hands out short-lived signed URLs (see
-- src/lib/supabase/storage.ts). Object paths are stored on the owning row.
--
--   photos/     surveys/<surveyId>/…        installations/<installationId>/…
--   documents/  contracts/<contractId>/…    permits/<permitId>/…
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'photos', 'photos', false, 15728640,  -- 15 MB
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'documents', 'documents', false, 26214400,  -- 25 MB
    array[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg', 'image/png'
    ]
)
on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

-- ─── Object policies ──────────────────────────────────────────────────────
-- SELECT is what gates `createSignedUrl`, so read access is the same for every
-- active member; write access follows the role that owns each workflow.

drop policy if exists lampara_files_select on storage.objects;
create policy lampara_files_select on storage.objects
    for select to authenticated
    using (bucket_id in ('photos', 'documents') and public.is_member());

drop policy if exists lampara_photos_insert on storage.objects;
create policy lampara_photos_insert on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'photos'
        and case (storage.foldername(name))[1]
                when 'surveys'       then public.has_role('admin', 'office', 'sales', 'surveyor')
                when 'installations' then public.has_role('admin', 'office', 'installer')
                else false
            end
    );

drop policy if exists lampara_documents_insert on storage.objects;
create policy lampara_documents_insert on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'documents'
        and case (storage.foldername(name))[1]
                when 'contracts' then public.has_role('admin', 'office', 'sales')
                when 'permits'   then public.has_role('admin', 'office', 'sales')
                else false
            end
    );

-- Replacing or removing an uploaded file is an admin/office action; field staff
-- add files but do not clean them up.
drop policy if exists lampara_files_update on storage.objects;
create policy lampara_files_update on storage.objects
    for update to authenticated
    using (bucket_id in ('photos', 'documents') and (owner = auth.uid() or public.has_role('admin', 'office')))
    with check (bucket_id in ('photos', 'documents'));

drop policy if exists lampara_files_delete on storage.objects;
create policy lampara_files_delete on storage.objects
    for delete to authenticated
    using (bucket_id in ('photos', 'documents') and (owner = auth.uid() or public.has_role('admin', 'office')));
