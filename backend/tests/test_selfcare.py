"""Self-care log + capacity snapshot tests.

Covers: upsert semantics (POST twice same day = one row), capacity math edge
cases (zero/missing fields), snapshot recomputed on every log change, daily
summary aggregates completed work + mood.
"""

from datetime import date, datetime

from models import (
    CapacitySnapshot, SelfCareLog,
    Task, TaskStatus, TaskType, User,
)
from routes.selfcare import _compute_capacity, _med_adherence


def _user(db):
    return db.query(User).filter(User.username == "testuser").first()


import pytest

@pytest.fixture(autouse=True)
def _seed_user(primary_user_token):
    yield


# ---------------------------------------------------------------------------
# _compute_capacity: pure math
# ---------------------------------------------------------------------------

def test_capacity_with_no_sleep_data_does_not_crash():
    log = SelfCareLog(sleep_hours=None, sleep_quality=None, meals=None,
                      exercise=None, mood=None)
    out = _compute_capacity(log)
    assert out["sleep_battery"] == 0
    assert out["nutrition_battery"] == 0
    assert out["physical_battery"] == 20.0  # baseline when exercise None/False
    assert 0 <= out["overall"] <= 100


def test_capacity_high_sleep_high_quality_yields_high_exec_cap():
    log = SelfCareLog(sleep_hours=8, sleep_quality=5, meals=4,
                      exercise=True, exercise_minutes=45, mood=5)
    out = _compute_capacity(log)
    assert out["executive_capacitor"] == 90.0
    assert out["sleep_battery"] == 100.0
    assert out["nutrition_battery"] == 100.0
    assert out["physical_battery"] == 100.0
    assert out["emotional_battery"] == 100.0


def test_capacity_exec_cap_drops_sharply_below_5_hours():
    log = SelfCareLog(sleep_hours=4, sleep_quality=3)
    out = _compute_capacity(log)
    # 5h threshold → 15 base; quality=3 → multiplier 0.6 + 0.4*3/5 = 0.84
    assert out["executive_capacitor"] == round(15.0 * 0.84, 1)


# ---------------------------------------------------------------------------
# medication_taken (plain yes/no, replaced MedicationSchedule/Log in 4.22.0)
# ---------------------------------------------------------------------------

def test_med_adherence_full_when_taken():
    log = SelfCareLog(medication_taken=True)
    assert _med_adherence(log) == 1.0


def test_med_adherence_zero_when_not_taken():
    log = SelfCareLog(medication_taken=False)
    assert _med_adherence(log) == 0.0


def test_med_adherence_none_when_unanswered():
    """No regimen or the question is off in Settings — either way it should
    neither help nor hurt capacity, matching the None branch in
    _compute_capacity's exec_cap modulation."""
    log = SelfCareLog(medication_taken=None)
    assert _med_adherence(log) is None


def test_capacity_medication_taken_true_beats_false():
    log_yes = SelfCareLog(sleep_hours=6, sleep_quality=3, medication_taken=True)
    log_no  = SelfCareLog(sleep_hours=6, sleep_quality=3, medication_taken=False)
    out_yes = _compute_capacity(log_yes, _med_adherence(log_yes))
    out_no  = _compute_capacity(log_no,  _med_adherence(log_no))
    assert out_yes["executive_capacitor"] > out_no["executive_capacitor"]


# ---------------------------------------------------------------------------
# /self-care/log upsert semantics
# ---------------------------------------------------------------------------

def test_log_post_creates_then_updates_same_row(client, auth_headers, db_session):
    user = _user(db_session)

    r1 = client.post("/self-care/log", json={"sleep_hours": 6, "mood": 3}, headers=auth_headers)
    r2 = client.post("/self-care/log", json={"sleep_hours": 8, "mood": 5}, headers=auth_headers)
    assert r1.status_code == 200 and r2.status_code == 200

    rows = db_session.query(SelfCareLog).filter(SelfCareLog.user_id == user.id).all()
    assert len(rows) == 1
    assert rows[0].sleep_hours == 8
    assert rows[0].mood == 5


def test_log_post_creates_capacity_snapshot(client, auth_headers, db_session):
    user = _user(db_session)
    client.post("/self-care/log", json={"sleep_hours": 8, "sleep_quality": 5}, headers=auth_headers)
    snap = db_session.query(CapacitySnapshot).filter(CapacitySnapshot.user_id == user.id).first()
    assert snap is not None
    assert snap.executive_capacitor == 90.0


def test_log_post_upserts_capacity_snapshot(client, auth_headers, db_session):
    user = _user(db_session)
    client.post("/self-care/log", json={"sleep_hours": 4}, headers=auth_headers)
    client.post("/self-care/log", json={"sleep_hours": 8, "sleep_quality": 5}, headers=auth_headers)

    snaps = db_session.query(CapacitySnapshot).filter(CapacitySnapshot.user_id == user.id).all()
    assert len(snaps) == 1
    assert snaps[0].executive_capacitor == 90.0


# ---------------------------------------------------------------------------
# /self-care/daily-summary
# ---------------------------------------------------------------------------

def test_daily_summary_aggregates_completed_work(client, auth_headers, db_session):
    user = _user(db_session)
    today_start = datetime(date.today().year, date.today().month, date.today().day)

    for kind in [TaskType.task, TaskType.task, TaskType.routine, TaskType.appointment]:
        db_session.add(Task(
            owner_id=user.id, title="x", task_type=kind,
            status=TaskStatus.done, completed_at=today_start,
        ))
    # An incomplete task shouldn't be counted
    db_session.add(Task(owner_id=user.id, title="open", task_type=TaskType.task,
                       status=TaskStatus.inbox))

    db_session.add(SelfCareLog(
        user_id=user.id, log_date=date.today(), mood=4, notes="ok",
        medication_taken=True,
    ))
    db_session.commit()

    r = client.get("/self-care/daily-summary", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["tasks_done_count"] == 2
    assert body["routines_done_count"] == 1
    assert len(body["appointments_done"]) == 1
    assert body["medications_taken"] == 1
    assert body["mood"] == 4
    assert body["notes"] == "ok"
