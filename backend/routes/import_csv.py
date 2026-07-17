import csv
import io
from datetime import date
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Task, TaskStatus, TaskType, Priority, utcnow
from routes.auth import get_current_user
from models import User

router = APIRouter()

# Notion CSV column name → ARIA field mappings (case-insensitive)
TITLE_COLS    = {"name", "title", "task", "task name", "item"}
DATE_COLS     = {"due date", "due", "date", "deadline", "due_date"}
NOTES_COLS    = {"notes", "note", "description", "details", "content", "body"}
TAGS_COLS     = {"tags", "tag", "labels", "label"}
PRIORITY_COLS = {"priority"}
STATUS_COLS   = {"status", "state"}

PRIORITY_MAP = {
    "urgent": Priority.urgent,
    "high":   Priority.high,
    "normal": Priority.normal,
    "medium": Priority.normal,
    "low":    Priority.low,
}

# Notion statuses that map to "done"
DONE_STATUSES = {"done", "complete", "completed", "finished", "closed"}


def _find_col(headers: list[str], candidates: set[str]) -> str | None:
    for h in headers:
        if h.strip().lower() in candidates:
            return h
    return None


def _parse_date(val: str) -> date | None:
    if not val:
        return None
    val = val.strip()
    # Notion exports dates as "YYYY-MM-DD" or "Month DD, YYYY" or "MM/DD/YYYY"
    for fmt in ("%Y-%m-%d", "%B %d, %Y", "%b %d, %Y", "%m/%d/%Y", "%d/%m/%Y"):
        try:
            from datetime import datetime
            return datetime.strptime(val, fmt).date()
        except ValueError:
            continue
    return None


@router.post("/import/csv")
async def import_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (5 MB max)")
    try:
        text = content.decode("utf-8-sig")  # handle BOM from Excel/Notion exports
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []

    title_col    = _find_col(headers, TITLE_COLS)
    date_col     = _find_col(headers, DATE_COLS)
    notes_col    = _find_col(headers, NOTES_COLS)
    tags_col     = _find_col(headers, TAGS_COLS)
    priority_col = _find_col(headers, PRIORITY_COLS)
    status_col   = _find_col(headers, STATUS_COLS)

    if not title_col:
        raise HTTPException(
            status_code=400,
            detail=f"Could not find a title column. Headers found: {headers}. "
                   "Rename your title column to 'Name' or 'Title' and re-export."
        )

    imported = 0
    skipped = 0
    errors = []

    for i, row in enumerate(reader, start=2):
        title = row.get(title_col, "").strip()
        if not title:
            skipped += 1
            continue

        due_date = _parse_date(row.get(date_col, "") if date_col else "")

        raw_priority = row.get(priority_col, "").strip().lower() if priority_col else ""
        priority = PRIORITY_MAP.get(raw_priority)

        raw_status = row.get(status_col, "").strip().lower() if status_col else ""
        status = TaskStatus.done if raw_status in DONE_STATUSES else TaskStatus.inbox

        notes = row.get(notes_col, "").strip() if notes_col else None
        tags  = row.get(tags_col,  "").strip() if tags_col  else None

        task = Task(
            owner_id=current_user.id,
            title=title,
            notes=notes or None,
            tags=tags or None,
            task_type=TaskType.task,
            status=status,
            priority=priority,
            due_date=due_date,
        )
        db.add(task)
        imported += 1

    db.commit()
    return {
        "imported": imported,
        "skipped": skipped,
        "columns_detected": {
            "title":    title_col,
            "due_date": date_col,
            "notes":    notes_col,
            "tags":     tags_col,
            "priority": priority_col,
            "status":   status_col,
        },
    }
