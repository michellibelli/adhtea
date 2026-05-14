# adhTea — Project Documentation
*Last updated: 2026-05-13*

## What is this

**adhTea** is a personal ADHD productivity app built for the user and her family. It's not a generic todo app — it's designed around the specific cognitive patterns of ADHD: low-friction capture, structured morning triage, capacity-aware scheduling, and foundation habit tracking (sleep, meals, medication, mood).

Live at **[adh-tea.fun](https://adh-tea.fun)**.

---

## Design philosophy

**Problem:** Standard productivity apps assume consistent executive function. ADHD doesn't work that way — some days you have full capacity, some days you need a critical list of 3 things.

**Solution:** A system that adapts to your current capacity. Triage each morning decides what goes on today's plate. A capacity bar tracks load. A critical list exists for low-focus days.

**Vibe:** Queer Stardew Valley. Warm, cozy, pixel-art energy. Pride palette. Press Start 2P for headings. Feels like a game you actually want to open.

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + Vite + Tailwind v4 |
| Backend | FastAPI (Python) |
| Database | SQLite (dev) / Supabase PostgreSQL (prod) |
| Auth | Bearer tokens, 30-day expiry, invite code registration |
| AI | Anthropic Claude Haiku 4.5 (project task breakdown) |
| Hosting | Vercel (frontend) + Render (backend) |

---

## Deployment

| Service | URL | Notes |
|---------|-----|-------|
| Frontend | https://adh-tea.fun | Vercel, auto-deploys on push to master |
| Backend | https://api.adh-tea.fun | Render free tier, sleeps after 15 min idle |
| Database | Supabase PostgreSQL | Project ref `yyolrtwpsbtamncihmls` |

**Render sleeps** — set up UptimeRobot ping to `https://api.adh-tea.fun/health` every 5 min to prevent cold starts.

**Render DATABASE_URL** — special characters in password must be URL-encoded (`&` → `%26`, `@` → `%40`).

Primary user: `demo_user` (user_id=2).

---

## Environment variables

### Backend (Render + local `.env`)

```
DATABASE_URL=sqlite:///./aria.db          # or Supabase postgres URL
SECRET_KEY=<random string>
ALLOWED_ORIGINS=http://localhost:5173,https://adh-tea.fun,https://www.adh-tea.fun
FRONTEND_URL=https://adh-tea.fun
ANTHROPIC_API_KEY=<sk-ant-...>            # required for AI project breakdown
GOOGLE_CLIENT_ID=                         # optional — Google Calendar integration
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://api.adh-tea.fun/gcal/callback
```

### Frontend

No `.env` needed. Base API URL is configured in `frontend/src/api/client.js`.

---

## Running locally

```bash
# Backend
cd backend
python -m uvicorn main:app --reload

# Frontend
cd frontend
npm run dev
```

---

## Feature overview

### Core loop

The daily workflow:

1. **Capture** — quick-add anything (task, appointment, routine, note) with type-specific required fields
2. **Triage** (morning) — inbox items presented one-at-a-time; schedule today, defer, or snooze
3. **Focus** (home screen) — single centered card showing the next task; done/snooze/back actions
4. **Today list** — full list, drag to reorder
5. **Carry-forward** — incomplete today items return to inbox at midnight

### Snooze system

Snooze options: tonight / tomorrow / end of week / next week / custom date. Snoozed items live in Waiting until the date arrives, then return to inbox.

### Triage

One item at a time (large card). Actions:
- **→ Today** — schedules immediately (slide right)
- **Defer** — Tomorrow / End of week / Next week / Pick date (slide left, sets due_date, stays inbox)
- **Snooze 1 month** — true snooze (disappears from triage)

Triage is done-flagged for the day (resets midnight). "Low focus" skip → Critical List (urgent tasks + today's appointments + is_critical routines).

### Capacity model

Rules-based score from self-care log inputs:
- Sleep hours + quality
- Meals eaten
- Exercise
- Medication taken
- Yesterday's mood

Displayed as a color bar: light → manageable → heavy → overloaded. Appears compact in Focus/Triage, full in Foundation page.

### Routines

- Frequency: daily / weekdays / weekends / weekly / custom days
- Time of day: morning / afternoon / evening / anytime
- Optional exact time (HH:MM)
- `is_critical` flag — surfaces on Critical List for low-focus days
- Lazy daily instance generation (no background jobs)
- Missed instances tracked separately (not dumped into inbox)

### Foundation (self-care)

Daily log: sleep hours/quality, meals, exercise/minutes, medication taken, mood (1–5), notes. One log per day per user (upsert). Triggers capacity snapshot recompute.

### EOD Gate

Triggers after 5 PM if no log today. Requires only a mood emoji (1–5). Submit → warm daily summary. "Skip for now" always available.

### WakeScreen

Shown when the Render backend has been idle and needs to wake up. 5-second splash → 60-second wake phase with diary prompt and countdown. Auto-saves diary entry as a note task. Transitions to app when server responds.

### Google Calendar

Full OAuth 2.0 (read-only). Connect via Settings → Integrations. Lazy morning sync on inbox load. Manual sync available. Pulls today's events → appointment tasks in Today list. Deduplicates by title + date.

### Projects + AI breakdown

Create a project with a description → hit ✨ → Claude Haiku generates 4–12 bite-sized tasks respecting a 90-min daily budget, spread across day_offset (tomorrow, day after, etc.). Tasks auto-created in inbox with weights and due dates. Manual task add also available.

### AllTasks + Search

AllTasks: all active tasks with filter bar, batch snooze, batch date assignment, optimistic updates.
Search: case-insensitive title + notes search with same batch operations.

### Bonus mode

When today's list is fully cleared, Focus enters amber "bonus mode" showing future-dated inbox and snoozed tasks. "Skip" removes locally (not inbox). Done button turns amber.

---

## Design system

Implemented in `frontend/src/index.css` using Tailwind v4 `@theme inline {}` syntax.

### Color tokens

| Token | Hex | Use |
|-------|-----|-----|
| `--color-ui-surface` | `#FFFBF0` | Page background |
| `--color-ui-text` | `#2A0F40` | Primary text |
| `--color-ui-subtext` | `#7A5090` | Secondary text |
| `--color-ui-border` | `#C4A8D4` | Card borders |
| `--color-ui-accent` | `#C490D1` | Periwinkle accent |
| `--color-ui-primary` | `#B4A8E0` | Light lavender |
| `--color-ui-nav` | `#130828` | Bottom nav background |
| Pride stripe | RGB gradient | red → violet |

### Typography

- **Headings:** Press Start 2P (Google Fonts)
- **Body:** System sans (readable at small sizes)

### Pixel utilities

- `.pixel-card` — 4px border, box-shadow offset, noise texture, pride stripe top/bottom
- `.pixel-btn` — 4px border, press effect on hover/active
- `.pixel-btn-rainbow` — gradient border with pride stripe
- `.pixel-heading` — Press Start 2P font

### Animations

Page fade-in, steam wisps, floating bob, dot pulse, nav icon animations (steam, star twinkle, heartbeat, flower spin), celebrate slide/rainbow/pun/dunk.

---

## File map

### Backend

```
backend/
  main.py             app setup, CORS, router registration, auto-migration
  database.py         SQLAlchemy engine + session, DATABASE_URL env var
  models.py           all ORM models
  schemas.py          Pydantic request/response schemas
  routes/
    auth.py           login, session tokens, invite code flow, alpha gating
    tasks.py          CRUD + today/inbox/bonus/search/backlog/critical-list
    routines.py       routine CRUD + lazy daily instance generation
    selfcare.py       SelfCareLog + CapacitySnapshot
    medication.py     MedicationSchedule + MedicationLog
    gcal.py           Google Calendar OAuth 2.0 + sync
    projects.py       Project CRUD + Claude Haiku AI breakdown
    import_csv.py     Notion CSV import
```

### Frontend

```
frontend/src/
  App.jsx                     routing, nav state, WakeScreen gate
  api/
    client.js                 singleton API client, warmUp, smart retry
    tasks.js / routines.js / selfcare.js / medication.js
    gcal.js / projects.js / auth.js
  pages/
    Focus.jsx                 home — next task card, bonus mode, imminent appts
    Triage.jsx                one-at-a-time triage with slide animation
    Today.jsx                 full today list, drag to reorder
    Inbox.jsx                 inbox list
    Waiting.jsx               snoozed items
    Capture.jsx               type-aware capture (task/appt/routine/note)
    Routines.jsx              routine CRUD
    SelfCare.jsx              foundation / self-care log
    EODGate.jsx               end-of-day mood gate + summary
    AllTasks.jsx              consolidated search + batch actions
    Projects.jsx              project list, detail, AI breakdown
    Search.jsx                title + notes search
    Settings.jsx              integrations, CSV import, nav links
    Login.jsx / Signup.jsx    auth pages
    AlphaChallenge.jsx        alpha code gate
    OnboardingWelcome.jsx     first-run welcome
  components/
    Focus.jsx → TaskCard.jsx  today/inbox item card with inline edit
    TriageCard.jsx            triage item card
    CapacityBar.jsx           load indicator (compact + full modes)
    BottomNav.jsx             mobile bottom nav + FAB
    HamburgerMenu.jsx         slide-out nav
    SnoozeSheet.jsx           snooze date picker
    WakeScreen.jsx            backend wake splash
    PageProgress.jsx          pride progress bar
    Card.jsx / Button.jsx / Input.jsx   base UI primitives
```

---

## Database models

`User`, `SessionToken`, `InviteToken`, `Task`, `Routine`, `RoutineInstance`, `SelfCareLog`, `CapacitySnapshot`, `MedicationSchedule`, `MedicationLog`, `GoogleCalendarToken`, `ActuatorCategory`, `Project`, `SiteConfig`

**Auto-migration** in `main.py` — `_migrate()` adds new columns without dropping data. No Alembic needed for additive changes.

---

## PWA

`vite-plugin-pwa` installed and configured in `vite.config.js`. Manifest with theme color, all icon sizes (64/192/512/maskable). Workbox caching: NetworkFirst for API, CacheFirst for fonts.

Install: open adh-tea.fun in Chrome → three dots → "Add to Home Screen". iOS: Safari → Share → "Add to Home Screen".

---

## Roadmap

| Phase | Status | Summary |
|-------|--------|---------|
| 1 — Core loop | ✅ | Capture, inbox, today, waiting, snooze, carry-forward |
| 2 — Morning triage | ✅ | One-at-a-time triage, capacity bar, critical list |
| 3 — Foundation | ✅ | Routines, self-care log, medication, EOD gate |
| 3.5 — Focus + Capture | ✅ | Focus home, type-aware capture, GCal OAuth |
| 3.6 — Nav + Intelligence | ✅ | AllTasks, Search, batch ops, bonus mode, deployment |
| 3.7 — AI Projects | ✅ | Project CRUD + Claude Haiku task generation |
| 6 — Pattern learning | 🔲 | Insights, actuator correlations, circuit visualization |
