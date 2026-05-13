from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel
from models import (
    UserRole, TaskType, TaskStatus, Priority,
    Importance, Desire, TaskWeight, RoutineFrequency, TimeOfDay, LocationType
)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    user_id: int
    name: str
    role: UserRole
    task_visible_limit: int


class SetupRequest(BaseModel):
    name: str
    username: str
    password: str


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    name: str
    username: str
    password: str


class RegisterRequest(BaseModel):
    invite_token: str
    name: str
    username: str
    password: str


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


class SignupRequest(BaseModel):
    name: str
    username: str
    email: Optional[str] = None
    password: str
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
    created_at: datetime
    needs_alpha_challenge: bool = False

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
    importance: Optional[Importance] = None
    desire: Optional[Desire] = None
    weight: Optional[TaskWeight] = None
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
    """Optional priority fields set during triage — all optional so the
    endpoint works for both quick scheduling and triage with full metadata."""
    priority:   Optional[Priority]   = None
    importance: Optional[Importance] = None
    desire:     Optional[Desire]     = None
    weight:     Optional[TaskWeight] = None


class TaskResponse(BaseModel):
    id: int
    owner_id: int
    assigned_to_id: Optional[int]
    actuator_category_id: Optional[int]
    routine_id: Optional[int]
    project_id: Optional[int]
    title: str
    notes: Optional[str]
    task_type: TaskType
    status: TaskStatus
    priority: Optional[Priority]
    importance: Optional[Importance]
    desire: Optional[Desire]
    weight: TaskWeight
    is_critical: bool
    due_date: Optional[date]
    due_time: Optional[str]
    location_type: Optional[LocationType]
    location_detail: Optional[str]
    tags: Optional[str]
    scheduled_date: Optional[datetime]
    snooze_until: Optional[datetime]
    sort_order: Optional[float]
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TaskReorderRequest(BaseModel):
    ordered_ids: list[int]


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
    dose: Optional[str] = None
    reminder_times: Optional[str] = None   # "08:00,14:00"


class MedicationScheduleUpdate(BaseModel):
    name: Optional[str] = None
    dose: Optional[str] = None
    reminder_times: Optional[str] = None
    active: Optional[bool] = None


class MedicationScheduleResponse(BaseModel):
    id: int
    user_id: int
    name: str
    dose: Optional[str]
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
    weight: TaskWeight
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
