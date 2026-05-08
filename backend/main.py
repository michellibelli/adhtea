import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from database import engine, Base
from routes import auth, tasks, routines, selfcare, medication, import_csv, gcal

load_dotenv()

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup (idempotent)
    Base.metadata.create_all(bind=engine)
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

app.include_router(auth.router,       tags=["auth"])
app.include_router(tasks.router,      tags=["tasks"])
app.include_router(routines.router,   tags=["routines"])
app.include_router(selfcare.router,   tags=["self-care"])
app.include_router(medication.router,   tags=["medication"])
app.include_router(import_csv.router,  tags=["import"])
app.include_router(gcal.router,        tags=["google-calendar"])


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}
