-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — the one field on the paper form the schema was missing
--
-- "Recommended vehicle (Carabao, Tamaraw):" sits in the Client Details block of
-- the Site Ocular Report (public/Ocular report Template.docx). 0009 modelled
-- every other line on that page but not this one, so a printed report had a
-- blank the system could never fill. Free text: the crew write whatever will
-- actually get up the road.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.surveys
    add column if not exists recommended_vehicle text;

comment on column public.surveys.recommended_vehicle is
    'Vehicle the site can be reached with — Carabao, Tamaraw, or whatever the '
    'access actually allows. Printed in Client Details on the ocular report.';
