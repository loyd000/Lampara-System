-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — bugfixes found during the mobile/bug-scan audit
--
-- 1. approve_survey_report / reopen_survey_report still gated on
--    has_role('admin', 'office') from before the 0013 role collapse
--    (superadmin/admin/field). 0013 rewrote every RLS *policy* that named
--    the old roles, but these two SECURITY DEFINER functions were missed,
--    so a superadmin — the top role in the system — got "Insufficient
--    permissions" trying to approve or reopen a Site Ocular Report.
--
-- Apply after 0018. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.approve_survey_report(p_survey_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_lead_id uuid; v_status text;
begin
    if public.has_role('superadmin', 'admin') is not true then
        raise exception 'Only admin staff can approve a report' using errcode = '42501';
    end if;
    select lead_id, status into v_lead_id, v_status
    from public.surveys where id = p_survey_id for update;
    if not found then raise exception 'Inspection not found' using errcode = 'P0002'; end if;
    if v_status <> 'submitted' then
        raise exception 'Only a submitted report can be approved' using errcode = '22023';
    end if;
    update public.surveys set status = 'approved', completed_at = now(),
        approved_by_id = auth.uid(), approved_at = now() where id = p_survey_id;
    -- A return visit or reapproval must not rewind a proposal, signed contract
    -- or installation. advance_lead_stage checks this under the lead row lock.
    perform public.advance_lead_stage(v_lead_id, 'survey_completed', array['lead', 'survey_scheduled']);
end;
$$;

create or replace function public.reopen_survey_report(p_survey_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_status text;
begin
    if public.has_role('superadmin', 'admin') is not true then
        raise exception 'Only admin staff can reopen a report' using errcode = '42501';
    end if;
    select status into v_status from public.surveys where id = p_survey_id for update;
    if not found then raise exception 'Inspection not found' using errcode = 'P0002'; end if;
    if v_status not in ('submitted', 'approved') then
        raise exception 'Only a submitted or approved report can be reopened' using errcode = '22023';
    end if;
    update public.surveys set status = 'scheduled', prepared_by_id = null,
        prepared_at = null, approved_by_id = null, approved_at = null, completed_at = null
    where id = p_survey_id;
end;
$$;
