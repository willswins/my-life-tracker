# Feature Spec: Five-View Extension

**Feature:** `001-five-view-extension`
**Status:** approved — ready to build
**Date:** 2026-10-03
**Supersedes:** the 18-page build-spec PDF (v1.0, 2026-10-03). This directory is now the source of truth; the PDF is archival.

## Overview

Extend "My Kanban Board" from a single-table kanban into a five-view life OS:
**Tasks, Reminders, Journal, Links, Inbox** — all under one hamburger menu, backed by
five separate database tables. Reminders are not tasks; journals are not tasks; links
are not tasks. Each type gets the surface its lifecycle deserves.

**Decision already made (2026-10-03):** five views under a hamburger menu, five separate
tables rather than one polymorphic items table. This spec implements that decision.

## User stories

### Tasks (existing kanban, unchanged behavior)
- As Winny, I open the board and see my existing cards, lanes, and order exactly as before.
- As Winny, I can create, edit, move, and delete cards; optionally tag them work/personal and filter by tag.

### Reminders
- As Winny, I see time-bound nudges (Star League head-out, pickup) on a chronological timeline — Overdue / Today / Tomorrow / This week / Later — not in kanban lanes.
- As Winny, I can dismiss, snooze, or edit a reminder; dismissing a recurring reminder advances it to its next occurrence instead of deleting it.

### Journal
- As Winny, I open Journal and land on today: a read-only auto-summary plus my own Markdown notes.
- As Winny, I can flip between days; saving never creates a duplicate entry for the same date.
- As Winny, I can see at a glance (monthly dot strip) which days have entries.

### Links
- As Winny, I can search every link I've saved (by title, URL, source, tags, notes) instead of digging through email.
- As Winny, saving a URL twice surfaces the existing row instead of creating a duplicate.

### Inbox
- As Winny, I have one place to dump anything — text, a URL, a forwarded email snippet.
- As Winny, I triage each capture with one tap to task / reminder / journal / link, and the hamburger badge tells me when untriaged items are piling up.
- As Winny, I can trace any triaged item back to its original capture.

## Functional requirements

### Navigation
- FR-1: A single hamburger button in the app header opens a menu with exactly five entries: Tasks, Reminders, Journal, Links, Inbox.
- FR-2: Routes: `/` (Tasks, default), `/reminders`, `/journal`, `/links`, `/inbox`. Browser back button works between views.
- FR-3: The hamburger button shows a live badge with the untriaged inbox count (visible even when the menu is closed).

### Reminders
- FR-4: Timeline grouped Overdue / Today / Tomorrow / This week / Later, ordered purely by `remind_at`. No lanes, no drag-and-drop.
- FR-5: Row actions: Dismiss, Snooze, Edit. Recurring reminders re-appear at the next RRULE occurrence on dismiss.
- FR-6: Recurrence stored as an RFC 5545 RRULE subset (FREQ: DAILY/WEEKLY/MONTHLY/YEARLY, BYDAY, INTERVAL, UNTIL); NULL = one-off.
- FR-7: `remind_at` stored as UTC epoch ms; rendered in America/New_York; BYDAY evaluated in the client's local zone.

### Journal
- FR-8: One row per calendar date (unique index on `date`); writes are always upserts.
- FR-9: Two stacked areas: auto-summary (read-only, system-filled, NULL until generated) and Notes (editable Markdown + preview).
- FR-10: Monthly strip shows a dot per day that has an entry.

### Links
- FR-11: Search across title, URL, source, tags, notes; tag filter; sort by `captured_at` desc.
- FR-12: Unique index on `url`; adding a duplicate surfaces the existing row with an "already saved" notice.
- FR-13: Row actions: Open, Edit, Delete, Copy URL.

### Inbox & triage
- FR-14: Inbox is the **only** ingestion path. Nothing from an external source enters the four destination tables directly.
- FR-15: Triage is one transaction: create the destination row, then set `triaged=1`, `triaged_to_type`, `triaged_to_id`, `triaged_at` on the inbox item.
- FR-16: Triage pre-fills per destination (task: lane=next; reminder: `remind_at`=next rounded hour; journal: date=today, body appended; link: first URL extracted, title=first line).
- FR-17: A "Triaged" toggle lists filed items with a link to their destination row.
- FR-18: Email schedule changes (new/cancelled/rescheduled event, time/location change, new deadline) auto-create inbox items with `source='email'`.

### Triage rule (the one decision that routes everything)
Ask in this order:
1. Pointer I'll need again? → **Link** (form, login page, report)
2. Nudge at a time, nothing to complete? → **Reminder** (drop-off, pickup, cancel-by date)
3. Action that finishes? → **Task** (gets a lane, ends at Done)
4. Record of something that happened / was decided? → **Journal** (append-only, keyed by date)

One real-world item may legitimately produce two captures (e.g. "fill the Zebra form" = task + its form URL = link).

## Acceptance criteria

### Tasks (regression)
- [ ] Board opens on Tasks with the same cards, lanes, and order as before the build.
- [ ] Create, edit, move, delete all work; priority badges and owner/due-date chips render as before.
- [ ] (If tag shipped) Tag cards work/personal; header filter works.

### Reminders
- [ ] Star League head-out (Sat 08:45) and pickup (Sat 11:40) appear under the correct day group; SafeSplash (Tue 18:00) appears; Grubhub+ cancel-by (2027-09-13) appears under Later.
- [ ] Create a one-off for tomorrow → appears under Tomorrow; dismiss it → leaves the active list.
- [ ] Dismiss a recurring reminder → reappears at its next occurrence. Snooze → time moves forward, status shows snoozed.

### Journal
- [ ] Opens on today with empty Notes; save, navigate away and back → note persists; save again → still one entry for today.
- [ ] Monthly strip shows a dot for today.

### Links
- [ ] Zebra cancellation form link present and opens https://forms.gle/dHDrz6YGM2ngT4hK9 ; searching "Zebra" matches it.
- [ ] Adding the same URL twice surfaces the existing row, no duplicate.
- [ ] Tag filter shows only matching links.

### Inbox
- [ ] Fresh board: badge 0. Add a manual capture → badge increments, item appears.
- [ ] Triage to task → appears in Tasks (lane Next), leaves Inbox, badge decrements.
- [ ] Triage a URL capture to link → appears in Links with that URL.
- [ ] Triaged view shows filed items with destination links.
- [ ] Simulated email schedule change → inbox item with source "email" appears with no manual capture.

### Navigation
- [ ] Hamburger shows exactly five entries; each navigates; badge count always matches untriaged count.

### Data preservation
- [ ] Card count before migration equals card count after; 5 sampled cards match on all fields; `listCards` ordering unchanged; card CRUD still works from Tasks view.

## Non-goals
- No change to the cards lifecycle (lanes, priorities, editor semantics).
- No push notifications from the board (reminders surface in-board; existing WhatsApp/iPhone channels stay as-is).
- No calendar sync; no link fetching/preview generation; no multi-user model.
- No down-migration that drops tables on rollback.

## Open decisions
| Decision | Default if undecided |
|---|---|
| Ship the `tag` column (work/personal) on cards + reminders? | Ship it — one nullable column, header filter; cheap to cut later. |
| Piano reminder exact time (seed: Sat 12:45 for 1:00 PM lesson)? | Seed 12:45, edit after confirmation — wrong-but-visible beats absent. |
| Exact URLs for MathCON login, Old Salem consent, Dean's List report? | Copy verbatim from source emails at seed time; omit if unlocatable — never guess. |
| Email schedule-change detector design (mailbox, senders, what counts)? | Out of scope for the board build; board only requires `createInboxItem(source='email')` to exist. Separate work. |
| Journal auto-summary contents/timing? | End-of-day from reminder fires + Done moves; NULL until then, UI handles NULL as "no summary yet". |
