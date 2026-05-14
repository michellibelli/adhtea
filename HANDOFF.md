# adhTea — Handoff Doc
*Last updated: 2026-05-13*

> Full project documentation → see `PROJECT.md`

## Project layout

```
aria/
  backend/   FastAPI + SQLite dev / PostgreSQL (Supabase) prod
  frontend/  React 19 + Vite + Tailwind v4
  PROJECT.md full project docs
  HANDOFF.md this file
```

Run locally:
```bash
cd backend && python -m uvicorn main:app --reload
cd frontend && npm run dev
```

Primary user (prod): username=`demo_user`, user_id=2.

---

## Deployment (live)

| Service | URL | Notes |
|---------|-----|-------|
| Frontend | https://adh-tea.fun | Vercel, auto-deploys on push to master |
| Backend | https://api.adh-tea.fun | Render free tier, sleeps after 15 min idle |
| Database | Supabase PostgreSQL | Pooler connection, project ref `yyolrtwpsbtamncihmls` |

**Render sleeps** — set up UptimeRobot ping to `https://api.adh-tea.fun/health` every 5 min.

**Render DATABASE_URL** — password must be URL-encoded (`&` → `%26`, `@` → `%40`).

---

## Current status — Phases 1–3.7 complete ✅

Everything below is shipped and live on adh-tea.fun.

### Phase 3.7 completed this session (2026-05-13)
- AI project breakdown via Claude Haiku — `backend/routes/projects.py` lines 116–190
- `ANTHROPIC_API_KEY` added to Render env vars → live
- Frontend: `Projects.jsx` fully wired — ✨ button triggers generation, inline task list, add/complete/remove/archive
- `frontend/src/api/projects.js` — all endpoints including `generateProjectTasks`

### Previously completed (all live)
- **Phase 1** — Core loop: inbox, today, waiting, snooze, carry-forward, time-of-day theming
- **Phase 2** — Triage: one-at-a-time, capacity bar, critical list, localStorage done-flag
- **Phase 3** — Foundation: routines, self-care log, medication, EOD gate
- **Phase 3.5** — Focus home screen, type-aware capture, Google Calendar OAuth, inline task edit
- **Phase 3.6** — Nav redesign (hamburger + FAB), AllTasks, Search, batch ops, bonus mode, Render/Vercel/Supabase deployment
- **Design system** — adhTea palette + pixel utilities fully implemented in `index.css`
- **WakeScreen** — backend wake splash wired in `App.jsx`
- **PWA** — `vite-plugin-pwa` installed + configured in `vite.config.js`

---

## Known issues / small todos

1. **UptimeRobot** — Render sleep workaround not set up yet. Add ping to `https://api.adh-tea.fun/health` every 5 min.
2. **TriageCard inline edit** — `TriageCard.jsx` lacks pencil edit button (`TaskCard.jsx` has it).
3. **Google Calendar multi-calendar** — no UI to select which calendars to sync (defaults to primary).
4. **Loading/error states** — some pages lack skeleton loaders or graceful API failure UI.
5. **BottomNav crowding** — 8 items tight on mobile; may need redesign before wider rollout.

---



**Groundwork already in place:**
- `User` model has `role` (primary/child) and `parent_id` fields
- `Task` model has `assigned_to_id`
- Invite token flow exists in `backend/routes/auth.py`
- `AlphaChallenge.jsx` + `OnboardingWelcome.jsx` pages exist

**What needs building:**
1. **Backend** — filter delegated tasks for child users, delegation endpoint (`POST /tasks/{id}/delegate`)
2. **Frontend** — child home view (simplified: just his routines + delegated tasks, big checkboxes)
3. **the user's view** — delegation UI on triage/today cards, completion status visible

**Where to start:** `backend/routes/auth.py` (child account creation) → `backend/routes/tasks.py` (delegation endpoint) → new `frontend/src/pages/AndeView.jsx`

---

## Backend file map

```
backend/
  main.py             app setup, CORS, router registration, auto-migration (_migrate fn)
  database.py         SQLAlchemy engine + session
  models.py           all ORM models
  schemas.py          Pydantic schemas
  routes/
    auth.py           login, session tokens (TOKEN_EXPIRY_DAYS=30), invite codes
    tasks.py          CRUD + today/inbox/bonus/search/backlog/critical-list endpoints
    routines.py       routine CRUD + lazy daily instance generation
    selfcare.py       SelfCareLog + CapacitySnapshot
    medication.py     MedicationSchedule + MedicationLog
    gcal.py           Google Calendar OAuth 2.0 + lazy sync
    projects.py       Project CRUD + Claude Haiku AI breakdown (POST /{id}/generate)
    import_csv.py     Notion CSV import
```

## Frontend file map

```
frontend/src/
  App.jsx                     routing, nav state, WakeScreen gate
  api/client.js               singleton, warmUp(), likelySleeping(), smart retry
  pages/
    Focus.jsx                 home — pickNext(), bonus mode, isImminent() for appts
    Triage.jsx                one-at-a-time, slide animation, defer vs snooze
    Today.jsx                 full list, drag-to-reorder
    Capture.jsx               type-aware (task/appt/routine/note)
    SelfCare.jsx              foundation log + full capacity bar
    EODGate.jsx               mood gate (required) + warm summary
    AllTasks.jsx              filter + batch snooze/date, optimistic updates
    Projects.jsx              list + detail + AI generation + manual add
    Search.jsx                title+notes search + batch date assign
    Settings.jsx              integrations, CSV import, nav links
  components/
    TaskCard.jsx              inline edit (pencil), done/snooze actions
    TriageCard.jsx            triage item (needs pencil edit — see known issues)
    CapacityBar.jsx           compact (Focus/Triage) + full (Foundation)
    BottomNav.jsx             mobile: Routines | Log | ☰ + FAB
    HamburgerMenu.jsx         slide-out nav
    WakeScreen.jsx            5s splash → 60s diary + countdown + health check
    SnoozeSheet.jsx           snooze date picker
    Card.jsx / Button.jsx / Input.jsx
```

---

## Further roadmap

- **Phase 6** — pattern learning: PowerModelObservation logging, weekly insights, actuator correlations (ActuatorCategory model exists with preset list)
- **Play Store** — PWA is ready; wrap with Bubblewrap for Android TWA ($25 dev account). iOS via Capacitor ($99/yr).
