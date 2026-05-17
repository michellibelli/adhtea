# Session bookmark
*Last wrap: 2026-05-17 — Phase 3 closed; test infra + CI + theme system shipped*

## State

Live commit: `ec05f63` (paper teabag texture). BUILD chip on prod reads `3.9.22` once Vercel finishes.

Vercel + Render auto-deploy from `master`. CI added: `.github/workflows/test.yml` runs 86 pytest tests on every push + PR.

`~/.aria-token` rotating soon — re-grab from localStorage on adh-tea.fun if API helper fails.


## What shipped this session

| BUILD | What |
|---|---|
| **3.9.16** | Console-warning fixes: `autoComplete` attrs on Login/Register/Signup (`current-password` for login, `new-password` for setup/signup/register), `<meta name="mobile-web-app-capable">` added alongside deprecated apple variant. SelfCare runs one-time pseudonymization migration on legacy med rows — copies real name to localStorage, renames server row to `Medication N`, idempotent. |
| **3.9.17** | Dropped `dose` column entirely from `medication_schedules`. Pre-3.9.11 rows still held real dose strings ("10 mg" etc.) — privacy risk. Removed from ORM model, Pydantic schemas, route. `_migrate` does `ALTER TABLE … DROP COLUMN` for both SQLite + Postgres branches; refactored to accept `target_engine` kwarg for testability. |
| **3.9.18** | Phase 3.8 Part 2 finisher: inline domain-rule warning on Projects.jsx date pickers. `frontend/src/utils/domain.js` mirrors backend `next_allowed_date`; `<DomainDateWarning>` component shows amber "Saturday not allowed — will move to Monday" below 3 date inputs. Backend already snapped; this surfaces the snap. |
| **3.9.19** | `slowapi` rate limit on `POST /login` → 10/minute per IP. Shared `Limiter` in `backend/rate_limit.py`. Closes #22. |
| **3.9.20** | Settings → Display → "Show build chip" toggle. localStorage-backed + live update via `aria:build-chip-changed` custom window event. Closes #7. |
| **3.9.21** | Manual theme picker (8 initial themes). Each `[data-theme="aria-*"]` block defines 14 `--aria-*` vars + page-bg gradient + body bg. `color-mix()` derives subtext/border/primary-hover. Settings → Display → Theme: swatch grid, tap to swap. ThemeContext now manual — reads `aria_theme` localStorage, no twilight auto-switching. BottomNav + App.jsx mobile header + AuthPage + pixel-card + pixel-btn shadows all use `ui-*` utilities so they retheme. |
| **3.9.22** | Teabag-card paper texture rework: 4-layer background (2.5px fiber dots + 5px offset pass + SVG fractalNoise grain + vertical depth gradient) plus inset shadows for roundness. Bonus-mode variant in deeper amber/gold. **Note:** bonus mode didn't translate well — needs another pass tomorrow. |
| **3.9.23** | Trimmed picker themes from 8 to 4 after user palette review: kept Original, Berries, Americano, Chai. Removed Coffee, Tea, Omelette, Mint. Hex values preserved in commit history if any are revived. |

## Bigger-picture state changes

- **86 pytest tests + CI** — every backend route now has at least basic coverage. `conftest.py` uses in-memory SQLite via `StaticPool`. Tests run on push/PR via GitHub Actions. Means we can change backend code confidently without breaking deployed flows.
- **Theme system is manual + user-controlled.** ThemeContext used to auto-switch via twilight (`utils/twilight.js`); that's gone. User picks one of 8 in Settings → Display → Theme. Future-friendly for user-defined custom palettes (current themes are a registry pattern).
- **Medication is fully pseudonymized server-side.** Dose column dropped (3.9.17); legacy real-name rows migrated via frontend on first SelfCare load (3.9.16). Server now genuinely knows only `Medication N` placeholders + reminder times + taken history.

## Open issues / tomorrow

1. **Bonus mode teabag** — paper texture redo translated poorly to bonus variant. Needs another pass with deeper gold tones / different layering.
2. **Real device test** medication pseudonymization on the user's phone — already 1 of 2 places this needs to pass.
3. **Real human code review** — outstanding from last session.

## Lingering style/correctness items still NOT fixed (carried forward)

From the May 15 review passes, these are intentionally skipped:

- `auth.py:46` `_make_session` no commit — caller-commits SQLAlchemy pattern.
- `auth.py:72` token expiry `>` vs `>=` — 1-second edge case.
- `main.py:41` `is_owner` migration `MIN(id)` — one-time existing-DB only.
- `tasks.py:194` snooze `<=` race — sub-second window.
- `tasks.py:752` cascade date shift — siblings share `project_id` therefore share domain.
- `domains.py:42` + `tasks.py:517` `== True/None` — `noqa`'d, SQLAlchemy translates to SQL `IS NULL`.
- `Today.jsx:144` optimistic update — `fetchTasks()` fallback is more robust than explicit revert.

## Where to resume

1. **Bonus mode teabag visual fix** — open Focus, trigger bonus mode (load with no normal task showing — e.g., all done), inspect, iterate on `.teabag-bonus` CSS in `frontend/src/index.css` around line ~285.
2. **Real device test** medication pseudonymization on the user's phone.
3. **Mint dark theme polish** (if user picks Mint daily) — pride stripe, teabag, AuthPage, Focus inline hex.
4. **Optional hex sweep** — `Focus.jsx`, `Tournament.jsx`, `OnboardingWelcome.jsx`, `WakeScreen.jsx`, `PageProgress.jsx` still have raw hex (sparkles, gradients, pixel art). Cosmetic — affects only those specific surfaces.

## Local-only files NOT in repo

`docs/Secret Key.txt` and `docs/Server Stuff.txt` — gitignored. Keep out permanently.

## Commits this session (latest first)

```
ec05f63 style(teabag): paper texture with fiber grain + roundness     [3.9.22]
03bcab1 feat(theme): manual picker with 7 new palettes + Original     [3.9.21]
b2209cc feat(settings): toggle build chip visibility (closes #7)       [3.9.20]
7d31b32 feat(auth): rate-limit POST /login to 10/min per IP (closes #22) [3.9.19]
5cdc8aa feat(domain): inline warning when picked date is disallowed   [3.9.18]
9323849 ci: run pytest on push + PR to master
647a55c test: third batch — routines, selfcare, gcal, lifecycle, CSV (39 tests)
5e41660 test: add second batch — tasks, medication, projects (20 tests)
a6fda70 test: add pytest scaffolding + first batch (27 tests)
32cd791 feat(medication): drop dose column entirely                   [3.9.17]
9a16380 fix(frontend): autocomplete attrs, mobile-web-app-capable, legacy med name migration [3.9.16]
```
