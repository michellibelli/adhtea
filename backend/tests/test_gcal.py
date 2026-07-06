"""Google Calendar sync tests.

The bug from issue #21 was that `_get_service(token)` was called outside the
`for cal_id in cal_ids` loop's exception handler path — every iteration raised
NameError silently, so 0 events were ever created. Now `service` is built
once before the loop. These tests pin down the multi-calendar behavior so the
regression cannot return.

Strategy: monkeypatch `_get_service` to return a fake calendar API client.
"""

import json
from datetime import datetime, date

from models import GoogleCalendarToken, Task, TaskStatus, TaskType, User
from routes import gcal

import pytest

@pytest.fixture(autouse=True)
def _seed_user(primary_user_token):
    yield


# ---------------------------------------------------------------------------
# Fake Google Calendar API client
# ---------------------------------------------------------------------------

class _FakeEvents:
    def __init__(self, by_cal):
        self.by_cal = by_cal
        self.list_calls = []

    def list(self, calendarId, **kwargs):
        self.list_calls.append(calendarId)
        items = self.by_cal.get(calendarId, [])
        return _FakeExecutable({"items": items})


class _FakeExecutable:
    def __init__(self, payload):
        self.payload = payload

    def execute(self):
        return self.payload


class _FakeService:
    def __init__(self, by_cal):
        self._events = _FakeEvents(by_cal)

    def events(self):
        return self._events


def _make_event(summary, hour=10):
    today = date.today()
    iso = datetime(today.year, today.month, today.day, hour, 0).isoformat() + "-07:00"
    return {
        "id": f"evt-{summary}",
        "summary": summary,
        "start": {"dateTime": iso},
        "location": "",
        "description": "",
    }


def _attach_token(db, user_id, calendar_ids=None):
    tok = GoogleCalendarToken(
        user_id=user_id, access_token="a", refresh_token="r",
        calendar_ids=json.dumps(calendar_ids) if calendar_ids else None,
    )
    db.add(tok)
    db.commit()
    db.refresh(tok)
    return tok


# ---------------------------------------------------------------------------
# sync_today_events
# ---------------------------------------------------------------------------

def test_sync_no_token_returns_zero(db_session):
    user = db_session.query(User).filter(User.username == "testuser").first()
    out = gcal.sync_today_events(user.id, db_session)
    assert out == {"created": 0, "calendars_queried": [], "events_found": 0}


def test_sync_creates_tasks_from_primary_calendar(db_session, monkeypatch):
    user = db_session.query(User).filter(User.username == "testuser").first()
    _attach_token(db_session, user.id)

    fake = _FakeService({"primary": [_make_event("Standup")]})
    monkeypatch.setattr(gcal, "_get_service", lambda token: fake)

    out = gcal.sync_today_events(user.id, db_session)
    assert out["created"] == 1
    assert out["calendars_queried"] == ["primary"]

    tasks = db_session.query(Task).filter(
        Task.owner_id == user.id, Task.task_type == TaskType.appointment
    ).all()
    assert len(tasks) == 1
    assert tasks[0].title == "Standup"


def test_sync_queries_all_selected_calendars_regression_21(db_session, monkeypatch):
    """Regression guard: _get_service must be reusable across calendar IDs.

    Pre-3.9.7 the service object wasn't built or was built inside a try/except
    that silently swallowed NameError, so iterations 2+ produced 0 events. Here
    we verify .events().list() is called once PER calendar ID and events from
    each are persisted.
    """
    user = db_session.query(User).filter(User.username == "testuser").first()
    _attach_token(db_session, user.id, calendar_ids=["work@example.com", "kids@example.com"])

    fake = _FakeService({
        "primary": [_make_event("Personal")],
        "work@example.com": [_make_event("Standup")],
        "kids@example.com": [_make_event("Pickup")],
    })
    monkeypatch.setattr(gcal, "_get_service", lambda token: fake)

    out = gcal.sync_today_events(user.id, db_session)
    assert set(out["calendars_queried"]) == {"primary", "work@example.com", "kids@example.com"}
    assert out["created"] == 3
    assert sorted(fake._events.list_calls) == sorted(["primary", "work@example.com", "kids@example.com"])


def test_sync_is_idempotent_for_duplicate_events(db_session, monkeypatch):
    user = db_session.query(User).filter(User.username == "testuser").first()
    _attach_token(db_session, user.id)
    fake = _FakeService({"primary": [_make_event("Standup")]})
    monkeypatch.setattr(gcal, "_get_service", lambda token: fake)

    gcal.sync_today_events(user.id, db_session)
    gcal.sync_today_events(user.id, db_session)
    gcal.sync_today_events(user.id, db_session)

    count = db_session.query(Task).filter(
        Task.owner_id == user.id, Task.title == "Standup",
        Task.status != TaskStatus.deleted,
    ).count()
    assert count == 1


def test_sync_skips_events_without_summary(db_session, monkeypatch):
    user = db_session.query(User).filter(User.username == "testuser").first()
    _attach_token(db_session, user.id)
    today = date.today()
    iso = datetime(today.year, today.month, today.day, 9, 0).isoformat() + "-07:00"
    fake = _FakeService({"primary": [
        {"id": "1", "summary": "", "start": {"dateTime": iso}},
        {"id": "2", "summary": "Real meeting", "start": {"dateTime": iso}},
    ]})
    monkeypatch.setattr(gcal, "_get_service", lambda token: fake)

    out = gcal.sync_today_events(user.id, db_session)
    assert out["created"] == 1


# ---------------------------------------------------------------------------
# PATCH /gcal/calendars
# ---------------------------------------------------------------------------

def test_update_calendars_strips_primary_from_stored_ids(client, auth_headers, db_session):
    user = db_session.query(User).filter(User.username == "testuser").first()
    _attach_token(db_session, user.id)

    r = client.patch("/gcal/calendars",
        json={"calendar_ids": ["primary", "work@example.com"]},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["calendar_ids"] == ["work@example.com"]


def test_update_calendars_404_when_not_connected(client, auth_headers):
    r = client.patch("/gcal/calendars", json={"calendar_ids": ["x"]}, headers=auth_headers)
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# OAuth state is DB-backed: survives restart, unforgeable, one-time use (#2/#7)
# ---------------------------------------------------------------------------

class _FakeCreds:
    token = "access-tok"
    refresh_token = "refresh-tok"
    expiry = None


class _FakeFlow:
    credentials = _FakeCreds()
    def fetch_token(self, **kwargs):
        pass


def _mock_oauth(monkeypatch):
    monkeypatch.setattr(gcal, "_gcal_available", lambda: True)
    monkeypatch.setattr(gcal, "_build_flow", lambda: _FakeFlow())


def test_callback_resolves_user_from_db_state_and_consumes_it(client, db_session, monkeypatch):
    from models import OAuthState
    _mock_oauth(monkeypatch)
    uid = db_session.query(User).first().id
    db_session.add(OAuthState(state="good-state", user_id=uid, verifier=None))
    db_session.commit()

    r = client.get("/gcal/callback", params={"code": "c", "state": "good-state"},
                   follow_redirects=False)
    assert r.status_code in (302, 307)
    assert "gcal=connected" in r.headers["location"]

    # Credentials linked to the right user, and the state row is consumed.
    assert db_session.query(GoogleCalendarToken).filter_by(user_id=uid).first() is not None
    assert db_session.query(OAuthState).filter_by(state="good-state").first() is None


def test_callback_rejects_forged_state(client, db_session, monkeypatch):
    _mock_oauth(monkeypatch)
    r = client.get("/gcal/callback", params={"code": "c", "state": "never-issued"},
                   follow_redirects=False)
    assert r.status_code == 400
