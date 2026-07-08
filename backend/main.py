import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from sqlalchemy import text
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from database import engine, Base
from rate_limit import limiter
from routes import auth, tasks, routines, selfcare, medication, import_csv, gcal
from routes import projects, triage, insights

load_dotenv()

# Structured logging to stdout (captured by Render). Level via LOG_LEVEL env.
# Modules log with logging.getLogger(__name__) instead of print(), so lines
# carry a timestamp, level, and source — greppable in the Render dashboard.
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")


def _migrate(target_engine=None):
    """Add new columns to existing tables without dropping data.

    This is a hand-rolled migration system — it checks whether each column
    already exists before trying to add it, so it's safe to run on every startup.

    SQLite (local dev) and PostgreSQL (production on Supabase/Render) have
    slightly different ALTER TABLE syntax, so there are two branches.

    If this project ever grows large, consider migrating to Alembic, which is
    the standard Python tool for managing database schema changes with version
    history and rollback support.
    """
    eng = target_engine if target_engine is not None else engine
    with eng.connect() as conn:
        is_sqlite = str(eng.url).startswith("sqlite")
        if is_sqlite:
            tasks_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(tasks)")).fetchall()}
            users_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(users)")).fetchall()}
            med_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(medication_schedules)")).fetchall()}
            if "dose" in med_cols:
                # Privacy: drop dose column. Pre-3.9.11 rows held real dose strings
                # ("10 mg", etc.) which are identifying. SQLite supports DROP COLUMN
                # since 3.35.0 (2021); Render/Supabase Postgres handles it too.
                conn.execute(text("ALTER TABLE medication_schedules DROP COLUMN dose"))
            if "project_id" not in tasks_cols:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN project_id INTEGER REFERENCES projects(id)"))
            # Domains removed — drop the FK column if a pre-removal DB still has it.
            # SQLite can't DROP a column that's part of a foreign key, so this is
            # best-effort on stale local dev DBs (production is Postgres). A
            # leftover nullable column/table is harmless — the ORM ignores it.
            if "domain_id" in tasks_cols:
                try:
                    conn.execute(text("ALTER TABLE tasks DROP COLUMN domain_id"))
                except Exception:
                    pass
            if "score" not in tasks_cols:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN score FLOAT"))
            if "score_components" not in tasks_cols:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN score_components TEXT"))
            if "score_updated_at" not in tasks_cols:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN score_updated_at DATETIME"))
            if "push_count" not in tasks_cols:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN push_count INTEGER NOT NULL DEFAULT 0"))
            if "pinned_for" not in tasks_cols:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN pinned_for DATE"))
            if "email" not in users_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN email VARCHAR(255)"))
            if "is_owner" not in users_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_owner BOOLEAN NOT NULL DEFAULT 0"))
                conn.execute(text("UPDATE users SET is_owner=1 WHERE id=(SELECT MIN(id) FROM users)"))
            if "alpha_code_version" not in users_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN alpha_code_version INTEGER NOT NULL DEFAULT 0"))
            if "is_onboarded" not in users_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_onboarded BOOLEAN NOT NULL DEFAULT 0"))
                conn.execute(text("UPDATE users SET is_onboarded=1"))  # existing users skip onboarding
            projects_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(projects)")).fetchall()}
            if "domain_id" in projects_cols:
                try:
                    conn.execute(text("ALTER TABLE projects DROP COLUMN domain_id"))
                except Exception:
                    pass
            try:
                conn.execute(text("DROP TABLE IF EXISTS domains"))
            except Exception:
                pass
            if "max_tasks_per_day" not in users_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN max_tasks_per_day INTEGER NOT NULL DEFAULT 10"))
            if "max_total_per_day" not in users_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN max_total_per_day INTEGER NOT NULL DEFAULT 15"))
            if "rolled_over_on" not in users_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN rolled_over_on DATE"))
            if "planned_on" not in users_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN planned_on DATE"))
            # Security: every self-signup used to be created as `primary` (admin).
            # Demote all non-owner primaries to plain members. Owner keeps admin.
            conn.execute(text("UPDATE users SET role='member' WHERE is_owner=0 AND role='primary'"))
            conn.commit()
        else:
            # Add the new `member` label to the native Postgres `userrole` enum.
            # ALTER TYPE ... ADD VALUE must be committed before the value can be
            # used, so this runs (and commits) ahead of the demote UPDATE below.
            conn.execute(text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'member'"))
            conn.commit()
            conn.execute(text(
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL"
            ))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT FALSE"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS alpha_code_version INTEGER NOT NULL DEFAULT 0"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_onboarded BOOLEAN NOT NULL DEFAULT FALSE"))
            conn.execute(text("UPDATE users SET is_onboarded=TRUE WHERE is_onboarded=FALSE"))
            conn.execute(text(
                "UPDATE users SET is_owner=TRUE WHERE id=(SELECT MIN(id) FROM users) AND is_owner=FALSE"
            ))
            # Domains removed — drop the FK columns then the table (irreversible).
            conn.execute(text("ALTER TABLE projects DROP COLUMN IF EXISTS domain_id"))
            conn.execute(text("ALTER TABLE tasks DROP COLUMN IF EXISTS domain_id"))
            conn.execute(text("DROP TABLE IF EXISTS domains CASCADE"))
            conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS score FLOAT"))
            conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS score_components TEXT"))
            conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS score_updated_at TIMESTAMP"))
            conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS push_count INTEGER NOT NULL DEFAULT 0"))
            conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pinned_for DATE"))
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) NOT NULL DEFAULT 'America/Los_Angeles'"
            ))
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS day_start_hour INTEGER NOT NULL DEFAULT 6"
            ))
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS max_tasks_per_day INTEGER NOT NULL DEFAULT 10"
            ))
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS max_total_per_day INTEGER NOT NULL DEFAULT 15"
            ))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS rolled_over_on DATE"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS planned_on DATE"))
            # Security: demote all non-owner primaries (every self-signup used to
            # be created as admin). Owner keeps primary/admin.
            conn.execute(text("UPDATE users SET role='member' WHERE is_owner=FALSE AND role='primary'"))
            # Privacy: drop dose column. Pre-3.9.11 rows held real dose strings.
            conn.execute(text("ALTER TABLE medication_schedules DROP COLUMN IF EXISTS dose"))
            # Security: enable Row-Level Security on every table. The backend
            # connects as the `postgres` owner role, which bypasses RLS, so this
            # is a no-op for the app. But it shuts Supabase's auto-generated
            # PostgREST API: with RLS on and no policies, the public `anon` key
            # can no longer read or write these tables. Re-running ENABLE on an
            # already-enabled table is a harmless no-op. Not using FORCE — that
            # would apply RLS to the owner too and lock out the backend.
            # See Supabase advisor: rls_disabled_in_public.
            for _table in (
                "site_config", "users", "session_tokens", "actuator_categories",
                "projects", "tasks", "routines", "self_care_logs",
                "medication_schedules", "medication_logs", "invite_tokens",
                "google_calendar_tokens", "capacity_snapshots",
                "weekly_snapshots", "nudge_logs", "oauth_states",
            ):
                conn.execute(text(f"ALTER TABLE {_table} ENABLE ROW LEVEL SECURITY"))
            conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _migrate()
    yield


app = FastAPI(
    title="ARIA",
    description="Adaptive Routine Intelligence Assistant — v2",
    version="2.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,        tags=["auth"])
app.include_router(tasks.router,       tags=["tasks"])
app.include_router(routines.router,    tags=["routines"])
app.include_router(selfcare.router,    tags=["self-care"])
app.include_router(medication.router,  tags=["medication"])
app.include_router(import_csv.router,  tags=["import"])
app.include_router(gcal.router,        tags=["google-calendar"])
app.include_router(projects.router,    tags=["projects"])
app.include_router(triage.router)
app.include_router(insights.router)


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}
