# Session bookmark
*Last wrap: 2026-06-01 — BUILD 4.0.72*

## State

Live build: **4.0.72** (latest commit on master). Vercel + Render auto-deploy from `master`. CI passes; `npm run build` clean; `python -m pytest tests/ -v` 153 passed.


## What shipped this session (4.0.66–4.0.72)

### BUILDs 4.0.66–4.0.72 (2026-06-01)

- **4.0.66** — Triage page rewrite + completion animation rework. Old 3-slot top-3 picker → full day-planning surface. New endpoints: `POST /triage/apply-ordered`, `POST /triage/resolve-overflow`. Completion animation: dunk+pun ~5.4s (was ~9.5s). Today.jsx 350ms fade-out. Triage nav simplified with `triageReturnTo`.
- **4.0.67** — Fix drag: spread `{...listeners}` on whole sortable row (was tiny ⋮⋮ handle only).
- **4.0.68** — Replace snooze button with ⋮ action dropdown: Tomorrow (+1d), Next week (+7d), Next month (+30d), Edit. EditTaskSheet extracted to shared `components/EditTaskSheet.jsx` (used by Focus + Tournament). SnoozeSheet removed from triage.
- **4.0.69** — Today page split into Today (max 15) + Up Next sections with horizontal divider. Up Next shows inbox tasks with + button to promote via `scheduleToday`. Snooze from Up Next refetches inbox.
- **4.0.70** — Triage page mirrors Today layout: Today section (max 15, sortable) + Up Next divider + remaining scored tasks (fills to 20 total).
- **4.0.71** — Triage Today/Up Next split by `status=today` or `due_date=today` (was score position). Promoting sets `due_date` to today via `updateTask`.
- **4.0.72** — ActionMenu rendered via `createPortal` to escape `pixel-card` `overflow:hidden` clipping. Positioned via `getBoundingClientRect` on trigger button.

### BUILDs 4.0.62–4.0.65 (2026-05-25–26, prior session)

- **4.0.62** — Auth/onboarding cafe pass. Backend: bonus/inbox/update_task switched to user-tz dates.
- **4.0.63** — Missed routines kept completable; /routines/missed user-tz fix.
- **4.0.64** — Tap tea-box bag to focus that task. Reverted cross-day routine completion.
- **4.0.65** — Triage scoring tuning: DUE_TODAY_BONUS 100, OVERDUE_CAP 80, same_day_create lever (+300).

## Architecture changes this session

- **EditTaskSheet** — extracted from Focus.jsx to `components/EditTaskSheet.jsx`. Shared by Focus + Tournament.
- **Today page** — fetches both `getToday()` + `getInbox()`. Two sections: Today (max 15, sortable) / Up Next (inbox, fills to 20). Promote via `scheduleToday` API.
- **Triage page** — fetches `previewTriage()`, splits by status (today vs inbox). Today section (max 15, sortable, Apply sends these). Up Next section (remaining scored tasks). Promote sets due_date via `updateTask`. ActionMenu portaled to body.
- **Constants**: `MAX_TODAY=15`, `MAX_TOTAL=20` in both Today.jsx and Tournament.jsx.

## Open / next session

1. **Settings page visual pass** — functional but cluttered, needs cafe theme consistency.
2. **Logo/branding** — new adhTea logo still on the deferred cosmetic list.
3. **datetime.utcnow() deprecation** — 112 warnings in test suite. Replace with `datetime.now(UTC)`.
4. **SQLAlchemy Query.get() legacy warning** — switch to `Session.get()`.

## Lingering style/correctness items NOT fixed
(carried from prior session)
- `auth.py:46` `_make_session` no commit — caller-commits pattern.
- `auth.py:72` token expiry `>` vs `>=` — 1-second edge case.
- `main.py:41` `is_owner` migration `MIN(id)` — one-time existing-DB.
- `tasks.py:194` snooze `<=` race — sub-second window.
- `domains.py:42` + `tasks.py:517` `== True/None` — `noqa`'d, SQLA translates to SQL `IS NULL`.
