from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import MedicationSchedule, MedicationLog, utcnow
from schemas import (
    MedicationScheduleCreate, MedicationScheduleUpdate,
    MedicationScheduleResponse, MedicationLogResponse,
)
from routes.auth import get_current_user
from models import User

router = APIRouter()


@router.get("/medication", response_model=list[MedicationScheduleResponse])
def list_schedules(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(MedicationSchedule)
        .filter(
            MedicationSchedule.user_id == current_user.id,
            MedicationSchedule.active == True,
        )
        .order_by(MedicationSchedule.created_at.asc())
        .all()
    )


@router.post("/medication", response_model=MedicationScheduleResponse)
def create_schedule(
    body: MedicationScheduleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    schedule = MedicationSchedule(
        user_id=current_user.id,
        name=body.name.strip(),
        reminder_times=body.reminder_times,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


@router.patch("/medication/{schedule_id}", response_model=MedicationScheduleResponse)
def update_schedule(
    schedule_id: int,
    body: MedicationScheduleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    schedule = db.query(MedicationSchedule).filter(
        MedicationSchedule.id == schedule_id,
        MedicationSchedule.user_id == current_user.id,
    ).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Medication schedule not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(schedule, field, value)
    db.commit()
    db.refresh(schedule)
    return schedule


@router.delete("/medication/{schedule_id}")
def delete_schedule(
    schedule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    schedule = db.query(MedicationSchedule).filter(
        MedicationSchedule.id == schedule_id,
        MedicationSchedule.user_id == current_user.id,
    ).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Medication schedule not found")
    schedule.active = False
    db.commit()
    return {"ok": True}


@router.post("/medication/{schedule_id}/log", response_model=MedicationLogResponse)
def log_taken(
    schedule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    schedule = db.query(MedicationSchedule).filter(
        MedicationSchedule.id == schedule_id,
        MedicationSchedule.user_id == current_user.id,
    ).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Medication schedule not found")

    today = date.today()
    existing = db.query(MedicationLog).filter(
        MedicationLog.schedule_id == schedule_id,
        MedicationLog.log_date == today,
    ).first()
    if existing:
        return existing  # idempotent — already logged today

    log = MedicationLog(
        schedule_id=schedule_id,
        user_id=current_user.id,
        log_date=today,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    # Meds feed the executive-capacitor term, so refresh today's capacity
    # snapshot (no-op until she's done the self-care check-in for the day).
    from routes.selfcare import recompute_snapshot
    recompute_snapshot(db, current_user.id, today)
    return log


@router.get("/medication/{schedule_id}/log/today", response_model=MedicationLogResponse | None)
def get_today_log(
    schedule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(MedicationLog).filter(
        MedicationLog.schedule_id == schedule_id,
        MedicationLog.user_id == current_user.id,
        MedicationLog.log_date == date.today(),
    ).first()
