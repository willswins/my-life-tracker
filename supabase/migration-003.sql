-- Migration 003: soft delete (trash + restore).
-- Run in the Supabase SQL editor after migration-002.sql. DDL only, safe for git.

alter table cards add column if not exists deleted_at timestamptz;

create index if not exists cards_deleted_at_idx on cards (deleted_at)
  where deleted_at is not null;
