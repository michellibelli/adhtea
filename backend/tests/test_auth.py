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
