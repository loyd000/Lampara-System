-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — close the notification_log INSERT hole
--
-- 0039 opened `notification_log_insert` to `with check (true)` so the client's
-- `notifyEvent()` could write directly. That's wider than intended: every
-- other write policy in this schema gates on `is_member()` (an active,
-- *approved* user — see `auth_role()` in 0002_rls.sql, which requires
-- `is_active`), but this one lets any `authenticated` principal insert rows —
-- including a brand-new sign-up still waiting on superadmin approval. Since
-- `event`/`title`/`message` are free text with no constraint, that's a way
-- for an unapproved account to forge arbitrary "Contract signed"-style
-- notifications to any real user in the org.
--
-- This migration:
--   1. Tightens the INSERT policy to `is_member()`, matching every other
--      write policy in the schema.
--   2. Adds a CHECK constraint pinning `event` to the known
--      `NotificationEvent` union (src/lib/supabase/database.types.ts), so a
--      forged row can't carry an arbitrary event label either.
--
-- Apply after 0039. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.notification_log
    drop constraint if exists notification_log_event_check;

alter table public.notification_log
    add constraint notification_log_event_check
    check (event in (
        'lead_assigned',
        'inspection_scheduled',
        'installation_scheduled',
        'quote_accepted',
        'contract_signed'
    ));

drop policy if exists notification_log_insert on public.notification_log;
create policy notification_log_insert on public.notification_log
    for insert to authenticated
    with check (public.is_member());
