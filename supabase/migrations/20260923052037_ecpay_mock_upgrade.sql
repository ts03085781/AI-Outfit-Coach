-- Mock entitlements cannot block the first real ECPay checkout.
create or replace function public.begin_ecpay_checkout(p_user_id uuid,p_trade_no text,p_merchant_id text,p_environment text default 'stage')
returns setof public.ecpay_orders language plpgsql security invoker set search_path = '' as $$
declare v_sub public.subscriptions; v_order public.ecpay_orders;
begin
  if p_environment is null or p_environment not in ('stage','production') then raise exception 'Invalid environment'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,612));
  select * into v_sub from public.subscriptions where user_id = p_user_id for update;
  if found and v_sub.provider = 'ecpay' and v_sub.provider_environment is distinct from p_environment then raise exception 'Cannot replace a live subscription'; end if;
  if found and v_sub.provider = 'ecpay' and v_sub.current_period_end > now() and v_sub.status in ('active','past_due') then return; end if;
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

