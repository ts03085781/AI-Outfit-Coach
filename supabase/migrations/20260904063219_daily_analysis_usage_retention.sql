-- One bounded transaction per daily invocation; never loop over batches here.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

create extension if not exists pg_cron;

-- Do not silently shift other jobs by changing cron.timezone or database timezone.
do $$
begin
  if coalesce(current_setting('cron.timezone', true), 'GMT') not in ('GMT', 'UTC', 'Etc/UTC', 'Etc/GMT') then
    raise exception 'Daily usage retention requires a UTC/GMT Cron scheduler';
  end if;
  if current_setting('cron.log_run', true) is distinct from 'on' then
    raise exception 'Daily usage retention requires cron.log_run enabled for audit history';
  end if;
  if current_setting('cron.launch_active_jobs', true) = 'off' then
    raise exception 'Daily usage retention requires an enabled Cron scheduler';
  end if;
  if exists (select 1 from cron.job where jobname = 'ai-outfit-coach-daily-usage-retention-v1') then
    raise exception 'Daily usage retention job name already exists; inspect it before migration';
  end if;
end;
$$;

create schema outfit_maintenance;
revoke all on schema outfit_maintenance from public, anon, authenticated, service_role;

create index daily_analysis_usage_retention_idx
  on public.daily_analysis_usage (usage_date, id);

create function outfit_maintenance.daily_analysis_retention_cutoff(p_at timestamptz)
returns date
language sql immutable strict security invoker
set search_path = ''
as $$
  select (p_at at time zone 'Asia/Taipei')::date - 2;
$$;

create function outfit_maintenance.cleanup_daily_analysis_usage()
returns integer
language plpgsql security invoker
set search_path = ''
as $$
declare
  batch_at timestamptz := statement_timestamp();
  deleted_count integer;
begin
  with candidates as materialized (
    select id
    from public.daily_analysis_usage
    where usage_date < outfit_maintenance.daily_analysis_retention_cutoff(batch_at)
      and (status = 'completed' or (status = 'reserved' and expires_at <= batch_at))
    order by usage_date, id
    limit 10000
    for update skip locked
  )
  delete from public.daily_analysis_usage as usage
  using candidates
  where usage.id = candidates.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function outfit_maintenance.daily_analysis_retention_cutoff(timestamptz),
  outfit_maintenance.cleanup_daily_analysis_usage()
  from public, anon, authenticated, service_role;

-- Fixed SQL only: no user identifiers, photos, analysis text or dynamic arguments.
-- Timeout must be set BEFORE the SELECT begins, not inside the function.
select cron.schedule(
  'ai-outfit-coach-daily-usage-retention-v1',
  '10 16 * * *', -- UTC 16:10 = Asia/Taipei 00:10 next day
  $job$set local statement_timeout = '30s';
set local lock_timeout = '2s';
select outfit_maintenance.cleanup_daily_analysis_usage();$job$
);
commit;
