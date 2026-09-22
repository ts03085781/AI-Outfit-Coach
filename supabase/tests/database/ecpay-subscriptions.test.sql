begin;
select * from no_plan();
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000091'), ('00000000-0000-4000-8000-000000000092');
select ok(not has_table_privilege(r, 'public.ecpay_orders', p), r || ' cannot ' || p || ' orders')
from unnest(array['anon','authenticated']) r cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) p;
select ok(not has_table_privilege(r, 'public.ecpay_payment_events', p), r || ' cannot ' || p || ' payment events')
from unnest(array['anon','authenticated']) r cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) p;
set local role service_role;
select is((select merchant_trade_no from public.begin_ecpay_checkout('00000000-0000-4000-8000-000000000091','STAGE001','3002607')), 'STAGE001', 'creates checkout');
select is((select merchant_trade_no from public.begin_ecpay_checkout('00000000-0000-4000-8000-000000000091','STAGE002','3002607')), 'STAGE001', 'repeat checkout reuses pending order');
select is((select status from public.get_subscription('00000000-0000-4000-8000-000000000091')), 'pending', 'checkout does not grant access');
select public.apply_ecpay_snapshot('STAGE001', '3002607', '1', '[{"key":"101","success":true,"amount":60,"occurred_at":"2090-01-01T02:00:00Z","period_end":"2090-02-01T02:00:00Z","rtn_code":"1"}]');
select public.apply_ecpay_snapshot('STAGE001', '3002607', '1', '[{"key":"101","success":true,"amount":60,"occurred_at":"2090-01-01T02:00:00Z","period_end":"2090-02-01T02:00:00Z","rtn_code":"1"}]');
select is((select count(*)::int from public.ecpay_payment_events where merchant_trade_no = 'STAGE001'), 1, 'duplicate snapshot does not duplicate payment');
select is((select current_period_end from public.get_subscription('00000000-0000-4000-8000-000000000091')), '2090-02-01T02:00:00Z'::timestamptz, 'duplicate cannot extend entitlement');
select is((select count(*)::int from public.begin_ecpay_checkout('00000000-0000-4000-8000-000000000091','STAGE002','3002607')), 0, 'paid or renewing order cannot create another checkout');
select public.confirm_ecpay_cancellation('STAGE001', '3002607');
select is((select cancel_at_period_end from public.get_subscription('00000000-0000-4000-8000-000000000091')), true, 'confirmed cancellation stops renewal');
select is((select current_period_end from public.get_subscription('00000000-0000-4000-8000-000000000091')), '2090-02-01T02:00:00Z'::timestamptz, 'cancellation preserves paid period');
select public.apply_ecpay_snapshot('STAGE001', '3002607', '1', '[{"key":"101","success":true,"amount":60,"occurred_at":"2090-01-01T02:00:00Z","period_end":"2090-02-01T02:00:00Z","rtn_code":"1"}]');
select is((select cancel_at_period_end from public.get_subscription('00000000-0000-4000-8000-000000000091')), true, 'stale query cannot undo cancellation');
select throws_ok($$select public.apply_ecpay_snapshot('STAGE001','WRONG','1','[]')$$, 'P0001', null, 'merchant mismatch rejected');
select throws_ok($$select public.apply_ecpay_snapshot('STAGE001','3002607','1','[{"key":"102","success":true,"amount":1,"occurred_at":"2090-02-01T02:00:00Z","period_end":"2090-03-01T02:00:00Z","rtn_code":"1"}]')$$, '23514', null, 'incorrect payment amount rejected');
select public.apply_ecpay_snapshot('STAGE001', '3002607', '0', '[{"key":"102","success":true,"amount":60,"occurred_at":"2090-02-01T02:00:00Z","period_end":"2090-03-01T02:00:00Z","rtn_code":"1"}]');
select is((select current_period_end from public.get_subscription('00000000-0000-4000-8000-000000000091')), '2090-03-01T02:00:00Z'::timestamptz, 'an in-flight charge retains paid rights after cancellation');
select public.apply_ecpay_snapshot('STAGE001', '3002607', '1', '[{"key":"101","success":true,"amount":60,"occurred_at":"2090-01-01T02:00:00Z","period_end":"2090-02-01T02:00:00Z","rtn_code":"1"}]');
select is((select current_period_end from public.get_subscription('00000000-0000-4000-8000-000000000091')), '2090-03-01T02:00:00Z'::timestamptz, 'older snapshot cannot shorten paid period');
select * from public.begin_ecpay_checkout('00000000-0000-4000-8000-000000000092','STAGE003','3002607');
select public.record_ecpay_failure('STAGE003','3002607','first','10100050','failure001');
select is((select merchant_trade_no from public.begin_ecpay_checkout('00000000-0000-4000-8000-000000000092','STAGE004','3002607')), 'STAGE004', 'failed first authorization allows a new checkout');
select public.apply_ecpay_snapshot('STAGE003', '3002607', '0', '[{"key":"103","success":true,"amount":60,"occurred_at":"2090-01-01T02:00:00Z","period_end":"2090-02-01T02:00:00Z","rtn_code":"1"}]');
select is((select provider_subscription_id from public.get_subscription('00000000-0000-4000-8000-000000000092')), 'STAGE004', 'old order cannot overwrite replacement subscription');
select throws_ok($$select public.apply_ecpay_snapshot('STAGE001','3002607','1','[{"key":"999","success":true,"amount":60,"occurred_at":"2090-02-01T02:00:00Z","period_end":null,"rtn_code":"1"}]')$$, '23514', null, 'successful payments require an explicit paid-through date');
reset role;
select ok(not has_function_privilege(r, f, 'EXECUTE'), r || ' cannot call ' || f)
from unnest(array['anon','authenticated']) r cross join unnest(array['public.begin_ecpay_checkout(uuid,text,text)','public.apply_ecpay_snapshot(text,text,text,jsonb)','public.confirm_ecpay_cancellation(text,text)','public.record_ecpay_failure(text,text,text,text,text)']) f;
select * from finish();
rollback;
