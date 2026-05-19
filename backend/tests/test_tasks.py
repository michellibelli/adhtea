"""Tasks route tests: cascade date shift + domain enforcement."""

import json
from datetime import date, timedelta

from models import Domain, Project, Task, TaskStatus, TaskType, User
from routes.tasks import demote_domain_violations, promote_due_tasks


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


def _mk_domain(db, user_id, allowed_weekdays, name="Work"):
    """Domain that allows only the listed Python weekday indices (0=Mon..6=Sun)."""
    d = Domain(
        user_id=user_id, name=name,
        rules=json.dumps([{"days": list(allowed_weekdays)}]),
        is_default=False,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


def _attach_domain(db, project, domain):
    project.domain_id = domain.id
    db.commit()
    db.refresh(project)
    return project


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
# Domain enforcement: create snap, promote skip, demote sweep
# ---------------------------------------------------------------------------

def test_create_task_snaps_before_due_today(client, auth_headers, db_session):
    """POST with a due_date that today's weekday disallows must land status=inbox
    with a snapped future due_date (not status=today on a disallowed day)."""
    user = _mk_user(db_session)
    today = date.today()
    forbid_today = [d for d in range(7) if d != today.weekday()]
    domain = _mk_domain(db_session, user.id, allowed_weekdays=forbid_today)
    project = _mk_project(db_session, user.id)
    _attach_domain(db_session, project, domain)

    r = client.post(
        "/tasks",
        json={"title": "x", "task_type": "task", "project_id": project.id, "due_date": today.isoformat()},
        headers=auth_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "inbox"
    assert date.fromisoformat(body["due_date"]) > today


def test_promote_due_tasks_skips_domain_disallowed_today(client, auth_headers, db_session):
    """An inbox task overdue for today must NOT promote when today's weekday violates the domain."""
    user = _mk_user(db_session)
    today = date.today()
    forbid_today = [d for d in range(7) if d != today.weekday()]
    domain = _mk_domain(db_session, user.id, allowed_weekdays=forbid_today)
    project = _mk_project(db_session, user.id)
    _attach_domain(db_session, project, domain)

    t = _mk_task(db_session, user.id, project.id, due=today - timedelta(days=5), status=TaskStatus.inbox)
    promote_due_tasks(user, db_session)
    db_session.refresh(t)
    assert t.status == TaskStatus.inbox


def test_promote_due_tasks_runs_when_today_allowed(client, auth_headers, db_session):
    """Sanity: same setup with today on the allowed list — the task DOES promote."""
    user = _mk_user(db_session)
    today = date.today()
    domain = _mk_domain(db_session, user.id, allowed_weekdays=[today.weekday()])
    project = _mk_project(db_session, user.id)
    _attach_domain(db_session, project, domain)

    t = _mk_task(db_session, user.id, project.id, due=today - timedelta(days=1), status=TaskStatus.inbox)
    promote_due_tasks(user, db_session)
    db_session.refresh(t)
    assert t.status == TaskStatus.today


def test_demote_domain_violations_demotes_stale_today(client, auth_headers, db_session):
    """A pre-seeded status=today task on a domain that disallows today gets demoted to inbox."""
    user = _mk_user(db_session)
    today = date.today()
    forbid_today = [d for d in range(7) if d != today.weekday()]
    domain = _mk_domain(db_session, user.id, allowed_weekdays=forbid_today)
    project = _mk_project(db_session, user.id)
    _attach_domain(db_session, project, domain)

    t = _mk_task(db_session, user.id, project.id, due=today + timedelta(days=1), status=TaskStatus.today)
    n = demote_domain_violations(user, db_session)
    db_session.refresh(t)
    assert n == 1
    assert t.status == TaskStatus.inbox


def test_demote_domain_violations_leaves_allowed_today_alone(client, auth_headers, db_session):
    """Sanity: status=today task on a domain-allowed day stays put."""
    user = _mk_user(db_session)
    today = date.today()
    domain = _mk_domain(db_session, user.id, allowed_weekdays=[today.weekday()])
    project = _mk_project(db_session, user.id)
    _attach_domain(db_session, project, domain)

    t = _mk_task(db_session, user.id, project.id, due=today, status=TaskStatus.today)
    n = demote_domain_violations(user, db_session)
    db_session.refresh(t)
    assert n == 0
    assert t.status == TaskStatus.today


# ---------------------------------------------------------------------------
# Task-level domain_id (orphan tasks)
# ---------------------------------------------------------------------------

def test_create_task_persists_domain_id_when_no_project(client, auth_headers, db_session):
    user = _mk_user(db_session)
    home = _mk_domain(db_session, user.id, allowed_weekdays=[0, 1, 2, 3, 4, 5, 6], name="Home")
    r = client.post(
        "/tasks",
        json={"title": "Orphan home task", "domain_id": home.id},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["domain_id"] == home.id
    assert body["domain_name"] == "Home"


def test_create_task_ignores_domain_id_when_project_set(client, auth_headers, db_session):
    """Project domain wins — task-level domain_id is silently dropped on save."""
    user = _mk_user(db_session)
    work = _mk_domain(db_session, user.id, allowed_weekdays=[0, 1, 2, 3, 4], name="Work")
    home = _mk_domain(db_session, user.id, allowed_weekdays=[5, 6], name="Home")
    project = _mk_project(db_session, user.id)
    _attach_domain(db_session, project, work)

    r = client.post(
        "/tasks",
        json={"title": "In a Work project, tagged Home", "project_id": project.id, "domain_id": home.id},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["domain_id"] is None              # task-level dropped
    assert body["domain_name"] == "Work"          # effective name reflects project domain


def test_update_task_ignores_domain_id_when_project_already_set(client, auth_headers, db_session):
    """PATCH on a projected task with domain_id silently drops the task-level domain."""
    user = _mk_user(db_session)
    work = _mk_domain(db_session, user.id, allowed_weekdays=[0, 1, 2, 3, 4], name="Work")
    home = _mk_domain(db_session, user.id, allowed_weekdays=[0, 1, 2, 3, 4, 5, 6], name="Home")
    project = _mk_project(db_session, user.id)
    _attach_domain(db_session, project, work)
    t = _mk_task(db_session, user.id, project.id)

    r = client.patch(f"/tasks/{t.id}", json={"domain_id": home.id}, headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["domain_id"] is None              # nulled because project wins
    assert body["domain_name"] == "Work"
