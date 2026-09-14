"""Tests for _migrate idempotency.

The migration runs on every backend startup. It must be safe to re-run on
DBs that already have the target columns. Targets the SQLite branch — the
Postgres branch uses IF NOT EXISTS / IF EXISTS so is intrinsically idempotent.
"""

from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

from database import Base
from main import _migrate


def _fresh_engine():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    return eng


def _columns(engine, table):
    with engine.connect() as conn:
        return {r[1] for r in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()}


def test_migrate_runs_clean_on_fresh_db():
    eng = _fresh_engine()
    _migrate(target_engine=eng)
    cols = _columns(eng, "users")
    assert "is_owner" in cols
    assert "alpha_code_version" in cols


def test_migrate_is_idempotent():
    eng = _fresh_engine()
    _migrate(target_engine=eng)
    _migrate(target_engine=eng)
    _migrate(target_engine=eng)
    assert "is_owner" in _columns(eng, "users")


def test_migrate_drops_dose_column_if_present():
    eng = _fresh_engine()
    # ORM no longer declares `dose`, so simulate a legacy DB by adding it back.
    with eng.connect() as conn:
        conn.execute(text("ALTER TABLE medication_schedules ADD COLUMN dose VARCHAR(100)"))
        conn.commit()
    assert "dose" in _columns(eng, "medication_schedules")
    _migrate(target_engine=eng)
    assert "dose" not in _columns(eng, "medication_schedules")


def test_migrate_dose_drop_is_noop_when_column_absent():
    eng = _fresh_engine()
    assert "dose" not in _columns(eng, "medication_schedules")
    _migrate(target_engine=eng)
    assert "dose" not in _columns(eng, "medication_schedules")


def _tables(engine):
    with engine.connect() as conn:
        return {r[0] for r in conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table'")
        ).fetchall()}


def test_migrate_drops_projects_table_if_present():
    """A legacy DB still carrying the projects table loses it (4.16.2).

    The ORM no longer declares Project, so _fresh_engine() never creates the
    table — simulate a pre-removal DB by building it by hand first.
    """
    eng = _fresh_engine()
    with eng.connect() as conn:
        conn.execute(text(
            "CREATE TABLE projects (id INTEGER PRIMARY KEY, user_id INTEGER, title VARCHAR(255))"
        ))
        conn.execute(text("ALTER TABLE tasks ADD COLUMN project_id INTEGER"))
        conn.commit()
    assert "projects" in _tables(eng)
    assert "project_id" in _columns(eng, "tasks")

    _migrate(target_engine=eng)

    assert "projects" not in _tables(eng)
    assert "project_id" not in _columns(eng, "tasks")


def test_migrate_projects_drop_is_noop_when_absent():
    eng = _fresh_engine()
    assert "projects" not in _tables(eng)
    _migrate(target_engine=eng)
    assert "projects" not in _tables(eng)
    assert "project_id" not in _columns(eng, "tasks")
