"""Tasks route tests: cascade date shift + tournament target-day caps."""

from datetime import date, timedelta

from models import Project, Task, TaskStatus, TaskType, User
from routes.tasks import _find_target


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
# _find_target: tournament caps
# ---------------------------------------------------------------------------

def test_find_target_picks_today_when_empty(client, auth_headers, db_session):
    user = _mk_user(db_session)
    target, offset, tcount, total = _find_target(db_session, user)
    assert target == date.today()
    assert offset == 0
    assert tcount == 0
    assert total == 0


def test_find_target_skips_today_when_task_cap_reached(client, auth_headers, db_session):
    user = _mk_user(db_session)
    user.max_tasks_per_day = 2
    user.max_total_per_day = 15
    db_session.commit()

    for _ in range(2):
        _mk_task(db_session, user.id, status=TaskStatus.today)

    target, offset, _, _ = _find_target(db_session, user)
    assert offset == 1  # today filled, next day picked
    assert target == date.today() + timedelta(days=1)


def test_find_target_skips_today_when_total_cap_reached(client, auth_headers, db_session):
    """Routines + appointments count toward total even though tasks alone is under cap."""
    user = _mk_user(db_session)
    user.max_tasks_per_day = 10
    user.max_total_per_day = 3
    db_session.commit()

    _mk_task(db_session, user.id, status=TaskStatus.today, task_type=TaskType.task)
    _mk_task(db_session, user.id, status=TaskStatus.today, task_type=TaskType.appointment)
    _mk_task(db_session, user.id, status=TaskStatus.today, task_type=TaskType.routine)

    target, offset, _, _ = _find_target(db_session, user)
    assert offset == 1


def test_find_target_returns_none_when_horizon_full(client, auth_headers, db_session):
    """Cap at 1/1 and fill all 30 horizon days -> no target available."""
    user = _mk_user(db_session)
    user.max_tasks_per_day = 1
    user.max_total_per_day = 1
    db_session.commit()
    today = date.today()
    _mk_task(db_session, user.id, status=TaskStatus.today)  # fills offset=0
    for offset in range(1, 30):
        _mk_task(db_session, user.id, due=today + timedelta(days=offset))
    target, offset, _, _ = _find_target(db_session, user)
    assert target is None
    assert offset is None
