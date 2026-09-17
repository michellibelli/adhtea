from datetime import datetime, date
from typing import Optional, Annotated, Literal
from pydantic import BaseModel, Field

Password = Annotated[str, Field(min_length=8, max_length=128)]
from models import (
    UserRole, TaskType, TaskStatus, Priority,
    Desire, Effort, RoutineFrequency, LocationType
)

RoutineBucket = Literal["first", "morning", "midday", "afternoon"]
TaskDifficulty = Literal["easy", "hard"]


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
    medication_question_enabled: Optional[bool] = None


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
    medication_question_enabled: bool = True
    created_at: datetime
    needs_alpha_challenge: bool = False
    is_onboarded: bool = True
    day_planned: bool = False   # true once user hit "Start my day" this app-day
    box_manual: bool = False    # true once user hand-ordered the tea-box this app-day
    day_capacity_slots: Optional[int] = None  # tea-box size, snapshotted at Start my day

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
    is_critical: bool = False
    due_date: Optional[date] = None
    due_time: Optional[str] = None          # HH:MM
    tags: Optional[str] = None              # comma-separated
    is_work: Optional[bool] = None


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
    minutes_spent: Optional[int] = None
    is_work: Optional[bool] = None
    completed_retroactively: Optional[bool] = None


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
    title: str
    notes: Optional[str]
    task_type: TaskType
    status: TaskStatus
    priority: Optional[Priority]
    desire: Optional[Desire]
    effort: Optional[Effort]
    difficulty: Optional[TaskDifficulty]
    bucket: Optional[RoutineBucket]
    is_critical: bool
    due_date: Optional[date]
    due_time: Optional[str]
    location_type: Optional[LocationType]
    location_detail: Optional[str]
    tags: Optional[str]
    scheduled_date: Optional[datetime]
    snooze_until: Optional[datetime]
    sort_order: Optional[float]
    push_count: int = 0
    minutes_spent: Optional[int]
    is_work: Optional[bool]
    completed_retroactively: Optional[bool]
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
    bucket: RoutineBucket = "morning"
    days_of_week: Optional[str] = None
    exact_time: Optional[str] = None        # HH:MM
    is_critical: bool = False
    only_when_present: bool = False


class RoutineUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    frequency: Optional[RoutineFrequency] = None
    bucket: Optional[RoutineBucket] = None
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
    bucket: Optional[RoutineBucket]
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
# Insights — weekly PID snapshot
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
    overall_capacity_avg: Optional[float]
    pid_state: Optional[dict] = None
    computed_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Morning Review (effort tagging of the prior day's finished tasks)
# ---------------------------------------------------------------------------

class ReviewTaskGuess(BaseModel):
    id: int
    title: str


class ReviewPendingResponse(BaseModel):
    date: date                    # the app-day being reviewed
    greeting: str                 # sunny one-liner
    tasks: list[ReviewTaskGuess]
    routines_total: int = 0       # routine instances scheduled that day (0 = none scheduled)
    routines_done: int = 0        # of those, how many she finished


class ReviewCommitItem(BaseModel):
    """One row of the morning review.

    `done` defaults to True and that default is load-bearing: a pre-4.17.0
    `{id, effort}` payload may already be sitting in
    `localStorage.aria_pending_reviews`, and `commitReview` drops permanent 4xx
    without retrying — so a 422 here would silently discard a queued morning.
    `effort` is accepted but ignored (4.20.0 dropped the small/big gate — time
    at completion replaced it); kept optional rather than removed so an old
    queued `{id, effort}` payload still validates instead of 422ing forever.
    """
    id: int
    effort: Optional[Effort] = None
    done: bool = True


class ReviewAddedItem(BaseModel):
    """A task she did yesterday that was never in the app — logged now,
    backdated to the reviewed day, so it counts toward the day's output."""
    title: str


class ReviewCommitRequest(BaseModel):
    date: date
    tasks: list[ReviewCommitItem] = []
    added: list[ReviewAddedItem] = []
