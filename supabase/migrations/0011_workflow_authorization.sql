-- Enforce report approval and contract integrity at the database boundary.
-- Apply as postgres, after 0010. Existing mismatched contracts are left for
-- explicit review; the NOT VALID foreign key immediately protects new writes.

create or replace function public.has_role(variadic p_roles text[])
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.auth_role() = any(p_roles), false); $$;

create or replace function public.can_edit_survey(p_survey_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
    select public.is_member() and exists (
        select 1 from public.surveys s where s.id = p_survey_id and (
            (s.status = 'scheduled' and (
                public.has_role('admin', 'office', 'sales')
                or (public.has_role('field') and s.assigned_surveyor_id = auth.uid())
            ))
            or (s.status = 'submitted' and public.has_role('admin', 'office'))
        )
    );
$$;

-- RLS governs row access; this invoker trigger governs columns and state.
-- Only trusted database roles bypass it. Client JWT metadata, application
-- roles and custom settings cannot impersonate current_user. The three state
-- RPCs below explicitly run as postgres and each checks the actual auth.uid().
create or replace function public.guard_survey_write()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
    if current_user in ('postgres', 'service_role') then return new; end if;
    if public.is_member() is not true then
        raise exception 'Inactive account' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
        if new.status <> 'scheduled'
           or new.prepared_by_id is not null or new.prepared_at is not null
           or new.approved_by_id is not null or new.approved_at is not null
           or new.completed_at is not null then
            raise exception 'Create a scheduled report before submitting it'
                using errcode = '42501';
        end if;
        return new;
    end if;
    if old.status in ('approved', 'cancelled')
       or (old.status = 'submitted' and not public.has_role('admin', 'office')) then
        raise exception 'Reopen this report before editing it' using errcode = '42501';
    end if;
    if row(new.prepared_by_id, new.prepared_at, new.approved_by_id,
           new.approved_at, new.completed_at)
       is distinct from row(old.prepared_by_id, old.prepared_at, old.approved_by_id,
                            old.approved_at, old.completed_at) then
        raise exception 'Use the report sign-off actions' using errcode = '42501';
    end if;
    -- Existing cancelSurvey clients write the status directly. Cancellation is
    -- still available to schedulers, but submission/approval/reopening use RPCs.
    if new.status is distinct from old.status and not (
        new.status = 'cancelled' and old.status in ('scheduled', 'submitted')
        and public.has_role('admin', 'office', 'sales')
    ) then
        raise exception 'Use the report sign-off actions' using errcode = '42501';
    end if;
    if row(new.id, new.lead_id, new.property_id, new.assigned_surveyor_id)
       is distinct from row(old.id, old.lead_id, old.property_id, old.assigned_surveyor_id) then
        raise exception 'Report identity and assignment cannot be changed directly'
            using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists surveys_guard_write on public.surveys;
create trigger surveys_guard_write before insert or update on public.surveys
for each row execute function public.guard_survey_write();

-- Checking a policy snapshot alone would let an in-flight photo save race an
-- approval. Lock the parent before checking state, using the same lock as RPCs.
create or replace function public.guard_survey_photo_write()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
    v_survey_id uuid;
    v_status text;
begin
    if tg_op = 'DELETE' then v_survey_id := old.survey_id;
    else v_survey_id := new.survey_id; end if;
    select status into v_status from public.surveys where id = v_survey_id for update;
    -- Parent deletion cascades here after the parent has disappeared. The
    -- parent's DELETE policy already authorizes the operation.
    if not found and tg_op = 'DELETE' then return old; end if;
    if public.can_edit_survey(v_survey_id) is not true then
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

drop trigger if exists survey_photos_guard_write on public.survey_photos;
create trigger survey_photos_guard_write before insert or update or delete on public.survey_photos
for each row execute function public.guard_survey_photo_write();

create or replace function public.submit_survey_report(p_survey_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_status text;
begin
    if public.is_member() is not true then
        raise exception 'Inactive account' using errcode = '42501';
    end if;
    select status into v_status from public.surveys where id = p_survey_id for update;
    if not found then raise exception 'Inspection not found' using errcode = 'P0002'; end if;
    if public.can_edit_survey(p_survey_id) is not true then
        raise exception 'Insufficient permissions' using errcode = '42501';
    end if;
    if v_status <> 'scheduled' then
        raise exception 'Only a scheduled report can be submitted' using errcode = '22023';
    end if;
    update public.surveys set status = 'submitted', prepared_by_id = auth.uid(),
        prepared_at = now(), approved_by_id = null, approved_at = null, completed_at = null
    where id = p_survey_id;
end;
$$;

create or replace function public.approve_survey_report(p_survey_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_lead_id uuid; v_status text;
begin
    if public.has_role('admin', 'office') is not true then
        raise exception 'Only admin or office staff can approve a report' using errcode = '42501';
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
    if public.has_role('admin', 'office') is not true then
        raise exception 'Only admin or office staff can reopen a report' using errcode = '42501';
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

alter function public.submit_survey_report(uuid) owner to postgres;
alter function public.approve_survey_report(uuid) owner to postgres;
alter function public.reopen_survey_report(uuid) owner to postgres;
revoke all on function public.submit_survey_report(uuid) from public, anon;
revoke all on function public.approve_survey_report(uuid) from public, anon;
revoke all on function public.reopen_survey_report(uuid) from public, anon;
grant execute on function public.submit_survey_report(uuid) to authenticated;
grant execute on function public.approve_survey_report(uuid) to authenticated;
grant execute on function public.reopen_survey_report(uuid) to authenticated;

create or replace function public.advance_lead_stage(
    p_lead_id uuid, p_stage text, p_only_from text[] default null
)
returns text language plpgsql security definer set search_path = public
as $$
declare v_role text := public.auth_role(); v_previous text;
begin
    if v_role is null then raise exception 'Not signed in' using errcode = '42501'; end if;
    if v_role in ('admin', 'office') then null;
    elsif v_role = 'sales' then
        if not exists (select 1 from public.leads where id = p_lead_id and assigned_sales_rep_id = auth.uid()) then
            raise exception 'Insufficient permissions' using errcode = '42501';
        end if;
    elsif v_role = 'field' then
        -- A field technician can complete installations; survey completion is
        -- exclusively an office sign-off via approve_survey_report.
        if not coalesce(
            (p_stage = 'survey_scheduled' and exists (
                select 1 from public.surveys where lead_id = p_lead_id and assigned_surveyor_id = auth.uid()
            )) or (p_stage in ('installation_scheduled', 'installation_complete') and exists (
                select 1 from public.installations where lead_id = p_lead_id and auth.uid() = any(assigned_crew_ids)
            )), false
        ) then raise exception 'Insufficient permissions' using errcode = '42501'; end if;
    else raise exception 'Insufficient permissions' using errcode = '42501';
    end if;
    select stage into v_previous from public.leads where id = p_lead_id for update;
    if not found then return null; end if;
    if p_only_from is not null and not (v_previous = any(p_only_from)) then return null; end if;
    update public.leads set stage = p_stage, last_activity_at = now(),
        converted_at = case when p_stage = 'contract_signed' and converted_at is null then now() else converted_at end
    where id = p_lead_id;
    return v_previous;
end;
$$;

-- Preserve uploads and cleanup for editable reports, but prevent an uploader
-- from replacing/deleting evidence after its report has been signed off.
create or replace function public.can_write_survey_object(p_name text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_status text;
begin
    if public.is_member() is not true then return false; end if;
    if split_part(p_name, '/', 1) <> 'surveys' then return true; end if;
    begin v_id := split_part(p_name, '/', 2)::uuid;
    exception when invalid_text_representation then return false; end;
    select status into v_status from public.surveys where id = v_id for update;
    -- Deleting a lead also deletes its reports before client storage cleanup.
    -- The ordinary owner/admin policy still governs such orphan cleanup.
    if not found then return true; end if;
    return public.can_edit_survey(v_id);
end;
$$;

drop policy if exists lampara_survey_objects_insert_guard on storage.objects;
create policy lampara_survey_objects_insert_guard on storage.objects as restrictive
for insert to authenticated with check (
    bucket_id <> 'photos' or public.can_write_survey_object(name)
);
drop policy if exists lampara_survey_objects_update_guard on storage.objects;
create policy lampara_survey_objects_update_guard on storage.objects as restrictive
for update to authenticated
using (bucket_id <> 'photos' or public.can_write_survey_object(name))
with check (bucket_id <> 'photos' or public.can_write_survey_object(name));
drop policy if exists lampara_survey_objects_delete_guard on storage.objects;
create policy lampara_survey_objects_delete_guard on storage.objects as restrictive
for delete to authenticated using (
    bucket_id <> 'photos' or public.can_write_survey_object(name)
);

-- Existing storage ownership policies also need active membership: owning an
-- old upload must not let a deactivated session continue changing it.
drop policy if exists lampara_files_active_update on storage.objects;
create policy lampara_files_active_update on storage.objects as restrictive
for update to authenticated using (public.is_member()) with check (public.is_member());
drop policy if exists lampara_files_active_delete on storage.objects;
create policy lampara_files_active_delete on storage.objects as restrictive
for delete to authenticated using (public.is_member());

-- A composite FK protects INSERT/UPDATE contracts and reparenting a quote.
-- NOT VALID avoids choosing a customer on behalf of existing inconsistent
-- records. See README preflight; validate after those records are corrected.
create unique index if not exists quotes_id_lead_id_key on public.quotes(id, lead_id);
do $$ begin
    if not exists (select 1 from pg_constraint where conrelid = 'public.contracts'::regclass
                   and conname = 'contracts_quote_lead_fkey') then
        alter table public.contracts add constraint contracts_quote_lead_fkey
        foreign key (quote_id, lead_id) references public.quotes(id, lead_id)
        on delete cascade not valid;
    end if;
end; $$;

create or replace function public.create_contract(p_lead_id uuid, p_quote_id uuid, p_notes text default null)
returns uuid language plpgsql security invoker set search_path = public
as $$
declare v_version integer; v_contract_id uuid;
begin
    -- The FK is the invariant; this check supplies a useful error before any
    -- side effects and locks the quote against concurrent reparenting.
    select version into v_version from public.quotes
    where id = p_quote_id and lead_id = p_lead_id for update;
    if not found then raise exception 'Quote does not belong to this lead' using errcode = '23514'; end if;
    update public.quotes set status = 'accepted' where id = p_quote_id and status <> 'accepted';
    begin
        insert into public.contracts(lead_id, quote_id, status, notes)
        values(p_lead_id, p_quote_id, 'pending_signature', nullif(p_notes, '')) returning id into v_contract_id;
    exception when unique_violation then raise exception 'A contract already exists for this lead'; end;
    perform public.advance_lead_stage(p_lead_id, 'contract_signed');
    insert into public.activity_log(lead_id, user_id, action, details, entity_type, entity_id)
    values(p_lead_id, auth.uid(), 'Contract created — pending signature',
           'Based on quote v' || v_version, 'contract', v_contract_id::text);
    return v_contract_id;
end;
$$;

revoke all on function public.guard_survey_write() from public, anon, authenticated;
revoke all on function public.guard_survey_photo_write() from public, anon, authenticated;
revoke all on function public.can_write_survey_object(text) from public, anon;
grant execute on function public.can_write_survey_object(text) to authenticated;
