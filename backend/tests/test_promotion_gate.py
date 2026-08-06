"""Tests for auto-promotion: the plan gate, the capacity ceiling, and the
snooze/due_date interaction.

The bug these cover: promote_due_tasks runs on every GET /tasks/today and
computes its room as `slots - count_today()`, live. So every slot she freed —
by completing, snoozing, deferring — was refilled from the due-inbox on the
very next read. Planning the day, then tapping into Focus, pulled the prunings'
replacements in behind her; completing a task summoned a replacement. The plan
could never stay put.

Promotion is now a planning-time sweep, gated on User.planned_on, filling to
the capacity-driven slot count rather than the hard DAILY_CAP.
"""

from datetime import date, timedelta

from models import User, Task, TaskStatus, TaskType, CapacitySnapshot


def _user(db):
    return db.query(User).filter(User.username == "testuser").first()


def _due_task(client, headers, title, due=None, task_type="task"):
    """Create a task due today (or a given date) and leave it in the inbox.

    POST /tasks routes a due-today task straight into Today, which is not the
    state under test here — these tests need it sitting in the inbox waiting to
    be promoted, the way a carried-forward or un-snoozed task does.
    """
    r = client.post("/tasks", json={"title": title, "task_type": task_type}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _park_in_inbox(db, task_ids, due):
    for tid in task_ids:
        t = db.query(Task).filter(Task.id == tid).first()
        t.status = TaskStatus.inbox
        t.scheduled_date = None
        t.due_date = due
    db.commit()


def _today_ids(client, headers):
    r = client.get("/tasks/today", headers=headers)
    assert r.status_code == 200, r.text
    return [t["id"] for t in r.json()]


class TestPlanGate:
    def test_promotes_before_the_day_is_planned(self, client, auth_headers, db_session):
        tid = _due_task(client, auth_headers, "Pay water bill")
        _park_in_inbox(db_session, [tid], date.today())

        assert tid in _today_ids(client, auth_headers)

    def test_does_not_promote_after_start_my_day(self, client, auth_headers, db_session):
        client.post("/tasks/plan-day", headers=auth_headers)

        tid = _due_task(client, auth_headers, "Pay water bill")
        _park_in_inbox(db_session, [tid], date.today())

        assert tid not in _today_ids(client, auth_headers)
        # and it's still reachable — waiting in Up Next, not vanished
        inbox = client.get("/tasks/inbox", headers=auth_headers).json()
        assert tid in [t["id"] for t in inbox]

    def test_completing_a_task_does_not_summon_a_replacement(self, client, auth_headers, db_session):
        """The reported symptom, end to end."""
        planned = _due_task(client, auth_headers, "Planned thing")
        _park_in_inbox(db_session, [planned], date.today())
        assert planned in _today_ids(client, auth_headers)

        waiting = _due_task(client, auth_headers, "Waiting thing")
        _park_in_inbox(db_session, [waiting], date.today())

        client.post("/tasks/plan-day", headers=auth_headers)
        client.post(f"/tasks/{planned}/complete", headers=auth_headers)

        # A slot just opened. Nothing may walk into it.
        assert waiting not in _today_ids(client, auth_headers)

    def test_freed_slot_is_not_refilled_after_snoozing(self, client, auth_headers, db_session):
        planned = _due_task(client, auth_headers, "Planned thing")
        _park_in_inbox(db_session, [planned], date.today())
        assert planned in _today_ids(client, auth_headers)

        waiting = _due_task(client, auth_headers, "Waiting thing")
        _park_in_inbox(db_session, [waiting], date.today())

        client.post("/tasks/plan-day", headers=auth_headers)
        tomorrow = (date.today() + timedelta(days=1)).isoformat() + "T14:00:00"
        client.post(f"/tasks/{planned}/snooze", json={"snooze_until": tomorrow}, headers=auth_headers)

        ids = _today_ids(client, auth_headers)
        assert planned not in ids
        assert waiting not in ids

    def test_gate_reopens_on_a_new_app_day(self, client, auth_headers, db_session):
        client.post("/tasks/plan-day", headers=auth_headers)
        user = _user(db_session)
        user.planned_on = date.today() - timedelta(days=1)
        db_session.commit()

        tid = _due_task(client, auth_headers, "Fresh morning task")
        _park_in_inbox(db_session, [tid], date.today())

        assert tid in _today_ids(client, auth_headers)


class TestCapacityCeiling:
    def _snapshot(self, db, user_id, overall):
        db.add(CapacitySnapshot(
            user_id=user_id, log_date=date.today(),
            sleep_battery=overall, nutrition_battery=overall,
            physical_battery=overall, emotional_battery=overall,
            environment_battery=overall, executive_capacitor=overall,
            overall=overall,
        ))
        db.commit()

    def test_low_capacity_promotes_fewer(self, client, auth_headers, db_session):
        user = _user(db_session)
        self._snapshot(db_session, user.id, 20.0)   # -> max_slots_for(20) == 2

        ids = [_due_task(client, auth_headers, f"Task {i}") for i in range(8)]
        _park_in_inbox(db_session, ids, date.today())

        assert len(_today_ids(client, auth_headers)) == 2

    def test_high_capacity_promotes_more(self, client, auth_headers, db_session):
        user = _user(db_session)
        self._snapshot(db_session, user.id, 100.0)  # -> 10 slots

        ids = [_due_task(client, auth_headers, f"Task {i}") for i in range(8)]
        _park_in_inbox(db_session, ids, date.today())

        assert len(_today_ids(client, auth_headers)) == 8

    def test_no_snapshot_falls_back_to_daily_cap(self, client, auth_headers, db_session):
        """Before the self-care check-in there's no basis to call it a small
        day, so promotion behaves as it always did."""
        ids = [_due_task(client, auth_headers, f"Task {i}") for i in range(8)]
        _park_in_inbox(db_session, ids, date.today())

        assert len(_today_ids(client, auth_headers)) == 8

    def test_appointments_bypass_the_ceiling(self, client, auth_headers, db_session):
        user = _user(db_session)
        self._snapshot(db_session, user.id, 10.0)   # 1 slot

        appt = _due_task(client, auth_headers, "Dentist", task_type="appointment")
        _park_in_inbox(db_session, [appt], date.today())

        assert appt in _today_ids(client, auth_headers)


class TestSnoozeAdvancesDueDate:
    def test_snooze_pushes_due_date_to_the_wake_day(self, client, auth_headers, db_session):
        tid = _due_task(client, auth_headers, "Overdue thing")
        _park_in_inbox(db_session, [tid], date.today() - timedelta(days=3))

        wake = date.today() + timedelta(days=2)
        r = client.post(
            f"/tasks/{tid}/snooze",
            json={"snooze_until": wake.isoformat() + "T14:00:00"},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        assert r.json()["due_date"] == wake.isoformat()

    def test_snoozed_task_does_not_bounce_straight_back(self, client, auth_headers, db_session):
        """The snooze used to be undone by the very next promotion sweep: the
        task returned to the inbox still due today and was immediately re-admitted."""
        tid = _due_task(client, auth_headers, "Bouncer")
        _park_in_inbox(db_session, [tid], date.today())
        assert tid in _today_ids(client, auth_headers)

        wake = date.today() + timedelta(days=1)
        client.post(
            f"/tasks/{tid}/snooze",
            json={"snooze_until": wake.isoformat() + "T14:00:00"},
            headers=auth_headers,
        )

        # Force the snooze to resolve, as it would when its morning arrives.
        t = db_session.query(Task).filter(Task.id == tid).first()
        t.snooze_until = t.snooze_until - timedelta(days=2)
        db_session.commit()

        # It's back in the inbox, but no longer due today, so it stays there.
        assert tid not in _today_ids(client, auth_headers)

    def test_snooze_never_pulls_a_later_due_date_backwards(self, client, auth_headers, db_session):
        far = date.today() + timedelta(days=30)
        tid = _due_task(client, auth_headers, "Distant deadline")
        _park_in_inbox(db_session, [tid], far)

        r = client.post(
            f"/tasks/{tid}/snooze",
            json={"snooze_until": (date.today() + timedelta(days=2)).isoformat() + "T14:00:00"},
            headers=auth_headers,
        )
        assert r.json()["due_date"] == far.isoformat()
