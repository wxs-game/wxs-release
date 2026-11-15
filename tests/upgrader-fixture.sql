-- Minimal local schema matching the fields/types used by production routines.
-- No remote database connections, real accounts, or Telegram sessions are used.
create role anon;
create role authenticated;
create schema wxs_private;
create schema extensions;
create extension pgcrypto with schema extensions;
create table public.bot_settings(setting_key text primary key, setting_value text);
create table public.wxs_game (
    telegram_id bigint primary key,
    balance double precision not null default 0,
    turnover double precision default 0,
    bets_count integer default 0,
    total_win numeric default 0,
    wins_count integer default 0,
    max_win double precision default 0
);
create table public.upgrader_freebets (
    id uuid primary key default gen_random_uuid(),
    telegram_id bigint not null,
    amount numeric not null,
    status text default 'new',
    used_at timestamptz
);
create table public.release_activity(telegram_id bigint primary key, last_seen_at timestamptz default now());
create table wxs_private.gift_upgrade_quotes (
    id uuid primary key default gen_random_uuid(),
    gift_slug text not null check (gift_slug ~ '^[a-z0-9]{1,80}$'),
    price_cents integer not null check (price_cents between 2 and 100000000),
    remaining integer not null default 0 check (remaining >= 0),
    enabled boolean not null default false,
    expires_at timestamptz not null
);
create table wxs_private.gift_upgrade_rounds (
    telegram_id bigint not null,
    request_id uuid not null,
    quote_id uuid not null references wxs_private.gift_upgrade_quotes(id),
    gift_slug text not null,
    stake_cents integer not null check (stake_cents > 0),
    chance_bp integer not null check (chance_bp between 100 and 9000),
    roll_u32 bigint not null check (roll_u32 between 0 and 4294967295),
    won boolean not null,
    balance_after numeric not null,
    created_at timestamptz not null default now(),
    primary key (telegram_id, request_id)
);
