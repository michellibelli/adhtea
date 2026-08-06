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

# Today slots at 100% capacity — the scale factor behind max_slots_for.
CAPACITY_SLOTS_AT_FULL = 10

# Effort weighting — a finished task's contribution to a day's output. The
# single source of truth for the small/big ratio; the capacity-vs-output
# analysis sums these instead of counting tasks equally. A big task is worth
# two smalls. An unreviewed (null) effort scores as one small until tagged.
EFFORT_POINTS = {"small": 1, "big": 2}


def effort_points(effort) -> int:
    """Points for a task's effort tag (Effort enum, its string value, or None).
    None → 1 (treated as a small until reviewed)."""
    key = getattr(effort, "value", effort)
    return EFFORT_POINTS.get(key, 1)


def max_slots_for(overall: float) -> int:
    """How many Today slots a day's overall capacity is worth.

    Drives both the `(X/N)` chip on Today and the ceiling auto-promotion fills
    to, so the number she plans against is the number the promoter respects.
    Floored at 1 — a terrible day still gets one thing."""
    return max(1, round(CAPACITY_SLOTS_AT_FULL * (overall / 100.0)))


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
