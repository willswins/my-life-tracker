-- Migration 002: JIRA-like capabilities — issue types + comments.
-- Run in the Supabase SQL editor after schema.sql. DDL only, safe for git.

alter table cards
  add column if not exists issue_type text not null default 'task'
  check (issue_type in ('task', 'bug', 'story'));

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id) on delete cascade,
  user_email text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- Deny everything by default; the app's serverless functions use the
-- service_role key (server-side only), which bypasses RLS.
alter table comments enable row level security;

create index if not exists comments_card_id_idx on comments (card_id);
