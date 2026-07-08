"""Tasks route tests: cascade date shift + daily cap."""

from datetime import date, timedelta

from models import Project, Task, TaskStatus, TaskType, User
from routes.tasks import (
    promote_due_tasks, count_today, DAILY_CAP,
)


def _mk_user(db, username="testuser"):
    return db.query(User).filter(User.username == username).first()


def _mk_project(db, user_id, title="Test project"):
    p = Project(user_id=user_id, title=title, status="active")
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _mk_task(db, user_id, project_id=None, due=None, status=TaskStatus.inbox, task_type=TaskType.task):
    t = Task(
        owner_id=user_id, project_id=project_id, title="t",
        task_type=task_type, status=status, due_date=due,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


# ---------------------------------------------------------------------------
# Cascade date shift on project sub-tasks
# ---------------------------------------------------------------------------

def test_cascade_shifts_later_siblings_by_delta(client, auth_headers, db_session):
    user = _mk_user(db_session)
    project = _mk_project(db_session, user.id)
    today = date.today()
    t1 = _mk_task(db_session, user.id, project.id, due=today + timedelta(days=5))
    t2 = _mk_task(db_session, user.id, project.id, due=today + timedelta(days=10))
    t3 = _mk_task(db_session, user.id, project.id, due=today + timedelta(days=15))

    new_due = (today + timedelta(days=7)).isoformat()
    r = client.patch(f"/tasks/{t1.id}", json={"due_date": new_due}, headers=auth_headers)
    assert r.status_code == 200

    db_session.refresh(t2)
    db_session.refresh(t3)
    assert t2.due_date == today + timedelta(days=12)
    assert t3.due_date == today + timedelta(days=17)


def test_cascade_skips_earlier_siblings(client, auth_headers, db_session):
    """Siblings with due_date < old_due must not shift."""
    user = _mk_user(db_session)
    project = _mk_project(db_session, user.id)
    today = date.today()
    earlier = _mk_task(db_session, user.id, project.id, due=today + timedelta(days=2))
    moved = _mk_task(db_session, user.id, project.id, due=today + timedelta(days=10))

    new_due = (today + timedelta(days=15)).isoformat()
    r = client.patch(f"/tasks/{moved.id}", json={"due_date": new_due}, headers=auth_headers)
    assert r.status_code == 200

    db_session.refresh(earlier)
    assert earlier.due_date == today + timedelta(days=2)


def test_cascade_skips_done_and_deleted(client, auth_headers, db_session):
    """Done/deleted siblings stay put even if their due_date is in range."""
    user = _mk_user(db_session)
    project = _mk_project(db_session, user.id)
    today = date.today()
    t1 = _mk_task(db_session, user.id, project.id, due=today + timedelta(days=5))
    done = _mk_task(db_session, user.id, project.id, due=today + timedelta(days=10), status=TaskStatus.done)
    deleted = _mk_task(db_session, user.id, project.id, due=today + timedelta(days=11), status=TaskStatus.deleted)
    moving = _mk_task(db_session, user.id, project.id, due=today + timedelta(days=12))

    new_due = (today + timedelta(days=8)).isoformat()
    r = client.patch(f"/tasks/{t1.id}", json={"due_date": new_due}, headers=auth_headers)
    assert r.status_code == 200

    db_session.refresh(done)
    db_session.refresh(deleted)
    db_session.refresh(moving)
    assert done.due_date == today + timedelta(days=10)
    assert deleted.due_date == today + timedelta(days=11)
    assert moving.due_date == today + timedelta(days=15)  # shifted +3


def test_cascade_does_not_run_across_projects(client, auth_headers, db_session):
    """A task in project A moving must not shift tasks in project B."""
    user = _mk_user(db_session)
    project_a = _mk_project(db_session, user.id, title="A")
    project_b = _mk_project(db_session, user.id, title="B")
    today = date.today()
    a1 = _mk_task(db_session, user.id, project_a.id, due=today + timedelta(days=5))
    b1 = _mk_task(db_session, user.id, project_b.id, due=today + timedelta(days=10))

    new_due = (today + timedelta(days=8)).isoformat()
    r = client.patch(f"/tasks/{a1.id}", json={"due_date": new_due}, headers=auth_headers)
    assert r.status_code == 200

    db_session.refresh(b1)
    assert b1.due_date == today + timedelta(days=10)


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
