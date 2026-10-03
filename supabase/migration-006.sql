-- Migration 006: track whether the invite email was sent.
-- Run in the Supabase SQL editor after migration-005.sql. DDL only, safe for git.

alter table allowed_users add column if not exists invite_sent_at timestamptz;
