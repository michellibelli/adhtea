"""Tasks route tests: auto-promote + daily cap."""

from datetime import date, timedelta

from models import Task, TaskStatus, TaskType, User
from routes.tasks import (
    promote_due_tasks, count_today, DAILY_CAP,
)


def _mk_user(db, username="testuser"):
    return db.query(User).filter(User.username == username).first()


def _mk_task(db, user_id, due=None, status=TaskStatus.inbox, task_type=TaskType.task):
    t = Task(
        owner_id=user_id, title="t",
        task_type=task_type, status=status, due_date=due,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


# ---------------------------------------------------------------------------
# Auto-promote of due tasks
# ---------------------------------------------------------------------------

def test_promote_due_tasks_promotes_overdue_inbox_task(client, auth_headers, db_session):
    """An overdue inbox task promotes to Today when there's room."""
    user = _mk_user(db_session)
    today = date.today()
    t = _mk_task(db_session, user.id, due=today - timedelta(days=1), status=TaskStatus.inbox)
    promote_due_tasks(user, db_session)
    db_session.refresh(t)
    assert t.status == TaskStatus.today


# ---------------------------------------------------------------------------
# Daily cap — at most DAILY_CAP items in Today
# ---------------------------------------------------------------------------

def _fill_today(db, user_id, n):
    for _ in range(n):
        _mk_task(db, user_id, status=TaskStatus.today)


def test_create_task_due_today_snaps_when_today_full(client, auth_headers, db_session):
    user = _mk_user(db_session)
    _fill_today(db_session, user.id, DAILY_CAP)
    today = date.today()
    r = client.post(
        "/tasks",
        json={"title": "overflow", "task_type": "task", "due_date": today.isoformat()},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "inbox"                       # didn't land in a full Today
    assert date.fromisoformat(body["due_date"]) > today    # snapped to a later day


def test_create_appointment_due_today_admitted_when_today_full(client, auth_headers, db_session):
    user = _mk_user(db_session)
    _fill_today(db_session, user.id, DAILY_CAP)
    today = date.today()
    r = client.post(
        "/tasks",
        json={"title": "meeting", "task_type": "appointment",
              "due_date": today.isoformat(), "due_time": "10:00"},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "today"                   # appointments bypass the cap


def test_schedule_today_blocked_when_today_full(client, auth_headers, db_session):
    user = _mk_user(db_session)
    _fill_today(db_session, user.id, DAILY_CAP)
    t = _mk_task(db_session, user.id, status=TaskStatus.inbox)
    r = client.post(f"/tasks/{t.id}/schedule-today", headers=auth_headers)
    assert r.status_code == 409


def test_schedule_today_ok_when_room(client, auth_headers, db_session):
    user = _mk_user(db_session)
    _fill_today(db_session, user.id, DAILY_CAP - 1)
    t = _mk_task(db_session, user.id, status=TaskStatus.inbox)
    r = client.post(f"/tasks/{t.id}/schedule-today", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "today"


def test_promote_due_tasks_respects_cap(client, auth_headers, db_session):
    user = _mk_user(db_session)
    today = date.today()
    _fill_today(db_session, user.id, DAILY_CAP)
    overdue = _mk_task(db_session, user.id, due=today - timedelta(days=1), status=TaskStatus.inbox)
    promote_due_tasks(user, db_session)
    db_session.refresh(overdue)
    assert overdue.status == TaskStatus.inbox              # full Today — waits in inbox
    assert count_today(user, db_session) == DAILY_CAP


def test_promote_due_appointment_admitted_when_today_full(client, auth_headers, db_session):
    user = _mk_user(db_session)
    today = date.today()
    _fill_today(db_session, user.id, DAILY_CAP)
    appt = _mk_task(db_session, user.id, due=today, status=TaskStatus.inbox,
                    task_type=TaskType.appointment)
    promote_due_tasks(user, db_session)
    db_session.refresh(appt)
    assert appt.status == TaskStatus.today                 # appointment bypasses the cap
