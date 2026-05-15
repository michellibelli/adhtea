# Session bookmark
*Last wrap: 2026-05-15 — Claude-assisted session, second wrap of the day*

## State

Live commit: `5f5b069` (tournament snooze sheet). BUILD chip on prod
should read `3.9.6` once Vercel deploys this `[wrap]` commit (no version
bump on the wrap itself unless code follows).

Vercel + Render both deploying from `master` on push. `gh` and `vercel`
CLIs linked. `~/.aria-token` good for ~29 more days.

## What shipped this session (second half of the day)

PR | What
---|---
**#9**  `aaae7dd` | tournament blank screen — useEffect after early return (rules-of-hooks)
**#10** `9ccc501` | regular Triage skips routines and appointments
**#12** `40abe2a` | demote status=today tasks whose due_date is in the future (one-time sweep + on every GET /tasks/today)
**#13** `3d4a81a` | tournament includes all inbox tasks (drop the due_date filter that was hiding the demoted backlog)
**#14** `99764b0` | triage campaign — full re-rank with user-configurable daily caps. New `User.max_tasks_per_day` (5–15, default 10) + `User.max_total_per_day` (10–20, default 15) columns. `POST /tasks/tournament/start` resets placements. Settings → Daily limits sliders.
**#15** `90a517e` | Focus refetches Today after pushing edited task to future day
**#16** `635265c` | `ConfirmModal` (tea-themed, no more browser confirm()) + `ProjectBadge` (🌱 amber pill) rendered everywhere a task appears (TaskCard, TournamentCard in Triage, Tournament TaskTile, AllTasks row). Delete button + ConfirmModal added to AllTasks rows.
**#17** `37c8baf` | tournament submit 500 fix (`today_start()` → `_day_start(user)`) + drag-to-reorder (replaces tap-to-rank). Whole-card drag target. Explicit "Confirm this round" button.
**#18** `9416cbf` | drop the ⋮⋮ drag-handle glyph (visual was misleading — drag worked everywhere)
**#19** `59afd43` | tournament card ✓ "already done" button — completes a task mid-triage so it lands in the Done-today list
**#20** `5f5b069` | tournament 🌙 snooze opens SnoozeSheet picker (tomorrow / EOW / next week / pick date) instead of hard-coded 1-month

BUILD: `3.8.5 → 3.8.6 → 3.8.7 → 3.8.8 → 3.9.0 → 3.9.1 → 3.9.2 → 3.9.3 → 3.9.4 → 3.9.5 → 3.9.6`

## Bigger-picture state changes

- **Tournament is the primary triage flow for overflow days.** Classic Triage still exists for daily decisions on a manageable-size today list (≤7 items by default), but when today is overloaded the user runs "Triage all" from Today's header or Settings → "Triage tournament 🍵". Both entry points show a tea-themed ConfirmModal before resetting.
- **Reset-on-start semantics.** Campaign mode clears `status=today/snoozed`, `scheduled_date`, `sort_order`, `snooze_until`, and `due_date` for all incomplete user tasks (task_type=task). Routines + appointments are never touched. User then re-ranks from scratch.
- **Both caps are user-controlled in Settings.** Slider auto-saves on pointerup via `PATCH /me/settings`.

## Open issues (6)

```
#2  enhancement   UptimeRobot ping not set up
#3  bug           TriageCard lacks inline edit (pencil)
#4  enhancement   Google Calendar: multi-calendar selection UI
#5  enhancement   Loading / error skeleton states
#7  enhancement   Build chip: add Settings section to toggle/customize
#11 enhancement   Data security audit — medicine and other PII
#21 bug           Google Calendar sync misses appointments on non-primary calendars
```

Closed this session: #1 (E2E verify — exercised), #6 (snooze date picker — shipped), #8 (workflow docs — shipped), #9, #10, #12, #13, #14, #15, #16, #17, #18, #19, #20.

## Where to resume

Suggested order of value:
1. **#21 + #4 together** — multi-cal picker would land us a UX win and a debug surface that resolves the missing-appointment bug. Probably one branch.
2. **#3** — small, quick parity fix (TriageCard pencil edit).
3. **#5** — broader UX win (skeleton loaders + error UI). Can be partial.
4. **#2** — UptimeRobot — 5-minute external setup, not code.
5. **#7** — Build chip Settings section — defer until you actually want to fiddle with it.
6. **#11** — data security audit — sizable. Schedule a dedicated session.

## Notes for next session

- **Tournament flow is sensitive to backend caps**. If you adjust `_find_target` behavior, also check that targets advance correctly mid-round in `tournament_submit` (it re-evaluates per task — see commit body of #14).
- **`_day_start(user)` not `today_start()`** is the correct helper. Latter doesn't exist; will 500 the route. PR #17 fixed two call sites.
- **All "are you sure?" prompts should use `ConfirmModal`** going forward. `confirm()` calls remaining: none in current source (grep clean).
- **ProjectBadge usage**: pass `task.project_name`; renders nothing when null. Use `size="xs"` in dense lists, default `sm` on cards.
- **Drag-to-rank in Tournament**: dnd-kit `SmartPointerSensor` blocks drag activation on inputs/textareas/buttons/labels. Drag is whole-card. Corner buttons stop propagation so taps work.
- **GCal sync was clean (no errors) but produced 0 events** — likely calendar selection (see #21 + #4).

## Async-team workflow (recap)

Each work session:
1. `git fetch && git log --oneline HEAD..origin/master` (see other-session pushes)
2. `gh pr list` (in-progress branches)
3. `gh issue list --state open` (queue)
4. `bash scripts/deploy-check.sh` (live state)
5. `cat SESSION.md` (this file)

Each commit on master also bumps the `BUILD` file. Branch + draft PR per non-trivial change. Squash-merge to master.
