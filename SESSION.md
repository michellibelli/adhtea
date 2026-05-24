# Session bookmark
*Last wrap: 2026-05-23 — BUILD 4.0.61: cafe theme overhaul + Focus restructure*

## State

Live build: **4.0.61** (latest commit on master). Vercel + Render auto-deploy from `master`. CI passes; `npm run lint` clean.


## What shipped 2026-05-23

Today was a long iterative pass. Highlights:

### Theme
- **New `aria-cafe` theme** (4.0.21) — Solarized Light palette (paper base3, ink base03, amber/rust accents). Colourblind-safe, designer-vetted. Made default; one-time migration from `aria-americano` via `aria_theme_migrated_cafe` flag.
- **Theme-scoped Tailwind retints** (4.0.52) — `[data-theme="aria-cafe"]` rules in index.css mute saturated Tailwind 400/500 colours (red/amber/emerald/blue/violet/cyan + bg/border/ring/hover variants) to printed-paper Solarized hex. Touches Tournament, Capture, Settings, Login, TaskCard etc. without per-file edits.
- **Falling-leaves dropped** (4.0.43) — animation was hard to tune; user preferred static. Component + render call removed from App.jsx.

### Background
- **Bookshelf SVG backdrop** (4.0.45) — `frontend/public/bookshelf-bg.svg` tiled at 540x420. Two shelves with ~20 books in muted Solarized colours.
- **Weirder curios** (4.0.46) — hourglass, crystal ball on tripod, glass dome with mushroom, skull, brass telescope, pinned butterfly.
- **Staggered CSS animations on each curio** (4.0.47) — 30s cycle, ~2.4s active window per curio, negative animation-delays so only 1-2 are moving at any moment. CSS lives inside the SVG file; rendered in Chrome / Safari modern as background-image.
- **Linen grain + warm window vignette** (4.0.43–44) — fractalNoise paper texture (8% → 14% ink) + radial-gradient sun pool from top-left.

### Focus page
Many iterations. Final 4.0.57+ layout:
- Card area: `flex flex-col justify-start items-center gap-3 pt-2`.
- **Bag + action row + tea-box stacked together** as one in-flow unit, anchored to the **top** of the column (just under the focus bar).
- Bag h fixed at **230px**, max-w 180 mobile / 260 desktop (taller than wide).
- **Action row: 3 matching 48x48 ghost icon buttons** — Capture / Done / Next, hairline ink border, 20% surface fill + backdrop-blur so they read against the bookshelf bg.
- **Tea-box bags now have paper tag + 5px string + body** (4.0.49) so they read as teabags, not as books (after the muted palette in 4.0.48 made them blend).
- Tea-box bag colours get `filter: saturate(1.25)` (4.0.51) so they pop against the wood plank without globally re-saturating the muted palette.
- **Bag pendulum sway removed** (4.0.44) — bag hangs still.
- **Hamburger menu removed on mobile** (4.0.41); Now / X done / Y left stats moved up to the App.jsx top bar via an `onStatsChange` callback prop on Focus.

### Top bar / chrome
- **Mobile top bar** (App.jsx): logo + capacity track + Focus stats stacked inside the 52px frame. Logo is the new inline-SVG `<Logo />` (pointed-oval tea leaf w/ midrib + veins, in Solarized green; Lora italic "adhTea" wordmark).
- **Desktop focus bar** (Focus.jsx inline header) wrapped in a paper-card box (4.0.60) — full cream surface, 25% ink border, lift shadow + inset highlight. Mobile top bar reverted to simple flex.
- **Empty capacity track** (4.0.55, 58) — when no morning log, renders a visible 32% subtext trough instead of returning null. Bar slot always visible.
- **Bottom-nav letterpress labels** (4.0.39) — UPPERCASE Lora, 0.22em tracking. Active label uses theme accent + 22x2 underline pill. Icon wrappers normalised to 26x26 (4.0.40) so labels align across all items.
- **WakeScreen dropped** (4.0.54). Keep-alive bot handles Render warm-up. Bare ellipsis on `!ready` replaced with Logo + "brewing…" caption splash.

### Cards / inputs
- **Card .pixel-card** shadow stack expanded (4.0.53) — border 95% + short/mid/long shadows + inset top-edge highlight. Reads as a lifted page on the bookshelf bg.
- **Input/Textarea** gain `.pixel-input-lift` (4.0.55) — same lifted treatment plus a 2px amber ring on focus.
- **Capacity card** (full mode in SelfCare/Log) now uses `.pixel-card` for matching shadow (4.0.61).

### Behaviour fixes
- **Morning check-in only gates before 14:00** (4.0.50) — was firing at 5:30pm when user opened the app with no morning log. Now skips the gate past 2pm.

## Open / next session (2026-05-24+)

1. **Onboarding flow** — first-run experience, account-setup polish, alpha-code entry styling.
2. **New splash page** — improve the brief `!ready` placeholder into a proper branded splash. The current `<Logo size={56} /> + brewing…` is a starting point.

Also queued (not committed to):
- Login / Signup / Register pages still use the old `<AuthPage>` dark-bg styling. Theme-scoped retints help but the page itself needs the cafe pass.
- Tournament page interactions OK but the score-chip / slot UI hasn't been visually audited recently.
- Settings page is functional but cluttered; could use spacing + Card consistency.
- Tea-box `box full` banner styling untouched.

## Lingering style/correctness items NOT fixed
(carried from prior session)
- `auth.py:46` `_make_session` no commit — caller-commits pattern.
- `auth.py:72` token expiry `>` vs `>=` — 1-second edge case.
- `main.py:41` `is_owner` migration `MIN(id)` — one-time existing-DB.
- `tasks.py:194` snooze `<=` race — sub-second window.
- `tasks.py update_task` uses `date.today()` (server UTC) instead of `_app_today(user)` (user tz).
- `domains.py:42` + `tasks.py:517` `== True/None` — `noqa`'d, SQLA translates to SQL `IS NULL`.
- `Today.jsx` optimistic update — `fetchTasks()` fallback more robust than explicit revert.

## Build progression this session (newest first)

4.0.61 → 4.0.21 (40+ pushes — see `git log` for full sequence). Key landmarks:

| Build | What |
|---|---|
| 4.0.61 | Capacity card uses `.pixel-card` shadow (SelfCare full mode). |
| 4.0.60 | Mobile top bar reverted; desktop focus bar boxed instead. |
| 4.0.58 | Stack anchored to top (under focus bar), not bottom. |
| 4.0.57 | Unified bag/row/teabox into one in-flow stack; drop both portals. |
| 4.0.55 | Empty capacity track; raise tea-box; lifted inputs. |
| 4.0.54 | Bag pop; desktop matches mobile (3-icon row); drop WakeScreen; Logo splash. |
| 4.0.53 | Stronger card shadows; active nav underline. |
| 4.0.52 | Theme-scoped retint for saturated Tailwind colours. |
| 4.0.50 | Morning check-in only gates before 14:00. |
| 4.0.49 | Tea-box bags get tag + string (vs bookshelf books). |
| 4.0.48 | Mute tags; refine wood; cafe Today/Inbox; ghost buttons readable. |
| 4.0.47 | Staggered animations on each curio. |
| 4.0.46 | Bigger shelves; weirder curios (skull, telescope, etc.). |
| 4.0.45 | Bookshelf SVG backdrop. |
| 4.0.43 | Drop falling leaves; paper grain + warm window vignette. |
| 4.0.41 | Stats lifted from Focus to App top bar; hamburger removed. |
| 4.0.39 | Letterpress nav labels (Lora uppercase tracked). |
| 4.0.37 | All three action-row buttons matching ghost icons. |
| 4.0.31 | Hard-cap bag at 200x180; pin to card-area top (overlap saga ends). |
| 4.0.30 | Override `.aria-page` min-height with `!important` to lock viewport. |
| 4.0.28 | Tailwind underscore fix in arbitrary calc() values. |
| 4.0.21 | Solarized Cafe theme + slim mobile chrome. |
