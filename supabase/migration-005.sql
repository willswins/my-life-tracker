-- Migration 005: invite-based access with admin/member roles.
-- Run in the Supabase SQL editor after migration-004.sql. DDL only, safe for git.
-- The admin manages this table from the board's Invite menu; ALLOWED_EMAILS
-- (env) remains as a bootstrap fallback.

create table if not exists allowed_users (
  email text primary key,
  role text not null default 'member' check (role in ('admin', 'member')),
  invited_by text,
  created_at timestamptz not null default now()
);

-- Deny everything by default; the app's serverless functions use the
-- service_role key (server-side only), which bypasses RLS.
alter table allowed_users enable row level security;
