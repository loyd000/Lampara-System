-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — Philippine address format for properties
--
-- Adds the granular fields a PH mailing address actually has (House/Unit/
-- Block & Lot, Street, Subdivision, Barangay, City/Municipality, Province,
-- 4-digit ZIP) on top of the existing `address/city/state/zip` columns —
-- which stay exactly as they are, still NOT NULL, and keep being populated
-- (composed from the granular fields client-side, see src/lib/ph-address.ts)
-- so every existing consumer — the quote PDF, the contract DOCX, the
-- Overview tab — keeps working unchanged.
--
-- The granular columns are nullable: existing properties predate this
-- feature and have no way to backfill them accurately from free-text
-- address/city/state, and the app only needs them for two things — driving
-- the cascading Province → City/Municipality → Barangay picker, and
-- re-populating that picker's selections when a lead's property is edited.
-- Both degrade fine to "start from scratch" for pre-existing records.
--
-- Apply after 0023. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.properties
    add column if not exists house_unit_block_lot text,
    add column if not exists street_name         text,
    add column if not exists subdivision          text,
    add column if not exists barangay             text,
    add column if not exists city_municipality    text,
    add column if not exists province             text,
    add column if not exists zip_code             text;

alter table public.properties drop constraint if exists properties_zip_code_check;

alter table public.properties
    add constraint properties_zip_code_check
    check (zip_code is null or zip_code ~ '^[0-9]{4}$');

-- ─── create_lead_with_property: store the granular fields too ──────────────
--
-- Appending new parameters (even with defaults) changes the function's
-- signature — CREATE OR REPLACE would leave the old 13-arg version sitting
-- alongside a new 20-arg overload rather than actually replacing it (the
-- same trap 0016's advance_lead_stage cleanup already ran into). Drop the
-- old signature explicitly first.

drop function if exists public.create_lead_with_property(
    text, text, text, text, text, text, text, text, text, text, text, text, uuid
);

create or replace function public.create_lead_with_property(
    p_first_name    text,
    p_last_name     text,
    p_phone         text,
    p_source        text,
    p_address       text,
    p_city          text,
    p_state         text,
    p_zip           text,
    p_property_type text,
    p_email         text default null,
    p_referred_by   text default null,
    p_notes         text default null,
    p_assigned_sales_rep_id uuid default null,
    p_house_unit_block_lot  text default null,
    p_street_name           text default null,
    p_subdivision           text default null,
    p_barangay              text default null,
    p_city_municipality     text default null,
    p_province              text default null,
    p_zip_code              text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_lead_id uuid;
begin
    insert into public.leads (
        first_name, last_name, phone, email, source, referred_by,
        stage, assigned_sales_rep_id, last_activity_at, notes
    )
    values (
        p_first_name, p_last_name, p_phone, nullif(p_email, ''), p_source,
        nullif(p_referred_by, ''), 'lead', p_assigned_sales_rep_id, now(), nullif(p_notes, '')
    )
    returning id into v_lead_id;

    insert into public.properties (
        lead_id, address, city, state, zip, property_type,
        house_unit_block_lot, street_name, subdivision,
        barangay, city_municipality, province, zip_code
    )
    values (
        v_lead_id, p_address, p_city, p_state, p_zip, p_property_type,
        nullif(p_house_unit_block_lot, ''), nullif(p_street_name, ''), nullif(p_subdivision, ''),
        nullif(p_barangay, ''), nullif(p_city_municipality, ''), nullif(p_province, ''), nullif(p_zip_code, '')
    );

    insert into public.activity_log (lead_id, user_id, action, details, entity_type, entity_id)
    values (v_lead_id, auth.uid(), 'Lead created', 'Source: ' || p_source, 'lead', v_lead_id::text);

    return v_lead_id;
end;
$$;

grant execute on function public.create_lead_with_property(
    text, text, text, text, text, text, text, text, text, text, text, text, uuid,
    text, text, text, text, text, text, text
) to authenticated;
