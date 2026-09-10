-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — property type: replace 'agricultural' with 'industrial'
--
-- Widen, backfill, narrow — the same three-step shape 0008's role merge used,
-- so existing rows never sit against a constraint that would reject them
-- mid-migration.
--
-- Apply after 0021. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.properties drop constraint if exists properties_property_type_check;

alter table public.properties
    add constraint properties_property_type_check
    check (property_type in ('residential', 'commercial', 'agricultural', 'industrial'));

update public.properties
   set property_type = 'industrial'
 where property_type = 'agricultural';

alter table public.properties drop constraint if exists properties_property_type_check;

alter table public.properties
    add constraint properties_property_type_check
    check (property_type in ('residential', 'commercial', 'industrial'));
