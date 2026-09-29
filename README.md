# adhTea

A personal ADHD productivity app — not a generic to-do list. It's built around ADHD cognition: low-friction capture, capacity-aware daily planning, foundation-habit tracking (sleep, meals, meds, mood), and a daily triage flow that surfaces the one next action worth doing *now*, weighted by priority against actual current capacity.

Live at [adh-tea.fun](https://adh-tea.fun).

## Stack

- **Backend:** FastAPI, SQLAlchemy, PostgreSQL (prod) / SQLite (dev), bcrypt + opaque session tokens, `slowapi` rate limiting, deployed on Render.
- **Frontend:** React, Vite, PWA (offline-capable, installable), deployed on Vercel.
- **AI:** Anthropic Claude (Haiku) for daily task classification and morning-review summaries, with a keyword-heuristic fallback so the core flow never blocks on an LLM call.

## Notable engineering

- **Offline-first queue.** Writes made while offline queue in `localStorage` and self-heal on reconnect — see `HANDOFF.md`'s incident notes on the queue-hardening pass (silently-dropped-write bug, health-check-driven flush).
- **Capacity model.** Daily task surfacing is driven by a capacity calculation (sleep, self-care inputs) rather than a static priority list — see `PROJECT.md` for the design rationale and `docs/design.md` for the system behind it.
- **Iterative feature removal.** The commit history includes as much subtraction as addition — several shipped features (nudge popups, weekly insights, daily-cap sliders) were built, used, and then deliberately removed once real usage showed they weren't earning their complexity. `HANDOFF.md` keeps the record of what was tried and why it was cut.

## Docs

- `HANDOFF.md` — architecture, file map, deployment, known issues, roadmap (source of truth).
- `PROJECT.md` — design philosophy and design system.
- `SESSION.md` — rolling development log.

## Status

This is a working solo project built and actively used day-to-day, not a maintained open-source library — published as a portfolio piece. Issues and PRs aren't actively monitored.
