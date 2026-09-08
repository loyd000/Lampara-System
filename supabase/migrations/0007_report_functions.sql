-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — reporting in SQL (review_plan.md P2 #10, #11)
--
-- The report queries used to pull every lead, permit, quote and installation
-- into the browser and count them there. Two problems: it does not scale, and
-- if PostgREST's max-rows is ever configured the fetch truncates *silently* and
-- the numbers quietly go wrong.
--
-- Each report is now one aggregate query returning a single jsonb object,
-- shaped to match what the components already consume.
--
-- All are SECURITY INVOKER, so RLS still applies: `leads` is scoped to the
-- owning rep, which means a sales rep calling report_pipeline_summary() gets
-- their own pipeline and an admin gets the whole business — the same behaviour
-- the client-side version had, for the same reason.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- A lead is "stale" after a week with no activity, unless it has already landed.
create or replace function public.report_pipeline_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
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
    );
$$;

create or replace function public.report_permits_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
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
    );
$$;

create or replace function public.report_revenue_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    with q as (select status, total_price_usd, financing_option from public.quotes),
    agg as (
        select
            coalesce(sum(total_price_usd) filter (where status in ('accepted', 'sent')), 0) as pipeline_value,
            coalesce(sum(total_price_usd) filter (where status = 'accepted'), 0)            as closed_value,
            count(*)                                                                        as total_quotes,
            count(*) filter (where status = 'accepted')                                     as accepted_quotes
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
                     from q where status = 'accepted' group by financing_option
               ) f),
            '{}'::jsonb
        )
    );
$$;

create or replace function public.report_installations_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
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
    );
$$;

grant execute on function public.report_pipeline_summary()      to authenticated;
grant execute on function public.report_permits_summary()       to authenticated;
grant execute on function public.report_revenue_summary()       to authenticated;
grant execute on function public.report_installations_summary() to authenticated;
