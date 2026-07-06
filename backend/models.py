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
    primary = "primary"   # admin — manages users/invites (owner is a primary)
    member = "member"     # regular self-service user; no admin surface
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

class SiteConfig(Base):
    __tablename__ = "site_config"

    id = Column(Integer, primary_key=True)
    alpha_code = Column(String(100), nullable=True)         # None = open signup
    alpha_code_version = Column(Integer, default=1, nullable=False)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.primary, nullable=False)
    is_owner = Column(Boolean, default=False, nullable=False)  # True only for setup user
    # For child accounts: linked to a primary user
    parent_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    # Settings
    task_visible_limit = Column(Integer, default=10)
    # Triage caps — sliders in Settings, ±5 from defaults
    max_tasks_per_day = Column(Integer, default=10, nullable=False)   # range 5..15
    max_total_per_day = Column(Integer, default=15, nullable=False)   # tasks+appts+routines; range 10..20
    notification_morning = Column(String(5), default="08:00")   # HH:MM
    notification_evening = Column(String(5), default="21:00")
    triage_start_hour = Column(Integer, default=8)
    triage_end_hour = Column(Integer, default=12)
    timezone = Column(String(50), default="America/Los_Angeles", nullable=False)
    day_start_hour = Column(Integer, default=6, nullable=False)   # new day begins at this local hour
    alpha_code_version = Column(Integer, default=0, nullable=False)
    is_onboarded = Column(Boolean, default=False, nullable=False)
    # Last app-day the once-per-day rollover sweeps ran for this user. Used as an
    # atomic guard so concurrent Today/Inbox loads don't each spawn routines.
    rolled_over_on = Column(Date, nullable=True)
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
# Project
# ---------------------------------------------------------------------------

class Domain(Base):
    """Project domain — scheduling rules for when tasks in this domain can be placed.

    rules JSON: list of rule objects. Each rule specifies allowed days/times/weights.
    A task is allowed if it matches AT LEAST ONE rule. Empty list = no restrictions.

    Example (Home): light tasks evenings on weekdays, anything on weekends
        [
          {"days": [0,1,2,3,4], "times": ["evening"], "weights": ["light"]},
          {"days": [5,6]}
        ]
    """
    __tablename__ = "domains"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(50), nullable=False)
    rules = Column(Text, nullable=False, default="[]")  # JSON list of rule dicts
    is_default = Column(Boolean, default=False, nullable=False)  # work/home seeded for each user
    created_at = Column(DateTime, default=utcnow)


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(20), default="active", nullable=False)  # active, completed, archived
    domain_id = Column(Integer, ForeignKey("domains.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    tasks = relationship("Task", back_populates="project", foreign_keys="[Task.project_id]")
    domain = relationship("Domain", foreign_keys=[domain_id])

    @property
    def domain_name(self):
        return self.domain.name if self.domain else None


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
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    # Only honored for orphan tasks (no project_id). When the task IS in a
    # project, the project's domain wins — see effective_domain() in
    # routes/domain_utils.py. Null + no project => treated as Work at runtime.
    domain_id = Column(Integer, ForeignKey("domains.id"), nullable=True)

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

    # Triage scoring (R1 — see routes/triage.py for compute logic)
    # `score` is the cached priority signal used for bin-pack + Focus surfacing.
    # `score_components` is JSON breaking down the score by lever so the UI can
    # show "Why this?" — confidence comes from explaining the math, not hiding it.
    score = Column(Float, nullable=True)
    score_components = Column(Text, nullable=True)            # JSON dict
    score_updated_at = Column(DateTime, nullable=True)
    # Incremented each time the user snoozes / defers this task. Feeds into the
    # score as a penalty so chronically pushed items eventually flag for
    # archive-or-delete prompts (R5).
    push_count = Column(Integer, default=0, nullable=False)

    # User-pinned "must do on this day." Bin-pack places pinned items first,
    # before score-driven placement. Max 3 pins per day is enforced at the
    # route layer (see routes/triage.py::pin_task). Capped at three so the
    # user is forced to actually choose — pinning everything = pinning nothing.
    pinned_for = Column(Date, nullable=True, index=True)

    # Lifecycle
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    owner = relationship("User", back_populates="tasks", foreign_keys=[owner_id])
    assigned_to = relationship("User", foreign_keys=[assigned_to_id])
    actuator_category = relationship("ActuatorCategory")
    project = relationship("Project", back_populates="tasks", foreign_keys=[project_id])
    domain = relationship("Domain", foreign_keys=[domain_id])

    @property
    def project_name(self):
        return self.project.title if self.project else None

    @property
    def domain_name(self):
        # Effective domain for display: project wins over task's own domain.
        # Null when the task has neither — UI treats that as "Work" but the
        # API stays honest about the underlying column being unset.
        if self.project and getattr(self.project, "domain", None):
            return self.project.domain.name
        if self.domain:
            return self.domain.name
        return None


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
# Invite Token
# ---------------------------------------------------------------------------

class InviteToken(Base):
    __tablename__ = "invite_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    used_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    used_at = Column(DateTime, nullable=True)


# ---------------------------------------------------------------------------
# Google Calendar OAuth token
# ---------------------------------------------------------------------------

class OAuthState(Base):
    """Short-lived record tying an in-flight OAuth `state` back to the user who
    started the flow (+ the PKCE verifier). Persisted in the DB rather than in
    process memory so a server restart between /connect and /callback — routine
    on Render's free tier — doesn't drop the pending login. Rows are one-time use
    and reaped after a few minutes."""
    __tablename__ = "oauth_states"

    state = Column(String(64), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    verifier = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)


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


# ---------------------------------------------------------------------------
# Weekly Snapshot (Phase 6 — PID nudge system)
# ---------------------------------------------------------------------------

class WeeklySnapshot(Base):
    __tablename__ = "weekly_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    week_start = Column(Date, nullable=False, index=True)

    avg_sleep = Column(Float, nullable=True)
    avg_meals = Column(Float, nullable=True)
    exercise_days = Column(Integer, nullable=True)
    check_in_days = Column(Integer, nullable=True)
    weekdays_in_period = Column(Integer, nullable=True)
    tasks_completed = Column(Integer, nullable=True)
    tasks_pushed = Column(Integer, nullable=True)
    stalled_projects = Column(Text, nullable=True)
    overall_capacity_avg = Column(Float, nullable=True)
    pid_state = Column(Text, nullable=True)
    computed_at = Column(DateTime, default=utcnow)


# ---------------------------------------------------------------------------
# Nudge Log (Phase 6 — tracks delivered nudges + user responses)
# ---------------------------------------------------------------------------

class NudgeLog(Base):
    __tablename__ = "nudge_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    nudge_type = Column(String(20), nullable=False)
    variable = Column(String(30), nullable=False)
    message = Column(Text, nullable=True)
    shown_at = Column(DateTime, default=utcnow, index=True)
    response = Column(String(20), nullable=True)
    response_at = Column(DateTime, nullable=True)
