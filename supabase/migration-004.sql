-- Migration 004: connector API keys.
-- Run in the Supabase SQL editor after migration-003.sql. DDL only, safe for git.
-- Only the SHA-256 hash of a key is stored; the plaintext key is shown once
-- at creation and never stored anywhere.

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);

-- Deny everything by default; the app's serverless functions use the
-- service_role key (server-side only), which bypasses RLS.
alter table api_keys enable row level security;

create index if not exists api_keys_hash_idx on api_keys (key_hash)
  where revoked_at is null;
