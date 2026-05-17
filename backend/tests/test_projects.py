"""Projects route tests: AI breakdown (mocked) + N+1 absence on list."""

import os
from sqlalchemy import event

from models import Project, Task, TaskStatus, User


# ---------------------------------------------------------------------------
# Fake Anthropic client — installed via monkeypatch
# ---------------------------------------------------------------------------

class _FakeContent:
    def __init__(self, text):
        self.text = text


class _FakeMessage:
    def __init__(self, text):
        self.content = [_FakeContent(text)]


class _FakeMessages:
    def __init__(self, payload):
        self.payload = payload

    def create(self, **kwargs):
        return _FakeMessage(self.payload)


class _FakeAnthropic:
    payload = '[{"title":"Step 1","notes":"first","size":"small","day_offset":1}, {"title":"Step 2","notes":null,"size":"medium","day_offset":3}]'

    def __init__(self, api_key=None):
        self.messages = _FakeMessages(self.payload)


def _patch_anthropic(monkeypatch, payload=None):
    import anthropic
    cls = type("PatchedAnthropic", (_FakeAnthropic,), {})
    if payload is not None:
        cls.payload = payload
    monkeypatch.setattr(anthropic, "Anthropic", cls)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")


# ---------------------------------------------------------------------------
# AI breakdown
# ---------------------------------------------------------------------------

def test_generate_returns_503_without_api_key(client, auth_headers, db_session, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    user = db_session.query(User).first()
    p = Project(user_id=user.id, title="X", status="active")
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)

    r = client.post(
        f"/projects/{p.id}/generate",
        json={"description": "Plan a birthday party"},
        headers=auth_headers,
    )
    assert r.status_code == 503


def test_generate_creates_tasks_with_project_id(client, auth_headers, db_session, monkeypatch):
    _patch_anthropic(monkeypatch)
    user = db_session.query(User).first()
    p = Project(user_id=user.id, title="X", status="active")
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)

    r = client.post(
        f"/projects/{p.id}/generate",
        json={"description": "Plan a birthday party"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    tasks = r.json()
    assert len(tasks) == 2
    assert all(t["project_id"] == p.id for t in tasks)
    assert tasks[0]["title"] == "Step 1"
    assert tasks[1]["title"] == "Step 2"


def test_generate_handles_markdown_fenced_response(client, auth_headers, db_session, monkeypatch):
    """Frontend strips ```json fences; backend mirrors that for robustness."""
    fenced = '```json\n[{"title":"X","size":"small","day_offset":1}]\n```'
    _patch_anthropic(monkeypatch, payload=fenced)
    user = db_session.query(User).first()
    p = Project(user_id=user.id, title="P", status="active")
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)

    r = client.post(
        f"/projects/{p.id}/generate",
        json={"description": "..."},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_generate_500_on_invalid_json(client, auth_headers, db_session, monkeypatch):
    _patch_anthropic(monkeypatch, payload="this is not JSON")
    user = db_session.query(User).first()
    p = Project(user_id=user.id, title="P", status="active")
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)

    r = client.post(
        f"/projects/{p.id}/generate",
        json={"description": "..."},
        headers=auth_headers,
    )
    assert r.status_code == 500


# ---------------------------------------------------------------------------
# N+1 absence on project listing
# ---------------------------------------------------------------------------

def _count_queries(engine):
    """Return (count, listener_remover). Count SELECT/INSERT executions."""
    counter = {"n": 0}

    def _before(conn, cursor, statement, parameters, context, executemany):
        if statement.strip().upper().startswith("SELECT"):
            counter["n"] += 1

    event.listen(engine, "before_cursor_execute", _before)
    return counter, lambda: event.remove(engine, "before_cursor_execute", _before)


def test_list_projects_is_not_n_plus_one(client, auth_headers, db_session, db_engine):
    """Listing N projects must run a constant number of queries, not N+1."""
    user = db_session.query(User).first()
    for i in range(10):
        p = Project(user_id=user.id, title=f"P{i}", status="active")
        db_session.add(p)
    db_session.commit()
    for p in db_session.query(Project).all():
        for _ in range(3):
            db_session.add(Task(owner_id=user.id, project_id=p.id, title="t", status=TaskStatus.inbox))
    db_session.commit()

    counter, remove = _count_queries(db_engine)
    try:
        r = client.get("/projects", headers=auth_headers)
        assert r.status_code == 200
        assert len(r.json()) == 10
        # Strictly more than constant would be ~12+ (project list + 10 per-project counts).
        # Allow some slack for auth/session lookups but assert well under N+1 behavior.
        assert counter["n"] < 10, f"too many SELECTs: {counter['n']} — likely N+1"
    finally:
        remove()
