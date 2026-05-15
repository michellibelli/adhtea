import json
from datetime import datetime, timezone, date, timedelta
from typing import Optional
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from sqlalchemy import or_, and_
from database import get_db
from models import (
    Task, TaskStatus, TaskType, Priority, ActuatorCategory,
    Routine, RoutineFrequency, GoogleCalendarToken, utcnow, User,
    Project, Domain,
)
from schemas import (
    TaskCreate, TaskUpdate, TaskResponse,
    TaskSnoozeRequest, ScheduleTodayRequest, TaskReorderRequest,
    ActuatorCategoryCreate, ActuatorCategoryResponse,
)
from routes.auth import get_current_user
from routes.domain_utils import next_allowed_date

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tz(user: User) -> ZoneInfo:
    return ZoneInfo(getattr(user, "timezone", None) or "America/Los_Angeles")

def _day_start_hour(user: User) -> int:
    return getattr(user, "day_start_hour", None) or 6

def _app_today(user: User) -> date:
    """Current calendar date in the user's timezone, rolling over at day_start_hour."""
    now = datetime.now(_tz(user))
    if now.hour < _day_start_hour(user):
        return now.date() - timedelta(days=1)
    return now.date()

def _day_start(user: User) -> datetime:
    """Naive datetime for midnight of user's current app-day (for DB comparisons)."""
    d = _app_today(user)
    return datetime(d.year, d.month, d.day, 0, 0, 0)

def _day_end(user: User) -> datetime:
    return _day_start(user) + timedelta(days=1) - timedelta(seconds=1)


def own_task(task_id: int, user: User, db: Session) -> Task:
    task = db.query(Task).filter(Task.id == task_id, Task.owner_id == user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


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
# Carry-forward: move yesterday's incomplete Today items back to Inbox
# Called lazily when the Today/Inbox endpoints are hit
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
    existing_count = (
        db.query(Task)
        .filter(Task.owner_id == user.id, Task.status == TaskStatus.today)
        .count()
    )
    start = _day_start(user)
    for i, task in enumerate(due):
        task.status = TaskStatus.today
        task.scheduled_date = start
        task.sort_order = float(existing_count + i)
    db.commit()


# ---------------------------------------------------------------------------
# Triage summary — inbox count + today's load level (used by the triage page
# to show a live load indicator as items are scheduled)
# ---------------------------------------------------------------------------

WEIGHT_VALUES = {"light": 1, "medium": 2, "heavy": 3}

def load_level(tasks):
    if not tasks: return "clear"
    s = sum(WEIGHT_VALUES.get(str(t.weight.value if hasattr(t.weight, 'value') else t.weight), 2) for t in tasks)
    if s <= 6:  return "light"
    if s <= 12: return "manageable"
    if s <= 18: return "heavy"
    return "overloaded"


@router.get("/tasks/triage-summary")
def triage_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    carry_forward(current_user, db)
    resolve_snoozes(current_user, db)
    generate_routine_instances(current_user, db)
    inbox_count = db.query(Task).filter(
        Task.owner_id == current_user.id, Task.status == TaskStatus.inbox
    ).count()
    today_tasks = db.query(Task).filter(
        Task.owner_id == current_user.id,
        Task.status == TaskStatus.today,
        Task.scheduled_date >= _day_start(current_user),
        Task.scheduled_date <= _day_end(current_user),
    ).all()
    return {
        "inbox_count": inbox_count,
        "today_count": len(today_tasks),
        "load_level": load_level(today_tasks),
    }


# ---------------------------------------------------------------------------
# Critical list — shown when triage is skipped (low-focus fallback)
# Returns: urgent tasks + today's appointments + is_critical routine instances
# ---------------------------------------------------------------------------

@router.get("/tasks/critical-list", response_model=list[TaskResponse])
def get_critical_list(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    carry_forward(current_user, db)
    resolve_snoozes(current_user, db)
    generate_routine_instances(current_user, db)
    today_local = _app_today(current_user)
    active_statuses = [TaskStatus.inbox, TaskStatus.today]
    tasks = (
        db.query(Task)
        .filter(
            Task.owner_id == current_user.id,
            Task.status.in_(active_statuses),
            or_(
                Task.priority == Priority.urgent,
                and_(
                    Task.task_type == TaskType.appointment,
                    Task.due_date == today_local,
                ),
                and_(
                    Task.task_type == TaskType.routine,
                    Task.is_critical == True,
                    Task.scheduled_date >= _day_start(current_user),
                    Task.scheduled_date <= _day_end(current_user),
                ),
            ),
        )
        .order_by(Task.due_time.asc().nullslast(), Task.created_at.asc())
        .all()
    )
    return tasks


# ---------------------------------------------------------------------------
# Capture (create task into Inbox)
# ---------------------------------------------------------------------------

@router.post("/tasks", response_model=TaskResponse)
def create_task(
    body: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today_local = _app_today(current_user)
    due_today = body.due_date is not None and body.due_date <= today_local

    if due_today:
        existing_count = (
            db.query(Task)
            .filter(Task.owner_id == current_user.id, Task.status == TaskStatus.today)
            .count()
        )

    due_date = body.due_date
    if due_date and body.project_id:
        project = db.query(Project).filter(Project.id == body.project_id).first()
        if project and project.domain_id:
            domain = db.query(Domain).filter(Domain.id == project.domain_id).first()
            if domain:
                due_date = next_allowed_date(due_date, json.loads(domain.rules or "[]"))

    task = Task(
        owner_id=current_user.id,
        title=body.title.strip(),
        notes=body.notes,
        task_type=body.task_type,
        status=TaskStatus.today if due_today else TaskStatus.inbox,
        scheduled_date=_day_start(current_user) if due_today else None,
        sort_order=float(existing_count) if due_today else None,
        actuator_category_id=body.actuator_category_id,
        project_id=body.project_id,
        is_critical=body.is_critical,
        due_date=due_date,
        due_time=body.due_time,
        location_type=body.location_type,
        location_detail=body.location_detail,
        tags=body.tags,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


# ---------------------------------------------------------------------------
# Google Calendar lazy morning sync helper
# ---------------------------------------------------------------------------

def _maybe_sync_gcal(user_id: int, db: Session):
    token = db.query(GoogleCalendarToken).filter(
        GoogleCalendarToken.user_id == user_id
    ).first()
    if not token:
        return
    # Re-sync at most every 30 minutes so new calendar events appear without manual sync
    if token.last_synced:
        elapsed = (datetime.now(timezone.utc).replace(tzinfo=None) - token.last_synced).total_seconds()
        if elapsed < 1800:
            return
    try:
        from routes.gcal import sync_today_events
        sync_today_events(user_id, db)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Backlog — all active tasks (inbox + today + snoozed) for timeline view
# ---------------------------------------------------------------------------

@router.get("/tasks/bonus", response_model=list[TaskResponse])
def get_bonus_tasks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Future-dated inbox tasks + snoozed items — shown in Focus when today's list clears."""
    today = date.today()
    tasks = (
        db.query(Task)
        .options(joinedload(Task.project))
        .filter(
            Task.owner_id == current_user.id,
            Task.status.in_([TaskStatus.inbox, TaskStatus.snoozed]),
            Task.task_type != TaskType.routine,
            or_(
                and_(Task.status == TaskStatus.inbox,  Task.due_date > today),
                Task.status == TaskStatus.snoozed,
            ),
        )
        .order_by(
            Task.due_date.asc().nullslast(),
            Task.snooze_until.asc().nullslast(),
            Task.created_at.asc(),
        )
        .all()
    )
    return tasks


@router.get("/tasks/search", response_model=list[TaskResponse])
def search_tasks(
    q: str = Query("", min_length=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = q.strip()
    if not q:
        return []
    pattern = f"%{q}%"
    tasks = (
        db.query(Task)
        .filter(
            Task.owner_id == current_user.id,
            Task.status != TaskStatus.deleted,
            or_(
                Task.title.ilike(pattern),
                Task.notes.ilike(pattern),
            ),
        )
        .order_by(
            Task.due_date.asc().nullslast(),
            Task.created_at.asc(),
        )
        .all()
    )
    return tasks


@router.get("/tasks/backlog", response_model=list[TaskResponse])
def get_backlog(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    carry_forward(current_user, db)
    resolve_snoozes(current_user, db)
    generate_routine_instances(current_user, db)
    tasks = (
        db.query(Task)
        .filter(
            Task.owner_id == current_user.id,
            Task.status.in_([TaskStatus.inbox, TaskStatus.today, TaskStatus.snoozed]),
        )
        .order_by(
            Task.due_date.asc().nullslast(),
            Task.snooze_until.asc().nullslast(),
            Task.created_at.asc(),
        )
        .all()
    )
    return tasks


# ---------------------------------------------------------------------------
# Inbox
# ---------------------------------------------------------------------------

@router.get("/tasks/inbox", response_model=list[TaskResponse])
def get_inbox(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    carry_forward(current_user, db)
    resolve_snoozes(current_user, db)
    generate_routine_instances(current_user, db)
    # Lazy gcal sync if token exists and not synced today
    _maybe_sync_gcal(current_user.id, db)
    today = date.today()
    tasks = (
        db.query(Task)
        .filter(
            Task.owner_id == current_user.id,
            Task.status == TaskStatus.inbox,
            # Hide tasks deferred to a future date — they surface when their date arrives
            or_(Task.due_date == None, Task.due_date <= today),
            # Exclude stale routine instances (past-day, untriaged) — they go in /routines/missed
            or_(
                Task.task_type != TaskType.routine,
                Task.scheduled_date == None,
                Task.scheduled_date >= today_start(),
            ),
        )
        .order_by(Task.created_at.asc())
        .all()
    )
    return tasks


# ---------------------------------------------------------------------------
# Today's list
# ---------------------------------------------------------------------------

@router.get("/tasks/today", response_model=list[TaskResponse])
def get_today(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    carry_forward(current_user, db)
    resolve_snoozes(current_user, db)
    generate_routine_instances(current_user, db)
    promote_due_tasks(current_user, db)
    _maybe_sync_gcal(current_user.id, db)

    tasks = (
        db.query(Task)
        .options(joinedload(Task.project))
        .filter(
            Task.owner_id == current_user.id,
            Task.status == TaskStatus.today,
            Task.scheduled_date >= _day_start(current_user),
            Task.scheduled_date <= _day_end(current_user),
        )
        .order_by(Task.sort_order.asc().nullslast(), Task.created_at.asc())
        .all()
    )
    return tasks


# ---------------------------------------------------------------------------
# Waiting (snoozed)
# ---------------------------------------------------------------------------

@router.get("/tasks/waiting", response_model=list[TaskResponse])
def get_waiting(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tasks = (
        db.query(Task)
        .filter(Task.owner_id == current_user.id, Task.status == TaskStatus.snoozed)
        .order_by(Task.snooze_until.asc())
        .all()
    )
    return tasks


# ---------------------------------------------------------------------------
# Done (completed today)
# ---------------------------------------------------------------------------

@router.get("/tasks/done", response_model=list[TaskResponse])
def get_done_today(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tasks = (
        db.query(Task)
        .filter(
            Task.owner_id == current_user.id,
            Task.status == TaskStatus.done,
            Task.completed_at >= _day_start(current_user),
        )
        .order_by(Task.completed_at.desc())
        .all()
    )
    return tasks


# ---------------------------------------------------------------------------
# Schedule for today (move from inbox → today)
# ---------------------------------------------------------------------------

@router.post("/tasks/{task_id}/schedule-today", response_model=TaskResponse)
def schedule_today(
    task_id: int,
    body: ScheduleTodayRequest = ScheduleTodayRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = own_task(task_id, current_user, db)
    task.status = TaskStatus.today
    task.scheduled_date = _day_start(current_user)
    task.snooze_until = None
    # Apply any priority metadata set during triage
    if body.priority   is not None: task.priority   = body.priority
    if body.importance is not None: task.importance = body.importance
    if body.desire     is not None: task.desire     = body.desire
    if body.weight     is not None: task.weight     = body.weight
    # Sort order: append to end of today's list
    max_order = (
        db.query(Task)
        .filter(Task.owner_id == current_user.id, Task.status == TaskStatus.today)
        .count()
    )
    task.sort_order = float(max_order)
    db.commit()
    db.refresh(task)
    return task


# ---------------------------------------------------------------------------
# Complete
# ---------------------------------------------------------------------------

@router.post("/tasks/{task_id}/complete", response_model=TaskResponse)
def complete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = own_task(task_id, current_user, db)
    task.status = TaskStatus.done
    task.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(task)
    return task


# ---------------------------------------------------------------------------
# Snooze
# ---------------------------------------------------------------------------

@router.post("/tasks/{task_id}/snooze", response_model=TaskResponse)
def snooze_task(
    task_id: int,
    body: TaskSnoozeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = own_task(task_id, current_user, db)
    task.status = TaskStatus.snoozed
    task.snooze_until = body.snooze_until
    task.scheduled_date = None
    db.commit()
    db.refresh(task)
    return task


# ---------------------------------------------------------------------------
# Un-snooze (return to inbox immediately)
# ---------------------------------------------------------------------------

@router.post("/tasks/{task_id}/unsnooze", response_model=TaskResponse)
def unsnooze_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = own_task(task_id, current_user, db)
    task.status = TaskStatus.inbox
    task.snooze_until = None
    db.commit()
    db.refresh(task)
    return task


# ---------------------------------------------------------------------------
# Defer (today → inbox)
# ---------------------------------------------------------------------------

@router.post("/tasks/{task_id}/defer", response_model=TaskResponse)
def defer_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = own_task(task_id, current_user, db)
    task.status = TaskStatus.inbox
    task.scheduled_date = None
    task.due_date = None
    task.sort_order = None
    db.commit()
    db.refresh(task)
    return task


# ---------------------------------------------------------------------------
# Update (priority, weight, notes, etc.)
# ---------------------------------------------------------------------------

@router.patch("/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    body: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = own_task(task_id, current_user, db)
    patch = body.model_dump(exclude_unset=True)
    old_due = task.due_date

    for field, value in patch.items():
        setattr(task, field, value)
    task.updated_at = utcnow()

    # If a Today-list task gets pushed to a future due_date, demote it back to inbox
    # so it leaves the Today view automatically.
    today = date.today()
    if (
        "due_date" in patch
        and task.status == TaskStatus.today
        and task.due_date is not None
        and task.due_date > today
    ):
        task.status = TaskStatus.inbox
        task.scheduled_date = None
        task.sort_order = None

    # Domain snap: if project has a domain, snap the new due_date to next allowed day
    domain_rules = []
    if "due_date" in patch and task.due_date is not None and task.project_id:
        project = db.query(Project).filter(Project.id == task.project_id).first()
        if project and project.domain_id:
            domain = db.query(Domain).filter(Domain.id == project.domain_id).first()
            if domain:
                domain_rules = json.loads(domain.rules or "[]")
                task.due_date = next_allowed_date(task.due_date, domain_rules)

    # Cascade: if a project sub-task's due_date moves, shift later sibling tasks by same delta
    if (
        "due_date" in patch
        and task.project_id is not None
        and old_due is not None
        and task.due_date is not None
        and task.due_date != old_due
    ):
        delta = (task.due_date - old_due).days
        if delta != 0:
            siblings = (
                db.query(Task)
                .filter(
                    Task.project_id == task.project_id,
                    Task.id != task.id,
                    Task.due_date != None,  # noqa: E711
                    Task.due_date >= old_due,
                    Task.status.notin_([TaskStatus.done, TaskStatus.deleted]),
                )
                .all()
            )
            for s in siblings:
                raw = s.due_date + timedelta(days=delta)
                s.due_date = next_allowed_date(raw, domain_rules) if domain_rules else raw

    db.commit()
    db.refresh(task)
    return task


# ---------------------------------------------------------------------------
# Delete (soft delete)
# ---------------------------------------------------------------------------

@router.delete("/tasks/{task_id}")
def delete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = own_task(task_id, current_user, db)
    task.status = TaskStatus.deleted
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Reorder today's list
# ---------------------------------------------------------------------------

@router.post("/tasks/reorder", response_model=list[TaskResponse])
def reorder_tasks(
    body: TaskReorderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tasks = (
        db.query(Task)
        .filter(Task.owner_id == current_user.id, Task.id.in_(body.ordered_ids))
        .all()
    )
    task_map = {t.id: t for t in tasks}
    for idx, task_id in enumerate(body.ordered_ids):
        if task_id in task_map:
            task_map[task_id].sort_order = float(idx)
    db.commit()
    return [task_map[i] for i in body.ordered_ids if i in task_map]


# ---------------------------------------------------------------------------
# Triage tournament — 3-card pairwise ranking with multi-day bundling
# ---------------------------------------------------------------------------

TOURNAMENT_BUNDLE_PER_DAY = 10  # tournament tasks per day (excludes routines)
TOURNAMENT_HORIZON_DAYS = 30   # max days ahead we'll bundle into


def _count_tasks_on_day(db, user_id: int, target: date, today_d: date) -> int:
    """How many non-routine tasks already target this date."""
    if target == today_d:
        return (
            db.query(Task)
            .filter(
                Task.owner_id == user_id,
                Task.status == TaskStatus.today,
                Task.task_type != TaskType.routine,
            )
            .count()
        )
    return (
        db.query(Task)
        .filter(
            Task.owner_id == user_id,
            Task.status == TaskStatus.inbox,
            Task.due_date == target,
            Task.task_type != TaskType.routine,
        )
        .count()
    )


def _find_target(db, user_id: int):
    """First day in horizon with fewer than BUNDLE_PER_DAY tournament tasks."""
    today_d = date.today()
    for offset in range(TOURNAMENT_HORIZON_DAYS):
        target = today_d + timedelta(days=offset)
        count = _count_tasks_on_day(db, user_id, target, today_d)
        if count < TOURNAMENT_BUNDLE_PER_DAY:
            return target, offset, count
    return None, None, None


@router.get("/tasks/tournament/state")
def tournament_state(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return current state: next 3 inbox tasks + the day they'll fill."""
    today_d = date.today()
    target, offset, target_count = _find_target(db, current_user.id)

    next_three = (
        db.query(Task)
        .filter(
            Task.owner_id == current_user.id,
            Task.status == TaskStatus.inbox,
            Task.task_type == TaskType.task,
            or_(Task.due_date == None, Task.due_date <= today_d),  # noqa: E711
        )
        .order_by(Task.sort_order.asc().nullslast(), Task.created_at.asc())
        .limit(3)
        .all()
    )

    inbox_pending = (
        db.query(Task)
        .filter(
            Task.owner_id == current_user.id,
            Task.status == TaskStatus.inbox,
            Task.task_type == TaskType.task,
            or_(Task.due_date == None, Task.due_date <= today_d),  # noqa: E711
        )
        .count()
    )

    return {
        "bundle_per_day": TOURNAMENT_BUNDLE_PER_DAY,
        "target_date": target.isoformat() if target else None,
        "target_offset": offset,                     # 0=today, 1=tomorrow, …
        "target_count": target_count,                # how full target day is
        "today_count": _count_tasks_on_day(db, current_user.id, today_d, today_d),
        "horizon_full": target is None,
        "inbox_pending": inbox_pending,
        "next_batch": [TaskResponse.model_validate(t).model_dump(mode="json") for t in next_three],
    }


@router.post("/tasks/tournament/submit")
def tournament_submit(
    body: TaskReorderRequest,  # reuse: ordered_ids = ranked task IDs
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Distribute ranked tasks across days, 10 per day, starting today."""
    if not body.ordered_ids:
        raise HTTPException(status_code=400, detail="ordered_ids required")
    if len(body.ordered_ids) > 3:
        raise HTTPException(status_code=400, detail="max 3 tasks per round")

    today_d = date.today()
    target, offset, target_count = _find_target(db, current_user.id)
    if target is None:
        raise HTTPException(status_code=409, detail="All days in horizon are full")

    # If target is today, append after existing today sort_order range
    max_sort = 0.0
    if offset == 0:
        max_sort_row = (
            db.query(Task.sort_order)
            .filter(Task.owner_id == current_user.id, Task.status == TaskStatus.today)
            .order_by(Task.sort_order.desc().nullslast())
            .first()
        )
        if max_sort_row and max_sort_row[0] is not None:
            max_sort = float(max_sort_row[0])

    placed = 0
    for i, tid in enumerate(body.ordered_ids):
        # Re-pick target if current day fills mid-round
        cur_target, cur_offset, cur_count = _find_target(db, current_user.id)
        if cur_target is None:
            break
        t = (
            db.query(Task)
            .filter(
                Task.id == tid,
                Task.owner_id == current_user.id,
                Task.status == TaskStatus.inbox,
            )
            .first()
        )
        if not t:
            continue
        if cur_offset == 0:
            t.status = TaskStatus.today
            t.scheduled_date = today_start()
            t.sort_order = float(max_sort + i + 1)
        else:
            t.status = TaskStatus.inbox
            t.due_date = cur_target
            t.scheduled_date = None
            t.sort_order = None
        placed += 1
        db.flush()  # so next _find_target() sees this placement

    db.commit()
    return tournament_state(current_user=current_user, db=db)


# ---------------------------------------------------------------------------
# Actuator Categories
# ---------------------------------------------------------------------------

@router.get("/actuator-categories", response_model=list[ActuatorCategoryResponse])
def get_actuator_categories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(ActuatorCategory)
        .filter(ActuatorCategory.user_id == current_user.id)
        .order_by(ActuatorCategory.is_preset.desc(), ActuatorCategory.name.asc())
        .all()
    )


@router.post("/actuator-categories", response_model=ActuatorCategoryResponse)
def create_actuator_category(
    body: ActuatorCategoryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Custom categories require a description of at least 50 chars (roughly 2-3 sentences)
    if not body.description or len(body.description.strip()) < 50:
        raise HTTPException(
            status_code=400,
            detail="Custom actuator categories require a description of at least 50 characters explaining what energy this draws from and what it produces.",
        )
    cat = ActuatorCategory(
        user_id=current_user.id,
        name=body.name.strip(),
        description=body.description.strip(),
        is_preset=False,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat
