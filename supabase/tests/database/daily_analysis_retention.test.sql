begin;
select * from no_plan();

select has_function('outfit_maintenance', 'cleanup_daily_analysis_usage', array[]::text[],
  'quota cleanup exists outside the exposed public schema');
select is(outfit_maintenance.daily_analysis_retention_cutoff('2026-09-03 16:10:00+00'),
  date '2026-09-02', 'Taiwan September 4 retains September 2, despite UTC September 3');
select is(outfit_maintenance.daily_analysis_retention_cutoff('2026-08-31 15:59:59+00'),
  date '2026-08-29', 'instant before Taiwan midnight');
select is(outfit_maintenance.daily_analysis_retention_cutoff('2026-08-31 16:00:00+00'),
  date '2026-08-30', 'Taiwan midnight crosses a month');
select is(outfit_maintenance.daily_analysis_retention_cutoff('2026-12-31 16:10:00+00'),
  date '2026-12-30', 'Taiwan January 1 crosses a year');
set local timezone = 'America/Los_Angeles';
select is(outfit_maintenance.daily_analysis_retention_cutoff('2028-02-29 16:10:00+00'),
  date '2028-02-28', 'leap month and session timezone do not change Taiwan retention');

select ok(not has_schema_privilege(r, 'outfit_maintenance', 'USAGE'), r || ' cannot access maintenance schema')
from unnest(array['anon', 'authenticated', 'service_role']) r;
select ok(not has_function_privilege(r, 'outfit_maintenance.cleanup_daily_analysis_usage()', 'EXECUTE'),
  r || ' cannot execute cleanup') from unnest(array['anon', 'authenticated', 'service_role']) r;
set local role anon;
select throws_ok('select outfit_maintenance.cleanup_daily_analysis_usage()', '42501',
  'permission denied for schema outfit_maintenance', 'anon cleanup call rejected');
reset role;
set local role authenticated;
select throws_ok('select outfit_maintenance.cleanup_daily_analysis_usage()', '42501',
  'permission denied for schema outfit_maintenance', 'authenticated cleanup call rejected');
reset role;

-- Isolated local database only; all fixtures and deletes roll back.
delete from public.daily_analysis_usage;
select is(outfit_maintenance.cleanup_daily_analysis_usage(), 0, 'empty table is safe');
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000099');
create temporary table retention_fixture (label text, id uuid default gen_random_uuid());
insert into retention_fixture(label) values
  ('today'), ('yesterday'), ('two-days'), ('old-completed'), ('old-live'),
  ('old-expired'), ('old-exact-expiry'), ('recent-expired'), ('future');
insert into public.daily_analysis_usage(id, user_id, usage_date, status, expires_at, completed_at)
select id, '00000000-0000-4000-8000-000000000099',
  (now() at time zone 'Asia/Taipei')::date + case label
    when 'today' then 0 when 'yesterday' then -1 when 'two-days' then -2
    when 'recent-expired' then -2 when 'future' then 1 else -3 end,
  case when label in ('old-live', 'old-expired', 'old-exact-expiry', 'recent-expired') then 'reserved' else 'completed' end,
  case when label = 'old-live' then now() + interval '1 hour'
    when label = 'old-exact-expiry' then now() else now() - interval '1 hour' end,
  case when label in ('old-live', 'old-expired', 'old-exact-expiry', 'recent-expired') then null else now() end
from retention_fixture;
select is(outfit_maintenance.cleanup_daily_analysis_usage(), 3, 'only old completed and expired reservations deleted');
select results_eq(
  $$select f.label from retention_fixture f join public.daily_analysis_usage u using(id) order by f.label$$,
  $$values ('future'), ('old-live'), ('recent-expired'), ('today'), ('two-days'), ('yesterday')$$,
  'three calendar days and live reservations retained regardless of created_at');
select is(outfit_maintenance.cleanup_daily_analysis_usage(), 0, 'repeat is safe');
select is((select count(*) from auth.users where id = '00000000-0000-4000-8000-000000000099'),
  1::bigint, 'cleanup preserves the account');

insert into public.daily_analysis_usage(user_id, usage_date, status, expires_at, completed_at)
select '00000000-0000-4000-8000-000000000099', (now() at time zone 'Asia/Taipei')::date - 10,
  'completed', now(), now() from generate_series(1, 10005);
select is(outfit_maintenance.cleanup_daily_analysis_usage(), 10000, 'one run stops at the batch bound');
select is(outfit_maintenance.cleanup_daily_analysis_usage(), 5, 'next run clears the remaining backlog');
select is(outfit_maintenance.cleanup_daily_analysis_usage(), 0, 'drained backlog is safe');
select is((select used_count from public.get_daily_analysis_quota('00000000-0000-4000-8000-000000000099')),
  1, 'today quota survives cleanup');

select is((select count(*) from cron.job where jobname = 'ai-outfit-coach-daily-usage-retention-v1'),
  1::bigint, 'one uniquely named cleanup job');
select is((select schedule from cron.job where jobname = 'ai-outfit-coach-daily-usage-retention-v1'),
  '10 16 * * *', 'daily Taiwan 00:10 uses UTC 16:10');
select ok((select active from cron.job where jobname = 'ai-outfit-coach-daily-usage-retention-v1'), 'cleanup scheduled');
select * from finish();
rollback;
