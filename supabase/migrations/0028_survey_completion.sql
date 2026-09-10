-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — give an inspection a way to be finished
--
-- `0012` collapsed the submit/approve handoff ("printing is the completion
-- step") and narrowed `surveys.status` to ('scheduled','cancelled'). What it
-- did not do is leave anything behind that marks an inspection *done* —
-- nothing has written `completed_at` since.
--
-- The field dashboard never caught up. It still computes
-- `done: status === 'approved'`, a value the CHECK constraint forbids, so for
-- a technician an inspection can never be completed: once its scheduled date
-- passes it sits in Overdue permanently, "Done (30d)" never counts one, and
-- "Recently Completed" stays empty. Latent only because `surveys` is empty
-- today; it starts accumulating with the first real inspection.
--
-- Completion is now an explicit act — the technician says when the visit is
-- done — recorded as `completed_at`. Status stays ('scheduled','cancelled');
-- this deliberately does not resurrect the workflow 0012 removed.
--
-- `reopen_survey_report` is rewritten rather than kept: its old body required
-- status in ('submitted','approved'), so every call raised. Nothing in the
-- client ever called it.
--
-- Both are gated on `can_edit_survey` (0013) — admin staff, or the assigned
-- technician — so the person who did the visit can record it, and undo a
-- mistap without needing an admin.
--
-- Apply after 0027. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- Same signature, entirely different meaning: drop rather than replace, so a
-- stale cached plan cannot survive the change.
drop function if exists public.reopen_survey_report(uuid);

create or replace function public.complete_survey_report(p_survey_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.can_edit_survey(p_survey_id) then
        raise exception 'Not allowed to complete this inspection' using errcode = '42501';
    end if;

    -- `coalesce` so completing twice keeps the original timestamp: the first
    -- answer to "when was this done" is the true one.
    update public.surveys
       set completed_at = coalesce(completed_at, now())
     where id = p_survey_id;

    if not found then
        raise exception 'Inspection not found' using errcode = 'P0002';
    end if;
end;
$$;

create or replace function public.reopen_survey_report(p_survey_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.can_edit_survey(p_survey_id) then
        raise exception 'Not allowed to reopen this inspection' using errcode = '42501';
    end if;

    update public.surveys set completed_at = null where id = p_survey_id;

    if not found then
        raise exception 'Inspection not found' using errcode = 'P0002';
    end if;
end;
$$;

grant execute on function public.complete_survey_report(uuid) to authenticated;
grant execute on function public.reopen_survey_report(uuid)   to authenticated;
