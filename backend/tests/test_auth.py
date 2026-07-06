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
