import os
import json
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Project, Task, TaskStatus, TaskType, TaskWeight, User
from schemas import (
    ProjectCreate, ProjectUpdate, ProjectGenerateRequest,
    ProjectResponse, ProjectDetailResponse, TaskResponse,
)
from routes.auth import get_current_user

router = APIRouter(prefix="/projects")


def own_project(project_id: int, user: User, db: Session) -> Project:
    p = db.query(Project).filter(Project.id == project_id, Project.user_id == user.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


def _summary(p: Project, db: Session) -> dict:
    tasks = db.query(Task).filter(
        Task.project_id == p.id,
        Task.status != TaskStatus.deleted,
    ).all()
    done = sum(1 for t in tasks if t.status == TaskStatus.done)
    return {
        "id": p.id, "user_id": p.user_id, "title": p.title,
        "description": p.description, "status": p.status,
        "domain_id": p.domain_id, "domain_name": p.domain_name,
        "created_at": p.created_at, "task_count": len(tasks), "done_count": done,
    }


@router.get("", response_model=list[ProjectResponse])
def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    projects = (
        db.query(Project)
        .filter(Project.user_id == current_user.id, Project.status != "archived")
        .order_by(Project.created_at.desc())
        .all()
    )
    return [_summary(p, db) for p in projects]


@router.post("", response_model=ProjectResponse)
def create_project(
    body: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = Project(
        user_id=current_user.id,
        title=body.title.strip(),
        description=body.description,
        domain_id=body.domain_id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return _summary(p, db)


@router.get("/{project_id}", response_model=ProjectDetailResponse)
def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = own_project(project_id, current_user, db)
    tasks = (
        db.query(Task)
        .options(joinedload(Task.project))
        .filter(Task.project_id == p.id, Task.status != TaskStatus.deleted)
        .order_by(Task.due_date.asc(), Task.created_at.asc())
        .all()
    )
    return {
        "id": p.id, "user_id": p.user_id, "title": p.title,
        "description": p.description, "status": p.status,
        "domain_id": p.domain_id, "domain_name": p.domain_name,
        "created_at": p.created_at, "tasks": tasks,
    }


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: int,
    body: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = own_project(project_id, current_user, db)
    if body.title is not None:
        p.title = body.title.strip()
    if body.description is not None:
        p.description = body.description
    if body.status is not None:
        p.status = body.status
    # Use exclude_unset so explicit null clears the domain
    patch = body.model_dump(exclude_unset=True)
    if "domain_id" in patch:
        p.domain_id = patch["domain_id"]
    db.commit()
    db.refresh(p)
    return _summary(p, db)


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = own_project(project_id, current_user, db)
    db.query(Task).filter(Task.project_id == p.id).update({"project_id": None})
    db.delete(p)
    db.commit()


@router.post("/{project_id}/generate", response_model=list[TaskResponse])
def generate_tasks(
    project_id: int,
    body: ProjectGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY not configured — add it to Render environment variables",
        )

    p = own_project(project_id, current_user, db)

    import anthropic
    client = anthropic.Anthropic(api_key=key)

    prompt = (
        "You are a task planning assistant for someone with ADHD. "
        "Break down this project into small, specific, actionable daily tasks.\n\n"
        "Rules:\n"
        "- Daily budget for project work: 90 minutes\n"
        "- Small tasks: ~45 minutes — up to 2 smalls may share the same day_offset\n"
        "- Medium tasks: ~90 minutes — only 1 medium per day_offset\n"
        "- Never create a single task larger than 90 minutes; always break it down further\n"
        "- day_offset 1 = tomorrow, 2 = day after tomorrow, and so on\n"
        "- Spread tasks realistically; do not pile multiple mediums on one day\n"
        "- Titles must be specific and action-oriented (start with a verb)\n"
        "- Aim for 4–12 tasks total\n"
        "- Return ONLY a valid JSON array — no markdown, no explanation\n\n"
        f"Project: {body.description}\n\n"
        'Format: [{"title":"...","notes":"...or null","size":"small|medium","day_offset":1},...]'
    )

    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = msg.content[0].text.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        end = -1 if lines[-1].strip() == "```" else len(lines)
        raw = "\n".join(lines[1:end])

    try:
        items = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=500, detail="AI returned invalid response — please try again")

    today = date.today()
    created = []
    for item in items:
        offset = max(1, int(item.get("day_offset", 1)))
        weight = TaskWeight.light if item.get("size") == "small" else TaskWeight.medium
        t = Task(
            owner_id=current_user.id,
            project_id=p.id,
            title=str(item.get("title", ""))[:500],
            notes=item.get("notes") or None,
            task_type=TaskType.task,
            status=TaskStatus.inbox,
            weight=weight,
            due_date=today + timedelta(days=offset),
        )
        db.add(t)
        created.append(t)

    db.commit()
    for t in created:
        db.refresh(t)
    return created


@router.post("/{project_id}/tasks/{task_id}", response_model=TaskResponse)
def add_task_to_project(
    project_id: int,
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    own_project(project_id, current_user, db)
    t = db.query(Task).filter(Task.id == task_id, Task.owner_id == current_user.id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    t.project_id = project_id
    db.commit()
    db.refresh(t)
    return t


@router.delete("/{project_id}/tasks/{task_id}", status_code=204)
def remove_task_from_project(
    project_id: int,
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    own_project(project_id, current_user, db)
    t = db.query(Task).filter(Task.id == task_id, Task.owner_id == current_user.id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    t.project_id = None
    db.commit()
