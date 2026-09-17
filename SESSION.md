# Session bookmark
*Last wrap: 2026-09-17 — live BUILD 4.24.3, working tree clean, all pushed*

## START HERE

**Live/shipped:** 4.24.3, pushed to master, deployed (Vercel + Render), verified. Backend: 146/146
pytest pass. Frontend: `npm run build` clean.

**Nothing uncommitted, nothing known-broken.** The two carried-forward TODOs from the last wrap are
both resolved:
1. *"Still a nudge after hard refresh"* — root cause was hypothesis (1) from the prior wrap:
   `WeeklyInsightCard` was the actual culprit, not a caching artifact. Removed entirely (commit
   `9c6e2f6`, 2026-09-16) — combined with `NudgeModal`'s removal in 4.21.0, there is now no nudge/
   weekly-insight UI left anywhere in the app.
2. Cross-tier TeaBox drag (dragging a bag between stacked box tiers) — 4.23.0 shipped without an
   explicit manual-verification note in git history. 4.24.0 then rewrote tier sizing against real
   rendered width (`ResizeObserver`) on top of it; no drag-related bug reports followed in
   4.24.0–4.24.3. Treat as **probably fine but never explicitly signed off** — if TeaBox drag comes
   up again, this is the thing to actually test rather than assume.

## What shipped since the last wrap (build order)

- **4.23.0 (004c1aa)** — the TeaBox dynamic-capacity-sizing rewrite detailed in the previous wrap
  (stacked box tiers, routines additive after the capacity section, drawers hidden by default)
  shipped as-is.
- **fb221f7 (2026-09-16)** — routine time-bucket redesign (the feature scoped at the bottom of the
  last wrap's TODO list): `Routine.bucket` (First/Morning/Mid Day/Afternoon) replaces `due_time`
  sorting; `Task.difficulty` (easy/hard) Haiku-classified once at creation, cached, null reads easy.
  Appointment task type dropped in the same push (converts to `task_type=task` in the migration).
- **9c6e2f6** — `WeeklyInsightCard` removed; see "nudge" resolution above.
- **004c1aa / 4.23.0** and **c0c1062 / 4.24.0** — TeaBox tier capacity now measured from the box's
  actual rendered width via `ResizeObserver` instead of the old hardcoded 9-bag-per-tier guess.
  Kettle quick-add UX improved (blank-title ghost placeholder, no auto-critical-flag, inserts after
  the topmost routine instead of the absolute front). Morning review shows a
  "Routines: X/Y done" line. Diary prompt changed to a gratitude/self-like question per request.
- **c9bffc5 / 4.24.1** — PWA update-check staleness capped at ~20min.
- **52d7eba / 4.24.2, d975dfd / 4.24.3** — removed the tea box's over-capacity pill and then its
  "box full" self-care note too, per two follow-up requests. The box shows **no capacity messaging
  at all** now (the `(X/N)` slot chip still lives on the Today page, a separate surface). Dead
  `capacitySlots`/`daySlots` prop chain (`TeaBox` → `Focus` → `App`) cleaned up with it.

## Docs refreshed this session

`HANDOFF.md`, `PROJECT.md`, and `docs/time-tracking.md` were all stale relative to the repo (some
by 8 releases) and have been brought current as of 4.24.3. `docs/phases.md`, `docs/tests.md`, and
`docs/design.md` are original pre-pivot planning docs (last touched 2026-05-07) — rather than
rewriting them line-by-line to match a codebase that has since removed Triage, Google Calendar,
and most of the original Phase 4–6 plan, each now carries a short banner pointing to `HANDOFF.md`/
`PROJECT.md` as the current source of truth. `docs/retention.md` was already current (closed
2026-09-14, verdict: do not build).

## Lingering style/correctness items NOT fixed
(carried forward from prior sessions — still true, still low priority; paths updated after the
`routes/` reorg)
- `backend/routes/auth.py:75` `_make_session` no commit — caller-commits pattern.
- `backend/routes/auth.py:111` token expiry `>` vs `>=` — 1-second edge case.
- `backend/main.py:105,193` `is_owner` migration `MIN(id)` — one-time existing-DB.
- `backend/routes/task_lifecycle.py:256` `resolve_snoozes` `<=` race — sub-second window.
- `backend/routes/tasks.py:70,233,243,247` `== True/None` — `noqa`'d, SQLA translates to SQL `IS NULL`.
- `frontend/src/api/client.js` empty `catch (_) {}` blocks — eslint `no-empty`; CI runs pytest only.

## Deployment facts (not re-verified this session — check before relying on them)
Backend on Render Starter ($7/mo, no hibernation) since 2026-08-27. Vercel (frontend) + Render
(backend) auto-deploy independently from `master` — Vercel finishes in ~1 min, Render takes several
minutes longer, so a push that changes both frontend and backend contracts should be split or the
frontend held back until `bash scripts/deploy-check.sh` shows the backend healthy. See HANDOFF.md
for the full RELEASE GOTCHA writeup (BUILD file bump requirement, etc).

## Open, non-urgent

- Settings visual pass — pending since May.
- Deliberate deferred DELETE of orphaned `medication_schedules`/`medication_logs` prod rows
  (Projects-Stage-3-style: backup, preflight, human-reviewed SQL). Not to be done unilaterally.
- Phase 6 nudge UI is now fully gone (see above) — any future micro-nudge idea is a fresh product
  decision, not a resumption of the old PID escalation plan.
