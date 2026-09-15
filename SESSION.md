# Session bookmark
*Last wrap: 2026-09-16 — live BUILD 4.22.0, working tree has uncommitted 4.23.0*

## START HERE

**Live/shipped:** 4.22.0 (medication overhaul), pushed to master, deployed, verified.

**Uncommitted in the working tree:** 4.23.0 — TeaBox dynamic capacity sizing. `BUILD` on disk
already says `4.23.0` but nothing has been committed or pushed. Backend tests pass (176), frontend
lints/builds clean, but **do not ship yet** — see "4.23.0 detail" below for what's unverified.
**Never `git add -A`** — review the diff file-by-file before staging.

**Two things need attention before/alongside shipping 4.23.0:**
1. User reported after a hard refresh on prod: *"there was still a nudge."* Not root-caused. See
   "Known bug" below — two live hypotheses, needs investigation first.
2. Cross-tier TeaBox drag (dragging a bag between the two stacked box tiers) was never conclusively
   verified — automated browser testing hit a wall of tooling flakiness this session. Needs a real
   manual check before shipping 4.23.0.

## What shipped this session (build order, each individually verified + deployed except 4.23.0)

- **4.17.1** — Projects removal Stage 3 (the destructive migration: `DROP TABLE projects CASCADE`,
  `DROP COLUMN tasks.project_id`). Completed the multi-stage Projects removal begun in 4.16.x.
- **4.18.0** — Time tracking. `Task.minutes_spent`; a minutes-prompt modal (`MinutesPrompt.jsx`,
  new) fires right after completion on every completion surface (Focus, Today's today-list, Today's
  Up-Next gate, Inbox, Waiting) — default value is elapsed time since the last completion
  (`utils/lastWorkCompletion.js`, new, localStorage-backed). `Task.completed_retroactively` flag
  added: tasks completed via the forced morning inbox-sort gate (backlog catch-up, not real-time
  work) still stamp `completed_at` for streaks/capacity but are excluded from the end-of-day work
  log. `EODGate.jsx`'s log screen rebuilt from a flat list into a two-column dnd-kit drag UI.
  Kettle/moon icons added to the title pill.
- **4.19.0 / 4.19.1** — `is_work` redesign. New tasks default `is_work=true` at creation (no
  ask-popup — that approach was tried and reverted per feedback). A cup icon on `TaskCard` and the
  Focus tag toggles it — filled = work, outline = not-work. Every read site standardized on
  `is_work !== false` (so `null`, e.g. pre-4.19.0 legacy tasks, reads as work, not as
  fail-closed/not-work).
- **4.20.0** — Morning Review's small/big effort gate removed entirely (superseded by
  time-at-completion from 4.18.0). `review_engine.py` rewritten to a greeting-only generator —
  Haiku classification, the heuristic fallback, and `EffortExample` learning are gone.
- **4.21.0** — Nudge-popup system removed entirely per explicit request ("I hate the little urge for
  exercise or whatever, no more urge kill the code"). Gone: `NudgeModal.jsx`, the `GET/POST` nudge
  routes in `insights.py`, `satisfied_recently`/`RECENCY_DAYS` in `pid_engine.py`.
  **Deliberately kept:** `WeeklyInsightCard.jsx` and `pid_engine.py`'s `rank_nudges` — they still
  back the weekly self-care insight text, which was judged to be a different feature. **This
  distinction may not hold up** — see Known bug below, this is the prime suspect for it.
- **4.22.0** — Medication overhaul, to solve a privacy requirement ("app stores no medication data
  anywhere"). `MedicationSchedule`/`MedicationLog` models and their route/schema/frontend code are
  all gone (ORPHANED in `models.py`, not dropped — matches the app's established pattern for live
  single-user prod with no staging). Replaced with one yes/no question
  (`SelfCareLog.medication_taken`) gated by `User.medication_question_enabled` (Settings toggle,
  default on). **Still deferred, explicitly not done:** a real permanent DELETE of the orphaned
  `medication_schedules`/`medication_logs` prod rows — do this as its own guided,
  backup-first, SQL-reviewed step later, the same way the Projects purge was done. Not unilateral.
- **4.23.0 (uncommitted)** — TeaBox dynamic capacity sizing. Detail below.

## 4.23.0 detail — TeaBox dynamic capacity sizing (uncommitted)

**The ask, in the user's words:** *"I want to be able to have all the tasks I set up for the day and
routines visible in the box so I can manipulate them"* — nothing should ever be hidden from
drag-and-drop reach, and the box should visually reflect the day's actual capacity.

**Backend** (tested — 176 passed):
- `User.day_capacity_slots` (Integer, nullable) — snapshotted at "Start my day" from
  `max_slots_for(CapacitySnapshot.overall)`. Migration added to both SQLite/Postgres branches of
  `_migrate()` in `main.py`.
- `POST /tasks/plan-day` now **409s** ("Log today's self-care check-in before starting the day.")
  if no `CapacitySnapshot` exists for today; otherwise snapshots `day_capacity_slots` before
  committing.
- `/me` exposes `day_capacity_slots` (null unless `day_planned` is true).
- `backend/tests/test_plan_day.py` and `test_promotion_gate.py` updated to seed a
  `CapacitySnapshot` before calling `plan-day`, since every call is now gated on one existing.

**Frontend:**
- `Today.jsx`'s `handleStartDay`: if there's no capacity snapshot yet (checks the already-fetched
  `capacity` state, with a 409-catch as a fallback), it redirects to the self-care log screen
  instead of firing a doomed request. Button label becomes "Log self-care to start my day."
- `TeaBox.jsx` — rewritten twice this session chasing live feedback:
  - **v1 (rejected):** capacity-driven single row, horizontal scroll for overflow, tap-to-zoom
    above 6 bags. User's verdict: *"scrolling doesnt fit that vibe... scroll hold tap drag scroll
    sounds error prone and tedious."*
  - **v2 (current):** no scrolling, no zoom overlay. Bags wrap into stacked **box tiers**
    (`BoxTier`, `ROW_CAPACITY = 9` bags/tier) — when a day's bags don't fit one row, a second
    complete wood-panel box literally stacks below the first. User's own framing: *"there's just a
    second box."* Drag uses one shared `SortableContext` (`rectSortingStrategy`) spanning every
    tier, so a bag can in principle be dragged across tiers, not just within one — see
    "unverified" below. The old single-row containment modifiers (`looseInBox`, `loosePlay`) were
    deleted from `utils/dnd.js`; TeaBox now owns its own `looseInStack` modifier locally (clamps to
    the whole multi-tier stack's measured rect, not one row).
  - **Empty-slot dashed outlines** (showing unfilled capacity) were built, then removed per direct
    feedback: *"no empty slot outlines, dead code, i dont want to see it."* `EmptySlot` component
    and the `emptyCount` computation are gone — the box now only ever shows real bags (tasks,
    routines, bonus), never placeholders.
  - **Drawers** (Routines/Log shortcuts under the box) are hidden by default —
    `showDrawers` prop defaults `false`, JSX kept intact (not deleted) for a possible future
    return. The box no longer reserves that vertical space; kettle/cup flanking art now
    bottom-align to the lowest box tier automatically — a free side effect of the flex `items-end`
    container losing its tallest child, no extra code needed.
  - Routines stay additive: pulled out of the interleaved order and appended after the
    capacity-sized task section (not counted against `day_capacity_slots`), per *"if the system
    thinks I can only do 4 tasks, the box should be 4+routines."*
  - Over-capacity note banner (`"N over today's N-task plan"`) unchanged from v1.

**Verification status — read before shipping:**
- Backend: 176 pytest passing.
- Frontend: eslint clean, `npm run build` clean.
- Browser-verified live (local dev, real signup, real local backend): stacked tiers render
  correctly at varying task counts, over-capacity note correct, routines additive and correctly
  positioned, no drawers, kettle/cup alignment correct. **Same-tier drag-reorder confirmed working**
  (task swap persisted via `sort_order`, checked against the API).
- **NOT verified: cross-tier drag** (dragging a bag from the bottom box tier up into the top one).
  Extensive automated testing was attempted and inconclusive — a failed `zoom` screenshot call
  corrupted the browser tab's actual viewport to 355×159px while screenshots kept rendering at
  1568×744 (a stale/mismatched frame), which explains a long chain of failed coordinate-based
  clicks and drags that had nothing to do with the app code. Recovered by closing and reopening the
  tab. Subsequent testing used synthetic `PointerEvent` dispatch to bypass the coordinate mismatch
  entirely: one same-tier attempt succeeded, but repeat attempts (both same-tier and cross-tier)
  then failed in ways that didn't track with anything code-related (a full page reload didn't reset
  it), so the test harness's signal was no longer trustworthy either way. **Needs a real manual
  check:** open Focus with enough tasks to force two box tiers, try dragging a bag from the bottom
  tier to the top. The code path is architecturally identical to the previously-working single-row
  version (same sensors, same `handleDragEnd`/`onReorder` wiring) — only the `SortableContext`
  strategy changed to `rectSortingStrategy` to support a 2D layout, which is dnd-kit's documented
  approach for exactly this case. No known reason it shouldn't work, but it is unconfirmed.

## Known bug — reported by user, not yet root-caused

User did a hard refresh on prod (adh-tea.fun) and reported: *"i just did a hard refresh and there
was still a nudge."* Frontend nudge code is confirmed **fully deleted** —
`grep -ri nudge frontend/src` returns nothing. Two live hypotheses, neither confirmed:

1. **`WeeklyInsightCard` is the actual culprit.** It renders self-care insight text like *"Movement
   dropped to 0 days — a short walk tomorrow? 🧡"* (seen repeatedly during this session's testing) —
   phrasing that closely echoes the user's original complaint about "the little urge for exercise."
   This card was deliberately kept in 4.21.0 on the theory that it's a distinct "weekly insight,"
   not a "nudge popup" — but from the user's side it may read as exactly the same thing she asked
   to have killed. **Needs her confirmation: is this what she means?** If so, `WeeklyInsightCard.jsx`
   (and possibly `generate_weekly_insight` in `pid_engine.py`, which it's the last caller of) needs
   to go too, or at minimum lose the nudge-like phrasing.
2. **Stale PWA cache.** `vite-plugin-pwa` registers a service worker (`registerType: 'autoUpdate'`,
   `skipWaiting` + `clientsClaim`). A hard refresh (Ctrl+Shift+R) bypasses the HTTP cache but not
   necessarily an already-controlling service worker's own cache — the SW may keep serving an old
   precached bundle until `controllerchange` fires and `main.jsx`'s reload-on-update logic runs.
   Worth ruling out by checking the deployed SW version / forcing an update cycle.

Start with (1) — it's the more specific, more likely explanation given the exact phrasing match.

## Environment note for next session

`frontend/.env.development.local` should read `VITE_API_URL=/api` (proxies to prod, per
`vite.config.js`) — that's the working convention. It was repeatedly changed to
`http://localhost:8000` this session for local testing against the unshipped 4.23.0 backend changes,
and restored each time — but **confirm it still reads `/api` before assuming local dev talks to
prod**, since a local backend won't have the 4.23.0 migration applied. Two throwaway local-only test
users exist in the local `aria.db` from this session's browser testing: `teaboxtest` / `teaboxtest2`,
password `testpass123` — harmless, local-only, safe to ignore or wipe.

## Open / next session TODOs, roughly in priority order

1. **Root-cause and fix the "still a nudge after hard refresh" report** — a direct, recent user
   complaint; start with the `WeeklyInsightCard` hypothesis above.
2. **Get a real manual confirmation of cross-tier TeaBox drag**, then commit and ship 4.23.0. Don't
   ship with the app's core "always reachable, always draggable" requirement unverified.
3. **Routine time-bucket redesign** — next queued feature, fully scoped across two rounds of
   clarifying questions, zero implementation started. Replaces routine `due_time` entirely with 4
   coarse buckets: First → Morning → Mid Day → Afternoon. 1-2 "hard" tasks interleave between
   buckets; a new Haiku call classifies task easy/hard for placement purposes only (explicitly
   separate from the removed effort/billing classifier). User's own framing: *"First is always at
   the top of the list, then there should be some easy tasks, then morning, then 1 or 2 hard tasks,
   then mid day, then 1 or 2 hard tasks then afternoon, then whatever is left."* Same-bucket
   ordering fallback (now that `due_time` is gone) not yet explicitly confirmed with the user —
   likely creation-order + manual drag, matching the app's established pattern, but say so and
   confirm rather than assuming.
4. Eventually, separate deliberate step: real permanent DELETE of the orphaned
   `medication_schedules`/`medication_logs` prod rows (Projects-Stage-3-style: backup, preflight,
   human-reviewed SQL). Explicitly deferred from 4.22.0, not to be done unilaterally.
5. **HANDOFF.md is now significantly stale** — still describes `NudgeModal.jsx`, `medication.py`,
   and effort-based Morning Review as current/live, none of which is true after 4.20.0–4.22.0. This
   session only kept this bookmark file current; HANDOFF.md needs its own refresh pass. Corrections
   for whoever does it:
   - `NudgeModal.jsx` — deleted (4.21.0)
   - `medication.py` / `medicationStore.js` / `api/medication.js` — deleted (4.22.0);
     `MedicationSchedule`/`MedicationLog` models ORPHANED, not dropped
   - `review_engine.py` — effort classification removed, greeting-only now
   - `TeaBox.jsx` — rewritten for capacity-driven sizing + stacked box tiers (4.23.0); no longer
     sorted by due/due_time alone — routines are now additive after the capacity section
   - `utils/dnd.js` — `looseInBox`/`loosePlay` removed; `TeaBox.jsx` owns its own drag-containment
     modifier locally now
   - New files not in the old map: `utils/lastWorkCompletion.js`, `components/MinutesPrompt.jsx`
     (both 4.18.0)

## Lingering style/correctness items NOT fixed
(carried forward from prior sessions — still true, still low priority)
- `auth.py:46` `_make_session` no commit — caller-commits pattern.
- `auth.py:72` token expiry `>` vs `>=` — 1-second edge case.
- `main.py:41` `is_owner` migration `MIN(id)` — one-time existing-DB.
- `task_lifecycle.py:300` `resolve_snoozes` `<=` race — sub-second window.
- `tasks.py:517` `== True/None` — `noqa`'d, SQLA translates to SQL `IS NULL`.
- `client.js` empty `catch (_) {}` blocks — eslint `no-empty`; CI runs pytest only.

## Deployment facts (not re-verified this session — check before relying on them)
Backend on Render Starter ($7/mo, no hibernation) since 2026-08-27. Vercel (frontend) + Render
(backend) auto-deploy independently from `master` — Vercel finishes in ~1 min, Render takes several
minutes longer, so a push that changes both frontend and backend contracts should be split or the
frontend held back until `bash scripts/deploy-check.sh` shows the backend healthy. See HANDOFF.md
for the full RELEASE GOTCHA writeup (BUILD file bump requirement, etc).
