# Tasks: Five-View Extension

**Feature:** `001-five-view-extension` · **Date:** 2026-10-03
Work top to bottom; each phase is verifiable before the next begins. Nothing here
renames, retypes, or drops an existing `cards` column.

## Phase 1 — Schema & migrations
- [ ] Add `inboxItems`, `reminders`, `journalEntries`, `links` (+ optional `cards.tag`) to `server/src/schema.ts`
- [ ] Write `drizzle/0003_add_tag_to_cards.sql` (`ALTER TABLE cards ADD COLUMN tag TEXT`)
- [ ] Write `drizzle/0004_create_inbox_reminders.sql` (tables + `idx_inbox_triaged`, `idx_reminders_remind_at`, `idx_reminders_status`)
- [ ] Write `drizzle/0005_create_journal_links.sql` (tables + unique index on `journal_entries.date`, unique index on `links.url`)
- [ ] Apply migrations against a scratch copy of `app.db`; verify card count and 5 sampled cards byte-identical before/after

## Phase 2 — Server actions (`server/src/actions.ts`)
- [ ] `listReminders`, `createReminder`, `updateReminder`, `deleteReminder`
- [ ] `dismissReminder` — one-off → `dismissed`; recurring → advance `remind_at` to next RRULE occurrence, back to `active`
- [ ] `snoozeReminder` — push `remind_at` forward, status `snoozed`
- [ ] `getJournalEntry(date)`, `upsertJournalEntry` (ON CONFLICT(date) DO UPDATE), `listJournalDates`
- [ ] `listLinks` (search + tag filter), `createLink` (return existing row on URL conflict), `updateLink`, `deleteLink`
- [ ] `listInboxItems` (triaged filter), `createInboxItem`, `discardInboxItem`, `inboxBadgeCount`
- [ ] `triageInboxItem` — create destination row + set `triaged=1`, `triaged_to_type/id/at` in **one transaction**
- [ ] Verify existing card actions (`listCards`, `createCard`, `updateCard`, `moveCard`, `deleteCard`) behave exactly as before

## Phase 3 — Client: navigation shell
- [ ] Hamburger button in app header; menu with exactly five entries (Tasks, Reminders, Journal, Links, Inbox)
- [ ] Routes `/`, `/reminders`, `/journal`, `/links`, `/inbox`; `/` keeps the existing kanban as the Tasks view
- [ ] Live badge on hamburger = untriaged inbox count; per-view badges (Tasks: `now` count; Reminders: due/overdue; Links: total)
- [ ] Back button navigates between views correctly

## Phase 4 — Client: the four new views
- [ ] **Reminders:** timeline grouped Overdue / Today / Tomorrow / This week / Later, ordered by `remind_at`; row actions Dismiss / Snooze / Edit; recurrence label ("Weekly · Sat"); tag chip + filter
- [ ] **Journal:** opens on today; auto-summary (read-only, handles NULL) + Markdown notes with preview; date picker + prev/next; monthly dot strip
- [ ] **Links:** search box (title/URL/source/tags/notes), tag filter, sort captured_at desc; row actions Open / Edit / Delete / Copy URL; duplicate-URL "already saved" notice
- [ ] **Inbox:** untriaged list (newest first) with raw text, source, time; four triage buttons + Discard; per-destination pre-filled forms; Triaged toggle with destination links
- [ ] (If tag shipped) tag chip on task cards + header filter

## Phase 5 — Seed (idempotent; natural-key checked; never update/delete)
- [ ] Seed the 5 reminders from plan.md §Seed (Star League ×2, SafeSplash, Grubhub+, Piano)
- [ ] Seed the 4 links from plan.md §Seed (Zebra form + 3 URLs copied verbatim from source emails; omit any URL that can't be located — never guess)
- [ ] Confirm Inbox badge reads 0 on first open

## Phase 6 — Verification (spec.md acceptance criteria)
- [ ] Tasks regression checklist passes (cards, lanes, order, CRUD, chips)
- [ ] Reminders checklist passes (seed placement, one-off create/dismiss, recurring dismiss advance, snooze)
- [ ] Journal checklist passes (today opens, save/navigate/save, upsert-not-duplicate, dot strip)
- [ ] Links checklist passes (Zebra link present + opens, search, duplicate surfacing, tag filter)
- [ ] Inbox checklist passes (badge 0 → increment → triage to task → decrement; URL capture → link; triaged view; simulated email schedule change)
- [ ] Navigation checklist passes (5 entries, routes, back button, badge accuracy)
- [ ] Data-preservation checks pass (card count, sampled fields, ordering, card CRUD from Tasks)

## Phase 7 — Ship
- [ ] Decide open items in spec.md (tag column, piano time, URL gaps, detector scope, auto-summary timing)
- [ ] Deploy; confirm default route `/` still renders the kanban first paint
- [ ] Keep the build-spec PDF (v1.0) as archival reference; this `specs/` directory is the living spec from here on
