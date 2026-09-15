"""Morning review — retrospectively tag the prior day's finished tasks small/big.

Surfaces the most recent *unreviewed* activity-day (not literally yesterday):
if she skips the weekend, Monday surfaces Friday; a sick day self-heals the same
way. The day's finished tasks come pre-guessed (Haiku + her learned corrections)
so she only flips the wrong ones, then a single button carries her into the
existing self-care gate.
"""

from datetime import datetime, timezone, timedelta, date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Task, TaskStatus, TaskType, SelfCareLog, User, utcnow
from schemas import ReviewPendingResponse, ReviewCommitRequest
from routes.auth import get_current_user
from routes.task_lifecycle import _app_today, _app_day_start_utc, _tz, _day_start_hour
import review_engine

router = APIRouter()

_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
             "Saturday", "Sunday"]

# How far back to look for an unreviewed day. If she's been away longer than
# this, the stale days just don't surface — reviewing three-week-old tasks
# isn't worth it.
_LOOKBACK_DAYS = 21


def _completed_app_day(user: User, completed_at) -> date | None:
    """App-day (with the day_start_hour rollover) that a naive-UTC completed_at
    falls into, in the user's timezone."""
    if completed_at is None:
        return None
    local = completed_at.replace(tzinfo=timezone.utc).astimezone(_tz(user))
    if local.hour < _day_start_hour(user):
        return (local - timedelta(days=1)).date()
    return local.date()


def _pending_day_and_tasks(user: User, db: Session):
    """Find the most recent unreviewed activity-day and its finished tasks.
    Returns (day, [Task]) or (None, [])."""
    today = _app_today(user)
    since = utcnow() - timedelta(days=_LOOKBACK_DAYS)
    done = (
        db.query(Task)
        .filter(
            Task.owner_id == user.id,
            Task.status == TaskStatus.done,
            Task.task_type == TaskType.task,
            Task.completed_at.isnot(None),
            Task.completed_at >= since,
            Task.completed_at < _app_day_start_utc(user),   # exclude today's app-day
        )
        .order_by(Task.completed_at.desc())
        .all()
    )
    reviewed_through = user.reviewed_through
    # Walk newest-first; the first task whose app-day is unreviewed picks the day.
    target_day = None
    for t in done:
        d = _completed_app_day(user, t.completed_at)
        if d is None or d >= today:
            continue
        if reviewed_through is not None and d <= reviewed_through:
            # Everything from here back is already reviewed (list is desc).
            break
        target_day = d
        break
    if target_day is None:
        return None, []
    day_tasks = [t for t in done if _completed_app_day(user, t.completed_at) == target_day]
    return target_day, day_tasks


def _build_context(user: User, day: date, tasks, db: Session) -> dict:
    """Sunny-greeting context: weekday, done count, a cheap trend, and the day's
    self-care if she logged it."""
    ctx = {
        "weekday": _WEEKDAYS[day.weekday()],
        "date": day.isoformat(),
        "done_count": len(tasks),
    }
    log = (
        db.query(SelfCareLog)
        .filter(SelfCareLog.user_id == user.id, SelfCareLog.log_date == day)
        .first()
    )
    if log:
        if log.sleep_hours is not None:
            ctx["sleep_hours"] = log.sleep_hours
        if log.mood is not None:
            ctx["mood"] = log.mood
    # Trend: this day's output vs the average of the prior week's activity days.
    prior_cut = day - timedelta(days=8)
    recent = (
        db.query(Task)
        .filter(
            Task.owner_id == user.id,
            Task.status == TaskStatus.done,
            Task.task_type == TaskType.task,
            Task.completed_at.isnot(None),
        )
        .all()
    )
    by_day: dict[date, int] = {}
    for t in recent:
        d = _completed_app_day(user, t.completed_at)
        if d is not None and prior_cut <= d < day:
            by_day[d] = by_day.get(d, 0) + 1
    if by_day:
        avg = sum(by_day.values()) / len(by_day)
        if len(tasks) >= avg * 1.25:
            ctx["trend"] = "climbing"
        elif len(tasks) <= avg * 0.6:
            ctx["trend"] = "a lighter day"
        else:
            ctx["trend"] = "steady"
    return ctx


@router.get("/review/pending", response_model=ReviewPendingResponse | None)
def get_pending_review(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    day, tasks = _pending_day_and_tasks(current_user, db)
    if day is None or not tasks:
        return None
    context = _build_context(current_user, day, tasks, db)
    payload = review_engine.build_review(db, current_user, tasks, context)
    return {"date": day, "greeting": payload["greeting"], "tasks": payload["tasks"]}


@router.post("/review/commit")
def commit_review(
    body: ReviewCommitRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ids = [item.id for item in body.tasks]
    owned = {
        t.id: t
        for t in db.query(Task).filter(
            Task.owner_id == current_user.id, Task.id.in_(ids)
        ).all()
    }
    for item in body.tasks:
        task = owned.get(item.id)
        if task is None:
            continue
        if not item.done:
            # She's correcting a mis-record, not pushing work forward, so
            # push_count is deliberately left alone. Target is `inbox`, not
            # `today`: `today` is a tuple with scheduled_date/sort_order
            # governed by DAILY_CAP, and writing it from here would bypass the
            # cap. She promotes it into Today by hand when she's ready.
            task.status = TaskStatus.inbox
            task.completed_at = None
            task.scheduled_date = None
            task.sort_order = None

    # Tasks she did but never had in the app — log them now, backdated to the
    # reviewed day (local noon → naive UTC, so they bucket into that app-day)
    # and marked done, so they count toward the day's output.
    if body.added:
        local_noon = datetime(
            body.date.year, body.date.month, body.date.day, 12, 0,
            tzinfo=_tz(current_user),
        )
        completed = local_noon.astimezone(timezone.utc).replace(tzinfo=None)
        for item in body.added:
            title = (item.title or "").strip()
            if not title:
                continue
            db.add(Task(
                owner_id=current_user.id,
                title=title[:500],
                task_type=TaskType.task,
                status=TaskStatus.done,
                completed_at=completed,
            ))

    # Advance the reviewed-through watermark (never regress it).
    if current_user.reviewed_through is None or body.date > current_user.reviewed_through:
        current_user.reviewed_through = body.date

    db.commit()
    return {"ok": True, "reviewed_through": current_user.reviewed_through.isoformat()}
