# Session bookmark
*Last wrap: 2026-08-20 — BUILD 4.13.1*

## State

Live build: **4.13.1** (latest commit on master). Vercel + Render auto-deploy from `master`. Backend suite 188 passed; `npm run build` clean.

**Prod backend was DOWN on 2026-08-20** during a Render platform incident ("Deployment Issues", major, all five regions). Every request returned `503` with `x-render-routing: hibernate-wake-error`; in the UI that presents as **"Failed to fetch" on login**, because the `OPTIONS /login` preflight 503s and the browser never receives CORS headers. Verified not our fault: tests pass, master is synced, and Supabase answered normally. Render's free tier hibernates and a wake goes through the build/deploy path, so a deploy incident takes the *live* app down — the paid tier removes hibernation and with it this failure mode. Check the frontend still works once Render recovers.

HANDOFF.md is the real source of truth for architecture — this file is just the bookmark.

## What shipped this session (docs + hygiene, no app behavior change)

- **Docs de-duplicated.** `PROJECT.md` was four minor versions stale, still documenting Triage, project domains, the Americano theme, 30-day tokens, and the Press Start 2P / pride-stripe design system — all removed builds ago. Rewritten as a **design-only** doc: philosophy, the `--color-ui-*` → `--aria-*` token indirection, both current themes with real values, the Cafe retint block, typography, and the legacy-classname table (`pixel-card` etc. are Lora-era names kept for code stability). Every operational section it duplicated from HANDOFF was **deleted rather than refreshed** — one home per fact, so it cannot drift again. Don't re-add an architecture section there.

- **`Query.get()` → `Session.get()`.** Only 2 sites, both in `tests/test_review.py`. SQLAlchemy `LegacyAPIWarning` gone; the 5 warnings that remain are all third-party (slowapi's `asyncio.iscoroutinefunction`).

- **`deploy-check.sh` now diagnoses instead of dumping.** It echoed the raw `/health` body, so a sleeping backend or a Cloudflare challenge buried the signal under a screenful of HTML. Now reads status + `x-render-routing` and names the fault: hibernate-wake-error (Render-side, with the "Failed to fetch" explanation), wake-in-progress, Cloudflare challenge, 429 rate-limit, or genuinely down.

- **`docs/retention.md`** — analysis + proposed design for the unbounded row growth. **Design only, nothing implemented.** See below.

## Corrected from the previous bookmark

- **`datetime.utcnow()` deprecation was already done.** The previous entry claimed 12 call sites across 8 files. There are zero raw `datetime.utcnow()` calls; `models.utcnow()` (`models.py:11`) is already `datetime.now(timezone.utc).replace(tzinfo=None)` — naive by design, to match the columns' convention. Item removed, not carried forward.

## Open / next session

1. **Settings page visual pass** — functional but cluttered, needs cafe theme consistency. Pending since May. Deliberately deferred; it's design work, best done against a live backend.
2. **Retention Tier 1** — implement the sweep in `docs/retention.md` if wanted. Get a real prod row count first (`SELECT task_type, status, count(*) FROM tasks GROUP BY 1,2`); the design assumes Tier 1 dominates and should be re-argued if it doesn't. **Read the `project_stall_map` trap in that doc before writing any DELETE.**
3. **Cloudflare WAF bypass for `/health`** — the API host challenges scripted clients, so `deploy-check.sh`, `aria-api.sh`, and any UptimeRobot keep-alive fail intermittently. Needed before a keep-alive pinger is worth setting up.
4. **Orphan score columns** — `Task.score`, `score_components`, `score_updated_at`, `pinned_for`, `max_tasks_per_day`, `max_total_per_day`. Nothing writes them. Explicitly decided 2026-08-20 to **leave them**; dropping needs a destructive prod migration and they read back null harmlessly.
5. **Logo/branding** — new adhTea logo, deferred cosmetic list.
6. **Consider Render paid tier ($7/mo)** — removes hibernation, which removes cold starts, the wake-path fragility, and the keep-alive problem in one move.

Full known-issues + roadmap list lives in HANDOFF.md.

## Lingering style/correctness items NOT fixed
(carried from prior sessions)
- `auth.py:46` `_make_session` no commit — caller-commits pattern.
- `auth.py:72` token expiry `>` vs `>=` — 1-second edge case.
- `main.py:41` `is_owner` migration `MIN(id)` — one-time existing-DB.
- `tasks.py:194` snooze `<=` race — sub-second window.
- `tasks.py:517` `== True/None` — `noqa`'d, SQLA translates to SQL `IS NULL`. (The `domains.py` half of this note is obsolete; that file was deleted in 4.9.0.)
- `client.js` empty `catch (_) {}` blocks — eslint `no-empty`; CI runs pytest only.
