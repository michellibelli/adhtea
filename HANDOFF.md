# adhTea — Handoff Doc
*Last updated: 2026-05-17 evening (BUILD 3.9.34)*

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

## Current status — Phases 1–3 complete ✅

Everything below is shipped and live on adh-tea.fun.

### Phase 3.9.24–3.9.34 completed (2026-05-17 evening)

Aesthetic + UX cohesion pass, plus a domain enforcement bug-fix. No new
feature scope; this was polish, visual rework, and one systemic bug.

- **3.9.24** — On every new build, `main.jsx` compares stored `aria_build`
  to current `__BUILD_TIME__` and wipes localStorage on mismatch.
  **Preserved keys**: `aria_token` (session), `aria_theme` (user pick),
  `med_name_*` (real medication names — server has placeholders only,
  wipe would be permanent data loss). Ensures bug fixes that depend on
  clean local state reach users who haven't manually cleared.
- **3.9.27** — Theme registry trimmed: dropped Original (`adhtea`) and
  dead `utils/twilight.js`. Default theme now `aria-americano`. Users
  with the old id in localStorage fall back to the default automatically.
- **3.9.28** — Realistic teabag on Focus: tag stays fixed, string + bag
  swing as a pendulum (`.teabag-sway` CSS animation, transform-origin
  top center), stitched bottom seam (.teabag-stitches).
- **3.9.30** — Static tiled tea-leaves on the page background replaced
  with a `.falling-leaves` fixed overlay (six leaf SVGs, varied widths
  + durations + negative animation-delays, each in their own column).
- **3.9.31** — Persistent steeping cup removed (cup back to dunk-only).
  Page bg extracted to `.aria-page-bg` fixed layer at z-index -1 — the
  `.aria-page` element's `animation: page-in` was creating a stacking
  context that painted the bg over the fixed `.falling-leaves`. Bag
  sway slowed from 5s to 10s. Americano gradient swapped from blue
  twilight to warm amber sunrise.
- **3.9.32** — Teabag border removed (4px solid border was leaving
  rectangular ghost outlines at the clip-path's chamfered corners —
  CSS border ignores clip-path). Woven mesh texture added: thin
  horizontal threads + thin vertical threads on a 3.5px grid layered
  above the existing paper grain.
- **3.9.33** — Cohesion pass toward "calm rustic cafe": `.pixel-btn-rainbow`
  repurposed to a honey→amber→oak gradient with dusty-rose hover glow;
  `.pride-stripe` swapped 4px saturated rainbow for a 1.5px dusty-rose
  hairline; display font Press Start 2P → Lora serif (`--font-pixel`
  var stable); `.pixel-card` softened (1px subtle border, 10px rounded
  corners, soft warm wood shadow); pride-rainbow `::before/::after`
  strips on `.pixel-card` removed; bonus-mode bag sparkles removed;
  falling-leaves keyframe given wider lateral swings (±50px peaks) on
  ease-in-out timing for autumn-drift feel.
- **3.9.34** — Three physics-based leaf behaviors split across the six
  leaves: **flutter** (2 leaves, 17–18s, `rotate3d` end-over-end tumble
  on mixed X/Y/Z axes so the leaf flips edge-on; asymmetric leaves whirl
  slowly per fluid mechanics), **glide** (2 leaves, 13–14s, smooth
  diagonal drift in opposite directions, slow Z-rotation arc), **drop**
  (2 leaves, 10–11s, near-straight fall with ±8px sway; symmetric leaves
  are aerodynamically efficient and reach a higher terminal velocity).
  All six share a `cubic-bezier(0.45,0,1,0.92)` timing approximating
  gravity → terminal-velocity. GPU-composited transforms; no measurable
  perf cost. **Still needs more tuning per user — carry forward.**
- **fix(domain) 17be0ed** — Three domain-enforcement bugs in
  `backend/routes/tasks.py` and a new sweep. (1) `create_task` was
  computing `due_today` from the pre-snap `body.due_date`, so a Sunday
  pick on a weekday-only Work project still landed status=today after
  the snap moved due_date to Monday. (2) `update_task` ran the
  demote-on-future check before snapping. (3) `promote_due_tasks`
  promoted any inbox task with `due_date <= today` regardless of the
  task's domain. New `demote_domain_violations` sweep wired into
  `/tasks/today` to clean up historical drift. `_date_allowed` →
  `date_allowed` (public). +5 tests in `test_tasks.py`. Full suite
  **91 passed**.

### Phase 3.9.16–3.9.22 completed (2026-05-17)


- **3.9.16** — `autoComplete` attrs on Login/Register/Signup; `mobile-web-app-capable` meta added alongside deprecated apple variant; SelfCare runs a one-time pseudonymization migration for pre-3.9.13 med rows (copies real name to localStorage, renames server row to `Medication N` placeholder, idempotent via regex).
- **3.9.17** — `dose` column dropped from `medication_schedules` table (ALTER TABLE DROP COLUMN in `_migrate`, both SQLite and Postgres branches). Pre-3.9.11 rows held real dose strings; this removes them server-side. Schema + route + ORM model all stripped.
- **3.9.18** — Phase 3.8 Part 2 finisher: `frontend/src/utils/domain.js` mirrors `next_allowed_date()`; `<DomainDateWarning>` component shows amber inline warning below 3 date inputs in `Projects.jsx` (SortableTaskRow inline edit, batch-date bar, add-task form). Backend already snaps via `next_allowed_date`; this just surfaces the snap to the user.
- **3.9.19** — `slowapi` rate limit on `POST /login` at 10/minute per IP. Shared `Limiter` in `backend/rate_limit.py`; other auth endpoints can opt in later. Closes #22.
- **3.9.20** — Settings → Display → "Show build chip" toggle. localStorage-backed (`show_build_chip` key); live update via `aria:build-chip-changed` custom window event. Closes #7.
- **3.9.21** — Manual theme picker (initially 8 themes; trimmed to 4 in 3.9.23). Each `[data-theme="aria-*"]` block defines 14 standard `--aria-*` vars + page-bg gradient + body bg. `color-mix()` derives subtext/border/primary-hover. `ThemeContext` now manual (reads `aria_theme` from localStorage, default `adhtea`, no twilight auto-switching). Settings → Display → Theme: swatch grid, tap to swap. BottomNav, mobile header, AuthPage, pixel-card + pixel-btn shadows all use `ui-*` utilities now so they retheme.
- **3.9.22** — Teabag card paper texture: 4 layered backgrounds (2.5px fiber dots + 5px offset dots + SVG fractalNoise grain + vertical depth gradient) plus inset shadows for roundness. Bonus-mode variant in deeper amber/gold.
- **3.9.23** — Trimmed picker themes: removed Coffee, Tea, Omelette, Mint after user palette review. Final set: Original, Berries, Americano, Chai.
- **Test infrastructure** — `backend/tests/` 86 tests across 11 files; `requirements-dev.txt` pinned (pytest, httpx, tzdata). GitHub Actions workflow `.github/workflows/test.yml` runs full suite on every push + PR to master, Python 3.12 on ubuntu-latest. Run locally: `cd backend && python -m pytest tests/ -v`.

### Phase 3.9.7–3.9.15 completed (2026-05-15, evening)

Hardening + code-quality + privacy redesign pass. No new user-facing features beyond the medication redesign and tournament daily cap; rest is infrastructure polish for handoff.

- **Google Calendar multi-cal + critical sync bug fix** — `_get_service(token)` was missing inside the calendar loop in `sync_today_events`, causing every iteration to throw a silently-caught NameError → 0 events created. Multi-calendar selector UI added in Settings → Google Calendar; `PATCH /gcal/calendars` stores non-primary IDs as JSON in `token.calendar_ids`. `/gcal/debug` endpoint removed (was leaking partial client ID in production).
- **Loading + error states** — new `components/PageState.jsx` exports `PageLoading`, `PageError`, `InlineSkeletonCards`. Today/Inbox/Waiting/Projects/AllTasks all use the animated skeleton + retry button pattern instead of plain "Loading…" / silent failures.
- **Security audit + fixes** — timezone validated through `ZoneInfo()` in `update_settings` (rejects bad values), CSV import capped at 5 MB, password min length 8 enforced on Setup/Register/Signup via `Annotated[str, Field(min_length=8, max_length=128)]` (Login left alone so existing users still work), debug endpoint deleted.
- **Medication privacy redesign** — `dose` field removed entirely (form, schema-level, display). Server now stores placeholder names ("Medication 1", "Medication 2") in `MedicationSchedule.name`; real names live in `localStorage` keyed by `med_name_{userId}_{serverId}` via `frontend/src/utils/medicationStore.js`. Reminder times and taken-logs stay server-side and survive any device change. UI shows a privacy note explaining the model and falls back to "name not on this device" if the local map is cleared. Frontend keeps using the existing `/medication/*` server API; only the name string is pseudonymous.
- **Tournament daily 3-pass cap** — `localStorage` tracks `triage_pass_count` per day. Pass 2 shows a refinement banner; pass 3 says "final pass"; pass 4+ shows a friendly gate screen ("Priorities are locked in. Come back tomorrow."). Auto-resets at midnight. Increments only on `Done`, not on abandon.
- **Code review pass (perf + readability)** — projects.py N+1 fix (single `func.count` + `group_by` instead of one query per project), Today.jsx optimistic updates (tasks disappear instantly), Inbox.jsx `useRef` stabilization for `onCountChange` so parent re-renders don't trigger refetches, Settings.jsx primary-calendar detection no longer matches calendars merely named "Primary X". Named constants for `TOKEN_EXPIRY_DAYS`, `TRIAGE_SHOW_LIMIT`, `EXEC_GOOD/OK/LOW`, `WARMUP_RETRY_DELAY_MS`. Weekend date math in `snooze.js` simplified to single modulo formula. Plain-English explanatory comments added throughout for handoff readability (`domain_utils.py`, `auth.py`, `tasks.py`, `Focus.jsx`, `TaskCard.jsx`, more).
- **Code review pass (correctness + error handling)** — `auth.py /me` now uses `UserResponse.model_validate()` instead of dumping `__table__.columns` (future sensitive fields like a hypothetical `hashed_password` can't accidentally leak through the dict comprehension). `_maybe_sync_gcal` and `gcal.py /status` JSON-parse exceptions now log to server output instead of `except: pass`. Triage CriticalList complete button wrapped in proper try/catch + refetch fallback.
- **.gitignore tightened** — `docs/Secret Key.txt` and `docs/Server Stuff.txt` added; confirmed never committed via `git log --all`.

### Phase 3.9.0–3.9.6 completed (2026-05-15, earlier waves)

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

1. **Falling-leaf animation still needs work** — three-behavior physics
   pass (3.9.34) is closer but not done per user. Carry forward into
   next session. Tunables: durations, swing magnitudes, rotation
   speeds, leaf-count, ease curves.
2. **Real device test of medication pseudonymization** — verify on the user's phone that the name map persists, clears cleanly, and the privacy note is visible.
3. **Real human code review** — both AI passes still missed things a human would catch.
4. **Hardcoded hex sweep (cleanup)** — `Focus.jsx`, `Tournament.jsx`, `OnboardingWelcome.jsx`, `WakeScreen.jsx`, `PageProgress.jsx` still have raw hex literals (sparkles, gradients). Cosmetic.
5. **`update_task` server-tz bug** — uses `date.today()` (UTC) instead of `_app_today(user)` (user tz). Edge case near midnight in user's local zone. Pre-existing; not in scope for this session's domain fix.

Resolved 2026-05-15: #2 UptimeRobot, #3 TriageCard inline edit, #4 GCal multi-cal, #5 loading/error states, #11 security audit, #21 GCal sync bug.
Resolved 2026-05-17 (morning): #7 Build chip Settings toggle (3.9.20), #22 Login rate limit (3.9.19), Phase 3.8 Part 2 domain enforcement (3.9.18).
Resolved 2026-05-17 (evening): bonus mode teabag, domain enforcement bypass on create/update/promote, aesthetic cohesion across nav + buttons + font + cards.

---

## Next: Focus-page tea-box redesign + new logo (planned for next session)

Phase 3 closed; Phase 4 still deferred. User has lined up the next visual
overhaul, scope-locked to the Focus page + branding:

- **Tea-box on Focus** — visual tea box that bags emerge from. Bag count
  in the box = uncompleted tasks today (live). The persistent cup was
  removed in 3.9.31 so there's room to introduce this without colliding
  with anything currently on the page.
- **Bag colors per task type** — each bag tinted by its `task_type` (the
  existing tag-color map already provides this palette).
- **Bag order = day plan** — emergence order matches the prioritized
  task order from triage.
- **Bottom-nav cafe typography** — re-skin nav buttons to read like the
  letterpress wordmark + simple flat icons + rule lines you see on real
  tea boxes (Bigelow, Yogi, Harney). `frontend/src/components/BottomNav.jsx`.
- **New logo + iconography for adhTea** — full brand pass. Current logo
  file: `public/adhTeaLogo.png` (consumers grepped on 2026-05-17).


**Status:** Deferred indefinitely per user (2026-05-17). Do not start without explicit greenlight.


**Groundwork already in place:**
- `User` model has `role` (primary/child) and `parent_id` fields
- `Task` model has `assigned_to_id`
- Invite token flow exists in `backend/routes/auth.py`
- `AlphaChallenge.jsx` + `OnboardingWelcome.jsx` pages exist

**What needs building when unblocked:**
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
  rate_limit.py       shared slowapi Limiter (keyed on client IP)
  routes/
    auth.py           login (10/min rate limit), session tokens (TOKEN_EXPIRY_DAYS=30), invite codes
    tasks.py          CRUD + today/inbox/bonus/search/backlog/critical-list endpoints
    routines.py       routine CRUD + lazy daily instance generation
    selfcare.py       SelfCareLog + CapacitySnapshot
    medication.py     MedicationSchedule + MedicationLog (no dose field as of 3.9.17)
    gcal.py           Google Calendar OAuth 2.0 + lazy sync
    projects.py       Project CRUD + Claude Haiku AI breakdown + sub-task date cascade
    domains.py        Project Domain CRUD; lazy-seeds Work/Home defaults per user
    import_csv.py     Notion CSV import
  tests/              86 pytest tests (conftest + 10 test files); see Test infra section
  requirements-dev.txt  pytest + httpx + tzdata
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
    CapacityBar.jsx           compact (Focus/Triage) + full (Foundation)
    BottomNav.jsx             mobile + desktop nav; uses ui-nav / ui-primary utilities
    HamburgerMenu.jsx         slide-out nav
    WakeScreen.jsx            5s splash → 60s diary + countdown + health check
    SnoozeSheet.jsx           snooze date picker
    DomainPicker.jsx          pills + slide-down rule editor for project domains
    DomainDateWarning.jsx     amber warning when picked date hits disallowed domain day
    PageState.jsx             PageLoading / PageError / InlineSkeletonCards
    Card.jsx / Button.jsx / Input.jsx
  context/
    ThemeContext.jsx          manual theme picker; reads aria_theme localStorage; 8 themes registered
  utils/
    dnd.js                    SmartPointerSensor — blocks drag start on inputs/textareas/buttons
    domain.js                 frontend mirror of next_allowed_date (for warning UI)
    medicationStore.js        localStorage med name pseudonymization (server stores placeholders)
    snooze.js                 weekend-aware snooze date math
```

## Test infrastructure (added 2026-05-17)

86 pytest tests covering every backend route. Runs locally + on CI.

```bash
cd backend
python -m pip install -r requirements-dev.txt   # pytest + httpx + tzdata
python -m pytest tests/ -v
```

| File | Tests | Covers |
|------|-------|--------|
| test_auth.py            | 10 | setup/login/me, password min, expired token, no hashed_password leak |
| test_domain_utils.py    | 13 | `next_allowed_date` snap, OR rule logic, prompt hint |
| test_gcal.py            |  7 | sync_today_events, multi-cal loop (regression guard #21), dedup |
| test_import_csv.py      |  6 | non-csv ext, 5MB cap, title-column required, BOM, date formats |
| test_medication.py      |  7 | name verbatim, no dose accepted, log idempotency per day |
| test_migrate.py         |  4 | idempotent re-runs, dose column drop, no-op when absent |
| test_projects.py        |  5 | AI breakdown (mocked Anthropic), N+1 absence (sqlalchemy event listener) |
| test_routines.py        | 10 | CRUD, `_is_routine_due` dispatch, lazy instance generation |
| test_selfcare.py        |  7 | `_compute_capacity`, log upsert, snapshot recompute, daily summary |
| test_tasks.py           |  8 | cascade date shift, `_find_target` daily caps |
| test_tasks_lifecycle.py |  9 | `_app_today` tz, carry-forward, snoozes, demote, promote |

CI: `.github/workflows/test.yml` runs full suite on every push + PR to master (Python 3.12, ubuntu-latest, pip cache keyed off requirements-dev.txt).

`conftest.py` provides `db_engine` (in-memory SQLite via `StaticPool`), `db_session`, `client` (FastAPI TestClient with `get_db` override), `primary_user_token`, `auth_headers`. Per-module autouse `_seed_user` fixture for tests that need the primary user without hitting HTTP.

## Theme system (added 2026-05-17, 3.9.21; trimmed 3.9.23)

Manual user-selected themes, 4 registered. Each `[data-theme="..."]` block in `index.css` defines 14 `--aria-*` vars + page-bg gradient + body bg. `color-mix()` derives subtext / border / primary-hover from the palette inputs.

| Theme id          | Label     | Notes |
|-------------------|-----------|-------|
| `adhtea`          | Original  | Pixel pride / queer cozy. Has unique SVG starfield page-bg. |
| `aria-berries`    | Berries   | Cream/plum pastel; 5-color (sky blue badge) |
| `aria-americano`  | Americano | Cream + navy; cleanest contrast (AAA) |
| `aria-chai`       | Chai      | Cream + cinnamon brown; 5-color (gray badge) |

`ThemeContext` reads `aria_theme` from localStorage, defaults to `adhtea`, persists on every set, applies `data-theme` to `<html>`. Settings → Display → Theme provides 4-swatch grid; tap = instant swap. Unknown stored ids fall back to `adhtea` automatically.

**Trimmed from initial 8:** Coffee, Tea, Omelette, Mint — user vetoed during palette review. If revived, palette hexes are preserved in commit history.

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
