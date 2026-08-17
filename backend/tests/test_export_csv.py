"""CSV export tests — see routes/export_csv.py."""

import csv
import io
from datetime import date, datetime, timedelta

from models import (
    Effort, Priority, Project, Routine, Task, TaskStatus, TaskType, User,
)


def _mk_user(db, username="testuser"):
    return db.query(User).filter(User.username == username).first()


def _mk_task(db, user_id, **kwargs):
    kwargs.setdefault("title", "t")
    kwargs.setdefault("task_type", TaskType.task)
    kwargs.setdefault("status", TaskStatus.inbox)
    t = Task(owner_id=user_id, **kwargs)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def _rows(response):
    """Parsed CSV body as a list of dicts (BOM stripped, like Excel does)."""
    text = response.content.decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))


def test_export_requires_auth(client):
    r = client.get("/export/tasks.csv")
    assert r.status_code in (401, 403)


def test_export_returns_csv_attachment(client, auth_headers, db_session):
    user = _mk_user(db_session)
    _mk_task(db_session, user.id, title="Buy tea")

    r = client.get("/export/tasks.csv", headers=auth_headers)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    assert "adhtea-tasks-" in r.headers["content-disposition"]
    # Cross-origin (adh-tea.fun → api.adh-tea.fun): the client can't read the
    # filename unless the header is exposed.
    assert "Content-Disposition" in r.headers["access-control-expose-headers"]
    assert r.content.startswith(b"\xef\xbb\xbf")  # BOM for Excel


def test_export_writes_one_row_per_task_with_fields(client, auth_headers, db_session):
    user = _mk_user(db_session)
    project = Project(user_id=user.id, title="Move house", status="active")
    db_session.add(project)
    db_session.commit()

    _mk_task(
        db_session, user.id,
        title="Call landlord",
        project_id=project.id,
        status=TaskStatus.today,
        priority=Priority.high,
        effort=Effort.big,
        is_critical=True,
        due_date=date(2026, 8, 20),
        due_time="09:30",
        tags="home,phone",
        notes="Ask about the deposit",
    )

    rows = _rows(client.get("/export/tasks.csv", headers=auth_headers))
    assert len(rows) == 1
    row = rows[0]
    assert row["title"] == "Call landlord"
    assert row["type"] == "task"
    assert row["status"] == "today"
    assert row["priority"] == "high"
    assert row["effort"] == "big"
    assert row["critical"] == "yes"
    assert row["due_date"] == "2026-08-20"
    assert row["due_time"] == "09:30"
    assert row["project"] == "Move house"
    assert row["tags"] == "home,phone"
    assert row["notes"] == "Ask about the deposit"


def test_export_writes_routine_title_for_generated_instances(client, auth_headers, db_session):
    user = _mk_user(db_session)
    routine = Routine(user_id=user.id, title="Morning meds")
    db_session.add(routine)
    db_session.commit()
    db_session.refresh(routine)

    _mk_task(db_session, user.id, title="Morning meds",
             task_type=TaskType.routine, routine_id=routine.id)

    rows = _rows(client.get("/export/tasks.csv", headers=auth_headers))
    assert rows[0]["routine"] == "Morning meds"


def test_export_excludes_deleted_by_default_and_includes_on_request(client, auth_headers, db_session):
    user = _mk_user(db_session)
    _mk_task(db_session, user.id, title="Kept")
    _mk_task(db_session, user.id, title="Trashed", status=TaskStatus.deleted)

    titles = [r["title"] for r in _rows(client.get("/export/tasks.csv", headers=auth_headers))]
    assert titles == ["Kept"]

    titles = [r["title"] for r in _rows(
        client.get("/export/tasks.csv?include_deleted=true", headers=auth_headers))]
    assert sorted(titles) == ["Kept", "Trashed"]


def test_export_only_includes_own_tasks(client, auth_headers, db_session):
    user = _mk_user(db_session)
    other = User(name="Other", username="other", hashed_password="x")
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)

    _mk_task(db_session, user.id, title="Mine")
    _mk_task(db_session, other.id, title="Not mine")

    titles = [r["title"] for r in _rows(client.get("/export/tasks.csv", headers=auth_headers))]
    assert titles == ["Mine"]


def test_export_renders_timestamps_in_user_timezone(client, auth_headers, db_session):
    """`completed_at` is naive UTC. 2026-08-17 02:00 UTC is still the 16th in
    Los Angeles — writing the raw value would report the wrong day."""
    user = _mk_user(db_session)
    user.timezone = "America/Los_Angeles"
    db_session.commit()

    _mk_task(db_session, user.id, title="Done thing", status=TaskStatus.done,
             completed_at=datetime(2026, 8, 17, 2, 0, 0))

    rows = _rows(client.get("/export/tasks.csv", headers=auth_headers))
    assert rows[0]["completed_at"] == "2026-08-16 19:00"


def test_export_is_ordered_oldest_first(client, auth_headers, db_session):
    user = _mk_user(db_session)
    now = datetime(2026, 8, 1, 12, 0, 0)
    _mk_task(db_session, user.id, title="Second", created_at=now)
    _mk_task(db_session, user.id, title="First", created_at=now - timedelta(days=3))

    titles = [r["title"] for r in _rows(client.get("/export/tasks.csv", headers=auth_headers))]
    assert titles == ["First", "Second"]


def test_export_round_trips_through_the_importer(client, auth_headers, db_session):
    """The export's column names are ones import_csv recognizes, so a file that
    leaves the app can come back into it."""
    user = _mk_user(db_session)
    _mk_task(db_session, user.id, title="Round trip", due_date=date(2026, 9, 1),
             notes="carried over")

    exported = client.get("/export/tasks.csv", headers=auth_headers).content

    r = client.post(
        "/import/csv",
        headers=auth_headers,
        files={"file": ("adhtea-tasks.csv", io.BytesIO(exported), "text/csv")},
    )
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 1
    detected = r.json()["columns_detected"]
    assert detected["title"] == "title"
    assert detected["due_date"] == "due_date"

    copies = db_session.query(Task).filter(Task.title == "Round trip").all()
    assert len(copies) == 2
    assert {c.due_date for c in copies} == {date(2026, 9, 1)}
    assert {c.notes for c in copies} == {"carried over"}


def test_export_handles_an_empty_account(client, auth_headers):
    r = client.get("/export/tasks.csv", headers=auth_headers)
    assert r.status_code == 200
    assert _rows(r) == []
    assert r.content.decode("utf-8-sig").startswith("id,title,")
