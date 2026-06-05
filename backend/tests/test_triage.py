"""Triage scoring engine tests (R1 of the redesign).

Goal: every score lever is exercised in isolation, then combined so a
regression in the math is caught before it changes anyone's surfaced
"do this next" pick.
"""

import json
from datetime import date, datetime, timedelta, timezone

import pytest

from models import Domain, Project, Task, TaskStatus, TaskType, TaskWeight, User
from routes.triage import (
    compute_score,
    project_stall_map,
    recompute_user_scores,
    PRIORITY_WEIGHTS,
    CRITICAL_BONUS,
    DUE_TODAY_BONUS,
    OVERDUE_CAP,
    PROJECT_STALL_BONUS,
    PROJECT_STALL_DAYS_THRESHOLD,
    PUSH_PENALTY_PER_COUNT,
    INBOX_AGE_CAP,
    SAME_DAY_CREATE_BONUS,
)


TODAY = date(2026, 5, 18)                   # Monday
NOON  = datetime(2026, 5, 18, 12, 0, 0)


def _user(db, username="testuser"):
    return db.query(User).filter(User.username == username).first()


def _mk_task(db, user_id, **kw):
    base = dict(
        owner_id=user_id, title="t",
        task_type=TaskType.task, status=TaskStatus.inbox,
    )
    base.update(kw)
    t = Task(**base)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


# ---------------------------------------------------------------------------
# Priority lever
# ---------------------------------------------------------------------------

def test_priority_urgent_scores_highest(client, auth_headers, db_session):
    user = _user(db_session)
    t = _mk_task(db_session, user.id, priority="urgent")
    r = compute_score(t, today_local=TODAY, now_local=NOON)
    assert r["components"]["priority"] == PRIORITY_WEIGHTS["urgent"]


def test_priority_missing_defaults_to_normal(client, auth_headers, db_session):
    user = _user(db_session)
    t = _mk_task(db_session, user.id)
    r = compute_score(t, today_local=TODAY, now_local=NOON)
    assert r["components"]["priority"] == PRIORITY_WEIGHTS["normal"]


# ---------------------------------------------------------------------------
# Critical bonus
# ---------------------------------------------------------------------------

def test_critical_adds_bonus(client, auth_headers, db_session):
    user = _user(db_session)
    t = _mk_task(db_session, user.id, is_critical=True)
    r = compute_score(t, today_local=TODAY, now_local=NOON)
    assert r["components"].get("critical_bonus") == CRITICAL_BONUS


def test_non_critical_no_bonus(client, auth_headers, db_session):
    user = _user(db_session)
    t = _mk_task(db_session, user.id, is_critical=False)
    r = compute_score(t, today_local=TODAY, now_local=NOON)
    assert "critical_bonus" not in r["components"]


# ---------------------------------------------------------------------------
# Due-date proximity
# ---------------------------------------------------------------------------

def test_due_today_full_bonus(client, auth_headers, db_session):
    user = _user(db_session)
    t = _mk_task(db_session, user.id, due_date=TODAY)
    r = compute_score(t, today_local=TODAY, now_local=NOON)
    assert r["components"].get("due_today") == DUE_TODAY_BONUS


def test_overdue_boost_caps(client, auth_headers, db_session):
    user = _user(db_session)
    very_old = _mk_task(db_session, user.id, due_date=TODAY - timedelta(days=180))
    r = compute_score(very_old, today_local=TODAY, now_local=NOON)
    # 180 days × 4/day = 720; cap should pin at OVERDUE_CAP (40)
    assert r["components"]["overdue_boost"] == OVERDUE_CAP


def test_due_soon_decays(client, auth_headers, db_session):
    user = _user(db_session)
    t1 = _mk_task(db_session, user.id, due_date=TODAY + timedelta(days=1))
    t7 = _mk_task(db_session, user.id, due_date=TODAY + timedelta(days=7))
    r1 = compute_score(t1, today_local=TODAY, now_local=NOON)
    r7 = compute_score(t7, today_local=TODAY, now_local=NOON)
    assert r1["components"]["due_soon"] > r7["components"]["due_soon"]


def test_due_beyond_window_no_bonus(client, auth_headers, db_session):
    user = _user(db_session)
    t = _mk_task(db_session, user.id, due_date=TODAY + timedelta(days=14))
    r = compute_score(t, today_local=TODAY, now_local=NOON)
    assert "due_soon" not in r["components"]
    assert "due_today" not in r["components"]


# ---------------------------------------------------------------------------
# Project stall
# ---------------------------------------------------------------------------

def test_stalled_project_boosts_its_tasks(client, auth_headers, db_session):
    user = _user(db_session)
    # Project created 30 days ago, no completions
    old_create = datetime.now(timezone.utc) - timedelta(days=30)
    p = Project(user_id=user.id, title="Stalled", status="active", created_at=old_create)
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)

    t = _mk_task(db_session, user.id, project_id=p.id)
    stall = project_stall_map(db_session, user.id, TODAY)
    r = compute_score(t, today_local=TODAY, now_local=NOON, stall_map=stall)
    assert r["components"].get("project_stall") == PROJECT_STALL_BONUS


def test_active_project_no_boost(client, auth_headers, db_session):
    user = _user(db_session)
    p = Project(user_id=user.id, title="Active", status="active")
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    # A done task today on this project — proves recent completion
    _mk_task(db_session, user.id, project_id=p.id, status=TaskStatus.done,
             completed_at=datetime.now(timezone.utc))

    t = _mk_task(db_session, user.id, project_id=p.id)
    stall = project_stall_map(db_session, user.id, TODAY)
    r = compute_score(t, today_local=TODAY, now_local=NOON, stall_map=stall)
    assert "project_stall" not in r["components"]


def test_orphan_task_no_stall_lookup(client, auth_headers, db_session):
    """Tasks with no project_id never get the project_stall bonus."""
    user = _user(db_session)
    t = _mk_task(db_session, user.id)
    stall = project_stall_map(db_session, user.id, TODAY)
    r = compute_score(t, today_local=TODAY, now_local=NOON, stall_map=stall)
    assert "project_stall" not in r["components"]


# ---------------------------------------------------------------------------
# Push penalty
# ---------------------------------------------------------------------------

def test_push_count_subtracts(client, auth_headers, db_session):
    user = _user(db_session)
    t = _mk_task(db_session, user.id, push_count=3)
    r = compute_score(t, today_local=TODAY, now_local=NOON)
    assert r["components"]["push_penalty"] == PUSH_PENALTY_PER_COUNT * 3


# ---------------------------------------------------------------------------
# Inbox age creep
# ---------------------------------------------------------------------------

def test_age_creep_increments_weekly(client, auth_headers, db_session):
    user = _user(db_session)
    very_old = datetime.now(timezone.utc) - timedelta(days=70)
    t = _mk_task(db_session, user.id, created_at=very_old)
    r = compute_score(t, today_local=TODAY, now_local=NOON)
    # 70 days = 10 buckets × 3 = 30, capped at INBOX_AGE_CAP (15)
    assert r["components"]["age_boost"] == INBOX_AGE_CAP


def test_age_creep_zero_for_new_tasks(client, auth_headers, db_session):
    user = _user(db_session)
    t = _mk_task(db_session, user.id, created_at=datetime.now(timezone.utc))
    r = compute_score(t, today_local=TODAY, now_local=NOON)
    assert "age_boost" not in r["components"]


# ---------------------------------------------------------------------------
# Total + recompute endpoint
# ---------------------------------------------------------------------------

def test_total_sums_components(client, auth_headers, db_session):
    user = _user(db_session)
    t = _mk_task(db_session, user.id, priority="high", is_critical=True, due_date=TODAY)
    r = compute_score(t, today_local=TODAY, now_local=NOON)
    assert r["total"] == sum(r["components"].values())


def test_recompute_writes_scores_to_db(client, auth_headers, db_session):
    user = _user(db_session)
    a = _mk_task(db_session, user.id, priority="urgent")
    b = _mk_task(db_session, user.id, priority="low")
    n = recompute_user_scores(db_session, user.id, TODAY, NOON)
    db_session.refresh(a)
    db_session.refresh(b)
    assert n == 2
    assert a.score > b.score
    assert a.score_components is not None
    assert json.loads(a.score_components)["priority"] == PRIORITY_WEIGHTS["urgent"]


def test_recompute_skips_routines_and_appointments(client, auth_headers, db_session):
    user = _user(db_session)
    t      = _mk_task(db_session, user.id, task_type=TaskType.task)
    routine = _mk_task(db_session, user.id, task_type=TaskType.routine)
    appt   = _mk_task(db_session, user.id, task_type=TaskType.appointment)
    recompute_user_scores(db_session, user.id, TODAY, NOON)
    db_session.refresh(t); db_session.refresh(routine); db_session.refresh(appt)
    assert t.score is not None
    assert routine.score is None
    assert appt.score is None


def test_recompute_endpoint_returns_count(client, auth_headers, db_session):
    user = _user(db_session)
    _mk_task(db_session, user.id, priority="high")
    _mk_task(db_session, user.id, priority="normal")
    r = client.post("/triage/recompute", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["updated"] >= 2


# ---------------------------------------------------------------------------
# Push-count is incremented on snooze + defer (integration)
# ---------------------------------------------------------------------------

def test_snooze_increments_push_count(client, auth_headers, db_session):
    user = _user(db_session)
    t = _mk_task(db_session, user.id)
    start = t.push_count or 0
    until = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    r = client.post(f"/tasks/{t.id}/snooze", json={"snooze_until": until}, headers=auth_headers)
    assert r.status_code == 200
    db_session.refresh(t)
    assert t.push_count == start + 1


def test_defer_increments_push_count(client, auth_headers, db_session):
    user = _user(db_session)
    t = _mk_task(db_session, user.id, status=TaskStatus.today)
    start = t.push_count or 0
    r = client.post(f"/tasks/{t.id}/defer", headers=auth_headers)
    assert r.status_code == 200
    db_session.refresh(t)
    assert t.push_count == start + 1


# ---------------------------------------------------------------------------
# Bin-pack (R2)
# ---------------------------------------------------------------------------

def test_preview_lays_out_7_days(client, auth_headers, db_session):
    user = _user(db_session)
    _mk_task(db_session, user.id, priority="urgent")
    r = client.post("/triage/preview", headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["window_days"] == 7
    assert len(body["days"]) == 7


def test_preview_high_score_lands_on_day_0(client, auth_headers, db_session):
    """Top-scored item should bin-pack into today."""
    user = _user(db_session)
    urgent = _mk_task(db_session, user.id, priority="urgent", is_critical=True)
    _mk_task(db_session, user.id, priority="low")
    r = client.post("/triage/preview", headers=auth_headers)
    body = r.json()
    day0 = body["days"][0]
    day0_ids = [i["id"] for i in day0["items"]]
    assert urgent.id in day0_ids


def test_bin_pack_respects_budget(client, auth_headers, db_session):
    """With a tiny daily budget, items should spill into subsequent days."""
    user = _user(db_session)
    # 5 heavy tasks = 15 weight units. Default budget at 60 capacity = 12.
    # So at least one task must spill to day 1.
    for i in range(5):
        _mk_task(db_session, user.id, priority="normal", weight=TaskWeight.heavy)
    r = client.post("/triage/preview", headers=auth_headers)
    body = r.json()
    placed_per_day = [len(d["items"]) for d in body["days"]]
    # Day 0 cannot hold all 5; at least one spills
    assert placed_per_day[0] < 5


def test_appointment_consumes_day_budget(client, auth_headers, db_session):
    """An appointment scheduled for today reduces what bin-pack can place on day 0."""
    user = _user(db_session)
    # Heavy appointment on today eats 3 units
    appt = Task(
        owner_id=user.id, title="Appt", task_type=TaskType.appointment,
        status=TaskStatus.today, due_date=date.today(),
        scheduled_date=datetime.combine(date.today(), datetime.min.time()),
        weight=TaskWeight.heavy,
    )
    db_session.add(appt)
    db_session.commit()

    r = client.post("/triage/preview", headers=auth_headers)
    body = r.json()
    assert body["days"][0]["committed"] >= 3


def test_run_persists_day_0_to_today(client, auth_headers, db_session):
    """After /run, a top-ranked inbox task should be status=today with scheduled_date set."""
    user = _user(db_session)
    t = _mk_task(db_session, user.id, priority="urgent")
    r = client.post("/triage/run", headers=auth_headers)
    assert r.status_code == 200
    db_session.refresh(t)
    assert t.status == TaskStatus.today
    assert t.scheduled_date is not None
    assert t.due_date == date.today()


def test_run_persists_future_day_as_inbox_with_due_date(client, auth_headers, db_session):
    """An item placed on day 1+ should remain status=inbox with due_date on that day."""
    user = _user(db_session)
    # Fill day 0 with heavies so the next task spills to day 1
    for _ in range(10):
        _mk_task(db_session, user.id, priority="urgent", weight=TaskWeight.heavy)
    spillover = _mk_task(db_session, user.id, priority="low")
    r = client.post("/triage/run", headers=auth_headers)
    assert r.status_code == 200
    db_session.refresh(spillover)
    assert spillover.status == TaskStatus.inbox
    # Should land somewhere in days 1-6 OR overflow
    if spillover.due_date is not None:
        assert spillover.due_date > date.today()


# ---------------------------------------------------------------------------
# Pin / unpin (R3)
# ---------------------------------------------------------------------------

def test_pin_sets_pinned_for(client, auth_headers, db_session):
    user = _user(db_session)
    t = _mk_task(db_session, user.id)
    pin_day = date.today().isoformat()
    r = client.post(f"/triage/tasks/{t.id}/pin", json={"date": pin_day}, headers=auth_headers)
    assert r.status_code == 200, r.text
    assert r.json()["pinned_for"] == pin_day


def test_pin_rejects_past_day(client, auth_headers, db_session):
    user = _user(db_session)
    t = _mk_task(db_session, user.id)
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    r = client.post(f"/triage/tasks/{t.id}/pin", json={"date": yesterday}, headers=auth_headers)
    assert r.status_code == 400


def test_pin_enforces_max_per_day(client, auth_headers, db_session):
    user = _user(db_session)
    pin_day = date.today().isoformat()
    # Pin three tasks for today — all should succeed
    for _ in range(3):
        t = _mk_task(db_session, user.id)
        r = client.post(f"/triage/tasks/{t.id}/pin", json={"date": pin_day}, headers=auth_headers)
        assert r.status_code == 200, r.text
    # Fourth should 409
    fourth = _mk_task(db_session, user.id)
    r = client.post(f"/triage/tasks/{fourth.id}/pin", json={"date": pin_day}, headers=auth_headers)
    assert r.status_code == 409


def test_unpin_clears_pinned_for(client, auth_headers, db_session):
    user = _user(db_session)
    t = _mk_task(db_session, user.id, pinned_for=date.today())
    r = client.delete(f"/triage/tasks/{t.id}/pin", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["pinned_for"] is None


def test_pinned_task_lands_on_pinned_day_regardless_of_score(client, auth_headers, db_session):
    """A low-priority pinned task should beat a high-priority unpinned for placement."""
    user = _user(db_session)
    pinned_low = _mk_task(db_session, user.id, priority="low", pinned_for=date.today())
    _mk_task(db_session, user.id, priority="urgent")
    r = client.post("/triage/preview", headers=auth_headers)
    body = r.json()
    day0_ids = [i["id"] for i in body["days"][0]["items"]]
    assert pinned_low.id in day0_ids


def test_pin_only_allowed_on_tasks_not_routines(client, auth_headers, db_session):
    user = _user(db_session)
    routine = _mk_task(db_session, user.id, task_type=TaskType.routine)
    r = client.post(
        f"/triage/tasks/{routine.id}/pin",
        json={"date": date.today().isoformat()},
        headers=auth_headers,
    )
    assert r.status_code == 400


def test_run_overflow_clears_due_date(client, auth_headers, db_session):
    """Items past the 7-day window land with due_date=None ('the pile')."""
    user = _user(db_session)
    # Fill all 7 days
    for _ in range(60):  # 60 heavy = 180 units; budget ~12/day × 7 = 84. ~32 overflow.
        _mk_task(db_session, user.id, priority="urgent", weight=TaskWeight.heavy)
    r = client.post("/triage/run", headers=auth_headers)
    body = r.json()
    assert len(body["overflow"]) > 0
    overflow_id = body["overflow"][0]["id"]
    overflow_task = db_session.get(Task, overflow_id)
    assert overflow_task.due_date is None
    assert overflow_task.status == TaskStatus.inbox


# ---------------------------------------------------------------------------
# Same-day deadline lever — "I made it and it's due today" must outrank all
# other levers so deliberate same-day picks can't be lost in the list.
# ---------------------------------------------------------------------------

def test_same_day_create_lever_fires(client, auth_headers, db_session):
    user = _user(db_session)
    t = _mk_task(
        db_session, user.id,
        created_at=datetime(TODAY.year, TODAY.month, TODAY.day, 9, 0),
        due_date=TODAY,
    )
    r = compute_score(t, today_local=TODAY, now_local=NOON)
    assert r["components"].get("same_day_create") == SAME_DAY_CREATE_BONUS


def test_same_day_create_lever_does_not_fire_when_different_days(client, auth_headers, db_session):
    user = _user(db_session)
    yesterday_morning = datetime.combine(TODAY - timedelta(days=1), datetime.min.time()) + timedelta(hours=9)
    t = _mk_task(
        db_session, user.id,
        created_at=yesterday_morning,
        due_date=TODAY,
    )
    r = compute_score(t, today_local=TODAY, now_local=NOON)
    assert "same_day_create" not in r["components"]


def test_same_day_create_lever_no_due_date(client, auth_headers, db_session):
    user = _user(db_session)
    t = _mk_task(
        db_session, user.id,
        created_at=datetime(TODAY.year, TODAY.month, TODAY.day, 9, 0),
        due_date=None,
    )
    r = compute_score(t, today_local=TODAY, now_local=NOON)
    assert "same_day_create" not in r["components"]


def test_same_day_create_outranks_loaded_non_urgent(client, auth_headers, db_session):
    """Sanity check: a same-day item with normal priority beats a maxed-out
    non-urgent item (urgent + critical + project_stall + age_boost)."""
    user = _user(db_session)
    same_day = _mk_task(
        db_session, user.id,
        created_at=datetime(TODAY.year, TODAY.month, TODAY.day, 9, 0),
        due_date=TODAY,
    )
    overloaded = _mk_task(
        db_session, user.id,
        priority="urgent", is_critical=True,
        # No due_date — purely "important", not "urgent" by time.
    )
    s_same = compute_score(same_day, today_local=TODAY, now_local=NOON)
    s_over = compute_score(overloaded, today_local=TODAY, now_local=NOON)
    assert s_same["total"] > s_over["total"]


# ---------------------------------------------------------------------------
# apply-ordered (new triage flow)
# ---------------------------------------------------------------------------

def test_apply_ordered_places_within_budget(client, auth_headers, db_session):
    user = _user(db_session)
    tasks = [_mk_task(db_session, user.id) for _ in range(3)]
    ids = [t.id for t in tasks]
    r = client.post("/triage/apply-ordered", json={"ordered_task_ids": ids}, headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert set(body["placed"]) == set(ids)
    assert body["overflow"] == []
    for t in tasks:
        db_session.refresh(t)
        assert t.status == TaskStatus.today


def test_apply_ordered_returns_overflow(client, auth_headers, db_session):
    """Heavy tasks exceeding budget should land in overflow."""
    user = _user(db_session)
    tasks = [_mk_task(db_session, user.id, weight=TaskWeight.heavy) for _ in range(10)]
    ids = [t.id for t in tasks]
    r = client.post("/triage/apply-ordered", json={"ordered_task_ids": ids}, headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert len(body["overflow"]) > 0
    assert len(body["placed"]) + len(body["overflow"]) == 10


def test_apply_ordered_sets_sort_order_by_position(client, auth_headers, db_session):
    user = _user(db_session)
    tasks = [_mk_task(db_session, user.id) for _ in range(3)]
    ids = [t.id for t in tasks]
    client.post("/triage/apply-ordered", json={"ordered_task_ids": ids}, headers=auth_headers)
    for idx, t in enumerate(tasks):
        db_session.refresh(t)
        assert t.sort_order == float(idx)


def test_apply_ordered_respects_appointment_committed_weight(client, auth_headers, db_session):
    user = _user(db_session)
    appt = Task(
        owner_id=user.id, title="Big Appt", task_type=TaskType.appointment,
        status=TaskStatus.today, due_date=date.today(),
        scheduled_date=datetime.combine(date.today(), datetime.min.time()),
        weight=TaskWeight.heavy,
    )
    db_session.add(appt)
    db_session.commit()
    tasks = [_mk_task(db_session, user.id, weight=TaskWeight.heavy) for _ in range(8)]
    ids = [t.id for t in tasks]
    r = client.post("/triage/apply-ordered", json={"ordered_task_ids": ids}, headers=auth_headers)
    body = r.json()
    assert body["committed"] >= 3


def test_apply_ordered_ignores_foreign_tasks(client, auth_headers, db_session):
    """Task IDs from a different user should be silently skipped."""
    user = _user(db_session)
    own = _mk_task(db_session, user.id)
    r = client.post(
        "/triage/apply-ordered",
        json={"ordered_task_ids": [own.id, 99999]},
        headers=auth_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert 99999 not in body["placed"]


# ---------------------------------------------------------------------------
# resolve-overflow
# ---------------------------------------------------------------------------

def test_resolve_overflow_bumps_to_tomorrow(client, auth_headers, db_session):
    user = _user(db_session)
    t = _mk_task(db_session, user.id, status=TaskStatus.today)
    r = client.post(
        "/triage/resolve-overflow",
        json={"keep_today_ids": [], "bump_ids": [t.id]},
        headers=auth_headers,
    )
    assert r.status_code == 200
    db_session.refresh(t)
    assert t.status == TaskStatus.inbox
    assert t.due_date == date.today() + timedelta(days=1)
    assert t.sort_order == 0.0


def test_resolve_overflow_increments_push_count(client, auth_headers, db_session):
    user = _user(db_session)
    t = _mk_task(db_session, user.id, push_count=2)
    client.post(
        "/triage/resolve-overflow",
        json={"keep_today_ids": [], "bump_ids": [t.id]},
        headers=auth_headers,
    )
    db_session.refresh(t)
    assert t.push_count == 3


def test_resolve_overflow_keeps_today(client, auth_headers, db_session):
    user = _user(db_session)
    t = _mk_task(db_session, user.id, status=TaskStatus.inbox)
    client.post(
        "/triage/resolve-overflow",
        json={"keep_today_ids": [t.id], "bump_ids": []},
        headers=auth_headers,
    )
    db_session.refresh(t)
    assert t.status == TaskStatus.today
    assert t.due_date == date.today()


