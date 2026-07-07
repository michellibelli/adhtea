import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from sqlalchemy import or_, and_, case
from database import get_db
from models import (
    Task, TaskStatus, TaskType, Priority, ActuatorCategory,
    GoogleCalendarToken, utcnow, User,
    Project, Domain,
)
from schemas import (
    TaskCreate, TaskUpdate, TaskResponse,
    TaskSnoozeRequest, ScheduleTodayRequest, TaskReorderRequest,
    ActuatorCategoryCreate, ActuatorCategoryResponse,
)
from routes.auth import get_current_user
from routes.domain_utils import next_allowed_date, date_allowed, time_of_day_allowed, effective_rules
# Lifecycle engine — the scheduled-state sweeps + user-day helpers live in their
# own module. Re-imported here so the route handlers below (and callers that do
# `from routes.tasks import carry_forward`, e.g. triage.py and the tests) keep
# working unchanged.
from routes.task_lifecycle import (
    _tz, _day_start_hour, _app_today, _day_start, _day_end,
    DAILY_CAP, count_today, _exempt_from_cap,
    _is_routine_due, generate_routine_instances, run_daily_rollover,
    carry_forward, resolve_snoozes, promote_due_tasks,
    demote_misclassified_today, demote_domain_violations,
    archive_past_appointments, _domain_rules_for_tasks,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def own_task(task_id: int, user: User, db: Session) -> Task:
    task = db.query(Task).filter(Task.id == task_id, Task.owner_id == user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def _rules_for_inputs(db: Session, project_id: Optional[int], domain_id: Optional[int]) -> list:
    """Return the rule list that governs a task created/updated with these inputs.

    Mirrors effective_domain priority: project domain wins over task-level domain.
    Returns [] when neither resolves to a domain — caller treats that as
    "no scheduling restrictions" (the runtime fallback for orphan tasks
    without a tagged domain — equivalent to Work, which has no time rules).
    """
    if project_id:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project and project.domain_id:
            domain = db.query(Domain).filter(Domain.id == project.domain_id).first()
            if domain:
                return json.loads(domain.rules or "[]")
        return []
    if domain_id:
        domain = db.query(Domain).filter(Domain.id == domain_id).first()
        if domain:
            return json.loads(domain.rules or "[]")
    return []


# ---------------------------------------------------------------------------
# Triage summary — inbox count + today's load level (used by the triage page
# to show a live load indicator as items are scheduled)
# ---------------------------------------------------------------------------

# Task weight as a number: light=1, medium=2, heavy=3.
# Sum these across all today's tasks to get a "load score" for the day.
WEIGHT_VALUES = {"light": 1, "medium": 2, "heavy": 3}

def load_level(tasks):
    """Classify the day's workload as a string label based on total task weight.

    Thresholds (sum of all task weights):
      ≤ 6  → "light"      (≈ up to 3 light tasks or 2 mediums)
      ≤ 12 → "manageable" (≈ a typical full day)
      ≤ 18 → "heavy"      (≈ packed day)
      > 18 → "overloaded" (more than a realistic day)

    Note: the frontend has a parallel computeLoad() that uses the same thresholds
    but returns richer UI data (color, percent bar). Keep both in sync if thresholds change.
    """
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
    run_daily_rollover(current_user, db)
    resolve_snoozes(current_user, db)
    promote_due_tasks(current_user, db)
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
    run_daily_rollover(current_user, db)
    resolve_snoozes(current_user, db)
    promote_due_tasks(current_user, db)
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

    # Project domain wins over task-level domain. The task-level domain_id
    # is only stored when the task is an orphan (no project_id).
    task_domain_id = body.domain_id if not body.project_id else None
    domain_rules = _rules_for_inputs(db, body.project_id, task_domain_id)

    # Snap the due date through the effective domain rules FIRST so the
    # status decision below sees the actually-placed date, not the user pick.
    # Without this, a Sunday pick on a weekday-only Work project would
    # compute due_today=True (Sun <= Sun) and land status=today even though
    # the snapped due_date is the following Monday.
    due_date = body.due_date
    if due_date and domain_rules:
        due_date = next_allowed_date(due_date, domain_rules)

    due_today = due_date is not None and due_date <= today_local

    # Daily cap: a plain task aimed at a full Today is snapped to the next
    # day instead. Appointments and routines are time-bound — always admitted.
    today_count = count_today(current_user, db)
    place_today = due_today
    if due_today and not _exempt_from_cap(body.task_type) and today_count >= DAILY_CAP:
        place_today = False
        base = today_local + timedelta(days=1)
        due_date = next_allowed_date(base, domain_rules) if domain_rules else base

    task = Task(
        owner_id=current_user.id,
        title=body.title.strip(),
        notes=body.notes,
        task_type=body.task_type,
        status=TaskStatus.today if place_today else TaskStatus.inbox,
        scheduled_date=_day_start(current_user) if place_today else None,
        sort_order=float(today_count) if place_today else None,
        actuator_category_id=body.actuator_category_id,
        project_id=body.project_id,
        domain_id=task_domain_id,
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
    """Pull today's Google Calendar events and create appointment Tasks — at most once every 30 minutes.

    Called automatically when the user loads their Today or Inbox list so new calendar
    events appear without the user having to manually press "Sync." The 30-minute throttle
    prevents hammering the Google API on every page load.
    """
    token = db.query(GoogleCalendarToken).filter(
        GoogleCalendarToken.user_id == user_id
    ).first()
    if not token:
        return  # user hasn't connected Google Calendar
    # Skip if synced recently — 1800 seconds = 30 minutes
    if token.last_synced:
        elapsed = (datetime.now(timezone.utc).replace(tzinfo=None) - token.last_synced).total_seconds()
        if elapsed < 1800:
            return
    try:
        from routes.gcal import sync_today_events
        sync_today_events(user_id, db)
    except Exception:
        # Never let a GCal failure break the task list, but log it so issues
        # like expired tokens or API outages are visible in the server logs
        logger.exception("gcal auto-sync failed for user %s", user_id)


# ---------------------------------------------------------------------------
# Backlog — all active tasks (inbox + today + snoozed) for timeline view
# ---------------------------------------------------------------------------

@router.get("/tasks/bonus", response_model=list[TaskResponse])
def get_bonus_tasks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Future-dated inbox tasks + snoozed items — shown in Focus when today's list clears."""
    today = _app_today(current_user)
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
    run_daily_rollover(current_user, db)
    resolve_snoozes(current_user, db)
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
    run_daily_rollover(current_user, db)
    resolve_snoozes(current_user, db)
    # Lazy gcal sync if token exists and not synced today
    _maybe_sync_gcal(current_user.id, db)
    today = _app_today(current_user)
    priority_rank = case(
        (Task.priority == Priority.urgent, 0),
        (Task.priority == Priority.high, 1),
        (Task.priority == Priority.normal, 2),
        (Task.priority == None, 2),
        (Task.priority == Priority.low, 3),
        else_=2,
    )
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
                Task.scheduled_date >= _day_start(current_user),
            ),
        )
        .order_by(Task.due_date.asc().nullslast(), priority_rank, Task.created_at.asc())
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
    run_daily_rollover(current_user, db)
    resolve_snoozes(current_user, db)
    demote_misclassified_today(current_user, db)
    demote_domain_violations(current_user, db)
    promote_due_tasks(current_user, db)
    _maybe_sync_gcal(current_user.id, db)

    tasks = (
        db.query(Task)
        .options(
            joinedload(Task.project).joinedload(Project.domain),
            joinedload(Task.domain),
        )
        .filter(
            Task.owner_id == current_user.id,
            Task.status == TaskStatus.today,
            Task.scheduled_date >= _day_start(current_user),
            Task.scheduled_date <= _day_end(current_user),
        )
        .order_by(Task.sort_order.asc().nullslast(), Task.created_at.asc())
        .all()
    )

    # Soft time-of-day filter: stamp each task with whether its effective
    # domain considers the user's current hour in-bounds. The frontend uses
    # `in_context` in Focus pickNext to sink off-context items to the
    # bottom without hiding them (e.g. a Home task during work hours).
    now = datetime.now(_tz(current_user))
    for t in tasks:
        t.in_context = time_of_day_allowed(now, effective_rules(t))
    tasks.sort(key=lambda t: (0 if t.in_context else 1,))
    return tasks


# ---------------------------------------------------------------------------
# Start my day — commit today's plan
# ---------------------------------------------------------------------------

@router.post("/tasks/plan-day")
def plan_day(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark the user's plan as committed for the current app-day. Flips Today
    from its planning state into its started state. Idempotent — calling it
    again the same app-day is a no-op. Resets automatically at the next
    day_start_hour boundary because it's compared against _app_today."""
    today = _app_today(current_user)
    current_user.planned_on = today
    db.commit()
    return {"day_planned": True, "planned_on": today.isoformat()}


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
    # Daily cap: block a plain task from entering a full Today. Appointments
    # and routines are exempt; a task already in Today isn't a new arrival.
    if (
        task.status != TaskStatus.today
        and not _exempt_from_cap(task.task_type)
        and count_today(current_user, db) >= DAILY_CAP
    ):
        raise HTTPException(
            status_code=409,
            detail=f"Today is full ({DAILY_CAP} items) — finish one first.",
        )
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
    task.push_count = (task.push_count or 0) + 1
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
    task.push_count = (task.push_count or 0) + 1
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

    # Project domain wins. Null out any task-level domain whenever a project
    # is attached, so the data stays unambiguous about which rules apply.
    if task.project_id:
        task.domain_id = None

    # Resolve the effective rule set for THIS task right now (after patch
    # applied, after project-vs-domain reconciliation). Used for snap +
    # demote + cascade below.
    domain_rules = _rules_for_inputs(db, task.project_id, task.domain_id)

    # Domain snap FIRST so status logic below sees the actually-placed due_date.
    # Without the snap-first order, picking Sunday on a weekday-only Work task
    # passes the demote-on-future check (Sun > Sun is False) but the post-snap
    # due_date becomes Monday — leaving the task incorrectly status=today on Sunday.
    if "due_date" in patch and task.due_date is not None and domain_rules:
        task.due_date = next_allowed_date(task.due_date, domain_rules)

    today = _app_today(current_user)
    # If a Today-list task gets pushed to a future due_date, demote it back to inbox
    # so it leaves the Today view automatically.
    if (
        "due_date" in patch
        and task.status == TaskStatus.today
        and task.due_date is not None
        and task.due_date > today
    ):
        task.status = TaskStatus.inbox
        task.scheduled_date = None
        task.sort_order = None

    # Demote if status=today but today violates the task's domain.
    # Covers tasks that were status=today via paths that bypassed the snap
    # (drag-to-today, legacy rows, batch edits) or before a domain rule change.
    if (
        task.status == TaskStatus.today
        and domain_rules
        and not date_allowed(today, domain_rules)
    ):
        task.status = TaskStatus.inbox
        task.scheduled_date = None
        task.sort_order = None

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
