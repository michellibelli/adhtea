"""
One-time import script: Notion Tasks CSV → ARIA database.

Usage (from backend folder, with server stopped):
    python import_notion.py

Targets user_id=1 (primary account). Run after the server has created tables at
least once (aria.db must exist). Stop the server first to avoid locking.
"""

import csv
import sys
import os
from datetime import datetime, date

# ── Ensure we can import app modules ─────────────────────────────────────────
sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal, engine, Base
from models import (
    Task, TaskStatus, TaskType, Priority,
    Routine, RoutineFrequency, TimeOfDay, utcnow
)

Base.metadata.create_all(bind=engine)

TASKS_CSV = (
    r"C:\Users\Rose Family\Desktop"
    r"\3f54d7ba-0307-465f-a2dd-7dae40ffb125_ExportBlock-f6679df1-e4e8-47e3-b7a4-4759610205ff"
    r"\ExportBlock-f6679df1-e4e8-47e3-b7a4-4759610205ff-Part-1"
    r"\Tasks and Projects\Databases"
    r"\Tasks [UT] 22b213f838a38147b5feeff378c34b7d_all.csv"
)

TARGET_USER_ID = 1

# Tasks that are superseded by ARIA itself — skip them
SKIP_TITLES = {
    "prioritize tasks for today",
    "3 - learn to use recurring tasks",
    "4 - capture tasks instantly from any website",
}

# ── Date parsing ──────────────────────────────────────────────────────────────

def parse_due(raw: str):
    """Return (due_date, due_time_str) from Notion due string like
    'May 7, 2026 8:00 AM (PDT)' or 'May 8, 2026'."""
    if not raw:
        return None, None
    raw = raw.strip()
    # Strip timezone suffix "(PDT)", "(PST)", etc.
    if '(' in raw:
        raw = raw[:raw.index('(')].strip()
    for fmt in ("%B %d, %Y %I:%M %p", "%B %d, %Y %I:%M%p",
                "%B %d, %Y", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(raw, fmt)
            d = dt.date()
            t = dt.strftime("%H:%M") if any(c.isdigit() for c in raw.split(',')[-1]) and ':' in raw else None
            return d, t
        except ValueError:
            continue
    return None, None


# ── Frequency mapping ─────────────────────────────────────────────────────────

WEEKDAY_NAMES = {
    "mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6,
}

def recur_to_frequency(interval: str, unit: str, title: str):
    """Map Notion recurrence to (RoutineFrequency, days_of_week, time_of_day)."""
    interval = int(interval.strip()) if interval.strip().isdigit() else 1
    unit = unit.strip().lower()

    if unit == "day(s)":
        if interval == 1:
            return RoutineFrequency.daily, None
        if interval == 7:
            return RoutineFrequency.weekly, None
    if unit == "week(s)" and interval == 1:
        # Try to guess day from title like "Therapy with Ross (Wed)"
        lower = title.lower()
        for abbr, idx in WEEKDAY_NAMES.items():
            if f"({abbr}" in lower or f" {abbr}" in lower or f"({abbr.capitalize()}" in lower:
                return RoutineFrequency.weekly, str(idx)
        return RoutineFrequency.weekly, None

    # Monthly / quarterly / annual / custom → use custom
    return RoutineFrequency.custom, None


def exact_time_from(due_time: str | None) -> str | None:
    return due_time  # already HH:MM or None


# ── Main import ───────────────────────────────────────────────────────────────

def run():
    db = SessionLocal()
    try:
        with open(TASKS_CSV, encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        active = [r for r in rows if r.get("Status", "").strip() not in ("Done", "")]

        routines_created = 0
        tasks_created    = 0
        skipped          = 0

        for row in active:
            name = row.get("Name", "").strip()
            if not name:
                skipped += 1
                continue
            if name.lower() in SKIP_TITLES:
                skipped += 1
                continue

            recur_interval = row.get("Recur Interval", "").strip()
            recur_unit     = row.get("Recur Unit", "").strip()
            is_recurring   = bool(recur_interval and recur_unit)

            raw_due = row.get("Due", "").strip()
            due_date, due_time = parse_due(raw_due)

            raw_priority = row.get("Priority", "").strip().lower()
            priority = Priority.urgent if raw_priority == "high" else Priority.normal

            description = row.get("Description", "").strip() or None

            if is_recurring:
                freq, days = recur_to_frequency(recur_interval, recur_unit, name)
                routine = Routine(
                    user_id=TARGET_USER_ID,
                    title=name,
                    notes=description,
                    frequency=freq,
                    time_of_day=TimeOfDay.anytime,
                    days_of_week=days,
                    exact_time=exact_time_from(due_time),
                    is_critical=(raw_priority == "high"),
                    active=True,
                )
                db.add(routine)
                routines_created += 1
            else:
                task = Task(
                    owner_id=TARGET_USER_ID,
                    title=name,
                    notes=description,
                    task_type=TaskType.task,
                    status=TaskStatus.inbox,
                    priority=priority,
                    due_date=due_date,
                    due_time=due_time,
                )
                db.add(task)
                tasks_created += 1

        db.commit()
        print(f"OK Import complete")
        print(f"  Routines created : {routines_created}")
        print(f"  Tasks created    : {tasks_created}")
        print(f"  Skipped          : {skipped}")

    except Exception as e:
        db.rollback()
        print(f"FAILED: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
