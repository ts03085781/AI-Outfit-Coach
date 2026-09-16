-- One current entitlement per user. Payment/event history comes with the provider integration.
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan_code text not null default 'unlimited_monthly' check (plan_code = 'unlimited_monthly'),
  amount_twd integer not null default 60 check (amount_twd = 60),
  billing_interval text not null default 'month' check (billing_interval = 'month'),
  status text not null default 'pending' check (status in ('pending', 'active', 'past_due', 'expired')),
  provider text not null check (provider in ('mock', 'ecpay')),
  provider_subscription_id text unique,
  started_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancel_requested_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((current_period_start is null and current_period_end is null) or (current_period_start is not null and current_period_end is not null and current_period_end > current_period_start)),
  check (status not in ('active', 'past_due') or (current_period_start is not null and current_period_end is not null)),
  check (cancel_at_period_end = (cancel_requested_at is not null))
);
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from public, anon, authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.subscriptions to service_role;
create policy subscriptions_read_own on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);

create function public.get_subscription(p_user_id uuid)
returns setof public.subscriptions language sql stable security invoker set search_path = '' as $$
  select * from public.subscriptions where user_id = p_user_id;
$$;

-- Calendar month in Taiwan, clamped by PostgreSQL for dates such as January 31.
create function public.subscription_next_month(p_start timestamptz)
returns timestamptz language sql immutable security invoker set search_path = '' as $$
  select ((p_start at time zone 'Asia/Taipei') + interval '1 month') at time zone 'Asia/Taipei';
$$;

create function public.activate_mock_subscription(p_user_id uuid)
returns setof public.subscriptions language plpgsql security invoker set search_path = '' as $$
declare v_now timestamptz := now(); v_row public.subscriptions;
begin
  -- Serialize activation and cancellation even when a user has no row yet.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 612));
  select * into v_row from public.subscriptions where user_id = p_user_id for update;
  if found then
    if v_row.provider <> 'mock' then raise exception 'Provider integration unavailable' using errcode = 'P0002'; end if;
    -- Repeated requests never extend a paid period or undo cancellation.
    if v_row.current_period_end > v_now then return query select * from public.get_subscription(p_user_id); return; end if;
  end if;
  insert into public.subscriptions(user_id, provider, status, started_at, current_period_start, current_period_end)
    values (p_user_id, 'mock', 'active', v_now, v_now, public.subscription_next_month(v_now))
    on conflict (user_id) do update set status = 'active', current_period_start = v_now,
      current_period_end = public.subscription_next_month(v_now), cancel_at_period_end = false,
      cancel_requested_at = null, ended_at = null, updated_at = v_now;
  return query select * from public.get_subscription(p_user_id);
end;
$$;

create function public.cancel_mock_subscription(p_user_id uuid)
returns setof public.subscriptions language plpgsql security invoker set search_path = '' as $$
declare v_row public.subscriptions;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 612));
  select * into v_row from public.subscriptions where user_id = p_user_id for update;
  if not found then return; end if;
  if v_row.provider <> 'mock' then raise exception 'Provider integration unavailable' using errcode = 'P0002'; end if;
  if not v_row.cancel_at_period_end and v_row.status in ('active', 'past_due') and v_row.current_period_end > now() then
    update public.subscriptions set cancel_at_period_end = true, cancel_requested_at = now(), updated_at = now() where user_id = p_user_id;
  end if;
  return query select * from public.get_subscription(p_user_id);
end;
$$;

revoke all on function public.get_subscription(uuid), public.subscription_next_month(timestamptz), public.activate_mock_subscription(uuid), public.cancel_mock_subscription(uuid) from public, anon, authenticated;
grant execute on function public.get_subscription(uuid), public.subscription_next_month(timestamptz), public.activate_mock_subscription(uuid), public.cancel_mock_subscription(uuid) to service_role;
