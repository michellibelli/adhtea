"""Shared capacity/scoring helpers.

Extracted from the old triage scoring engine (routes/triage.py, removed
when the Tournament page was retired). These two helpers survived because
live code still needs them:

  - `capacity_tier`     — selfcare.py buckets the day's capacity for UI copy.
  - `project_stall_map` — insights.py boosts stalled-project nudges.

Both are pure reads (no writes), so they live here free of any route layer.
"""

from datetime import date, timedelta

from sqlalchemy.orm import Session

from models import Task, TaskStatus, Project

# Capacity tiers — an overall-capacity number buckets into low/medium/high.
CAPACITY_TIER_LOW = 40.0          # overall < this  → "low"  day
CAPACITY_TIER_HIGH = 70.0         # overall > this  → "high" day

# A project with no completion in this many days counts as stalled.
PROJECT_STALL_DAYS_THRESHOLD = 7


def capacity_tier(overall: float) -> str:
    """Bucket an overall-capacity number into low / medium / high."""
    if overall < CAPACITY_TIER_LOW:
        return "low"
    if overall > CAPACITY_TIER_HIGH:
        return "high"
    return "medium"


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
