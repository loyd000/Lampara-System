-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — in-app notifications (replaces email notifications)
--
-- Repurposes `notification_log` from an admin-only email audit trail to a
-- user-facing notification feed. Each recipient sees their own rows, can
-- mark them read, and the sidebar shows an unread-count badge.
--
-- Changes:
--   1. Adds `title`, `message`, `is_read` columns to `notification_log`
--   2. Opens the SELECT policy so every authenticated user can read their
--      own rows (not only superadmin/admin)
--   3. Adds an INSERT policy for authenticated (so the client-side
--      `notifyEvent()` can write directly, no Edge Function needed)
--   4. Adds an UPDATE policy so users can mark their own notifications read
--   5. Adds a composite index for fast unread-count queries
--   6. Drops `notification_preferences` (email toggles no longer needed)
--
-- Apply after 0038. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Add columns ────────────────────────────────────────────────────────────

alter table public.notification_log
    add column if not exists title   text,
    add column if not exists message text,
    add column if not exists is_read boolean not null default false;

-- ─── Index for unread-count queries ─────────────────────────────────────────

create index if not exists notification_log_unread_idx
    on public.notification_log (recipient_user_id, is_read)
    where is_read = false;

-- ─── RLS: let every user read their own notifications ───────────────────────

drop policy if exists notification_log_select on public.notification_log;
create policy notification_log_select on public.notification_log
    for select to authenticated
    using (recipient_user_id = auth.uid());

-- ─── RLS: let the client insert notification rows ───────────────────────────

drop policy if exists notification_log_insert on public.notification_log;
create policy notification_log_insert on public.notification_log
    for insert to authenticated
    with check (true);

-- ─── RLS: let users mark their own notifications as read ────────────────────

drop policy if exists notification_log_update on public.notification_log;
create policy notification_log_update on public.notification_log
    for update to authenticated
    using (recipient_user_id = auth.uid())
    with check (recipient_user_id = auth.uid());

-- ─── Drop email notification preferences ────────────────────────────────────

drop table if exists public.notification_preferences cascade;
