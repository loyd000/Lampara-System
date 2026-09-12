-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — dummy demo projects
--
-- NOT a migration. This is optional, deletable test data for trying the app
-- out with something other than an empty database — six projects spanning
-- every pipeline stage, each with the records a project at that stage would
-- actually have (property, ocular report, quote, contract, installation,
-- service ticket), not just a bare lead row.
--
-- Run once, by pasting into the Supabase SQL editor (or `psql`). Safe to run
-- against a project that already has real data — it only ever inserts new
-- rows, it never touches anything existing. Requires at least one row in
-- `public.users` already (sign up in the app first — the first account
-- becomes admin automatically).
--
-- To remove this data later, see the DELETE block commented out at the
-- bottom of this file.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
    v_admin  uuid;
    v_field  uuid;

    -- One pair of variables per project: the lead, then whatever it needs.
    v_lead_id     uuid;
    v_property_id uuid;
    v_survey_id   uuid;
    v_quote_id    uuid;
    v_contract_id uuid;
    v_install_id  uuid;
begin
    select id into v_admin from public.users where role in ('admin', 'superadmin') order by created_at limit 1;
    if v_admin is null then
        raise exception 'No admin/superadmin user found — sign up in the app first, then re-run this script.';
    end if;

    select id into v_field from public.users where role = 'field' order by created_at limit 1;
    if v_field is null then
        v_field := v_admin; -- no field account yet — fine for dummy data, just reuse the admin
    end if;

    -- ═══ 1. Juan Dela Cruz — stage: lead (fresh inquiry, nothing scheduled yet) ═══
    insert into public.leads (first_name, last_name, phone, email, stage, assigned_sales_rep_id, notes, created_at, updated_at, last_activity_at)
    values ('Juan', 'Dela Cruz', '09171234501', 'juan.delacruz@example.com', 'lead', v_admin,
            'Inquired via Facebook ad about an 8kWp hybrid system. Wants a callback this weekend.',
            now() - interval '3 days', now() - interval '3 days', now() - interval '3 days')
    returning id into v_lead_id;

    insert into public.properties (lead_id, address, city, state, zip, property_type, house_unit_block_lot, street_name, barangay, city_municipality, province, zip_code, created_at, updated_at)
    values (v_lead_id, '12 Kalayaan Ave', 'Quezon City', 'Metro Manila', '1101', 'residential',
            'Blk 4 Lot 12', 'Kalayaan Ave', 'Bagumbayan', 'Quezon City', 'Metro Manila', '1101',
            now() - interval '3 days', now() - interval '3 days');

    insert into public.activity_log (lead_id, user_id, action, details, entity_type, created_at)
    values (v_lead_id, v_admin, 'Lead created', 'Facebook ad inquiry', 'lead', now() - interval '3 days');

    insert into public.lead_notes (lead_id, author_id, body, created_at, updated_at)
    values (v_lead_id, v_admin, 'Customer mentioned a ~₱15,000/month electric bill — good candidate for an 8kWp system.',
            now() - interval '3 days', now() - interval '3 days');

    -- ═══ 2. Maria Santos — stage: survey_scheduled ═══
    insert into public.leads (first_name, last_name, phone, email, stage, assigned_sales_rep_id, notes, created_at, updated_at, last_activity_at)
    values ('Maria', 'Santos', '09171234502', 'maria.santos@example.com', 'survey_scheduled', v_admin,
            'Referred by an existing customer. Wants a quote before the rainy season.',
            now() - interval '10 days', now() - interval '2 days', now() - interval '2 days')
    returning id into v_lead_id;

    insert into public.properties (lead_id, address, city, state, zip, property_type, house_unit_block_lot, street_name, subdivision, barangay, city_municipality, province, zip_code, created_at, updated_at)
    values (v_lead_id, '45 Sumulong Highway', 'Antipolo City', 'Rizal', '1870', 'residential',
            'Lot 8', 'Sumulong Highway', 'Greenpark Village', 'San Roque', 'Antipolo City', 'Rizal', '1870',
            now() - interval '10 days', now() - interval '10 days')
    returning id into v_property_id;

    insert into public.surveys (lead_id, property_id, assigned_surveyor_id, scheduled_at, status, created_at, updated_at)
    values (v_lead_id, v_property_id, v_field, now() + interval '3 days', 'scheduled',
            now() - interval '2 days', now() - interval '2 days');

    insert into public.activity_log (lead_id, user_id, action, details, entity_type, created_at)
    values
        (v_lead_id, v_admin, 'Lead created', 'Referral', 'lead', now() - interval '10 days'),
        (v_lead_id, v_admin, 'Ocular inspection scheduled', to_char(now() + interval '3 days', 'FMMonth DD, YYYY'), 'survey', now() - interval '2 days');

    -- ═══ 3. Pedro Reyes — stage: proposal_sent ═══
    insert into public.leads (first_name, last_name, phone, email, stage, assigned_sales_rep_id, notes, created_at, updated_at, last_activity_at)
    values ('Pedro', 'Reyes', '09171234503', 'pedro.reyes@example.com', 'proposal_sent', v_admin,
            'Comparing quotes with two other installers — price-sensitive.',
            now() - interval '20 days', now() - interval '6 days', now() - interval '6 days')
    returning id into v_lead_id;

    insert into public.properties (lead_id, address, city, state, zip, property_type, house_unit_block_lot, street_name, barangay, city_municipality, province, zip_code, created_at, updated_at)
    values (v_lead_id, '78 Aguinaldo Highway', 'Dasmariñas', 'Cavite', '4114', 'residential',
            'Blk 2 Lot 5', 'Aguinaldo Highway', 'Zone 3', 'Dasmariñas', 'Cavite', '4114',
            now() - interval '20 days', now() - interval '20 days')
    returning id into v_property_id;

    insert into public.surveys (
        lead_id, property_id, assigned_surveyor_id, scheduled_at, completed_at, status,
        roof_type, estimated_system_size_kw, roof_age_years, inspection_date,
        usage_habit, monthly_consumption_kwh, monthly_bill_php,
        appliance_aircon, appliance_tv, appliance_ref, appliance_washer,
        roof_area_sqm, roof_width_m, roof_length_m, roof_access, mounting, roof_orientation,
        meter_phase, transformer_count, meter_kind, meter_form, service_disconnect, grounding,
        main_distribution_panel, cb_size_rating, wire_size, connection_type, floor_count,
        system_capacity, package_type, battery_option, panel_option, report_notes,
        created_at, updated_at
    )
    values (
        v_lead_id, v_property_id, v_field, now() - interval '15 days', now() - interval '14 days', 'scheduled',
        'tile', 8, 6, (now() - interval '15 days')::date,
        'both', 850, 15000,
        true, true, true, true,
        70, 7, 10, 'ladder', array['l_foot']::text[], array['north']::text[],
        'single', 0, 'main', 'round', true, true,
        'Square D 100A', '100A', '8 AWG', 'gprs', 2,
        '8kwp', 'with_battery', '100ah_5kwh', '610_630wp', 'Good roof condition, clear southern exposure. Recommends 8kWp hybrid.',
        now() - interval '14 days', now() - interval '14 days'
    )
    returning id into v_survey_id;

    insert into public.quotes (lead_id, version, status, total_php, prepared_by_id, created_by, valid_until, created_at, updated_at)
    values (v_lead_id, 1, 'approved', 450000, v_admin, v_admin, (now() + interval '15 days')::date,
            now() - interval '10 days', now() - interval '6 days')
    returning id into v_quote_id;

    insert into public.quote_items (quote_id, description, qty, unit, unit_price_php, line_total_php, sort_order, created_at, updated_at)
    values
        (v_quote_id, '8kWp Hybrid Solar PV System Package', 1, 'system', 450000, 450000, 0, now() - interval '10 days', now() - interval '10 days'),
        (v_quote_id, 'Tier 1 Monocrystalline Panels 610-630W (13 pcs)', 13, 'pc', 0, 0, 1, now() - interval '10 days', now() - interval '10 days'),
        (v_quote_id, 'Hybrid Inverter 8kW', 1, 'pc', 0, 0, 2, now() - interval '10 days', now() - interval '10 days'),
        (v_quote_id, 'Lithium Battery 5kWh', 1, 'pc', 0, 0, 3, now() - interval '10 days', now() - interval '10 days');

    insert into public.activity_log (lead_id, user_id, action, details, entity_type, entity_id, created_at)
    values
        (v_lead_id, v_admin, 'Lead created', null, 'lead', null, now() - interval '20 days'),
        (v_lead_id, v_field, 'Ocular inspection completed', null, 'survey', v_survey_id::text, now() - interval '14 days'),
        (v_lead_id, v_admin, 'Quote v1 approved', '₱450,000', 'quote', v_quote_id::text, now() - interval '6 days');

    -- ═══ 4. Ana Gonzales — stage: contract_signed ═══
    insert into public.leads (first_name, last_name, phone, email, stage, assigned_sales_rep_id, converted_at, notes, created_at, updated_at, last_activity_at)
    values ('Ana', 'Gonzales', '09171234504', 'ana.gonzales@example.com', 'contract_signed', v_admin,
            now() - interval '15 days',
            'Wants installation done before her daughter''s debut in two months.',
            now() - interval '35 days', now() - interval '15 days', now() - interval '15 days')
    returning id into v_lead_id;

    insert into public.properties (lead_id, address, city, state, zip, property_type, house_unit_block_lot, street_name, subdivision, barangay, city_municipality, province, zip_code, created_at, updated_at)
    values (v_lead_id, '23 Batong Malake Rd', 'Los Baños', 'Laguna', '4030', 'residential',
            'Lot 14', 'Batong Malake Rd', 'Southville Subdivision', 'Batong Malake', 'Los Baños', 'Laguna', '4030',
            now() - interval '35 days', now() - interval '35 days')
    returning id into v_property_id;

    insert into public.surveys (
        lead_id, property_id, assigned_surveyor_id, scheduled_at, completed_at, status,
        roof_type, estimated_system_size_kw, roof_age_years, inspection_date,
        usage_habit, monthly_consumption_kwh, monthly_bill_php,
        appliance_aircon, appliance_tv, appliance_ref, appliance_washer,
        roof_area_sqm, roof_width_m, roof_length_m, roof_access, mounting, roof_orientation,
        meter_phase, transformer_count, meter_kind, meter_form, service_disconnect, grounding,
        main_distribution_panel, cb_size_rating, wire_size, connection_type, floor_count,
        system_capacity, package_type, battery_option, panel_option, report_notes,
        created_at, updated_at
    )
    values (
        v_lead_id, v_property_id, v_field, now() - interval '30 days', now() - interval '29 days', 'scheduled',
        'metal', 12, 3, (now() - interval '30 days')::date,
        'both', 1100, 20000,
        true, true, true, true,
        90, 8, 11, 'scaffolding', array['u_type']::text[], array['west']::text[],
        'single', 0, 'main', 'round', true, true,
        'Schneider 150A', '150A', '6 AWG', 'wifi', 2,
        '12kwp', 'with_battery', '100ah_5kwh', '610_630wp', 'New metal roof, excellent structural support. Recommends 12kWp hybrid.',
        now() - interval '29 days', now() - interval '29 days'
    )
    returning id into v_survey_id;

    insert into public.quotes (lead_id, version, status, total_php, prepared_by_id, created_by, valid_until, created_at, updated_at)
    values (v_lead_id, 1, 'approved', 520000, v_admin, v_admin, (now() - interval '5 days')::date,
            now() - interval '25 days', now() - interval '20 days')
    returning id into v_quote_id;

    insert into public.quote_items (quote_id, description, qty, unit, unit_price_php, line_total_php, sort_order, created_at, updated_at)
    values
        (v_quote_id, '12kWp Hybrid Solar PV System Package', 1, 'system', 520000, 520000, 0, now() - interval '25 days', now() - interval '25 days'),
        (v_quote_id, 'Tier 1 Monocrystalline Panels 610-630W (16 pcs)', 16, 'pc', 0, 0, 1, now() - interval '25 days', now() - interval '25 days'),
        (v_quote_id, 'Hybrid Inverter 12kW', 1, 'pc', 0, 0, 2, now() - interval '25 days', now() - interval '25 days'),
        (v_quote_id, 'Lithium Battery 5kWh', 1, 'pc', 0, 0, 3, now() - interval '25 days', now() - interval '25 days');

    insert into public.contracts (
        lead_id, quote_id, status, signed_at, notes,
        homeowner_name, site_address, phone_number, system_size_kw,
        panel_line, inverter_line, battery_line, price_php, prepared_by_name, contract_date,
        created_at, updated_at
    )
    values (
        v_lead_id, v_quote_id, 'signed', now() - interval '15 days', null,
        'Ana Gonzales', '23 Batong Malake Rd, Los Baños, Laguna 4030', '09171234504', 12,
        '( 16 PCS ) TIER 1 610-630 WATTS', '( 1 PC/S ) HYBRID INVERTER 12KW', '( 1 PC/S ) LITHIUM BATTERY 5KWH',
        520000, (select name from public.users where id = v_admin), (now() - interval '15 days')::date,
        now() - interval '18 days', now() - interval '15 days'
    )
    returning id into v_contract_id;

    insert into public.activity_log (lead_id, user_id, action, details, entity_type, entity_id, created_at)
    values
        (v_lead_id, v_admin, 'Lead created', null, 'lead', null, now() - interval '35 days'),
        (v_lead_id, v_field, 'Ocular inspection completed', null, 'survey', v_survey_id::text, now() - interval '29 days'),
        (v_lead_id, v_admin, 'Quote v1 approved', '₱520,000', 'quote', v_quote_id::text, now() - interval '20 days'),
        (v_lead_id, v_admin, 'Contract created — pending signature', 'Based on quote v1', 'contract', v_contract_id::text, now() - interval '18 days'),
        (v_lead_id, v_admin, 'Contract signed', null, 'contract', v_contract_id::text, now() - interval '15 days');

    -- ═══ 5. Ricardo Bautista — stage: active_customer (full lifecycle) ═══
    insert into public.leads (first_name, last_name, phone, email, stage, assigned_sales_rep_id, converted_at, notes, created_at, updated_at, last_activity_at)
    values ('Ricardo', 'Bautista', '09171234505', 'ricardo.bautista@example.com', 'active_customer', v_admin,
            now() - interval '40 days',
            'Repeat referral source — has sent two other leads our way.',
            now() - interval '60 days', now() - interval '25 days', now() - interval '25 days')
    returning id into v_lead_id;

    insert into public.properties (lead_id, address, city, state, zip, property_type, house_unit_block_lot, street_name, barangay, city_municipality, province, zip_code, created_at, updated_at)
    values (v_lead_id, '9 P. Torres St', 'Lipa City', 'Batangas', '4217', 'residential',
            'Blk 1 Lot 3', 'P. Torres St', 'San Sebastian', 'Lipa City', 'Batangas', '4217',
            now() - interval '60 days', now() - interval '60 days')
    returning id into v_property_id;

    insert into public.surveys (
        lead_id, property_id, assigned_surveyor_id, scheduled_at, completed_at, status,
        roof_type, estimated_system_size_kw, roof_age_years, inspection_date,
        usage_habit, monthly_consumption_kwh, monthly_bill_php,
        appliance_aircon, appliance_tv, appliance_ref, appliance_washer,
        roof_area_sqm, roof_width_m, roof_length_m, roof_access, mounting, roof_orientation,
        meter_phase, transformer_count, meter_kind, meter_form, service_disconnect, grounding,
        main_distribution_panel, cb_size_rating, wire_size, connection_type, floor_count,
        system_capacity, package_type, battery_option, panel_option, report_notes,
        created_at, updated_at
    )
    values (
        v_lead_id, v_property_id, v_field, now() - interval '55 days', now() - interval '54 days', 'scheduled',
        'flat', 16, 8, (now() - interval '55 days')::date,
        'evening', 1400, 25000,
        true, true, true, true,
        110, 9, 12, 'ladder', array['hanger_bolt']::text[], array['south']::text[],
        'three', 1, 'main', 'ct_rated', true, true,
        'Schneider 200A', '200A', '4 AWG', 'gprs', 3,
        '16kwp', 'with_battery', '314ah_16kwh', '710_730wp', 'Flat concrete roof, ideal for tilt-mount racking. Recommends 16kWp hybrid.',
        now() - interval '54 days', now() - interval '54 days'
    )
    returning id into v_survey_id;

    insert into public.quotes (lead_id, version, status, total_php, prepared_by_id, created_by, valid_until, created_at, updated_at)
    values (v_lead_id, 1, 'approved', 620000, v_admin, v_admin, (now() - interval '30 days')::date,
            now() - interval '50 days', now() - interval '48 days')
    returning id into v_quote_id;

    insert into public.quote_items (quote_id, description, qty, unit, unit_price_php, line_total_php, sort_order, created_at, updated_at)
    values
        (v_quote_id, '16kWp Hybrid Solar PV System Package', 1, 'system', 620000, 620000, 0, now() - interval '50 days', now() - interval '50 days'),
        (v_quote_id, 'Tier 1 Monocrystalline Panels 710-730W (17 pcs)', 17, 'pc', 0, 0, 1, now() - interval '50 days', now() - interval '50 days'),
        (v_quote_id, 'Hybrid Inverter 16kW', 1, 'pc', 0, 0, 2, now() - interval '50 days', now() - interval '50 days'),
        (v_quote_id, 'Lithium Battery 16kWh', 1, 'pc', 0, 0, 3, now() - interval '50 days', now() - interval '50 days');

    insert into public.contracts (
        lead_id, quote_id, status, signed_at, notes,
        homeowner_name, site_address, phone_number, system_size_kw,
        panel_line, inverter_line, battery_line, price_php, prepared_by_name, contract_date,
        created_at, updated_at
    )
    values (
        v_lead_id, v_quote_id, 'signed', now() - interval '40 days', null,
        'Ricardo Bautista', '9 P. Torres St, Lipa City, Batangas 4217', '09171234505', 16,
        '( 17 PCS ) TIER 1 710-730 WATTS', '( 1 PC/S ) HYBRID INVERTER 16KW', '( 1 PC/S ) LITHIUM BATTERY 16KWH',
        620000, (select name from public.users where id = v_admin), (now() - interval '40 days')::date,
        now() - interval '43 days', now() - interval '40 days'
    )
    returning id into v_contract_id;

    insert into public.installations (
        lead_id, status, scheduled_date, scheduled_end_date, completed_at,
        assigned_crew_ids, materials_checklist, notes, created_at, updated_at
    )
    values (
        v_lead_id, 'completed', (now() - interval '32 days')::date, (now() - interval '30 days')::date, now() - interval '30 days',
        array[v_field],
        '[{"item":"Panels mounted and wired","checked":true},{"item":"Inverter and battery installed","checked":true},{"item":"System commissioned and tested","checked":true}]'::jsonb,
        'Completed on schedule, no issues.',
        now() - interval '35 days', now() - interval '30 days'
    )
    returning id into v_install_id;

    insert into public.service_tickets (
        lead_id, installation_id, title, description, status, priority, assigned_to_id, resolved_at, warranty_related, created_at, updated_at
    )
    values (
        v_lead_id, v_install_id, 'Inverter display blinking red',
        'Customer reports the inverter''s status light blinks red intermittently. No error code visible.',
        'resolved', 'medium', v_field, now() - interval '10 days', true,
        now() - interval '12 days', now() - interval '10 days'
    );

    insert into public.activity_log (lead_id, user_id, action, details, entity_type, entity_id, created_at)
    values
        (v_lead_id, v_admin, 'Lead created', null, 'lead', null, now() - interval '60 days'),
        (v_lead_id, v_field, 'Ocular inspection completed', null, 'survey', v_survey_id::text, now() - interval '54 days'),
        (v_lead_id, v_admin, 'Quote v1 approved', '₱620,000', 'quote', v_quote_id::text, now() - interval '48 days'),
        (v_lead_id, v_admin, 'Contract signed', null, 'contract', v_contract_id::text, now() - interval '40 days'),
        (v_lead_id, v_field, 'Installation marked completed', null, 'installation', v_install_id::text, now() - interval '30 days'),
        (v_lead_id, v_admin, 'Activated as customer', null, 'lead', null, now() - interval '25 days');

    -- ═══ 6. Liza Fernandez — stage: cancelled ═══
    insert into public.leads (first_name, last_name, phone, email, stage, assigned_sales_rep_id, cancelled_reason, cancelled_at, notes, created_at, updated_at, last_activity_at)
    values ('Liza', 'Fernandez', '09171234506', 'liza.fernandez@example.com', 'cancelled', v_admin,
            'Decided to go with a competitor''s cheaper cash-only offer.', now() - interval '5 days',
            null, now() - interval '15 days', now() - interval '5 days', now() - interval '5 days')
    returning id into v_lead_id;

    insert into public.properties (lead_id, address, city, state, zip, property_type, house_unit_block_lot, street_name, barangay, city_municipality, province, zip_code, created_at, updated_at)
    values (v_lead_id, '5 Shoe Ave', 'Marikina City', 'Metro Manila', '1800', 'residential',
            'Lot 9', 'Shoe Ave', 'Sto. Niño', 'Marikina City', 'Metro Manila', '1800',
            now() - interval '15 days', now() - interval '15 days');

    insert into public.activity_log (lead_id, user_id, action, details, entity_type, created_at)
    values
        (v_lead_id, v_admin, 'Lead created', null, 'lead', now() - interval '15 days'),
        (v_lead_id, v_admin, 'Project cancelled', 'Decided to go with a competitor''s cheaper cash-only offer.', 'lead', now() - interval '5 days');

    raise notice 'Dummy data inserted: 6 projects (lead, survey_scheduled, proposal_sent, contract_signed, active_customer, cancelled).';
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- To remove all of this later, uncomment and run:
--
-- begin;
-- delete from public.leads where email in (
--     'juan.delacruz@example.com', 'maria.santos@example.com', 'pedro.reyes@example.com',
--     'ana.gonzales@example.com', 'ricardo.bautista@example.com', 'liza.fernandez@example.com'
-- );
-- commit;
--
-- Everything else (properties, surveys, quotes, quote_items, contracts,
-- installations, service_tickets, activity_log, lead_notes) cascades away
-- with the lead automatically — see the `on delete cascade` foreign keys in
-- 0001_initial_schema.sql.
-- ═══════════════════════════════════════════════════════════════════════════
