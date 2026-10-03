# DayBook

DayBook is a personal life OS: a kanban board (Now / Next / Waiting on
others / Done) with work/personal tags, size labels (big rock / medium /
small), plus four more views under the hamburger menu — **Reminders**
(chronological nudges with recurrence), **Journal** (one page per day),
**Links** (searchable link shelf), and **Inbox** (capture anything, triage it
with one tap). Google sign-in protects the whole app.

## Views

- **Tasks** — the kanban board. Cards move between Now / Next / Waiting on
  others / Done; drag-and-drop, filters, search, compact view, comments.
- **Reminders** — time-bound nudges on a timeline (Overdue / Today /
  Tomorrow / This week / Later). Recurring reminders use RRULE strings
  (e.g. `FREQ=WEEKLY;BYDAY=SA`); dismissing one advances it to its next
  occurrence. Actions: Dismiss, Snooze, Edit.
- **Journal** — one page per calendar date: a read-only auto-summary plus
  your own Markdown notes (with preview). A monthly dot strip shows which
  days have entries. Writes are always upserts — one row per date.
- **Links** — searchable shelf for URLs from emails and elsewhere. Search
  covers title, URL, source, tags, and notes; saving a URL twice surfaces
  the existing row instead of duplicating it.
- **Inbox** — the single ingestion path. Capture text, triage it with one
  tap to task / reminder / journal / link, or discard it. The hamburger
  button shows a live badge of untriaged items.

The triage rule: a pointer you'll need again → Link; a nudge at a time with
nothing to complete → Reminder; an action that finishes → Task; a record of
what happened → Journal.

The living spec for the five views is in
`specs/001-five-view-extension/` (`spec.md`, `plan.md`, `tasks.md`) —
spec-kit style, maintained alongside the code.

## How it works

- The board UI lives in `site/` (`index.html`, `styles.css`, `app.js`).
- `build.js` inlines those files into `api/index.js` / `api/login.js` so every
  page is served through a serverless function that checks the session cookie.
- Google sign-in via Google Identity Services: `/login` renders the Google
  button, which returns an ID token; `POST /api/session` verifies the token's
  RS256 signature against Google's public certs, checks the audience, expiry,
  and that the email is in `ALLOWED_EMAILS`, then sets a signed `HttpOnly`
  session cookie (`kb_session`). No client secret is needed or stored.
- `GET /api/config` exposes the public client ID to the login page.
- Card data lives in Supabase Postgres (free tier), accessed only through
  the serverless `/api/cards` endpoints using the `service_role` key, which
  never leaves the server. The table has RLS enabled with no public policies.
  No board data is stored in the git repository or the browser.
- `supabase/schema.sql` creates the table (safe for git — DDL only). Seed
  rows are inserted once via the SQL editor and never committed.
- `supabase/migration-007.sql` adds the five-view tables (`inbox_items`,
  `reminders`, `journal_entries`, `links`) — run it in the Supabase SQL
  editor after migration-006.sql. Each table is scoped by `user_email`
  with RLS enabled and no public policies, like `cards`.
- The five-view seed (`seed-five-views.sql`, kept out of git — ask the
  owner for a copy) inserts the standard reminders and links idempotently
  (`INSERT … ON CONFLICT DO NOTHING`) after migration-007 is applied.

## API endpoints

All endpoints require the session cookie and scope every query to the
signed-in email.

| Endpoint | Purpose |
| -------- | ------- |
| `/api/cards` | Kanban cards (GET/POST/PATCH/DELETE, soft delete) |
| `/api/daybook/reminders` | Reminders; `POST ?id=…` with `{action:'dismiss'}` or `{action:'snooze', minutes}` |
| `/api/daybook/journal` | `GET ?date=YYYY-MM-DD`, `GET ?month=YYYY-MM` (entry dates), `POST` upsert |
| `/api/daybook/links` | Link shelf; `GET ?q=…&tag=…` search; `POST` returns the existing row on URL conflict |
| `/api/daybook/inbox` | `GET ?triaged=false\|true\|all`, `GET ?badge=1` (untriaged count), `POST` capture, `POST ?id=…` `{to:'task'\|'reminder'\|'journal'\|'link', data}` triage, `DELETE` discard |

> **Vercel Hobby hard limit: max 12 serverless functions per deployment.**
> Every non-underscore `.js` file directly under `api/` counts as one function
> (`api/daybook/[view].js` counts as one; `api/_*.js` helpers do not). The four
> views share the single `api/daybook/[view].js` dispatcher for this reason.
> **Never add a new top-level file under `api/`** — fold new endpoints into an
> existing function instead. Exceeding 12 fails every deploy.

## Environment variables (set in Vercel, never in git)

| Variable             | Purpose                                                  |
| -------------------- | -------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | Google OAuth web client ID (public; shown on login page) |
| `SESSION_SECRET`       | Random string used to sign session cookies               |
| `ALLOWED_EMAILS`       | Comma-separated emails allowed to sign in                |
| `SUPABASE_URL`         | Supabase project URL (e.g. https://xyz.supabase.co)      |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key — server-side only, never in git |

The Google OAuth client's **authorized JavaScript origin** must be
`https://<your-vercel-domain>` (no redirect URI needed).

## Access model

- The board owner is the admin. Nobody can open the board without signing in
  with Google, and sign-in only succeeds for emails in `ALLOWED_EMAILS`.
- To invite someone: add their Gmail to `ALLOWED_EMAILS` (comma-separated).
  Each invited user gets their own private board — cards are always scoped
  to the signed-in email, so users never see each other's cards.
- To remove someone: delete their email from `ALLOWED_EMAILS`. Their cards
  stay in the database (scoped to their email) in case they are re-invited.

## Connector API (journal / email automations)

External tools create cards through `POST /api/ingest` — no browser session needed.

**Auth:** per-connector API keys. Create and revoke them in the board under
**Connectors** (header button). The key is shown once; only its SHA-256 hash
is stored. Send it as `Authorization: Bearer mlt_...` (or `X-API-Key`).

**Authz:** a key acts only as the user it was issued to, and can only list
active cards (`GET /api/ingest`, for dedup) and create cards (`POST`).
It cannot delete, restore, or see anyone else's cards. Revoking a key
immediately disables it. Requests are rate-limited (120/min per key).

```bash
curl -X POST https://<your-vercel-domain>/api/ingest \
  -H "Authorization: Bearer mlt_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"From my journal","details":"...","tag":"personal",
       "priority":"normal","issue_type":"task","lane":"now"}'
```
Fields: `title` (required), `details`, `tag` (work|personal),
`priority` (high|normal|low), `issue_type` (task|story|bug),
`lane` (now|next|waiting|done), `due_date` (YYYY-MM-DD), `owner`.

## Local build

```sh
node build.js   # regenerates api/index.js and api/login.js from site/
```
