"""Tests for Phase 6 PID nudge system: pid_engine + /insights endpoints."""

import json
from datetime import date, datetime, timedelta
from unittest.mock import patch

import pytest
from sqlalchemy.orm import Session

from models import SelfCareLog, CapacitySnapshot, Task, TaskStatus, TaskType, WeeklySnapshot, NudgeLog
from pid_engine import compute_pid_state, rank_nudges, generate_weekly_insight, TARGETS


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _seed_user(client, primary_user_token):
    """Every test in this file gets a seeded primary user."""
    pass


# ---------------------------------------------------------------------------
# PID engine — pure function tests
# ---------------------------------------------------------------------------

class TestPidEngine:
    def test_perfect_scores_yield_zero_nudge_score(self):
        avgs = {"sleep": 7.5, "meals": 3.0, "exercise": 4, "checkin": 0.9}
        state = compute_pid_state(avgs, None)
        for var in TARGETS:
            assert state[var]["p"] == 0.0
            assert state[var]["score"] == 0.0

    def test_zero_sleep_yields_max_p(self):
        avgs = {"sleep": 0, "meals": 3.0, "exercise": 4, "checkin": 0.9}
        state = compute_pid_state(avgs, None)
        assert state["sleep"]["p"] == 1.0

    def test_integral_accumulates(self):
        avgs = {"sleep": 5.0, "meals": 1.5, "exercise": 1, "checkin": 0.3}
        week1 = compute_pid_state(avgs, None)
        week2 = compute_pid_state(avgs, week1)
        for var in TARGETS:
            assert week2[var]["i"] > week1[var]["i"]

    def test_anti_windup_decays_on_improvement(self):
        bad = {"sleep": 4.0, "meals": 1.0, "exercise": 0, "checkin": 0.2}
        week1 = compute_pid_state(bad, None)
        better = {"sleep": 6.0, "meals": 2.0, "exercise": 2, "checkin": 0.5}
        week2 = compute_pid_state(better, week1)
        for var in TARGETS:
            expected_no_decay = week1[var]["i"] + (TARGETS[var]["target"] - better[var]) / TARGETS[var]["max_error"]
            assert week2[var]["i"] < expected_no_decay

    def test_negative_d_suppresses_low_score(self):
        avgs_w1 = {"sleep": 7.0, "meals": 2.8, "exercise": 3, "checkin": 0.85}
        w1 = compute_pid_state(avgs_w1, None)
        avgs_w2 = {"sleep": 7.4, "meals": 2.9, "exercise": 3.5, "checkin": 0.88}
        w2 = compute_pid_state(avgs_w2, w1)
        ranked = rank_nudges(w2)
        variables = [n["variable"] for n in ranked]
        for var in TARGETS:
            if w2[var]["d"] < 0 and w2[var]["score"] < 0.1:
                assert var not in variables

    def test_rank_order_matches_score_desc(self):
        avgs = {"sleep": 3.0, "meals": 1.0, "exercise": 0, "checkin": 0.1}
        state = compute_pid_state(avgs, None)
        ranked = rank_nudges(state)
        scores = [n["score"] for n in ranked]
        assert scores == sorted(scores, reverse=True)

    def test_generate_insight_worsening(self):
        avgs_w1 = {"sleep": 7.0, "meals": 2.5, "exercise": 3, "checkin": 0.8}
        w1 = compute_pid_state(avgs_w1, None)
        avgs_w2 = {"sleep": 5.0, "meals": 1.5, "exercise": 1, "checkin": 0.4}
        w2 = compute_pid_state(avgs_w2, w1)
        insight = generate_weekly_insight(w2, {**avgs_w2, "weekdays_in_period": 5})
        assert "\U0001f49b" in insight
        assert len(insight) > 10

    def test_generate_insight_all_perfect(self):
        avgs = {"sleep": 7.5, "meals": 3.0, "exercise": 4, "checkin": 0.9}
        state = compute_pid_state(avgs, None)
        insight = generate_weekly_insight(state, {**avgs, "weekdays_in_period": 5})
        assert "steady" in insight.lower() or "pace" in insight.lower()


# ---------------------------------------------------------------------------
# /insights/compute-weekly
# ---------------------------------------------------------------------------

class TestComputeWeekly:
    def _seed_selfcare(self, client, auth_headers, days_ago_list, sleep=7.0, meals=2, exercise=False):
        today = date.today()
        for days_ago in days_ago_list:
            d = today - timedelta(days=days_ago)
            client.post("/self-care/log", json={
                "log_date": d.isoformat(),
                "sleep_hours": sleep,
                "sleep_quality": 4,
                "meals": meals,
                "exercise": exercise,
                "mood": 3,
            }, headers=auth_headers)

    def test_creates_snapshot(self, client, auth_headers):
        self._seed_selfcare(client, auth_headers, [0, 1, 2], sleep=7.0, meals=2)
        r = client.post("/insights/compute-weekly", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["avg_sleep"] == 7.0
        assert data["avg_meals"] == 2.0
        assert data["check_in_days"] == 3
        assert data["pid_state"] is not None
        assert data["insight_copy"] is not None

    def test_idempotent(self, client, auth_headers):
        self._seed_selfcare(client, auth_headers, [0, 1], sleep=6.0, meals=1)
        r1 = client.post("/insights/compute-weekly", headers=auth_headers)
        r2 = client.post("/insights/compute-weekly", headers=auth_headers)
        assert r1.json()["id"] == r2.json()["id"]

    def test_counts_exercise_days(self, client, auth_headers):
        self._seed_selfcare(client, auth_headers, [0, 1, 2], exercise=True)
        self._seed_selfcare(client, auth_headers, [3, 4], exercise=False)
        r = client.post("/insights/compute-weekly", headers=auth_headers)
        assert r.json()["exercise_days"] == 3

    def test_counts_tasks_completed(self, client, auth_headers, db_session):
        r = client.post("/insights/compute-weekly", headers=auth_headers)
        assert r.json()["tasks_completed"] == 0

    def test_week_start_param(self, client, auth_headers):
        target = date(2026, 6, 8)
        for offset in range(5):
            d = target + timedelta(days=offset)
            client.post("/self-care/log", json={
                "log_date": d.isoformat(),
                "sleep_hours": 6.5,
                "sleep_quality": 3,
                "meals": 2,
                "mood": 3,
            }, headers=auth_headers)
        r = client.post(f"/insights/compute-weekly?week_start={target.isoformat()}", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["week_start"] == target.isoformat()
        assert data["avg_sleep"] == 6.5


# ---------------------------------------------------------------------------
# /insights/weekly
# ---------------------------------------------------------------------------

class TestGetWeekly:
    def test_returns_null_when_none(self, client, auth_headers):
        r = client.get("/insights/weekly", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() is None

    def test_returns_latest(self, client, auth_headers):
        today = date.today()
        client.post("/self-care/log", json={
            "log_date": today.isoformat(),
            "sleep_hours": 7.0,
            "sleep_quality": 4,
            "meals": 2,
            "mood": 3,
        }, headers=auth_headers)
        client.post("/insights/compute-weekly", headers=auth_headers)
        r = client.get("/insights/weekly", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data is not None
        assert data["avg_sleep"] == 7.0

    def test_auto_computes_when_no_snapshot(self, client, auth_headers):
        today = date.today()
        client.post("/self-care/log", json={
            "log_date": today.isoformat(),
            "sleep_hours": 8.0,
            "sleep_quality": 5,
            "meals": 3,
            "mood": 4,
        }, headers=auth_headers)
        r = client.get("/insights/weekly", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data is not None
        assert data["avg_sleep"] == 8.0
        assert data["pid_state"] is not None


# ---------------------------------------------------------------------------
# /insights/nudge
# ---------------------------------------------------------------------------

class TestGetNudge:
    def _setup_snapshot(self, client, auth_headers):
        today = date.today()
        client.post("/self-care/log", json={
            "log_date": today.isoformat(),
            "sleep_hours": 4.0,
            "sleep_quality": 2,
            "meals": 1,
            "mood": 2,
        }, headers=auth_headers)
        client.post("/insights/compute-weekly", headers=auth_headers)

    def test_returns_nudge(self, client, auth_headers):
        self._setup_snapshot(client, auth_headers)
        today = date.today()
        if today.weekday() >= 5:
            pytest.skip("Test requires weekday")
        r = client.get("/insights/nudge", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data is not None
        assert data["variable"] in ("sleep", "meals", "exercise", "checkin")
        assert data["message"]

    def test_cooldown_blocks(self, client, auth_headers):
        self._setup_snapshot(client, auth_headers)
        today = date.today()
        if today.weekday() >= 5:
            pytest.skip("Test requires weekday")
        r1 = client.get("/insights/nudge", headers=auth_headers)
        assert r1.json() is not None
        r2 = client.get("/insights/nudge", headers=auth_headers)
        assert r2.json() is None

    def test_daily_cap(self, client, auth_headers):
        self._setup_snapshot(client, auth_headers)
        today = date.today()
        if today.weekday() >= 5:
            pytest.skip("Test requires weekday")
        with patch("routes.insights.NUDGE_COOLDOWN_SECONDS", 0):
            results = []
            for _ in range(4):
                r = client.get("/insights/nudge", headers=auth_headers)
                results.append(r.json())
            non_null = [r for r in results if r is not None]
            assert len(non_null) == 3

    def test_weekend_returns_null(self, client, auth_headers):
        self._setup_snapshot(client, auth_headers)
        saturday = date(2026, 6, 20)
        with patch("routes.insights._user_today", return_value=saturday):
            r = client.get("/insights/nudge", headers=auth_headers)
            assert r.json() is None

    def test_creates_nudge_log(self, client, auth_headers):
        self._setup_snapshot(client, auth_headers)
        today = date.today()
        if today.weekday() >= 5:
            pytest.skip("Test requires weekday")
        r = client.get("/insights/nudge", headers=auth_headers)
        data = r.json()
        assert data is not None
        assert data["id"] > 0


# ---------------------------------------------------------------------------
# /insights/nudge/{id}/respond
# ---------------------------------------------------------------------------

class TestRespondNudge:
    def _get_nudge(self, client, auth_headers):
        today = date.today()
        client.post("/self-care/log", json={
            "log_date": today.isoformat(),
            "sleep_hours": 3.0,
            "sleep_quality": 1,
            "meals": 0,
            "mood": 1,
        }, headers=auth_headers)
        client.post("/insights/compute-weekly", headers=auth_headers)
        if today.weekday() >= 5:
            pytest.skip("Test requires weekday")
        r = client.get("/insights/nudge", headers=auth_headers)
        return r.json()

    def test_respond_yes(self, client, auth_headers):
        nudge = self._get_nudge(client, auth_headers)
        r = client.post(
            f"/insights/nudge/{nudge['id']}/respond",
            json={"response": "yes"},
            headers=auth_headers,
        )
        assert r.status_code == 200

    def test_respond_dismissed(self, client, auth_headers):
        nudge = self._get_nudge(client, auth_headers)
        r = client.post(
            f"/insights/nudge/{nudge['id']}/respond",
            json={"response": "dismissed"},
            headers=auth_headers,
        )
        assert r.status_code == 200

    def test_unknown_id_404(self, client, auth_headers):
        r = client.post(
            "/insights/nudge/99999/respond",
            json={"response": "yes"},
            headers=auth_headers,
        )
        assert r.status_code == 404
