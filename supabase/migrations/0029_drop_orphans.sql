-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — remove what nothing uses any more
--
-- Six functions and five columns, all left behind by workflows that were
-- replaced rather than removed. None is referenced by the client, by a
-- trigger, or by a policy — each was checked against the live database before
-- being listed here, not inferred from reading.
--
-- This is not tidying for its own sake. `report_revenue_summary` reported ₱0
-- for months (0027) precisely because a dead column looked alive enough to
-- write a query against, and a stale type union agreed it was valid. Every
-- item below is that same shape of trap.
--
-- ── Functions ─────────────────────────────────────────────────────────────
--
-- `revise_quote` is the sharpest one. It reads as the canonical way to revise
-- a quote, and it cannot work: it sets `status = 'superseded'` and inserts
-- `'draft'`, neither of which the CHECK constraint has permitted since the
-- vocabulary narrowed to ('in_progress','approved'). Any call raises. The
-- client hand-rolls its own `reviseQuote` and never touches this.
--
-- `create_quote` takes `p_total_price_usd` and is likewise uncalled — the
-- client inserts directly so it can allocate a version and quotation number.
--
-- `approve_survey_report` belongs to the submit/approve handoff 0012 removed;
-- `guard_survey_write` and `guard_survey_photo_write` backed triggers that the
-- same migration dropped, leaving the functions behind.
--
-- `reporting_sales_metrics` is called by nothing — not the client, not a
-- policy — and sums `total_price_usd`, so it carries the identical bug 0027
-- fixed in `report_revenue_summary`. Dropping it rather than fixing it,
-- because a report nobody runs is not worth carrying; the four `report_*`
-- functions are the live ones.
--
-- Deliberately kept: `survey_arrays_valid` (still trigger-attached) and
-- `can_write_survey_object` (referenced by three storage policies).
--
-- ── Columns ───────────────────────────────────────────────────────────────
--
-- `quotes.total_price_usd` — dead since 0016 moved pricing to `total_php`,
-- nullable, holding 0 in every row. It is the column that caused 0027.
--
-- `surveys.prepared_by_id` / `prepared_at` / `approved_by_id` / `approved_at`
-- — the removed approval handoff's bookkeeping. Nothing has written them since
-- 0012. Note this is the *surveys* table: `quotes.prepared_by_id` is live (it
-- names who prepared the quote) and `users.approved_at` / `permits.approved_at`
-- are live too. Same column names, different tables, entirely different
-- meanings.
--
-- Irreversible: dropping a column discards its data. `total_price_usd` is
-- uniformly 0 and the surveys columns are unwritten since 0012, so there is
-- nothing of value in them — but restore from a backup if that turns out to be
-- wrong. No CASCADE anywhere below on purpose: if something does still depend
-- on one of these, the migration should fail loudly rather than quietly take
-- the dependency with it.
--
-- Apply after 0028. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.revise_quote(uuid);
drop function if exists public.create_quote(
    uuid, integer, text, text, double precision, numeric, text, date, text
);
drop function if exists public.approve_survey_report(uuid);
drop function if exists public.guard_survey_write();
drop function if exists public.guard_survey_photo_write();
drop function if exists public.reporting_sales_metrics();

alter table public.quotes  drop column if exists total_price_usd;

alter table public.surveys drop column if exists prepared_by_id;
alter table public.surveys drop column if exists prepared_at;
alter table public.surveys drop column if exists approved_by_id;
alter table public.surveys drop column if exists approved_at;
