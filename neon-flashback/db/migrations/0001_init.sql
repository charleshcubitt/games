-- games-portal initial schema
-- Run against a Neon branch with Neon Auth already enabled (so the
-- neon_auth."user" table this migration references already exists).

create table games (
  id serial primary key,
  slug text unique not null,
  name text not null,
  has_demo boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Drives account-wide access -- no game_id, since access is sold as an
-- all-access pass rather than per game.
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references neon_auth."user" (id),
  provider text not null default 'paypal',
  provider_subscription_id text not null,
  status text not null, -- active | past_due | canceled | expired | suspended
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

-- Vouchers grant temporary or permanent access without payment.
create table vouchers (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  grants_days int, -- null = permanent
  max_redemptions int not null default 1,
  redeemed_count int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references vouchers (id),
  user_id uuid not null references neon_auth."user" (id),
  redeemed_at timestamptz not null default now(),
  unique (voucher_id, user_id)
);

-- Raw payment/txn audit trail, separate from subscription lifecycle state.
create table payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references neon_auth."user" (id),
  subscription_id uuid references subscriptions (id),
  provider text not null default 'paypal',
  provider_txn_id text not null,
  amount numeric(10, 2) not null,
  currency text not null default 'USD',
  status text not null, -- completed | refunded | failed
  created_at timestamptz not null default now(),
  unique (provider, provider_txn_id)
);

-- One row per play session. user_id is null for anonymous demo play.
create table game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references neon_auth."user" (id),
  game_id int not null references games (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  score int,
  client_info jsonb
);

-- Append-only security/event log -- see 0002_audit_log_append_only.sql
-- for the trigger that enforces this.
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references neon_auth."user" (id),
  event_type text not null, -- 'subscription.activated', 'voucher.redeemed', ...
  detail jsonb,
  created_at timestamptz not null default now()
);

-- Collapses "does this user currently have access" into one query,
-- regardless of whether it came from a subscription or a voucher.
create view active_access as
  select user_id from subscriptions
    where status = 'active' and current_period_end > now()
  union
  select vr.user_id from voucher_redemptions vr
    join vouchers v on v.id = vr.voucher_id
    where v.grants_days is null
       or vr.redeemed_at + (v.grants_days || ' days')::interval > now();

-- Seed the two v1 games. battletank stays out until it's ready.
insert into games (slug, name, has_demo, active) values
  ('space-ship', 'Space Ship', true, true),
  ('word-game', 'Word Game', true, true);
