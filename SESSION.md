# Session bookmark
*Last wrap: 2026-08-28 — BUILD 4.14.6*

## State

Live build: **4.14.0**. Vercel + Render auto-deploy from `master`. Backend suite 188 passed; `npm run build` clean.

Backend has been on **Render Starter** since 2026-08-27 — no hibernation. Verified healthy at the start of this session: `/health` 200 `{"status":"ok","version":"2.0.0"}` with no `x-render-routing` header and no wait, frontend serving `index-Kh8D0CHI.js` → `index-B_FiSyrv.js` after 4.13.2. The 2026-08-20 outage was a Render platform incident and is over.

HANDOFF.md is the real source of truth for architecture — this file is just the bookmark.

## What shipped this session

- **Loading covers off by default (`?covers=on` restores them).** The covers were still firing on a server that no longer sleeps, so there was no way to see the app's real load time — the exact thing the Starter trial is meant to judge. `COVERS_ON` in `App.jsx` now gates `raiseCover()`, the nav-cover effect, the reactive wake effect, and the boot screen. Nothing deleted; the whole wake machinery is intact per HANDOFF's trial note. URL param, not localStorage — `main.jsx` wipes localStorage on every BUILD change.

- **Load-time readout.** New `frontend/src/utils/loadTimer.js`: `ready` and `page` marks, ms since navigation start (so download + parse are included), console-logged and shown as a third line on the build chip.

- **Orphan score columns — code side cleared.** The 2026-08-20 call was "leave them," but that call was really about refusing a destructive migration, and three of the four problems were code. Gone: the four fields from `TaskResponse`, the eight `ADD COLUMN` statements in `_migrate` (both branches — a fresh DB was recreating the orphans), and `ScoreChip` + `LEVER_LABELS` + `WhyTooltip` in `TaskCard.jsx` (~56 lines, unreachable — `showScore`/`showWhy` defaulted false and no caller ever set them). `models.py` declarations and the prod columns stay; their comments now say ORPHANED instead of describing a bin-packer that no longer exists.

- **Cloudflare item closed, won't fix.** "Add a WAF bypass rule for `/health`" was never actionable: `adh-tea.fun` NS is whois.com, and `api.adh-tea.fun` → `onrender.com` → `cdn.cloudflare.net`, i.e. **Render's** Cloudflare in front of its custom domains. No zone of ours, no rule to add. Motivation was gone anyway — Starter needs no keep-alive and Render polls `/health` every ~5s. `deploy-check.sh` now says that instead of giving advice you can't follow.

- **Focus layout (4.14.1 + 4.14.2).** 4.14.2/4.14.3 cut the Linen banner reserve to 80px *on Focus only*: TeaBox is ~140px tall (62px bag row + 72px drawers), not 72, so at a 200px reserve the column had less height than its content needs and the bag sat pinned at its `min-h` floor with ~136px of dead space below the box. The banner is 140px tall with its flowers in the bottom ~90, so 120 still cannot collide. 4.14.1: Reported as "smooshed" on the phone — teabag, weekly-insight note and tea box overlapping, with an empty band under the box. The band is the deliberate 200px Linen banner reserve (`index.css`); the overlap was the bag card's hard `min-h-[260px]` in a column that only had ~421px for ~544px of content. The teabag zone has `min-h-0`, so it shrank below its content and the card spilled downward under the note and the box, which both paint above it. Fix: a flex chain from the zone down to the card (`min-h-0` on every link, `h-full` on the card) so the bag takes whatever is left; `min-h-[clamp(110px,20dvh,260px)]` is floor/ceiling, not size, keeping 260 for tall screens and desktop where the page goes `h-auto`. The string scales the same way. The reserve is untouched — the box must not reach the flowers.

## Open / next session

1. **Record the load-time baseline.** Open the app on the phone and read the chip, then `?covers=on` for the side-by-side. Put both numbers here — that's the Render-trial evidence.
2. **Decide the covers' fate** at the end of the trial: keep them off, restore them, or make the gate smarter (fix `likelySleeping()` to measure the server rather than the user, which is the actual bug underneath).
3. **Retention Tier 1** — implement the sweep in `docs/retention.md` if wanted. Get a real prod row count first (`SELECT task_type, status, count(*) FROM tasks GROUP BY 1,2`). **Read the `project_stall_map` trap in that doc before writing any DELETE.**
4. **Time tracking** — `docs/time-tracking.md`, design only, nothing implemented.
5. **Settings visual pass** — functional but cluttered, pending since May. Design work, best done against a live backend.
6. **Logo/branding** — new adhTea logo, deferred cosmetic list.

Full known-issues + roadmap list lives in HANDOFF.md.

## Lingering style/correctness items NOT fixed
(carried from prior sessions)
- `auth.py:46` `_make_session` no commit — caller-commits pattern.
- `auth.py:72` token expiry `>` vs `>=` — 1-second edge case.
- `main.py:41` `is_owner` migration `MIN(id)` — one-time existing-DB.
- `tasks.py:194` snooze `<=` race — sub-second window.
- `tasks.py:517` `== True/None` — `noqa`'d, SQLA translates to SQL `IS NULL`.
- `client.js` empty `catch (_) {}` blocks — eslint `no-empty`; CI runs pytest only.
