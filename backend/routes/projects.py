import os
import json
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Domain, Project, Task, TaskStatus, TaskType, TaskWeight, User
from schemas import (
    ProjectCreate, ProjectUpdate, ProjectGenerateRequest,
    ProjectResponse, ProjectDetailResponse, TaskResponse,
)
from routes.auth import get_current_user
from routes.domain_utils import next_allowed_date, domain_days_prompt_hint

router = APIRouter(prefix="/projects")


def own_project(project_id: int, user: User, db: Session) -> Project:
    p = db.query(Project).filter(Project.id == project_id, Project.user_id == user.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


def _project_summary(p: Project, db: Session) -> dict:
    """Build the response dict for a single project (used after create/update).

    For listing many projects at once, use _batch_project_summaries() instead
    to avoid one DB query per project.
    """
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


def _batch_project_summaries(projects: list[Project], db: Session) -> list[dict]:
    """Build response dicts for many projects in a SINGLE database query.

    Without this, listing 10 projects would hit the database 11 times:
    once for the project list, then once per project to count its tasks.
    This fetches all task counts in one GROUP BY query and assembles the results.
    """
    if not projects:
        return []
    proj_ids = [p.id for p in projects]

    # One query: count tasks grouped by (project_id, status)
    rows = (
        db.query(Task.project_id, Task.status, func.count(Task.id).label("cnt"))
        .filter(
            Task.project_id.in_(proj_ids),
            Task.status != TaskStatus.deleted,
        )
        .group_by(Task.project_id, Task.status)
        .all()
    )

    # Roll counts up into {project_id: {total, done}}
    counts: dict[int, dict] = {}
    for proj_id, status, cnt in rows:
        if proj_id not in counts:
            counts[proj_id] = {"total": 0, "done": 0}
        counts[proj_id]["total"] += cnt
        if status == TaskStatus.done:
            counts[proj_id]["done"] += cnt

    return [
        {
            "id": p.id, "user_id": p.user_id, "title": p.title,
            "description": p.description, "status": p.status,
            "domain_id": p.domain_id, "domain_name": p.domain_name,
            "created_at": p.created_at,
            "task_count": counts.get(p.id, {}).get("total", 0),
            "done_count":  counts.get(p.id, {}).get("done", 0),
        }
        for p in projects
    ]


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
    return _batch_project_summaries(projects, db)


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
    return _project_summary(p, db)


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
    return _project_summary(p, db)


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

    # Load domain rules for date snapping and prompt hint
    domain_rules = []
    days_hint = ""
    if p.domain_id:
        domain_obj = db.query(Domain).filter(Domain.id == p.domain_id).first()
        if domain_obj:
            domain_rules = json.loads(domain_obj.rules or "[]")
            days_hint = domain_days_prompt_hint(domain_rules)

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
        + days_hint + "\n"
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
        raw_date = today + timedelta(days=offset)
        due = next_allowed_date(raw_date, domain_rules) if domain_rules else raw_date
        t = Task(
            owner_id=current_user.id,
            project_id=p.id,
            title=str(item.get("title", ""))[:500],
            notes=item.get("notes") or None,
            task_type=TaskType.task,
            status=TaskStatus.inbox,
            weight=weight,
            due_date=due,
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
