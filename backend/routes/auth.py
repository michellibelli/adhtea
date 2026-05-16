import secrets
import bcrypt
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
from models import (
    User, SessionToken, ActuatorCategory, InviteToken, SiteConfig, UserRole, utcnow,
    Task, Routine, Project, TaskType, TaskStatus, TaskWeight, RoutineFrequency, TimeOfDay,
)
from schemas import (
    LoginRequest, LoginResponse, SetupRequest, UserResponse, UserSettingsUpdate,
    UserCreate, UserListItem, RegisterRequest, InviteResponse,
    SignupRequest, AlphaChallengeRequest, AlphaCodeUpdate,
)

router = APIRouter()
security = HTTPBearer()

# How long a login session stays valid before the user must log in again
TOKEN_EXPIRY_DAYS = 30


def _get_or_init_config(db: Session) -> SiteConfig:
    """Fetch the single site-wide config row, creating it if it doesn't exist yet."""
    config = db.query(SiteConfig).first()
    if not config:
        config = SiteConfig()
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


def _make_session(user_id: int, db: Session) -> str:
    """Create a new auth token for user_id, store it in the DB, and return the token string.

    The token is a 64-character random hex string (32 bytes of entropy).
    It expires after TOKEN_EXPIRY_DAYS days. The frontend stores it in localStorage
    and sends it as a Bearer token on every API request.
    """
    token_str = secrets.token_hex(32)
    expires = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=TOKEN_EXPIRY_DAYS)
    db.add(SessionToken(user_id=user_id, token=token_str, expires_at=expires))
    return token_str

PRESET_ACTUATORS = [
    {"name": "Engineering", "description": "Technical problem solving, building, and systems thinking."},
    {"name": "Parenting", "description": "Active engagement with the kids — logistics, school, appointments, play."},
    {"name": "Social", "description": "Friendships, community connection, conversations outside the family."},
    {"name": "Romantic", "description": "Intimate relationship investment and connection."},
    {"name": "Community", "description": "Contribution beyond the immediate family — neighbors, causes, groups."},
    {"name": "Artistic", "description": "Creative expression; making things for their own sake."},
    {"name": "Self Care", "description": "Rest, maintenance, and restoration of the self."},
]


# ---------------------------------------------------------------------------
# Dependency: get current user from bearer token
# ---------------------------------------------------------------------------

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    token_str = credentials.credentials
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    session = (
        db.query(SessionToken)
        .filter(SessionToken.token == token_str, SessionToken.expires_at > now)
        .first()
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
    return session.user


# ---------------------------------------------------------------------------
# Setup — create the primary account (only works if no users exist)
# ---------------------------------------------------------------------------

@router.get("/setup-needed")
def setup_needed(db: Session = Depends(get_db)):
    return {"needed": db.query(User).first() is None}


@router.post("/setup", response_model=LoginResponse)
def setup(req: SetupRequest, db: Session = Depends(get_db)):
    existing = db.query(User).first()
    if existing:
        raise HTTPException(status_code=400, detail="Setup already complete")

    hashed = bcrypt.hashpw(req.password.encode(), bcrypt.gensalt()).decode()
    config = _get_or_init_config(db)
    user = User(
        name=req.name,
        username=req.username.lower().strip(),
        hashed_password=hashed,
        role=UserRole.primary,
        is_owner=True,
        alpha_code_version=config.alpha_code_version,
    )
    db.add(user)
    db.flush()  # get user.id

    # Seed preset actuator categories
    for p in PRESET_ACTUATORS:
        db.add(ActuatorCategory(
            user_id=user.id,
            name=p["name"],
            description=p["description"],
            is_preset=True,
        ))

    token_str = _make_session(user.id, db)
    db.commit()

    return LoginResponse(
        token=token_str,
        user_id=user.id,
        name=user.name,
        role=user.role,
        task_visible_limit=user.task_visible_limit,
    )


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username.lower().strip()).first()
    if not user or not bcrypt.checkpw(req.password.encode(), user.hashed_password.encode()):
        raise HTTPException(status_code=401, detail="Could not sign in")

    token_str = secrets.token_hex(32)
    expires = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=TOKEN_EXPIRY_DAYS)
    session = SessionToken(user_id=user.id, token=token_str, expires_at=expires)
    db.add(session)
    db.commit()

    return LoginResponse(
        token=token_str,
        user_id=user.id,
        name=user.name,
        role=user.role,
        task_visible_limit=user.task_visible_limit,
    )


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------

@router.post("/logout")
def logout(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    token_str = credentials.credentials
    session = db.query(SessionToken).filter(SessionToken.token == token_str).first()
    if session:
        db.delete(session)
        db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Me — current user profile + settings
# ---------------------------------------------------------------------------

@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    config = _get_or_init_config(db)
    needs_challenge = (
        config.alpha_code is not None
        and not current_user.is_owner
        and current_user.alpha_code_version != config.alpha_code_version
    )
    # Build response through the UserResponse schema instead of dumping every ORM
    # column. If a sensitive field like hashed_password is ever added to the User
    # model, this approach guarantees it can't accidentally leak to the client —
    # only fields explicitly declared in UserResponse are returned.
    response = UserResponse.model_validate(current_user).model_dump()
    response["needs_alpha_challenge"] = needs_challenge
    return response


@router.patch("/me/settings", response_model=UserResponse)
def update_settings(
    update: UserSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if update.task_visible_limit is not None:
        if not (1 <= update.task_visible_limit <= 50):
            raise HTTPException(status_code=400, detail="task_visible_limit must be between 1 and 50")
        current_user.task_visible_limit = update.task_visible_limit
    if update.notification_morning is not None:
        current_user.notification_morning = update.notification_morning
    if update.notification_evening is not None:
        current_user.notification_evening = update.notification_evening
    if update.triage_start_hour is not None:
        current_user.triage_start_hour = update.triage_start_hour
    if update.triage_end_hour is not None:
        current_user.triage_end_hour = update.triage_end_hour
    if update.timezone is not None:
        try:
            from zoneinfo import ZoneInfo as _ZI
            _ZI(update.timezone)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid timezone")
        current_user.timezone = update.timezone
    if update.day_start_hour is not None:
        if not (0 <= update.day_start_hour <= 11):
            raise HTTPException(status_code=400, detail="day_start_hour must be between 0 and 11")
        current_user.day_start_hour = update.day_start_hour
    if update.max_tasks_per_day is not None:
        if not (5 <= update.max_tasks_per_day <= 15):
            raise HTTPException(status_code=400, detail="max_tasks_per_day must be between 5 and 15")
        current_user.max_tasks_per_day = update.max_tasks_per_day
    if update.max_total_per_day is not None:
        if not (10 <= update.max_total_per_day <= 20):
            raise HTTPException(status_code=400, detail="max_total_per_day must be between 10 and 20")
        current_user.max_total_per_day = update.max_total_per_day
    db.commit()
    db.refresh(current_user)
    return current_user


# ---------------------------------------------------------------------------
# Admin: user management (primary role only)
# ---------------------------------------------------------------------------

def require_primary(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.primary:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.get("/users", response_model=list[UserListItem])
def list_users(
    admin: User = Depends(require_primary),
    db: Session = Depends(get_db),
):
    return db.query(User).order_by(User.created_at).all()


@router.post("/users", response_model=UserListItem, status_code=201)
def create_user(
    req: UserCreate,
    admin: User = Depends(require_primary),
    db: Session = Depends(get_db),
):
    if db.query(User).count() >= 20:
        raise HTTPException(status_code=400, detail="User limit reached (20)")
    username = req.username.lower().strip()
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    hashed = bcrypt.hashpw(req.password.encode(), bcrypt.gensalt()).decode()
    user = User(
        name=req.name,
        username=username,
        hashed_password=hashed,
        role=UserRole.primary,
    )
    db.add(user)
    db.flush()
    for p in PRESET_ACTUATORS:
        db.add(ActuatorCategory(
            user_id=user.id,
            name=p["name"],
            description=p["description"],
            is_preset=True,
        ))
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    admin: User = Depends(require_primary),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()


# ---------------------------------------------------------------------------
# Invite links (primary only generates; anyone can register with valid token)
# ---------------------------------------------------------------------------

@router.post("/invites", response_model=InviteResponse, status_code=201)
def create_invite(
    admin: User = Depends(require_primary),
    db: Session = Depends(get_db),
):
    token_str = secrets.token_urlsafe(24)
    invite = InviteToken(token=token_str, created_by=admin.id)
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


@router.get("/invites", response_model=list[InviteResponse])
def list_invites(
    admin: User = Depends(require_primary),
    db: Session = Depends(get_db),
):
    return db.query(InviteToken).filter(InviteToken.used_by == None).order_by(InviteToken.created_at.desc()).all()  # noqa: E711


@router.delete("/invites/{token}", status_code=204)
def revoke_invite(
    token: str,
    admin: User = Depends(require_primary),
    db: Session = Depends(get_db),
):
    invite = db.query(InviteToken).filter(InviteToken.token == token, InviteToken.used_by == None).first()  # noqa: E711
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    db.delete(invite)
    db.commit()


@router.post("/register", response_model=LoginResponse, status_code=201)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    invite = db.query(InviteToken).filter(
        InviteToken.token == req.invite_token,
        InviteToken.used_by == None,  # noqa: E711
    ).first()
    if not invite:
        raise HTTPException(status_code=400, detail="Invalid or already-used invite link")
    if db.query(User).count() >= 20:
        raise HTTPException(status_code=400, detail="User limit reached")
    username = req.username.lower().strip()
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    hashed = bcrypt.hashpw(req.password.encode(), bcrypt.gensalt()).decode()
    user = User(name=req.name, username=username, hashed_password=hashed, role=UserRole.primary)
    db.add(user)
    db.flush()
    for p in PRESET_ACTUATORS:
        db.add(ActuatorCategory(user_id=user.id, name=p["name"], description=p["description"], is_preset=True))
    invite.used_by = user.id
    invite.used_at = datetime.now(timezone.utc).replace(tzinfo=None)
    token_str = secrets.token_hex(32)
    expires = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=TOKEN_EXPIRY_DAYS)
    session = SessionToken(user_id=user.id, token=token_str, expires_at=expires)
    db.add(session)
    db.commit()
    return LoginResponse(token=token_str, user_id=user.id, name=user.name, role=user.role, task_visible_limit=user.task_visible_limit)


# ---------------------------------------------------------------------------
# Open signup (alpha-code gated)
# ---------------------------------------------------------------------------

@router.get("/signup-config")
def signup_config(db: Session = Depends(get_db)):
    config = _get_or_init_config(db)
    return {"alpha_code_required": config.alpha_code is not None}


@router.post("/signup", response_model=LoginResponse, status_code=201)
def signup(req: SignupRequest, db: Session = Depends(get_db)):
    config = _get_or_init_config(db)
    if config.alpha_code is not None:
        if not req.alpha_code or req.alpha_code.strip() != config.alpha_code:
            raise HTTPException(status_code=400, detail="Invalid alpha code")
    if db.query(User).count() >= 20:
        raise HTTPException(status_code=400, detail="User limit reached")
    username = req.username.lower().strip()
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    hashed = bcrypt.hashpw(req.password.encode(), bcrypt.gensalt()).decode()
    user = User(
        name=req.name,
        username=username,
        email=req.email,
        hashed_password=hashed,
        role=UserRole.primary,
        alpha_code_version=config.alpha_code_version,
    )
    db.add(user)
    db.flush()
    for p in PRESET_ACTUATORS:
        db.add(ActuatorCategory(user_id=user.id, name=p["name"], description=p["description"], is_preset=True))
    token_str = _make_session(user.id, db)
    db.commit()
    return LoginResponse(token=token_str, user_id=user.id, name=user.name, role=user.role, task_visible_limit=user.task_visible_limit)


# ---------------------------------------------------------------------------
# Alpha challenge — shown to existing users when code rotates
# ---------------------------------------------------------------------------

@router.post("/alpha-challenge")
def alpha_challenge(
    req: AlphaChallengeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    config = _get_or_init_config(db)
    if config.alpha_code is None or req.alpha_code.strip() != config.alpha_code:
        raise HTTPException(status_code=400, detail="Invalid alpha code")
    current_user.alpha_code_version = config.alpha_code_version
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Alpha code management (owner only)
# ---------------------------------------------------------------------------

def require_owner(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_owner:
        raise HTTPException(status_code=403, detail="Owner access required")
    return current_user


@router.get("/alpha-code")
def get_alpha_code(owner: User = Depends(require_owner), db: Session = Depends(get_db)):
    config = _get_or_init_config(db)
    return {"alpha_code": config.alpha_code}


@router.patch("/alpha-code")
def set_alpha_code(
    req: AlphaCodeUpdate,
    owner: User = Depends(require_owner),
    db: Session = Depends(get_db),
):
    config = _get_or_init_config(db)
    config.alpha_code = req.alpha_code.strip() or None
    config.alpha_code_version += 1
    # Bump owner's version so they aren't challenged
    owner.alpha_code_version = config.alpha_code_version
    db.commit()
    return {"ok": True, "alpha_code_version": config.alpha_code_version}


# ---------------------------------------------------------------------------
# Onboarding — seed tutorial data for new users
# ---------------------------------------------------------------------------

@router.post("/onboard/seed")
def onboard_seed(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.is_onboarded:
        return {"ok": True, "skipped": True}

    # Task: Log in (completeable immediately)
    db.add(Task(
        owner_id=current_user.id,
        title="Log in ✓",
        task_type=TaskType.task,
        status=TaskStatus.today,
        notes="You made it! Tap the checkmark to complete this one right now.",
        weight=TaskWeight.light,
    ))

    # Routine: 15 min self-care daily
    db.add(Routine(
        user_id=current_user.id,
        title="15 minutes of self-care",
        frequency=RoutineFrequency.daily,
        time_of_day=TimeOfDay.anytime,
        active=True,
    ))

    # Task: Schedule the routine
    db.add(Task(
        owner_id=current_user.id,
        title="Schedule your daily self-care routine",
        task_type=TaskType.task,
        status=TaskStatus.today,
        notes="Go to Routines (moon icon) to set a time for your 15-min self-care. Even a small daily ritual makes a big difference.",
        weight=TaskWeight.light,
    ))

    # Project: Spill the tea babe
    project = Project(
        user_id=current_user.id,
        title="Spill the tea babe 🍵",
        description="Your getting-started adventure. Work through these to explore how adhTea works.",
        status="active",
    )
    db.add(project)
    db.flush()

    # Subtask 1: What do you want to get done tomorrow?
    db.add(Task(
        owner_id=current_user.id,
        project_id=project.id,
        title="What do you want to get done tomorrow?",
        task_type=TaskType.task,
        status=TaskStatus.today,
        notes="Tap '+ Task 🛠️' on the Projects page to add tasks here. One thing you want to tackle tomorrow is enough.",
        weight=TaskWeight.light,
    ))

    # Subtask 2: What's your morning routine?
    db.add(Task(
        owner_id=current_user.id,
        project_id=project.id,
        title="What's your morning routine?",
        task_type=TaskType.task,
        status=TaskStatus.today,
        notes="Go to Routines (moon icon) and tap '+ Routine' to build your morning ritual. Once added, tap 'Schedule' to lock it into your day.",
        weight=TaskWeight.light,
    ))

    # Task: Log first morning check-in
    db.add(Task(
        owner_id=current_user.id,
        title="Log your first morning check-in",
        task_type=TaskType.task,
        status=TaskStatus.today,
        notes="Head to the Log page (heart icon) and tap 'Check in ✏️' to record how you're doing today.",
        weight=TaskWeight.light,
    ))

    current_user.is_onboarded = True
    db.commit()
    return {"ok": True}
