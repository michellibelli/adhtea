from datetime import datetime, date
from typing import Optional, Annotated
from pydantic import BaseModel, Field

Password = Annotated[str, Field(min_length=8, max_length=128)]
from models import (
    UserRole, TaskType, TaskStatus, Priority,
    Desire, Effort, RoutineFrequency, TimeOfDay, LocationType
)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    expires_at: datetime   # UTC; the client re-prompts at this moment instead of waiting for a 401
    user_id: int
    name: str
    role: UserRole
    task_visible_limit: int


class SetupRequest(BaseModel):
    name: str
    username: str
    password: Password


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    name: str
    username: str
    password: Password


class RegisterRequest(BaseModel):
    invite_token: str
    name: str
    username: str
    password: Password


class InviteResponse(BaseModel):
    token: str
    created_at: datetime

    model_config = {"from_attributes": True}


class UserListItem(BaseModel):
    id: int
    name: str
    username: str
    role: UserRole
    created_at: datetime

    model_config = {"from_attributes": True}


class UserSettingsUpdate(BaseModel):
    task_visible_limit: Optional[int] = None
    notification_morning: Optional[str] = None
    notification_evening: Optional[str] = None
    triage_start_hour: Optional[int] = None
    triage_end_hour: Optional[int] = None
    timezone: Optional[str] = None
    day_start_hour: Optional[int] = None


class SignupRequest(BaseModel):
    name: str
    username: str
    email: Optional[str] = None
    password: Password
    alpha_code: Optional[str] = None


class AlphaChallengeRequest(BaseModel):
    alpha_code: str


class AlphaCodeUpdate(BaseModel):
    alpha_code: str


class UserResponse(BaseModel):
    id: int
    name: str
    username: str
    email: Optional[str]
    role: UserRole
    is_owner: bool
    task_visible_limit: int
    notification_morning: str
    notification_evening: str
    triage_start_hour: int
    triage_end_hour: int
    timezone: str
    day_start_hour: int
    created_at: datetime
    needs_alpha_challenge: bool = False
    is_onboarded: bool = True
    day_planned: bool = False   # true once user hit "Start my day" this app-day
    box_manual: bool = False    # true once user hand-ordered the tea-box this app-day

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Actuator Category
# ---------------------------------------------------------------------------

class ActuatorCategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None    # required for custom, validated in route


class ActuatorCategoryResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    is_preset: bool

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Task
# ---------------------------------------------------------------------------

class TaskCreate(BaseModel):
    title: str
    notes: Optional[str] = None
    task_type: TaskType = TaskType.task
    actuator_category_id: Optional[int] = None
    project_id: Optional[int] = None
    is_critical: bool = False
    due_date: Optional[date] = None
    due_time: Optional[str] = None          # HH:MM
    location_type: Optional[LocationType] = None
    location_detail: Optional[str] = None
    tags: Optional[str] = None              # comma-separated


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    task_type: Optional[TaskType] = None
    status: Optional[TaskStatus] = None
    priority: Optional[Priority] = None
    desire: Optional[Desire] = None
    effort: Optional[Effort] = None
    scheduled_date: Optional[datetime] = None
    snooze_until: Optional[datetime] = None
    sort_order: Optional[float] = None
    actuator_category_id: Optional[int] = None
    is_critical: Optional[bool] = None
    due_date: Optional[date] = None
    due_time: Optional[str] = None
    location_type: Optional[LocationType] = None
    location_detail: Optional[str] = None
    tags: Optional[str] = None


class TaskSnoozeRequest(BaseModel):
    snooze_until: datetime


class ScheduleTodayRequest(BaseModel):
    """Optional priority fields — all optional so the endpoint works for both
    quick scheduling and scheduling with full metadata."""
    priority: Optional[Priority] = None
    desire:   Optional[Desire]   = None


class TaskResponse(BaseModel):
    id: int
    owner_id: int
    assigned_to_id: Optional[int]
    actuator_category_id: Optional[int]
    routine_id: Optional[int]
    project_id: Optional[int]
    project_name: Optional[str] = None
    title: str
    notes: Optional[str]
    task_type: TaskType
    status: TaskStatus
    priority: Optional[Priority]
    desire: Optional[Desire]
    effort: Optional[Effort]
    is_critical: bool
    due_date: Optional[date]
    due_time: Optional[str]
    location_type: Optional[LocationType]
    location_detail: Optional[str]
    tags: Optional[str]
    scheduled_date: Optional[datetime]
    snooze_until: Optional[datetime]
    sort_order: Optional[float]
    # Triage scoring (R1) — cached priority signal + explainable breakdown
    score: Optional[float] = None
    score_components: Optional[str] = None       # JSON string; UI parses for "Why this?"
    score_updated_at: Optional[datetime] = None
    push_count: int = 0
    pinned_for: Optional[date] = None
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TaskReorderRequest(BaseModel):
    ordered_ids: list[int]
    # Set by a tea-box drag. Stamps box_ordered_on, which puts the box and the
    # Focus card on the user's manual order for the rest of the app-day.
    manual_box: bool = False


# ---------------------------------------------------------------------------
# Routine
# ---------------------------------------------------------------------------

class RoutineCreate(BaseModel):
    title: str
    notes: Optional[str] = None
    frequency: RoutineFrequency = RoutineFrequency.daily
    time_of_day: TimeOfDay = TimeOfDay.anytime
    days_of_week: Optional[str] = None
    exact_time: Optional[str] = None        # HH:MM
    is_critical: bool = False
    only_when_present: bool = False


class RoutineUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    frequency: Optional[RoutineFrequency] = None
    time_of_day: Optional[TimeOfDay] = None
    days_of_week: Optional[str] = None
    exact_time: Optional[str] = None
    is_critical: Optional[bool] = None
    only_when_present: Optional[bool] = None
    active: Optional[bool] = None


class RoutineResponse(BaseModel):
    id: int
    user_id: int
    title: str
    notes: Optional[str]
    frequency: RoutineFrequency
    time_of_day: TimeOfDay
    days_of_week: Optional[str]
    exact_time: Optional[str]
    is_critical: bool
    only_when_present: bool
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Self-Care Log
# ---------------------------------------------------------------------------

class SelfCareLogCreate(BaseModel):
    log_date: Optional[date] = None       # defaults to today server-side
    sleep_hours: Optional[float] = None
    sleep_quality: Optional[int] = None   # 1–5
    meals: Optional[int] = None           # 0–4
    exercise: Optional[bool] = None
    exercise_minutes: Optional[int] = None
    medication_taken: Optional[bool] = None
    mood: Optional[int] = None            # 1–5
    notes: Optional[str] = None


class SelfCareLogResponse(BaseModel):
    id: int
    user_id: int
    log_date: date
    logged_at: datetime
    sleep_hours: Optional[float]
    sleep_quality: Optional[int]
    meals: Optional[int]
    exercise: Optional[bool]
    exercise_minutes: Optional[int]
    medication_taken: Optional[bool]
    mood: Optional[int]
    notes: Optional[str]

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Medication
# ---------------------------------------------------------------------------

class MedicationScheduleCreate(BaseModel):
    name: str
    reminder_times: Optional[str] = None   # "08:00,14:00"


class MedicationScheduleUpdate(BaseModel):
    name: Optional[str] = None
    reminder_times: Optional[str] = None
    active: Optional[bool] = None


class MedicationScheduleResponse(BaseModel):
    id: int
    user_id: int
    name: str
    reminder_times: Optional[str]
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MedicationLogResponse(BaseModel):
    id: int
    schedule_id: int
    user_id: int
    log_date: date
    taken_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Capacity Snapshot
# ---------------------------------------------------------------------------

class CapacitySnapshotResponse(BaseModel):
    id: int
    user_id: int
    log_date: date
    sleep_battery: float
    nutrition_battery: float
    physical_battery: float
    emotional_battery: float
    environment_battery: float
    executive_capacitor: float
    overall: float
    computed_at: datetime
    tier: str | None = None
    max_slots: int | None = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------

class ProjectCreate(BaseModel):
    title: str
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


class ProjectGenerateRequest(BaseModel):
    description: str


class ProjectTaskSummary(BaseModel):
    id: int
    title: str
    notes: Optional[str]
    effort: Optional[Effort]
    due_date: Optional[date]
    status: TaskStatus
    completed_at: Optional[datetime]
    project_id: Optional[int]

    model_config = {"from_attributes": True}


class ProjectResponse(BaseModel):
    id: int
    user_id: int
    title: str
    description: Optional[str]
    status: str
    created_at: datetime
    task_count: int
    done_count: int

    model_config = {"from_attributes": True}


class ProjectDetailResponse(BaseModel):
    id: int
    user_id: int
    title: str
    description: Optional[str]
    status: str
    created_at: datetime
    tasks: list[ProjectTaskSummary]

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Insights / PID Nudge (Phase 6)
# ---------------------------------------------------------------------------

class WeeklySnapshotResponse(BaseModel):
    id: int
    user_id: int
    week_start: date
    avg_sleep: Optional[float]
    avg_meals: Optional[float]
    exercise_days: Optional[int]
    check_in_days: Optional[int]
    weekdays_in_period: Optional[int]
    tasks_completed: Optional[int]
    tasks_pushed: Optional[int]
    stalled_projects: Optional[list[int]] = None
    overall_capacity_avg: Optional[float]
    pid_state: Optional[dict] = None
    computed_at: datetime
    insight_copy: Optional[str] = None

    model_config = {"from_attributes": True}


class NudgeResponse(BaseModel):
    id: int
    nudge_type: str
    variable: str
    message: str
    shown_at: datetime

    model_config = {"from_attributes": True}


class NudgeRespondRequest(BaseModel):
    response: str


# ---------------------------------------------------------------------------
# Morning Review (effort tagging of the prior day's finished tasks)
# ---------------------------------------------------------------------------

class ReviewTaskGuess(BaseModel):
    id: int
    title: str
    effort_guess: Effort


class ReviewPendingResponse(BaseModel):
    date: date                    # the app-day being reviewed
    greeting: str                 # sunny one-liner
    tasks: list[ReviewTaskGuess]


class ReviewCommitItem(BaseModel):
    id: int
    effort: Effort


class ReviewCommitRequest(BaseModel):
    date: date
    tasks: list[ReviewCommitItem]
