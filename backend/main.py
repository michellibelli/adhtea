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
from routes import auth, tasks, routines, selfcare, import_csv
from routes import insights, review, export_csv

load_dotenv()

# Structured logging to stdout (captured by Render). Level via LOG_LEVEL env.
# Modules log with logging.getLogger(__name__) instead of print(), so lines
# carry a timestamp, level, and source — greppable in the Render dashboard.
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


class _SuppressHealthAccessLog(logging.Filter):
    """Drop *successful* /health access lines from uvicorn's access log.

    Render polls /health roughly every 5s and the interval is not configurable,
    so left alone the access log is ~20k identical "GET /health 200 OK" lines a
    day and a real error is unfindable underneath them. Filtering here rather
    than passing --no-access-log keeps every other request logged.

    Non-200 health responses are deliberately kept — a failing health check is
    exactly the line worth seeing.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if not isinstance(args, tuple) or len(args) < 5:
            return True
        path, status = args[2], args[4]
        return not (path == "/health" and str(status) == "200")


logging.getLogger("uvicorn.access").addFilter(_SuppressHealthAccessLog())

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
            # Domains removed — drop the FK column if a pre-removal DB still has it.
            # SQLite can't DROP a column that's part of a foreign key, so this is
            # best-effort on stale local dev DBs (production is Postgres). A
            # leftover nullable column/table is harmless — the ORM ignores it.
            if "domain_id" in tasks_cols:
                try:
                    conn.execute(text("ALTER TABLE tasks DROP COLUMN domain_id"))
                except Exception:
                    pass
            # score/score_components/score_updated_at/pinned_for are NOT added
            # here any more. The scoring engine went with routes/triage.py in
            # 4.4.0; adding them to a fresh DB just recreated the orphans. The
            # columns stay declared in models.py (so create_all still makes them,
            # and prod's existing ones keep matching) but nothing reads or
            # writes them. See HANDOFF "Known issues".
            if "push_count" not in tasks_cols:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN push_count INTEGER NOT NULL DEFAULT 0"))
            if "minutes_spent" not in tasks_cols:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN minutes_spent INTEGER"))
            if "is_work" not in tasks_cols:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN is_work BOOLEAN"))
            if "completed_retroactively" not in tasks_cols:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN completed_retroactively BOOLEAN"))
            if "email" not in users_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN email VARCHAR(255)"))
            if "is_owner" not in users_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_owner BOOLEAN NOT NULL DEFAULT 0"))
                conn.execute(text("UPDATE users SET is_owner=1 WHERE id=(SELECT MIN(id) FROM users)"))
            if "alpha_code_version" not in users_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN alpha_code_version INTEGER NOT NULL DEFAULT 0"))
            if "medication_question_enabled" not in users_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN medication_question_enabled BOOLEAN NOT NULL DEFAULT 1"))
            if "is_onboarded" not in users_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_onboarded BOOLEAN NOT NULL DEFAULT 0"))
                conn.execute(text("UPDATE users SET is_onboarded=1"))  # existing users skip onboarding
            try:
                conn.execute(text("DROP TABLE IF EXISTS domains"))
            except Exception:
                pass
            # Projects removed (4.16.2). SQLite can't drop a column that is part
            # of a foreign key, so this is best-effort on stale local dev DBs
            # (production is Postgres). A leftover nullable column is harmless —
            # the ORM no longer declares it.
            if "project_id" in tasks_cols:
                try:
                    conn.execute(text("ALTER TABLE tasks DROP COLUMN project_id"))
                except Exception:
                    pass
            try:
                conn.execute(text("DROP TABLE IF EXISTS projects"))
            except Exception:
                pass
            if "rolled_over_on" not in users_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN rolled_over_on DATE"))
            if "planned_on" not in users_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN planned_on DATE"))
            if "day_capacity_slots" not in users_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN day_capacity_slots INTEGER"))
            if "box_ordered_on" not in users_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN box_ordered_on DATE"))
            if "reviewed_through" not in users_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN reviewed_through DATE"))
            # Effort model (4.11): retrospective small/big tag replaces the
            # never-used 3-level weight. Add effort; drop weight + importance
            # (both dead — importance was settable-only, weight had no UI).
            if "effort" not in tasks_cols:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN effort VARCHAR(10)"))
            for _dead in ("weight", "importance"):
                if _dead in tasks_cols:
                    try:
                        conn.execute(text(f"ALTER TABLE tasks DROP COLUMN {_dead}"))
                    except Exception:
                        pass
            # Move the day rollover from the old 6am default to 4am (see Postgres
            # branch note). day_start_hour was never UI-exposed, so 6 == old default.
            if "day_start_hour" in users_cols:
                conn.execute(text("UPDATE users SET day_start_hour=4 WHERE day_start_hour=6"))
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
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT FALSE"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS alpha_code_version INTEGER NOT NULL DEFAULT 0"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS medication_question_enabled BOOLEAN NOT NULL DEFAULT TRUE"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_onboarded BOOLEAN NOT NULL DEFAULT FALSE"))
            conn.execute(text("UPDATE users SET is_onboarded=TRUE WHERE is_onboarded=FALSE"))
            conn.execute(text(
                "UPDATE users SET is_owner=TRUE WHERE id=(SELECT MIN(id) FROM users) AND is_owner=FALSE"
            ))
            # Domains removed — drop the FK columns then the table (irreversible).
            conn.execute(text("ALTER TABLE tasks DROP COLUMN IF EXISTS domain_id"))
            conn.execute(text("DROP TABLE IF EXISTS domains CASCADE"))
            # Projects removed (4.16.2) — same shape, same irreversibility.
            # Column BEFORE table: DROP TABLE ... CASCADE removes the FK
            # constraint but leaves tasks.project_id behind as an orphan.
            # "projects" was taken out of the RLS loop below in 4.16.1 — ENABLE
            # ROW LEVEL SECURITY on a dropped table raises in here, and _migrate
            # runs inside lifespan, so that would crash-loop the service.
            conn.execute(text("ALTER TABLE tasks DROP COLUMN IF EXISTS project_id"))
            conn.execute(text("DROP TABLE IF EXISTS projects CASCADE"))
            conn.execute(text("ALTER TABLE weekly_snapshots DROP COLUMN IF EXISTS stalled_projects"))
            # score/pinned_for deliberately not added — see the SQLite branch.
            conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS push_count INTEGER NOT NULL DEFAULT 0"))
            conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS minutes_spent INTEGER"))
            conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_work BOOLEAN"))
            conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_retroactively BOOLEAN"))
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) NOT NULL DEFAULT 'America/Los_Angeles'"
            ))
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS day_start_hour INTEGER NOT NULL DEFAULT 4"
            ))
            # Move the day rollover from the old 6am default to 4am. day_start_hour
            # was never exposed in any UI, so a stored 6 always means "never
            # customized" — safe to bump. Matches only old-default rows, so it's a
            # no-op on every boot after the first.
            conn.execute(text("UPDATE users SET day_start_hour=4 WHERE day_start_hour=6"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS rolled_over_on DATE"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS planned_on DATE"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS day_capacity_slots INTEGER"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS box_ordered_on DATE"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS reviewed_through DATE"))
            # Effort model (4.11): add the retrospective small/big tag, then drop
            # the dead weight + importance columns (irreversible). create_all
            # already made the `effort` enum type via effort_examples; this DO
            # block is a no-op fallback in case ordering ever changes.
            conn.execute(text(
                "DO $$ BEGIN CREATE TYPE effort AS ENUM ('small','big'); "
                "EXCEPTION WHEN duplicate_object THEN null; END $$;"
            ))
            conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS effort effort"))
            conn.execute(text("ALTER TABLE tasks DROP COLUMN IF EXISTS weight"))
            conn.execute(text("ALTER TABLE tasks DROP COLUMN IF EXISTS importance"))
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
                "tasks", "routines", "self_care_logs",
                "medication_schedules", "medication_logs", "invite_tokens",
                "google_calendar_tokens", "capacity_snapshots",
                "weekly_snapshots", "nudge_logs", "oauth_states",
                "effort_examples",
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
app.include_router(import_csv.router,  tags=["import"])
app.include_router(export_csv.router,  tags=["export"])
app.include_router(insights.router)
app.include_router(review.router,      tags=["review"])


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}
