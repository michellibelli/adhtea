"""Tests for Phase 6 PID nudge system: pid_engine + /insights endpoints."""

import json
from datetime import date, datetime, timedelta
from unittest.mock import patch

import pytest
from sqlalchemy.orm import Session

from models import SelfCareLog, CapacitySnapshot, Task, TaskStatus, TaskType, WeeklySnapshot, NudgeLog
from routes.insights import NUDGE_DAILY_CAP
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
            assert len(non_null) == NUDGE_DAILY_CAP == 1

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
# Don't nudge for something already logged today
# ---------------------------------------------------------------------------

class TestTodayLogSuppressesNudge:
    """The nudge asks about today ("Could you take a short walk today?") but is
    scored on the week's averages, so a single logged day barely moves it. If
    today's self-care log isn't consulted, the app nudges her to do a thing she
    just told it she did."""

    def _log(self, client, auth_headers, **fields):
        body = {"log_date": date.today().isoformat(), "mood": 3}
        body.update(fields)
        client.post("/self-care/log", json=body, headers=auth_headers)

    def test_exercise_logged_today_is_not_nudged(self, client, auth_headers):
        if date.today().weekday() >= 5:
            pytest.skip("Test requires weekday")
        # A bad week on every axis — exercise would otherwise rank.
        self._log(client, auth_headers, sleep_hours=4.0, meals=1, exercise=True)
        client.post("/insights/compute-weekly", headers=auth_headers)

        r = client.get("/insights/nudge", headers=auth_headers)
        nudge = r.json()
        assert nudge is None or nudge["variable"] != "exercise"

    def test_meals_logged_today_is_not_nudged(self, client, auth_headers):
        if date.today().weekday() >= 5:
            pytest.skip("Test requires weekday")
        self._log(client, auth_headers, sleep_hours=4.0, meals=1)
        client.post("/insights/compute-weekly", headers=auth_headers)

        r = client.get("/insights/nudge", headers=auth_headers)
        nudge = r.json()
        # One meal is under the 3-meal target, but she noted it — stay quiet.
        assert nudge is None or nudge["variable"] != "meals"

    def test_full_log_silences_the_nudge_entirely(self, client, auth_headers):
        if date.today().weekday() >= 5:
            pytest.skip("Test requires weekday")
        self._log(client, auth_headers, sleep_hours=5.0, meals=2, exercise=True)
        client.post("/insights/compute-weekly", headers=auth_headers)

        r = client.get("/insights/nudge", headers=auth_headers)
        assert r.json() is None

    def test_unlogged_variable_still_nudges(self, client, auth_headers):
        if date.today().weekday() >= 5:
            pytest.skip("Test requires weekday")
        # Sleep + meals noted, exercise not — exercise is still fair game.
        self._log(client, auth_headers, sleep_hours=4.0, meals=1, exercise=False)
        client.post("/insights/compute-weekly", headers=auth_headers)

        r = client.get("/insights/nudge", headers=auth_headers)
        nudge = r.json()
        assert nudge is not None
        assert nudge["variable"] == "exercise"


# ---------------------------------------------------------------------------
# The weekly snapshot has to follow the self-care log
# ---------------------------------------------------------------------------

class TestSnapshotStaysFresh:
    def test_snapshot_rebuilds_after_a_new_log(self, client, auth_headers, db_session):
        """The snapshot used to be written once per week and then frozen, so
        anything logged later in the week never reached the nudge engine."""
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


# ---------------------------------------------------------------------------
# Nudge frequency: one a day, and a dismissal means "not now"
# ---------------------------------------------------------------------------

class TestNudgeRestraint:
    """Three nudges a day trained her to swat the modal shut without reading it.
    A nudge she doesn't read is a nudge that can't work."""

    def _bad_week(self, client, auth_headers):
        # Nothing logged today, so nothing is suppressed by recency.
        yesterday = date.today() - timedelta(days=1)
        client.post("/self-care/log", json={
            "log_date": yesterday.isoformat(),
            "sleep_hours": 4.0, "meals": 1, "mood": 2,
        }, headers=auth_headers)
        client.post("/insights/compute-weekly", headers=auth_headers)

    def test_dismissed_variable_goes_quiet(self, client, auth_headers):
        if date.today().weekday() >= 5:
            pytest.skip("Test requires weekday")
        self._bad_week(client, auth_headers)

        first = client.get("/insights/nudge", headers=auth_headers).json()
        assert first is not None
        client.post(f"/insights/nudge/{first['id']}/respond",
                    json={"response": "dismissed"}, headers=auth_headers)

        # Same day, cap and cooldown lifted: it must not come back with the same ask.
        with patch("routes.insights.NUDGE_COOLDOWN_SECONDS", 0), \
             patch("routes.insights.NUDGE_DAILY_CAP", 99):
            again = client.get("/insights/nudge", headers=auth_headers).json()

        assert again is None or again["variable"] != first["variable"]

    def test_an_affirmative_answer_does_not_mute_the_variable(self, client, auth_headers):
        # Only a dismissal backs off. Saying "on it" isn't a request for silence.
        if date.today().weekday() >= 5:
            pytest.skip("Test requires weekday")
        self._bad_week(client, auth_headers)

        first = client.get("/insights/nudge", headers=auth_headers).json()
        client.post(f"/insights/nudge/{first['id']}/respond",
                    json={"response": "yes"}, headers=auth_headers)

        with patch("routes.insights.NUDGE_COOLDOWN_SECONDS", 0), \
             patch("routes.insights.NUDGE_DAILY_CAP", 99):
            again = client.get("/insights/nudge", headers=auth_headers).json()

        assert again is not None
        assert again["variable"] == first["variable"]


class TestExerciseRecency:
    def test_exercising_yesterday_silences_todays_exercise_nudge(self, client, auth_headers):
        """The target is 4 days a week — every other day — so having moved
        yesterday is a fine reason not to be asked about it today."""
        if date.today().weekday() >= 5:
            pytest.skip("Test requires weekday")

        yesterday = date.today() - timedelta(days=1)
        client.post("/self-care/log", json={
            "log_date": yesterday.isoformat(),
            "sleep_hours": 4.0, "meals": 1, "exercise": True, "mood": 3,
        }, headers=auth_headers)
        client.post("/insights/compute-weekly", headers=auth_headers)

        r = client.get("/insights/nudge", headers=auth_headers).json()
        assert r is None or r["variable"] != "exercise"

    def test_exercise_two_days_ago_does_not_silence_it(self):
        # The window is one day. Two days without moving is worth asking about.
        from pid_engine import satisfied_recently
        handled = satisfied_recently({2: {"meals": 3, "sleep_hours": 8.0, "exercise": True}})
        assert "exercise" not in handled

    def test_sleep_and_meals_do_not_carry_over_from_yesterday(self, client, auth_headers):
        # They reset daily — eating yesterday is not eating today.
        from pid_engine import satisfied_recently
        handled = satisfied_recently({1: {"meals": 3, "sleep_hours": 8.0, "exercise": True}})
        assert "exercise" in handled
        assert "meals" not in handled
        assert "sleep" not in handled
        assert "checkin" not in handled
