# Session bookmark
*Last wrap: 2026-08-17 — BUILD 4.13.0*

## State

Live build: **4.13.0** (latest commit on master). Vercel + Render auto-deploy from `master`. Backend suite 181 passed; `npm run build` clean.

HANDOFF.md is the real source of truth for architecture — this file is just the bookmark.

## What shipped this session

- **4.13.0 — CSV export.** `GET /export/tasks.csv` (`backend/routes/export_csv.py`): every owned task, one row, 21 columns, project/routine as titles. Deleted rows excluded unless `?include_deleted=true`. Timestamps converted to user tz; `due_date`/`scheduled_date` written verbatim (local-midnight convention). UTF-8 BOM + CRLF for Excel; column names match the importer's vocabulary so an export round-trips through `/import/csv`. Frontend: `api.download()` in `client.js` (bearer token can't ride on `<a href>`, so blob + synthetic link) and an Export card in Settings. Tests: `test_export_csv.py` (10).

## Open / next session

1. **Settings page visual pass** — functional but cluttered, needs cafe theme consistency. Pending since May.
2. **Docs cleanup** — `PROJECT.md` still stale at 4.0.0.
3. **datetime.utcnow() deprecation** — 12 call sites across 8 backend files. Replace with `datetime.now(UTC)`.
4. **SQLAlchemy Query.get() legacy warning** — switch to `Session.get()`.
5. **Orphan score columns** — `Task.score`, `score_components`, `score_updated_at`, `pinned_for`, `max_tasks_per_day`, `max_total_per_day`. Nothing writes them; drop in a deliberate migration if wanted.
6. **Logo/branding** — new adhTea logo, deferred cosmetic list.

Full known-issues + roadmap list lives in HANDOFF.md.

## Lingering style/correctness items NOT fixed
(carried from prior sessions)
- `auth.py:46` `_make_session` no commit — caller-commits pattern.
- `auth.py:72` token expiry `>` vs `>=` — 1-second edge case.
- `main.py:41` `is_owner` migration `MIN(id)` — one-time existing-DB.
- `tasks.py:194` snooze `<=` race — sub-second window.
- `domains.py:42` + `tasks.py:517` `== True/None` — `noqa`'d, SQLA translates to SQL `IS NULL`.
- `client.js` empty `catch (_) {}` blocks — eslint `no-empty`; CI runs pytest only.
