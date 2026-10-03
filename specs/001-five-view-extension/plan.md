# Technical Plan: Five-View Extension

**Feature:** `001-five-view-extension` · **Date:** 2026-10-03
**Stack (existing):** TypeScript space, React client in `client/`, server actions in
`server/src/actions.ts`, Drizzle schema in `server/src/schema.ts`, migrations in `drizzle/`,
SQLite `app.db`. Timestamps: integer `timestamp_ms`. Calendar dates: text `YYYY-MM-DD`.

## Architecture

- Hamburger button in app header → five entries → routes `/` (Tasks), `/reminders`,
  `/journal`, `/links`, `/inbox`. No separate sidebar; hamburger is primary nav on
  desktop and mobile.
- Badges: Tasks = count in `now`; Reminders = due today or overdue; Links = total count;
  Inbox = **live untriaged count** (`triaged=0`), visible on the hamburger button itself.
- Existing kanban becomes the Tasks route with unchanged behavior. Everything else is additive.

## Data model

### `cards` — existing, unchanged (+ optional `tag`)
| Column | Type | Notes |
|---|---|---|
| id | integer PK autoincrement | |
| title | text NOT NULL | max 160 chars, validated in action layer |
| details | text NOT NULL DEFAULT '' | max 2000 chars |
| lane | text enum | now / next / waiting / done |
| priority | text enum DEFAULT normal | high / normal / low |
| owner | text nullable | max 120 chars |
| due_date | text nullable | YYYY-MM-DD, regex-validated |
| sort_order | integer NOT NULL DEFAULT 0 | manual order within lane |
| tag (new, optional) | text enum nullable | work / personal / NULL; single `ALTER TABLE … ADD COLUMN` |
| created_at / updated_at | integer timestamp_ms | updated_at bumped on update/move |

Preservation rule: any step requiring a rename, retype, or drop of an existing
`cards` column is wrong. New views read new tables; Tasks keeps reading `cards`.

### `inbox_items` — raw captures (the only ingestion path)
| Column | Type | Notes |
|---|---|---|
| id | integer PK | |
| text | text NOT NULL | raw capture: pasted text, email subject+snippet, or a URL |
| source | text enum NOT NULL | manual / email / chat |
| source_ref | text nullable | pointer back to origin (email id, chat id) |
| created_at | integer timestamp_ms | |
| triaged | integer NOT NULL DEFAULT 0 | 0 untriaged / 1 triaged; indexed |
| triaged_to_type | text enum nullable | task / reminder / journal / link; NULL until triaged |
| triaged_to_id | integer nullable | PK of destination row; NULL until triaged |
| triaged_at | integer timestamp_ms nullable | |

Index: `idx_inbox_triaged(triaged, created_at)` — serves the untriaged list and badge count.

### `reminders` — time-bound nudges, no lanes
| Column | Type | Notes |
|---|---|---|
| id | integer PK | |
| title | text NOT NULL | e.g. "Star League — head out" |
| detail | text NOT NULL DEFAULT '' | location, pickup note |
| remind_at | integer timestamp_ms NOT NULL | next fire time (instant); indexed |
| recurrence | text nullable | RRULE string or NULL = one-off |
| last_fired_at | integer timestamp_ms nullable | |
| status | text enum NOT NULL | active / dismissed / snoozed |
| tag | text enum nullable | work / personal / NULL (same vocabulary as cards) |
| created_at / updated_at | integer timestamp_ms | |

Indexes: `idx_reminders_remind_at(remind_at)`, `idx_reminders_status(status, remind_at)`.
Dismiss of a recurring reminder advances `remind_at` to the next RRULE occurrence
and returns it to `active` instead of disappearing.

### `journal_entries` — one row per date
| Column | Type | Notes |
|---|---|---|
| id | integer PK | |
| date | text NOT NULL UNIQUE | YYYY-MM-DD; unique index — one row per day |
| body | text NOT NULL DEFAULT '' | Markdown, the user's own notes |
| auto_summary | text nullable | system-filled (reminder fires, Done moves, key emails); NULL until generated |
| created_at / updated_at | integer timestamp_ms | |

Writes are always upserts: `INSERT … ON CONFLICT(date) DO UPDATE SET body=…, updated_at=…`.
Opening "today" is a single lookup by date.

### `links` — the link shelf
| Column | Type | Notes |
|---|---|---|
| id | integer PK | |
| url | text NOT NULL UNIQUE | unique index — same URL can exist only once |
| title | text NOT NULL | human-readable |
| source | text nullable | e.g. "Email — Zebra Robotics, 2026-10-01" |
| tags | text NOT NULL DEFAULT '' | comma-separated; UI splits/filters |
| notes | text NOT NULL DEFAULT '' | "why I saved this" |
| captured_at | integer timestamp_ms | when filed |
| created_at / updated_at | integer timestamp_ms | |

Triaging a duplicate URL returns the existing row ("already saved"), no new row.

## Migrations (Drizzle SQL in `drizzle/`, applied in order)

Existing: `0001_initial.sql`, `0002_create_kanban_cards.sql`. This build adds:

| Step | Migration | Effect |
|---|---|---|
| 1 | `0003_add_tag_to_cards.sql` | `ALTER TABLE cards ADD COLUMN tag TEXT` — existing rows get NULL (renders untagged). Skippable if tag is cut. |
| 2 | `0004_create_inbox_reminders.sql` | Create `inbox_items` + `reminders` with indexes. `cards` untouched. |
| 3 | `0005_create_journal_links.sql` | Create `journal_entries` (unique `date`) + `links` (unique `url`). `cards` untouched. |

Every step is additive until the client is verified against the new schema.
**Rollback:** revert the client build (hamburger disappears, kanban remains); leave new
tables in place. No down-migration drops tables — dropping is a separate deliberate decision.

## New server actions (`server/src/actions.ts`; card actions untouched)

| Action | Table | Notes |
|---|---|---|
| listReminders, createReminder, updateReminder, dismissReminder, snoozeReminder, deleteReminder | reminders | dismiss advances recurring to next RRULE occurrence |
| getJournalEntry, upsertJournalEntry, listJournalDates | journal_entries | upsert keyed on unique date index |
| listLinks, createLink, updateLink, deleteLink | links | create returns existing row on URL conflict |
| listInboxItems, createInboxItem, triageInboxItem, discardInboxItem, inboxBadgeCount | inbox_items | triage = create destination row + write pointer, one transaction |

## Recurrence model

RRULE subset (RFC 5545): FREQ ∈ {DAILY, WEEKLY, MONTHLY, YEARLY}, BYDAY ∈
{MO,TU,WE,TH,FR,SA,SU}, INTERVAL, UNTIL. NULL = one-off. Next occurrence computed
from `remind_at` + RRULE on fire/dismiss. BYDAY evaluated in the client's local zone
(America/New_York) so "Saturday 8:30 AM" means Apex time.

| Pattern | RRULE |
|---|---|
| Every Saturday 8:30 AM | `FREQ=WEEKLY;BYDAY=SA` |
| Every Tuesday 6:00 PM | `FREQ=WEEKLY;BYDAY=TU` |
| Every other day 7:30 PM | `FREQ=DAILY;INTERVAL=2` |
| Monthly on the 25th | `FREQ=MONTHLY;BYMONTHDAY=25` |

## Seed content (idempotent — natural-key checked, never updates/deletes)

**Reminders** (title + `remind_at` as natural key):
- Star League — head out · Sat 08:45 · `FREQ=WEEKLY;BYDAY=SA` · "Leave by 08:45 for the 09:00–11:50 AM class."
- Star League — pickup · Sat 11:40 · `FREQ=WEEKLY;BYDAY=SA` · "Pickup at 11:50 AM."
- SafeSplash — head out · Tue 18:00 · `FREQ=WEEKLY;BYDAY=TU` · "Group lesson 6:15–6:45 PM, Holly Springs."
- Grubhub+ — cancel before renewal · 2027-09-13 09:00 · one-off · "Free trial ends 2027-09-20; cancel before renewal."
- Piano — head out · Sat 12:45 · `FREQ=WEEKLY;BYDAY=SA` · "Lesson at 1:00 PM (placeholder time; confirm and edit)."

**Links** (URL as natural key; URLs copied verbatim from source emails at seed time, never reconstructed):
- Zebra Robotics — Pause/Cancellation form · https://forms.gle/dHDrz6YGM2ngT4hK9 · "Email from Zebra Robotics (Marwah). Only Winny can submit; cancellation not final until filed."
- MathCON — First Round login · (portal URL from invitation email) · "TMSA Apex grades 4–7; window Jan 14 – Mar 18, 2027; 50 min, 32 questions, online from home."
- Old Salem field trip — consent form · (form URL from Ms. Sara's email) · "Thu Oct 8 trip. $50 paid 2026-09-29; consent/emergency form still outstanding."
- Dean's List — Weekly Report · (report URL from Friday email) · "Requires typing full name to certify before it opens."

**Journal:** no backfill — starts today. **Inbox:** starts empty (badge 0), unless a
schedule-change email arrives between deploy and first open.

## File map

| File | Change |
|---|---|
| `server/src/schema.ts` | Add `inboxItems`, `reminders`, `journalEntries`, `links`; optional `cards.tag` |
| `server/src/actions.ts` | Add actions above; card actions untouched |
| `drizzle/0003_add_tag_to_cards.sql`, `0004_create_inbox_reminders.sql`, `0005_create_journal_links.sql` | New migrations |
| `client/src/App.tsx` | Hamburger menu + routing; existing kanban becomes Tasks view |
| `client/src/api.ts` | New action bindings per existing React Query convention |

## Quota note

Deliberately deterministic: schema, actions, five screens against known conventions.
No speculative research required. If the runtime can't support an index or the RRULE
subset, surface it as a build-time finding — not a reason to redesign the taxonomy.
