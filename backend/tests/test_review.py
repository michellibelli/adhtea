"""Morning review — /review/pending + /review/commit.

No ANTHROPIC_API_KEY in the test env, so these exercise the sunny-fallback
greeting path end to end (Haiku is never called). Small/big effort tagging
was removed in 4.20.0 — time captured at completion replaced it; these tests
cover what's left: the greeting, the task list, and the not-done correction.
"""

from datetime import datetime, timezone, timedelta

from models import User, Task, TaskStatus, TaskType
from routes.task_lifecycle import _day_start, _app_day_start_utc


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


def test_pending_surfaces_yesterday(client, auth_headers, db_session):
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
    titles = {t["title"] for t in data["tasks"]}
    assert titles == {"Call pharmacy", "Draft insurance email"}


def test_commit_stamps_watermark(client, auth_headers, db_session):
    u = _user(db_session)
    day = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    t1 = _mk_done(db_session, u.id, "Call pharmacy", day)

    pending = client.get("/review/pending", headers=auth_headers).json()
    review_date = pending["date"]

    r = client.post("/review/commit", headers=auth_headers, json={
        "date": review_date,
        "tasks": [{"id": t1.id}],
    })
    assert r.status_code == 200, r.text
    assert r.json()["reviewed_through"] == review_date

    db_session.expire_all()
    assert db_session.get(User, u.id).reviewed_through.isoformat() == review_date


def test_commit_adds_backdated_done_tasks(client, auth_headers, db_session):
    u = _user(db_session)
    day = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    t1 = _mk_done(db_session, u.id, "Call pharmacy", day)

    pending = client.get("/review/pending", headers=auth_headers).json()
    review_date = pending["date"]

    r = client.post("/review/commit", headers=auth_headers, json={
        "date": review_date,
        "tasks": [{"id": t1.id}],
        "added": [{"title": "Folded all the laundry"}],
    })
    assert r.status_code == 200, r.text

    db_session.expire_all()
    new = db_session.query(Task).filter_by(
        owner_id=u.id, title="Folded all the laundry"
    ).one()
    assert new.status == TaskStatus.done
    assert new.completed_at is not None
    # The added task now belongs to the reviewed day, so re-fetching pending
    # finds nothing (that day is stamped reviewed).
    assert client.get("/review/pending", headers=auth_headers).json() is None


def test_reviewed_day_not_resurfaced(client, auth_headers, db_session):
    u = _user(db_session)
    day = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    t1 = _mk_done(db_session, u.id, "Sort mail", day)

    pending = client.get("/review/pending", headers=auth_headers).json()
    client.post("/review/commit", headers=auth_headers, json={
        "date": pending["date"],
        "tasks": [{"id": t1.id}],
    })
    # Same day already reviewed -> nothing pending now.
    again = client.get("/review/pending", headers=auth_headers)
    assert again.json() is None


def test_evening_completion_still_surfaces(client, auth_headers, db_session):
    """Regression: `completed_at` is naive UTC, but the old exclusion boundary
    used local-midnight (`_day_start`). For a west-of-UTC user that dropped
    yesterday-evening completions from the review, so an evening-heavy day
    surfaced nothing. A completion in that gap must now still surface."""
    u = _user(db_session)
    # A task finished late yesterday (local): its naive-UTC completed_at sits
    # after local-midnight (old boundary) but before the true app-day start.
    gap = _app_day_start_utc(u) - _day_start(u)
    assert gap > timedelta(0), "test only meaningful for a non-UTC user tz"
    evening = _day_start(u) + timedelta(minutes=30)
    _mk_done(db_session, u.id, "Bath and lights-out routine", evening)

    data = client.get("/review/pending", headers=auth_headers).json()
    assert data is not None, "yesterday-evening completion was dropped"
    assert any(t["title"] == "Bath and lights-out routine" for t in data["tasks"])


# ---------------------------------------------------------------------------
# "Not done" — she corrects a task the app wrongly recorded as finished.
# ---------------------------------------------------------------------------

def test_commit_uncompletes_flagged_item(client, auth_headers, db_session):
    u = _user(db_session)
    day = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    t1 = _mk_done(db_session, u.id, "Call pharmacy", day)

    pending = client.get("/review/pending", headers=auth_headers).json()
    r = client.post("/review/commit", headers=auth_headers, json={
        "date": pending["date"],
        "tasks": [{"id": t1.id, "done": False}],
    })
    assert r.status_code == 200, r.text

    db_session.expire_all()
    t = db_session.get(Task, t1.id)
    assert t.status == TaskStatus.inbox
    assert t.completed_at is None
    assert t.scheduled_date is None
    assert t.sort_order is None
    # She corrected a mis-record; she did not push the work forward.
    assert (t.push_count or 0) == 0


def test_commit_mixes_done_and_not_done(client, auth_headers, db_session):
    u = _user(db_session)
    day = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    kept = _mk_done(db_session, u.id, "Draft insurance email", day)
    wrong = _mk_done(db_session, u.id, "Call pharmacy", day)

    pending = client.get("/review/pending", headers=auth_headers).json()
    r = client.post("/review/commit", headers=auth_headers, json={
        "date": pending["date"],
        "tasks": [
            {"id": kept.id},
            {"id": wrong.id, "done": False},
        ],
    })
    assert r.status_code == 200, r.text

    db_session.expire_all()
    assert db_session.get(Task, kept.id).status == TaskStatus.done
    assert db_session.get(Task, wrong.id).status == TaskStatus.inbox


def test_uncompleted_task_absent_from_future_pending(client, auth_headers, db_session):
    """The whole point: it must not come back tomorrow."""
    u = _user(db_session)
    day = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    t1 = _mk_done(db_session, u.id, "Call pharmacy", day)
    t2 = _mk_done(db_session, u.id, "Sort mail", day)

    pending = client.get("/review/pending", headers=auth_headers).json()
    client.post("/review/commit", headers=auth_headers, json={
        "date": pending["date"],
        "tasks": [{"id": t1.id, "done": False}, {"id": t2.id}],
    })

    # Rewind the watermark so the same day is eligible again — this isolates the
    # completed_at clearing from the reviewed_through watermark.
    db_session.expire_all()
    db_session.get(User, u.id).reviewed_through = None
    db_session.commit()

    again = client.get("/review/pending", headers=auth_headers).json()
    titles = {t["title"] for t in (again["tasks"] if again else [])}
    assert "Call pharmacy" not in titles
    assert "Sort mail" in titles


def test_legacy_payload_with_effort_still_commits(client, auth_headers, db_session):
    """Back-compat pin. A pre-4.20.0 `{id, effort}` commit can be sitting in
    localStorage.aria_pending_reviews at deploy time, and commitReview drops a
    permanent 4xx without retrying — a 422 here would silently discard a
    queued morning. `effort` is accepted and ignored, not rejected."""
    u = _user(db_session)
    day = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    t1 = _mk_done(db_session, u.id, "Call pharmacy", day)

    pending = client.get("/review/pending", headers=auth_headers).json()
    r = client.post("/review/commit", headers=auth_headers, json={
        "date": pending["date"],
        "tasks": [{"id": t1.id, "effort": "small"}],
    })
    assert r.status_code == 200, r.text
    db_session.expire_all()
    assert db_session.get(Task, t1.id).status == TaskStatus.done


def test_done_row_without_effort_commits(client, auth_headers, db_session):
    """effort is no longer required — a bare {id} row commits fine."""
    u = _user(db_session)
    day = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    t1 = _mk_done(db_session, u.id, "Call pharmacy", day)

    pending = client.get("/review/pending", headers=auth_headers).json()
    r = client.post("/review/commit", headers=auth_headers, json={
        "date": pending["date"],
        "tasks": [{"id": t1.id}],
    })
    assert r.status_code == 200, r.text


def test_uncomplete_ignores_unowned_ids(client, auth_headers, db_session):
    """A not-done flag for someone else's task must not touch it."""
    u = _user(db_session)
    other = User(name="Someone Else", username="other", hashed_password="x")
    db_session.add(other)
    db_session.commit()
    day = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    mine = _mk_done(db_session, u.id, "Sort mail", day)
    theirs = _mk_done(db_session, other.id, "Not mine", day)

    pending = client.get("/review/pending", headers=auth_headers).json()
    r = client.post("/review/commit", headers=auth_headers, json={
        "date": pending["date"],
        "tasks": [{"id": mine.id},
                  {"id": theirs.id, "done": False}],
    })
    assert r.status_code == 200, r.text

    db_session.expire_all()
    t = db_session.get(Task, theirs.id)
    assert t.status == TaskStatus.done
    assert t.completed_at is not None
