# CMS Lab Portal

Lab management for Prof. Somnath Bhowmick's Computational Materials Science group:
member approval, PI office-hour booking with locked slots, automatic Google
Calendar events + Meet links, project and paper tracking, meeting notes that
turn themselves into action items, and an AI assistant that reads the lab's own
records.

Everything runs on free tiers: **GitHub Pages** (frontend) + **Supabase**
(database, auth, edge functions) + **Google Calendar API**.

```
GitHub Pages (Next.js static export)
        │
        ▼
Supabase ── Postgres (RLS, slot-lock constraint)
        ├── Auth (Google sign-in)
        ├── Realtime broadcast (live slot updates)
        └── Edge functions ──► Google Calendar API (events, Meet links, busy times)
```

## Features

- Google sign-in → member lands in **pending** → PI approves with role + mentor
- Roles: PI, Post-doc, PhD, M.Tech, SRF/JRF, Intern, UGP, Alumni
- PI publishes weekly office hours (day, window, slot length, online/offline/both, room)
- One-off exceptions: block leave/travel, or open an extra window
- Students book a slot with purpose + agenda; **booking is atomic** — a Postgres
  exclusion constraint makes double-booking impossible, even with simultaneous clicks
- Booked slots grey out live for everyone (Supabase broadcast)
- Online bookings create a Google Calendar event with a **Meet link** and invite
  both parties; offline bookings carry the room. Google sends reminders.
- Cancellation removes the calendar event and re-opens the slot; late cancels are flagged
- PI's real Google Calendar busy times are imported so nobody books over a class
- Member directory, editable profiles, lab settings (timezone, booking horizon, notice)

### Research tracking

- **Project board** by stage (idea → literature → calculations → analysis →
  writing → submitted → review → revision → accepted → published), with team,
  links (Overleaf, code, arXiv, DOI), target journal and revision deadlines
- Projects with no activity for 14 days are flagged **quiet** on the board and
  on everyone's dashboard — nothing silently rots
- **Action items** with owners and due dates, rolled up per person and per project
- **Weekly 2-minute updates** (did / blocked / next / cluster hours). The PI sees
  who has and hasn't posted, at a glance
- **Meeting notes**: paste rough bullets after a meeting; the assistant writes the
  summary, lists the decisions, and creates action items for the right owner.
  Both sides confirm the record
- **Publications**: paste a DOI or arXiv ID, metadata is fetched from Crossref /
  arXiv, BibTeX copied with one click

### Lab assistant (free tier)

- **Brief me** before a meeting: where the student is, what was decided last
  time and whether it got done, what's overdue, three questions to ask
- **Notes → decisions + action items** (the extraction above)
- **Friday digest**: "state of the lab" — who needs attention, progress per
  person, paper pipeline, suggested follow-ups. Generated automatically by a
  GitHub Actions cron
- **Ask the lab**: the PI can query everything; a student only ever sees their
  own projects. Answers come from the lab's records, never the open internet

Default model is **Gemini** (free tier). Any OpenAI-compatible endpoint works
instead — see `supabase/functions/_shared/llm.ts`.

## One-time setup (≈30 minutes)

### 1. Supabase project

1. Create a free project at <https://supabase.com>. Note the **Project URL** and
   **anon key** (Settings → API).
2. SQL editor → run `supabase/migrations/0001_init.sql`, then `0002_projects.sql`,
   then `0003_agent.sql`, in that order.
3. **Set the PI's email** so the PI is auto-activated on first sign-in:
   ```sql
   update lab_settings set pi_email = 'somnath@iitk.ac.in' where id = 1;
   ```
4. Authentication → Providers → **Google**: enable it (you'll paste the client
   ID/secret from step 2). Copy the **Callback URL** shown there.
5. Authentication → URL Configuration → add your site URL and
   `https://<user>.github.io/<repo>/auth/callback/` (and
   `http://localhost:3000/auth/callback/` for local dev) to **Redirect URLs**.

### 2. Google Cloud (Calendar + sign-in)

1. <https://console.cloud.google.com> → new project → **Enable** "Google Calendar API".
2. OAuth consent screen: External, add scopes `.../auth/calendar.events` and
   `.../auth/calendar.readonly`, add the PI's Gmail as a test user (or publish).
3. Credentials → OAuth client ID → Web application:
   - Authorized redirect URI: the Supabase callback URL from step 1.4.
4. Paste the client ID / secret into Supabase's Google provider **and** into
   the edge-function secrets (next step).

### 3. Edge functions

Install the Supabase CLI (`npm i -g supabase`), then:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... CRON_SECRET=$(openssl rand -hex 16)
supabase functions deploy google-connect
supabase functions deploy calendar-sync
supabase functions deploy agent
```

### 3b. AI assistant key (free)

Get a key at <https://aistudio.google.com/apikey>, then:

```bash
supabase secrets set GEMINI_API_KEY=...
```

Everything else works without it; only the assistant features go quiet.
Admin → **Lab assistant** shows whether the key is live.

### 4. GitHub Pages

1. Push this repo to GitHub. Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions:
   - **Variables**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Secrets**: `CRON_SECRET` (same value as above; enables automatic busy-time sync)
3. Push to `main` → the site deploys to `https://<user>.github.io/<repo>/`.

### 5. First run

1. PI signs in with Google → lands on the dashboard (auto-approved).
2. Admin → **Google Calendar** → *Connect* (one-time consent, offline access).
3. Admin → **Availability** → add office-hour windows.
4. Students sign in, pick their position, wait for approval → book.

## Local development

```bash
cp .env.example .env.local   # fill in Supabase URL + anon key
npm install
npm run dev                  # http://localhost:3000
```

## Project layout

```
src/app/            pages (static export, client-side data)
src/components/     UI kit, app shell, meeting card
src/lib/            supabase client, auth context, timezone helpers, slot builder
supabase/migrations schema, RLS, RPCs (book_meeting, cancel_meeting, review_member)
supabase/functions  google-connect, calendar-sync, agent (Deno edge functions)
                    _shared/llm.ts — pluggable model adapter (Gemini default)
.github/workflows   deploy.yml (Pages), cron.yml (keep-alive + busy sync)
```

## Roadmap

- Thesis / synopsis tracker with committee dates and milestone reminders
- Journal club rota and paper-of-the-week
- Cluster queue and allocation view
- Lab wiki (how to run VASP here, cluster cheatsheet, onboarding)
- Public lab website generated from the same data (people, publications)
