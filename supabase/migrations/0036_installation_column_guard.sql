-- installations_update lets a crew member (any `field` user in
-- assigned_crew_ids) UPDATE the whole row, not just the status they're meant
-- to be working — RLS can't express a column-level restriction. In practice
-- that means a crew member's client could PATCH `status`/`completed_at`
-- directly via REST, bypassing updateInstallationStatus (the only path that
-- also advances the lead's stage) and leaving the two disagreeing, or add
-- arbitrary other user ids into `assigned_crew_ids`.
--
-- Same shape as guard_survey_write() (0011): RLS still decides *which rows*
-- a crew member may touch, this trigger decides *which columns and status
-- transitions*, for everyone except a trusted database role or an
-- admin/superadmin (who already have the authority RLS granted them).
--
-- It also folds the lead-stage advance into the same statement, for every
-- caller, not just updateInstallationStatus — so *no* write path, present or
-- future, can leave a completed job behind a lead that never moved on.

create or replace function public.guard_installation_write()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
    if current_user not in ('postgres', 'service_role') and not public.has_role('superadmin', 'admin') then
        -- Identity and scheduling columns are reschedule_installation's job
        -- (canEdit-only in the UI). materials_checklist and
        -- completion_photo_paths are exempted here on purpose: they have
        -- their own SECURITY INVOKER RPCs (0005's toggle_checklist_item,
        -- add_checklist_item, append_completion_photos) that only ever touch
        -- exactly one of those two columns, and this trigger fires for those
        -- calls too.
        if row(new.id, new.lead_id, new.scheduled_date, new.scheduled_end_date,
               new.assigned_crew_ids, new.lead_installer_note, new.notes)
           is distinct from
           row(old.id, old.lead_id, old.scheduled_date, old.scheduled_end_date,
               old.assigned_crew_ids, old.lead_installer_note, old.notes) then
            raise exception 'Only the job status, checklist and photos can be changed here'
                using errcode = '42501';
        end if;

        -- Matches the transitions InstallationSection.tsx actually offers a
        -- crew member: Start, Mark Complete, Pause, Resume. Anything else
        -- (including reopening a completed job) is a scheduling decision.
        if new.status is distinct from old.status
           and not (old.status = 'scheduled' and new.status = 'in_progress')
           and not (old.status = 'in_progress' and new.status in ('completed', 'on_hold'))
           and not (old.status = 'on_hold' and new.status = 'in_progress') then
            raise exception 'That status change is not allowed' using errcode = '42501';
        end if;

        if new.completed_at is distinct from old.completed_at
           and not (new.status = 'completed' and old.completed_at is null) then
            raise exception 'completed_at is set automatically when status becomes completed'
                using errcode = '42501';
        end if;
    end if;

    -- Whatever wrote it — this trigger's caller, updateInstallationStatus, or
    -- a future path — a job reaching 'completed' always advances the lead's
    -- stage in the same statement, so the two can never disagree the way
    -- they could when this only ever happened as a separate client-side call.
    if new.status = 'completed' and old.status is distinct from 'completed' then
        perform public.advance_lead_stage(new.lead_id, 'installation_complete');
    end if;

    return new;
end;
$$;

drop trigger if exists installations_guard_write on public.installations;
create trigger installations_guard_write before update on public.installations
for each row execute function public.guard_installation_write();
