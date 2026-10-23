-- Migration 008: Shop — dedicated shop_stores + shop_items tables.
-- Winny's rule (2026-10-22): grocery items must be tracked in a db table,
-- not in code and not piggybacked on board cards.
-- Run via the Supabase Management API after migration-007. Scoped by
-- user_email with RLS enabled and no public policies, matching the cards
-- convention; the serverless API uses the service_role key.

create table if not exists shop_stores (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  name text not null,
  zones jsonb not null default '[]',
  category_map jsonb not null default '{}',
  lat double precision,
  lng double precision,
  preferred boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists shop_items (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  store_id uuid not null references shop_stores(id),
  name text not null,
  category text not null default 'Other',
  qty text not null default '',
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table shop_stores enable row level security;
alter table shop_items enable row level security;

create index if not exists shop_stores_user_idx on shop_stores (user_email, preferred);
create index if not exists shop_items_user_store_idx on shop_items (user_email, store_id, done, created_at);

-- Backfill from the legacy card piggyback (gstore / gitem cards, layout and
-- item attributes packed in the details JSON). Ids are preserved so nothing
-- that referenced a store or item breaks. Safe to re-run.
insert into shop_stores (id, user_email, name, zones, category_map, lat, lng, preferred, created_at, updated_at)
select id, user_email, title,
  coalesce((case when details ~ '^\s*\{' then details::jsonb else '{}'::jsonb end) -> 'z', '[]'::jsonb),
  coalesce((case when details ~ '^\s*\{' then details::jsonb else '{}'::jsonb end) -> 'm', '{}'::jsonb),
  nullif((case when details ~ '^\s*\{' then details::jsonb else '{}'::jsonb end) ->> 'lat', '')::double precision,
  nullif((case when details ~ '^\s*\{' then details::jsonb else '{}'::jsonb end) ->> 'lng', '')::double precision,
  coalesce(((case when details ~ '^\s*\{' then details::jsonb else '{}'::jsonb end) ->> 'pref')::boolean, false),
  created_at, updated_at
from cards
where tags @> array['gstore']::text[] and deleted_at is null
on conflict (id) do nothing;

insert into shop_items (id, user_email, store_id, name, category, qty, done, created_at, updated_at)
select id, user_email,
  ((case when details ~ '^\s*\{' then details::jsonb else '{}'::jsonb end) ->> 's')::uuid,
  title,
  coalesce((case when details ~ '^\s*\{' then details::jsonb else '{}'::jsonb end) ->> 'c', 'Other'),
  coalesce((case when details ~ '^\s*\{' then details::jsonb else '{}'::jsonb end) ->> 'q', ''),
  coalesce(((case when details ~ '^\s*\{' then details::jsonb else '{}'::jsonb end) ->> 'd')::int, 0) = 1,
  created_at, updated_at
from cards
where tags @> array['gitem']::text[] and deleted_at is null
on conflict (id) do nothing;
