"""Tasks route tests: daily cap."""

from datetime import date, timedelta

from models import Task, TaskStatus, TaskType, User
from routes.tasks import DAILY_CAP


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


# ---------------------------------------------------------------------------
# is_work defaults to True for plain tasks (4.21.0) — no popup ask, corrected
# afterward with the cup-icon toggle on the task card.
# ---------------------------------------------------------------------------

def test_create_task_defaults_is_work_true(client, auth_headers):
    r = client.post(
        "/tasks",
        json={"title": "write report", "task_type": "task",
              "due_date": date.today().isoformat()},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["is_work"] is True


def test_create_task_respects_explicit_is_work_false(client, auth_headers):
    r = client.post(
        "/tasks",
        json={"title": "fold laundry", "task_type": "task",
              "due_date": date.today().isoformat(), "is_work": False},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["is_work"] is False


def test_create_routine_leaves_is_work_null(client, auth_headers):
    r_routine = client.post(
        "/tasks",
        json={"title": "stretch", "task_type": "routine"},
        headers=auth_headers,
    )
    assert r_routine.status_code == 200, r_routine.text
    assert r_routine.json()["is_work"] is None


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


# ---------------------------------------------------------------------------
# completed_at hygiene — the morning review filters on the stamp, not on status
# ---------------------------------------------------------------------------

def test_complete_is_idempotent(client, auth_headers, db_session):
    """A replayed offline-queue completion must not re-stamp completed_at, or
    the task is dragged into the wrong review day."""
    user = _mk_user(db_session)
    t = _mk_task(db_session, user.id)

    r1 = client.post(f"/tasks/{t.id}/complete", headers=auth_headers)
    assert r1.status_code == 200
    first = r1.json()["completed_at"]

    r2 = client.post(f"/tasks/{t.id}/complete", headers=auth_headers)
    assert r2.status_code == 200, "the queue drain needs a 200 to clear the duplicate"
    assert r2.json()["completed_at"] == first


def test_complete_heals_done_row_with_no_stamp(client, auth_headers, db_session):
    """The CSV-import shape: status done, completed_at null. The guard must not
    swallow this — it still needs a stamp."""
    user = _mk_user(db_session)
    t = _mk_task(db_session, user.id, status=TaskStatus.done)
    assert t.completed_at is None

    r = client.post(f"/tasks/{t.id}/complete", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["completed_at"] is not None


def test_patch_away_from_done_clears_stamp_and_effort(client, auth_headers, db_session):
    user = _mk_user(db_session)
    t = _mk_task(db_session, user.id)
    client.post(f"/tasks/{t.id}/complete", headers=auth_headers)
    client.patch(f"/tasks/{t.id}", headers=auth_headers, json={"effort": "big"})

    r = client.patch(f"/tasks/{t.id}", headers=auth_headers, json={"status": "inbox"})
    assert r.status_code == 200
    db_session.expire_all()
    t = db_session.get(Task, t.id)
    assert t.completed_at is None
    assert t.effort is None


def test_patch_away_from_done_honours_explicit_effort(client, auth_headers, db_session):
    """An effort supplied in the same patch is the caller's intent — don't
    clobber it on the way out of done."""
    user = _mk_user(db_session)
    t = _mk_task(db_session, user.id)
    client.post(f"/tasks/{t.id}/complete", headers=auth_headers)

    r = client.patch(f"/tasks/{t.id}", headers=auth_headers,
                     json={"status": "inbox", "effort": "big"})
    assert r.status_code == 200
    db_session.expire_all()
    t = db_session.get(Task, t.id)
    assert t.completed_at is None
    assert t.effort.value == "big"


def test_defer_clears_stamp(client, auth_headers, db_session):
    user = _mk_user(db_session)
    t = _mk_task(db_session, user.id, status=TaskStatus.today)
    client.post(f"/tasks/{t.id}/complete", headers=auth_headers)

    r = client.post(f"/tasks/{t.id}/defer", headers=auth_headers)
    assert r.status_code == 200
    db_session.expire_all()
    assert db_session.get(Task, t.id).completed_at is None


# ---------------------------------------------------------------------------
# Snooze carries due_date forward to the wake day
# ---------------------------------------------------------------------------

def test_snooze_pushes_due_date_to_the_wake_day(client, auth_headers, db_session):
    user = _mk_user(db_session)
    t = _mk_task(db_session, user.id, due=date.today() - timedelta(days=3), status=TaskStatus.inbox)
    wake = date.today() + timedelta(days=2)
    r = client.post(
        f"/tasks/{t.id}/snooze",
        json={"snooze_until": wake.isoformat() + "T14:00:00"},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["due_date"] == wake.isoformat()


def test_snooze_never_pulls_a_later_due_date_backwards(client, auth_headers, db_session):
    user = _mk_user(db_session)
    far = date.today() + timedelta(days=30)
    t = _mk_task(db_session, user.id, due=far, status=TaskStatus.inbox)
    r = client.post(
        f"/tasks/{t.id}/snooze",
        json={"snooze_until": (date.today() + timedelta(days=2)).isoformat() + "T14:00:00"},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["due_date"] == far.isoformat()


def test_unsnooze_clears_stamp(client, auth_headers, db_session):
    user = _mk_user(db_session)
    t = _mk_task(db_session, user.id, status=TaskStatus.snoozed)
    client.post(f"/tasks/{t.id}/complete", headers=auth_headers)

    r = client.post(f"/tasks/{t.id}/unsnooze", headers=auth_headers)
    assert r.status_code == 200
    db_session.expire_all()
    assert db_session.get(Task, t.id).completed_at is None


def test_replayed_completion_keeps_the_original_day(client, auth_headers, db_session):
    """The real review bug, end to end. The offline queue writes the id before
    the POST and replays it on the next successful request, so a client timeout
    re-sends a completion days later. Un-guarded, that re-stamps completed_at to
    now and the task reappears in a later morning review as work done that day —
    after it was already reviewed. The stamp must survive the replay."""
    from datetime import datetime, timezone
    user = _mk_user(db_session)
    t = _mk_task(db_session, user.id)
    client.post(f"/tasks/{t.id}/complete", headers=auth_headers)

    # Backdate into an already-reviewed day.
    db_session.expire_all()
    row = db_session.get(Task, t.id)
    original = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    row.completed_at = original
    row.title = "Finished two days ago"
    db_session.commit()

    pending = client.get("/review/pending", headers=auth_headers).json()
    assert "Finished two days ago" in {x["title"] for x in pending["tasks"]}
    client.post("/review/commit", headers=auth_headers, json={
        "date": pending["date"],
        "tasks": [{"id": t.id, "effort": "small"}],
    })
    assert client.get("/review/pending", headers=auth_headers).json() is None

    # The offline queue drains and replays the completion.
    r = client.post(f"/tasks/{t.id}/complete", headers=auth_headers)
    assert r.status_code == 200

    db_session.expire_all()
    assert db_session.get(Task, t.id).completed_at == original
