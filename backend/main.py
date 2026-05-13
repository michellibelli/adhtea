import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from sqlalchemy import text

from database import engine, Base
from routes import auth, tasks, routines, selfcare, medication, import_csv, gcal
from routes import projects

load_dotenv()

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")


def _migrate():
    """Add new columns to existing tables without dropping data."""
    with engine.connect() as conn:
        is_sqlite = str(engine.url).startswith("sqlite")
        if is_sqlite:
            rows = conn.execute(text("PRAGMA table_info(tasks)")).fetchall()
            existing = {row[1] for row in rows}
            if "project_id" not in existing:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN project_id INTEGER REFERENCES projects(id)"))
                conn.commit()
        else:
            conn.execute(text(
                "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL"
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


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}
