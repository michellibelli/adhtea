# Session bookmark
*Last wrap: 2026-05-19 — triage redesign closed at 4.0.0, R7 drag/pin follow-up shipped*

## State

Live commit: `f5180fd` (BUILD 4.0.0). BUILD chip on prod will read `4.0.0` after Vercel + Render finish.

Vercel + Render auto-deploy from `master`. CI runs 133 pytest tests on every push + PR.


## What shipped this session (2026-05-19)

| BUILD | What |
|---|---|
| **4.0.0** | Major-version bump marks end of triage redesign + start of next visual phase (tea-box on Focus, logo, bottom-nav cafe typography). |
| **R7 follow-up** | Full 7-day plan view is now interactive. `FullPlanView` items wrapped in `useDraggable` + day cards in `useDroppable`. Drag an item from one day to another → calls `pinTask(id, targetDate)` and refreshes layout. Per-item `★` button pins to today + auto-fills first empty top-3 slot. `slotsTouchedRef` added to prevent refresh-driven pre-population from clobbering the user's manual picks after a star/drag/recompute. 409 conflicts surface a friendly in-page banner ("Today already has 3 pins…"). Sensors match the `Today.jsx` pattern (`SmartPointerSensor` distance: 8, `TouchSensor` delay: 200). Backend untouched — `POST /triage/tasks/{id}/pin` already accepted any future date. |

## Bigger-picture state changes

- **Triage redesign closed.** Old tournament code deleted in 3.9.38. D+F hybrid surface (top-3 picker + collapsible 7-day plan with capacity bin-pack) is the only triage entrypoint.
- **Plan view is no longer read-only.** Drag-between-days + ★-to-today work from the disclosed grid. Pin-cap (3/day) enforced server-side; UI shows the violation rather than failing silently.
- **Manual slot picks survive refresh.** `slotsTouchedRef` blocks the layout-change pre-pop once the user has chosen anything — recompute / pin / star no longer wipe their top-3.

## Yesterday's shipped work (2026-05-18, R1–R7 + extras)

| BUILD | What |
|---|---|
| **R1** (b6a363e) | Explainable scoring engine. `score_components` JSON per task: priority, critical_bonus, overdue_boost, due_today, due_soon, project_stall, in_context, age_boost, push_penalty. WhyTooltip in UI renders each lever's contribution. |
| **R2** (8bffd21) | Capacity bin-pack + rolling 7-day window. Server auto-places tasks into days using priority + age + capacity budget; no manual ranking required. |
| **R3** (d3f0a84) | Pin top-3 endpoint + bin-pack respects pins. `Task.pinned_for` field; `MAX_PINS_PER_DAY = 3`. |
| **3.9.37** (e16abe7) | R4 — new column layout + score chip + pin button. Score chip opens WhyTooltip. |
| **3.9.38** (d784eed) | R5 stale prompt (push_count ≥ 5 surfaces delete / snooze-30d) + R6 retire old tournament (323 lines of Triage.jsx removed). |
| **3.9.39** (e3e02f4) | TaskCard always-visible snooze + edit + delete icon column. |
| **3.9.40** (c7eb696) | Modal portal + top-third positioning so dialogs never fall below the fold on mobile. |
| **3.9.41** (bc8157d) | Wider task cards + taller teabag, no text clipping. |
| **3.9.42** (2509dd6) | Domain-aware snooze (respects `next_allowed_date`) + capacity-bar ignores routines (was double-counting). |
| **3.9.43** (80704c1) | Morning check-in (mood + sleep + capacity) as hard gate before app access. |
| **3.9.44** (1444846) | R7 — top-3 picker as primary surface; full 7-day grid collapsed behind "Show full plan ↓" disclosure. Apply: pins all slotted tasks → 409 auto-resolves by unpinning displaced today-pins → re-attempts → runs `/triage/run` to bin-pack everything else. |

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
- `Today.jsx:144` optimistic update — `fetchTasks()` fallback is more robust than explicit revert.
- `tasks.py update_task` uses `date.today()` (server UTC) instead of `_app_today(user)` (user tz).
- Tournament.jsx:389 `useEffect(() => { refresh() }, [refresh])` — pre-existing react-hooks/set-state-in-effect lint error; mirrored in Waiting.jsx and several other pages.

## Where to resume

1. **Tea-box on Focus** — open `frontend/src/pages/Focus.jsx`. Cup/bag region is currently dunk-only (3.9.31 removed the persistent cup), so there's a clean canvas above or beside the active teabag.
2. **Bottom-nav reskin** — `frontend/src/components/BottomNav.jsx`. Uses `ui-nav` / `ui-primary` utilities already, so theming hooks exist.
3. **Logo** — `public/adhTeaLogo.png` is consumed by `index.html` and the PWA manifest; grep for `adhTeaLogo` before swapping.

## Local-only files NOT in repo

`docs/Secret Key.txt` and `docs/Server Stuff.txt` — gitignored. Keep out permanently.

## Commits this session (latest first)

```
f5180fd chore: BUILD 4.0.0 — R7 follow-up, drag/pin in 7-day plan view
```

Yesterday's commits (2026-05-18):
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
