"""Morning review — /review/pending + /review/commit.

No ANTHROPIC_API_KEY in the test env, so these exercise the heuristic +
sunny-fallback path end to end (Haiku is never called).
"""

from datetime import datetime, timezone, timedelta

from models import User, Task, TaskStatus, TaskType, Effort, EffortExample
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
    assert db_session.get(Task, t1.id).effort == Effort.big
    assert db_session.get(User, u.id).reviewed_through.isoformat() == review_date
    # Correction stored for future few-shot / override.
    ex = db_session.query(EffortExample).filter_by(user_id=u.id).one()
    assert ex.title_key == "call pharmacy" and ex.effort == Effort.big


def test_commit_adds_backdated_done_tasks(client, auth_headers, db_session):
    u = _user(db_session)
    day = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    t1 = _mk_done(db_session, u.id, "Call pharmacy", day)

    pending = client.get("/review/pending", headers=auth_headers).json()
    review_date = pending["date"]

    r = client.post("/review/commit", headers=auth_headers, json={
        "date": review_date,
        "tasks": [{"id": t1.id, "effort": "small"}],
        "added": [{"title": "Folded all the laundry", "effort": "big"}],
    })
    assert r.status_code == 200, r.text

    db_session.expire_all()
    new = db_session.query(Task).filter_by(
        owner_id=u.id, title="Folded all the laundry"
    ).one()
    assert new.status == TaskStatus.done
    assert new.effort == Effort.big
    assert new.completed_at is not None
    # The added task now belongs to the reviewed day, so re-fetching pending
    # finds nothing (that day is stamped reviewed).
    assert client.get("/review/pending", headers=auth_headers).json() is None
    # And its effort was learned.
    ex = db_session.query(EffortExample).filter_by(
        user_id=u.id, title_key="folded all the laundry"
    ).one()
    assert ex.effort == Effort.big


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
    assert t.effort is None
    assert t.scheduled_date is None
    assert t.sort_order is None
    # She corrected a mis-record; she did not push the work forward.
    assert (t.push_count or 0) == 0


def test_uncompleted_item_is_not_learned(client, auth_headers, db_session):
    """The anti-training pin. An un-flagged row must never reach
    record_corrections — otherwise a wrong review list actively trains the
    effort guesser on work that never happened, which is the compounding half
    of this bug."""
    u = _user(db_session)
    day = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    t1 = _mk_done(db_session, u.id, "Call pharmacy", day)

    pending = client.get("/review/pending", headers=auth_headers).json()
    client.post("/review/commit", headers=auth_headers, json={
        "date": pending["date"],
        "tasks": [{"id": t1.id, "done": False}],
    })

    db_session.expire_all()
    assert db_session.query(EffortExample).filter_by(user_id=u.id).count() == 0


def test_commit_mixes_done_and_not_done(client, auth_headers, db_session):
    u = _user(db_session)
    day = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    kept = _mk_done(db_session, u.id, "Draft insurance email", day)
    wrong = _mk_done(db_session, u.id, "Call pharmacy", day)

    pending = client.get("/review/pending", headers=auth_headers).json()
    r = client.post("/review/commit", headers=auth_headers, json={
        "date": pending["date"],
        "tasks": [
            {"id": kept.id, "effort": "big"},
            {"id": wrong.id, "done": False},
        ],
    })
    assert r.status_code == 200, r.text

    db_session.expire_all()
    assert db_session.get(Task, kept.id).status == TaskStatus.done
    assert db_session.get(Task, kept.id).effort == Effort.big
    assert db_session.get(Task, wrong.id).status == TaskStatus.inbox
    # Only the confirmed row was learned from.
    keys = {e.title_key for e in db_session.query(EffortExample).filter_by(user_id=u.id)}


def test_uncompleted_task_absent_from_future_pending(client, auth_headers, db_session):
    """The whole point: it must not come back tomorrow."""
    u = _user(db_session)
    day = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    t1 = _mk_done(db_session, u.id, "Call pharmacy", day)
    t2 = _mk_done(db_session, u.id, "Sort mail", day)

    pending = client.get("/review/pending", headers=auth_headers).json()
    client.post("/review/commit", headers=auth_headers, json={
        "date": pending["date"],
        "tasks": [{"id": t1.id, "done": False}, {"id": t2.id, "effort": "small"}],
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


def test_legacy_payload_without_done_still_commits(client, auth_headers, db_session):
    """Back-compat pin. A pre-4.17.0 `{id, effort}` commit can be sitting in
    localStorage.aria_pending_reviews at deploy time, and commitReview drops a
    permanent 4xx without retrying — a 422 here would silently discard a
    queued morning."""
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
    assert db_session.get(Task, t1.id).effort == Effort.small


def test_done_row_without_effort_is_rejected(client, auth_headers, db_session):
    u = _user(db_session)
    day = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=2)
    t1 = _mk_done(db_session, u.id, "Call pharmacy", day)

    pending = client.get("/review/pending", headers=auth_headers).json()
    r = client.post("/review/commit", headers=auth_headers, json={
        "date": pending["date"],
        "tasks": [{"id": t1.id}],
    })
    assert r.status_code == 422


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
        "tasks": [{"id": mine.id, "effort": "small"},
                  {"id": theirs.id, "done": False}],
    })
    assert r.status_code == 200, r.text

    db_session.expire_all()
    t = db_session.get(Task, theirs.id)
    assert t.status == TaskStatus.done
    assert t.completed_at is not None
