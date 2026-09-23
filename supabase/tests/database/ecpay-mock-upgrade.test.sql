begin;
select * from no_plan();
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000094');
insert into public.subscriptions(user_id,provider,status,current_period_start,current_period_end)
values ('00000000-0000-4000-8000-000000000094','mock','active',now()-interval '1 day',now()+interval '29 days');
set local role service_role;
select is((select merchant_trade_no from public.begin_ecpay_checkout('00000000-0000-4000-8000-000000000094','MOCKTOLIVE001','9999999','production')),'MOCKTOLIVE001','unexpired mock subscription may start real checkout');
select is((select status from public.get_subscription('00000000-0000-4000-8000-000000000094')),'pending','mock rights do not transfer to unpaid checkout');
select is((select provider_environment from public.get_subscription('00000000-0000-4000-8000-000000000094')),'production','new order uses production environment');
select is((select current_period_end from public.get_subscription('00000000-0000-4000-8000-000000000094')),null::timestamptz,'mock paid-through date is cleared');
select * from finish();
rollback;
