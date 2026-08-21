# Data retention — analysis and proposed design
*Written 2026-08-20 (BUILD 4.13.1). **Design only — nothing here is implemented.***

## The problem

Nothing in the codebase ever deletes a Task row. Two writers generate rows on a
schedule, forever:

**Routine instances** — `generate_routine_instances`
(`backend/routes/task_lifecycle.py:113`) writes one `Task` row per active, due
`Routine` per app-day. Completed ones persist as `status=done`; ones she never
touched are soft-deleted at the 4am carry-forward (`status=deleted`, row stays).

**Calendar occurrences** — `sync_today_events` (`backend/routes/gcal.py:223`)
writes one appointment `Task` per Google Calendar occurrence.
`archive_past_appointments` (`task_lifecycle.py:264`) flips each to `done` once
its day passes — again, the row stays.

Neither has a purge. Soft-delete is the only deletion in the system, and
soft-deleted rows are never reaped.

### Rate

Roughly `active_routines × 365` rows/year, plus one per calendar occurrence. Six
active routines is ~2,200 rows/year before appointments. A daily standup on the
calendar adds ~260 more.

### Actual severity: low, but it is a slow leak

Single user on Supabase. Even at 5k rows/year this is small for Postgres and
nothing is near a free-tier ceiling. Two things do degrade, though, and they
degrade before storage does:

1. **CSV export usability.** Already hit. The first real export in 4.13.0 came
   back mostly machine-generated history, which is why 4.13.1 added `?types=`
   and `?since=`/`?until=`. That was a *presentation* fix layered over the
   growth; the underlying table keeps filling.
2. **Unindexed history scans.** `project_stall_map` (`scoring.py:60`) runs one
   `ORDER BY completed_at DESC LIMIT 1` **per project** on every capacity
   computation. That is an N+1 over a table that only grows.

So this is worth designing now and shipping when convenient — not an emergency.

---

## The binding constraint: what reads history

A purge must not starve any of these. Windows found by audit:

| Consumer | Location | Window it needs |
|---|---|---|
| Morning review | `routes/review.py:30` `_LOOKBACK_DAYS = 21` | **21 days** of `completed_at` |
| Weekly snapshots / PID I-term | `routes/insights.py:108` | per-day bounded, but **I-term escalation needs 3+ weekly snapshots** (HANDOFF, Phase 6 Week 2/3) |
| Project stall detection | `scoring.py:60`, `PROJECT_STALL_DAYS_THRESHOLD` | last completion per project — **unbounded lookback**, needs the most recent row to survive |
| Capacity / today counts | `selfcare.py:236`, `tasks.py:372` | today only |
| CSV export | `routes/export_csv.py` | **user expects everything** |

Two of these set hard floors.

**`project_stall_map` is the trap.** It asks "when did this project last see a
completion?" with no lower bound. Purge the last completed task of a dormant
project and the project silently flips to "no completions ever," falling through
to the `created_at` branch. A long-dormant project would keep reporting stalled —
same answer by luck — but a project completed once, long ago, then purged, would
be misclassified. **Any purge must exclude tasks with a `project_id`.**

**Export is a product question, not a technical one.** If she exports in
January expecting last year's data and a sweep ate it, the sweep was wrong
regardless of how correct the retention window was. Purged history must be
either genuinely worthless or preserved in aggregate.

---

## What is actually worthless

Not all history is equal. Ranked:

**Tier 1 — safe to delete, near-zero information.**
Soft-deleted routine instances (`task_type=routine`, `status=deleted`,
`project_id IS NULL`). These are the "generated, never touched, swept at 4am"
rows. They record only that a routine existed and she didn't do it that day —
and even that is recoverable in aggregate. This is likely **the majority of the
bloat.**

**Tier 2 — safe to aggregate, then delete.**
Completed routine instances (`status=done`). These carry real signal — adherence
over time — but the signal is a count per routine per day, not 21 columns of row.
A rollup table would preserve everything anyone actually asks of them.

**Tier 3 — do not touch.**
Anything with a `project_id`, anything `task_type=task` or `note` (she typed
those — they are hers), and anything inside the review/snapshot windows.
Auto-completed appointments sit at the boundary: machine-generated, but they are
a real record of where she was, and people do ask "when was that appointment?"
Treat as Tier 3 until she says otherwise.

---

## Proposed design

### Shape: lazy sweep, not a cron

Follow the pattern already in the codebase. `run_daily_rollover` is gated on an
atomic once-per-day guard, and the weekly snapshot is lazily computed on read.
There is no scheduler in this stack and Render's free tier sleeps — adding a
cron would add infrastructure to solve a problem that recurs once a day.

Hang the sweep off `run_daily_rollover`, behind its existing guard, gated to run
**at most once a month**:

```
User.purged_through : Date | None    # last date swept
```

Skip unless `today - purged_through >= 30`. Cost lands on one request a month.

### Retention windows

```
ROUTINE_DELETED_RETENTION_DAYS = 90    # Tier 1
ROUTINE_DONE_RETENTION_DAYS    = 365   # Tier 2, only after rollup
```

90 days on Tier 1 is deliberately generous against a 21-day review window and a
3-week snapshot requirement — roughly 4x the longest real consumer. There is no
reason to run closer to the edge; the rows are cheap and the failure is silent.

### Predicate

```sql
DELETE FROM tasks
WHERE owner_id = :uid
  AND task_type = 'routine'
  AND status   = 'deleted'
  AND project_id IS NULL
  AND scheduled_date < :cutoff
```

Note `scheduled_date`, not `completed_at` — swept rows never completed, so
`completed_at` is null on exactly the rows being targeted. `scheduled_date` uses
the **local-midnight** convention, so the cutoff must be built with `_day_start`,
**not** `_app_day_start_utc`. Getting this backwards is the recurring bug in this
codebase (it bit the review trigger in 4.11.6, and HANDOFF known-issue #6 exists
because of it). West of UTC the wrong helper is off by 7–8 hours — which for a
*deletion* means quietly eating an extra part-day of rows.

### Tier 2 rollup (defer to a second pass)

Before deleting completed routine instances, fold them into:

```
RoutineDayStat: user_id, routine_id, date, completed (bool)
```

One narrow row replaces one wide `Task`. Adherence history survives, export can
join against it, and the med/self-care adherence math keeps a source. **Ship
Tier 1 alone first** — it is most of the win for a fraction of the risk, and it
needs no new table.

---

## Testing

New `backend/tests/test_retention.py`:

- purges Tier-1 rows older than the window
- **leaves rows inside the window** (regression guard on the 21-day review floor)
- never touches `task_type` in (`task`, `note`, `appointment`)
- never touches a row with a `project_id` — *the `project_stall_map` guard*
- never touches `status=done`
- respects the monthly gate: two rollovers in one month sweep once
- tz correctness: a user at UTC-8 does not lose the boundary day
- `project_stall_map` returns the same answer before and after a sweep

That last one is the test that matters. It is the assertion that the sweep did
not change an answer the app gives.

---

## Recommendation

Ship **Tier 1 only**, at a 90-day window, behind the monthly gate, with the
`project_id IS NULL` exclusion and the full test list above. That removes the
majority of the accumulated rows, changes no answer the app currently gives,
requires no schema beyond one `Date` column, and leaves every user-authored row
untouched.

Defer Tier 2 until Tier 1 has run in prod for a month and the row counts confirm
the model. Revisit appointments only if she asks.

**Before implementing, get a real row count from prod** — `SELECT task_type,
status, count(*) FROM tasks GROUP BY 1,2`. This design assumes Tier 1 dominates.
If it doesn't, the window and the tiering should be re-argued rather than
implemented as written.
