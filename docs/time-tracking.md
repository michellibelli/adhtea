# Billable time tracking — analysis and proposed design
*Written 2026-08-27 (BUILD 4.13.1).*

> **2026-09-14 (4.18.0) — shipped, but much leaner than this design.** What actually landed:
> `Task.minutes_spent` (nullable int) plus a new first screen in `EODGate` — today's done tasks
> with a per-row minutes input, autosaved via the existing generic `PATCH /tasks/{id}` — and a
> "Copy for boss" button that builds `Title - Xm` lines + a total onto the clipboard. **No Matter
> table, no TimeEntry table, no hard gate, no auto-email** — none of that below this point was
> built. Treat everything past here as background on *why* (billable hours, fail-closed reasoning,
> the employer's undefined process) rather than a spec to resume. If a hard gate or auto-email is
> ever revisited, it's a fresh build against the current schema, not a continuation of this one.

## The problem

the user needs to record time spent on work in order to be paid. Today the app
records *what* was finished and a coarse `Effort` tag (`small` / `big`), but no
durations and no billing dimension. The number that goes to payroll is currently
reconstructed outside the app.

Two consumers, one dataset:

**Payroll** — regular, weekly, hours only, a fixed format she submits to her
employer. She is not invoicing; the app is the record, submission is manual.

**"How much have we spent on project X?"** — irregular, arrives ad hoc from her
employer, any date range. Her employer has no defined process for this and no
cost-code scheme. She is free to define the categories for her own convenience,
with the standing risk that they later impose a scheme of their own.

Equipment spend is explicitly **out of scope** — it is tracked by invoice
elsewhere and is not part of this project.

## Capture: retrospective, not a timer

A live start/stop timer is the obvious design and the wrong one here. It fails
in exactly the way this user's day fails: an untapped start or a forgotten
running timer silently loses a block, and the loss is invisible until payroll.

The morning review already implements retrospective reconstruction and has been
running in production since 4.11.0. It:

- finds the newest *unreviewed* activity-day via the `User.reviewed_through`
  watermark (`backend/routes/review.py`), self-healing across weekends and sick
  days;
- lists that day's finished tasks with a pre-guessed tag she only has to correct;
- accepts tasks she did that were never in the app (`ReviewCommitRequest.added`),
  backdating them to local noon of the reviewed day;
- commits through the localStorage queue added in 4.11.3, so a cold Render
  backend cannot silently drop the write.

Time capture replaces the controls on those same rows rather than adding a new
surface — the `small`/`big` buttons become an hours field and a dismiss control
(see "Row design" below). Building a second capture path would create a second
thing to forget.

A secondary "log time" action on any task from Today covers same-day capture.
Same durable write path. Still not a timer.

## Schema

Two new tables. New tables are picked up by `create_all`; only seeding the
initial Matter list needs a one-time step. No `ALTER` migration required.

```
Matter      id, user_id, name, parent_id (nullable self-FK),
            external_code (nullable), active, sort_order, created_at

TimeEntry   id, user_id, task_id (nullable FK), matter_id (FK, NOT NULL),
            work_date (Date), minutes (Integer), description, notes,
            source (review|manual|edit), locked_at (nullable),
            created_at, updated_at

EmailOutbox id, user_id, to_address, subject, body, status
            (pending|held|sent|failed), hold_until, attempts, last_error,
            sent_at, created_at
```

`Task.time_exempt` (Boolean, default false) records the "not work" dismissal that
satisfies the hard gate. `Matter.billable` (Boolean, default true) is a reporting
convenience only — it is **not** the privacy control; see "Why the direction of
the default matters" below.

`User.report_email` holds the office manager's address; `User.report_enabled`
turns sending off without deleting the address.

### Why `TimeEntry` is a table and not columns on `Task`

One task spanning three days is three billable rows. Hours-on-task cannot
represent that, and both outputs need per-day rows. A separate table also lets a
single task touch two matters, and keeps corrections auditable.

### Why the indirection layer

`Matter.name` is hers — stable, chosen for her convenience. `Matter.external_code`
is her employer's label: nullable, freely editable, decoupled from the name.
When they eventually invent or change a scheme, she edits ~10 Matter rows rather
than hundreds of `TimeEntry` rows. That single column is the entire defense
against their process changing.

`Matter.parent_id` gives two levels (Program → Project). Reorganizations rarely
scramble categories; they ask you to roll up or drill down, and two levels
absorbs both. One nullable column now avoids a migration later.

No `is_capex` flag. Her employer folds some of this into capital expenditure,
but has not defined which — hardcoding a boolean would bake in a guess about a
classification that does not exist yet. `parent_id` and `external_code` do that
grouping and bend when the scheme changes.

### Why `TimeEntry.description` is a snapshot

Copied from the task title at creation, editable afterward. A billing record must
not mutate when a task is renamed or deleted weeks later. The `task_id` FK stays
for context and gap detection, but the record stands on its own — which is also
what makes re-bucketing historical time into an imposed scheme readable work
rather than guesswork.

Matters are never deleted, only deactivated. A merge route reassigns every entry
from one matter to another in a single operation, for the inevitable discovery
that two matters are the same thing.

## Correctness constraints

These four decide whether the number is trustworthy. They are the point of the
feature.

**1. `work_date` is a plain `Date` on the local-midnight convention** — never a
naive-UTC datetime. HANDOFF names this bug class ("Naive-UTC vs. local-midnight
boundaries"); it bit the morning review in 4.11.6 and `export_csv.py` carries the
warning at the top of the file. A timesheet is the highest-stakes place in the
app to get it wrong: an entry stamped 6pm Pacific in UTC lands on the wrong day,
the wrong day is the wrong week, and the wrong week is the wrong paycheck.

**2. Every write goes through the localStorage queue**, mirroring the 4.11.3
`commitReview` fix. Render's free tier hibernates; a write against a sleeping
backend must enqueue and flush, never throw into a swallowed `catch`. This is the
exact failure that made the review resurface the same Monday for a week.

**3. `reviewed_through` alone will lose billable time.** The watermark advances on
Continue whether or not hours were entered, so a skipped row means that day never
resurfaces. Two defenses, and both are wanted: the **hard gate** below stops the
day being skipped in the first place, and a **gap report** on the timesheet flags
any day in the window that has completed work-tagged tasks and zero time entries.
The watermark stays forward-only; the gap list catches whatever the gate misses
(days that predate the feature, days older than the gate's enforcement window,
entries deleted later).

**4. Matter is required at submit, not at capture.** A hard required field on the
capture form is friction at the exact moment she is trying to log quickly. A
seeded `Unsorted` matter accepts entries instantly; week submission is blocked
while anything still sits in it. Capture never blocks, nothing is lost, and the
grouping still comes out clean.

This does **not** conflict with the hard gate below. The gate blocks on *hours
having been assigned*; the matter can still land in `Unsorted` and be sorted
later. Assigning a duration is a memory task that decays within hours; choosing a
category is not.

## The hard gate

Requested explicitly: if one or more tasks are in a **done-but-untimed** state,
timing them is mandatory before proceeding into the app.

Scope is one app-day at a time — the review already selects a single unreviewed
day, and `_LOOKBACK_DAYS = 21` bounds how far back it will reach. The gate must
never present two weeks of accumulated untimed tasks as a single wall; that is
the version of this that ends with the app being avoided rather than used.

### Row design — affirmative entry, fail closed

The existing review row (title + `small`/`big` buttons) becomes:

```
[ task title ............... ] [ 1.5 h ] [ ✕ ]
```

- **Empty and not dismissed** → unresolved. Submit stays disabled.
- **Hours entered** → work. Billable, eligible to appear in the report.
- **✕** → not work. Persisted as `Task.time_exempt` so the gate does not re-ask
  tomorrow. Must be **undoable** — a mis-tap cannot be allowed to permanently
  drop billable time.
- Added rows (work that was never in the app) take the same shape and rules.

The disabled submit button *is* the hard gate. No separate blocking screen is
needed.

Most done tasks are not billable — medication, laundry, chores, errands, the
whole self-care surface — so the dismissal has to be one tap and always present.
A gate demanding billable hours on "take out trash" is unusable within a week.

### Why the direction of the default matters

Nothing is billable until she affirmatively types a number into it. Silence means
not-work, permanently.

This is the inverse of a "mark it non-billable" design, and it is the reason the
report is safe. Under a flag-based design every done task produces a row and a
filter decides what gets sent, so that filter has to stay correct forever. Here a
personal task never produces a `TimeEntry` at all — the report selects from a
table that structurally cannot contain anything she did not type a number into.
There is no filter to get wrong and no `WHERE` clause a later refactor can
silently widen.

`Matter.billable` is consequently **not** a privacy control. It survives only as
a convenience for excluding internal admin time from a report. The privacy
guarantee lives in the data model.

### Effort buttons are safe to remove

`Task.effort` is written only by the review and read only by `export_csv.py` and
`review_engine`'s own learning loop. Nothing in capacity or scoring reads it —
the budget uses a constant task weight, not per-task effort. Derive `effort` from
the entered hours (`<1h` → `small`) to keep the CSV column meaningful and avoid a
migration.

`review_engine` keeps the greeting and loses its classification job.
`EffortExample` becomes dead weight to clean up.

### No escape hatch — deliberately

An earlier draft of this document argued for a "can't do this now" deferral
escape, on the grounds that this codebase has a history of day-boundary gate
misfires (the self-care gate silently not firing in `7901d87`; the review
resurfacing the same Monday for a week in 4.11.3; the tz-boundary misfires in
4.11.6) and that the same bug class behind a *blocking* gate would lock the user
out of her own app.

That argument was written before the row design above and does not survive it.

**The dismiss control is the escape.** Every row has a one-tap resolution that
requires no data, no recall, and no correctness on the app's part. There is no
reachable state where a row cannot be cleared, so there is no lockout to break
out of.

**An escape would also defeat the feature's purpose.** This page is the step that
turns work into money in her bank account. A "skip this day" link is exactly what
gets tapped at 7am when she is already late, after which the day falls to the gap
report and realistically never gets done — the precise money-losing failure the
gate exists to prevent. The usual argument for an escape assumes a gate standing
between the user and something she wants; here the gate *is* the thing she wants.

Two safeguards replace it. Both fix the real failure modes rather than routing
around them:

**1. The gate clears on local state, never on server acknowledgment.** This is
the one that could genuinely have caused a lockout. If submit waits on a backend
confirmation, a hibernating Render instance means every row is resolved and the
button is still dead. Resolution is a client-side fact; the write goes to the
localStorage queue and flushes whenever the server returns. Same pattern as
`commitReview`.

**2. What is blocking submit must always be visible.** The realistic bad state is
not an unresolvable row but an *invisible* one — a row held in state that is not
rendered, leaving submit disabled with nothing on screen to fix. A `2 of 7 timed`
counter plus scroll-to-first-unresolved makes that state impossible to hide.

### Bound the backlog

A week away must not produce seven gates in sequence. The gate enforces the most
recent day or two; older unreviewed days fall through to the gap report
un-gated. That is a limit on the gate's scope, not an escape from it.

## Automated report to the office manager

Requested: after each retro timing block, send a very simply formatted email to
the office manager.

**There is no email infrastructure in this codebase today.** `User.notification_morning`
and `notification_evening` are stored settings that nothing reads; the Twilio /
SendGrid escalation in the Phase 6 roadmap was never built. This is net-new:
provider account, API key as a Render env var, domain authentication, an outbox
table, and a retry worker.

### A task with no affirmative time is never sent, ever

This database holds medication logs, self-care entries, mood scores, sleep hours,
and personal task titles. None of it may reach an employer.

The rule is absolute and structural: **the report is built only from `TimeEntry`
rows.** A task that was dismissed, skipped, or never resolved has no `TimeEntry`,
so there is nothing to select. It cannot be sent by any code path, present or
future.

Never build the report by querying `Task` and filtering. The safety property here
comes from the source table, not from a condition — a query over `Task` puts a
`WHERE` clause between personal data and an employer's inbox, and that clause has
to stay correct through every future refactor. Selecting from `TimeEntry` needs
no such guarantee.

A dedicated test should assert that a done task with no entry, and a dismissed
task, both produce an empty report.

### Content: matter totals, not task lines

`Project A — 3.2h` answers the question that was actually asked. Task-level lines
add leak surface and a level of detail nobody requested. Task descriptions can
become an opt-in per matter if the employer turns out to want them.

Plain text, dashes, no preamble.

### Auto-send with a hold window, not an approval step

Requiring manual approval on every block defeats the point of automating it. The
send is instead **queued with a short cancellable hold** (a few minutes) and
fires on its own if ignored. It stays automatic; a fat-fingered 40-hour entry
does not reach the employer before it can be caught.

### Debounce

Timing five backfilled days in one sitting must produce **one** message, not
five. Coalesce per sitting, or send a fixed-time daily digest.

### Failure must be loudly visible

An `EmailOutbox` table with status and retry, surfaced in the UI. Mirrors the
localStorage queue philosophy, server-side. The dangerous state is not a failed
send — it is the user *believing* something was reported when it was not, which
is what becomes a payroll dispute.

### Deliverability is a real risk

Mail from `adh-tea.fun` to a corporate mail server is a plausible spam-folder
candidate. Needs a transactional provider (Resend or Postmark), DKIM/SPF on the
domain, `reply-to` set to her real address, and a one-time whitelist by the
recipient. A weekly report that silently lands in spam is worse than no report,
because it is believed to have been delivered.

Recipient address lives in Settings. Never hardcoded.

## Rounding

Store `minutes` as an exact integer. Round to 0.1h (6 minutes, the increment she
bills at) at **report** time, on the **per-day-per-matter sum** — never per entry.
Rounding each entry and then summing inflates the total: six 7-minute entries
round to 0.6h individually against a true 42 minutes = 0.7h, and the error drifts
both directions as the entry count changes. Storing exact minutes also means the
rounding policy can change later without the underlying data having been
destroyed.

## Duration pre-guess — deliberately not built

An earlier draft pre-filled each row with a guessed duration, on the same
friction-removal logic that made the small/big pre-guess work.

That was wrong here. A pre-guessed `small`/`big` tapped past cost nothing. A
pre-filled *number of hours* tapped past is a fabricated billing figure sent to
an employer under her name. A pre-filled value is not an affirmative entry, which
is the property the whole design rests on.

Every number is typed. The hours field starts empty and stays empty until she
puts something in it.

## Outputs

**Timesheet page** — week grid, days × matters, per-day totals, per-matter
totals, week total. Inline edit. `Submit week` stamps `locked_at`, so a later
edit to a submitted week is visible as an amendment rather than a silent rewrite;
if payroll questions a number she knows what she actually sent.

**Matter report** — pick a matter (at either level of the hierarchy), pick a date
range, get total hours. Ad hoc by nature, so it takes a date-range picker rather
than a week grid.

**`/export/timesheet.csv`** — mirrors `routes/export_csv.py` exactly, including
the `utf-8-sig` BOM, CRLF line terminator, and the exposed `Content-Disposition`
header. Columns: `date, matter, external_code, description, hours, notes`.

## Phases

| Phase | Work |
|-------|------|
| 0 | Define the initial Matter list (hers, for her convenience) |
| 1 | `Matter` + `TimeEntry` models, CRUD routes, merge route, tests |
| 2 | MorningReview rows gain hours + matter; durable queue; gap detection |
| 3 | Hard gate — done-but-untimed blocking, "not work" dismissal, deferral breaker |
| 4 | Timesheet week grid — edit, totals, submit/lock |
| 5 | Matter report — date range, hours |
| 6 | `/export/timesheet.csv` |
| 7 | Email — provider, domain auth, outbox, billable-only filter, hold window, digest |
| 8 | `EffortExample` / classification cleanup in `review_engine` |

Phases 1–3 produce a trustworthy number that is hard to skip. 4–6 make it
pleasant. 7 is the largest single phase and the only one with an external
dependency and a third-party recipient.

Build order matters: the gate (3) should not ship before the gap report (2), and
the email (7) must not ship before the timesheet (4) has been used enough to
trust the numbers it would be reporting. Automating the delivery of a number
nobody has checked yet is how a bad number reaches an employer on a schedule.

Roughly six working sessions.

## Explicitly not building

Rates, invoices, approval workflow, multi-user, equipment or expense tracking,
live start/stop timer.

## Open questions — none block Phase 1

- Does her employer define the week as Mon–Sun or Sun–Sat? Affects Phase 4 only.
- Any overtime threshold that needs to surface? Affects Phase 4 only.
- Do they want `external_code` on the exported line items, or matter names alone?
  Affects Phase 6 only.
- **Per-sitting message or daily digest?** A fixed-time digest reads as a routine
  report rather than a stream of notifications. Affects Phase 7.
- **Matter totals only, or task lines too?** Totals-only recommended, for the leak
  surface. Affects Phase 7.
- **Where does the matter picker live?** Keeping the review row to two controls
  (hours + dismiss) protects gate compliance; matter could be assigned on the
  timesheet instead, or sit inline with a sticky default. Affects Phases 2–4.

## Side benefit

Measured durations are strictly better capacity data than a two-value `small` /
`big` tag. Once Phase 6 has a few weeks of real minutes, the capacity budget that
drives the Today slot count (`BASE_BUDGET_UNITS` in the `/capacity/today`
calculation) could read from measured time instead of the current guess.
