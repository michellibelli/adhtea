"""Tests for the Today page (formed by merging the old Triage page in).

Covers the backend behavior Today relies on: capacity-driven max_slots on
/capacity/today, inbox ordering by due_date + priority, and soft-delete.
"""

from datetime import date, datetime, timedelta

import pytest
from models import (
    CapacitySnapshot, Task, TaskStatus, TaskType, Priority, User,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _user(db):
    return db.query(User).filter(User.username == "testuser").first()


@pytest.fixture(autouse=True)
def _seed_user(primary_user_token):
    yield


def _mk_task(db, user_id, title="t", **kwargs):
    kwargs.setdefault("task_type", TaskType.task)
    kwargs.setdefault("status", TaskStatus.inbox)
    t = Task(owner_id=user_id, title=title, **kwargs)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def _mk_capacity(db, user_id, overall, log_date=None):
    snap = CapacitySnapshot(
        user_id=user_id,
        log_date=log_date or date.today(),
        sleep_battery=overall,
        nutrition_battery=overall,
        physical_battery=overall,
        emotional_battery=overall,
        environment_battery=overall,
        executive_capacitor=overall,
        overall=overall,
        computed_at=datetime.now(),
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return snap


# ---------------------------------------------------------------------------
# Phase 1: capacity/today returns max_slots
# ---------------------------------------------------------------------------

class TestCapacityMaxSlots:
    """GET /capacity/today should include max_slots derived from capacity."""

    def test_max_slots_present_when_capacity_logged(self, client, auth_headers, db_session):
        user = _user(db_session)
        _mk_capacity(db_session, user.id, overall=60.0)
        r = client.get("/capacity/today", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert "max_slots" in data
        assert isinstance(data["max_slots"], int)
        assert data["max_slots"] > 0

    def test_max_slots_scales_with_capacity(self, client, auth_headers, db_session):
        """Higher capacity → more slots."""
        user = _user(db_session)
        _mk_capacity(db_session, user.id, overall=40.0)
        r_low = client.get("/capacity/today", headers=auth_headers)

        # Update capacity to high
        snap = db_session.query(CapacitySnapshot).filter(
            CapacitySnapshot.user_id == user.id
        ).first()
        snap.overall = 90.0
        db_session.commit()

        r_high = client.get("/capacity/today", headers=auth_headers)
        assert r_high.json()["max_slots"] > r_low.json()["max_slots"]

    def test_max_slots_null_when_no_capacity(self, client, auth_headers, db_session):
        """No capacity snapshot → response is null (frontend falls back to default)."""
        r = client.get("/capacity/today", headers=auth_headers)
        # No snapshot logged → returns null
        assert r.status_code == 200
        assert r.json() is None


# ---------------------------------------------------------------------------
# Phase 1: inbox ordering by due_date + priority
# ---------------------------------------------------------------------------

class TestInboxOrdering:
    """GET /tasks/inbox should order by due_date ASC (nulls last), then priority rank."""

    def test_due_date_ordering(self, client, auth_headers, db_session):
        user = _user(db_session)
        today = date.today()
        # Inbox hides future due_dates, so use today and yesterday
        t_today     = _mk_task(db_session, user.id, title="due_today",     due_date=today)
        t_yesterday = _mk_task(db_session, user.id, title="due_yesterday", due_date=today - timedelta(days=1))
        t_none      = _mk_task(db_session, user.id, title="no_date")

        r = client.get("/tasks/inbox", headers=auth_headers)
        assert r.status_code == 200
        titles = [t["title"] for t in r.json()]
        # yesterday before today, both before no-date
        assert titles.index("due_yesterday") < titles.index("due_today")
        assert titles.index("due_today") < titles.index("no_date")

    def test_priority_tiebreaker(self, client, auth_headers, db_session):
        """Same due_date → urgent before normal before low."""
        user = _user(db_session)
        today = date.today()
        t_low    = _mk_task(db_session, user.id, title="low",    due_date=today, priority=Priority.low)
        t_urgent = _mk_task(db_session, user.id, title="urgent", due_date=today, priority=Priority.urgent)
        t_normal = _mk_task(db_session, user.id, title="normal", due_date=today, priority=Priority.normal)

        r = client.get("/tasks/inbox", headers=auth_headers)
        titles = [t["title"] for t in r.json()]
        assert titles.index("urgent") < titles.index("normal")
        assert titles.index("normal") < titles.index("low")

    def test_null_priority_treated_as_normal(self, client, auth_headers, db_session):
        """Tasks with no priority set sort alongside normal-priority tasks."""
        user = _user(db_session)
        today = date.today()
        t_urgent   = _mk_task(db_session, user.id, title="urgent",   due_date=today, priority=Priority.urgent)
        t_no_prio  = _mk_task(db_session, user.id, title="no_prio",  due_date=today)
        t_low      = _mk_task(db_session, user.id, title="low",      due_date=today, priority=Priority.low)

        r = client.get("/tasks/inbox", headers=auth_headers)
        titles = [t["title"] for t in r.json()]
        assert titles.index("urgent") < titles.index("no_prio")
        assert titles.index("no_prio") < titles.index("low")


# ---------------------------------------------------------------------------
# Phase 1: delete soft-deletes so task stops appearing
# ---------------------------------------------------------------------------

class TestTaskDelete:
    """DELETE /tasks/{id} should soft-delete so task stops appearing."""

    def test_deleted_task_excluded_from_inbox(self, client, auth_headers, db_session):
        user = _user(db_session)
        t = _mk_task(db_session, user.id, title="trash me")
        r = client.delete(f"/tasks/{t.id}", headers=auth_headers)
        assert r.status_code == 200

        r = client.get("/tasks/inbox", headers=auth_headers)
        titles = [t["title"] for t in r.json()]
        assert "trash me" not in titles
