# adhTea — Handoff Doc
*Last updated: 2026-09-17 (BUILD 4.24.3)*

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

**Render hibernation — removed 2026-08-27** by moving to the Starter plan, and the trial concluded 2026-09-09 in its favour: **keep Starter.** The cold-start / sleep-wake *UI* was deleted in 4.15.0 (see below); the request-retry half survives in `client.js`. A keep-alive pinger is no longer needed, which also retires the Cloudflare-WAF-bypass item that only existed to make one possible.

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

## Current status — BUILD 4.24.3 (2026-09-17)

`master` clean, synced with origin. Backend suite **146 passed**. `npm run build` clean. Live.

The 4.9–4.11 run did three things: unified every daily boundary onto one 4am rollover, handed the tea-box order to the user's hand, and added the morning review. 4.12.0 made the committed plan actually hold. 4.13.0 added the data-export side. 4.13.2 hardened the offline queue alongside the move to Render Starter. 4.14.0 stopped hiding the load time and cleared the dead scoring code. 4.15.0 ended the Render trial in the affirmative and deleted the machinery it made obsolete. 4.16.x removed Projects entirely.

**Since then (4.17–4.24.3), the app kept getting simpler rather than bigger.** Retro time tracking shipped much leaner than its design doc (4.18.0 — see the time-tracking section below). Work/not-work classification landed, then most of the machinery built around it (effort gate, nudge popup) was removed within the same run of releases once it proved to be friction rather than help (4.19–4.21.0). Medication went from per-medication schedules to one yes/no toggle (4.22.0). Google Calendar was removed outright after a "task I didn't add" bug report led back to `promote_due_tasks`, which was also killed (2026-09-15). The weekly-insight nudge line was found hiding in a second surface and removed from both (2026-09-16) — between that and `NudgeModal`'s removal in 4.21.0, **the Phase 6 nudge UI is now gone entirely**; only `pid_engine.py`/`WeeklySnapshot` groundwork remains, unused. The routine time-bucket redesign shipped (fb221f7, 2026-09-16), replacing `due_time` ordering with four coarse buckets plus Haiku-classified easy/hard task interleave, and the appointment task type was dropped in the same push. 4.23.0–4.24.3 rewrote TeaBox's capacity-tier sizing against real rendered width and then, per direct follow-up requests, removed its capacity messaging entirely — the tea box now shows no over-capacity pill and no "box full" note (the `(X/N)` slot chip survives on the **Today** page, which is a separate surface from the box).

**Net effect worth internalizing:** this codebase's habit of deleting features rather than tuning them (see PROJECT.md) hit the nudge/effort system hardest of anything so far — a whole PID-driven behavior-change subsystem shipped in 4.3.0 is now UI-dead. Don't assume anything described as "nudge," "insight card," or "effort" below this point is still live; it's kept as history because the pattern (surface removed twice, in two places) is worth knowing if it recurs a third time.

### Big shifts since BUILD 4.16.1

**Retro time tracking (4.18.0, 2026-09-14) — shipped much leaner than its design doc.** `docs/time-tracking.md` specced a full Matter/TimeEntry schema with a hard submit gate and auto-email to an office manager. What actually shipped: `Task.minutes_spent` (nullable int) plus a new first screen in `EODGate` — today's done tasks with a per-row minutes input, autosaved via the existing generic `PATCH /tasks/{id}` — and a "Copy for boss" button that builds `Title - Xm` lines + a total onto the clipboard. No Matter table, no hard gate, no email infra. `EODGate` also gained a manual trigger (Settings → Tasks → "End of day"). Same commit added a faster kettle quick-add: pressing the kettle on Focus creates a blank "New task" and opens `EditTaskSheet` directly instead of the full Capture form.

**Work/not-work classification, then most of its own scaffolding removed (4.19.0–4.21.0, 2026-09-14–15).** `Task.is_work` landed with an inbox-sort ask-gate and a minutes-prompt, both removed within days once they proved to be friction: 4.20.0 dropped the effort gate + nudge popup, 4.21.0 defaulted `is_work=true` and replaced the ask with a plain card toggle. `NudgeModal.jsx` was deleted in this pass.

**Medication simplified to one yes/no (4.22.0, 2026-09-15).** Per-medication schedules/logs replaced with a single toggle, gated in Settings. `medication.py`, `medicationStore.js`, `api/medication.js` deleted; `MedicationSchedule`/`MedicationLog` models left ORPHANED in prod (not dropped) — same treatment as the earlier score columns.

**Google Calendar removed entirely (2026-09-15, commits 5939397/a55db46).** Root-caused from a "task I didn't add" report: `promote_due_tasks()` was refilling Today from Inbox on every read even after "Start my day," independent of gcal. Fixed by killing it outright rather than gating it better. Investigating gcal's own silent-auto-import (`_maybe_sync_gcal`, same anti-pattern) led to removing the whole integration per direct request ("more trouble than help"). `GoogleCalendarToken` model ORPHANED.

**Weekly-insight line removed, Phase 6 nudge UI now fully gone (2026-09-16, commit 9c6e2f6).** `WeeklyInsightCard` was found still surfacing the exact nudge copy that had already been asked to be removed once — it had relocated from Focus to the self-care gate. Both instances are gone now. Combined with `NudgeModal`'s removal in 4.21.0, **there is no live nudge/weekly-insight UI left anywhere in the app.** `pid_engine.py`, `WeeklySnapshot`, and `compute_pid_state` survive as unused groundwork per the north-star notes — nothing renders their output.

**Routine time-bucket redesign + appointment type dropped (2026-09-16, commit fb221f7).** Tea-box order rebuilt around four coarse buckets — `First → 1-2 easy tasks → Morning → 1-2 hard tasks → Mid Day → 1-2 hard tasks → Afternoon → rest` — replacing the old due/due_time sort. `Routine.bucket` (plain string) replaces the decorative `time_of_day`. `Task.difficulty` (easy/hard) is classified once via Haiku at creation (`backend/difficulty_engine.py`, same lazy-import/fallback pattern as `review_engine.py`); null reads as easy, so a missing `ANTHROPIC_API_KEY` on Render silently flattens bucket order rather than erroring. Appointment task type dropped entirely per direct request ("more trouble than help, I never use it") — existing rows convert to `task_type=task` in the migration.

**TeaBox capacity sizing rewritten, then its own messaging removed (4.23.0–4.24.3, 2026-09-16–17).** 4.23.0 added dynamic capacity sizing to the box; 4.24.0 replaced the hardcoded 9-bag-per-tier guess with a `ResizeObserver` measuring the box's actual rendered width, so a tier fills genuinely edge-to-edge before splitting. Same release: kettle quick-add's title field now starts blank with a ghost placeholder instead of literal text to clear, dropped an unwanted auto-critical-flag on quick-added tasks, and inserts new tasks after the topmost routine instead of always jumping to the absolute front. Morning review gained a "Routines: X/Y done" line. PWA update-check staleness capped at ~20min (4.24.1). Then, per two follow-up requests, both pieces of capacity messaging on the box were removed — the over-capacity pill (4.24.2) and the "box full" self-care note (4.24.3) — along with the now-dead `capacitySlots`/`daySlots` prop chain (`TeaBox` → `Focus` → `App`). **The `(X/N)` slot chip still exists, but only on the Today page** — a separate surface from the tea box.

### Big shifts since BUILD 4.9.1

**Covers, wake screens and the boot waterfall — removed (4.15.0, 2026-09-09).** The Render Starter
trial is over and the answer is keep it: perceived load went 30–60s → 1–2s. With hibernation gone,
the cold-start UI was machinery guarding against a condition that no longer occurs, so it is
deleted rather than dormant. Gone: `WakeScreen.jsx`, `COVERS_ON`/`?covers=on`, `raiseCover`,
`COVER_SCREENS`, the nav-cover / label / return-from-sleep / reactive-wake effects, the
`DIARY_PROMPTS` + `getDiaryConfig` "while you wait" capture (dropped by explicit decision — there
is no wait to fill, and the daily log already captures it), and the orphaned `steam-wisp` CSS.
~600 lines.

**What deliberately survives: `warmUp` and `likelySleeping` in `client.js`.** They read as cover
machinery but are not — they drive the request retry at `client.js:149,458` and the offline-queue
flush at `:395-401,442`. Deleting them would regress the durable queue on a flaky mobile network,
which is a live condition regardless of hosting plan.

**The residual second was the app, not the server.** Measured 2026-09-09: `/health` TTFB 154ms, JS
bundle 121KB gzipped / 193ms off Vercel. Neither is a second. The cost was a boot waterfall —
`getMe()` gating `getTodayLog` + `getReviewPending` + `getTodayCapacity`, two serial round trips
before anything painted. All four now fire in parallel. `getMe` still orders the branching, but
each of the others carries its own `.catch` **at creation, not at the await**: the alpha-challenge
and onboarding paths return without awaiting them and an uncaught rejection would hit the console.
Safe to fire ahead of the onboarding check because all three are read-only GETs — `/capacity/today`
returns None rather than lazily writing a snapshot, and `/review/pending` only reads.

**PWA auto-update was broken on every deploy (fixed 4.15.0).** This is why the home-screen icon was
unusable. The SW ships `skipWaiting` + `clientsClaim` + `cleanupOutdatedCaches` — what
`registerType: 'autoUpdate'` generates. On deploy the new worker activates immediately, claims the
open page, and **deletes the old precache while that page is still running the old build off it**;
anything it requests afterwards 404s. `main.jsx` deferred the reload to the next
`visibilitychange`, but the cache deletion was never deferred — so a standalone PWA that had just
been opened sat in the broken window with no next foreground coming. It now reloads on
`controllerchange`, guarded by `hadController` (a first-ever install claims the page too, and
reloading on that is a pointless extra load) and a `reloading` flag.

**Behaviour change, accepted:** return-from-sleep no longer force-refetches. The reactive wake used
to bump `refreshKey` to remount and refetch; that went with the machinery. A tab left open for
hours shows cached data until you navigate.

**CSV export (4.13.0–4.13.1, 2026-08-17).** `GET /export/tasks.csv` — every task the user owns, one row each, 20 columns (id, title, type, status, priority, effort, critical, dates, routine title, tags, location, push_count, timestamps, notes — the `project` column was dropped in 4.16.1). Soft-deleted rows are excluded unless `?include_deleted=true`. Settings gained an **Export** section beside Import.

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

**Medication adherence feeds capacity (4.11.2; simplified 4.22.0).** Marking meds moves the executive-capacitor term (and so overall capacity / slot count) the way sleep and meals do. Originally adherence was distinct active schedules logged / active count; since 4.22.0's move to a single yes/no toggle, `_med_adherence` (`backend/routes/selfcare.py`) is just `1.0`/`0.0` off `SelfCareLog.medication_taken`, feeding the same `exec_cap *= (0.6 + 0.4 * med_adherence)` term — full adherence leaves executive as-is, "no" knocks 40% off, unlogged (`None`) is untouched. Logging a med recomputes today's snapshot immediately.

**Nudges dialed back (4.9.6, 4.9.9).** Three a day on a 2h cooldown had become wallpaper — swatted shut on sight. Now **one a day, 6h cooldown**. A dismissal is finally read back and mutes that variable for `DISMISSAL_BACKOFF_DAYS` (an affirmative answer doesn't — "on it" isn't a request for silence). Suppression widened from today to a per-variable window (`satisfied_recently`): sleep/meals/check-in reset daily, exercise looks back a day, since its target is 4 days a week. The weekly snapshot is also rebuilt whenever a log in the window is newer than it — it used to be written once and never again, making every later self-care entry invisible to the engine.

**Smaller UI (4.9.10, 4.9.11, 4.11.4, 4.11.5).** Tag edit/snooze moved to two corner buttons (the whole tag was one big edit target); completion celebration cut 7100ms → 5650ms; login now prefetches the heavy Focus images off-DOM while she types, matching the backend wake; self-care exercise question is Yes/No only (backend falls back to 30 min when `exercise_minutes` is null).

### Big shifts since BUILD 4.0.x

**Triage merged into Today (4.4.0, 2026-06-30).** The separate Tournament/Triage page is gone. Today is now the sole planning + execution surface: a **Today** section (status=today, sortable, complete/snooze/defer/delete) and an **Up Next** section (inbox, ordered by due_date → priority → created_at, `+` promotes). Slot count shown as `(X/N)` where N = capacity-driven `max_slots` from `/capacity/today`. Morning flow: self-care gate → Today (plan inline) → Start my day. Cleanup on 2026-07-10: the orphan frontend files (`pages/Tournament.jsx`, `api/triage.js`, `utils/triage.js`) and the entire `routes/triage.py` scoring/bin-pack backend + `test_triage.py` were removed. Its still-needed helpers were extracted to `backend/scoring.py` (`capacity_tier`, `max_slots_for`, `effort_points`). `project_stall_map` went there too and was deleted in 4.16.1 with the Projects removal — nothing ever read its output. The functionally-dead daily-caps sliders (`max_tasks_per_day`/`max_total_per_day`) were also removed from Settings + backend.

**Projects removed entirely (4.16.0–4.17.1, 2026-09-09–14).** Unused: projects are run from Claude + a calendar, and two systems tracking the same work is worse than one. The uncompleted project/training backlog was also the bulk of the ~20 items being snoozed one at a time every morning.

Shipped as **three separate pushes**, because Vercel and Render deploy independently off one push and `_migrate` runs inside `lifespan` — a bad DDL line crash-loops the backend rather than failing a test. 4.16.0 frontend only (revertable), 4.16.1 backend code with no DDL (revertable), 4.17.1 the migration alone against a backend already watched booting — numbered out of sequence because 4.17.0 (an unrelated morning-review fix) shipped first.

Before the migration, the training/project backlog was hand-reviewed and purged in the Supabase SQL editor (35 uncompleted rows hard-deleted 2026-09-14; completed rows of the same kind kept as the productivity record). Backups of `tasks`, `projects`, `weekly_snapshots`, and the task→project mapping are in `~/aria-backups/*-2026-09-14.csv`.

Gone: `Project` model + `Task.project_id` + the `project_name` property, `routes/projects.py` (8 endpoints incl. the Claude Haiku breakdown), all Project schemas, `pages/Projects.jsx`, `api/projects.js`, `ProjectBadge.jsx`, the AllTasks project picker, the Capture "Project" type, and `WeeklySnapshot.stalled_projects`. `components/CafeShelf.jsx` went too — already dead code, nothing had imported it.

`project_stall_map` was deleted from `scoring.py`: it ran one query per project on every weekly compute, serialized to a DB column, shipped over the API — and **nothing read it**. The docstring claiming insights.py boosted stalled-project nudges was stale; that boost died with `routes/triage.py` in 4.4.0. `scoring.py` itself survives (`capacity_tier`, `max_slots_for`, `effort_points` are live).

Two lines would have crash-looped prod and both were handled in the same commit as their DDL: `main.py`'s RLS loop listed `"projects"` (ENABLE on a dropped table raises inside `lifespan`, so uvicorn never serves), and the `ADD COLUMN project_id` statements run *earlier* in `_migrate` than any appended drop, so leaving them re-creates the column against a missing table on the next boot.

Also lost, deliberately: the sibling due-date cascade (moving a project sub-task's due date shifted later siblings). It had **no `owner_id` filter** — a latent cross-tenant bug that went with it. The CSV `project` column was removed from the header and the row *in the same edit*; the writer does not check row length, so a mismatch would silently shift every column right of index 11.

**Domains removed entirely (4.9.0, 2026-07-08).** The whole project/task time-of-day + date-rule scheduling constraint system was ripped out per user. Gone: `Domain` model, `domain_id` FKs (destructive migration — `DROP TABLE domains CASCADE` on Postgres, best-effort DROP COLUMN on SQLite), `routes/domains.py`, `domain_utils.py`, `next_allowed_date` due-date snapping, `in_context` field + its Focus/triage sorting, and all frontend domain UI (`DomainPicker`, `DomainDateWarning`, `utils/domain.js`, `api/domains.js`). Tasks now schedule purely on due_date + daily cap.

**Difficulty/weight system removed (2026-06-30)**, replaced with over-capacity signals.

**Start-my-day planning gate (4.8.0, 2026-07-07).** Once-per-day "commit your plan" ritual. Today opens in a **planning** state ("Plan your day" + fixed-bottom "Start my day ☕" button); pressing it flips to **started**. Soft gate — navigable, it's a self-signal not a lock. Backend: `User.planned_on` Date, `/me` exposes computed `day_planned`, `POST /tasks/plan-day` stamps it, resets at `day_start_hour` boundary. Tests: `test_plan_day.py`.

**Phase 6 PID nudge system (4.3.0, 2026-06-18).** PID control loop for behavior-change nudges: tracks sleep/meals/exercise/check-in against targets — P (gap), I (accumulated deficit, anti-windup), D (trend). Warm single-question micro-nudge after task completion; 2h cooldown, 3/day cap, weekday-only. `backend/pid_engine.py` (pure math), `routes/insights.py`, `WeeklySnapshot` + `NudgeLog` models, `NudgeModal.jsx` + `WeeklyInsightCard.jsx`. Lazy auto-compute — GET /weekly + /nudge create the snapshot if missing, no cron needed.

**Security hardening (4.6.0–4.6.3, 2026-07-06).** Privilege separation, auth rate limits, hashed session tokens, OAuth pending-state persisted in DB, `delete_user` Postgres crash fix (explicit owned-row purge), onboarding visibility. Earlier (4.0.1): RLS enabled on all tables in the Postgres branch of `_migrate`.

**Cold-start / sleep-wake loading covers (4.8.0–4.9.1) — REMOVED in 4.15.0; kept here as history.** Render free-tier cold starts and mid-session sleeps used to show loading→"…" skeleton jank. Now: pages (`Focus`, `Today`, `SelfCare`) dispatch `aria:page-loaded` when their primary fetch settles; App raises an opaque z-50 cover on nav + reactive wakes and lifts it only on `aria:page-loaded` (data renders underneath). Sleep-on-return funnels through a single `aria:server-waking` event (visibilitychange/focus + reactive on any request to a sleeping server). Completions/snoozes are queued to localStorage before the request, so the triggering action is never lost. 4.9.1 fixed the cold first-open specifically: removed a 2.5s `Promise.race` on `getTodayLog` that was losing the race on cold starts and skipping the self-care gate; killed the double-loader; added parallel login-screen warm-up. Correct morning flow now: (login → parallel wake) → single loading screen → self-care gate → Today → Start my day.

**Visual direction: Cafe + Linen themes only** (Americano/Berries/Chai removed 4.2.19). Cafe = warm amber, Lora serif, wood shadows, CafeShelf idle animations. Linen = soft plum/lavender paper, botanical header pill, pressed-flower SVG, paper-grain Focus card. Watercolor tea assets throughout. Tea-box metaphor on Focus (bags = tasks, ordered morning→evening — see `utils/ordering.js`, and 4.10.0 above for hand-ordering). Capture has a two-button submit (tea-cup = save+return, `+` = save+add-another).

---

## Backend file map

```
backend/
  main.py             app setup, CORS, router registration, _migrate() auto-migration
  database.py         SQLAlchemy engine + session
  models.py           all ORM models (incl. ORPHANED: MedicationSchedule/Log, GoogleCalendarToken)
  schemas.py          Pydantic schemas
  rate_limit.py       shared slowapi Limiter (keyed on client IP)
  pid_engine.py       pure PID math for nudges — UNUSED groundwork, no live UI reads it (see 4.16.1+ shifts)
  scoring.py          shared capacity_tier + max_slots_for + EFFORT_POINTS
  difficulty_engine.py  Haiku easy/hard task classification for tea-box bucket placement (added fb221f7)
  review_engine.py    morning-review greeting only — effort classification removed (4.20.0)
  routes/
    auth.py           login (rate-limited), session tokens (hashed), settings, invite codes
    tasks.py          CRUD + today/inbox/bonus/search/plan-day endpoints
    task_lifecycle.py lifecycle engine extracted from tasks.py (carry-forward, rollover, promote/demote)
    routines.py       routine CRUD + lazy daily instance generation (rollover-race guarded)
    selfcare.py       SelfCareLog + CapacitySnapshot + /capacity/today (user-tz dates)
    insights.py       Phase 6 groundwork — PID/weekly-snapshot compute endpoints; nothing in the UI calls them
    review.py         morning review — /review/pending + /review/commit
    import_csv.py     Notion CSV import
    export_csv.py     CSV export — GET /export/tasks.csv (+ types / since / until filters)
  tests/              146 pytest tests (conftest + 13 test files); CI on every push/PR
  requirements-dev.txt  pytest + httpx + tzdata
```

**Deleted from this map since 4.16.1:** `routes/medication.py` (4.22.0), `routes/gcal.py` (2026-09-15). Their test files (`test_medication.py`, `test_med_capacity.py`, `test_gcal.py`) and `test_promotion_gate.py` went with the features they tested.

Run tests: `cd backend && python -m pip install -r requirements-dev.txt && python -m pytest tests/ -v`
Test files: auth, box_order, export_csv, import_csv, insights, migrate, plan_day, review, routines, selfcare, tasks, tasks_lifecycle, today_merge.

## Frontend file map

```
frontend/src/
  App.jsx              routing, nav state, boot fetches, plan-day wiring
  api/client.js        singleton, warmUp(), likelySleeping(), offline queue, smart retry
  pages/
    Focus.jsx          home — pickNext(), bonus mode, watercolor dunk celebration, tap-bag-to-focus
    Today.jsx          Today / Up Next split, capacity slots, drag-reorder, planning gate
    MorningReview.jsx  first-sign-in review — greeting + add-what-you-did + durable commit (effort tags removed 4.20.0)
    Capture.jsx        type-aware (task/note/routine — appointment type dropped fb221f7), two-button submit
    Routines.jsx       CRUD, frequency/time-bucket/critical flags (bucket replaces time_of_day, fb221f7)
    SelfCare.jsx       foundation log + capacity bar
    EODGate.jsx        evening mood gate + per-task minutes capture + "Copy for boss" (4.18.0) + summary
    AllTasks / Inbox / Waiting / Search   list surfaces, batch ops
    Settings.jsx       integrations, CSV import + export, display/theme, manual EOD trigger
    Login / Signup / Register / AlphaChallenge / OnboardingWelcome   auth + onboarding
  components/
    TaskCard.jsx       inline edit, done/snooze; used across surfaces
    TeaBox.jsx         Focus tea-box bags — bucket-interleaved order, ResizeObserver real-width tier sizing (4.24.0), no capacity messaging (4.24.2/.3)
    EditTaskSheet.jsx  shared edit modal (Focus + others)
    CapacityBar.jsx    compact + full — still the only place the `(X/N)` slot chip renders (on SelfCare/Today, not the box)
    MinutesPrompt.jsx  work/not-work + minutes ask; used from Focus, Inbox, Today, and Waiting
    Card / Button / Input / Logo / ConfirmModal / HamburgerMenu / PageState / PageProgress / SnoozeSheet
  context/
    ThemeContext.jsx   two themes — Cafe (default) + Linen — reads aria_theme localStorage
  utils/
    ordering.js        today-order rule — shared by TeaBox + Focus; computed tiers vs. manual
    lastWorkCompletion.js  (added 4.18.0 alongside MinutesPrompt — check current call sites before relying on it)
    prefetch.js        theme-aware off-DOM image warm-up during login
    loadTimer.js       ms-since-navigation marks for the build chip (see 4.14.0)
    dnd.js             SmartPointerSensor (blocks drag on inputs/buttons); TeaBox now owns its own drag-containment modifier locally (looseInBox/loosePlay removed)
    taskColors.js      task-type/tag color mapping, used by TeaBox
    timing.js          shared timing helpers, used by App.jsx + loadTimer.js + ordering.js
    snooze.js          weekend-aware snooze date math
```

**Deleted from this map since 4.16.1:** `NudgeModal.jsx`, `WeeklyInsightCard.jsx` (Phase 6 nudge UI, gone 4.21.0 + 2026-09-16), `CafeShelf.jsx` (was already dead code), `medicationStore.js` + `api/medication.js` + `api/gcal.js`-equivalent (medication/gcal removal, 4.22.0 / 2026-09-15).

---

## Known issues / next

1. **~~Docs cleanup~~ — done 2026-08-20.** `PROJECT.md` was rewritten as a design-only doc (philosophy + design system); every operational section it duplicated from this file was deleted rather than refreshed, so there is now exactly one home for each fact. Don't re-add an architecture section there.
2. **Orphan score columns — code side cleared 2026-08-28 (4.14.0).** `Task.score`, `score_components`, `score_updated_at`, `pinned_for` no longer ship in `TaskResponse`, `_migrate` no longer `ADD COLUMN`s them (both branches), and the unreachable `ScoreChip`/`WhyTooltip` UI is out of `TaskCard.jsx` — it had defaulted `showScore`/`showWhy` to false with no caller ever setting them. What remains, deliberately: the four `models.py` declarations (so the ORM keeps matching prod, and `create_all` keeps building a matching fresh DB) plus the orphaned prod columns themselves, including the never-read `max_tasks_per_day`/`max_total_per_day`. Dropping indexed columns from a live single-user Postgres with no staging buys nothing; if you ever do it, do it as one deliberate migration alongside the retention sweep.
3. **Settings visual pass** — pending since May.
4. **Phase 6 nudge UI is gone, not just Week 2/3 unbuilt.** `NudgeModal.jsx` and `WeeklyInsightCard.jsx` were both deleted (4.21.0, 2026-09-16) after repeatedly reading as unwanted nagging. `pid_engine.py`/`WeeklySnapshot`/`compute_pid_state` survive as unused backend groundwork. Don't resume "Week 2/3 escalation" as if picking up where Week 1 left off — Week 1's own surface is gone, so this would be a fresh product decision, not a continuation.
5. **Render cold starts** — **resolved 2026-08-27** by the Starter plan; trial concluded 2026-09-09, keep Starter, and the wake *UI* was deleted in 4.15.0. The history below is kept because it applies again if the plan is ever reverted — in which case the covers would have to be rebuilt, deliberately. Note the free tier hibernates, and a wake goes through Render's build/deploy path — so a Render deploy incident takes the *live* app down, not just deploys. Seen 2026-08-20: every request returned `503` with `x-render-routing: hibernate-wake-error` during a platform-wide "Deployment Issues" incident, which presents in the UI as **"Failed to fetch" on login** (the `OPTIONS /login` preflight 503s, so the browser never gets CORS headers). Diagnose by reading that header — it distinguishes a Render fault from a Supabase or CORS fault. Paid tier removes hibernation and with it this whole failure mode.
6. **Cloudflare challenge on `api.adh-tea.fun`** — **closed 2026-08-28, won't fix.** The API host intermittently serves a managed-challenge interstitial ("Just a moment…") to non-browser clients, so `scripts/deploy-check.sh` and `scripts/aria-api.sh` fail every so often. Browser traffic passes transparently. The old advice here — "add a WAF bypass rule for `/health`" — is not actionable, because that Cloudflare is **Render's**, not ours:

    ```
    adh-tea.fun NS   → ns1-4.whois.com                    (registrar DNS, not Cloudflare)
    api.adh-tea.fun  → aria-jfdj.onrender.com
                     → gcp-us-west1-1.origin.onrender.com
                     → ...cdn.cloudflare.net              ← Render's, no dashboard of ours
    ```

    Render fronts every custom domain this way. There is no zone we control and no skip rule to add. The motivation is gone regardless: the rule only ever existed so an UptimeRobot keep-alive could pass, Starter needs no keep-alive, and Render already polls `/health` itself every ~5s (see the access-log filter in 4.13.2). If a script needs to be reliable, retry it.
7. **Naive-UTC vs. local-midnight boundaries** — `_day_start` (local midnight, for `scheduled_date`) and `_app_day_start_utc` (for `completed_at`) are easy to swap by accident; west of UTC the wrong one is off by 7–8h. This bit the review trigger in 4.11.6. Check which convention a column uses before comparing against it.
8. **No data retention — closed 2026-09-14, verdict: do not build.** `generate_routine_instances` still writes one Task per active routine per day forever (soft-deleted rows never reaped); `sync_today_events` is gone along with the rest of Google Calendar (2026-09-15). A real prod row count was taken against `docs/retention.md`'s own design gate: 807 total rows, and the bucket the design existed to sweep (`routine`/`deleted`) is only 50 of them — 6%, dominated instead by real completed-work history (`task,done` 452, `routine,done` 164). Not worth the engineering cost. Re-run the `GROUP BY` query in `docs/retention.md` if `routine,deleted` grows materially; otherwise leave this alone.
9. **Medication + Google Calendar orphaned models** — `MedicationSchedule`, `MedicationLog`, `GoogleCalendarToken` are ORPHANED (code deleted, prod columns/tables left in place), same pattern as the earlier score columns. A deliberate future DELETE (backup + preflight + human-reviewed SQL, Projects-Stage-3-style) is explicitly deferred — not to be done unilaterally.

Deferred indefinitely per user (2026-05-17). Do not start without explicit greenlight. Groundwork in place: `User.role` (primary/child) + `User.parent_id`, `Task.assigned_to_id`, invite-token flow in `auth.py`, `AlphaChallenge.jsx` + `OnboardingWelcome.jsx`. To build: child-task filtering, `POST /tasks/{id}/delegate`, simplified child home view, delegation UI on the user's cards.

## Further roadmap
- **Play Store** — PWA ready; wrap with Bubblewrap for Android TWA ($25). iOS via Capacitor ($99/yr).


## Render paid-tier trial — CONCLUDED 2026-09-09: keep Starter

Ran 2026-08-27 → 2026-09-09. Moved the backend web service from Free to
**Starter ($7/mo)** to remove hibernation.

**Verdict: the upgrade did what it was bought to do.** Perceived load on the
phone went from **30–60s** to **1–2s**. Everything under "should disappear"
disappeared: the 30–45s wait on first open of the day, the "Server napping"
message, and the "Failed to fetch" login failure caused by a hibernate-wake 503
on the `OPTIONS` preflight.

Measured at the close: `/health` 200, **TTFB 154ms**; JS bundle **121KB gzipped,
193ms** off Vercel. The 1–2s residual was the app's own boot waterfall, fixed in
4.15.0 — see "Covers, wake screens and the boot waterfall" above.

**Still true and still not a hosting fault.** A ~20s window of failed requests
after every push (auto-deploy restarts the service — the plan removes
hibernation, not restarts).

**The wake machinery is now deleted** (4.15.0), which supersedes the earlier
"do not delete during the trial" instruction. The `likelySleeping()` design flaw
that made the covers misfire — it measures *user* idle time, not server state —
went with them. `warmUp`/`likelySleeping` themselves survive in `client.js` for
request retry and queue flush; see the 4.15.0 note. If the plan is ever reverted
to Free, the cold-start UI has to be rebuilt from git history (`7901d87` era),
not un-commented.

To revert: Render dashboard → backend service → Settings → Instance Type → Free.
