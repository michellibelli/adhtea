# adhTea — Design Documentation
*Last updated: 2026-09-17 (BUILD 4.24.3)*

> **Scope.** This file covers the *why* and the *look*: design philosophy and the
> design system. Everything operational — architecture, file maps, deployment,
> release process, current status, known issues, roadmap — lives in
> **`HANDOFF.md`**, which is the source of truth.
>
> Split this way deliberately. Before 2026-08-20 this file duplicated HANDOFF's
> operational sections and drifted four minor versions behind, still documenting
> Triage, project domains, the Americano theme, and 30-day tokens — all removed
> builds ago. Duplicated docs rot. Don't re-add an architecture section here.

---

## What is this

**adhTea** is a personal ADHD productivity app built for the user. Not a generic
todo app — it is designed around the cognitive patterns of ADHD: low-friction
capture, capacity-aware daily planning, foundation-habit tracking (sleep, meals,
meds, mood), and warm behavior-change nudges.

Live at **[adh-tea.fun](https://adh-tea.fun)**.

(see HANDOFF, "Deferred: Phase 4"). Do not start it without an explicit greenlight.

---

## Design philosophy

**Problem.** Standard productivity apps assume consistent executive function.
ADHD does not work that way. Some days carry full capacity; some days need a
list of three things and permission to stop there.

**The core promise.** At any moment she opens the app, the surfaced next action
is worth doing *now* — priority × current capacity. It won't duplicate work she
has already done, and it won't let her miss an appointment.

**How that cashes out.** Four commitments, each of which has survived a feature
being deleted to protect it:

- **Capacity is measured, not assumed.** Sleep, meals, meds, and mood feed a
  capacity snapshot that sets the day's slot count. The `(X/N)` chip and the
  task promoter read the same number, so the UI cannot promise a capacity the
  scheduler ignores.
- **The plan holds once committed.** "Start my day" is a ritual with teeth.
  After it, nothing enters Today unless she taps `+`. This was not true until
  4.12.0, and the bug it fixed — completing a task silently summoning a
  replacement — is the clearest example of the philosophy being violated by
  a technically-correct implementation.
- **The order is hers on request.** Computed time-tiers order the tea-box until
  she drags a bag; from that first drag until the 4am rollover, her hand-order
  wins outright.
- **Nudges are rare and warm — so rare the surface itself is gone.** Three-a-day
  nudges became wallpaper; the fix was one-a-day, then a dismissal-aware
  cooldown, and eventually removing `NudgeModal` and `WeeklyInsightCard`
  outright (4.20.0–4.21.0, and the weekly-insight line's second hiding spot in
  4.24.x). The commitment held all the way to "no nudge is better than a
  frequent one" — `pid_engine.py`/`WeeklySnapshot` groundwork survives unused
  in case a future micro-nudge earns a second try.

**What gets deleted.** This codebase has removed more features than most add:
the tournament/triage page, project domains, the difficulty/weight system, and
the whole scoring engine. The pattern is consistent — a system that asked her to
supply structure the app could infer, or that added a decision to a moment that
needed fewer decisions, got cut. Prefer removing a feature to tuning it.

**Vibe.** Calm and papery. Warm, hand-made, unhurried — closer to a recipe box
or a cafe menu than to a dashboard. An earlier "pixel pride" register was
intentionally toned down; a few classnames survive from it (see below) but the
visual language does not.

---

## Design system

Implemented in `frontend/src/index.css` with Tailwind v4 `@theme inline {}`.

### Token indirection

Two layers, and the indirection matters:

```
--color-ui-*   (Tailwind theme tokens — what components consume)
     ↓ var()
--aria-*       (per-theme raw values — set under [data-theme="..."])
```

Components reference `--color-ui-*` only. Restyling a theme means editing the
`--aria-*` block, never the component. **Do not hardcode a hex in a component**;
it will be correct in one theme and wrong in the other.

### Themes

Two, both light. Selected via `ThemeContext.jsx`, persisted in the
`aria_theme` localStorage key.

**Cafe** (default) — Solarized Light. Cream paper throughout, ink text,
amber/rust accents. The nav is paper too, not a dark slab.

| Token | Value |
|-------|-------|
| `--aria-surface` | `#FAF6E8` |
| `--aria-body-bg` | `#FDF6E3` |
| `--aria-text` | `#002B36` |
| `--aria-subtext` | `#586E75` |
| `--aria-accent` | `#B58900` (amber) |
| `--aria-primary` | `#CB4B16` (rust) |
| `--aria-nav` | `#EEE8D5` (paper) |

**Linen** — lavender-mauve stationery. Cool cream ground, plum ink, muted
lavender accents. "Elegant recipe box," not "rustic cafe." Unlike Cafe, its nav
*is* a dark slab (`#3D3545`) with light text.

| Token | Value |
|-------|-------|
| `--aria-surface` | `#FDFBFE` |
| `--aria-body-bg` | `#F4F0F6` |
| `--aria-text` | `#3D3545` |
| `--aria-subtext` | `#8A8494` |
| `--aria-accent` | `#B8A0C4` |
| `--aria-primary` | `#9B7DB8` |
| `--aria-nav` | `#3D3545` (dark) |

Borders and hover states are derived with `color-mix()` rather than hand-picked,
so they stay in-family when a base color is retuned.

### Cafe retints

A long block of `[data-theme="aria-cafe"]` overrides mutes saturated Tailwind
utility colors (`text-red-400`, `bg-amber-400/20`, `border-red-500/20`, …) to
printed-on-paper Solarized equivalents. This exists because status colors are
applied with raw Tailwind classes across many components; retinting centrally
was cheaper than tokenizing every call site.

Consequence worth knowing: **a new saturated Tailwind color used in a component
will look out of place in Cafe until it is added to that block.**

### Typography

- **Display / headings:** Lora (humanist serif), fallback Georgia.
- **Body:** system sans — `system-ui, 'Segoe UI', Roboto`.
- **Handwriting accents:** Caveat.

### Legacy classnames

These are pixel-era names kept deliberately for code stability. The names lie;
the styles are current. Do not rename them, and do not infer a pixel aesthetic
from them:

| Class / var | Actually is |
|-------------|-------------|
| `--font-pixel` | Lora serif |
| `.pixel-heading` | Lora section heading |
| `.pixel-card` | soft card, theme-tinted diffuse shadow |
| `.pixel-btn` | standard button, press effect |

### Motion

Page fade-in, steam wisps, floating bob, dot pulse, animated nav icons, and the
watercolor dunk celebration on task completion (5650ms — cut from 7100ms in
4.9.10 because it outlasted the satisfaction it was meant to deliver).

Watercolor tea assets are used throughout. Focus renders the tea-box metaphor:
bags are tasks, ordered morning→evening by `utils/ordering.js`.

---

## PWA

Installable, offline-capable, `vite-plugin-pwa` with `generateSW`. Current
precache: 45 entries / ~4.4 MB, mostly watercolor art.

Play Store wrapping is possible via Bubblewrap (Android TWA, $25); iOS via
Capacitor ($99/yr). Neither is done — see HANDOFF roadmap.

---

## Where to look next

| Question | File |
|----------|------|
| Architecture, file maps, what shipped when | `HANDOFF.md` |
| Current build state, open items | `SESSION.md` |
| Release process, conventions | `WORKFLOW.md` |
| Data-retention analysis | `docs/retention.md` |
