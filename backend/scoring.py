"""Shared capacity/scoring helpers.

Extracted from the old triage scoring engine (routes/triage.py, removed
when the Tournament page was retired). Live code still needs:

  - `capacity_tier`  — selfcare.py buckets the day's capacity for UI copy.
  - `max_slots_for`  — the capacity-driven Today slot count.

All are pure reads (no writes), so they live here free of any route layer.
"""

# Capacity tiers — an overall-capacity number buckets into low/medium/high.
CAPACITY_TIER_LOW = 40.0          # overall < this  → "low"  day
CAPACITY_TIER_HIGH = 70.0         # overall > this  → "high" day

# Today slots at 100% capacity — the scale factor behind max_slots_for.
CAPACITY_SLOTS_AT_FULL = 10

# ORPHANED (4.20.0). Was the capacity-vs-output weighting for the small/big
# effort tag, which the morning review no longer collects — see
# Task.effort's docstring in models.py. Nothing calls effort_points; kept
# only in case a future capacity model wants a per-task weight again.
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


