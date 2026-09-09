-- Ocular reports are shared work documents. Admins schedule them, and admins
-- plus the assigned technician save the same form incrementally. There is no
-- submit/approve handoff; printing is the completion step.

update public.surveys
   set status = 'scheduled'
 where status in ('submitted', 'approved', 'completed');

alter table public.surveys drop constraint if exists surveys_status_check;
alter table public.surveys add constraint surveys_status_check
    check (status in ('scheduled', 'cancelled'));

drop trigger if exists surveys_guard_write on public.surveys;
drop trigger if exists survey_photos_guard_write on public.survey_photos;

create or replace function public.can_edit_survey(p_survey_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select public.is_member() and exists (
        select 1 from public.surveys s where s.id = p_survey_id
        and s.status <> 'cancelled'
        and (
            public.has_role('admin', 'office', 'sales')
            or (public.has_role('field') and s.assigned_surveyor_id = auth.uid())
        )
    );
$$;

drop policy if exists surveys_update on public.surveys;
create policy surveys_update on public.surveys
    for update to authenticated
    using (public.can_edit_survey(id) or (public.has_role('admin', 'office', 'sales') and status = 'scheduled'))
    with check (
        status = 'scheduled'
        or (status = 'cancelled' and public.has_role('admin', 'office', 'sales'))
    );

drop function if exists public.submit_survey_report(uuid);
drop function if exists public.approve_survey_report(uuid);
drop function if exists public.reopen_survey_report(uuid);

-- Dropping them prevents stale clients from reintroducing the removed workflow.
