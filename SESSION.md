# Session bookmark
*Last wrap: 2026-09-09 — BUILD 4.15.0*

## State

Live build: **4.15.0**. Vercel + Render auto-deploy from `master`. Backend suite 188 passed;
`npm run build` clean; ESLint 14 problems (all pre-existing — hold this number, any increase is a
regression).

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

## What shipped this session (4.15.0)

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

1. **Remove Projects, code and schema** — decided, full destructive removal. **Three separate
   pushes**, not one: frontend (4.16.0) → backend without DDL (4.16.1) → the migration alone
   (4.16.2). Two lines will crash-loop prod if missed: `main.py:207` still lists `"projects"` in
   the RLS loop, and `main.py:150` re-adds `project_id` on the next boot. Stage 0 runs prod counts
   and a CSV export first; Stage 0b retires the project/training backlog — **completed rows kept as
   data, uncompleted rows hard-deleted after a human look at the match list.**
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
