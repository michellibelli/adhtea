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
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import (
    Task, TaskStatus, TaskType, TaskWeight,
    Project, User, CapacitySnapshot,
)
from schemas import TaskResponse
from routes.auth import get_current_user
from routes.domain_utils import effective_rules, time_of_day_allowed

router = APIRouter(prefix="/triage", tags=["triage"])

# Bin-pack constants. Tuned for a "full capacity day = 10 medium tasks worth
# of work." Weight units are intentionally coarse — the user's gut feeling
# about a day being heavy/medium/light is more useful than precise hours.
WEIGHT_UNITS = {"light": 1, "medium": 2, "heavy": 3}
BASE_BUDGET_UNITS = 20.0          # capacity-100 day = 20 units = ~10 medium tasks
DEFAULT_CAPACITY = 60.0           # used when there's no CapacitySnapshot yet
ROLLING_WINDOW_DAYS = 7


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


# ---------------------------------------------------------------------------
# Bin-pack engine (R2)
# ---------------------------------------------------------------------------

def _latest_capacity(db: Session, user_id: int, ref_date: date) -> float:
    """Most recent CapacitySnapshot.executive_capacitor for the user, or default.

    We use the latest snapshot as the projected capacity for ALL days in the
    rolling window. Real per-day variation is unknowable in advance; the
    user can adjust the result via drag-between-days if a particular day
    feels different.
    """
    row = (
        db.query(CapacitySnapshot.executive_capacitor)
        .filter(
            CapacitySnapshot.user_id == user_id,
            CapacitySnapshot.log_date <= ref_date,
        )
        .order_by(CapacitySnapshot.log_date.desc())
        .first()
    )
    return float(row[0]) if row and row[0] is not None else DEFAULT_CAPACITY


def _task_weight(task: Task) -> int:
    """Map a Task.weight enum to its bin-pack unit cost (1–3)."""
    val = getattr(task.weight, "value", task.weight) if task.weight else "medium"
    return WEIGHT_UNITS.get(val, WEIGHT_UNITS["medium"])


def _committed_weight_for_day(db: Session, user_id: int, day: date) -> int:
    """Weight already booked into a given day by appointments + routines.

    Bin-pack only places `task_type=task` items, so the appointment + routine
    weight already on that day is a fixed cost that reduces the budget.
    Looks for both `scheduled_date` (today-status rows already placed) and
    `due_date` matches (future appointments with explicit dates).
    """
    rows = (
        db.query(Task)
        .filter(
            Task.owner_id == user_id,
            Task.task_type.in_([TaskType.appointment, TaskType.routine]),
            Task.status.notin_([TaskStatus.done, TaskStatus.deleted]),
        )
        .all()
    )
    total = 0
    for r in rows:
        booked_day = None
        if r.scheduled_date is not None:
            booked_day = r.scheduled_date.date()
        elif r.due_date is not None:
            booked_day = r.due_date
        if booked_day == day:
            total += _task_weight(r)
    return total


def _bin_pack(db: Session, user_id: int, today_local: date, now_local: datetime):
    """Run the bin-pack and return a (days, overflow) tuple.

    days: list of dicts {date, budget, used, items: [Task]}.
    overflow: list of Task rows that didn't fit anywhere in the window.

    Pure planning — does NOT mutate Task rows. Callers (preview vs run)
    decide whether to persist the placement.
    """
    capacity = _latest_capacity(db, user_id, today_local)
    base_budget = BASE_BUDGET_UNITS * (capacity / 100.0)

    days = []
    for offset in range(ROLLING_WINDOW_DAYS):
        d = today_local + timedelta(days=offset)
        booked = _committed_weight_for_day(db, user_id, d)
        days.append({
            "date": d,
            "budget": max(0.0, base_budget),
            "committed": booked,
            "used": 0,
            "items": [],
        })

    # Pool = all live `task` rows (inbox + today). Snoozed items wait for
    # their snooze_until to expire — bin-pack shouldn't drag them back in.
    pool = (
        db.query(Task)
        .options(joinedload(Task.project).joinedload(Project.domain), joinedload(Task.domain))
        .filter(
            Task.owner_id == user_id,
            Task.task_type == TaskType.task,
            Task.status.in_([TaskStatus.inbox, TaskStatus.today]),
        )
        .all()
    )

    # Score everything fresh so the placement reflects current state, not
    # whatever's cached on the row.
    stall = project_stall_map(db, user_id, today_local)
    scored = []
    for t in pool:
        r = compute_score(t, today_local=today_local, now_local=now_local, stall_map=stall)
        scored.append((r["total"], t, r["components"]))

    scored.sort(key=lambda x: x[0], reverse=True)

    overflow = []
    for score, task, components in scored:
        w = _task_weight(task)
        placed = False
        for d in days:
            if d["used"] + d["committed"] + w <= d["budget"]:
                d["items"].append(task)
                d["used"] += w
                placed = True
                break
        if not placed:
            overflow.append(task)

    return days, overflow


def _serialize_layout(days, overflow):
    """Convert the bin-pack output into JSON-friendly response shape."""
    return {
        "window_days": ROLLING_WINDOW_DAYS,
        "days": [
            {
                "date": d["date"].isoformat(),
                "budget": d["budget"],
                "committed": d["committed"],
                "used": d["used"],
                "items": [TaskResponse.model_validate(t).model_dump(mode="json") for t in d["items"]],
            }
            for d in days
        ],
        "overflow": [TaskResponse.model_validate(t).model_dump(mode="json") for t in overflow],
    }


@router.post("/preview")
def preview(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Run bin-pack without persisting. Returns the proposed day layout.

    Frontend uses this to show "here's what triage will do" before the
    user commits, so the action is reversible at the design level (you
    see the result first).
    """
    tz = ZoneInfo(getattr(current_user, "timezone", None) or "America/Los_Angeles")
    now_local = datetime.now(tz).replace(tzinfo=None)
    today_local = now_local.date()
    days, overflow = _bin_pack(db, current_user.id, today_local, now_local)
    return _serialize_layout(days, overflow)


@router.post("/run")
def run(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply the bin-pack: persist day placements onto task rows.

    Day 0 (today): status=today, due_date=today, scheduled_date=today.
    Days 1..6:     status=inbox, due_date=day, scheduled_date=None.
    Overflow:      status=inbox, due_date=None, scheduled_date=None.

    push_count is NOT incremented here — that penalty is for explicit
    user-driven snooze/defer, not for automatic re-placement. Otherwise
    a user who just runs triage daily would watch every task's score
    decay even when they're engaging with the system correctly.
    """
    tz = ZoneInfo(getattr(current_user, "timezone", None) or "America/Los_Angeles")
    now_local = datetime.now(tz).replace(tzinfo=None)
    today_local = now_local.date()
    days, overflow = _bin_pack(db, current_user.id, today_local, now_local)

    # Today's scheduled_date midnight, naive, matches existing _day_start convention
    today_midnight = datetime(today_local.year, today_local.month, today_local.day)

    for i, d in enumerate(days):
        for sort_idx, task in enumerate(d["items"]):
            if i == 0:
                task.status = TaskStatus.today
                task.scheduled_date = today_midnight
                task.due_date = today_local
                task.sort_order = float(sort_idx)   # within today, top-scored first
            else:
                task.status = TaskStatus.inbox
                task.scheduled_date = None
                task.due_date = d["date"]
                task.sort_order = None

    for task in overflow:
        task.status = TaskStatus.inbox
        task.scheduled_date = None
        task.due_date = None
        task.sort_order = None

    # Cache the freshly computed scores onto the rows now that we've placed
    # them — saves a second recompute pass if the UI immediately calls
    # /tasks/today afterward.
    recompute_user_scores(db, current_user.id, today_local, now_local)
    db.commit()

    return _serialize_layout(days, overflow)
