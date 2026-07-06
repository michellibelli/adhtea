"""Pytest fixtures: isolated in-memory SQLite per test, FastAPI TestClient.

Each test function gets a fresh schema. `StaticPool` keeps a single shared
connection so the in-memory DB survives across the multiple connections the
app would otherwise open inside one request.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app, _migrate
from rate_limit import limiter

# Rate limits are infrastructure, not logic under test. The shared limiter is
# keyed on client IP, so the many /setup + /signup calls across the suite would
# otherwise trip the per-minute caps and fail unrelated tests with 429s.
limiter.enabled = False


@pytest.fixture
def db_engine():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    yield eng
    Base.metadata.drop_all(bind=eng)
    eng.dispose()


@pytest.fixture
def db_session(db_engine):
    Session = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db_engine):
    Session = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)

    def override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def primary_user_token(client):
    """Create the first user via /setup, return their bearer token."""
    r = client.post("/setup", json={
        "name": "Test",
        "username": "testuser",
        "password": "password123",
    })
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture
def auth_headers(primary_user_token):
    return {"Authorization": f"Bearer {primary_user_token}"}
