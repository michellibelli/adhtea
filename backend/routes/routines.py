from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Routine, Task, TaskType, TaskStatus, utcnow
from schemas import RoutineCreate, RoutineUpdate, RoutineResponse, TaskResponse
from routes.auth import get_current_user
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
        time_of_day=body.time_of_day,
        days_of_week=body.days_of_week,
        only_when_present=body.only_when_present,
        exact_time=body.exact_time,
    )
    db.add(routine)
    db.commit()
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
