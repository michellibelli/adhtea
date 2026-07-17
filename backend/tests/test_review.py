"""Morning review — /review/pending + /review/commit.

No ANTHROPIC_API_KEY in the test env, so these exercise the heuristic +
sunny-fallback path end to end (Haiku is never called).
"""

from datetime import datetime, timezone, timedelta

from models import User, Task, TaskStatus, TaskType, Effort, EffortExample


def _mk_done(db, user_id, title, completed_at):
    t = Task(
        owner_id=user_id,
        title=title,
        task_type=TaskType.task,
        status=TaskStatus.done,
        completed_at=completed_at,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def _user(db):
    return db.query(User).first()


def test_pending_none_when_no_activity(client, auth_headers):
    r = client.get("/review/pending", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() is None


def test_pending_surfaces_yesterday_with_guesses(client, auth_headers, db_session):
    u = _user(db_session)
    # Two tasks finished "yesterday" (2 days back to be safely before today's
    # app-day start regardless of the clock).
    day = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    _mk_done(db_session, u.id, "Call pharmacy", day)
    _mk_done(db_session, u.id, "Draft insurance email", day)

    r = client.get("/review/pending", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data is not None
    assert data["greeting"]                      # always a sunny line
    titles = {t["title"]: t["effort_guess"] for t in data["tasks"]}
    assert titles["Call pharmacy"] == "small"    # heuristic
    assert titles["Draft insurance email"] == "big"


def test_commit_stamps_effort_and_watermark_and_learns(client, auth_headers, db_session):
    u = _user(db_session)
    day = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    t1 = _mk_done(db_session, u.id, "Call pharmacy", day)

    pending = client.get("/review/pending", headers=auth_headers).json()
    review_date = pending["date"]

    # She overrides the guess: this call was actually a big deal.
    r = client.post("/review/commit", headers=auth_headers, json={
        "date": review_date,
        "tasks": [{"id": t1.id, "effort": "big"}],
    })
    assert r.status_code == 200, r.text
    assert r.json()["reviewed_through"] == review_date

    db_session.expire_all()
    assert db_session.query(Task).get(t1.id).effort == Effort.big
    assert db_session.query(User).get(u.id).reviewed_through.isoformat() == review_date
    # Correction stored for future few-shot / override.
    ex = db_session.query(EffortExample).filter_by(user_id=u.id).one()
    assert ex.title_key == "call pharmacy" and ex.effort == Effort.big


def test_reviewed_day_not_resurfaced(client, auth_headers, db_session):
    u = _user(db_session)
    day = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    t1 = _mk_done(db_session, u.id, "Sort mail", day)

    pending = client.get("/review/pending", headers=auth_headers).json()
    client.post("/review/commit", headers=auth_headers, json={
        "date": pending["date"],
        "tasks": [{"id": t1.id, "effort": "small"}],
    })
    # Same day already reviewed -> nothing pending now.
    again = client.get("/review/pending", headers=auth_headers)
    assert again.json() is None


def test_stored_override_beats_heuristic(client, auth_headers, db_session):
    u = _user(db_session)
    # Teach the store that "Call pharmacy" is big (opposite of the heuristic).
    db_session.add(EffortExample(user_id=u.id, title_key="call pharmacy", effort=Effort.big))
    db_session.commit()

    day = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    _mk_done(db_session, u.id, "Call pharmacy", day)

    data = client.get("/review/pending", headers=auth_headers).json()
    guess = {t["title"]: t["effort_guess"] for t in data["tasks"]}
    assert guess["Call pharmacy"] == "big"   # override wins over heuristic "small"
