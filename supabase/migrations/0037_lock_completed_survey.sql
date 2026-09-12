-- A completed ocular report was still fully editable: 0028 tracks completion
-- via `completed_at`, but `surveys_update`'s RLS policy (0013) only ever
-- checked `status`/role/assignment, never `completed_at`. Status stays
-- 'scheduled' even after completion (0028's own design), so nothing in the
-- database actually locked the row once a technician marked it done — only
-- the client's own `editable` flag did, and that never checked completed_at
-- either (fixed separately in OcularInspectionTab.tsx).
--
-- complete_survey_report / reopen_survey_report (0028) are SECURITY DEFINER,
-- so they bypass this policy for their own writes — they stay the only way
-- to flip completed_at, regardless of this lock.

drop policy if exists surveys_update on public.surveys;
create policy surveys_update on public.surveys
    for update to authenticated
    using (
        completed_at is null
        and (
            public.can_edit_survey(id)
            or (public.has_role('superadmin', 'admin') and status = 'scheduled')
        )
    )
    with check (
        status = 'scheduled'
        or (status = 'cancelled' and public.has_role('superadmin', 'admin'))
    );

-- Photos go through guard_survey_photo_write (0011), not the RLS policy
-- above, so the same completed_at gap has to be closed there too — same
-- message it already raises for a cancelled/not-yet-assigned report, since
-- from a technician's point of view it's the same instruction either way.
create or replace function public.guard_survey_photo_write()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
    v_survey_id    uuid;
    v_completed_at timestamptz;
begin
    if tg_op = 'DELETE' then v_survey_id := old.survey_id;
    else v_survey_id := new.survey_id; end if;
    select completed_at into v_completed_at from public.surveys where id = v_survey_id for update;
    -- Parent deletion cascades here after the parent has disappeared. The
    -- parent's DELETE policy already authorizes the operation.
    if not found and tg_op = 'DELETE' then return old; end if;
    if public.can_edit_survey(v_survey_id) is not true or v_completed_at is not null then
        raise exception 'Reopen this report before editing photos' using errcode = '42501';
    end if;
    if tg_op <> 'DELETE' then
        if split_part(new.path, '/', 1) <> 'surveys'
           or split_part(new.path, '/', 2) <> new.survey_id::text then
            raise exception 'Photo path must belong to this report' using errcode = '23514';
        end if;
        if tg_op = 'UPDATE' and new.survey_id is distinct from old.survey_id then
            raise exception 'Photos cannot be moved between reports' using errcode = '42501';
        end if;
        return new;
    end if;
    return old;
end;
$$;
