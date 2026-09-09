-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — seed the five standard hybrid packages
--
-- The line items carry no per-item price (only a total was given per
-- package) — `unit_price_php` stays 0 on every item, and the quote builder's
-- existing "package price rides on the first line item, labelled explicitly"
-- behaviour (ItemPickerModal.tsx) puts the package's `base_price_php` on the
-- panel line when one of these is expanded into a quote.
--
-- Guarded by name so re-running this migration does not duplicate rows if it
-- has already been applied.
--
-- Apply after 0020. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
    v_package_id uuid;
    v_row        record;
begin
    for v_row in
        select * from (values
            ('3kWp Hybrid PV System (with Battery)', 3.00, 215000.00, 1,
             '5 pcs Tier 1 solar panels · Solis 6kW hybrid inverter · Pylontech/Dyness 5kWh battery',
             'Tier 1 Solar Panel 620/625W', 5,
             'Solis 6kW Hybrid Inverter', 1,
             'Pylontech / Dyness 100Ah / 5kWh Battery', 1),
            ('6kWp Hybrid PV System (with Battery)', 6.00, 291500.00, 2,
             '12 pcs Tier 1 solar panels · Solis 6kW hybrid inverter · Pylontech/Dyness 5kWh battery',
             'Tier 1 Solar Panel 620/625W', 12,
             'Solis 6kW Hybrid Inverter', 1,
             'Pylontech / Dyness 100Ah / 5kWh Battery', 1),
            ('8kWp Hybrid PV System (with Battery)', 8.00, 432800.00, 3,
             '14 pcs Tier 1 solar panels · Solis 8kW hybrid inverter · Pylontech/Dyness 16kWh battery',
             'Tier 1 Solar Panel 620/625W', 14,
             'Solis 8kW Hybrid Inverter', 1,
             'Pylontech / Dyness 314Ah / 16kWh Battery', 1),
            ('12kWp Hybrid PV System (with Battery)', 12.00, 524400.00, 4,
             '20 pcs Tier 1 solar panels · Solis 12kW hybrid inverter · Pylontech/Dyness 16kWh battery',
             'Tier 1 Solar Panel 620/625W', 20,
             'Solis 12kW Hybrid Inverter', 1,
             'Pylontech / Dyness 314Ah / 16kWh Battery', 1),
            ('16kWp Hybrid PV System (with Battery)', 16.00, 684400.00, 5,
             '30 pcs Tier 1 solar panels · Solis 16kW hybrid inverter · Pylontech/Dyness 16kWh battery',
             'Tier 1 Solar Panel 620/625W', 30,
             'Solis 16kW Hybrid Inverter', 1,
             'Pylontech / Dyness 314Ah / 16kWh Battery', 1)
        ) as t(
            name, system_size_kw, base_price_php, sort_order, description,
            panel_name, panel_qty,
            inverter_name, inverter_qty,
            battery_name, battery_qty
        )
    loop
        if exists (select 1 from public.packages where name = v_row.name) then
            continue;
        end if;

        insert into public.packages (
            name, description, system_size_kw, base_price_php, is_active, sort_order
        )
        values (
            v_row.name, v_row.description, v_row.system_size_kw, v_row.base_price_php,
            true, v_row.sort_order
        )
        returning id into v_package_id;

        insert into public.package_items (package_id, name, qty, unit, unit_price_php, sort_order)
        values
            (v_package_id, v_row.panel_name, v_row.panel_qty, 'pcs', 0, 1),
            (v_package_id, v_row.inverter_name, v_row.inverter_qty, 'pc', 0, 2),
            (v_package_id, v_row.battery_name, v_row.battery_qty, 'pc', 0, 3);
    end loop;
end;
$$;
