"""Tests for the once-per-day "Start my day" commit ritual.

/me exposes `day_planned` (true when planned_on == the user's app-day) and
POST /tasks/plan-day stamps planned_on to the current app-day. The flag rides
the same app-day boundary as the daily rollover, so it resets each new day.

plan-day is gated on today's CapacitySnapshot existing — it snapshots
day_capacity_slots from it, so there has to be a real number to snapshot.
"""

from datetime import date, datetime

from models import CapacitySnapshot, User


def _user(db):
    return db.query(User).filter(User.username == "testuser").first()


def _seed_capacity(db, user_id, overall=70.0):
    snap = CapacitySnapshot(
        user_id=user_id,
        log_date=date.today(),
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
    return snap


class TestPlanDay:
    def test_day_planned_false_before_planning(self, client, auth_headers, db_session):
        r = client.get("/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["day_planned"] is False

    def test_plan_day_requires_capacity_snapshot(self, client, auth_headers, db_session):
        r = client.post("/tasks/plan-day", headers=auth_headers)
        assert r.status_code == 409

    def test_plan_day_sets_flag(self, client, auth_headers, db_session):
        user = _user(db_session)
        _seed_capacity(db_session, user.id)

        r = client.post("/tasks/plan-day", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["day_planned"] is True

        me = client.get("/me", headers=auth_headers)
        assert me.json()["day_planned"] is True

    def test_plan_day_snapshots_capacity_slots(self, client, auth_headers, db_session):
        user = _user(db_session)
        _seed_capacity(db_session, user.id)

        r = client.post("/tasks/plan-day", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["day_capacity_slots"] is not None

        me = client.get("/me", headers=auth_headers)
        assert me.json()["day_capacity_slots"] == r.json()["day_capacity_slots"]

    def test_plan_day_idempotent(self, client, auth_headers, db_session):
        user = _user(db_session)
        _seed_capacity(db_session, user.id)

        client.post("/tasks/plan-day", headers=auth_headers)
        r = client.post("/tasks/plan-day", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["day_planned"] is True

    def test_stale_planned_on_reads_as_not_planned(self, client, auth_headers, db_session):
        from datetime import timedelta
        user = _user(db_session)
        user.planned_on = date.today() - timedelta(days=1)
        db_session.commit()

        me = client.get("/me", headers=auth_headers)
        assert me.json()["day_planned"] is False
