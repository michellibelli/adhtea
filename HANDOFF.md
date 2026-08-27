# adhTea — Handoff Doc
*Last updated: 2026-08-20 (BUILD 4.13.1)*

> This file is the source of truth for architecture and operations.
> Design philosophy + the design system live in `PROJECT.md`.
> Data-retention analysis lives in `docs/retention.md`.

## What it is


## Project layout

```
aria/
  backend/   FastAPI + SQLite dev / PostgreSQL (Supabase) prod
  frontend/  React 19 + Vite + Tailwind v4
  BUILD      version string — the UI chip reads THIS file (see RELEASE GOTCHA)
  HANDOFF.md this file — current source of truth
  PROJECT.md design philosophy + design system (tokens, themes, type)
  SESSION.md session bookmark — current build + open items
  WORKFLOW.md release process and conventions
  docs/      retention.md (data-growth design), design.md, phases.md, tests.md
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
| Backend | https://api.adh-tea.fun | Render **Starter ($7/mo) since 2026-08-27** — no hibernation. On trial for a few months; see "Render paid-tier trial" below |
| Database | Supabase PostgreSQL | Pooler connection, project ref `yyolrtwpsbtamncihmls` |

**Render hibernation — removed 2026-08-27** by moving to the Starter plan. The cold-start / sleep-wake machinery below is now dormant but deliberately retained; see the trial note. A keep-alive pinger is no longer needed, which also retires the Cloudflare-WAF-bypass item that only existed to make one possible.

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

## Current status — BUILD 4.13.1 (2026-08-17)

`master` clean, synced with origin. Backend suite **188 passed**. `npm run build` clean. Live.

The 4.9–4.11 run did three things: unified every daily boundary onto one 4am rollover, handed the tea-box order to the user's hand, and added the morning review. 4.12.0 made the committed plan actually hold. 4.13.0 added the data-export side.

### Big shifts since BUILD 4.9.1

**CSV export (4.13.0–4.13.1, 2026-08-17).** `GET /export/tasks.csv` — every task the user owns, one row each, 21 columns (id, title, type, status, priority, effort, critical, dates, project/routine titles, tags, location, push_count, timestamps, notes). Soft-deleted rows are excluded unless `?include_deleted=true`. Settings gained an **Export** section beside Import.

4.13.1 added filters, because the first real export was mostly machine-generated history: `generate_routine_instances` writes one Task row per active routine per day (completed ones persist; skipped ones are soft-deleted at the 4am carry-forward), and `sync_today_events` writes one appointment row per occurrence, auto-completed by `archive_past_appointments` once its day passes. Nothing purges either — there is no retention sweep anywhere in the codebase. So: `?types=task,note` (validated against `TaskType`, 400 on an unknown one) plus `?since=`/`?until=`. The window is measured against the day a row *belongs to* — `completed_at` for finished work, else `due_date`, else `scheduled_date`, else `created_at` — computed in Python rather than SQL, since a COALESCE would compare the naive-UTC and local-midnight columns as if they shared a convention.

Two things worth knowing. **Column names are the importer's vocabulary** (`title`, `due_date`, `notes`, `tags`, `priority`, `status`), so an export round-trips back through `/import/csv` — there's a test pinning that. **Timestamps are converted to the user's tz** on the way out (`completed_at` etc. are naive UTC), while `due_date`/`scheduled_date` are written verbatim because they use the local-midnight convention — the same split that bit the review trigger in 4.11.6. The frontend downloads via `api.download()` in `client.js` (a bearer token can't ride on a plain `<a href>`, so it fetches the blob and clicks a synthetic link); the route sets `Access-Control-Expose-Headers` so the cross-origin client can read the server-chosen filename. Body is written with a UTF-8 BOM + CRLF for Excel. Tests: `test_export_csv.py`.

**The plan stays put (4.12.0, 2026-08-06).** Reported symptom: plan the day to capacity, start working, and items keep appearing in Today — including ones already snoozed — forcing a re-plan several times a day.

Cause: `promote_due_tasks` ran on **every** `GET /tasks/today` (Focus mount, Today mount, and after every completion via `fetchAll`) and computed `room = cap - count_today()` *live*. Anything that left Today — completed, snoozed, deferred, deleted — opened a slot that the next read refilled from the due-inbox. Completing a task summoned a replacement; pruning the plan to capacity pulled the prunings' replacements in behind her. `run_daily_rollover`'s docstring asserted these intraday sweeps were "already idempotent" — true for row duplication, false for effect. Compounding it, `snooze_task` never touched `due_date`, so a resolved snooze returned to the inbox still due today and was immediately re-promoted: the snooze undone by the sweep a moment later. And `plan_day` stamped `planned_on` but nothing read it for admission — the ritual had zero effect on what entered Today.

Fixes: promotion is now a **planning-time sweep only**, gated on `planned_on == _app_today` — after "Start my day", nothing enters Today unless she taps `+`. It fills to the **capacity-driven** slot count (`scoring.max_slots_for`, extracted from `selfcare.py` so the `(X/N)` chip and the promoter share one number) rather than the hard `DAILY_CAP=15`; with no capacity snapshot yet it falls back to `DAILY_CAP`. Snooze now carries `due_date` forward to the wake day — forward only, so a task already due later keeps its own date, and the wake date is read in the user's tz because `snooze_until` is naive UTC (an 8pm Pacific snooze is already tomorrow in UTC).

Appointments are deliberately **not** exempted from the plan gate — an item appearing unbidden is the thing being fixed. They still bypass the *capacity ceiling* during planning. Because of that, Up Next on Today now lists appointments as well as tasks (it filtered to `task` only, which would have left a held appointment with nowhere to show), and the Up Next divider carries a "N due today" badge after the day is planned so held ≠ lost. Tests: `test_promotion_gate.py`.

**One 4am rollover for everything (4.9.4, 2026-07-10).** Task carry-forward, plan reset, self-care gate, and the morning-login gate now share a single boundary. `day_start_hour` default moved 6 → 4 (one-time migration bumps existing rows, guarded on `WHERE day_start_hour=6`). Sessions expire on it too (4.9.8): `_session_expiry` computes the next `day_start_hour` in the user's tz and stores it as the token's `expires_at`, so the server enforces it — `TOKEN_EXPIRY_DAYS` is gone. `MIN_SESSION_HOURS` floors it, so a 3:50am login runs to 4am *tomorrow*. `/login` returns `expires_at` and the client stores that moment verbatim; the client has no day-boundary math of its own left to drift.

**One shared today-order, then hand-ordering (4.9.5 → 4.10.2, 2026-07-13–14).** The box and the Focus card used to sort with two different comparators, so the focused task wasn't always the front bag. The rule now lives in one place — `frontend/src/utils/ordering.js` — and both surfaces sort with it. Tiers: imminent timed items (≤5 min) → due/overdue routines → earlier clock time (untimed last) → manual `sort_order`.

Then 4.10.0 made the bags draggable. **The first drag of the day hands the order to the user**: the box and Focus card follow `sort_order` alone (`compareTasksManual`) instead of the computed tiers, for the rest of the app-day. Resets at the 4am rollover. Sole exception: an appointment inside its on-screen window (5 min before → 30 min after, `isAppointmentNow`) still floats to the front — deliberately narrower than `isImminent`, which counts anything past its due_time and would let an 08:00 routine pin itself to the front all afternoon. Backend: `User.box_ordered_on` mirrors `planned_on`, `/me` exposes `box_manual`, `POST /tasks/reorder` takes `manual_box` to stamp it. A drag in the *Today list* leaves the flag alone. The flag is server-side because `main.jsx` wipes localStorage on every BUILD change, which would silently revert the box to the time sort on each deploy.

**Morning review (4.11.0–4.11.1, 4.11.3, 4.11.6, 2026-07-17–28).** First sign-in of the day surfaces the most recent unreviewed activity-day: yesterday's finished tasks pre-tagged small/big, tap to flip the wrong ones, one button into the self-care gate. "Last unreviewed day" is tracked via `User.reviewed_through`, so weekend/sick gaps self-heal (Monday surfaces Friday). One cheap Haiku call each morning both classifies the tasks and writes a warm sunny greeting; corrections feed back as few-shot examples + exact-title overrides via the `EffortExample` store. Falls back to a keyword heuristic + rotating line if Haiku is slow — never blocks the gate. 4.11.1 added an input for logging things she did that were never captured (backdated to local noon of the reviewed day).

New with it: `Task.effort` (small|big, nullable), `User.reviewed_through`, `EffortExample`, `scoring.EFFORT_POINTS` (small=1, big=2), `review_engine.py`, `routes/review.py`, `MorningReview.jsx`. Removed at the same time: the dead weight/importance system (`TaskWeight`/`Importance` enums + columns, dropped in migration), `_workload_label`, and the uncalled `/tasks/triage-summary`.

Two trigger bugs were fixed in 4.11.3/4.11.6, both worth knowing since the pattern recurs. **Durability:** the commit was a fire-and-forget POST whose failure was swallowed, so on a napping Render backend `reviewed_through` never advanced and the same day resurfaced forever. It's now durable like completions/snoozes — persisted on transient failure, flushed on wake, only permanent 4xx dropped. **Timezone:** `completed_at` is naive UTC but the "exclude today" boundary used `_day_start` (naive *local* midnight); west of UTC that lands ~7–8h early and dropped yesterday-evening completions, so an evening-heavy day surfaced nothing. `_app_day_start_utc` now handles anything compared against `completed_at`; `_day_start` stays for `scheduled_date`, which shares the local-midnight convention.

**Medication adherence feeds capacity (4.11.2).** Marking meds moves the executive-capacitor term (and so overall capacity / slot count) the way sleep and meals do — the formula previously ignored meds entirely. Adherence = distinct active schedules logged that day / active count. Full adherence leaves executive as-is, zero knocks 40% off, no regimen (`None`) is untouched. Logging a med recomputes today's snapshot immediately.

**Nudges dialed back (4.9.6, 4.9.9).** Three a day on a 2h cooldown had become wallpaper — swatted shut on sight. Now **one a day, 6h cooldown**. A dismissal is finally read back and mutes that variable for `DISMISSAL_BACKOFF_DAYS` (an affirmative answer doesn't — "on it" isn't a request for silence). Suppression widened from today to a per-variable window (`satisfied_recently`): sleep/meals/check-in reset daily, exercise looks back a day, since its target is 4 days a week. The weekly snapshot is also rebuilt whenever a log in the window is newer than it — it used to be written once and never again, making every later self-care entry invisible to the engine.

**Smaller UI (4.9.10, 4.9.11, 4.11.4, 4.11.5).** Tag edit/snooze moved to two corner buttons (the whole tag was one big edit target); completion celebration cut 7100ms → 5650ms; login now prefetches the heavy Focus images off-DOM while she types, matching the backend wake; self-care exercise question is Yes/No only (backend falls back to 30 min when `exercise_minutes` is null).

### Big shifts since BUILD 4.0.x

**Triage merged into Today (4.4.0, 2026-06-30).** The separate Tournament/Triage page is gone. Today is now the sole planning + execution surface: a **Today** section (status=today, sortable, complete/snooze/defer/delete) and an **Up Next** section (inbox, ordered by due_date → priority → created_at, `+` promotes). Slot count shown as `(X/N)` where N = capacity-driven `max_slots` from `/capacity/today`. Morning flow: self-care gate → Today (plan inline) → Start my day. Cleanup on 2026-07-10: the orphan frontend files (`pages/Tournament.jsx`, `api/triage.js`, `utils/triage.js`) and the entire `routes/triage.py` scoring/bin-pack backend + `test_triage.py` were removed. Its two still-needed helpers (`capacity_tier`, `project_stall_map`) were extracted to `backend/scoring.py` (imported by `selfcare.py` + `insights.py`). The functionally-dead daily-caps sliders (`max_tasks_per_day`/`max_total_per_day`) were also removed from Settings + backend.

**Domains removed entirely (4.9.0, 2026-07-08).** The whole project/task time-of-day + date-rule scheduling constraint system was ripped out per user. Gone: `Domain` model, `domain_id` FKs (destructive migration — `DROP TABLE domains CASCADE` on Postgres, best-effort DROP COLUMN on SQLite), `routes/domains.py`, `domain_utils.py`, `next_allowed_date` due-date snapping, `in_context` field + its Focus/triage sorting, and all frontend domain UI (`DomainPicker`, `DomainDateWarning`, `utils/domain.js`, `api/domains.js`). Tasks now schedule purely on due_date + daily cap.

**Difficulty/weight system removed (2026-06-30)**, replaced with over-capacity signals.

**Start-my-day planning gate (4.8.0, 2026-07-07).** Once-per-day "commit your plan" ritual. Today opens in a **planning** state ("Plan your day" + fixed-bottom "Start my day ☕" button); pressing it flips to **started**. Soft gate — navigable, it's a self-signal not a lock. Backend: `User.planned_on` Date, `/me` exposes computed `day_planned`, `POST /tasks/plan-day` stamps it, resets at `day_start_hour` boundary. Tests: `test_plan_day.py`.

**Phase 6 PID nudge system (4.3.0, 2026-06-18).** PID control loop for behavior-change nudges: tracks sleep/meals/exercise/check-in against targets — P (gap), I (accumulated deficit, anti-windup), D (trend). Warm single-question micro-nudge after task completion; 2h cooldown, 3/day cap, weekday-only. `backend/pid_engine.py` (pure math), `routes/insights.py`, `WeeklySnapshot` + `NudgeLog` models, `NudgeModal.jsx` + `WeeklyInsightCard.jsx`. Lazy auto-compute — GET /weekly + /nudge create the snapshot if missing, no cron needed.

**Security hardening (4.6.0–4.6.3, 2026-07-06).** Privilege separation, auth rate limits, hashed session tokens, OAuth pending-state persisted in DB, `delete_user` Postgres crash fix (explicit owned-row purge), onboarding visibility. Earlier (4.0.1): RLS enabled on all tables in the Postgres branch of `_migrate`.

**Cold-start / sleep-wake loading covers (4.8.0–4.9.1).** Render free-tier cold starts and mid-session sleeps used to show loading→"…" skeleton jank. Now: pages (`Focus`, `Today`, `SelfCare`) dispatch `aria:page-loaded` when their primary fetch settles; App raises an opaque z-50 cover on nav + reactive wakes and lifts it only on `aria:page-loaded` (data renders underneath). Sleep-on-return funnels through a single `aria:server-waking` event (visibilitychange/focus + reactive on any request to a sleeping server). Completions/snoozes are queued to localStorage before the request, so the triggering action is never lost. 4.9.1 fixed the cold first-open specifically: removed a 2.5s `Promise.race` on `getTodayLog` that was losing the race on cold starts and skipping the self-care gate; killed the double-loader; added parallel login-screen warm-up. Correct morning flow now: (login → parallel wake) → single loading screen → self-care gate → Today → Start my day.

**Visual direction: Cafe + Linen themes only** (Americano/Berries/Chai removed 4.2.19). Cafe = warm amber, Lora serif, wood shadows, CafeShelf idle animations. Linen = soft plum/lavender paper, botanical header pill, pressed-flower SVG, paper-grain Focus card. Watercolor tea assets throughout. Tea-box metaphor on Focus (bags = tasks, ordered morning→evening — see `utils/ordering.js`, and 4.10.0 above for hand-ordering). Capture has a two-button submit (tea-cup = save+return, `+` = save+add-another).

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
  scoring.py          shared capacity_tier + project_stall_map + EFFORT_POINTS
  review_engine.py    morning-review effort classification (Haiku + learned corrections + keyword fallback)
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
    review.py         morning review — /review/pending + /review/commit
    import_csv.py     Notion CSV import
    export_csv.py     CSV export — GET /export/tasks.csv (+ types / since / until filters)
  tests/              188 pytest tests (conftest + 18 test files); CI on every push/PR
  requirements-dev.txt  pytest + httpx + tzdata
```

Run tests: `cd backend && python -m pip install -r requirements-dev.txt && python -m pytest tests/ -v`
Test files: auth, box_order, export_csv, gcal, import_csv, insights, med_capacity, medication, migrate, plan_day, projects, promotion_gate, review, routines, selfcare, tasks, tasks_lifecycle, today_merge.

## Frontend file map

```
frontend/src/
  App.jsx              routing, nav state, loading-cover orchestration, plan-day wiring
  api/client.js        singleton, warmUp(), likelySleeping(), offline queue, smart retry
  pages/
    Focus.jsx          home — pickNext(), bonus mode, watercolor dunk celebration, tap-bag-to-focus
    Today.jsx          Today / Up Next split, capacity slots, drag-reorder, planning gate
    MorningReview.jsx  first-sign-in review — effort tags, add-what-you-did, durable commit
    Capture.jsx        type-aware (task/appt/note/routine), two-button submit
    Routines.jsx       CRUD, frequency/time-of-day/critical flags
    SelfCare.jsx       foundation log + capacity bar
    EODGate.jsx        evening mood gate + summary
    AllTasks / Inbox / Waiting / Search   list surfaces, batch ops
    Projects.jsx       list + detail + AI generation + manual add
    Settings.jsx       integrations, CSV import + export, display/theme
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
    ordering.js        THE today-order rule — shared by TeaBox + Focus; computed tiers vs. manual
    prefetch.js        theme-aware off-DOM image warm-up during login
    dnd.js             SmartPointerSensor (blocks drag on inputs/buttons)
    medicationStore.js localStorage med-name pseudonymization (server stores placeholders)
    snooze.js          weekend-aware snooze date math
```

---

## Known issues / next

1. **~~Docs cleanup~~ — done 2026-08-20.** `PROJECT.md` was rewritten as a design-only doc (philosophy + design system); every operational section it duplicated from this file was deleted rather than refreshed, so there is now exactly one home for each fact. Don't re-add an architecture section there.
2. **Orphan score columns** — `Task.score`, `score_components`, `score_updated_at`, `pinned_for` remain on the model + are exposed in `TaskResponse`, but nothing writes them now that the scoring engine is gone (they read back null). Left in place to avoid a destructive prod migration; drop them in a deliberate migration if you want them gone. Same for the never-read `max_tasks_per_day`/`max_total_per_day` DB columns (model + validation removed; columns left orphaned in prod).
3. **Settings visual pass** — pending since May.
4. **Phase 6 Week 2/3** — I-term escalation needs 3+ weekly snapshots; Levels 3–4 text/email escalation (Twilio/SendGrid) unbuilt.
5. **Render cold starts** — **resolved 2026-08-27** by the Starter plan (see trial note); the history below is kept because it explains the still-present wake machinery, and applies again if the plan is reverted. Note the free tier hibernates, and a wake goes through Render's build/deploy path — so a Render deploy incident takes the *live* app down, not just deploys. Seen 2026-08-20: every request returned `503` with `x-render-routing: hibernate-wake-error` during a platform-wide "Deployment Issues" incident, which presents in the UI as **"Failed to fetch" on login** (the `OPTIONS /login` preflight 503s, so the browser never gets CORS headers). Diagnose by reading that header — it distinguishes a Render fault from a Supabase or CORS fault. Paid tier removes hibernation and with it this whole failure mode.
6. **Cloudflare challenge on `api.adh-tea.fun`** — the API host now sometimes serves a Cloudflare managed-challenge interstitial ("Just a moment…") to non-browser clients. `scripts/deploy-check.sh` and `scripts/aria-api.sh` hit it intermittently, and any uptime pinger (the UptimeRobot keep-alive above) will fail it too. Browser traffic solves the challenge transparently. Add a WAF bypass rule for `/health` before relying on a pinger.
7. **Naive-UTC vs. local-midnight boundaries** — `_day_start` (local midnight, for `scheduled_date`) and `_app_day_start_utc` (for `completed_at`) are easy to swap by accident; west of UTC the wrong one is off by 7–8h. This bit the review trigger in 4.11.6. Check which convention a column uses before comparing against it.
8. **No data retention** — nothing purges generated rows. `generate_routine_instances` writes one Task per active routine per day and `sync_today_events` one per calendar occurrence, forever; soft-deleted rows are never reaped. ~2,200 rows/year at six routines. Not urgent (single user, small for Postgres) but it already forced the 4.13.1 export filters, and `project_stall_map` does an N+1 over the growing table. Analysis + proposed design in **`docs/retention.md`** — read the `project_stall_map` trap there before writing any DELETE.

Deferred indefinitely per user (2026-05-17). Do not start without explicit greenlight. Groundwork in place: `User.role` (primary/child) + `User.parent_id`, `Task.assigned_to_id`, invite-token flow in `auth.py`, `AlphaChallenge.jsx` + `OnboardingWelcome.jsx`. To build: child-task filtering, `POST /tasks/{id}/delegate`, simplified child home view, delegation UI on the user's cards.

## Further roadmap
- **Play Store** — PWA ready; wrap with Bubblewrap for Android TWA ($25). iOS via Capacitor ($99/yr).


## Render paid-tier trial (started 2026-08-27, ~11:20 PT)

Moved the backend web service from Free to **Starter ($7/mo)** to remove
hibernation. Being run as a **time-boxed trial of a few months** — revisit
whether the improvement justifies the cost.

Baseline immediately before the switch: `/health` 200 `{"status":"ok","version":"2.0.0"}`,
frontend serving `index-Kh8D0CHI.js`, local HEAD `5ab035a`.

**Should disappear.** The 30–45s wait on first open of the day; the
"Server napping — waking it up…" message; "Failed to fetch" on login caused by
a hibernate-wake 503 on the `OPTIONS` preflight.

**Should persist, and is not evidence the upgrade failed.** A ~20s window of
failed requests after every push (auto-deploy restarts the service — the plan
removes hibernation, not restarts). And any sync stumble following an idle
stretch, which is a client bug, not a hosting one: `likelySleeping()` measures
*user* idle time, not server state, so it still returns true after 10 idle
minutes against a perfectly healthy backend.

**Do not delete the wake machinery during the trial** — `WakeScreen.jsx`, the
cover logic in `App.jsx`, `warmUp`, the `aria:server-waking` plumbing. It all
goes quiet on its own and will look like dead code. If the plan is reverted and
it's gone, the raw cold-start jank of `7901d87` comes straight back.

To revert: Render dashboard → backend service → Settings → Instance Type → Free.
