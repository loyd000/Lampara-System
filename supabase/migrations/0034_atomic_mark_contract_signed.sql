-- markContractSigned (queries/contracts.ts) flipped the contract's status to
-- 'signed', then called advance_lead_stage as a separate round trip. If the
-- stage-advance step threw after the status update had already committed, the
-- contract was left signed while the lead never reached contract_signed — the
-- two disagreeing with no compensating rollback. Same fix shape as
-- create_contract: one function, one transaction.
--
-- SECURITY INVOKER, same reasoning as create_contract — contracts_update
-- (superadmin/admin only) still decides who may call this; advance_lead_stage
-- is SECURITY DEFINER already and does its own role check independently.

create or replace function public.mark_contract_signed(p_contract_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_status  text;
    v_lead_id uuid;
begin
    select status, lead_id into v_status, v_lead_id
    from public.contracts
    where id = p_contract_id
    for update;

    if not found then
        raise exception 'Contract not found' using errcode = '23514';
    end if;

    if v_status = 'signed' then
        raise exception 'Contract is already signed' using errcode = '23514';
    end if;

    update public.contracts
       set status    = 'signed',
           signed_at = now()
     where id = p_contract_id;

    perform public.advance_lead_stage(v_lead_id, 'contract_signed');

    insert into public.activity_log(lead_id, user_id, action, entity_type, entity_id)
    values(v_lead_id, auth.uid(), 'Contract signed', 'contract', p_contract_id::text);
end;
$$;

revoke all on function public.mark_contract_signed(uuid) from public, anon;
grant execute on function public.mark_contract_signed(uuid) to authenticated;
