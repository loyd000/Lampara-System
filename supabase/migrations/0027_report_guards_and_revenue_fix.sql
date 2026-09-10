-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — restrict the reports to admins, and fix what revenue reads
--
-- Two unrelated problems in the same four functions, so one migration.
--
-- ── 1. Authorization ──────────────────────────────────────────────────────
-- The sidebar hid /reports from field technicians, but nothing stopped one
-- from typing the URL, and these functions are SECURITY INVOKER while
-- `leads_select` (0013) lets `field` read every lead — so a technician could
-- see pipeline value, closed value and average deal size. The route now
-- guards the page (see components/require-role.tsx), and this guards the data,
-- because a UI check is not an authorization boundary.
--
-- Each function becomes plpgsql only to gain somewhere to raise from; the
-- query bodies are unchanged apart from the revenue fixes below.
--
-- ── 2. Revenue read the wrong column, and filtered on statuses that no
--       longer exist ────────────────────────────────────────────────────────
-- `report_revenue_summary` was written in 0007 against the original schema and
-- never revisited:
--
--   · It summed `total_price_usd`. Quotes have been priced in PHP since 0016
--     (`total_php`), and the USD column is dead — every row holds 0. Verified
--     against live data: one quote, `total_php` = 215,000.00,
--     `total_price_usd` = 0, and the function returned a pipeline value of 0.
--
--   · It filtered `status in ('accepted','sent')` and `status = 'accepted'`.
--     The status vocabulary is now `('in_progress','approved')` — the CHECK
--     constraint does not even permit the old values, so those filters could
--     never match anything.
--
-- Net effect: Pipeline Value, Closed Value, Avg Deal Size, Accepted Quotes and
-- Financing Mix all read zero/empty on the Reports page regardless of the real
-- numbers. The old statuses map onto the new ones directly — 'accepted' is
-- today's 'approved' (won), 'sent' is today's 'in_progress' (out with the
-- customer) — so the intent below is 0007's, not a new business rule.
--
-- Apply after 0026. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.report_pipeline_summary()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
    if not public.has_role('superadmin', 'admin') then
        raise exception 'Reports are restricted to admins' using errcode = '42501';
    end if;

    return (
        with visible as (
            select id, first_name, last_name, stage, converted_at, last_activity_at
              from public.leads
        ),
        totals as (
            select
                count(*)                                        as total_leads,
                count(*) filter (where converted_at is not null) as converted,
                count(*) filter (where stage = 'active_customer') as active_customers
              from visible
        ),
        stale as (
            select
                id,
                first_name || ' ' || last_name as name,
                stage,
                greatest(0, (current_date - last_activity_at::date)) as days_stale
              from visible
             where last_activity_at <= now() - interval '7 days'
               and stage not in ('active_customer', 'installation_complete')
             order by last_activity_at asc
        )
        select jsonb_build_object(
            'stageCounts', coalesce(
                (select jsonb_object_agg(stage, n)
                   from (select stage, count(*) as n from visible group by stage) s),
                '{}'::jsonb
            ),
            'totalLeads',      (select total_leads from totals),
            'converted',       (select converted from totals),
            'activeCustomers', (select active_customers from totals),
            'conversionRate',  (
                select case when total_leads > 0
                            then round(100.0 * converted / total_leads)::int
                            else 0 end
                  from totals
            ),
            'staleLeads', coalesce(
                (select jsonb_agg(jsonb_build_object(
                    '_id', id, 'name', name, 'stage', stage, 'daysStale', days_stale
                )) from stale),
                '[]'::jsonb
            )
        )
    );
end;
$$;

create or replace function public.report_permits_summary()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
    if not public.has_role('superadmin', 'admin') then
        raise exception 'Reports are restricted to admins' using errcode = '42501';
    end if;

    return (
        with p as (
            select pm.id, pm.type, pm.status, pm.due_date, pm.lead_id,
                   l.first_name, l.last_name
              from public.permits pm
              -- LEFT JOIN on purpose: permits are visible to every member but the
              -- lead behind one may not be, and the row should still be counted.
              left join public.leads l on l.id = pm.lead_id
        ),
        overdue as (
            select id, type, status, due_date,
                   (current_date - due_date) as days_overdue,
                   coalesce(first_name || ' ' || last_name, 'Unknown') as customer_name,
                   lead_id
              from p
             where due_date is not null
               and status <> 'approved'
               and due_date < current_date
             order by due_date asc
        )
        select jsonb_build_object(
            'overdue', coalesce(
                (select jsonb_agg(jsonb_build_object(
                    '_id', id, 'type', type, 'status', status, 'dueDate', due_date,
                    'daysOverdue', days_overdue, 'customerName', customer_name,
                    'leadId', lead_id
                )) from overdue),
                '[]'::jsonb
            ),
            'byStatus', coalesce(
                (select jsonb_object_agg(status, n)
                   from (select status, count(*) as n from p group by status) s),
                '{}'::jsonb
            ),
            'total', (select count(*) from p)
        )
    );
end;
$$;

create or replace function public.report_revenue_summary()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
    if not public.has_role('superadmin', 'admin') then
        raise exception 'Reports are restricted to admins' using errcode = '42501';
    end if;

    return (
        -- `total_php`, not `total_price_usd`; 'approved'/'in_progress', not
        -- 'accepted'/'sent'. See the header.
        with q as (select status, total_php, financing_option from public.quotes),
        agg as (
            select
                coalesce(sum(total_php) filter (where status in ('in_progress', 'approved')), 0) as pipeline_value,
                coalesce(sum(total_php) filter (where status = 'approved'), 0)                   as closed_value,
                count(*)                                                                         as total_quotes,
                count(*) filter (where status = 'approved')                                      as accepted_quotes
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
                (select jsonb_object_agg(financing_option, n)
                   from (
                       select financing_option, count(*) as n
                         from q where status = 'approved' group by financing_option
                   ) f),
                '{}'::jsonb
            )
        )
    );
end;
$$;

create or replace function public.report_installations_summary()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
    if not public.has_role('superadmin', 'admin') then
        raise exception 'Reports are restricted to admins' using errcode = '42501';
    end if;

    return (
        select jsonb_build_object(
            'total', (select count(*) from public.installations),
            'byStatus', coalesce(
                (select jsonb_object_agg(status, n)
                   from (select status, count(*) as n from public.installations group by status) s),
                '{}'::jsonb
            ),
            'openServiceTickets', (
                select count(*) from public.service_tickets where status = 'open'
            )
        )
    );
end;
$$;

grant execute on function public.report_pipeline_summary()      to authenticated;
grant execute on function public.report_permits_summary()       to authenticated;
grant execute on function public.report_revenue_summary()       to authenticated;
grant execute on function public.report_installations_summary() to authenticated;
