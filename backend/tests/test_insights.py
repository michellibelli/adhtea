"""Tests for the weekly PID insight: pid_engine + /insights endpoints.

The nudge popup (rank_nudges' consumer via /insights/nudge) was removed in
4.20.0 — compute_pid_state, rank_nudges and generate_weekly_insight all stay
live because the weekly insight_copy (shown in the self-care gate) still
uses them.
"""

from datetime import date, timedelta

import pytest

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
    def _week_start(self):
        today = date.today()
        return today - timedelta(days=today.weekday())

    def _seed_selfcare(self, client, auth_headers, offsets_from_monday, sleep=7.0, meals=2, exercise=False):
        ws = self._week_start()
        for offset in offsets_from_monday:
            d = ws + timedelta(days=offset)
            if d > date.today():
                continue
            client.post("/self-care/log", json={
                "log_date": d.isoformat(),
                "sleep_hours": sleep,
                "sleep_quality": 4,
                "meals": meals,
                "exercise": exercise,
                "mood": 3,
            }, headers=auth_headers)

    def test_creates_snapshot(self, client, auth_headers):
        ws = self._week_start()
        # Seed Mon, Tue, Wed of current week (or up to today)
        offsets = [i for i in range(3) if ws + timedelta(days=i) <= date.today()]
        self._seed_selfcare(client, auth_headers, offsets, sleep=7.0, meals=2)
        r = client.post("/insights/compute-weekly", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["avg_sleep"] == 7.0
        assert data["avg_meals"] == 2.0
        assert data["check_in_days"] == len(offsets)
        assert data["pid_state"] is not None
        assert data["insight_copy"] is not None

    def test_idempotent(self, client, auth_headers):
        ws = self._week_start()
        offsets = [i for i in range(2) if ws + timedelta(days=i) <= date.today()]
        self._seed_selfcare(client, auth_headers, offsets, sleep=6.0, meals=1)
        r1 = client.post("/insights/compute-weekly", headers=auth_headers)
        r2 = client.post("/insights/compute-weekly", headers=auth_headers)
        assert r1.json()["id"] == r2.json()["id"]

    def test_counts_exercise_days(self, client, auth_headers):
        ws = self._week_start()
        ex_offsets = [i for i in range(3) if ws + timedelta(days=i) <= date.today()]
        no_offsets = [i for i in range(3, 5) if ws + timedelta(days=i) <= date.today()]
        self._seed_selfcare(client, auth_headers, ex_offsets, exercise=True)
        self._seed_selfcare(client, auth_headers, no_offsets, exercise=False)
        r = client.post("/insights/compute-weekly", headers=auth_headers)
        assert r.json()["exercise_days"] == len(ex_offsets)

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
# The weekly snapshot has to follow the self-care log
# ---------------------------------------------------------------------------

class TestSnapshotStaysFresh:
    def test_snapshot_rebuilds_after_a_new_log(self, client, auth_headers, db_session):
        """The snapshot used to be written once per week and then frozen, so
        anything logged later in the week went stale."""
        today = date.today()
        client.post("/self-care/log", json={
            "log_date": today.isoformat(),
            "sleep_hours": 4.0,
            "meals": 1,
            "mood": 2,
        }, headers=auth_headers)

        first = client.get("/insights/weekly", headers=auth_headers).json()
        assert first["avg_sleep"] == 4.0

        # She logs a better night — same week, after the snapshot exists.
        client.post("/self-care/log", json={
            "log_date": today.isoformat(),
            "sleep_hours": 9.0,
            "meals": 3,
            "mood": 4,
        }, headers=auth_headers)

        second = client.get("/insights/weekly", headers=auth_headers).json()
        assert second["avg_sleep"] == 9.0, "snapshot went stale — new log ignored"
        assert second["avg_meals"] == 3.0
