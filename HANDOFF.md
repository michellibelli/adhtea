# adhTea — Handoff Doc
*Last updated: 2026-07-10 (BUILD 4.9.1)*

> Deeper design notes → `PROJECT.md` (note: PROJECT.md itself is stale at 4.0.0; this file is the current source of truth).

## What it is


## Project layout

```
aria/
  backend/   FastAPI + SQLite dev / PostgreSQL (Supabase) prod
  frontend/  React 19 + Vite + Tailwind v4
  BUILD      version string — the UI chip reads THIS file (see RELEASE GOTCHA)
  HANDOFF.md this file — current source of truth
  PROJECT.md older design doc (stale at 4.0.0; philosophy still valid)
  SESSION.md session bookmark (stale at 4.0.72)
```

Repo: `github.com/michellibelli/aria`. Local clone: `C:\Users\Chris\aria-work`.
NB — a no-git snapshot copy also lives at `OneDrive\Desktop\aria-master` (frozen 2026-07-02). Do not edit it; edit the git clone.

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

**Render sleeps at 15 min idle** — the app now handles cold starts + sleep/wake in-UI with an opaque loading cover (see below). UptimeRobot ping to `/health` still recommended to reduce cold hits.

**Render DATABASE_URL** — password must be URL-encoded (`&`→`%26`, `@`→`%40`).

### RELEASE GOTCHA
The version chip reads the repo-root **`BUILD` file** (`frontend/vite.config.js` → `__BUILD_TIME__`). Bumping the version in the commit *message* does nothing. You MUST edit the `BUILD` file every release, or (a) the chip shows the old version and (b) `main.jsx`'s stale-localStorage wipe — which keys off BUILD changing — won't fire. This was missed on 7901d87 + f03064c (chip stuck at 4.7.2), fixed in 76b60b0.

### Diagnostics
```bash
bash scripts/deploy-check.sh        # live JS/CSS hashes + backend health + local HEAD
bash scripts/aria-api.sh /tasks/today   # auth'd API helper; bearer from ~/.aria-token
vercel ls / vercel inspect <url> / vercel logs <url>
```

---

## Current status — BUILD 4.9.1 (2026-07-09)

`master` clean, synced with origin. Backend suite **186 passed**. `npm run build` clean. Live.

The last ~six weeks were reliability + subtraction: three subsystems (domains, tournament triage, difficulty/weight) were removed, security was hardened, and cold-start/sleep-wake loading was made robust. Feature surface is stable.

### Big shifts since BUILD 4.0.x

**Triage merged into Today (4.4.0, 2026-06-30).** The separate Tournament/Triage page is gone. Today is now the sole planning + execution surface: a **Today** section (status=today, sortable, complete/snooze/defer/delete) and an **Up Next** section (inbox, ordered by due_date → priority → created_at, `+` promotes). Slot count shown as `(X/N)` where N = capacity-driven `max_slots` from `/capacity/today`. Morning flow: self-care gate → Today (plan inline) → Start my day. Cleanup on 2026-07-10: the orphan frontend files (`pages/Tournament.jsx`, `api/triage.js`, `utils/triage.js`) and the entire `routes/triage.py` scoring/bin-pack backend + `test_triage.py` were removed. Its two still-needed helpers (`capacity_tier`, `project_stall_map`) were extracted to `backend/scoring.py` (imported by `selfcare.py` + `insights.py`). The functionally-dead daily-caps sliders (`max_tasks_per_day`/`max_total_per_day`) were also removed from Settings + backend.

**Domains removed entirely (4.9.0, 2026-07-08).** The whole project/task time-of-day + date-rule scheduling constraint system was ripped out per user. Gone: `Domain` model, `domain_id` FKs (destructive migration — `DROP TABLE domains CASCADE` on Postgres, best-effort DROP COLUMN on SQLite), `routes/domains.py`, `domain_utils.py`, `next_allowed_date` due-date snapping, `in_context` field + its Focus/triage sorting, and all frontend domain UI (`DomainPicker`, `DomainDateWarning`, `utils/domain.js`, `api/domains.js`). Tasks now schedule purely on due_date + daily cap.

**Difficulty/weight system removed (2026-06-30)**, replaced with over-capacity signals.

**Start-my-day planning gate (4.8.0, 2026-07-07).** Once-per-day "commit your plan" ritual. Today opens in a **planning** state ("Plan your day" + fixed-bottom "Start my day ☕" button); pressing it flips to **started**. Soft gate — navigable, it's a self-signal not a lock. Backend: `User.planned_on` Date, `/me` exposes computed `day_planned`, `POST /tasks/plan-day` stamps it, resets at `day_start_hour` boundary. Tests: `test_plan_day.py`.

**Phase 6 PID nudge system (4.3.0, 2026-06-18).** PID control loop for behavior-change nudges: tracks sleep/meals/exercise/check-in against targets — P (gap), I (accumulated deficit, anti-windup), D (trend). Warm single-question micro-nudge after task completion; 2h cooldown, 3/day cap, weekday-only. `backend/pid_engine.py` (pure math), `routes/insights.py`, `WeeklySnapshot` + `NudgeLog` models, `NudgeModal.jsx` + `WeeklyInsightCard.jsx`. Lazy auto-compute — GET /weekly + /nudge create the snapshot if missing, no cron needed.

**Security hardening (4.6.0–4.6.3, 2026-07-06).** Privilege separation, auth rate limits, hashed session tokens, OAuth pending-state persisted in DB, `delete_user` Postgres crash fix (explicit owned-row purge), onboarding visibility. Earlier (4.0.1): RLS enabled on all tables in the Postgres branch of `_migrate`.

**Cold-start / sleep-wake loading covers (4.8.0–4.9.1).** Render free-tier cold starts and mid-session sleeps used to show loading→"…" skeleton jank. Now: pages (`Focus`, `Today`, `SelfCare`) dispatch `aria:page-loaded` when their primary fetch settles; App raises an opaque z-50 cover on nav + reactive wakes and lifts it only on `aria:page-loaded` (data renders underneath). Sleep-on-return funnels through a single `aria:server-waking` event (visibilitychange/focus + reactive on any request to a sleeping server). Completions/snoozes are queued to localStorage before the request, so the triggering action is never lost. 4.9.1 fixed the cold first-open specifically: removed a 2.5s `Promise.race` on `getTodayLog` that was losing the race on cold starts and skipping the self-care gate; killed the double-loader; added parallel login-screen warm-up. Correct morning flow now: (login → parallel wake) → single loading screen → self-care gate → Today → Start my day.

**Visual direction: Cafe + Linen themes only** (Americano/Berries/Chai removed 4.2.19). Cafe = warm amber, Lora serif, wood shadows, CafeShelf idle animations. Linen = soft plum/lavender paper, botanical header pill, pressed-flower SVG, paper-grain Focus card. Watercolor tea assets throughout. Tea-box metaphor on Focus (bags = tasks, ordered morning→evening by due_time). Capture has a two-button submit (tea-cup = save+return, `+` = save+add-another).

---

## Backend file map

```
backend/
  main.py             app setup, CORS, router registration, _migrate() auto-migration
  database.py         SQLAlchemy engine + session
  models.py           all ORM models
  schemas.py          Pydantic schemas
  rate_limit.py       shared slowapi Limiter (keyed on client IP)
  pid_engine.py       pure PID math for nudges (no DB imports)
  scoring.py          shared capacity_tier + project_stall_map (used by selfcare + insights)
  routes/
    auth.py           login (rate-limited), session tokens (hashed), settings, invite codes
    tasks.py          CRUD + today/inbox/bonus/search/plan-day endpoints
    task_lifecycle.py lifecycle engine extracted from tasks.py (carry-forward, rollover, promote/demote)
    routines.py       routine CRUD + lazy daily instance generation (rollover-race guarded)
    selfcare.py       SelfCareLog + CapacitySnapshot + /capacity/today (user-tz dates)
    medication.py     MedicationSchedule + MedicationLog (names pseudonymized client-side)
    gcal.py           Google Calendar OAuth 2.0 + lazy sync (OAuth state persisted in DB)
    projects.py       Project CRUD + Claude Haiku AI breakdown + sub-task date cascade
    insights.py       Phase 6 — PID nudges, weekly snapshots, compute-weekly/nudge/respond
    import_csv.py     Notion CSV import
  tests/              125 pytest tests (conftest + 12 test files); CI on every push/PR
  requirements-dev.txt  pytest + httpx + tzdata
```

Run tests: `cd backend && python -m pip install -r requirements-dev.txt && python -m pytest tests/ -v`
Test files: auth, gcal, import_csv, insights, medication, migrate, plan_day, projects, routines, selfcare, tasks, tasks_lifecycle, today_merge.

## Frontend file map

```
frontend/src/
  App.jsx              routing, nav state, loading-cover orchestration, plan-day wiring
  api/client.js        singleton, warmUp(), likelySleeping(), offline queue, smart retry
  pages/
    Focus.jsx          home — pickNext(), bonus mode, watercolor dunk celebration, tap-bag-to-focus
    Today.jsx          Today / Up Next split, capacity slots, drag-reorder, planning gate
    Capture.jsx        type-aware (task/appt/note/routine), two-button submit
    Routines.jsx       CRUD, frequency/time-of-day/critical flags
    SelfCare.jsx       foundation log + capacity bar
    EODGate.jsx        evening mood gate + summary
    AllTasks / Inbox / Waiting / Search   list surfaces, batch ops
    Projects.jsx       list + detail + AI generation + manual add
    Settings.jsx       integrations, daily caps, CSV import, display/theme
    Login / Signup / Register / AlphaChallenge / OnboardingWelcome   auth + onboarding
  components/
    TaskCard.jsx       inline edit, done/snooze; used across surfaces
    TeaBox.jsx         Focus tea-box bags, ordered by due then due_time
    EditTaskSheet.jsx  shared edit modal (Focus + others)
    CapacityBar.jsx    compact + full
    NudgeModal.jsx / WeeklyInsightCard.jsx   Phase 6 nudge UI
    WakeScreen.jsx     cold-start splash + diary prompt
    CafeShelf.jsx      Cafe-theme animated shelf
    Card / Button / Input / Logo / ConfirmModal / HamburgerMenu / PageState / PageProgress / SnoozeSheet / ProjectBadge
  context/
    ThemeContext.jsx   two themes — Cafe (default) + Linen — reads aria_theme localStorage
  utils/
    dnd.js             SmartPointerSensor (blocks drag on inputs/buttons)
    medicationStore.js localStorage med-name pseudonymization (server stores placeholders)
    snooze.js          weekend-aware snooze date math
```

---

## Known issues / next

1. **Docs cleanup** — `PROJECT.md` (4.0.0) and `SESSION.md` (4.0.72) are stale; this HANDOFF is current. Fold or refresh them when convenient.
2. **Orphan score columns** — `Task.score`, `score_components`, `score_updated_at`, `pinned_for` remain on the model + are exposed in `TaskResponse`, but nothing writes them now that the scoring engine is gone (they read back null). Left in place to avoid a destructive prod migration; drop them in a deliberate migration if you want them gone. Same for the never-read `max_tasks_per_day`/`max_total_per_day` DB columns (model + validation removed; columns left orphaned in prod).
3. **Untracked artwork** — `frontend/public/flowers/{tea-cup-full, tea-kettle-full, wood[1-3]-{linen,warm}}.png` are uncommitted and unreferenced. Intended for "started"-state Today artwork; not yet wired. Commit + use or discard.
4. **Settings visual pass** — pending since May.
5. **Phase 6 Week 2/3** — I-term escalation needs 3+ weekly snapshots; Levels 3–4 text/email escalation (Twilio/SendGrid) unbuilt.
6. **Render cold starts** — mitigated in-UI; paid tier or keep-alive still the real fix.

Deferred indefinitely per user (2026-05-17). Do not start without explicit greenlight. Groundwork in place: `User.role` (primary/child) + `User.parent_id`, `Task.assigned_to_id`, invite-token flow in `auth.py`, `AlphaChallenge.jsx` + `OnboardingWelcome.jsx`. To build: child-task filtering, `POST /tasks/{id}/delegate`, simplified child home view, delegation UI on the user's cards.

## Further roadmap
- **Play Store** — PWA ready; wrap with Bubblewrap for Android TWA ($25). iOS via Capacitor ($99/yr).
