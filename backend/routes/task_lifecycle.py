"""Task lifecycle engine — the scheduled-state sweeps that mutate tasks based on
the passage of time, extracted from routes/tasks.py so the route handlers stay
readable.

These functions are called lazily when the Today / Inbox / triage endpoints are
hit (there is no background scheduler). Each is idempotent and safe to run on
every request:

  - generate_routine_instances : spawn today's Task rows from active Routines
  - carry_forward              : yesterday's unfinished Today items → Inbox
  - resolve_snoozes            : snoozed items whose date arrived → Inbox
  - promote_due_tasks          : Inbox tasks due today → Today (within the cap)
  - demote_misclassified_today : Today tasks with a future due_date → Inbox
  - archive_past_appointments  : past appointments → done (stamped to their date)

plus the user-day/time helpers (`_app_today`, `_day_start`, …) they all share.
"""

from datetime import datetime, timezone, date, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from models import Task, TaskStatus, TaskType, Routine, RoutineFrequency, User


# ---------------------------------------------------------------------------
# User-day / time helpers
# ---------------------------------------------------------------------------

def _tz(user: User) -> ZoneInfo:
    return ZoneInfo(getattr(user, "timezone", None) or "America/Los_Angeles")


def _day_start_hour(user: User) -> int:
    return getattr(user, "day_start_hour", None) or 4


def _app_today(user: User) -> date:
    """Current calendar date in the user's timezone, rolling over at day_start_hour."""
    now = datetime.now(_tz(user))
    if now.hour < _day_start_hour(user):
        return now.date() - timedelta(days=1)
    return now.date()


def _day_start(user: User) -> datetime:
    """Naive datetime for midnight of user's current app-day (for DB comparisons).

    Local-midnight convention — matches how `scheduled_date` is stored. Do NOT
    compare this against `completed_at` (which is naive UTC); use
    `_app_day_start_utc` for that."""
    d = _app_today(user)
    return datetime(d.year, d.month, d.day, 0, 0, 0)


def _app_day_start_utc(user: User) -> datetime:
    """Naive-UTC instant at which the user's current app-day began (its
    day_start_hour boundary). For comparing against `completed_at`, which is
    stored as naive UTC. `_day_start` (local-midnight) is ~the tz offset off
    here and would drop yesterday-evening completions from the app-day."""
    d = _app_today(user)
    local = datetime(d.year, d.month, d.day, _day_start_hour(user), 0, 0,
                     tzinfo=_tz(user))
    return local.astimezone(timezone.utc).replace(tzinfo=None)


def _day_end(user: User) -> datetime:
    return _day_start(user) + timedelta(days=1) - timedelta(seconds=1)


# Hard cap on how many items may sit in Today. A plain task aimed at a full
# day is snapped to the next day instead; appointments and routines are
# time-bound and always admitted.
DAILY_CAP = 15


def count_today(user: User, db: Session) -> int:
    """Number of items currently in the user's Today list."""
    return (
        db.query(Task)
        .filter(Task.owner_id == user.id, Task.status == TaskStatus.today)
        .count()
    )


def _exempt_from_cap(task_type) -> bool:
    """Appointments and routines are time-bound — they bypass the daily cap."""
    return task_type in (TaskType.appointment, TaskType.routine)


# ---------------------------------------------------------------------------
# Routine instance generation — called lazily with carry_forward/resolve_snoozes
# ---------------------------------------------------------------------------

def _is_routine_due(routine: Routine, today_local: date) -> bool:
    wd = today_local.weekday()  # 0=Mon, 6=Sun
    f = routine.frequency
    if f == RoutineFrequency.daily:
        return True
    if f == RoutineFrequency.weekdays:
        return wd < 5
    if f == RoutineFrequency.weekends:
        return wd >= 5
    if f in (RoutineFrequency.weekly, RoutineFrequency.custom):
        if not routine.days_of_week:
            return False
        days = [int(d.strip()) for d in routine.days_of_week.split(',') if d.strip().isdigit()]
        return wd in days
    return False


def generate_routine_instances(user: User, db: Session):
    # Don't generate before the day officially starts
    now_local = datetime.now(_tz(user))
    if now_local.hour < _day_start_hour(user):
        return

    today_local = _app_today(user)
    today_dt = datetime(today_local.year, today_local.month, today_local.day)
    tomorrow_dt = today_dt + timedelta(days=1)

    active = db.query(Routine).filter(
        Routine.user_id == user.id,
        Routine.active == True,
    ).all()

    created = 0
    for routine in active:
        if not _is_routine_due(routine, today_local):
            continue
        exists = db.query(Task).filter(
            Task.routine_id == routine.id,
            Task.owner_id == user.id,
            Task.scheduled_date >= today_dt,
            Task.scheduled_date < tomorrow_dt,
            Task.status != TaskStatus.deleted,
        ).first()
        if not exists:
            db.add(Task(
                owner_id=user.id,
                title=routine.title,
                notes=routine.notes,
                task_type=TaskType.routine,
                status=TaskStatus.today,
                is_critical=routine.is_critical,
                routine_id=routine.id,
                scheduled_date=today_dt,
                due_time=routine.exact_time,
            ))
            created += 1
    if created:
        db.commit()


# ---------------------------------------------------------------------------
# Daily rollover — the once-per-day sweeps, run behind an atomic guard.
# ---------------------------------------------------------------------------

def run_daily_rollover(user: User, db: Session) -> bool:
    """Run the sweeps that only change at the day boundary — carry-forward, routine
    generation, appointment archival — at most once per app-day per user.

    These are triggered lazily from the read endpoints (there is no background
    scheduler), so without a guard two concurrent first-of-day page loads would
    both pass generate_routine_instances' exists-check and INSERT duplicate
    routine tasks. The guard is an atomic compare-and-swap on users.rolled_over_on:
    the UPDATE only matches when the stored date is behind today, so exactly one
    concurrent caller flips it and proceeds; the rest see 0 rows and skip.

    Intraday sweeps (resolve_snoozes, promote_due_tasks, the demotions) are NOT
    run here — they must run on every request and are already idempotent.

    Returns True if this call performed the rollover, False if it was already done.
    """
    today = _app_today(user)
    won = (
        db.query(User)
        .filter(
            User.id == user.id,
            (User.rolled_over_on.is_(None)) | (User.rolled_over_on < today),
        )
        .update({User.rolled_over_on: today}, synchronize_session=False)
    )
    db.commit()  # release the row lock so a losing concurrent caller re-reads and gets 0
    if not won:
        return False

    carry_forward(user, db)
    generate_routine_instances(user, db)
    archive_past_appointments(user, db)
    return True


# ---------------------------------------------------------------------------
# Carry-forward: move yesterday's incomplete Today items back to Inbox
# ---------------------------------------------------------------------------

def carry_forward(user: User, db: Session):
    # Don't carry forward before the new day officially starts
    now_local = datetime.now(_tz(user))
    if now_local.hour < _day_start_hour(user):
        return 0

    start = _day_start(user)
    stale = (
        db.query(Task)
        .filter(
            Task.owner_id == user.id,
            Task.status == TaskStatus.today,
            Task.scheduled_date < start,
        )
        .all()
    )
    for task in stale:
        if task.task_type == TaskType.routine and task.routine_id:
            task.status = TaskStatus.deleted
        else:
            task.status = TaskStatus.inbox
            task.scheduled_date = None
    if stale:
        db.commit()
    return len(stale)


# ---------------------------------------------------------------------------
# Demote stale Today tasks whose due_date is in the future.
# Fixes a class of bug where tasks got status=today (drag, batch, old code paths)
# but their due_date stayed in the future. They should not appear in Today.
# ---------------------------------------------------------------------------

def demote_misclassified_today(user: User, db: Session):
    today_local = _app_today(user)
    stale = (
        db.query(Task)
        .filter(
            Task.owner_id == user.id,
            Task.status == TaskStatus.today,
            Task.task_type != TaskType.routine,
            Task.due_date.isnot(None),
            Task.due_date > today_local,
        )
        .all()
    )
    for task in stale:
        task.status = TaskStatus.inbox
        task.scheduled_date = None
        task.sort_order = None
    if stale:
        db.commit()
    return len(stale)


# ---------------------------------------------------------------------------
# Archive past appointments: an appointment is date-and-time bound, so once
# its day has passed it is over. Auto-complete + archive it (same as any other
# completed task) so it stops bouncing between inbox and Today. completed_at is
# stamped to the appointment's own date, not now, so it archives as a past
# completion rather than landing in today's Done list.
# ---------------------------------------------------------------------------

def archive_past_appointments(user: User, db: Session):
    today_local = _app_today(user)
    stale = (
        db.query(Task)
        .filter(
            Task.owner_id == user.id,
            Task.task_type == TaskType.appointment,
            Task.due_date.isnot(None),
            Task.due_date < today_local,
            Task.status.notin_([TaskStatus.done, TaskStatus.deleted]),
        )
        .all()
    )
    for task in stale:
        task.status = TaskStatus.done
        task.scheduled_date = None
        task.sort_order = None
        if task.completed_at is None:
            d = task.due_date
            task.completed_at = datetime(d.year, d.month, d.day)
    if stale:
        db.commit()
    return len(stale)


# ---------------------------------------------------------------------------
# Snooze resolution: move snoozed items back to Inbox when their date arrives
# ---------------------------------------------------------------------------

def resolve_snoozes(user: User, db: Session):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    snoozed = (
        db.query(Task)
        .filter(
            Task.owner_id == user.id,
            Task.status == TaskStatus.snoozed,
            Task.snooze_until <= now,
        )
        .all()
    )
    for task in snoozed:
        task.status = TaskStatus.inbox
        task.snooze_until = None
    if snoozed:
        db.commit()
    return len(snoozed)


# ---------------------------------------------------------------------------
# Auto-promote: inbox tasks with due_date <= today move into Today list
# ---------------------------------------------------------------------------

def promote_due_tasks(user: User, db: Session):
    today_local = _app_today(user)
    due = (
        db.query(Task)
        .filter(
            Task.owner_id == user.id,
            Task.status == TaskStatus.inbox,
            Task.task_type != TaskType.routine,
            Task.due_date.isnot(None),
            Task.due_date <= today_local,
        )
        .all()
    )
    if not due:
        return

    # Daily cap: appointments always promote (time-bound); plain tasks only
    # promote while Today has room, otherwise they wait in the inbox.
    room = DAILY_CAP - count_today(user, db)
    promotable = []
    for task in due:
        if _exempt_from_cap(task.task_type):
            promotable.append(task)
        elif room > 0:
            promotable.append(task)
            room -= 1
    if not promotable:
        return

    existing_count = (
        db.query(Task)
        .filter(Task.owner_id == user.id, Task.status == TaskStatus.today)
        .count()
    )
    start = _day_start(user)
    for i, task in enumerate(promotable):
        task.status = TaskStatus.today
        task.scheduled_date = start
        task.sort_order = float(existing_count + i)
    db.commit()


