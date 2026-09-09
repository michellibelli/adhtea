"""Endpoint tests for the auth route.

Covers: setup, login, /me (no hashed_password leak), password min length,
expired session token rejection.
"""

from datetime import datetime, timedelta, timezone

from models import SessionToken, User


# ---------------------------------------------------------------------------
# /setup + /login happy paths
# ---------------------------------------------------------------------------

def test_setup_creates_first_user_and_returns_token(client):
    r = client.post("/setup", json={
        "name": "Alice", "username": "alice", "password": "longpass1",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Alice"
    assert len(body["token"]) == 64  # 32 bytes hex


def test_setup_rejected_when_users_exist(client, primary_user_token):
    r = client.post("/setup", json={
        "name": "Second", "username": "second", "password": "longpass1",
    })
    assert r.status_code == 400


def test_login_happy_path(client, primary_user_token):
    r = client.post("/login", json={"username": "testuser", "password": "password123"})
    assert r.status_code == 200
    assert "token" in r.json()


def test_login_wrong_password_rejected(client, primary_user_token):
    r = client.post("/login", json={"username": "testuser", "password": "wrongpass"})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Password length enforcement (regression guard for #11)
# ---------------------------------------------------------------------------

def test_setup_rejects_short_password(client):
    r = client.post("/setup", json={"name": "X", "username": "x", "password": "short"})
    assert r.status_code == 422  # Pydantic validation


def test_signup_rejects_short_password(client):
    r = client.post("/signup", json={
        "name": "X", "username": "newuser", "password": "short",
    })
    assert r.status_code == 422


def test_login_accepts_short_password_for_legacy_users(client):
    """LoginRequest.password is plain str (no min_length) so existing users
    whose passwords pre-date the 8-char rule can still sign in."""
    r = client.post("/login", json={"username": "ghost", "password": "abc"})
    # 401 (unauthorized) is expected, NOT 422 (validation rejection)
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# /me — model_validate doesn't leak hashed_password
# ---------------------------------------------------------------------------

def test_me_response_does_not_leak_hashed_password(client, auth_headers):
    r = client.get("/me", headers=auth_headers)
    assert r.status_code == 200
    assert "hashed_password" not in r.json()


def test_me_rejects_missing_auth(client):
    r = client.get("/me")
    assert r.status_code in (401, 403)  # FastAPI HTTPBearer rejects with 403 by default


# ---------------------------------------------------------------------------
# Token expiry
# ---------------------------------------------------------------------------

def test_expired_token_rejected(client, db_session, primary_user_token):
    user = db_session.query(User).first()
    expired = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1)
    db_session.add(SessionToken(user_id=user.id, token="expired_token", expires_at=expired))
    db_session.commit()
    r = client.get("/me", headers={"Authorization": "Bearer expired_token"})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Privilege separation — self-signup users are members, not admins (#1)
# ---------------------------------------------------------------------------

def test_setup_user_is_owner_primary(client):
    """First user (via /setup) is the owner and holds the primary/admin role."""
    r = client.post("/setup", json={"name": "Owner", "username": "owner", "password": "longpass1"})
    assert r.status_code == 200
    assert r.json()["role"] == "primary"


def test_signup_creates_member_not_admin(client, primary_user_token):
    """A self-signup user must land as `member`, never `primary`."""
    r = client.post("/signup", json={"name": "Mia", "username": "mia", "password": "longpass1"})
    assert r.status_code == 201
    assert r.json()["role"] == "member"


def test_member_blocked_from_admin_endpoints(client, primary_user_token):
    """Members cannot list, create, or delete users, nor mint invites."""
    r = client.post("/signup", json={"name": "Mia", "username": "mia", "password": "longpass1"})
    member_headers = {"Authorization": f"Bearer {r.json()['token']}"}

    assert client.get("/users", headers=member_headers).status_code == 403
    assert client.post("/invites", headers=member_headers).status_code == 403
    assert client.delete("/users/1", headers=member_headers).status_code == 403


def test_owner_reaches_admin_endpoints(client, auth_headers):
    """The owner/primary still has full admin access."""
    assert client.get("/users", headers=auth_headers).status_code == 200
    assert client.post("/invites", headers=auth_headers).status_code == 201


# ---------------------------------------------------------------------------
# Onboarding seed tasks are visible in Today (#5)
# ---------------------------------------------------------------------------

def test_onboard_seed_tasks_appear_in_today(client):
    """Seeded status=today tasks must carry a scheduled_date or get_today hides them."""
    signup = client.post("/signup", json={"name": "Nora", "username": "nora", "password": "longpass1"})
    headers = {"Authorization": f"Bearer {signup.json()['token']}"}

    seed = client.post("/onboard/seed", headers=headers)
    assert seed.status_code == 200

    today = client.get("/tasks/today", headers=headers)
    assert today.status_code == 200
    titles = [t["title"] for t in today.json()]
    assert "Log in ✓" in titles


# ---------------------------------------------------------------------------
# Session tokens are stored hashed, not in plaintext (#4)
# ---------------------------------------------------------------------------

def test_session_token_stored_hashed(client, db_session):
    import hashlib
    r = client.post("/setup", json={"name": "H", "username": "hasher", "password": "longpass1"})
    raw = r.json()["token"]

    row = db_session.query(SessionToken).first()
    assert row.token != raw                                    # never the plaintext token
    assert row.token == hashlib.sha256(raw.encode()).hexdigest()  # stored as sha256

    # And the raw token still authenticates.
    assert client.get("/me", headers={"Authorization": f"Bearer {raw}"}).status_code == 200


def test_stale_plaintext_token_cannot_authenticate(client, db_session):
    """A leaked pre-hashing (plaintext) row can't be replayed: lookup hashes the
    incoming bearer, so the stored plaintext never matches."""
    from datetime import datetime, timedelta, timezone
    client.post("/setup", json={"name": "L", "username": "legacy", "password": "longpass1"})
    uid = db_session.query(User).filter(User.username == "legacy").first().id
    future = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=1)
    db_session.add(SessionToken(user_id=uid, token="plaintext_leaked_token", expires_at=future))
    db_session.commit()
    resp = client.get("/me", headers={"Authorization": "Bearer plaintext_leaked_token"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# delete_user purges all owned rows without FK violations (#8)
# ---------------------------------------------------------------------------

def test_delete_user_purges_all_owned_data_with_fk_enforced():
    """Regression for the FK-cascade gap. SQLite skips FK checks by default, which
    is exactly why this bug reached prod — so enable them here and seed a row in
    every table that references users.id."""
    from datetime import date, datetime, timezone
    from sqlalchemy import create_engine, event, inspect
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from database import Base
    from routes.auth import _purge_user_data
    import models as m

    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(eng, "connect")
    def _fk_on(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(eng)
    Session = sessionmaker(bind=eng)
    db = Session()

    victim = m.User(name="V", username="victim", hashed_password="x", role=m.UserRole.member)
    other  = m.User(name="O", username="other",  hashed_password="x", role=m.UserRole.member)
    db.add_all([victim, other]); db.flush()

    rout = m.Routine(user_id=victim.id, title="R"); db.add(rout); db.flush()
    cat  = m.ActuatorCategory(user_id=victim.id, name="C"); db.add(cat); db.flush()
    sched = m.MedicationSchedule(user_id=victim.id, name="Med"); db.add(sched); db.flush()
    db.add(m.MedicationLog(schedule_id=sched.id, user_id=victim.id, log_date=date.today()))
    db.add(m.Task(owner_id=victim.id, title="T",
                  routine_id=rout.id, actuator_category_id=cat.id))
    db.add(m.SelfCareLog(user_id=victim.id, log_date=date.today()))
    db.add(m.SessionToken(user_id=victim.id, token="tok", expires_at=datetime.now(timezone.utc).replace(tzinfo=None)))
    db.add(m.GoogleCalendarToken(user_id=victim.id, access_token="a"))
    db.add(m.CapacitySnapshot(user_id=victim.id, log_date=date.today(), sleep_battery=1, nutrition_battery=1,
                              physical_battery=1, emotional_battery=1, environment_battery=1,
                              executive_capacitor=1, overall=1))
    db.add(m.WeeklySnapshot(user_id=victim.id, week_start=date.today()))
    db.add(m.NudgeLog(user_id=victim.id, nudge_type="t", variable="v"))
    db.add(m.OAuthState(state="pending", user_id=victim.id, verifier="v"))
    # Cross-user references to the victim that must be nulled, not deleted.
    db.add(m.Task(owner_id=other.id, title="delegated", assigned_to_id=victim.id))
    db.add(m.InviteToken(token="inv", created_by=victim.id, used_by=other.id))
    db.commit()

    _purge_user_data(victim.id, db)
    db.delete(victim)
    db.commit()  # would raise IntegrityError if any FK were left dangling

    assert db.query(m.User).filter_by(id=victim.id).first() is None
    # Other user's task survives with its delegation cleared.
    delegated = db.query(m.Task).filter_by(title="delegated").first()
    assert delegated is not None and delegated.assigned_to_id is None
    # No orphan rows reference the deleted user anywhere.
    assert db.query(m.Task).filter_by(owner_id=victim.id).count() == 0
    for model in (m.Routine, m.ActuatorCategory, m.SelfCareLog,
                  m.MedicationSchedule, m.MedicationLog, m.CapacitySnapshot, m.WeeklySnapshot,
                  m.NudgeLog, m.GoogleCalendarToken, m.SessionToken, m.OAuthState):
        assert db.query(model).filter_by(user_id=victim.id).count() == 0
    assert db.query(m.InviteToken).filter_by(created_by=victim.id).count() == 0
    db.close()


# ---------------------------------------------------------------------------
# Sessions expire at the user's 4am rollover, not after a fixed span
# ---------------------------------------------------------------------------

class TestSessionExpiry:
    """The session ends at the same boundary the day itself rolls over on, so
    signing in belongs to the morning rather than to a random hour."""

    def _expiry_for(self, local_str, tz="America/Los_Angeles", day_start_hour=4):
        from unittest.mock import patch
        from zoneinfo import ZoneInfo
        import routes.auth as auth

        zone = ZoneInfo(tz)
        now = datetime.strptime(local_str, "%Y-%m-%d %H:%M").replace(tzinfo=zone)

        class FakeDT(datetime):
            @classmethod
            def now(cls, tz=None):
                return now.astimezone(tz) if tz else now.replace(tzinfo=None)

        user = User(timezone=tz, day_start_hour=day_start_hour)
        with patch.object(auth, "datetime", FakeDT):
            expires = auth._session_expiry(user)

        local = expires.replace(tzinfo=timezone.utc).astimezone(zone)
        hours = (expires.replace(tzinfo=timezone.utc) - now.astimezone(timezone.utc)).total_seconds() / 3600
        return local, hours

    def test_morning_login_lasts_until_tomorrow_4am(self):
        local, hours = self._expiry_for("2026-07-13 09:00")
        assert (local.hour, local.day) == (4, 14)
        assert hours == 19.0

    def test_evening_login_still_ends_at_the_same_4am(self):
        local, hours = self._expiry_for("2026-07-13 20:00")
        assert (local.hour, local.day) == (4, 14)
        assert hours == 8.0

    def test_late_night_login_is_floored_to_the_next_day(self):
        # 3:50am is ten minutes from the boundary — expiring there would hand her
        # a ten-minute session, so it rolls to the following 4am instead.
        local, hours = self._expiry_for("2026-07-14 03:50")
        assert (local.hour, local.day) == (4, 15)
        assert hours > 4

    def test_no_session_is_ever_shorter_than_the_floor(self):
        for t in ("2026-07-13 23:59", "2026-07-14 00:01", "2026-07-14 01:00", "2026-07-14 03:59"):
            _, hours = self._expiry_for(t)
            assert hours >= 4, f"{t} produced a {hours:.2f}h session"

    def test_honours_the_users_timezone(self):
        local, _ = self._expiry_for("2026-07-13 09:00", tz="America/New_York")
        assert local.hour == 4  # 4am in *her* clock, not UTC

    def test_honours_a_custom_day_start_hour(self):
        local, _ = self._expiry_for("2026-07-13 09:00", day_start_hour=6)
        assert local.hour == 6

    def test_survives_dst_spring_forward(self):
        # Clocks jump 2am -> 3am on 2027-03-14, so this day is genuinely an hour short.
        local, hours = self._expiry_for("2027-03-13 09:00")
        assert local.hour == 4
        assert hours == 18.0

    def test_login_returns_the_expiry_to_the_client(self, client, primary_user_token):
        r = client.post("/login", json={"username": "testuser", "password": "password123"})
        assert r.status_code == 200
        assert r.json()["expires_at"], "client needs the expiry to pre-empt the 401"

    def test_stored_session_carries_the_same_expiry(self, client, primary_user_token, db_session):
        r = client.post("/login", json={"username": "testuser", "password": "password123"})
        returned = r.json()["expires_at"]

        session = db_session.query(SessionToken).order_by(SessionToken.id.desc()).first()
        assert session.expires_at.isoformat() == returned.rstrip("Z")
