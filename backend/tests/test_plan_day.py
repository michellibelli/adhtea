"""Tests for the once-per-day "Start my day" commit ritual.

/me exposes `day_planned` (true when planned_on == the user's app-day) and
POST /tasks/plan-day stamps planned_on to the current app-day. The flag rides
the same app-day boundary as the daily rollover, so it resets each new day.
"""

from models import User


def _user(db):
    return db.query(User).filter(User.username == "testuser").first()


class TestPlanDay:
    def test_day_planned_false_before_planning(self, client, auth_headers, db_session):
        r = client.get("/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["day_planned"] is False

    def test_plan_day_sets_flag(self, client, auth_headers, db_session):
        r = client.post("/tasks/plan-day", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["day_planned"] is True

        me = client.get("/me", headers=auth_headers)
        assert me.json()["day_planned"] is True

    def test_plan_day_idempotent(self, client, auth_headers, db_session):
        client.post("/tasks/plan-day", headers=auth_headers)
        r = client.post("/tasks/plan-day", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["day_planned"] is True

    def test_stale_planned_on_reads_as_not_planned(self, client, auth_headers, db_session):
        from datetime import date, timedelta
        user = _user(db_session)
        user.planned_on = date.today() - timedelta(days=1)
        db_session.commit()

        me = client.get("/me", headers=auth_headers)
        assert me.json()["day_planned"] is False
