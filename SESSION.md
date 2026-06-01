# Session bookmark
*Last wrap: 2026-06-01 — BUILD 4.0.65 + triage rework + animation rework (uncommitted)*

## State

Live build: **4.0.65** (latest commit on master). Current session has uncommitted changes: triage page rework, completion animation rework, triage navigation cleanup. Vercel + Render auto-deploy from `master`. CI passes; `npm run lint` clean; `npm run build` clean; `python -m pytest tests/ -v` 153 passed.


## What shipped since last SESSION.md update (4.0.61)

### BUILDs 4.0.62–4.0.65 (2026-05-25–26, committed)

- **4.0.62** — Auth/onboarding cafe pass: AuthPage, Login, Signup, AlphaChallenge, Register, OnboardingWelcome all retinted to Solarized cafe theme. App.jsx `!ready` splash gets three warm steam wisps. Backend fix: `get_bonus_tasks`, `inbox`, `update_task` switched from `date.today()` (server UTC) to `_app_today(current_user)` (user tz).
- **4.0.63** — Missed routines kept completable (carry_forward no longer soft-deletes); /routines/missed uses user tz; Routines page shows missed list with Done/Dismiss.
- **4.0.64** — Tap a tea-box bag to focus that task (overrides pickNext). Reverted 4.0.63's cross-day routine completion — routines are same-day only again. Selection self-heals on refetch.
- **4.0.65** — Triage scoring tuning: DUE_TODAY_BONUS 50→100, OVERDUE_CAP 40→80, new same_day_create lever (+300 when created_at date == due_date). +4 tests.

### Current session (2026-06-01, uncommitted)

**Triage page rework (Tournament.jsx full rewrite)**
- Old: fixed 3-slot top-3 picker + suggested list with + buttons + 7-day plan disclosure.
- New: full day-planning surface — add tasks → snooze unwanted → drag to reorder → Apply.
- Single auto-appearing NewTaskInput at top (type-ahead + create, one empty slot at a time).
- Every task row has drag handle + snooze button (opens SnoozeSheet). Score chip + WhyTooltip + MetaBadges preserved.
- Apply calls new `POST /triage/apply-ordered` — walks ordered list against capacity budget. If over capacity, OverflowBumper sheet appears: tap tasks to bump to tomorrow (ADHD-friendly single-pass, not head-to-head).
- Overflow resolution via `POST /triage/resolve-overflow` — bumped tasks get due_date=tomorrow, sort_order=0,1,2… (top of tomorrow), push_count incremented.
- 32-task cap. Recompute resets to score-based order.
- Deleted: SlotCard, CandidateRow, FullPlanView, PlanDay, PlanItem, CapacityBar, all slot/pin state, search bar.

**Backend: 2 new endpoints + 2 new schemas + 8 new tests**
- `POST /triage/apply-ordered` (TriageApplyRequest) — ordered task IDs → placed + overflow split by capacity budget.
- `POST /triage/resolve-overflow` (TriageOverflowRequest) — keep_today_ids forced onto today; bump_ids pushed to tomorrow with push_count+1.
- Frontend API wrappers: `applyOrderedTriage()`, `resolveOverflow()` in `api/triage.js`.
- 8 new tests in `test_triage.py`. Full suite: **153 passed**.

**Completion animation rework (Focus.jsx)**
- Dunk 15% faster: 5000ms → 4250ms.
- Pun text rises from cup simultaneously as bag descends (was: sequential rainbow slide → shrink → pun, ~9.5s total).
- Cup + pun fade out together (800ms). Total animation ~5.4s.
- Deleted: rainbow slide-in, rainbow shrink, sparkle phases (p1/p2/p3 celebrate states → dunk/fade).
- 10 new tea puns added (22 total).
- CSS: removed `celebrate-slide-in`, `celebrate-rainbow-shrink`, `celebrate-pun-in`, `teacup-exit` keyframes. Added `pun-rise-from-cup`, `cup-pun-fadeout`, `task-complete-out`.

**Today.jsx completion animation**
- Tasks now fade+slide out (350ms `task-complete-out` animation) instead of instant disappear.
- `completingId` state drives `.animate-task-complete` class on the completing card.

**Triage navigation cleanup**
- Today's "🍵 Triage" button goes directly to Tournament (removed ConfirmModal gate).
- Settings triage link also goes direct (removed ConfirmModal).
- App.jsx tracks `triageReturnTo` — morning check-in triage returns to Focus; Today-page triage returns to Today.

## Open / next session

1. **Test in browser** — verify triage flow end-to-end (add, snooze, reorder, apply, overflow), completion animations on Focus + Today.
2. **Commit + push** — all changes are uncommitted.
3. **Settings page visual pass** — functional but cluttered, needs cafe theme consistency.
4. **Logo/branding** — new adhTea logo still on the deferred cosmetic list.
5. **Tournament page score-chip UI** — not visually audited since cafe pass.

## Lingering style/correctness items NOT fixed
(carried from prior session)
- `auth.py:46` `_make_session` no commit — caller-commits pattern.
- `auth.py:72` token expiry `>` vs `>=` — 1-second edge case.
- `main.py:41` `is_owner` migration `MIN(id)` — one-time existing-DB.
- `tasks.py:194` snooze `<=` race — sub-second window.
- `domains.py:42` + `tasks.py:517` `== True/None` — `noqa`'d, SQLA translates to SQL `IS NULL`.
- `Today.jsx` optimistic update — `fetchTasks()` fallback more robust than explicit revert.
