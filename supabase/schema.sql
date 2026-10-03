-- My Kanban Board — Supabase schema (free tier).
-- Run this once in the Supabase SQL editor. It creates the cards table.
-- No card data here; seed rows go in via seed.sql (kept out of git).

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  title text not null,
  details text not null default '',
  tag text not null default 'work' check (tag in ('work', 'personal')),
  priority text not null default 'normal' check (priority in ('high', 'normal', 'low')),
  lane text not null default 'now' check (lane in ('now', 'next', 'waiting', 'done')),
  due_date date,
  owner text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Deny everything by default; the app's serverless functions use the
-- service_role key (server-side only), which bypasses RLS.
alter table cards enable row level security;

create index if not exists cards_user_email_idx on cards (user_email);
create index if not exists cards_lane_idx on cards (lane);
