-- Migration 007: five-view extension — inbox_items, reminders, journal_entries, links.
-- Run in the Supabase SQL editor after migration-006.sql. DDL only, safe for git.
-- Every table is scoped by user_email (multi-user app: all queries filter on the
-- signed-in email server-side) with RLS enabled and no public policies, matching
-- the cards table convention. The service_role key used by the serverless API
-- bypasses RLS.

create table if not exists inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  text text not null,
  source text not null check (source in ('manual', 'email', 'chat')),
  source_ref text,
  triaged boolean not null default false,
  triaged_to_type text check (triaged_to_type in ('task', 'reminder', 'journal', 'link')),
  triaged_to_id uuid,
  triaged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  title text not null,
  detail text not null default '',
  remind_at timestamptz not null,
  recurrence text,
  last_fired_at timestamptz,
  status text not null default 'active' check (status in ('active', 'dismissed', 'snoozed')),
  tag text check (tag in ('work', 'personal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_email, title, remind_at)
);

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  date date not null,
  body text not null default '',
  auto_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_email, date)
);

create table if not exists links (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  url text not null,
  title text not null,
  source text,
  tags text not null default '',
  notes text not null default '',
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_email, url)
);

alter table inbox_items enable row level security;
alter table reminders enable row level security;
alter table journal_entries enable row level security;
alter table links enable row level security;

create index if not exists inbox_items_user_idx on inbox_items (user_email, triaged, created_at desc);
create index if not exists reminders_user_idx on reminders (user_email, status, remind_at);
create index if not exists journal_entries_user_idx on journal_entries (user_email, date desc);
create index if not exists links_user_idx on links (user_email, captured_at desc);
