-- Migration 009: Inbox read state — is_read on inbox_items.
-- Winny's rule (2026-10-30): inbox rows are mail-style — bold means
-- unread; opening a capture marks it read. The API support
-- (api/_inbox.js PATCH) and the UI shipped 2026-10-30; this column is
-- the missing piece — without it every read-state save fails.
-- Run via the Supabase dashboard SQL Editor or the Management API,
-- after migration-008.

alter table inbox_items
  add column if not exists is_read boolean not null default false;
