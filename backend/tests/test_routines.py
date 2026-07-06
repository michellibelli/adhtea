"""Routines: CRUD + lazy daily instance generation.

`generate_routine_instances` is called from the Today/Inbox endpoints; tests
exercise it directly. Frequency dispatch (`_is_routine_due`) is pure logic and
gets a direct pass.
"""

from datetime import date

from models import (
    Routine, RoutineFrequency, Task, TaskStatus, TaskType, TimeOfDay, User,
)
from routes.tasks import _is_routine_due, generate_routine_instances


def _user(db):
    return db.query(User).filter(User.username == "testuser").first()


import pytest

@pytest.fixture(autouse=True)
def _seed_user(primary_user_token):
    yield


def _mk_routine(db, user_id, frequency=RoutineFrequency.daily, days_of_week=None, is_critical=False):
    r = Routine(
        user_id=user_id, title="Brush teeth", frequency=frequency,
        time_of_day=TimeOfDay.morning, days_of_week=days_of_week,
        is_critical=is_critical, active=True,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def test_create_routine_persists_flags(client, auth_headers):
    r = client.post("/routines", json={
        "title": "Take meds",
        "frequency": "daily",
        "time_of_day": "morning",
        "only_when_present": True,
        "exact_time": "08:00",
    }, headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["only_when_present"] is True
    assert body["exact_time"] == "08:00"
    assert body["frequency"] == "daily"


def test_delete_soft_deactivates_routine(client, auth_headers, db_session):
    user = _user(db_session)
    r = _mk_routine(db_session, user.id)
    resp = client.delete(f"/routines/{r.id}", headers=auth_headers)
    assert resp.status_code == 200
    db_session.refresh(r)
    assert r.active is False


# ---------------------------------------------------------------------------
# _is_routine_due frequency dispatch
# ---------------------------------------------------------------------------

class _R:
    def __init__(self, frequency, days_of_week=None):
        self.frequency = frequency
        self.days_of_week = days_of_week


def test_daily_routine_is_due_every_day():
    r = _R(RoutineFrequency.daily)
    for day_num in range(7):
        # 2026-05-18 is Monday; iterate week
        assert _is_routine_due(r, date(2026, 5, 18 + day_num)) is True


def test_weekdays_routine_excludes_weekend():
    r = _R(RoutineFrequency.weekdays)
    assert _is_routine_due(r, date(2026, 5, 18)) is True   # Monday
    assert _is_routine_due(r, date(2026, 5, 22)) is True   # Friday
    assert _is_routine_due(r, date(2026, 5, 23)) is False  # Saturday
    assert _is_routine_due(r, date(2026, 5, 24)) is False  # Sunday


def test_weekends_routine_excludes_weekdays():
    r = _R(RoutineFrequency.weekends)
    assert _is_routine_due(r, date(2026, 5, 18)) is False  # Monday
    assert _is_routine_due(r, date(2026, 5, 23)) is True   # Saturday


def test_weekly_routine_uses_days_of_week_csv():
    r = _R(RoutineFrequency.weekly, days_of_week="0,2,4")  # Mon, Wed, Fri
    assert _is_routine_due(r, date(2026, 5, 18)) is True   # Mon
    assert _is_routine_due(r, date(2026, 5, 19)) is False  # Tue
    assert _is_routine_due(r, date(2026, 5, 20)) is True   # Wed


def test_weekly_routine_without_days_returns_false():
    r = _R(RoutineFrequency.weekly, days_of_week=None)
    assert _is_routine_due(r, date(2026, 5, 18)) is False


# ---------------------------------------------------------------------------
# Lazy daily instance generation
# ---------------------------------------------------------------------------

def test_generate_creates_task_per_due_routine(db_session):
    user = _user(db_session)
    user.day_start_hour = 0  # force gate open for any clock time during test
    db_session.commit()

    _mk_routine(db_session, user.id, is_critical=True)
    generate_routine_instances(user, db_session)

    tasks = db_session.query(Task).filter(
        Task.owner_id == user.id, Task.task_type == TaskType.routine
    ).all()
    assert len(tasks) == 1
    assert tasks[0].status == TaskStatus.today
    assert tasks[0].is_critical is True


def test_generate_is_idempotent_same_day(db_session):
    user = _user(db_session)
    user.day_start_hour = 0
    db_session.commit()
    _mk_routine(db_session, user.id)

    generate_routine_instances(user, db_session)
    generate_routine_instances(user, db_session)
    generate_routine_instances(user, db_session)

    count = db_session.query(Task).filter(
        Task.owner_id == user.id, Task.task_type == TaskType.routine
    ).count()
    assert count == 1


def test_generate_skips_inactive_routines(db_session):
    user = _user(db_session)
    user.day_start_hour = 0
    db_session.commit()
    r = _mk_routine(db_session, user.id)
    r.active = False
    db_session.commit()

    generate_routine_instances(user, db_session)
    count = db_session.query(Task).filter(
        Task.owner_id == user.id, Task.task_type == TaskType.routine
    ).count()
    assert count == 0


def test_routine_added_midday_appears_same_day(client, auth_headers, db_session):
    """Regression: the daily rollover runs once per day, so a routine created
    after today's rollover must still spawn its instance immediately (not wait
    until tomorrow)."""
    from models import User
    u = db_session.query(User).first()
    u.day_start_hour = 0  # keep the day-start gate open regardless of wall clock
    db_session.commit()

    # First Today load performs the daily rollover and stamps rolled_over_on.
    assert client.get("/tasks/today", headers=auth_headers).status_code == 200

    # Add a routine AFTER the rollover already ran today.
    r = client.post("/routines", json={"title": "Morning pages", "frequency": "daily"},
                    headers=auth_headers)
    assert r.status_code == 200

    titles = [t["title"] for t in client.get("/tasks/today", headers=auth_headers).json()]
    assert "Morning pages" in titles
