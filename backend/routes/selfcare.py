from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import (
    SelfCareLog, CapacitySnapshot, Task, TaskStatus, TaskType, utcnow,
)
from schemas import SelfCareLogCreate, SelfCareLogResponse, CapacitySnapshotResponse
from routes.auth import get_current_user
from routes.task_lifecycle import _app_today
from models import User

router = APIRouter()


# ---------------------------------------------------------------------------
# Capacity computation (rules-based, v1)
# ---------------------------------------------------------------------------

def _med_adherence(log: SelfCareLog) -> float | None:
    """1.0/0.0 for the day's plain yes/no (SelfCareLog.medication_taken), or
    None when unanswered — no regimen (or the question is off in Settings)
    means meds should neither help nor hurt capacity. Replaced the
    MedicationSchedule/MedicationLog fractional-adherence calc in 4.22.0;
    there's only one question now, not several to divide across."""
    if log.medication_taken is None:
        return None
    return 1.0 if log.medication_taken else 0.0


def _compute_capacity(log: SelfCareLog, med_adherence: float | None = None) -> dict:
    hours = log.sleep_hours or 0
    quality = log.sleep_quality or 3

    # Sleep battery: hours toward 8h target, quality adjusts ±40%
    sleep_battery = min(hours / 8.0, 1.0) * 100 * (0.6 + 0.4 * quality / 5.0)

    # Nutrition: meals toward 4 per day
    nutrition_battery = min((log.meals or 0) / 4.0, 1.0) * 100

    # Physical: 45 min exercise = full; no exercise = 20 baseline
    if log.exercise:
        physical_battery = min((log.exercise_minutes or 30) / 45.0, 1.0) * 100
    else:
        physical_battery = 20.0

    # Emotional: mood 1→0, 5→100
    emotional_battery = ((log.mood or 3) - 1) / 4.0 * 100

    # Environment: not directly logged — stable default
    environment_battery = 60.0

    # Executive capacitor: sleep-dominated, sharply non-linear, then modulated
    # by sleep quality and — for ADHD meds — medication adherence. Meds are an
    # executive-function lever, so skipping them pulls this term down: full
    # adherence keeps it as-is, zero adherence knocks 40% off. No regimen
    # (med_adherence is None) leaves it untouched.
    if hours >= 8:
        exec_cap = 90.0
    elif hours >= 7:
        exec_cap = 75.0
    elif hours >= 6:
        exec_cap = 55.0
    elif hours >= 5:
        exec_cap = 30.0
    else:
        exec_cap = 15.0
    exec_cap *= (0.6 + 0.4 * quality / 5.0)
    if med_adherence is not None:
        exec_cap *= (0.6 + 0.4 * med_adherence)
    exec_cap = min(exec_cap, 100.0)

    overall = (
        sleep_battery       * 0.25 +
        nutrition_battery   * 0.15 +
        physical_battery    * 0.15 +
        emotional_battery   * 0.20 +
        environment_battery * 0.10 +
        exec_cap            * 0.15
    )

    return {
        "sleep_battery":       round(sleep_battery, 1),
        "nutrition_battery":   round(nutrition_battery, 1),
        "physical_battery":    round(physical_battery, 1),
        "emotional_battery":   round(emotional_battery, 1),
        "environment_battery": round(environment_battery, 1),
        "executive_capacitor": round(exec_cap, 1),
        "overall":             round(overall, 1),
    }


def _upsert_snapshot(log: SelfCareLog, user_id: int, db: Session) -> CapacitySnapshot:
    vals = _compute_capacity(log, _med_adherence(log))
    snap = db.query(CapacitySnapshot).filter(
        CapacitySnapshot.user_id == user_id,
        CapacitySnapshot.log_date == log.log_date,
    ).first()
    if snap:
        for k, v in vals.items():
            setattr(snap, k, v)
        snap.computed_at = utcnow()
    else:
        snap = CapacitySnapshot(user_id=user_id, log_date=log.log_date, **vals)
        db.add(snap)
    db.commit()
    db.refresh(snap)
    return snap


def recompute_snapshot(db: Session, user_id: int, log_date) -> None:
    """Re-derive the capacity snapshot for a date from its self-care log, if one
    exists. Called when medication is logged after the morning check-in, so
    marking meds updates today's capacity instead of waiting for the next log."""
    log = (
        db.query(SelfCareLog)
        .filter(SelfCareLog.user_id == user_id, SelfCareLog.log_date == log_date)
        .first()
    )
    if log is not None:
        _upsert_snapshot(log, user_id, db)


# ---------------------------------------------------------------------------
# Self-care log endpoints
# ---------------------------------------------------------------------------

@router.get("/self-care/today", response_model=SelfCareLogResponse | None)
def get_today_log(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(SelfCareLog).filter(
        SelfCareLog.user_id == current_user.id,
        SelfCareLog.log_date == _app_today(current_user),
    ).first()


@router.post("/self-care/log", response_model=SelfCareLogResponse)
def upsert_log(
    body: SelfCareLogCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log_date = body.log_date or _app_today(current_user)

    log = db.query(SelfCareLog).filter(
        SelfCareLog.user_id == current_user.id,
        SelfCareLog.log_date == log_date,
    ).first()

    if log:
        for field, value in body.model_dump(exclude_unset=True, exclude={"log_date"}).items():
            setattr(log, field, value)
        log.logged_at = utcnow()
    else:
        log = SelfCareLog(
            user_id=current_user.id,
            log_date=log_date,
            **body.model_dump(exclude={"log_date"}, exclude_none=True),
        )
        db.add(log)

    db.commit()
    db.refresh(log)
    _upsert_snapshot(log, current_user.id, db)
    return log


@router.get("/self-care/history", response_model=list[SelfCareLogResponse])
def get_log_history(
    days: int = 7,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    since = _app_today(current_user) - timedelta(days=days)
    return (
        db.query(SelfCareLog)
        .filter(
            SelfCareLog.user_id == current_user.id,
            SelfCareLog.log_date >= since,
        )
        .order_by(SelfCareLog.log_date.desc())
        .all()
    )


# ---------------------------------------------------------------------------
# Capacity endpoints
# ---------------------------------------------------------------------------

@router.get("/capacity/today", response_model=CapacitySnapshotResponse | None)
def get_today_capacity(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    snap = db.query(CapacitySnapshot).filter(
        CapacitySnapshot.user_id == current_user.id,
        CapacitySnapshot.log_date == _app_today(current_user),
    ).first()
    if snap is None:
        return None
    from scoring import capacity_tier, max_slots_for
    resp = CapacitySnapshotResponse.model_validate(snap)
    resp.tier = capacity_tier(snap.overall)
    resp.max_slots = max_slots_for(snap.overall)
    return resp


# ---------------------------------------------------------------------------
# Daily summary — EOD reward card data
# ---------------------------------------------------------------------------

@router.get("/self-care/daily-summary")
def get_daily_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    today_start = datetime(today.year, today.month, today.day)

    done_tasks = db.query(Task).filter(
        Task.owner_id == current_user.id,
        Task.status == TaskStatus.done,
        Task.completed_at >= today_start,
        Task.task_type == TaskType.task,
    ).all()

    done_routines = db.query(Task).filter(
        Task.owner_id == current_user.id,
        Task.status == TaskStatus.done,
        Task.completed_at >= today_start,
        Task.task_type == TaskType.routine,
    ).all()

    done_appointments = db.query(Task).filter(
        Task.owner_id == current_user.id,
        Task.status == TaskStatus.done,
        Task.completed_at >= today_start,
        Task.task_type == TaskType.appointment,
    ).all()

    log = db.query(SelfCareLog).filter(
        SelfCareLog.user_id == current_user.id,
        SelfCareLog.log_date == today,
    ).first()

    all_done = done_tasks + done_routines + done_appointments
    total_minutes = sum(t.minutes_spent for t in all_done if t.minutes_spent)

    return {
        "tasks_done": [{"id": t.id, "title": t.title, "minutes_spent": t.minutes_spent} for t in done_tasks],
        "routines_done": [{"id": t.id, "title": t.title, "minutes_spent": t.minutes_spent} for t in done_routines],
        "appointments_done": [{"id": t.id, "title": t.title, "minutes_spent": t.minutes_spent} for t in done_appointments],
        "tasks_done_count": len(done_tasks),
        "routines_done_count": len(done_routines),
        # Kept as an int (0 or 1), not a bool — the EOD summary card already
        # does `medications_taken > 0` / pluralizes on it unchanged.
        "medications_taken": 1 if (log and log.medication_taken) else 0,
        "total_minutes": total_minutes,
        "mood": log.mood if log else None,
        "notes": log.notes if log else None,
    }
