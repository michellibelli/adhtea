# adhTea — Handoff Doc
*Last updated: 2026-05-14*

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

## Current status — Phases 1–3.9 complete ✅

Everything below is shipped and live on adh-tea.fun.

### Phase 3.9 completed (2026-05-15)

Tournament-driven Triage at scale.

- **Triage tournament** — 3-card drag-to-reorder (top = most important), 10-tasks-per-day distribution across a 30-day horizon, tea-themed UX (cup-fill progress, random tea puns at 20% rate, ConfirmModal). Reachable from Today's "🍵 Triage all" and Settings → "Triage tournament 🍵".
- **Daily caps (user-configurable)** — `max_tasks_per_day` (5–15, default 10) and `max_total_per_day` (10–20, default 15) with sliders in Settings. Both enforced by `_find_target` when bundling.
- **Reset-on-start** — `POST /tasks/tournament/start` clears placements on all incomplete user tasks (task_type=task) so a campaign re-ranks from scratch. Routines + appointments stay where they are.
- **Per-card corner actions** in tournament — ✓ already done, 🌙 snooze (full SnoozeSheet picker), ✕ delete. All stop drag propagation.
- **App-styled `ConfirmModal`** replaces browser `confirm()` everywhere. Tea-themed copy ("Ready to triage everything? Let's brew it").
- **`ProjectBadge` 🌱 amber pill** renders wherever a task appears (TaskCard, AllTasks rows, Triage daily card, Tournament card, Focus teabag tag).
- **AllTasks delete** — trash-can button per row + tea-themed delete confirm.
- **Focus refetch on date-push** — editing the active task's due_date to a future day now drops the task out and backfills the next-priority item.
- **Backend hardening** — auto-sweep of misclassified `status=today` tasks whose `due_date` is in the future. Filter fixes so the inbox query includes all incomplete tasks regardless of date.
- **Triage skips routines + appointments** entirely. Tournament does too.

### Phase 3.8 completed (2026-05-14)

**Project domains** (data + UI shipped; date enforcement is Phase 2):
- `Domain` model (rules JSON: list of `{days, times, weights}` rule dicts)
- `Project.domain_id` FK; ProjectResponse exposes `domain_id` + `domain_name`
- Lazy-seed: first `/domains` call inserts Work + Home defaults per user
- `backend/routes/domains.py` — full CRUD
- `frontend/src/components/DomainPicker.jsx` — pill selector + inline "+ Other" form
- Settings → "Project domains" — full rule editor (add/remove rules, days/times/weights, name; delete non-default)
- Domain can be changed at any time from expanded project view

**Project page UX:**
- Sub-task circle now does double duty: tap = toggle done · long-press (500ms) = multi-select
- Multi-select shows accent ring + tinted row; existing batch-date bar fires at 2+ selected
- DragHandle changed from `<button>` to `<div role="button">` because SmartPointerSensor blocks drag activation on buttons (that was breaking reorder)
- Project cards expand/collapse with 300ms grid-rows-[0fr↔1fr] CSS animation
- Project task uncomplete (was missing entirely — `done` → `inbox` via `updateTask`)
- Domain badge on project header

**Backend correctness:**
- `Task.project_name` property (was `.name`, project model field is `.title` — silently caught AttributeError → always returned None)
- `joinedload(Task.project)` on `/tasks/today`, `/tasks/bonus`, `/projects/{id}`
- Cascade date shift: PATCH `/tasks/{id}` with `due_date` change on a project task shifts later sibling tasks (status not done/deleted) by the same delta
- POST `/routines` was dropping `exact_time` on create (update path worked) — fixed

**Focus card visual rework:**
- Teabag shape via clip-path; cream paper bg (#FBF6E5) + yellow-brown dot mesh
- Tag colored by task type; for project sub-tasks: amber tag with "Project" + project name as subtitle, ~2× larger font
- Bonus mode: golden bag + 5 staggered twinkling sparkles
- Bonus mode trigger fixed: now checks `pickNext()` visibility (timed routines >5 min away no longer block bonus mode)
- Next button now correctly bumps `sort_order` in bonus list too (was only updating `tasks`)
- Pun celebration sparkles spread to page edges instead of clustering with cup

**Tooling / observability:**
- `scripts/deploy-check.sh` — unauth'd curl check: production HTML/JS/CSS hashes, marker grep, backend health, local HEAD comparison
- `scripts/aria-api.sh` — authenticated production API helper. Reads bearer from `~/.aria-token` (outside repo); harvested via `localStorage.getItem('aria_token')` on adh-tea.fun
- Vercel CLI linked to project; `vercel ls`/`vercel inspect`/`vercel logs` usable from CLI
- BUILD timestamp chip auto-stamped via `vite.config.js` `define`/`__BUILD_TIME__`. Persistent in top-right of every page; remove when user requests
- Vercel marketplace plugin loaded (`/vercel:status`, `/vercel:deploy`, etc.)

**Other:**
- Settings Tasks cards are now fully clickable (whole card = button; arrow buttons removed)
- PWA service worker auto-update on visibilitychange via `controllerchange` listener in `main.jsx`
- `vercel.json` cache headers (no-cache for `index.html`/`sw.js`, immutable for `/assets/*`)
- Vite injects `__BUILD_TIME__` for the build-marker chip
- Cleaned up CSS specificity battle: `.teabag-card.pixel-card` double-class selector + `!important` beats `.pixel-card` (which also uses `!important`)

### Phase 3.7 completed prior session (2026-05-13)
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

## Next: Phase 3.8 Part 2 — Domain enforcement

Phase 3.8 Part 1 (data + UI for domains) is shipped. Still TODO:
- Validate sub-task `due_date` against domain rules on create/PATCH (reject or snap to next allowed day)
- AI breakdown: pass domain rules into the Claude prompt so generated dates fall on allowed days
- Cascade shift: when shifting later siblings, skip-and-snap forward past disallowed days
- Frontend: show inline warning if a date picker selects a disallowed day for the project's domain



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
    projects.py       Project CRUD + Claude Haiku AI breakdown + sub-task date cascade
    domains.py        Project Domain CRUD; lazy-seeds Work/Home defaults per user
    import_csv.py     Notion CSV import
```

```
scripts/
  deploy-check.sh     unauth'd: prints live JS/CSS hashes + backend health + local HEAD
  aria-api.sh         auth'd API helper. Reads bearer from ~/.aria-token
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
    DomainPicker.jsx          pills + slide-down rule editor for project domains
    Card.jsx / Button.jsx / Input.jsx
  utils/
    dnd.js                    SmartPointerSensor — blocks drag start on inputs/textareas/buttons
```

## Diagnostic workflow (since 2026-05-14)

After any push, the auto-stamped BUILD chip in the top-right confirms which deploy is in the user's browser. To verify from CLI:

```bash
bash scripts/deploy-check.sh                 # shows live JS/CSS hashes
curl -sL https://adh-tea.fun/assets/<JS> | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}'
```

For API state with auth:
```bash
bash scripts/aria-api.sh /tasks/today          # any path; bearer auto-injected
```

Vercel CLI is linked; useful queries:
```bash
vercel ls                                      # recent deployments
vercel inspect <preview-url>                   # commit, status, aliases, build logs
vercel logs <preview-url>                      # runtime logs
```

---

## Further roadmap

- **Phase 6** — pattern learning: PowerModelObservation logging, weekly insights, actuator correlations (ActuatorCategory model exists with preset list)
- **Play Store** — PWA is ready; wrap with Bubblewrap for Android TWA ($25 dev account). iOS via Capacitor ($99/yr).
