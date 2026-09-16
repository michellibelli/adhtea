from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Routine, Task, TaskType, TaskStatus, utcnow
from schemas import RoutineCreate, RoutineUpdate, RoutineResponse, TaskResponse
from routes.auth import get_current_user
from routes.task_lifecycle import generate_routine_instances
from models import User

router = APIRouter()


@router.get("/routines", response_model=list[RoutineResponse])
def list_routines(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Routine)
        .filter(Routine.user_id == current_user.id)
        .order_by(Routine.created_at.asc())
        .all()
    )


@router.post("/routines", response_model=RoutineResponse)
def create_routine(
    body: RoutineCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    routine = Routine(
        user_id=current_user.id,
        title=body.title.strip(),
        notes=body.notes,
        frequency=body.frequency,
        bucket=body.bucket,
        days_of_week=body.days_of_week,
        only_when_present=body.only_when_present,
        exact_time=body.exact_time,
    )
    db.add(routine)
    db.commit()
    # Spawn today's instance now if it's due — the daily rollover sweep only runs
    # once per day, so a routine added mid-day would otherwise not appear until
    # tomorrow. Idempotent and respects the day-start gate.
    generate_routine_instances(current_user, db)
    db.refresh(routine)
    return routine


@router.patch("/routines/{routine_id}", response_model=RoutineResponse)
def update_routine(
    routine_id: int,
    body: RoutineUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    routine = db.query(Routine).filter(
        Routine.id == routine_id,
        Routine.user_id == current_user.id,
    ).first()
    if not routine:
        raise HTTPException(status_code=404, detail="Routine not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(routine, field, value)
    db.commit()
    # Re-evaluate today's instance in case the edit made it due today (e.g.
    # reactivated, or day/frequency changed to include today).
    generate_routine_instances(current_user, db)
    db.refresh(routine)
    return routine


@router.delete("/routines/{routine_id}")
def deactivate_routine(
    routine_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    routine = db.query(Routine).filter(
        Routine.id == routine_id,
        Routine.user_id == current_user.id,
    ).first()
    if not routine:
        raise HTTPException(status_code=404, detail="Routine not found")
    routine.active = False
    db.commit()
    return {"ok": True}


@router.get("/routines/missed", response_model=list[TaskResponse])
def get_missed_routines(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    today_dt = datetime(today.year, today.month, today.day)
    return (
        db.query(Task)
        .filter(
            Task.owner_id == current_user.id,
            Task.task_type == TaskType.routine,
            Task.status == TaskStatus.inbox,
            Task.scheduled_date != None,
            Task.scheduled_date < today_dt,
        )
        .order_by(Task.scheduled_date.desc())
        .all()
    )
