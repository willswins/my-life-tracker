# DayBook — Setup Guide for Muse

> **Audience:** A Muse instance setting up DayBook for its user from scratch.
> **Goal:** A private DayBook deployment with its own Supabase, Vercel, and Google auth — no shared accounts.
> **Time:** ~30 minutes (mostly waiting for Supabase/Vercel provisioning).

---

## Prerequisites

The user needs accounts (free tiers work) on:
1. **GitHub** — to download the release
2. **Supabase** — database + storage backend
3. **Vercel** — hosting
4. **Google Cloud** — OAuth for login (free)

Muse needs from the user (ask up front, all at once):
- [ ] Confirmation to create a Supabase project (or the project ref if one exists)
- [ ] Google account for OAuth consent screen
- [ ] Vercel account connected to their GitHub

---

## Step 1 — Download the Release

```bash
# Download the latest DayBook release tarball
curl -sL https://github.com/willswins/my-life-tracker/releases/latest/download/daybook-v1.tar.gz -o daybook.tar.gz
# If the repo is private, the user must grant access first (see Troubleshooting)

mkdir -p ~/daybook && tar -xzf daybook.tar.gz -C ~/daybook
ls ~/daybook
# Expected: site/  public/  api/  supabase/  vercel.json  vercel-build.sh  SETUP.md
```

**Verify:** `ls ~/daybook/supabase/schema.sql` exists.

---

## Step 2 — Supabase Project & Schema

### 2a. Create the project

**Option A — Dashboard (recommended for first-timers):**
1. Go to https://supabase.com/dashboard → New Project
2. Name: `daybook`, choose a region close to the user
3. Set a database password (save it — needed only for direct DB access)
4. Wait for provisioning (~2 min)

**Option B — Via API** (if the user has a Supabase access token):
Muse can create the project via `POST https://api.supabase.com/v1/projects`.
Prefer Option A unless the user explicitly wants automation.

### 2b. Run the schema

1. Open the project → SQL Editor → New Query
2. Paste the entire contents of `~/daybook/supabase/schema.sql`
3. Run. Expected: "Success. No rows returned" for each block.

**What it creates:**
| Object | Purpose |
|--------|---------|
| `cards` | My Board tasks |
| `reminders` | Reminders |
| `journal_entries` | Journal |
| `links` | Bookmarked links |
| `inbox_items` | Inbox |
| `tags` | Per-user tag master list |
| `api_keys` | Connector API keys (`mlt_...`) |
| `comments` | Card comments |
| `receipts` bucket | Private storage for receipt/bill images |

**Verify:** In Table Editor, confirm all 8 tables exist.

### 2c. Collect Supabase credentials

From Project Settings → API, copy:
- **Project URL** → `SUPABASE_URL` (e.g. `https://xyz.supabase.co`)
- **service_role key** → `SUPABASE_SERVICE_KEY` (secret — never expose in chat)

> ⚠️ Use the `service_role` key, NOT the `anon` key. The API server uses it for all database access.

---

## Step 3 — Google OAuth (Login)

DayBook uses Google Sign-In. Each deployment needs its own OAuth client.

1. Go to https://console.cloud.google.com/ → create/select a project
2. **APIs & Services → OAuth consent screen:**
   - User type: External
   - App name: `DayBook`, support email: user's email
   - Scopes: just `openid`, `email`, `profile` (default)
   - Test users: add the user's Gmail address
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID:**
   - Application type: **Web application**
   - Name: `DayBook Web`
   - Authorized JavaScript origins: `https://<your-vercel-domain>` (add after Step 4; use a placeholder for now and come back)
   - Authorized redirect URIs: (not needed — uses Google Identity Services popup)
4. Copy the **Client ID** → `GOOGLE_CLIENT_ID`

> **Note:** The OAuth consent screen stays in "Testing" mode — fine for personal use (100 test users). No verification needed.

---

## Step 4 — Deploy to Vercel

### 4a. Push to GitHub (or deploy directly)

**Option A — Via Vercel CLI (simplest):**
```bash
cd ~/daybook
npx vercel --prod
# Follow prompts: link to the user's Vercel account, set project name (e.g. daybook)
```

**Option B — Via GitHub:**
1. Create a new **private** repo (e.g. `my-daybook`)
2. Push the release contents
3. In Vercel dashboard → Add New → Project → Import from GitHub

### 4b. Set environment variables

In Vercel → Project → Settings → Environment Variables, add:

| Variable | Value | Source |
|----------|-------|--------|
| `SUPABASE_URL` | `https://xyz.supabase.co` | Step 2c |
| `SUPABASE_SERVICE_KEY` | `eyJ...` (service_role) | Step 2c |
| `SESSION_SECRET` | Random 64-char hex (generate below) | Generate |
| `GOOGLE_CLIENT_ID` | `xxx.apps.googleusercontent.com` | Step 3 |

Generate the session secret:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

After setting env vars: **Redeploy** (Vercel → Deployments → ⋯ → Redeploy).

### 4c. Finish Google OAuth origins

Go back to Google Cloud → Credentials → your OAuth client → add:
- Authorized JavaScript origins: `https://<your-vercel-app>.vercel.app`

---

## Step 5 — Create the Connector API Key

The DayBook connector lets Muse read/write the user's DayBook via API.

1. Open the deployed app in a browser, sign in with Google
2. Go to **Profile menu → Connectors**
3. Click **New Key**, name it `Muse`
4. Copy the `mlt_...` key **once** (it won't be shown again)

**Set up the connector in Muse:**
Follow the `custom_connector_setup` skill to register a connector pointing at the new deployment:
- Base URL: `https://<your-vercel-app>.vercel.app`
- Auth: `Authorization: Bearer mlt_...` (or `X-API-Key`)
- The connector doc should cover: cards, reminders, journal, links, inbox, tags

**Verify the connector:**
```bash
# List cards (should return [] on a fresh install, not an error)
curl -s "https://<your-app>.vercel.app/api/app?r=cards" \
  -H "Authorization: Bearer mlt_..."
```

---

## Step 6 — Verify the Installation

Run this checklist:

- [ ] App loads at `https://<your-app>.vercel.app/` (login page)
- [ ] Google Sign-In works (no "not configured" error)
- [ ] After login, Home view loads with empty states
- [ ] Hamburger menu shows: Home, My Board, Reminders, Journal, Links, Inbox, Mood, Habits, Games
- [ ] Create a test card on My Board → appears → delete it
- [ ] Create a test habit in Habits → check in → delete it
- [ ] Connector API returns `[]` for cards (not 401/500)
- [ ] No test data remains

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "Sign-in is not configured yet" | `GOOGLE_CLIENT_ID` missing | Set env var in Vercel, redeploy |
| Google login popup error 400 | Origin not allowlisted | Add Vercel domain to OAuth client origins |
| API returns 401 | Bad/missing key or session | Check `SESSION_SECRET` is set; re-create connector key |
| API returns 500 on Supabase calls | Wrong `SUPABASE_URL`/`SERVICE_KEY` | Verify in Supabase dashboard → Settings → API |
| `tags: []` after creating reminder | Old API version | Ensure deployment includes the tags-array fix (api/_reminders.js) |
| Release download 404 | Repo is private | User must be added as collaborator, or make the release public |

---

## Architecture Notes (for Muse)

- **No new Vercel functions:** All API logic lives in `api/app.js` (router) + `api/_*.js` handlers. Vercel free tier allows 12 serverless functions; this app uses 3 (`api/app.js`, `api/auth.js`, `api/login.js`).
- **Auth:** Google Identity Services (frontend) → session cookie (`kb_session`, signed with `SESSION_SECRET`). Connector keys (`mlt_...`) are SHA-256 hashed in `api_keys`, scoped to the issuing user.
- **Database:** All queries go through PostgREST via the service_role key server-side. RLS is enabled with no anon access.
- **Habits** are cards with the `habit` tag; check-ins are JSON in the card `details` field. No separate table.
- **Tags** use a `TEXT[]` column on each table + a `tags` master table for the dropdown.

---

## File Manifest (v1.0.0)

```
daybook/
├── site/               # Frontend source (built by vercel-build.sh)
│   ├── index.html      # All views including Habits
│   ├── app.js          # Board/reminder/journal logic
│   └── styles.css      # Includes iPhone media queries
├── public/             # Static JS (served directly)
│   ├── habits.js       # Habit data layer + streak engine
│   ├── habit-ui.js     # Habit view rendering
│   ├── longterm-patch.js
│   └── *-game.js       # Sum It Up, Spell It, Bee, Grammar, Word Meaning
├── api/                # Vercel serverless functions
│   ├── app.js          # Router → _cards, _daybook, _ingest, etc.
│   ├── _db.js          # Supabase client + cleanCard
│   ├── _reminders.js   # Includes tags[] array fix
│   └── ...             # _journal, _links, _inbox, _tags, _keys, _comments
├── supabase/
│   └── schema.sql      # Full schema for fresh installs
├── vercel.json
├── vercel-build.sh
└── SETUP.md            # This file
```
