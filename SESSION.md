# Session bookmark
*Last wrap: 2026-05-20 — BUILD 4.0.1: triage-flow rework + RLS security fix + lint clean*

## State

Live commit: `70ef8ce` (BUILD 4.0.1). BUILD chip on prod reads `4.0.1` once Vercel + Render finish.

Vercel + Render auto-deploy from `master`. CI runs the pytest suite on every push + PR.


`npm run lint` is clean — 0 errors, 0 warnings.

## What shipped this session (2026-05-20)

| Commit | What |
|---|---|
| `f5180fd` | BUILD 4.0.0 — R7 follow-up: drag/pin in the 7-day plan view (was uncommitted WIP from the prior session; pushed at session start). |
| `ecfc3e1` | SESSION.md placeholder fill + `set-state-in-effect` lint suppressions on legit mount-fetch sites. |
| `134bc64` | Cleared remaining eslint errors → lint now 0/0. `eslint.config.js` registers `__BUILD_TIME__` global + ignores `_`-prefixed unused vars; dead code removed; ref/purity false-positives suppressed with explained disables. |
| `1b90cee` | **Security** — RLS enabled on all 14 tables. See below. |
| `70ef8ce` | BUILD 4.0.1 — triage-flow rework: check-in routes to Triage, empty slots, per-slot type-ahead + create button. See below. |

### Security — Row-Level Security (`1b90cee`)

Supabase advisor flagged `rls_disabled_in_public` + `sensitive_columns_exposed`. The `public` schema (incl. `users.hashed_password`, `session_tokens.token`, Google OAuth tokens) was reachable through Supabase's auto-generated PostgREST API with RLS off.

`_migrate()` now runs `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on all 14 tables (Postgres branch only). RLS-on + no policies = deny-all for the `anon`/`authenticated` API roles. The backend connects as the `postgres` owner role, which bypasses RLS, so the app is unaffected. Applied to prod manually via the SQL editor too (instant), and re-applies on every deploy. `session_tokens` was wiped as precautionary token rotation; relogin confirmed working. Both advisor criticals cleared.

### Triage-flow rework (`70ef8ce`, BUILD 4.0.1)

- **Check-in routes to Triage.** After the morning check-in gate, the user lands on Triage instead of Focus — capacity is freshly logged, so triage is the natural next step. Gate CTA reads "Continue to Triage".
- **Top-3 slots start empty.** Removed the top-scored pre-fill — triage is an active choice, not a system guess. The `slotsTouchedRef` guard is gone with it (no pre-fill left to protect).
- **Per-slot type-ahead.** Each empty slot is a text field; typing filters existing tasks (in-memory substring match on title) into a dropdown, click to fill. A `+` button at the field's right edge creates a brand-new task from the typed text with `due_date` = today, pins it to today, drops it into that slot. Enter picks the first match, else creates.
- Search bar + suggested list unchanged. The standalone `+Add` row was absorbed into the slots.

## Open items / next session

User has lined up the next visual overhaul. Phase 3 closed; Phase 4 still deferred.

1. **Tea-box on Focus** — visual tea box that bags emerge from. Bag count = uncompleted tasks today. Bag color = `task_type`. Order = triage priority. The persistent cup was removed in 3.9.31, so the page has room.
2. **Bottom-nav cafe typography** — re-skin `BottomNav.jsx` like real tea-box letterpress: wordmark + flat icons + rule lines (think Bigelow / Yogi / Harney).
3. **New adhTea logo + iconography** — full brand pass. Current logo: `public/adhTeaLogo.png`.
4. **Leaf animation tuning** — three-behavior physics pass (flutter / glide / drop) is closer but still needs iteration per user. Tunables: durations, swing magnitudes, rotation speeds, leaf-count, ease curves.

## Lingering style/correctness items still NOT fixed (carried forward)

- `auth.py:46` `_make_session` no commit — caller-commits SQLAlchemy pattern.
- `auth.py:72` token expiry `>` vs `>=` — 1-second edge case.
- `main.py:41` `is_owner` migration `MIN(id)` — one-time existing-DB only.
- `tasks.py:194` snooze `<=` race — sub-second window.
- `domains.py:42` + `tasks.py:517` `== True/None` — `noqa`'d, SQLAlchemy translates to SQL `IS NULL`.
- `Today.jsx` optimistic update — `fetchTasks()` fallback is more robust than explicit revert.
- `tasks.py update_task` uses `date.today()` (server UTC) instead of `_app_today(user)` (user tz).

## Where to resume

1. **Tea-box on Focus** — open `frontend/src/pages/Focus.jsx`. Cup/bag region is currently dunk-only (3.9.31 removed the persistent cup), so there's a clean canvas above or beside the active teabag.
2. **Bottom-nav reskin** — `frontend/src/components/BottomNav.jsx`. Uses `ui-nav` / `ui-primary` utilities already, so theming hooks exist.
3. **Logo** — `public/adhTeaLogo.png` is consumed by `index.html` and the PWA manifest; grep for `adhTeaLogo` before swapping.

## Local-only files NOT in repo

`docs/Secret Key.txt` and `docs/Server Stuff.txt` — gitignored. Keep out permanently.

## Commits this session (latest first)

```
70ef8ce feat(triage): route from check-in, empty slots, per-slot type-ahead [4.0.1]
1b90cee fix(security): enable Row-Level Security on all tables
134bc64 chore(lint): clear remaining eslint errors — lint now clean
ecfc3e1 chore(lint): suppress set-state-in-effect at legit mount-fetch sites
f5180fd chore: BUILD 4.0.0 — R7 follow-up, drag/pin in 7-day plan view
```

Prior session commits (2026-05-18 / 19, R1–R7 + extras):
```
1444846 feat(triage): R7 — top-3 picker + collapsible full plan + search [3.9.44]
80704c1 feat(checkin): morning log as hard gate before app access [3.9.43]
2509dd6 fix(snooze,triage): domain-aware snooze + capacity ignores routines [3.9.42]
bc8157d style(today,focus): wider task cards + taller teabag, no text clipping [3.9.41]
c7eb696 fix(modals): portal + top-third positioning so dialogs never fall below the fold [3.9.40]
e3e02f4 feat(taskcard): always-visible snooze + edit + delete icon column [3.9.39]
d784eed feat(triage): R5 stale prompt + R6 retire old tournament [3.9.38]
e16abe7 feat(triage,ui): R4 — new column layout + score chip + pin button [3.9.37]
d3f0a84 feat(triage): R3 — pin top-3 + bin-pack respects pins
8bffd21 feat(triage): R2 — capacity bin-pack + rolling 7-day window
b6a363e feat(triage): R1 — explainable scoring engine
```
