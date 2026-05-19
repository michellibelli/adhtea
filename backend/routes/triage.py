"""Triage scoring engine (R1 of the triage redesign).

Computes a per-task `score` from explainable components so the bin-pack
(R2) and the Focus card "Why this?" tooltip (R4) can read one number
and the breakdown that produced it.

Score is a number, not a percentile. Higher = more deserving of "do
now" attention. The component breakdown is stored as JSON in
`Task.score_components` so the UI can render the reasoning.

Levers (each contributes a signed integer; total is the sum):
  priority         user's explicit priority enum (urgent/high/normal/low)
  critical_bonus   +50 when `is_critical` is true
  overdue_boost    capped boost for past-due items (won't infinitely dominate)
  due_today        flat +50 for items due today
  due_soon         decaying boost for items 1-7 days out
  project_stall    +20 when project hasn't seen a completion in N+ days
  in_context       +10 when the user's current time-bucket fits the domain
  age_boost        slow creep for items sitting in the inbox a long time
  push_penalty     −5 per snooze/defer to flag chronically-pushed items

The function is intentionally pure (no db writes) — the route layer
caches results onto Task rows.
"""

import json
from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Task, TaskStatus, Project, User
from routes.auth import get_current_user
from routes.domain_utils import effective_rules, time_of_day_allowed

router = APIRouter(prefix="/triage", tags=["triage"])


PRIORITY_WEIGHTS = {"urgent": 100, "high": 60, "normal": 30, "low": 10}
PROJECT_STALL_DAYS_THRESHOLD = 7  # no completion in N+ days = stall
INBOX_AGE_BUCKET_DAYS = 7         # one age tick per week
INBOX_AGE_PER_BUCKET = 3
INBOX_AGE_CAP = 15
OVERDUE_PER_DAY = 4
OVERDUE_CAP = 40
DUE_TODAY_BONUS = 50
DUE_SOON_BASELINE = 50
DUE_SOON_PER_DAY_DECAY = 7
CRITICAL_BONUS = 50
PROJECT_STALL_BONUS = 20
IN_CONTEXT_BONUS = 10
PUSH_PENALTY_PER_COUNT = -5


def project_stall_map(db: Session, user_id: int, today_local: date) -> dict[int, bool]:
    """Map of project_id → True when the project hasn't seen a completion
    in the threshold window.

    Stalling projects boost ALL their incomplete tasks so the user nudges
    the project forward instead of letting it rot. A project with zero
    completions ever counts as stalled the moment it's older than
    threshold days (otherwise brand-new projects would auto-stall).
    """
    cutoff = today_local - timedelta(days=PROJECT_STALL_DAYS_THRESHOLD)
    projects = db.query(Project).filter(Project.user_id == user_id).all()
    stall = {}
    for p in projects:
        last = (
            db.query(Task.completed_at)
            .filter(
                Task.project_id == p.id,
                Task.status == TaskStatus.done,
                Task.completed_at.isnot(None),
            )
            .order_by(Task.completed_at.desc())
            .first()
        )
        if last and last[0] is not None:
            stall[p.id] = last[0].date() < cutoff
        else:
            # No completions ever — stall when the project itself is older
            # than the threshold (created_at). Brand-new projects don't count.
            stall[p.id] = bool(p.created_at and p.created_at.date() < cutoff)
    return stall


def compute_score(
    task: Task,
    *,
    today_local: date,
    now_local: datetime,
    stall_map: Optional[dict[int, bool]] = None,
) -> dict:
    """Return {'total': float, 'components': dict[str,int]} for a task.

    `stall_map` is the precomputed result of project_stall_map for the
    user — pass it in when scoring many tasks so each one isn't doing
    its own SQL roundtrip for project completion history.
    """
    c: dict[str, int] = {}

    # Priority — fall back to "normal" when missing
    pri_key = getattr(task.priority, "value", task.priority) if task.priority else None
    c["priority"] = PRIORITY_WEIGHTS.get(pri_key, PRIORITY_WEIGHTS["normal"])

    if task.is_critical:
        c["critical_bonus"] = CRITICAL_BONUS

    # Due-date relative to today
    if task.due_date:
        delta = (task.due_date - today_local).days
        if delta < 0:
            # Overdue boost capped so a 6-month-old item doesn't crowd
            # out everything else forever
            c["overdue_boost"] = min(OVERDUE_CAP, -delta * OVERDUE_PER_DAY)
        elif delta == 0:
            c["due_today"] = DUE_TODAY_BONUS
        elif delta <= 7:
            # Linear decay: +50 at 1 day out, +1 at 7 days out
            c["due_soon"] = max(0, DUE_SOON_BASELINE - delta * DUE_SOON_PER_DAY_DECAY)

    # Project stall — boost when the parent project has gone quiet
    if task.project_id and stall_map and stall_map.get(task.project_id):
        c["project_stall"] = PROJECT_STALL_BONUS

    # Time-of-day context match. Off-context tasks aren't penalized here
    # (the deprioritize-sort in /tasks/today handles that). Being in-context
    # adds a small bonus so otherwise-equal tasks favor the right-now item.
    rules = effective_rules(task)
    if rules and time_of_day_allowed(now_local, rules):
        c["in_context"] = IN_CONTEXT_BONUS

    # Inbox age creep — prevents anything in the inbox from rotting forever
    if task.created_at:
        age_days = (today_local - task.created_at.date()).days
        if age_days >= INBOX_AGE_BUCKET_DAYS:
            buckets = age_days // INBOX_AGE_BUCKET_DAYS
            c["age_boost"] = min(INBOX_AGE_CAP, buckets * INBOX_AGE_PER_BUCKET)

    # Push penalty — every snooze/defer subtracts. After enough pushes
    # the score collapses and R5 surfaces an archive prompt.
    if task.push_count:
        c["push_penalty"] = PUSH_PENALTY_PER_COUNT * task.push_count

    total = float(sum(c.values()))
    return {"total": total, "components": c}


def recompute_user_scores(db: Session, user_id: int, today_local: date, now_local: datetime) -> int:
    """Recompute scores for all live `task`-type rows owned by user.

    Live = inbox + today + snoozed. Routines and appointments are
    skipped because they don't compete in the bin-pack (they're scheduled
    events; existing time-window logic surfaces them). Returns the
    number of rows updated.
    """
    from models import TaskType
    stall = project_stall_map(db, user_id, today_local)
    rows = (
        db.query(Task)
        .filter(
            Task.owner_id == user_id,
            Task.task_type == TaskType.task,
            Task.status.in_([TaskStatus.inbox, TaskStatus.today, TaskStatus.snoozed]),
        )
        .all()
    )
    now_naive = datetime.now() if now_local is None else now_local
    for t in rows:
        result = compute_score(t, today_local=today_local, now_local=now_naive, stall_map=stall)
        t.score = result["total"]
        t.score_components = json.dumps(result["components"])
        t.score_updated_at = datetime.utcnow()
    if rows:
        db.commit()
    return len(rows)


@router.post("/recompute")
def recompute(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Recompute scores for the current user's live tasks. Returns count updated.

    Cheap operation (one project-stall map + one task scan). Frontend
    calls this from the Triage page "Recompute" button. The nightly
    auto-run will use the same function via a background scheduler in R2.
    """
    tz = ZoneInfo(getattr(current_user, "timezone", None) or "America/Los_Angeles")
    now_local = datetime.now(tz).replace(tzinfo=None)
    today_local = now_local.date()
    n = recompute_user_scores(db, current_user.id, today_local, now_local)
    return {"updated": n}
