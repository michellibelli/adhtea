import json
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import (
    SelfCareLog, CapacitySnapshot, Task, TaskStatus, WeeklySnapshot,
    NudgeLog, User, utcnow,
)
from schemas import WeeklySnapshotResponse, NudgeResponse, NudgeRespondRequest
from routes.auth import get_current_user
from routes.triage import project_stall_map
from pid_engine import compute_pid_state, rank_nudges, generate_weekly_insight

router = APIRouter(prefix="/insights", tags=["insights"])

NUDGE_COOLDOWN_SECONDS = 2 * 60 * 60
NUDGE_DAILY_CAP = 3


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
        "stalled_projects": json.loads(snap.stalled_projects) if snap.stalled_projects else None,
        "overall_capacity_avg": snap.overall_capacity_avg,
        "pid_state": json.loads(snap.pid_state) if snap.pid_state else None,
        "computed_at": snap.computed_at,
        "insight_copy": insight_copy,
    }
    return d


@router.post("/compute-weekly", response_model=WeeklySnapshotResponse)
def compute_weekly(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = _user_today(current_user)
    ws = _week_start(today)
    window_start = ws
    window_end = min(ws + timedelta(days=6), today)

    logs = (
        db.query(SelfCareLog)
        .filter(
            SelfCareLog.user_id == current_user.id,
            SelfCareLog.log_date >= window_start,
            SelfCareLog.log_date <= window_end,
        )
        .all()
    )

    sleep_vals = [l.sleep_hours for l in logs if l.sleep_hours is not None]
    meal_vals = [l.meals for l in logs if l.meals is not None]
    exercise_days = sum(1 for l in logs if l.exercise)
    check_in_days = len(logs)
    weekdays = _count_weekdays(window_start, window_end)

    avg_sleep = sum(sleep_vals) / len(sleep_vals) if sleep_vals else None
    avg_meals = sum(meal_vals) / len(meal_vals) if meal_vals else None

    checkin_rate = check_in_days / weekdays if weekdays > 0 else 0

    day_start = datetime(window_start.year, window_start.month, window_start.day)
    day_end = datetime(window_end.year, window_end.month, window_end.day, 23, 59, 59)

    tasks_completed = (
        db.query(func.count(Task.id))
        .filter(
            Task.owner_id == current_user.id,
            Task.status == TaskStatus.done,
            Task.completed_at >= day_start,
            Task.completed_at <= day_end,
        )
        .scalar()
    ) or 0

    tasks_pushed = (
        db.query(func.count(Task.id))
        .filter(
            Task.owner_id == current_user.id,
            Task.status != TaskStatus.deleted,
            Task.push_count >= 3,
        )
        .scalar()
    ) or 0

    stall_map = project_stall_map(db, current_user.id, today)
    stalled_ids = [pid for pid, stalled in stall_map.items() if stalled]

    caps = (
        db.query(CapacitySnapshot)
        .filter(
            CapacitySnapshot.user_id == current_user.id,
            CapacitySnapshot.log_date >= window_start,
            CapacitySnapshot.log_date <= window_end,
        )
        .all()
    )
    cap_avg = sum(c.overall for c in caps) / len(caps) if caps else None

    prior = (
        db.query(WeeklySnapshot)
        .filter(
            WeeklySnapshot.user_id == current_user.id,
            WeeklySnapshot.week_start < ws,
        )
        .order_by(WeeklySnapshot.week_start.desc())
        .first()
    )
    prior_pid = json.loads(prior.pid_state) if prior and prior.pid_state else None

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
            WeeklySnapshot.user_id == current_user.id,
            WeeklySnapshot.week_start == ws,
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
        snap.stalled_projects = json.dumps(stalled_ids)
        snap.overall_capacity_avg = cap_avg
        snap.pid_state = json.dumps(pid_state)
        snap.computed_at = utcnow()
    else:
        snap = WeeklySnapshot(
            user_id=current_user.id,
            week_start=ws,
            avg_sleep=avg_sleep,
            avg_meals=avg_meals,
            exercise_days=exercise_days,
            check_in_days=check_in_days,
            weekdays_in_period=weekdays,
            tasks_completed=tasks_completed,
            tasks_pushed=tasks_pushed,
            stalled_projects=json.dumps(stalled_ids),
            overall_capacity_avg=cap_avg,
            pid_state=json.dumps(pid_state),
        )
        db.add(snap)

    db.commit()
    db.refresh(snap)
    return _serialize_snapshot(snap, insight_copy)


@router.get("/weekly", response_model=WeeklySnapshotResponse | None)
def get_weekly(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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


@router.get("/nudge", response_model=NudgeResponse | None)
def get_nudge(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = _user_today(current_user)

    if today.weekday() >= 5:
        return None

    snap = (
        db.query(WeeklySnapshot)
        .filter(WeeklySnapshot.user_id == current_user.id)
        .order_by(WeeklySnapshot.week_start.desc())
        .first()
    )
    if not snap or not snap.pid_state:
        return None
    age_days = (today - snap.week_start).days
    if age_days > 14:
        return None

    now = utcnow()
    cooldown_cutoff = now - timedelta(seconds=NUDGE_COOLDOWN_SECONDS)
    recent = (
        db.query(NudgeLog)
        .filter(
            NudgeLog.user_id == current_user.id,
            NudgeLog.shown_at > cooldown_cutoff,
        )
        .first()
    )
    if recent:
        return None

    today_start = datetime(today.year, today.month, today.day)
    today_count = (
        db.query(func.count(NudgeLog.id))
        .filter(
            NudgeLog.user_id == current_user.id,
            NudgeLog.shown_at >= today_start,
        )
        .scalar()
    ) or 0
    if today_count >= NUDGE_DAILY_CAP:
        return None

    pid_state = json.loads(snap.pid_state)
    ranked = rank_nudges(pid_state)
    if not ranked:
        return None

    top = ranked[0]
    nudge = NudgeLog(
        user_id=current_user.id,
        nudge_type="micro",
        variable=top["variable"],
        message=top["message"],
    )
    db.add(nudge)
    db.commit()
    db.refresh(nudge)
    return nudge


@router.post("/nudge/{nudge_id}/respond")
def respond_nudge(
    nudge_id: int,
    body: NudgeRespondRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    nudge = (
        db.query(NudgeLog)
        .filter(
            NudgeLog.id == nudge_id,
            NudgeLog.user_id == current_user.id,
        )
        .first()
    )
    if not nudge:
        raise HTTPException(status_code=404, detail="Nudge not found")

    nudge.response = body.response
    nudge.response_at = utcnow()
    db.commit()
    return {"status": "ok"}
