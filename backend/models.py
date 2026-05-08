import enum
from datetime import datetime, timezone, date
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Date,
    Enum as SAEnum, ForeignKey, Text, Float
)
from sqlalchemy.orm import relationship
from database import Base


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class UserRole(str, enum.Enum):
    primary = "primary"
    child = "child"


class TaskType(str, enum.Enum):
    task = "task"
    appointment = "appointment"
    routine = "routine"
    note = "note"


class LocationType(str, enum.Enum):
    zoom    = "zoom"
    signal  = "signal"
    phone   = "phone"
    office  = "office"
    address = "address"
    other   = "other"


class TaskStatus(str, enum.Enum):
    inbox = "inbox"
    today = "today"
    snoozed = "snoozed"
    done = "done"
    deleted = "deleted"


class Priority(str, enum.Enum):
    urgent = "urgent"
    high = "high"
    normal = "normal"
    low = "low"


class Importance(str, enum.Enum):
    critical = "critical"
    high = "high"
    normal = "normal"
    low = "low"


class Desire(str, enum.Enum):
    high = "high"
    medium = "medium"
    low = "low"


class TaskWeight(str, enum.Enum):
    light = "light"
    medium = "medium"
    heavy = "heavy"


class RoutineFrequency(str, enum.Enum):
    daily = "daily"
    weekdays = "weekdays"
    weekends = "weekends"
    weekly = "weekly"
    custom = "custom"


class TimeOfDay(str, enum.Enum):
    morning = "morning"
    afternoon = "afternoon"
    evening = "evening"
    anytime = "anytime"


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.primary, nullable=False)
    # For child accounts: linked to a primary user
    parent_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    # Settings
    task_visible_limit = Column(Integer, default=10)
    notification_morning = Column(String(5), default="08:00")   # HH:MM
    notification_evening = Column(String(5), default="21:00")
    triage_start_hour = Column(Integer, default=8)
    triage_end_hour = Column(Integer, default=12)
    created_at = Column(DateTime, default=utcnow)

    sessions = relationship("SessionToken", back_populates="user", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="owner", foreign_keys="Task.owner_id", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# Session Token
# ---------------------------------------------------------------------------

class SessionToken(Base):
    __tablename__ = "session_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User", back_populates="sessions")


# ---------------------------------------------------------------------------
# Actuator Category
# ---------------------------------------------------------------------------

class ActuatorCategory(Base):
    __tablename__ = "actuator_categories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)   # required for custom; null for presets
    is_preset = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)


# ---------------------------------------------------------------------------
# Task
# ---------------------------------------------------------------------------

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # delegation
    actuator_category_id = Column(Integer, ForeignKey("actuator_categories.id"), nullable=True)
    routine_id = Column(Integer, ForeignKey("routines.id"), nullable=True)

    title = Column(String(500), nullable=False)
    notes = Column(Text, nullable=True)
    task_type = Column(SAEnum(TaskType), default=TaskType.task, nullable=False)
    status = Column(SAEnum(TaskStatus), default=TaskStatus.inbox, nullable=False, index=True)

    # Priority fields (set during triage)
    priority = Column(SAEnum(Priority), nullable=True)
    importance = Column(SAEnum(Importance), nullable=True)
    desire = Column(SAEnum(Desire), nullable=True)
    weight = Column(SAEnum(TaskWeight), default=TaskWeight.medium, nullable=False)
    is_critical = Column(Boolean, default=False)        # always surface on low-focus list

    # Deadline / scheduling
    due_date = Column(Date, nullable=True)              # hard deadline date (tasks, appointments)
    due_time = Column(String(5), nullable=True)         # HH:MM, required for appointments
    scheduled_date = Column(DateTime, nullable=True)    # which day it's on Today list
    snooze_until = Column(DateTime, nullable=True)
    sort_order = Column(Float, nullable=True)           # drag-to-reorder position

    # Appointment location
    location_type = Column(SAEnum(LocationType), nullable=True)
    location_detail = Column(String(500), nullable=True)  # URL, phone, address, etc.

    # Notes tags (free-form, comma-separated)
    tags = Column(String(500), nullable=True)

    # Lifecycle
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    owner = relationship("User", back_populates="tasks", foreign_keys=[owner_id])
    assigned_to = relationship("User", foreign_keys=[assigned_to_id])
    actuator_category = relationship("ActuatorCategory")


# ---------------------------------------------------------------------------
# Routine (template — generates Task instances)
# ---------------------------------------------------------------------------

class Routine(Base):
    __tablename__ = "routines"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(500), nullable=False)
    notes = Column(Text, nullable=True)
    frequency = Column(SAEnum(RoutineFrequency), default=RoutineFrequency.daily, nullable=False)
    time_of_day = Column(SAEnum(TimeOfDay), default=TimeOfDay.anytime, nullable=False)
    # For weekly/custom: comma-separated day numbers 0=Mon … 6=Sun
    days_of_week = Column(String(20), nullable=True)
    exact_time = Column(String(5), nullable=True)       # HH:MM optional exact time
    is_critical = Column(Boolean, default=False)        # surfaces on low-focus skip list
    only_when_present = Column(Boolean, default=False)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)


# ---------------------------------------------------------------------------
# Self-Care Log
# ---------------------------------------------------------------------------

class SelfCareLog(Base):
    __tablename__ = "self_care_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    log_date = Column(Date, nullable=False, index=True)   # calendar date the log covers
    logged_at = Column(DateTime, default=utcnow)

    sleep_hours = Column(Float, nullable=True)
    sleep_quality = Column(Integer, nullable=True)    # 1–5
    meals = Column(Integer, nullable=True)            # 0–4
    exercise = Column(Boolean, nullable=True)
    exercise_minutes = Column(Integer, nullable=True)
    medication_taken = Column(Boolean, nullable=True)
    mood = Column(Integer, nullable=True)             # 1–5
    notes = Column(Text, nullable=True)


# ---------------------------------------------------------------------------
# Medication
# ---------------------------------------------------------------------------

class MedicationSchedule(Base):
    __tablename__ = "medication_schedules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(200), nullable=False)
    dose = Column(String(100), nullable=True)
    reminder_times = Column(String(100), nullable=True)  # "08:00,14:00" CSV
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)

    logs = relationship("MedicationLog", back_populates="schedule", cascade="all, delete-orphan")


class MedicationLog(Base):
    __tablename__ = "medication_logs"

    id = Column(Integer, primary_key=True, index=True)
    schedule_id = Column(Integer, ForeignKey("medication_schedules.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    log_date = Column(Date, nullable=False, index=True)
    taken_at = Column(DateTime, default=utcnow)

    schedule = relationship("MedicationSchedule", back_populates="logs")


# ---------------------------------------------------------------------------
# Google Calendar OAuth token
# ---------------------------------------------------------------------------

class GoogleCalendarToken(Base):
    __tablename__ = "google_calendar_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    access_token = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=True)
    token_expiry = Column(DateTime, nullable=True)
    calendar_ids = Column(Text, nullable=True)   # JSON list of calendar IDs to sync
    last_synced = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)


# ---------------------------------------------------------------------------
# Capacity Snapshot (computed from SelfCareLog)
# ---------------------------------------------------------------------------

class CapacitySnapshot(Base):
    __tablename__ = "capacity_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    log_date = Column(Date, nullable=False, index=True)

    sleep_battery = Column(Float, nullable=False)
    nutrition_battery = Column(Float, nullable=False)
    physical_battery = Column(Float, nullable=False)
    emotional_battery = Column(Float, nullable=False)
    environment_battery = Column(Float, nullable=False)
    executive_capacitor = Column(Float, nullable=False)
    overall = Column(Float, nullable=False)
    computed_at = Column(DateTime, default=utcnow)
