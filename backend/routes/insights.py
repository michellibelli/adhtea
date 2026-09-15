import json
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import (
    SelfCareLog, CapacitySnapshot, Task, TaskStatus, WeeklySnapshot,
    User, utcnow,
)
from schemas import WeeklySnapshotResponse
from routes.auth import get_current_user
from pid_engine import compute_pid_state, generate_weekly_insight

router = APIRouter(prefix="/insights", tags=["insights"])


def _tz(user: User) -> ZoneInfo:
    return ZoneInfo(getattr(user, "timezone", None) or "America/Los_Angeles")


def _user_today(user: User) -> date:
    return datetime.now(_tz(user)).date()


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _count_weekdays(start: date, end: date) -> int:
    count = 0
    d = start
    while d <= end:
        if d.weekday() < 5:
            count += 1
        d += timedelta(days=1)
    return count


def _serialize_snapshot(snap: WeeklySnapshot, insight_copy: str | None = None) -> dict:
    d = {
        "id": snap.id,
        "user_id": snap.user_id,
        "week_start": snap.week_start,
        "avg_sleep": snap.avg_sleep,
        "avg_meals": snap.avg_meals,
        "exercise_days": snap.exercise_days,
        "check_in_days": snap.check_in_days,
        "weekdays_in_period": snap.weekdays_in_period,
        "tasks_completed": snap.tasks_completed,
        "tasks_pushed": snap.tasks_pushed,
        "overall_capacity_avg": snap.overall_capacity_avg,
        "pid_state": json.loads(snap.pid_state) if snap.pid_state else None,
        "computed_at": snap.computed_at,
        "insight_copy": insight_copy,
    }
    return d


def _compute_snapshot(db: Session, user: User, target_ws: date) -> tuple[WeeklySnapshot, str]:
    today = _user_today(user)
    window_end = min(target_ws + timedelta(days=6), today)

    logs = (
        db.query(SelfCareLog)
        .filter(
            SelfCareLog.user_id == user.id,
            SelfCareLog.log_date >= target_ws,
            SelfCareLog.log_date <= window_end,
        )
        .all()
    )

    sleep_vals = [l.sleep_hours for l in logs if l.sleep_hours is not None]
    meal_vals = [l.meals for l in logs if l.meals is not None]
    exercise_days = sum(1 for l in logs if l.exercise)
    check_in_days = len(logs)
    weekdays = _count_weekdays(target_ws, window_end)

    avg_sleep = sum(sleep_vals) / len(sleep_vals) if sleep_vals else None
    avg_meals = sum(meal_vals) / len(meal_vals) if meal_vals else None

    day_start = datetime(target_ws.year, target_ws.month, target_ws.day)
    day_end = datetime(window_end.year, window_end.month, window_end.day, 23, 59, 59)

    tasks_completed = (
        db.query(func.count(Task.id))
        .filter(
            Task.owner_id == user.id,
            Task.status == TaskStatus.done,
            Task.completed_at >= day_start,
            Task.completed_at <= day_end,
        )
        .scalar()
    ) or 0

    tasks_pushed = (
        db.query(func.count(Task.id))
        .filter(
            Task.owner_id == user.id,
            Task.status != TaskStatus.deleted,
            Task.push_count >= 3,
        )
        .scalar()
    ) or 0

    caps = (
        db.query(CapacitySnapshot)
        .filter(
            CapacitySnapshot.user_id == user.id,
            CapacitySnapshot.log_date >= target_ws,
            CapacitySnapshot.log_date <= window_end,
        )
        .all()
    )
    cap_avg = sum(c.overall for c in caps) / len(caps) if caps else None

    prior = (
        db.query(WeeklySnapshot)
        .filter(
            WeeklySnapshot.user_id == user.id,
            WeeklySnapshot.week_start < target_ws,
        )
        .order_by(WeeklySnapshot.week_start.desc())
        .first()
    )
    prior_pid = json.loads(prior.pid_state) if prior and prior.pid_state else None

    checkin_rate = check_in_days / weekdays if weekdays > 0 else 0
    current_averages = {
        "sleep": avg_sleep or 0,
        "meals": avg_meals or 0,
        "exercise": exercise_days,
        "checkin": checkin_rate,
    }
    pid_state = compute_pid_state(current_averages, prior_pid)

    averages_for_insight = {**current_averages, "weekdays_in_period": weekdays}
    insight_copy = generate_weekly_insight(pid_state, averages_for_insight)

    snap = (
        db.query(WeeklySnapshot)
        .filter(
            WeeklySnapshot.user_id == user.id,
            WeeklySnapshot.week_start == target_ws,
        )
        .first()
    )

    if snap:
        snap.avg_sleep = avg_sleep
        snap.avg_meals = avg_meals
        snap.exercise_days = exercise_days
        snap.check_in_days = check_in_days
        snap.weekdays_in_period = weekdays
        snap.tasks_completed = tasks_completed
        snap.tasks_pushed = tasks_pushed
        snap.overall_capacity_avg = cap_avg
        snap.pid_state = json.dumps(pid_state)
        snap.computed_at = utcnow()
    else:
        snap = WeeklySnapshot(
            user_id=user.id,
            week_start=target_ws,
            avg_sleep=avg_sleep,
            avg_meals=avg_meals,
            exercise_days=exercise_days,
            check_in_days=check_in_days,
            weekdays_in_period=weekdays,
            tasks_completed=tasks_completed,
            tasks_pushed=tasks_pushed,
            overall_capacity_avg=cap_avg,
            pid_state=json.dumps(pid_state),
        )
        db.add(snap)

    db.commit()
    db.refresh(snap)
    return snap, insight_copy


def _ensure_current_snapshot(db: Session, user: User) -> WeeklySnapshot | None:
    """Build this week's snapshot, or rebuild it if self-care has been logged since.

    The snapshot is the only thing /weekly reads. It used to be written once —
    the first time the week was touched — and then left alone, so every
    self-care entry logged after that was invisible for the rest of the week.
    Recompute whenever a log in the window is newer than the snapshot; there
    is no cron, so this lazy path is the only thing keeping the numbers honest.
    """
    today = _user_today(user)
    ws = _week_start(today)
    window_end = min(ws + timedelta(days=6), today)

    latest_log_at = (
        db.query(func.max(SelfCareLog.logged_at))
        .filter(
            SelfCareLog.user_id == user.id,
            SelfCareLog.log_date >= ws,
            SelfCareLog.log_date <= window_end,
        )
        .scalar()
    )
    if latest_log_at is None:
        return None

    existing = (
        db.query(WeeklySnapshot)
        .filter(
            WeeklySnapshot.user_id == user.id,
            WeeklySnapshot.week_start == ws,
        )
        .first()
    )
    if existing and existing.computed_at and existing.computed_at >= latest_log_at:
        return None

    snap, _ = _compute_snapshot(db, user, ws)
    return snap


@router.post("/compute-weekly", response_model=WeeklySnapshotResponse)
def compute_weekly(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    week_start: date | None = None,
):
    ws = week_start if week_start else _week_start(_user_today(current_user))
    snap, insight_copy = _compute_snapshot(db, current_user, ws)
    return _serialize_snapshot(snap, insight_copy)


@router.get("/weekly", response_model=WeeklySnapshotResponse | None)
def get_weekly(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_current_snapshot(db, current_user)

    snap = (
        db.query(WeeklySnapshot)
        .filter(WeeklySnapshot.user_id == current_user.id)
        .order_by(WeeklySnapshot.week_start.desc())
        .first()
    )
    if not snap:
        return None

    today = _user_today(current_user)
    age_days = (today - snap.week_start).days
    if age_days > 14:
        return None

    pid_state = json.loads(snap.pid_state) if snap.pid_state else {}
    averages = {
        "sleep": snap.avg_sleep or 0,
        "meals": snap.avg_meals or 0,
        "exercise": snap.exercise_days or 0,
        "checkin": snap.check_in_days or 0,
        "weekdays_in_period": snap.weekdays_in_period or 5,
    }
    insight_copy = generate_weekly_insight(pid_state, averages)
    return _serialize_snapshot(snap, insight_copy)
