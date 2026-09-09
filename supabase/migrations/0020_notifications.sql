-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — email notifications (Phase 8)
--
-- Two tables only. The actual sending happens in the `notify` Edge Function
-- (supabase/functions/notify/), which this migration does not deploy — that's
-- a separate `supabase functions deploy notify` step, same "ships as a file,
-- applied by hand" story as every migration in this repo.
--
-- `notification_preferences` — one row per user, defaults to everything on.
-- A missing row means "never asked," not "opted out" — the client creates the
-- row lazily (upsert) the first time someone opens their notification
-- settings, so there is no backfill to run here.
--
-- `notification_log` — write-only from the Edge Function's service-role
-- client (RLS grants it no INSERT policy for `authenticated` at all, so a
-- browser client cannot forge a "sent" row); superadmin/admin can read it to
-- debug delivery. This is the piece that answers "did that email actually go
-- out," which nothing else in the system can tell you.
--
-- Permit-overdue is the one event with no write to hang a trigger off — see
-- the commented pg_cron block at the bottom, left disabled because enabling
-- pg_cron/pg_net is a dashboard/project-level step this migration can't do
-- for you.
--
-- Apply after 0019. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.notification_preferences (
    user_id                uuid primary key references public.users (id) on delete cascade,
    lead_assigned          boolean not null default true,
    inspection_scheduled   boolean not null default true,
    installation_scheduled boolean not null default true,
    permit_overdue         boolean not null default true,
    quote_accepted         boolean not null default true,
    contract_signed        boolean not null default true,
    updated_at             timestamptz not null default now()
);

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
    before update on public.notification_preferences
    for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;

drop policy if exists notification_preferences_select on public.notification_preferences;
create policy notification_preferences_select on public.notification_preferences
    for select to authenticated
    using (user_id = auth.uid() or public.has_role('superadmin', 'admin'));

drop policy if exists notification_preferences_insert on public.notification_preferences;
create policy notification_preferences_insert on public.notification_preferences
    for insert to authenticated
    with check (user_id = auth.uid());

drop policy if exists notification_preferences_update on public.notification_preferences;
create policy notification_preferences_update on public.notification_preferences
    for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- ─── notification_log ───────────────────────────────────────────────────────

create table if not exists public.notification_log (
    id                 uuid primary key default gen_random_uuid(),
    event              text not null,
    lead_id            uuid references public.leads (id) on delete set null,
    recipient_user_id  uuid references public.users (id) on delete set null,
    status             text not null check (status in ('sent', 'skipped', 'failed')),
    error              text,
    created_at         timestamptz not null default now()
);

create index if not exists notification_log_lead_idx on public.notification_log (lead_id);
create index if not exists notification_log_recipient_idx on public.notification_log (recipient_user_id);

alter table public.notification_log enable row level security;

-- No insert/update/delete policy for `authenticated` at all — only the Edge
-- Function's service-role client (which bypasses RLS entirely) writes here.
drop policy if exists notification_log_select on public.notification_log;
create policy notification_log_select on public.notification_log
    for select to authenticated
    using (public.has_role('superadmin', 'admin'));

-- ─── Realtime (so the log can update live on the future admin view) ────────

do $$
declare
    t text;
begin
    foreach t in array array['notification_preferences', 'notification_log']
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

-- ─── Permit-overdue — the one event with no write to trigger off ───────────
--
-- Everything else fires from the app right after a write. A permit becoming
-- overdue is a date passing with nothing written, so it needs a daily check.
-- Uncomment after enabling the `pg_cron` and `pg_net` extensions for this
-- project (Database → Extensions in the dashboard), and after setting
-- `app.settings.notify_url` / a service-role-authorized call to the deployed
-- `notify` function — pg_net needs the function's HTTPS URL and a way to
-- authorize the call, which vary per project, so this is left as a template
-- rather than something this migration can wire up unattended.
--
-- select cron.schedule(
--     'permit-overdue-check',
--     '0 9 * * *',  -- 9am daily
--     $$
--     select net.http_post(
--         url := '<your-project-ref>.functions.supabase.co/notify-permit-overdue',
--         headers := jsonb_build_object(
--             'Authorization', 'Bearer <service-role-key>',
--             'Content-Type', 'application/json'
--         )
--     );
--     $$
-- );
