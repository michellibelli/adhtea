# Session bookmark
*Last wrap: 2026-05-17 (evening) — big aesthetic + cohesion overhaul; Phase 3 still closed*

## State

Live commit: `d74f031` (cohesion pass). BUILD chip on prod reads `3.9.33` once Vercel finishes.

Vercel + Render auto-deploy from `master`. CI runs 91 pytest tests on every push + PR.

`~/.aria-token` rotating soon — re-grab from localStorage on adh-tea.fun if API helper fails.


## What shipped this session (evening 2026-05-17)

| BUILD | What |
|---|---|
| **3.9.24** | localStorage wipe-on-new-build in `main.jsx`. Compares stored `aria_build` to current `__BUILD_TIME__`; on mismatch, clears localStorage but preserves `aria_token`, `aria_theme`, and `med_name_*` keys (irreplaceables). Ensures bug fixes that depend on a clean local state reach users who haven't manually cleared. |
| **3.9.25–26** | Bonus mode silver/chrome done button experiments (later reverted in 3.9.29 — looked out of place next to the gold focus bar). Kept the `.pixel-btn-silver` CSS as a stable hook in case it's revived. |
| **3.9.27** | Theme registry trim: dropped Original (`adhtea`) and `utils/twilight.js`. Default now `aria-americano`. Existing users with the old id in localStorage fall back to the default via the validity check. Americano page bg gained a tiled SVG tea-leaf layer. |
| **3.9.28** | Realistic teabag overhaul on Focus: tag stays still, string + bag swing as a pendulum (`teabag-sway` CSS, 2.4deg over 5s), stitched bottom seam, persistent SteepingCup with tea pool that filled + darkened with `totalDone` and 3 staggered steam wisps. |
| **3.9.29** | Tea leaves on bg redrawn as proper lance-shaped silhouettes with central vein (previous "two-point ovals" read as sperm). Steam wisps stripped from page bg (steam belongs on the cup). Bonus done button reverted to `pixel-btn-rainbow` — chrome look fought the focus bar. |
| **3.9.30** | Static tiled leaves replaced with a `.falling-leaves` fixed overlay: six leaf SVGs, varied widths + durations + negative animation-delays, each on their own column. Continuous drift top → bottom. |
| **3.9.31** | Four-fix bundle: (1) leaves now stay visible by extracting page bg to a separate `.aria-page-bg` fixed layer at z-index -1 (the `.aria-page` `animation: page-in` was creating a stacking context that painted bg over the fixed leaves); (2) persistent SteepingCup removed (cup back to dunk-only); (3) bag sway slowed 5s → 10s per cycle; (4) Americano gradient swapped from blue twilight to warm amber sunrise. |
| **3.9.32** | Teabag mesh: removed the 4px solid border that was leaving rectangular ghost outlines at the polygon's chamfered corners (border ignores clip-path). Added two woven-thread layers (horizontal + vertical thin lines on a 3.5px grid) so the bag reads as cotton mesh. |
| **3.9.33** | Cohesion pass (calm rustic cafe direction): (A) `.pixel-btn-rainbow` repurposed honey→amber→oak gradient with a dusty-rose hover glow; (B) `.pride-stripe` swapped 4px saturated rainbow for a 1.5px dusty-rose hairline that fades at the ends; (C) display font Press Start 2P → Lora serif (var name kept); (D) `.pixel-card` softened: 1px subtle border, 10px rounded corners, soft warm wood shadow; `.pixel-card::before/::after` pride strips removed; `.pixel-btn` similarly softened; (E) brand-display work deferred. Plus: bonus-mode bag sparkles removed; falling-leaves keyframe given wider lateral swings (±50px peaks) on ease-in-out timing for autumn-drift feel. |

## Also shipped (backend)

| BUILD | What |
|---|---|
| **fix(domain) 17be0ed** | Three domain enforcement bugs fixed in `backend/routes/tasks.py` and a new sweep added. (1) `create_task` was computing `due_today` from the pre-snap `due_date`, so a Sunday pick on a weekday-only Work project still landed status=today after the snap moved due_date to Monday. (2) `update_task` ran the demote-on-future check before snapping, so the snap was bypassed. (3) `promote_due_tasks` promoted any inbox task with `due_date <= today` regardless of the task's domain — a Work task due Friday auto-promoted on Sunday. Plus: new `demote_domain_violations` sweep wired into `/tasks/today` to clean up tasks already placed on disallowed days. `_date_allowed` → `date_allowed` (public). +5 tests in `test_tasks.py`. Full suite **91 passed**. |

## Bigger-picture state changes

- **Default theme is now Americano** with a warm sunrise gradient + falling tea-leaf overlay. Original/`adhtea` is gone; pride-rainbow elements are toned down across the app.
- **Visual register shifted from "queer pixel cozy" toward "rustic cafe."** Pixel-art card edges softened, arcade font replaced with Lora serif, rainbow accents → amber + dusty-rose. Feminine accent kept as understated hover/hairline, not a primary element.
- **Domain enforcement is now systemic.** Tasks can no longer land on a domain-disallowed day via the create/edit/promote paths, and a sweep cleans up any historical drift on each `/tasks/today` read.
- **localStorage clears on every new build** (preserving token, theme, med-names). Means a fix that depended on clean local state reaches users automatically.

## Open issues / tomorrow

User is planning a substantial Focus-page redesign for next session:

1. **Tea-box visual** — a tea box on the Focus page that the bags come out of. Box shows a visual count of how many bags remain (i.e., uncompleted tasks today).
2. **Bag colors per task type** — each bag tinted by its type/category (existing `task_type` enum already drives the tag color).
3. **Bag order = day plan** — order in which bags emerge matches the prioritized task order from triage.
4. **Tea-box typography on nav** — bottom-nav buttons re-skinned to look like the typography and iconography found on a real tea box (e.g., letterpress wordmark, simple flat icons, rule lines).
5. **New logo + iconography for adhTea** — full brand pass.

See `[ARIA future features](memory)` and `[ARIA project state](memory)` for cross-session notes.

## Lingering style/correctness items still NOT fixed (carried forward)

From the May 15 review passes, intentionally skipped:

- `auth.py:46` `_make_session` no commit — caller-commits SQLAlchemy pattern.
- `auth.py:72` token expiry `>` vs `>=` — 1-second edge case.
- `main.py:41` `is_owner` migration `MIN(id)` — one-time existing-DB only.
- `tasks.py:194` snooze `<=` race — sub-second window.
- `domains.py:42` + `tasks.py:517` `== True/None` — `noqa`'d, SQLAlchemy translates to SQL `IS NULL`.
- `Today.jsx:144` optimistic update — `fetchTasks()` fallback is more robust than explicit revert.
- `tasks.py update_task` uses `date.today()` (server UTC) instead of `_app_today(user)` (user tz). Pre-existing; not in scope for this session's domain fix.

## Where to resume

1. **Tea-box redesign on Focus** — open `frontend/src/pages/Focus.jsx` and the cup/bag region. The persistent cup was removed in 3.9.31 so there's room to introduce a tea-box visual without colliding with anything currently on the page.
2. **Logo + iconography** — `public/adhTeaLogo.png` is the current logo file; consumers grepped in commit notes.
3. **Bottom nav cafe typography** — `frontend/src/components/BottomNav.jsx`.

## Local-only files NOT in repo

`docs/Secret Key.txt` and `docs/Server Stuff.txt` — gitignored. Keep out permanently.

## Commits this session (latest first)

```
d74f031 style: cohesion pass — serif font, amber done btn, soft card, rose stripe [3.9.33]
ab08ed3 style(teabag): remove rect border at clipped corners, add woven mesh [3.9.32]
acf3583 fix(focus,theme): leaves keep falling, bag slows, cup gone, warmer bg [3.9.31]
f5ee65c feat(theme): falling tea leaves drift across the viewport [3.9.30]
d6db32c fix(theme,bonus): proper leaf shapes, no steam in bg, rainbow done btn [3.9.29]
4190c42 feat(focus): realistic swaying teabag + persistent steeping cup [3.9.28]
88fb81b feat(theme): drop Original, default to Americano, tea-leaf page bg [3.9.27]
9ca54d3 style(bonus): chrome mirror-finish for done button [3.9.26]
01698b5 style(bonus): silver button reads as chrome not paint [3.9.25]
91589bc chore: bump BUILD to 3.9.24
c5931d4 style(bonus): embossed gold-bar text + animated silver button shine
9314cda style(bonus): move gold from teabag to focus bar with shine + sparkle
bc5fda1 fix(focus): always fetch bonus tasks so hidden routines don't block bonus mode
17be0ed fix(domain): enforce rules across task create, update, and promote
88569fa style(teabag): bonus mode foil shimmer
ce80194 feat(frontend): auto-clear stale localStorage on new build
```
