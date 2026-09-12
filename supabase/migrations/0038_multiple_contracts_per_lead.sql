-- A lead used to get exactly one contract, ever — `contracts.lead_id` was
-- UNIQUE. That stopped a revised/re-approved quote from ever getting its own
-- contract: once the first one existed, create_contract failed for every
-- quote on that lead afterward, cancelled or not.
--
-- Contracts now follow the same "one per quote version" shape quotes
-- themselves already have: the uniqueness moves from the lead to the quote,
-- so a lead can carry several contracts (one per quote that was ever
-- generated from), but never two for the same quote. Signing one contract
-- has no effect on the others — each keeps its own independent status, same
-- as today.

alter table public.contracts
    drop constraint if exists contracts_lead_id_key;

alter table public.contracts
    add constraint contracts_quote_id_key unique (quote_id);

-- Same body as the live create_contract (0031), except the exception this
-- raises when a quote already has a contract — the constraint it's reporting
-- moved from lead_id to quote_id, so the message should say so.
create or replace function public.create_contract(
    p_lead_id uuid, p_quote_id uuid, p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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
        raise exception 'A contract already exists for this quote';
    end;

    -- Approving the quote is what moved this lead to Proposal Sent; signing
    -- the contract is what moves it on from there.
    insert into public.activity_log(lead_id, user_id, action, details, entity_type, entity_id)
    values(p_lead_id, auth.uid(), 'Contract created — pending signature',
           'Based on quote v' || v_version, 'contract', v_contract_id::text);

    return v_contract_id;
end;
$function$;

grant execute on function public.create_contract(uuid, uuid, text) to authenticated;
