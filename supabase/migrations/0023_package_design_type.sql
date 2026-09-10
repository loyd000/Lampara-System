-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — package design type (Hybrid / Off-Grid / Grid-Tie)
--
-- Categorises what a package actually installs, independent of its price or
-- system size — a 6kWp system can be wired any of the three ways. Backfilled
-- to 'hybrid' for the packages 0021 seeded (they're all named "... Hybrid PV
-- System (with Battery)"), then locked to NOT NULL so nothing new can skip
-- picking one.
--
-- Apply after 0022. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.packages
    add column if not exists design_type text;

update public.packages
   set design_type = 'hybrid'
 where design_type is null;

alter table public.packages
    drop constraint if exists packages_design_type_check;

alter table public.packages
    alter column design_type set default 'hybrid',
    alter column design_type set not null,
    add constraint packages_design_type_check
    check (design_type in ('hybrid', 'off_grid', 'grid_tie'));
