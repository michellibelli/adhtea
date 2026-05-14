import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from sqlalchemy import text

from database import engine, Base
from routes import auth, tasks, routines, selfcare, medication, import_csv, gcal
from routes import projects, domains

load_dotenv()

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")


def _migrate():
    """Add new columns to existing tables without dropping data."""
    with engine.connect() as conn:
        is_sqlite = str(engine.url).startswith("sqlite")
        if is_sqlite:
            tasks_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(tasks)")).fetchall()}
            users_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(users)")).fetchall()}
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
