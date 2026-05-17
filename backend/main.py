import os
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
from routes import projects, domains

load_dotenv()

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
            if "domain_id" not in projects_cols:
                conn.execute(text("ALTER TABLE projects ADD COLUMN domain_id INTEGER REFERENCES domains(id)"))
            if "max_tasks_per_day" not in users_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN max_tasks_per_day INTEGER NOT NULL DEFAULT 10"))
            if "max_total_per_day" not in users_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN max_total_per_day INTEGER NOT NULL DEFAULT 15"))
            conn.commit()
        else:
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
            conn.execute(text(
                "ALTER TABLE projects ADD COLUMN IF NOT EXISTS domain_id INTEGER REFERENCES domains(id) ON DELETE SET NULL"
            ))
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
            # Privacy: drop dose column. Pre-3.9.11 rows held real dose strings.
            conn.execute(text("ALTER TABLE medication_schedules DROP COLUMN IF EXISTS dose"))
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
app.include_router(domains.router)


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}
