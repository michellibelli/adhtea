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
  due_today        flat +100 for items due today
  due_soon         decaying boost for items 1-7 days out
  same_day_create  +300 when created_at == due_date — "I just decided this matters"
  project_stall    +20 when project hasn't seen a completion in N+ days
  in_context       +10 when the user's current time-bucket fits the domain
  age_boost        slow creep for items sitting in the inbox a long time
  push_penalty     −5 per snooze/defer to flag chronically-pushed items

The function is intentionally pure (no db writes) — the route layer
caches results onto Task rows.
"""

import json
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import (
    Task, TaskStatus, TaskType, TaskWeight,
    Project, User, CapacitySnapshot,
)
from schemas import TaskResponse, TriageApplyRequest, TriageOverflowRequest
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
MAX_PINS_PER_DAY = 3              # forces real prioritization — pinning everything = pinning nothing


PRIORITY_WEIGHTS = {"urgent": 100, "high": 60, "normal": 30, "low": 10}
PROJECT_STALL_DAYS_THRESHOLD = 7  # no completion in N+ days = stall
INBOX_AGE_BUCKET_DAYS = 7         # one age tick per week
INBOX_AGE_PER_BUCKET = 3
INBOX_AGE_CAP = 15
OVERDUE_PER_DAY = 4
OVERDUE_CAP = 80                  # bumped from 40 — time-pressure must outrank stalled-but-non-urgent project items
DUE_TODAY_BONUS = 100             # bumped from 50 — same reason as OVERDUE_CAP
DUE_SOON_BASELINE = 50
DUE_SOON_PER_DAY_DECAY = 7
CRITICAL_BONUS = 50
PROJECT_STALL_BONUS = 20
IN_CONTEXT_BONUS = 10
PUSH_PENALTY_PER_COUNT = -5
# A task created on the same day it's due is a "I just decided this matters
# today" item. Sized to outrank every other lever combination so these never
# get lost in the list.
SAME_DAY_CREATE_BONUS = 300

# ---------------------------------------------------------------------------
# Capacity-aware selection (Phase 3.7)
#
# The bin-pack already shrinks the day's budget by measured capacity. These
# levers add a *gentle* bias so a low-capacity day favors light work and
# de-emphasizes heavy lifts — the user can still choose a hard thing, it just
# doesn't dominate the auto-placement. Keeps the "warm, never clinical" tone.
# ---------------------------------------------------------------------------
CAPACITY_TIER_LOW = 40.0          # overall < this  → "low"  day
CAPACITY_TIER_HIGH = 70.0         # overall > this  → "high" day
CAPACITY_FIT_HEAVY_PENALTY = -40  # heavy tasks lose this on a low day
CAPACITY_FIT_LIGHT_BONUS = 10     # light tasks gain this on a low day

# Routine load drains task budget: routines don't compete in the bin-pack, but
# a heavy-routine morning still costs real attention. Each due routine instance
# shaves a little task budget, capped so a long routine list can't zero the day.
ROUTINE_DRAIN_PER_INSTANCE = 0.5
ROUTINE_DRAIN_CAP = 4.0


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


def compute_score(
    task: Task,
    *,
    today_local: date,
    now_local: datetime,
    stall_map: Optional[dict[int, bool]] = None,
    cap_tier: str = "medium",
) -> dict:
    """Return {'total': float, 'components': dict[str,int]} for a task.

    `stall_map` is the precomputed result of project_stall_map for the
    user — pass it in when scoring many tasks so each one isn't doing
    its own SQL roundtrip for project completion history.

    `cap_tier` is the user's capacity tier today (low/medium/high). On a low
    day it gently biases the list toward light work; medium/high are no-ops.
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

    # Same-day deadline — task was created on the same day it's due. A
    # deliberate "this matters now" pick; outranks every other lever combo
    # so urgent items can't get drowned out by stalled-but-non-urgent ones.
    if task.created_at and task.due_date and task.created_at.date() == task.due_date:
        c["same_day_create"] = SAME_DAY_CREATE_BONUS

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

    # Capacity fit — gentle low-day bias. Heavy lifts lose ground, light work
    # gains a touch, so the auto-placement leans toward what's actually doable
    # when the user is depleted. Still surfaceable if they choose it.
    if cap_tier == "low":
        w = getattr(task.weight, "value", task.weight) if task.weight else "medium"
        if w == "heavy":
            c["capacity_fit"] = CAPACITY_FIT_HEAVY_PENALTY
        elif w == "light":
            c["capacity_fit"] = CAPACITY_FIT_LIGHT_BONUS

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
    tier = capacity_tier(_latest_capacity(db, user_id, today_local))
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
        result = compute_score(t, today_local=today_local, now_local=now_naive, stall_map=stall, cap_tier=tier)
        t.score = result["total"]
        t.score_components = json.dumps(result["components"])
        t.score_updated_at = datetime.now(timezone.utc)
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
    """Most recent CapacitySnapshot.overall for the user, or default.

    Drives the day's budget. We use `overall` (the weighted blend of all five
    batteries + the executive capacitor) rather than the executive capacitor
    alone, so sleep/food/mood/environment all move the budget — not just the
    novelty-fed capacitor.

    We use the latest snapshot as the projected capacity for ALL days in the
    rolling window. Real per-day variation is unknowable in advance; the
    user can adjust the result via drag-between-days if a particular day
    feels different.
    """
    row = (
        db.query(CapacitySnapshot.overall)
        .filter(
            CapacitySnapshot.user_id == user_id,
            CapacitySnapshot.log_date <= ref_date,
        )
        .order_by(CapacitySnapshot.log_date.desc())
        .first()
    )
    return float(row[0]) if row and row[0] is not None else DEFAULT_CAPACITY


def _routine_drain_for_day(db: Session, user_id: int, day: date) -> float:
    """Task-budget units consumed by the day's due routine instances.

    Routines don't compete in the bin-pack (they happen passively), but a
    heavy-routine morning still costs real attention. Each due routine instance
    shaves a little task budget, capped at ROUTINE_DRAIN_CAP so a long routine
    list can't zero out the day. Routine instances are only generated for the
    current day, so future days in the window naturally see a 0 drain.
    """
    rows = (
        db.query(Task)
        .filter(
            Task.owner_id == user_id,
            Task.task_type == TaskType.routine,
            Task.status.notin_([TaskStatus.done, TaskStatus.deleted]),
        )
        .all()
    )
    count = 0
    for r in rows:
        booked_day = None
        if r.scheduled_date is not None:
            booked_day = r.scheduled_date.date()
        elif r.due_date is not None:
            booked_day = r.due_date
        if booked_day == day:
            count += 1
    return min(ROUTINE_DRAIN_CAP, count * ROUTINE_DRAIN_PER_INSTANCE)


def _task_weight(task: Task) -> int:
    """Map a Task.weight enum to its bin-pack unit cost (1–3)."""
    val = getattr(task.weight, "value", task.weight) if task.weight else "medium"
    return WEIGHT_UNITS.get(val, WEIGHT_UNITS["medium"])


def _committed_weight_for_day(db: Session, user_id: int, day: date) -> int:
    """Weight already booked into a day by appointments. Routines excluded.

    Bin-pack places `task_type=task` items competing for active attention.
    Appointments are time-blocked (real hours consumed) → count as committed.
    Routines happen passively (taking meds, morning coffee, etc.) and don't
    compete for the same attention budget — including them was eating the
    entire day's capacity for users with many daily routines.
    """
    rows = (
        db.query(Task)
        .filter(
            Task.owner_id == user_id,
            Task.task_type == TaskType.appointment,
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
    tier = capacity_tier(capacity)
    base_budget = BASE_BUDGET_UNITS * (capacity / 100.0)

    days = []
    for offset in range(ROLLING_WINDOW_DAYS):
        d = today_local + timedelta(days=offset)
        booked = _committed_weight_for_day(db, user_id, d)
        drain = _routine_drain_for_day(db, user_id, d)
        days.append({
            "date": d,
            "budget": max(0.0, base_budget),
            "committed": booked,
            "routine_drain": drain,
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

    # Phase 1 — place pinned items first, in their pinned_for day, regardless
    # of budget. Pins are the user's explicit override: "this WILL happen on
    # this day." If pinning busts the budget, the day shows as over-capacity
    # in the UI but the placement holds. Pins outside the window are
    # ignored here (their entry into the window happens automatically once
    # today rolls forward to their pinned_for date).
    day_by_date = {d["date"]: d for d in days}
    pinned, unpinned = [], []
    for t in pool:
        if t.pinned_for is not None and t.pinned_for in day_by_date:
            pinned.append(t)
        else:
            unpinned.append(t)

    for t in pinned:
        d = day_by_date[t.pinned_for]
        d["items"].append(t)
        d["used"] += _task_weight(t)

    # Phase 2 — score the remaining pool fresh, greedy-place into remaining
    # budget. Scoring still happens for pinned items below (we want the
    # cached score and components up-to-date for the Why-this tooltip), but
    # placement of unpinned items is what the scoring drives.
    stall = project_stall_map(db, user_id, today_local)
    scored = []
    for t in unpinned:
        r = compute_score(t, today_local=today_local, now_local=now_local, stall_map=stall, cap_tier=tier)
        scored.append((r["total"], t))
    scored.sort(key=lambda x: x[0], reverse=True)

    overflow = []
    for score, task in scored:
        w = _task_weight(task)
        placed = False
        for d in days:
            if d["used"] + d["committed"] + d["routine_drain"] + w <= d["budget"]:
                d["items"].append(task)
                d["used"] += w
                placed = True
                break
        if not placed:
            overflow.append(task)

    return days, overflow


def _serialize_layout(days, overflow):
    """Convert the bin-pack output into JSON-friendly response shape."""
    today = days[0] if days else None
    today_remaining = max(0.0, today["budget"] - today["committed"] - today["routine_drain"]) if today else 0.0
    avg_weight = WEIGHT_UNITS["medium"]
    return {
        "window_days": ROLLING_WINDOW_DAYS,
        "today_capacity": {
            "budget": today["budget"] if today else 0,
            "committed": today["committed"] if today else 0,
            "routine_drain": today["routine_drain"] if today else 0,
            "remaining": today_remaining,
            "max_slots": int(today_remaining // avg_weight) if avg_weight else 0,
        },
        "days": [
            {
                "date": d["date"].isoformat(),
                "budget": d["budget"],
                "committed": d["committed"],
                "routine_drain": d["routine_drain"],
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


@router.post("/tasks/{task_id}/pin", response_model=TaskResponse)
def pin_task(
    task_id: int,
    pin_date: date = Body(..., embed=True, alias="date"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Pin a task to a specific day. Bin-pack will respect the pin over its
    own score-driven placement. Max MAX_PINS_PER_DAY pins per day so the
    user can't pin everything (which would defeat the prioritization signal).
    """
    tz = ZoneInfo(getattr(current_user, "timezone", None) or "America/Los_Angeles")
    today_local = datetime.now(tz).date()
    if pin_date < today_local:
        raise HTTPException(status_code=400, detail="Cannot pin to a past day")

    task = (
        db.query(Task)
        .filter(Task.id == task_id, Task.owner_id == current_user.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.task_type != TaskType.task:
        raise HTTPException(status_code=400, detail="Only tasks can be pinned")

    # Re-pinning the same task to the same day is a no-op success.
    if task.pinned_for != pin_date:
        existing = (
            db.query(Task)
            .filter(
                Task.owner_id == current_user.id,
                Task.pinned_for == pin_date,
                Task.id != task_id,
            )
            .count()
        )
        if existing >= MAX_PINS_PER_DAY:
            raise HTTPException(
                status_code=409,
                detail=f"Day already has {MAX_PINS_PER_DAY} pins",
            )
        task.pinned_for = pin_date
        db.commit()
        db.refresh(task)
    return task


@router.delete("/tasks/{task_id}/pin", response_model=TaskResponse)
def unpin_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = (
        db.query(Task)
        .filter(Task.id == task_id, Task.owner_id == current_user.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.pinned_for = None
    db.commit()
    db.refresh(task)
    return task


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


@router.post("/apply-ordered")
def apply_ordered(
    body: TriageApplyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply the user's manually ordered triage list.

    Walks the ordered task IDs accumulating weight against today's capacity
    budget.  Tasks within budget are placed as status=today; overflow IDs
    are returned so the frontend can present the bump-to-tomorrow UI.
    """
    tz = ZoneInfo(getattr(current_user, "timezone", None) or "America/Los_Angeles")
    now_local = datetime.now(tz).replace(tzinfo=None)
    today_local = now_local.date()
    today_midnight = datetime(today_local.year, today_local.month, today_local.day)

    capacity = _latest_capacity(db, current_user.id, today_local)
    base_budget = BASE_BUDGET_UNITS * (capacity / 100.0)
    committed = _committed_weight_for_day(db, current_user.id, today_local)
    routine_drain = _routine_drain_for_day(db, current_user.id, today_local)
    remaining = max(0.0, base_budget - committed - routine_drain)

    task_map = {}
    if body.ordered_task_ids:
        rows = (
            db.query(Task)
            .filter(
                Task.id.in_(body.ordered_task_ids),
                Task.owner_id == current_user.id,
                Task.task_type == TaskType.task,
                Task.status.in_([TaskStatus.inbox, TaskStatus.today]),
            )
            .all()
        )
        task_map = {t.id: t for t in rows}

    placed_ids = []
    overflow_ids = []
    used = 0.0

    for idx, tid in enumerate(body.ordered_task_ids):
        task = task_map.get(tid)
        if not task:
            continue
        w = _task_weight(task)
        if used + w <= remaining:
            task.status = TaskStatus.today
            task.due_date = today_local
            task.scheduled_date = today_midnight
            task.sort_order = float(idx)
            placed_ids.append(tid)
            used += w
        else:
            overflow_ids.append(tid)

    recompute_user_scores(db, current_user.id, today_local, now_local)
    db.commit()

    return {
        "placed": placed_ids,
        "overflow": overflow_ids,
        "budget": base_budget,
        "committed": committed,
        "routine_drain": routine_drain,
        "used": used,
    }


@router.post("/resolve-overflow")
def resolve_overflow(
    body: TriageOverflowRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Resolve over-capacity tasks after triage apply.

    keep_today_ids:  force onto today (user accepts overload).
    bump_ids:        push to tomorrow at top of the list (sort_order 0,1,2…).
    """
    tz = ZoneInfo(getattr(current_user, "timezone", None) or "America/Los_Angeles")
    now_local = datetime.now(tz).replace(tzinfo=None)
    today_local = now_local.date()
    tomorrow = today_local + timedelta(days=1)
    today_midnight = datetime(today_local.year, today_local.month, today_local.day)

    all_ids = body.keep_today_ids + body.bump_ids
    if not all_ids:
        return {"ok": True}

    rows = (
        db.query(Task)
        .filter(
            Task.id.in_(all_ids),
            Task.owner_id == current_user.id,
        )
        .all()
    )
    task_map = {t.id: t for t in rows}

    for tid in body.keep_today_ids:
        task = task_map.get(tid)
        if not task:
            continue
        task.status = TaskStatus.today
        task.due_date = today_local
        task.scheduled_date = today_midnight

    for idx, tid in enumerate(body.bump_ids):
        task = task_map.get(tid)
        if not task:
            continue
        task.status = TaskStatus.inbox
        task.due_date = tomorrow
        task.scheduled_date = None
        task.sort_order = float(idx)
        task.push_count = (task.push_count or 0) + 1

    recompute_user_scores(db, current_user.id, today_local, now_local)
    db.commit()

    return {"ok": True}
