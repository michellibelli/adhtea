"""CSV export — the mirror of import_csv.py.

Every task the user owns, one row each, as a plain CSV download. Deliberately
flat and self-describing: this is the "get my data out" surface, so it favors
readable labels (project title, routine title, effort tag) over the raw FK ids
the API returns.

Timestamps are stored naive-UTC (`models.utcnow`); dates like `due_date` and
`scheduled_date` follow the local-midnight convention. So datetimes are
converted into the user's timezone before writing and dates are written
verbatim — mixing the two conventions is the bug that bit the morning review in
4.11.6 (see HANDOFF "Naive-UTC vs. local-midnight boundaries").
"""

import csv
import io
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Task, TaskStatus, TaskType, User, Routine
from routes.auth import get_current_user
from routes.task_lifecycle import _tz, _app_today

router = APIRouter()

COLUMNS = [
    "id",
    "title",
    "type",
    "status",
    "priority",
    "effort",
    "critical",
    "due_date",
    "due_time",
    "scheduled_date",
    "snooze_until",
    "project",
    "routine",
    "tags",
    "location_type",
    "location_detail",
    "push_count",
    "completed_at",
    "created_at",
    "updated_at",
    "notes",
]


def _enum(val) -> str:
    """Enum column → its string value; None → empty."""
    if val is None:
        return ""
    return getattr(val, "value", str(val))


def _local(dt: datetime | None, tz) -> str:
    """Naive-UTC timestamp → 'YYYY-MM-DD HH:MM' in the user's timezone."""
    if dt is None:
        return ""
    return (
        dt.replace(tzinfo=timezone.utc)
        .astimezone(tz)
        .strftime("%Y-%m-%d %H:%M")
    )


def _date(d) -> str:
    """Date (or local-midnight datetime) column → 'YYYY-MM-DD'. No tz math —
    these are already stored on the local-midnight convention."""
    if d is None:
        return ""
    return d.strftime("%Y-%m-%d")


def _row(task: Task, routine_titles: dict[int, str], tz) -> list[str]:
    return [
        task.id,
        task.title or "",
        _enum(task.task_type),
        _enum(task.status),
        _enum(task.priority),
        _enum(task.effort),
        "yes" if task.is_critical else "",
        _date(task.due_date),
        task.due_time or "",
        _date(task.scheduled_date),
        _local(task.snooze_until, tz),
        task.project.title if task.project else "",
        routine_titles.get(task.routine_id, ""),
        task.tags or "",
        _enum(task.location_type),
        task.location_detail or "",
        task.push_count or 0,
        _local(task.completed_at, tz),
        _local(task.created_at, tz),
        _local(task.updated_at, tz),
        task.notes or "",
    ]


def _row_date(task: Task, tz) -> date:
    """The day a row *belongs to*, for the since/until window.

    A routine check-off or an archived appointment is about the day it happened,
    an open task is about the day it's due, and anything else falls back to when
    it was captured. Computed in Python rather than SQL because the three columns
    use two different storage conventions (naive UTC vs local midnight) and
    COALESCE across them would silently compare apples to oranges.
    """
    if task.completed_at:
        return task.completed_at.replace(tzinfo=timezone.utc).astimezone(tz).date()
    if task.due_date:
        return task.due_date
    if task.scheduled_date:
        return task.scheduled_date.date()
    if task.created_at:
        return task.created_at.replace(tzinfo=timezone.utc).astimezone(tz).date()
    return date.min


@router.get("/export/tasks.csv")
def export_tasks_csv(
    include_deleted: bool = Query(False, description="Include soft-deleted tasks"),
    types: str | None = Query(
        None,
        description="Comma-separated task types to include: task, appointment, "
                    "routine, note. Omit for all.",
    ),
    since: date | None = Query(None, description="Only rows on/after this date"),
    until: date | None = Query(None, description="Only rows on/before this date"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The user's tasks as a CSV download.

    Everything by default. The filters exist because the row count is dominated
    by machine-generated history — a daily routine is one row per day since it
    was created, and a recurring calendar event is one row per occurrence — so
    "just my actual tasks" needs a way to drop those.

    Soft-deleted tasks are excluded by default (they're deleted from her point of
    view); `?include_deleted=true` gives the true full dump.
    """
    wanted_types = None
    if types is not None:
        valid = {t.value for t in TaskType}
        wanted_types = {t.strip().lower() for t in types.split(",") if t.strip()}
        unknown = wanted_types - valid
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown task type(s): {', '.join(sorted(unknown))}. "
                       f"Valid: {', '.join(sorted(valid))}.",
            )
        if not wanted_types:
            raise HTTPException(status_code=400, detail="No task types selected.")

    q = (
        db.query(Task)
        .options(joinedload(Task.project))
        .filter(Task.owner_id == current_user.id)
    )
    if not include_deleted:
        q = q.filter(Task.status != TaskStatus.deleted)
    if wanted_types is not None:
        q = q.filter(Task.task_type.in_([TaskType(t) for t in wanted_types]))

    tasks = q.order_by(Task.created_at.asc(), Task.id.asc()).all()

    if since or until:
        tz_for_window = _tz(current_user)
        tasks = [
            t for t in tasks
            if (since is None or _row_date(t, tz_for_window) >= since)
            and (until is None or _row_date(t, tz_for_window) <= until)
        ]

    # Routine titles in one query rather than a lazy load per generated instance
    # — a daily routine going back months is most of the export's row count.
    routine_ids = {t.routine_id for t in tasks if t.routine_id}
    routine_titles = {}
    if routine_ids:
        routine_titles = {
            r.id: r.title
            for r in db.query(Routine).filter(Routine.id.in_(routine_ids)).all()
        }

    tz = _tz(current_user)
    buf = io.StringIO()
    # utf-8-sig on the way out (see below) + CRLF: Excel's expectations, and the
    # import side already strips the BOM, so an export round-trips.
    writer = csv.writer(buf, lineterminator="\r\n")
    writer.writerow(COLUMNS)
    for task in tasks:
        writer.writerow(_row(task, routine_titles, tz))

    filename = f"adhtea-tasks-{_app_today(current_user).isoformat()}.csv"
    return StreamingResponse(
        iter([buf.getvalue().encode("utf-8-sig")]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # The browser can't read Content-Disposition off a cross-origin
            # response unless it's exposed — the frontend reads the filename
            # from it (api.adh-tea.fun → adh-tea.fun is cross-origin).
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )
