-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — contract DOCX generation fields (Phase 7)
--
-- The `contracts` table (0001) has always been a pointer + manual-upload
-- record: lead_id, quote_id, status, signed_at, document_path, notes. It
-- carries none of the fields `Contract Sample.docx` needs to fill itself in.
--
-- This adds a snapshot of those fields onto `contracts`, populated by
-- `create_contract` at creation time from the lead/property/quote — the same
-- "snapshot so the document doesn't silently change later" approach 0016 took
-- for quote_items. Staff can still edit the snapshot before generating the
-- DOCX (see `update_contract_details`), so a wrong auto-fill or an
-- underlying record edited afterward doesn't require recreating the contract.
--
-- Price-in-words is deliberately NOT stored here — it's derived client-side
-- from `price_php` at generation time so it can never drift out of sync with
-- the number it's supposed to spell out.
--
-- Apply after 0017. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.contracts
    add column if not exists homeowner_name   text,
    add column if not exists site_address     text,
    add column if not exists phone_number     text,
    add column if not exists system_size_kw   numeric(6,2),
    add column if not exists panel_line       text,
    add column if not exists inverter_line    text,
    add column if not exists battery_line     text,
    add column if not exists price_php        numeric(12,2),
    add column if not exists prepared_by_name text,
    add column if not exists contract_date    date;

-- ─── update_contract_details: staff edits the snapshot before generating ───

create or replace function public.update_contract_details(
    p_contract_id     uuid,
    p_homeowner_name  text,
    p_site_address    text,
    p_phone_number    text,
    p_system_size_kw  numeric,
    p_panel_line      text,
    p_inverter_line   text,
    p_battery_line    text,
    p_price_php       numeric,
    p_prepared_by_name text,
    p_contract_date   date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.has_role('superadmin', 'admin') then
        raise exception 'Insufficient permissions' using errcode = '42501';
    end if;

    update public.contracts
       set homeowner_name   = nullif(btrim(p_homeowner_name), ''),
           site_address     = nullif(btrim(p_site_address), ''),
           phone_number     = nullif(btrim(p_phone_number), ''),
           system_size_kw   = p_system_size_kw,
           panel_line       = nullif(btrim(p_panel_line), ''),
           inverter_line    = nullif(btrim(p_inverter_line), ''),
           battery_line     = nullif(btrim(p_battery_line), ''),
           price_php        = p_price_php,
           prepared_by_name = nullif(btrim(p_prepared_by_name), ''),
           contract_date    = p_contract_date
     where id = p_contract_id;

    if not found then
        raise exception 'Contract not found' using errcode = '02000';
    end if;
end;
$$;

grant execute on function public.update_contract_details(
    uuid, text, text, text, numeric, text, text, text, numeric, text, date
) to authenticated;

-- ─── create_contract: snapshot the fields at creation time ─────────────────

create or replace function public.create_contract(p_lead_id uuid, p_quote_id uuid, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_version        integer;
    v_contract_id    uuid;
    v_lead           record;
    v_property       record;
    v_quote          record;
    v_panel_item     record;
    v_inverter_item  record;
    v_battery_item   record;
    v_prepared_by    text;
begin
    if not public.has_role('superadmin', 'admin') then
        raise exception 'Insufficient permissions' using errcode = '42501';
    end if;

    select version, total_php, prepared_by_id
      into v_quote
      from public.quotes
     where id = p_quote_id and lead_id = p_lead_id
       for update;

    if not found then
        raise exception 'Quote does not belong to this lead' using errcode = '23514';
    end if;
    v_version := v_quote.version;

    update public.quotes
       set status = 'approved'
     where id = p_quote_id and status <> 'approved';

    select first_name, last_name, phone into v_lead
      from public.leads
     where id = p_lead_id;

    select address, city, state, zip into v_property
      from public.properties
     where lead_id = p_lead_id
     order by created_at
     limit 1;

    select name into v_prepared_by
      from public.users
     where id = v_quote.prepared_by_id;

    select description, qty, unit into v_panel_item
      from public.quote_items
     where quote_id = p_quote_id and description ilike '%panel%'
     order by sort_order
     limit 1;

    select description, qty, unit into v_inverter_item
      from public.quote_items
     where quote_id = p_quote_id and description ilike '%invert%'
     order by sort_order
     limit 1;

    select description, qty, unit into v_battery_item
      from public.quote_items
     where quote_id = p_quote_id and description ilike '%batter%'
     order by sort_order
     limit 1;

    begin
        insert into public.contracts(
            lead_id, quote_id, status, notes,
            homeowner_name, site_address, phone_number,
            panel_line, inverter_line, battery_line,
            price_php, prepared_by_name, contract_date
        )
        values(
            p_lead_id, p_quote_id, 'pending_signature', nullif(p_notes, ''),
            nullif(btrim(concat_ws(' ', v_lead.first_name, v_lead.last_name)), ''),
            case when v_property.address is not null
                 then concat_ws(', ', v_property.address, v_property.city,
                                 concat_ws(' ', v_property.state, v_property.zip))
                 else null end,
            v_lead.phone,
            case when v_panel_item.description is not null
                 then '( ' || trim(to_char(v_panel_item.qty, 'FM999999990')) || ' ' ||
                      v_panel_item.unit || ' ) ' || v_panel_item.description
                 else null end,
            case when v_inverter_item.description is not null
                 then '( ' || trim(to_char(v_inverter_item.qty, 'FM999999990')) || ' ' ||
                      v_inverter_item.unit || ' ) ' || v_inverter_item.description
                 else null end,
            case when v_battery_item.description is not null
                 then '( ' || trim(to_char(v_battery_item.qty, 'FM999999990')) || ' ' ||
                      v_battery_item.unit || ' ) ' || v_battery_item.description
                 else null end,
            v_quote.total_php,
            v_prepared_by,
            current_date
        )
        returning id into v_contract_id;
    exception when unique_violation then
        raise exception 'A contract already exists for this lead';
    end;

    perform public.advance_lead_stage(p_lead_id, 'contract_signed'::text);

    insert into public.activity_log(lead_id, user_id, action, details, entity_type, entity_id)
    values(p_lead_id, auth.uid(), 'Contract created — pending signature',
           'Based on quote v' || v_version, 'contract', v_contract_id::text);

    return v_contract_id;
end;
$$;

grant execute on function public.create_contract(uuid, uuid, text) to authenticated;
