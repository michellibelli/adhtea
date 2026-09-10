# Session bookmark
*Last wrap: 2026-09-09 — BUILD 4.16.1*

## START HERE TOMORROW

**`backend/main.py` and `backend/tests/test_migrate.py` are modified and UNCOMMITTED ON PURPOSE.**
That is Stage 3 — the irreversible Projects migration (`DROP COLUMN project_id`,
`DROP TABLE projects CASCADE`). It is written and its tests pass, but it MUST NOT ship until
items 1-3 below are done: it destroys the task-to-project mapping that the export records and
that the purge predicate needs. **Do not `git add -A` without reading this.**

Everything else is committed, pushed and live at 4.16.1. `master` is 0 ahead / 0 behind.

### Tomorrow's checklist, in order

1. **Get a fresh API token.** The stored one is expired (401 — sessions are day-scoped since
   4.9.8). On adh-tea.fun open DevTools console, run `localStorage.getItem('aria_token')`, paste
   the value (no quotes) into `C:\Users\Chris\.aria-token`. Verify with `bash scripts/aria-api.sh /me`.
   **Blocks 2, 3 and Stage 3.**

2. **Have the Supabase SQL editor ready.** The purge cannot go through the API —
   `DELETE /tasks/{id}` is a *soft* delete, and the decision was that uncompleted rows actually
   go. Hard DELETE needs the SQL editor. Take a backup there before running it.

3. **Review the training match list before deleting anything.** `title ILIKE '%training%'` is a
   fuzzy match against a live single-user prod DB with no staging, and it has not been run yet —
   nobody knows what it catches. Print both lists (the `status='done'` keep set and the delete
   set), eyeball them, THEN delete. Queries are in the plan file, Stage 0b.

Then, in order: Stage 0 CSV export → Stage 0b purge → Stage 3 migration (bump BUILD to 4.16.2,
push alone, watch Render boot logs). After that, Work item 2 — the morning review fix (4.17.0),
which needs no prod data and is the cleanest thing to pick up cold.

**Plan file with every file:line detail:**
`~/.claude/plans/i-think-in-this-glimmering-kettle.md`

---

## State

Live build: **4.16.1**. Vercel + Render auto-deploy from `master`. Backend suite **181 passed**;
`npm run build` clean; ESLint **13** problems (all pre-existing — hold this number, any increase is
a regression).

Backend on **Render Starter** since 2026-08-27 — no hibernation. Verified healthy this session:
`/health` 200 `{"status":"ok","version":"2.0.0"}`, TTFB 154ms, no `x-render-routing` header.

HANDOFF.md is the real source of truth for architecture — this file is just the bookmark.
**An approved multi-stage plan for the next work is in
`~/.claude/plans/i-think-in-this-glimmering-kettle.md`. Read it before starting.**

## Render Starter trial — load baseline (recorded 2026-09-09)

**Verdict: the plan did its job. Keep it.** Perceived load went from **30–60s** (free-tier
hibernation wake) to **1–2s**, reported from the phone. Trial question answered.

The residual 1–2s was **the app, not the server** — backend `/health` TTFB 154ms, JS bundle 121KB
gzipped / 193ms off Vercel. Neither is a second. The cost was the boot waterfall, now fixed (below).

Chip split for future readings: `ready` = bundle + the boot fetches; `+page` = the first page's own
fetch.

## What shipped this session (4.15.0 → 4.16.1)

Three deploys, all live and verified. 4.16.0 and 4.16.1 are covered under "Projects removed" below;
4.15.0 detail follows.

- **Boot fetches parallelised.** `getMe` used to gate `getTodayLog`/`getReviewPending`/
  `getTodayCapacity`, so every open paid two serial round trips before anything painted. All four
  now fire together; `getMe` still orders the branching, but the others are already in flight.
  Each promise carries its own `.catch` **at creation, not at the await** — the alpha-challenge and
  onboarding paths return without awaiting them, and an uncaught rejection would surface in the
  console. Safe to fire ahead of the onboarding check because all three are read-only GETs:
  `/capacity/today` returns None rather than lazily creating a snapshot, and `/review/pending` only
  reads (the commit lives in `POST /review/commit`).

- **PWA deploy breakage fixed** — this was the reason the home-screen icon was unusable. The SW is
  built with `skipWaiting` + `clientsClaim` + `cleanupOutdatedCaches` (what `registerType:
  'autoUpdate'` generates). On deploy the new worker activates instantly, claims the page, and
  **deletes the old precache while the page is still running the old build off it**; anything it
  then requests 404s. The old code deferred the reload to the next `visibilitychange` — but the
  cache deletion was never deferred, so a standalone PWA that had just been opened sat in that
  broken window with no next foreground coming. Now reloads on `controllerchange`, guarded by
  `hadController` (a first-ever install claims the page too — reloading on that is a pointless
  extra load) and a `reloading` flag against double-fire.

- **Loading covers, wake screens and the while-you-wait diary removed entirely** — ~600 deletions.
  The covers existed for hibernation that no longer happens; the diary was dropped by explicit
  decision (no wait to fill, and the daily log already captures it). Gone: `WakeScreen.jsx`,
  `COVERS_ON`, `raiseCover`, `COVER_SCREENS`, `DIARY_PROMPTS`/`getDiaryConfig`, all four cover
  effects, both diary textareas, the orphaned `steam-wisp` CSS.
  **`warmUp`/`likelySleeping` deliberately KEPT in `client.js`** — they drive request retry
  (`:149,458`) and the offline-queue flush (`:395-401,442`), not the cover UI. Removing them would
  regress the durable queue on a flaky mobile network.

## Behaviour change to know about

Return-from-sleep no longer force-refetches. The old reactive wake bumped `refreshKey` to remount
and refetch the current page; that went with the wake machinery. Harmless while the server doesn't
hibernate, but a tab left open for hours now shows cached data until you navigate.

## Open / next session

Working from the approved plan (`~/.claude/plans/i-think-in-this-glimmering-kettle.md`):

1. **Remove Projects — Stages 1 and 2 DONE and live; Stage 3 remains.** 4.16.0 removed the
   frontend, 4.16.1 the backend code with no DDL. Backend boot confirmed after 4.16.1
   (`/projects` → 404, `/health` → 200), which proves the two prod-fatal lines were handled: the
   RLS loop no longer lists `"projects"` (ENABLE on a dropped table raises inside `lifespan` and
   crash-loops uvicorn) and the `ADD COLUMN project_id` statements are gone (they run *earlier* in
   `_migrate` than any drop, so they would re-create the column against a missing table).
   **What is left:** Stage 0 CSV export, Stage 0b purge (completed rows kept as data, uncompleted
   hard-deleted after a human look at the match list), then Stage 3 — the uncommitted migration
   described at the top of this file.
2. **Fix the morning review** (4.17.0) — add "not done" to the commit contract and an X control per
   row. Note the query is NOT the bug: `review.py:49-61` already filters strictly on
   `completed_at IS NOT NULL`. Wrong rows get there via an unguarded `complete_task` re-stamping on
   offline-queue replay, and un-completes that never clear `completed_at`.
3. **Re-measure the snooze pile after Projects is gone** — the read is that project/training tasks
   were most of it. If it's still long, the mechanic is `carry_forward` returning tasks to inbox
   without clearing `due_date` plus `promote_due_tasks` having **no `ORDER BY` at all**.
4. **Retention Tier 1** — `docs/retention.md`. Gets materially simpler once projects are gone (the
   `project_stall_map` trap it warns about ceases to exist). Needs a real prod row count first.
5. Parked by explicit decision: Settings visual pass, logo/branding.

## Lingering style/correctness items NOT fixed
(carried from prior sessions)
- `auth.py:46` `_make_session` no commit — caller-commits pattern.
- `auth.py:72` token expiry `>` vs `>=` — 1-second edge case.
- `main.py:41` `is_owner` migration `MIN(id)` — one-time existing-DB.
- `task_lifecycle.py:300` `resolve_snoozes` `<=` race — sub-second window. (Was cited as
  `tasks.py:194` in older notes; that reference is stale since the 4.6.4 lifecycle extraction.)
- `tasks.py:517` `== True/None` — `noqa`'d, SQLA translates to SQL `IS NULL`.
- `client.js` empty `catch (_) {}` blocks — eslint `no-empty`; CI runs pytest only.
- `tasks.py:549-570` sibling due-date cascade has **no `owner_id` filter** — latent cross-tenant
  bug, dies with the Projects removal.
