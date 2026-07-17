"""Medication adherence feeds the executive-capacitor term of capacity.

Uses explicit matching log_dates to sidestep the pre-existing tz seam between
MedicationLog.log_date (server-local) and SelfCareLog.log_date (user-tz).
"""

from datetime import date

from models import User, SelfCareLog, MedicationSchedule, MedicationLog, CapacitySnapshot
from routes.selfcare import _compute_capacity, _upsert_snapshot, recompute_snapshot


def _user(db):
    return db.query(User).first()


def test_compute_capacity_med_factor():
    log = SelfCareLog(sleep_hours=8, sleep_quality=5, meals=3, mood=4)
    full = _compute_capacity(log, 1.0)
    none = _compute_capacity(log, 0.0)
    baseline = _compute_capacity(log, None)   # no regimen -> untouched
    assert none["executive_capacitor"] < full["executive_capacitor"]
    assert baseline["executive_capacitor"] == full["executive_capacitor"]
    assert none["overall"] < baseline["overall"]


def test_logging_meds_raises_capacity(client, auth_headers, db_session):
    u = _user(db_session)
    d = date(2026, 7, 16)
    db_session.add(SelfCareLog(user_id=u.id, log_date=d, sleep_hours=8,
                               sleep_quality=5, meals=3, mood=4))
    db_session.add(MedicationSchedule(user_id=u.id, name="x", active=True))
    db_session.commit()

    log = db_session.query(SelfCareLog).filter_by(user_id=u.id, log_date=d).one()
    snap = _upsert_snapshot(log, u.id, db_session)   # 0 meds logged yet
    exec_before = snap.executive_capacitor
    overall_before = snap.overall

    sched = db_session.query(MedicationSchedule).filter_by(user_id=u.id).one()
    db_session.add(MedicationLog(schedule_id=sched.id, user_id=u.id, log_date=d))
    db_session.commit()
    recompute_snapshot(db_session, u.id, d)

    db_session.expire_all()
    snap2 = db_session.query(CapacitySnapshot).filter_by(user_id=u.id, log_date=d).one()
    assert snap2.executive_capacitor > exec_before
    assert snap2.overall > overall_before
