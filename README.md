# My Kanban Board

A personal kanban board (Now / Next / Waiting on others / Done) with
work/personal tags, size labels (big rock / medium / small), and Google
sign-in protecting the whole app.

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
