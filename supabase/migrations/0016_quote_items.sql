-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — quote items, PHP pricing, and quote builder (Phase 6)
--
-- Replaces the legacy single-system inline columns on `quotes` with an itemised
-- structure (`quote_items`). Quotes now have:
--   · `total_php` — computed sum of line items in Philippine Pesos
--   · `quotation_no` — sequence-generated human document ID (e.g. PV System Quotation-295)
--   · `prepared_by_id` — user who drew up the proposal
--   · `status` — simplified to 'in_progress' | 'approved'
--
-- Apply after 0015. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 0. package_items adjustments (Phase 5 refinement) ─────────────────────
alter table public.package_items
    add column if not exists name text;

alter table public.package_items
    alter column description drop not null;

alter table public.package_items
    drop constraint if exists package_items_description_check;

alter table public.package_items
    alter column unit_price_php set default 0;

-- ─── 1. Quotation Number Sequence ─────────────────────────────────────────

create sequence if not exists public.quotation_no_seq start with 295;

create or replace function public.next_quotation_no()
returns text
language plpgsql
as $$
begin
    return 'PV System Quotation-' || nextval('public.quotation_no_seq');
end;
$$;

-- ─── 2. quotes table adjustments ──────────────────────────────────────────

-- New columns
alter table public.quotes
    add column if not exists total_php      numeric(12,2),
    add column if not exists quotation_no   text,
    add column if not exists prepared_by_id uuid references public.users (id) on delete set null;

-- Drop NOT NULL constraints on legacy single-system columns so new itemised quotes
-- don't require arbitrary dummy values.
alter table public.quotes
    alter column panel_count      drop not null,
    alter column panel_model      drop not null,
    alter column inverter_type    drop not null,
    alter column system_size_kw   drop not null,
    alter column total_price_usd  drop not null,
    alter column financing_option drop not null;

-- Drop legacy financing constraint if present
alter table public.quotes
    drop constraint if exists quotes_financing_option_check;

-- Backfill total_php and prepared_by_id for existing rows
update public.quotes
   set total_php = coalesce(total_php, total_price_usd, 0)
 where total_php is null;

update public.quotes
   set prepared_by_id = coalesce(prepared_by_id, created_by)
 where prepared_by_id is null;

-- Backfill quotation_no for existing rows
update public.quotes
   set quotation_no = 'PV System Quotation-' || version
 where quotation_no is null;

-- Drop legacy status check constraint before updating rows so new values ('approved', 'in_progress') are allowed
alter table public.quotes
    drop constraint if exists quotes_status_check;

-- Migrate legacy statuses to 'in_progress' | 'approved'
update public.quotes
   set status = case
       when status = 'accepted' then 'approved'
       else 'in_progress'
   end
 where status not in ('in_progress', 'approved');

-- Add new status constraint and update defaults
alter table public.quotes
    alter column status set default 'in_progress',
    add constraint quotes_status_check check (status in ('in_progress', 'approved'));

alter table public.quotes
    drop constraint if exists quotes_total_php_check;

alter table public.quotes
    alter column total_php set default 0,
    alter column total_php set not null,
    add constraint quotes_total_php_check check (total_php >= 0);

alter table public.quotes
    alter column quotation_no set default public.next_quotation_no(),
    alter column quotation_no set not null;

create index if not exists quotes_prepared_by_idx
    on public.quotes (prepared_by_id);

create index if not exists quotes_status_idx
    on public.quotes (status);

-- ─── 3. quote_items table ─────────────────────────────────────────────────

create table if not exists public.quote_items (
    id                uuid primary key default gen_random_uuid(),
    quote_id          uuid not null references public.quotes (id) on delete cascade,
    description       text not null check (btrim(description) <> ''),
    qty               numeric(10,2) not null default 1 check (qty > 0),
    unit              text not null default 'pc' check (btrim(unit) <> ''),
    unit_price_php    numeric(12,2) not null default 0 check (unit_price_php >= 0),
    line_total_php    numeric(12,2) not null default 0 check (line_total_php >= 0),
    source_package_id uuid references public.packages (id) on delete set null,
    sort_order        integer not null default 0,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

create index if not exists quote_items_quote_idx
    on public.quote_items (quote_id, sort_order);

drop trigger if exists quote_items_set_updated_at on public.quote_items;
create trigger quote_items_set_updated_at
    before update on public.quote_items
    for each row execute function public.set_updated_at();

-- ─── 4. RLS policies ──────────────────────────────────────────────────────

alter table public.quote_items enable row level security;

-- All members can view quote items
drop policy if exists quote_items_select on public.quote_items;
create policy quote_items_select on public.quote_items
    for select to authenticated
    using (public.is_member());

-- Only admins / superadmins can insert items
drop policy if exists quote_items_insert on public.quote_items;
create policy quote_items_insert on public.quote_items
    for insert to authenticated
    with check (public.has_role('superadmin', 'admin'));

-- Only admins / superadmins can update items
drop policy if exists quote_items_update on public.quote_items;
create policy quote_items_update on public.quote_items
    for update to authenticated
    using (public.has_role('superadmin', 'admin'))
    with check (public.has_role('superadmin', 'admin'));

-- Only admins / superadmins can delete items
drop policy if exists quote_items_delete on public.quote_items;
create policy quote_items_delete on public.quote_items
    for delete to authenticated
    using (public.has_role('superadmin', 'admin'));

-- Update quotes_delete policy: superadmin and admin can delete quotes
drop policy if exists quotes_delete on public.quotes;
create policy quotes_delete on public.quotes
    for delete to authenticated
    using (public.has_role('superadmin', 'admin'));

-- ─── 5. Backfill line items for existing quotes ───────────────────────────

insert into public.quote_items (
    quote_id,
    description,
    qty,
    unit,
    unit_price_php,
    line_total_php,
    sort_order
)
select
    q.id,
    coalesce(
        nullif(trim(concat_ws(' · ',
            case when q.system_size_kw is not null then q.system_size_kw || ' kW Solar System' else null end,
            case when q.panel_count is not null and q.panel_model is not null then q.panel_count || 'x ' || q.panel_model else null end,
            q.inverter_type
        )), ''),
        'Solar System Package'
    ),
    1,
    'lot',
    coalesce(q.total_php, q.total_price_usd, 0),
    coalesce(q.total_php, q.total_price_usd, 0),
    0
from public.quotes q
where not exists (
    select 1 from public.quote_items qi where qi.quote_id = q.id
);

-- ─── 6. Realtime ──────────────────────────────────────────────────────────

do $$
declare
    t text;
begin
    foreach t in array array['quote_items']
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

-- ─── 7. Synchronise RPCs ──────────────────────────────────────────────────

-- Drop older overloaded signatures of advance_lead_stage to prevent ambiguity:
-- "function public.advance_lead_stage(uuid, unknown) is not unique"
drop function if exists public.advance_lead_stage(uuid, text);
drop function if exists public.advance_lead_stage(uuid, text, text[]);

-- Ensure canonical 4-argument advance_lead_stage exists
create or replace function public.advance_lead_stage(
    p_lead_id           uuid,
    p_stage             text,
    p_only_from         text[] default null,
    p_cancelled_reason  text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role     text := public.auth_role();
    v_previous text;
begin
    if v_role is null then
        raise exception 'Not signed in' using errcode = '42501';
    end if;

    if v_role in ('superadmin', 'admin') then
        null;
    elsif v_role = 'field' then
        if not coalesce(
            (p_stage = 'survey_scheduled' and exists (
                select 1 from public.surveys
                 where lead_id = p_lead_id and assigned_surveyor_id = auth.uid()
            ))
            or (p_stage in ('installation_scheduled', 'installation_complete') and exists (
                select 1 from public.installations
                 where lead_id = p_lead_id and auth.uid() = any(assigned_crew_ids)
            )),
            false
        ) then
            raise exception 'Insufficient permissions' using errcode = '42501';
        end if;
    else
        raise exception 'Insufficient permissions' using errcode = '42501';
    end if;

    select stage into v_previous from public.leads where id = p_lead_id for update;
    if not found then
        return null;
    end if;
    if p_only_from is not null and not (v_previous = any(p_only_from)) then
        return null;
    end if;

    update public.leads
       set stage            = p_stage,
           last_activity_at = now(),
           converted_at     = case
               when p_stage = 'contract_signed' and converted_at is null then now()
               else converted_at
           end,
           cancelled_reason = case
               when p_stage = 'cancelled' then nullif(p_cancelled_reason, '')
               else null
           end,
           cancelled_at = case
               when p_stage = 'cancelled' then now()
               else null
           end
     where id = p_lead_id;

    return v_previous;
end;
$$;

grant execute on function public.advance_lead_stage(uuid, text, text[], text) to authenticated;

-- Update create_contract to link to 'approved' quotes instead of 'accepted'
create or replace function public.create_contract(p_lead_id uuid, p_quote_id uuid, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_version     integer;
    v_contract_id uuid;
begin
    if not public.has_role('superadmin', 'admin') then
        raise exception 'Insufficient permissions' using errcode = '42501';
    end if;

    select version into v_version
      from public.quotes
     where id = p_quote_id and lead_id = p_lead_id for update;

    if not found then
        raise exception 'Quote does not belong to this lead' using errcode = '23514';
    end if;

    update public.quotes
       set status = 'approved'
     where id = p_quote_id and status <> 'approved';

    begin
        insert into public.contracts(lead_id, quote_id, status, notes)
        values(p_lead_id, p_quote_id, 'pending_signature', nullif(p_notes, ''))
        returning id into v_contract_id;
    exception when unique_violation then
        raise exception 'A contract already exists for this lead';
    end;

    perform public.advance_lead_stage(p_lead_id, 'contract_signed'::text);

    insert into public.activity_log(lead_id, user_id, action, details, entity_type, entity_id)
    values(p_lead_id, auth.uid(), 'Contract created — pending signature',
           'Based on quote v' || v_version, 'contract', v_contract_id::text);

    return v_contract_id;
end;
$$;

grant execute on function public.create_contract(uuid, uuid, text) to authenticated;

-- Update reporting_sales_metrics to account for total_php and approved status
create or replace function public.reporting_sales_metrics()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    with q as (
        select status, coalesce(total_php, total_price_usd, 0) as price, financing_option
          from public.quotes
    ),
    agg as (
        select
            coalesce(sum(price) filter (where status in ('approved', 'in_progress')), 0) as pipeline_value,
            coalesce(sum(price) filter (where status = 'approved'), 0)                   as closed_value,
            count(*)                                                                     as total_quotes,
            count(*) filter (where status = 'approved')                                  as accepted_quotes
          from q
    )
    select jsonb_build_object(
        'pipelineValue',  (select pipeline_value from agg),
        'closedValue',    (select closed_value from agg),
        'avgDealSize',    (
            select case when accepted_quotes > 0
                        then round(closed_value / accepted_quotes)::int
                        else 0 end
              from agg
        ),
        'totalQuotes',    (select total_quotes from agg),
        'acceptedQuotes', (select accepted_quotes from agg),
        'financingMix', coalesce(
            (select jsonb_object_agg(coalesce(financing_option, 'cash'), count)
               from (select financing_option, count(*) from q group by financing_option) sub),
            '{}'::jsonb
        )
    );
$$;
