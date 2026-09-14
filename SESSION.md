# Session bookmark
*Last wrap: 2026-09-09 — BUILD 4.16.1*
*Touched 2026-09-10: token refreshed; Stage 0 corrected; 4.17.0 written, unshipped.*

## START HERE TOMORROW

**THERE ARE NOW TWO SEPARATE UNCOMMITTED WORKSTREAMS IN THE TREE. NEVER `git add -A`.**
Live build is still **4.16.1**; `master` is 0 ahead / 0 behind. `BUILD` on disk says 4.17.0.

**(a) Stage 3 — MUST NOT SHIP YET.** `backend/main.py`, `backend/tests/test_migrate.py`.
The irreversible Projects migration (`DROP COLUMN project_id`, `DROP TABLE projects CASCADE`).
Written, tests pass, but it destroys the task-to-project mapping that item 4 captures and that the
purge predicate needs. Blocked on prod checklist items 2-4 below.

**(b) 4.17.0 morning-review fix — READY, pending validation.** `BUILD`, `backend/schemas.py`,
`backend/routes/review.py`, `backend/routes/tasks.py`, `backend/tests/test_review.py`,
`backend/tests/test_tasks.py`, `frontend/src/pages/MorningReview.jsx`.
Additive, no DDL, independent of Stage 3. Ship it by explicit path:

```
git add BUILD SESSION.md \
        backend/schemas.py backend/routes/review.py backend/routes/tasks.py \
        backend/tests/test_review.py backend/tests/test_tasks.py \
        frontend/src/pages/MorningReview.jsx
```

Validation checklist for (b) is in its own section below.

### Tomorrow's checklist, in order

1. ~~**Get a fresh API token.**~~ **DONE 2026-09-10** — `~/.aria-token` refreshed, `/me` returns
   the user (id 2, owner). Sessions are day-scoped since 4.9.8, so this token dies at 4am
   America/Los_Angeles and the next session needs a new one: on adh-tea.fun open DevTools console,
   run `localStorage.getItem('aria_token')`, paste the value (no quotes) into
   `C:\Users\Chris\.aria-token`, verify with `bash scripts/aria-api.sh /me`.

2. **Have the Supabase SQL editor ready.** The purge cannot go through the API —
   `DELETE /tasks/{id}` is a *soft* delete, and the decision was that uncompleted rows actually
   go. Hard DELETE needs the SQL editor. Take a backup there before running it.

3. **Review the training match list before deleting anything.** `title ILIKE '%training%'` is a
   fuzzy match against a live single-user prod DB with no staging, and it has not been run yet —
   nobody knows what it catches. Print both lists (the `status='done'` keep set and the delete
   set), eyeball them, THEN delete. Queries are in the plan file, Stage 0b.

4. **Capture task→project membership by SQL, NOT by CSV export.** The plan's Stage 0 said to
   download `/export/tasks.csv` "while column 11 still exists" — **that instruction is dead.**
   Stages 1 and 2 shipped ahead of Stage 0, and 4.16.1 (`9d8ee89`) stripped `"project"` from the
   export header along with `task.project.title` and `joinedload(Task.project)`. Verified live
   2026-09-10: no project column in the CSV. The data is still in the DB (no DDL yet), so run this
   in the Supabase editor and download the result before Stage 3:

   ```sql
   SELECT t.id, t.title, t.status, t.completed_at, p.id AS project_id, p.title AS project_title
     FROM tasks t JOIN projects p ON p.id = t.project_id
    ORDER BY p.id, t.id;
   ```

   A general task backup was pulled anyway: `~/aria-backups/tasks-2026-09-10.csv`, 766 rows.
   The export filters by type and date window (4.13.1) — confirm that window covers everything
   before relying on it.

Then, in order: Stage 0b purge → Stage 3 migration (bump BUILD to 4.16.2, push alone, watch Render
boot logs). After that, Work item 2 — the morning review fix (4.17.0), which needs no prod data and
is the cleanest thing to pick up cold.

### 4.17.0 validation — do these before shipping (b)

Backend suite **195 passed** (181 + 14 new), `npm run build` clean, ESLint **13** (baseline held).
The three source files were reverted and re-run to confirm the new tests are not vacuous: 9 of them
fail against the old code. What automated checks cannot cover is below.

1. **Manual: the MorningReview JSX.** The only part with no test coverage. Local sqlite `aria.db`
   is empty (0 users, 0 tasks) and is a clean sandbox — the backend falls back to it whenever
   `DATABASE_URL` is unset, and CORS already defaults to `localhost:5173`, so no `backend/.env` is
   needed. Two terminals:

   ```
   cd ~/aria-work/backend && uvicorn main:app --reload --port 8000
   cd ~/aria-work/frontend && npm run dev
   ```

   **Point the dev server at local first.** `frontend/.env.development.local` reads
   `VITE_API_URL=/api`, and `vite.config.js:66` proxies `/api` to **`https://api.adh-tea.fun`** —
   i.e. prod. Set `VITE_API_URL=http://localhost:8000` for the test, **and put it back afterwards.**

   Needs a seeded user plus a mis-completed task backdated two days. Confirm on screen:
   - `×` dims the row, strikes the title, swaps the effort toggle for "Not done"
   - `↺` restores it (mis-tap is recoverable)
   - Continue saves; the task returns to Inbox with `push_count` unchanged
   - it is absent from the next `/review/pending`
   - no `EffortExample` row was written for it

2. **Deploy ordering — the one real hazard.** Vercel and Render both auto-deploy from the same
   `master` push, but Vercel builds in ~1 min and Render takes several. In that gap the new
   frontend is live against the 4.16.1 backend, which **422s on `done: false`** — and
   `api/review.js:18` treats a permanent 4xx as undroppable, so the whole morning commit is
   discarded silently, `reviewed_through` included. Narrow window, single user, free to avoid:
   push, then do not open the app until `bash scripts/deploy-check.sh` shows the backend healthy.

3. **Post-deploy.** `bash scripts/deploy-check.sh`, then read the **Render boot logs** — `_migrate`
   failures surface there and nowhere else. Then the optional one-time hygiene for stamps left
   stale by the pre-4.17.0 code:

   ```sql
   UPDATE tasks SET completed_at = NULL WHERE status <> 'done' AND completed_at IS NOT NULL;
   ```

**Note on scope, recorded so it is not re-litigated:** the blind-`setattr` clearing of
`completed_at` in `PATCH`/`defer`/`unsnooze` is **data hygiene, not a review-visibility fix**.
`review.py:49-61` filters on `status == done` *as well as* `completed_at`, so a patched-to-inbox
task was already excluded from the review. The actual review bug is the offline-replay re-stamp,
fixed by the `complete_task` idempotency guard and pinned by
`test_replayed_completion_keeps_the_original_day`.

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
   **What is left:** the task→project mapping capture (by SQL — see checklist item 4; the CSV
   export no longer carries the project column), Stage 0b purge (completed rows kept as data,
   uncompleted hard-deleted after a human look at the match list), then Stage 3 — the uncommitted
   migration described at the top of this file.
2. ~~**Fix the morning review** (4.17.0)~~ — **WRITTEN 2026-09-10, NOT SHIPPED.** `done` flag on
   the commit contract, un-complete folded into `/review/commit`, `complete_task` made idempotent,
   `×`/`↺` toggle per row. Uncommitted workstream (b) at the top of this file; validation checklist
   above. The query was never the bug — the re-stamp on offline-queue replay was.
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
