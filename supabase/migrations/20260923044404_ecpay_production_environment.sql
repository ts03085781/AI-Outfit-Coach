-- Preserve existing stage data and introduce explicitly scoped production operations.
alter table public.ecpay_orders drop constraint ecpay_orders_environment_check;
alter table public.ecpay_orders add constraint ecpay_orders_environment_check check (environment in ('stage','production'));
-- Retain the one-open-agreement-per-user invariant across environments.
drop function public.begin_ecpay_checkout(uuid,text,text);
drop function public.confirm_ecpay_cancellation(text,text);
drop function public.apply_ecpay_snapshot(text,text,text,jsonb);
drop function public.record_ecpay_failure(text,text,text,text,text);
drop function public.claim_ecpay_sync(text,text);

create function public.begin_ecpay_checkout(p_user_id uuid,p_trade_no text,p_merchant_id text,p_environment text default 'stage')
returns setof public.ecpay_orders language plpgsql security invoker set search_path = '' as $$
declare v_sub public.subscriptions; v_order public.ecpay_orders;
begin
  if p_environment is null or p_environment not in ('stage','production') then raise exception 'Invalid environment'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,612));
  select * into v_sub from public.subscriptions where user_id = p_user_id for update;
  if found and v_sub.provider = 'ecpay' and v_sub.provider_environment is distinct from p_environment then raise exception 'Cannot replace a live subscription'; end if;
  if found and v_sub.current_period_end > now() and v_sub.status in ('active','past_due') then return; end if;
  select * into v_order from public.ecpay_orders where user_id = p_user_id and status in ('pending','active') for update;
  if found then
    if v_order.merchant_id <> p_merchant_id or v_order.environment <> p_environment then raise exception 'Merchant configuration mismatch'; end if;
    if v_order.status = 'pending' then return next v_order; end if;
    return;
  end if;
  insert into public.ecpay_orders(merchant_trade_no,user_id,merchant_id,environment) values (p_trade_no,p_user_id,p_merchant_id,p_environment) returning * into v_order;
  insert into public.subscriptions(user_id,provider,provider_environment,provider_subscription_id,status)
    values (p_user_id,'ecpay',p_environment,p_trade_no,'pending')
    on conflict (user_id) do update set provider = 'ecpay',provider_environment = p_environment,provider_subscription_id = p_trade_no,
      status = 'pending',current_period_start = null,current_period_end = null,started_at = null,
      cancel_at_period_end = false,cancel_requested_at = null,ended_at = null,updated_at = now();
  return next v_order;
end;
$$;

create function public.confirm_ecpay_cancellation(p_trade_no text,p_merchant_id text,p_environment text default 'stage')
returns void language plpgsql security invoker set search_path = '' as $$
declare v_order public.ecpay_orders;
begin
  select * into v_order from public.ecpay_orders where merchant_trade_no = p_trade_no;
  if not found or v_order.merchant_id <> p_merchant_id or p_environment is null or v_order.environment <> p_environment then raise exception 'Unknown order'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_order.user_id::text,612));
  update public.ecpay_orders set status = 'terminated',cancel_confirmed_at = coalesce(cancel_confirmed_at,now()),updated_at = now(),next_sync_at = now()
    where merchant_trade_no = p_trade_no returning * into v_order;
  update public.subscriptions set cancel_at_period_end = true,cancel_requested_at = v_order.cancel_confirmed_at,
    ended_at = coalesce(ended_at,now()),updated_at = now()
    where user_id = v_order.user_id and provider = 'ecpay' and provider_environment = p_environment and provider_subscription_id = p_trade_no;
end;
$$;

create function public.apply_ecpay_snapshot(p_trade_no text,p_merchant_id text,p_exec_status text,p_events jsonb,p_environment text default 'stage')
returns void language plpgsql security invoker set search_path = '' as $$
declare v_order public.ecpay_orders; v_event jsonb; v_paid public.ecpay_payment_events; v_latest public.ecpay_payment_events; v_start timestamptz;
begin
  if p_exec_status not in ('0','1','2') or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 2000 then raise exception 'Invalid snapshot'; end if;
  select * into v_order from public.ecpay_orders where merchant_trade_no = p_trade_no;
  if not found or v_order.merchant_id <> p_merchant_id or p_environment is null or v_order.environment <> p_environment then raise exception 'Unknown order'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_order.user_id::text,612));
  select * into v_order from public.ecpay_orders where merchant_trade_no = p_trade_no for update;
  for v_event in select value from jsonb_array_elements(p_events) loop
    insert into public.ecpay_payment_events(merchant_trade_no,event_key,success,amount,occurred_at,period_end,rtn_code)
      values(p_trade_no,v_event->>'key',(v_event->>'success')::boolean,(v_event->>'amount')::integer,
        (v_event->>'occurred_at')::timestamptz,(v_event->>'period_end')::timestamptz,v_event->>'rtn_code')
      on conflict (merchant_trade_no,event_key) do nothing;
    -- A repeated authorization must have exactly the same immutable payment details.
    if not exists (select 1 from public.ecpay_payment_events where merchant_trade_no = p_trade_no and event_key = v_event->>'key'
      and success = (v_event->>'success')::boolean and amount = (v_event->>'amount')::integer
      and occurred_at = (v_event->>'occurred_at')::timestamptz and period_end is not distinct from (v_event->>'period_end')::timestamptz
      and rtn_code = v_event->>'rtn_code') then raise exception 'Conflicting authorization'; end if;
  end loop;
  select * into v_paid from public.ecpay_payment_events where merchant_trade_no = p_trade_no and success order by period_end desc limit 1;
  select * into v_latest from public.ecpay_payment_events where merchant_trade_no = p_trade_no order by occurred_at desc,success desc limit 1;
  select min(occurred_at) into v_start from public.ecpay_payment_events where merchant_trade_no = p_trade_no and success;
  update public.ecpay_orders set
    status = case when status = 'terminated' or p_exec_status in ('0','2') then 'terminated' when v_paid.event_key is not null then 'active' else status end,
    cancel_confirmed_at = case when p_exec_status in ('0','2') then coalesce(cancel_confirmed_at,now()) else cancel_confirmed_at end,
    last_synced_at = now(),next_sync_at = now() + interval '1 minute',updated_at = now()
    where merchant_trade_no = p_trade_no returning * into v_order;
  update public.subscriptions set
    status = case when v_paid.event_key is not null then case when v_latest.success then 'active' else 'past_due' end
      when v_order.status in ('terminated','failed') then 'expired' else 'pending' end,
    started_at = v_start,current_period_start = v_paid.occurred_at,current_period_end = v_paid.period_end,
    cancel_at_period_end = v_order.cancel_confirmed_at is not null,cancel_requested_at = v_order.cancel_confirmed_at,
    ended_at = case when v_order.status = 'terminated' then coalesce(ended_at,now()) else ended_at end,updated_at = now()
    where user_id = v_order.user_id and provider = 'ecpay' and provider_environment = p_environment and provider_subscription_id = p_trade_no;
end;
$$;

create function public.record_ecpay_failure(p_trade_no text,p_merchant_id text,p_kind text,p_rtn_code text,p_event_key text,p_environment text default 'stage')
returns void language plpgsql security invoker set search_path = '' as $$
declare v_order public.ecpay_orders;
begin
  if p_kind not in ('first','period') or p_rtn_code = '1' then raise exception 'Invalid failure'; end if;
  select * into v_order from public.ecpay_orders where merchant_trade_no = p_trade_no;
  if not found or v_order.merchant_id <> p_merchant_id or p_environment is null or v_order.environment <> p_environment then raise exception 'Unknown order'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_order.user_id::text,612));
  insert into public.ecpay_payment_events(merchant_trade_no,event_key,success,amount,occurred_at,rtn_code)
    values(p_trade_no,'failure:' || p_event_key,false,0,now(),p_rtn_code) on conflict do nothing;
  if p_kind = 'first' and not exists(select 1 from public.ecpay_payment_events where merchant_trade_no = p_trade_no and success) then
    update public.ecpay_orders set status = 'failed',updated_at = now() where merchant_trade_no = p_trade_no and status = 'pending';
    update public.subscriptions set status = 'expired',updated_at = now()
      where provider_subscription_id = p_trade_no and provider = 'ecpay' and provider_environment = p_environment and status = 'pending';
  else
    update public.subscriptions set status = 'past_due',updated_at = now()
      where provider_subscription_id = p_trade_no and provider = 'ecpay' and provider_environment = p_environment and status = 'active';
  end if;
end;
$$;

create function public.claim_ecpay_sync(p_trade_no text,p_merchant_id text,p_environment text default 'stage')
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.ecpay_orders set next_sync_at = now() + interval '1 minute'
    where merchant_trade_no = p_trade_no and merchant_id = p_merchant_id and environment = p_environment and next_sync_at <= now();
  return found;
end;
$$;


revoke all on function public.begin_ecpay_checkout(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.begin_ecpay_checkout(uuid,text,text,text) to service_role;
revoke all on function public.confirm_ecpay_cancellation(text,text,text) from public,anon,authenticated;
grant execute on function public.confirm_ecpay_cancellation(text,text,text) to service_role;
revoke all on function public.apply_ecpay_snapshot(text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.apply_ecpay_snapshot(text,text,text,jsonb,text) to service_role;
revoke all on function public.record_ecpay_failure(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_ecpay_failure(text,text,text,text,text,text) to service_role;
revoke all on function public.claim_ecpay_sync(text,text,text) from public,anon,authenticated;
grant execute on function public.claim_ecpay_sync(text,text,text) to service_role;

-- Deployment checks read aggregate metadata only; never query the payment gateway.
create function public.ecpay_deployment_readiness(p_environment text,p_merchant_id text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_environment is null or p_environment not in ('stage','production') then raise exception 'Invalid environment'; end if;
  return jsonb_build_object(
    'schema_version', 2,
    'mismatched_merchant_orders', (select count(*) from public.ecpay_orders where environment = p_environment and merchant_id is distinct from p_merchant_id),
    'foreign_environment_orders', (select count(*) from public.ecpay_orders where environment <> p_environment),
    'unscoped_subscriptions', (select count(*) from public.subscriptions where provider = 'ecpay' and provider_environment is null),
    'due_orders', (select count(*) from public.ecpay_orders where environment = p_environment and next_sync_at <= now() and
      (status in ('pending','active') or (status = 'terminated' and cancel_confirmed_at >= now() - interval '7 days'))),
    'private_tables', (select bool_and(c.relrowsecurity and not has_table_privilege('anon',c.oid,'SELECT') and not has_table_privilege('authenticated',c.oid,'SELECT')) from pg_catalog.pg_class c where c.oid in ('public.ecpay_orders'::regclass,'public.ecpay_payment_events'::regclass))
  );
end;
$$;
revoke all on function public.ecpay_deployment_readiness(text,text) from public,anon,authenticated;
grant execute on function public.ecpay_deployment_readiness(text,text) to service_role;
