-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — drop lead source
--
-- The "how did this lead find us" field (referral / Facebook ad / website
-- form / walk-in / other) turned out not to be worth tracking. This removes
-- it entirely: the column, its CHECK constraint, and `create_lead_with_property`'s
-- parameter (folded into the activity-log line too).
--
-- Irreversible: existing `leads.source` values are dropped with the column.
-- If that data is ever wanted again, restore from a backup taken before this
-- migration runs — there is no soft-delete here.
--
-- `referred_by` (free-text "who referred them") is untouched — it was never
-- gated by source in the schema and stays useful on its own.
--
-- Apply after 0024. NOT safely re-runnable past the first apply (the column
-- and old function signature won't exist to drop a second time) — that's
-- fine, migrations are meant to run once each, in order.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── create_lead_with_property: drop p_source ───────────────────────────────
--
-- Same reasoning as 0024's own note: a changed signature needs the old one
-- dropped explicitly, or CREATE OR REPLACE leaves both overloads sitting
-- side by side instead of replacing anything.

drop function if exists public.create_lead_with_property(
    text, text, text, text, text, text, text, text, text, text, text, text, uuid,
    text, text, text, text, text, text, text
);

create or replace function public.create_lead_with_property(
    p_first_name    text,
    p_last_name     text,
    p_phone         text,
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
        first_name, last_name, phone, email, referred_by,
        stage, assigned_sales_rep_id, last_activity_at, notes
    )
    values (
        p_first_name, p_last_name, p_phone, nullif(p_email, ''),
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

    insert into public.activity_log (lead_id, user_id, action, entity_type, entity_id)
    values (v_lead_id, auth.uid(), 'Lead created', 'lead', v_lead_id::text);

    return v_lead_id;
end;
$$;

grant execute on function public.create_lead_with_property(
    text, text, text, text, text, text, text, text, text, text, text, uuid,
    text, text, text, text, text, text, text
) to authenticated;

-- ─── leads.source ────────────────────────────────────────────────────────
alter table public.leads drop column if exists source;
