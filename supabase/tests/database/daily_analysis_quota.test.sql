begin;
select * from no_plan();

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'quota-one@example.test', now(), now()),
  ('00000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'quota-two@example.test', now(), now());

select ok(not has_table_privilege('anon', 'public.daily_analysis_usage', 'SELECT'), 'anon cannot select usage');
select ok(not has_table_privilege('anon', 'public.daily_analysis_usage', 'INSERT'), 'anon cannot insert usage');
select ok(not has_table_privilege('authenticated', 'public.daily_analysis_usage', 'SELECT'), 'authenticated cannot select usage');
select ok(not has_table_privilege('authenticated', 'public.daily_analysis_usage', 'INSERT'), 'authenticated cannot insert usage');
select ok(not has_table_privilege('authenticated', 'public.daily_analysis_usage', 'UPDATE'), 'authenticated cannot update usage');
select ok(not has_table_privilege('authenticated', 'public.daily_analysis_usage', 'DELETE'), 'authenticated cannot delete usage');
select ok(not has_function_privilege('authenticated', 'public.reserve_daily_analysis(uuid,uuid)', 'EXECUTE'), 'authenticated cannot reserve');
select ok(has_function_privilege('service_role', 'public.reserve_daily_analysis(uuid,uuid)', 'EXECUTE'), 'service role can reserve');

select is(
  (select usage_date from public.analysis_quota_time('2026-09-01 15:59:59+00')),
  date '2026-09-01',
  'UTC 15:59:59 belongs to the current Taiwan day'
);
select is(
  (select usage_date from public.analysis_quota_time('2026-09-01 16:00:00+00')),
  date '2026-09-02',
  'UTC 16:00 begins the next Taiwan day'
);
select is(
  (select reset_at from public.analysis_quota_time('2026-09-01 15:59:59+00')),
  timestamptz '2026-09-01 16:00:00+00',
  'reset is the next Taiwan midnight'
);

set local role service_role;
select is((select outcome from public.reserve_daily_analysis(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
)), 'reserved', 'first slot is reserved');
select is((select outcome from public.reserve_daily_analysis(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
)), 'reserved', 'same idempotency key does not allocate twice');

select is((select outcome from public.reserve_daily_analysis(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002'
)), 'reserved', 'second slot is reserved');
select is((select outcome from public.reserve_daily_analysis(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003'
)), 'reserved', 'third slot is reserved');
select is((select outcome from public.reserve_daily_analysis(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004'
)), 'slots_busy', 'a fourth live request is temporarily busy');

select is((select outcome from public.complete_daily_analysis(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
)), 'completed', 'a live reservation completes');
select is((select outcome from public.complete_daily_analysis(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
)), 'completed', 'completion is idempotent');
select is(public.release_daily_analysis(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
), 'already_completed', 'release observes the completed transition');
select is((select used_count from public.get_daily_analysis_quota(
  '00000000-0000-4000-8000-000000000001'
)), 1, 'one completed result is counted');

select is(public.release_daily_analysis(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002'
), 'released', 'a live reservation is released');
select is(public.release_daily_analysis(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002'
), 'released', 'release is idempotent');

insert into public.daily_analysis_usage (
  id, user_id, usage_date, status, expires_at
) values (
  '10000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000001',
  (now() at time zone 'Asia/Taipei')::date,
  'reserved',
  now() - interval '1 minute'
);
select is((select outcome from public.reserve_daily_analysis(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004'
)), 'reserved', 'expired same id can be reused');
select ok((select expires_at > now() from public.daily_analysis_usage
  where id = '10000000-0000-4000-8000-000000000004'), 'same id was reallocated as a live reservation');

select is((select outcome from public.complete_daily_analysis(
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003'
)), 'invalid_reservation', 'another user cannot complete a reservation');
select is((select outcome from public.complete_daily_analysis(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003'
)), 'completed', 'second result completes');
select is((select outcome from public.complete_daily_analysis(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004'
)), 'completed', 'third result completes');
select is((select outcome from public.reserve_daily_analysis(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000006'
)), 'daily_limit_reached', 'three completed results block another day slot');

insert into public.daily_analysis_usage (
  id, user_id, usage_date, status, expires_at, completed_at
) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', (now() at time zone 'Asia/Taipei')::date - 1, 'completed', now() - interval '1 day', now() - interval '1 day'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', (now() at time zone 'Asia/Taipei')::date - 1, 'completed', now() - interval '1 day', now() - interval '1 day'),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', (now() at time zone 'Asia/Taipei')::date - 1, 'completed', now() - interval '1 day', now() - interval '1 day');
select is((select outcome from public.reserve_daily_analysis(
  '00000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000004'
)), 'reserved', 'previous-day completions do not consume today');

reset role;
delete from auth.users where id = '00000000-0000-4000-8000-000000000002';
select is((select count(*)::integer from public.daily_analysis_usage
  where user_id = '00000000-0000-4000-8000-000000000002'), 0, 'auth-user deletion cascades quota rows');

select * from finish();
rollback;
