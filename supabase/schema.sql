-- DayBook Supabase Schema
-- Run this in the Supabase SQL Editor on a fresh project.
-- Creates all tables, indexes, storage buckets, and RLS policies.
--
-- Tables: cards, reminders, journal_entries, links, inbox_items, tags, api_keys, comments
-- Storage: receipts (private bucket)

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- CARDS (My Board tasks)
-- ============================================================================
CREATE TABLE IF NOT EXISTS cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT DEFAULT '',
  tag TEXT,
  tags TEXT[] DEFAULT '{}',
  priority TEXT DEFAULT 'normal',
  lane TEXT DEFAULT 'now',
  due_date DATE,
  owner TEXT,
  issue_type TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cards_user ON cards(user_email);
CREATE INDEX IF NOT EXISTS idx_cards_lane ON cards(user_email, lane) WHERE deleted_at IS NULL;

-- ============================================================================
-- REMINDERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT DEFAULT '',
  remind_at TIMESTAMPTZ NOT NULL,
  event_at TIMESTAMPTZ,
  recurrence TEXT,
  recurrence_end_date TIMESTAMPTZ,
  recurrence_end_after INTEGER,
  recurrence_occurred INTEGER DEFAULT 0,
  tag TEXT,
  tags TEXT[] DEFAULT '{}',
  priority TEXT DEFAULT 'none',
  status TEXT DEFAULT 'active',
  last_fired_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_email);
CREATE INDEX IF NOT EXISTS idx_reminders_at ON reminders(user_email, remind_at) WHERE status = 'active';

-- ============================================================================
-- JOURNAL ENTRIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  date DATE NOT NULL,
  title TEXT DEFAULT '',
  mood TEXT,
  body TEXT DEFAULT '',
  attachments JSONB DEFAULT '[]',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_journal_user_date ON journal_entries(user_email, date DESC);

-- ============================================================================
-- LINKS (bookmarks)
-- ============================================================================
CREATE TABLE IF NOT EXISTS links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT DEFAULT '',
  source TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_links_user ON links(user_email);

-- ============================================================================
-- INBOX ITEMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS inbox_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  text TEXT NOT NULL,
  source TEXT DEFAULT 'manual',
  source_ref TEXT,
  triaged BOOLEAN DEFAULT FALSE,
  triaged_to_type TEXT,
  triaged_to_id UUID,
  triaged_at TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inbox_user ON inbox_items(user_email);
CREATE INDEX IF NOT EXISTS idx_inbox_untriaged ON inbox_items(user_email) WHERE triaged = FALSE;

-- ============================================================================
-- TAGS (master tag list per user)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_email, name)
);
CREATE INDEX IF NOT EXISTS idx_tags_user ON tags(user_email);

-- ============================================================================
-- API KEYS (for the DayBook connector / Muse integration)
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_email);

-- ============================================================================
-- COMMENTS (on cards)
-- ============================================================================
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_card ON comments(card_id);

-- ============================================================================
-- STORAGE: receipts bucket (private, for payment/bill images)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', FALSE)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- ROW LEVEL SECURITY
-- The API uses the service_role key server-side, so RLS policies are
-- permissive for service_role. Enable RLS to block anon access.
-- ============================================================================
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE links ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS by default in Supabase, so no additional
-- policies are needed for the API. Anon key gets no access.
-- (If you need direct client access later, add policies scoped to auth.email().)

-- ============================================================================
-- DONE
-- Next: copy your Supabase Project URL and service_role key into the
-- DayBook .env / Vercel environment variables (see SETUP.md).
-- ============================================================================
