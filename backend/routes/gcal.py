"""
Google Calendar integration.

Setup (one-time):
  1. Go to https://console.cloud.google.com
  2. Create a project, enable "Google Calendar API"
  3. OAuth 2.0 → Create credentials → Web application
  4. Add redirect URI: http://localhost:8000/gcal/callback  (+ your prod URL)
  5. Copy Client ID and Client Secret into .env:
       GOOGLE_CLIENT_ID=...
       GOOGLE_CLIENT_SECRET=...
       GOOGLE_REDIRECT_URI=http://localhost:8000/gcal/callback

  Then install: pip install google-auth-oauthlib google-api-python-client
"""

import os
import json
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from zoneinfo import ZoneInfo
from database import get_db
from models import GoogleCalendarToken, Task, TaskStatus, TaskType, User, utcnow
from routes.auth import get_current_user

router = APIRouter()

SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]

# Temporary in-memory store for PKCE code verifiers (connect → callback window)
_code_verifiers: dict[str, str] = {}


def _env(key):
    v = os.getenv(key, "")
    return v.strip()

def _gcal_available():
    return _env("GOOGLE_CLIENT_ID") and _env("GOOGLE_CLIENT_SECRET") and _env("GOOGLE_REDIRECT_URI")


def _build_flow():
    from google_auth_oauthlib.flow import Flow
    redirect_uri = _env("GOOGLE_REDIRECT_URI")
    return Flow.from_client_config(
        {
            "web": {
                "client_id":     _env("GOOGLE_CLIENT_ID"),
                "client_secret": _env("GOOGLE_CLIENT_SECRET"),
                "auth_uri":      "https://accounts.google.com/o/oauth2/auth",
                "token_uri":     "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect_uri],
            }
        },
        scopes=SCOPES,
        redirect_uri=redirect_uri,
    )


def _get_service(token_row: GoogleCalendarToken):
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    creds = Credentials(
        token=token_row.access_token,
        refresh_token=token_row.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
        scopes=SCOPES,
    )
    return build("calendar", "v3", credentials=creds)


# ── OAuth flow ────────────────────────────────────────────────────────────────

@router.get("/gcal/debug")
def gcal_debug():
    """Temporary: shows the exact authorization URL sent to Google."""
    result = {
        "redirect_uri": _env("GOOGLE_REDIRECT_URI"),
        "client_id_prefix": _env("GOOGLE_CLIENT_ID")[:20] + "...",
        "configured": bool(_gcal_available()),
    }
    if _gcal_available():
        try:
            flow = _build_flow()
            url, _ = flow.authorization_url(access_type="offline", state="debug")
            result["auth_url"] = url
        except Exception as e:
            result["auth_url_error"] = str(e)
    return result


@router.get("/gcal/status")
def gcal_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _gcal_available():
        return {"connected": False, "configured": False}
    token = db.query(GoogleCalendarToken).filter(
        GoogleCalendarToken.user_id == current_user.id
    ).first()
    selected_ids = []
    if token and token.calendar_ids:
        try:
            selected_ids = json.loads(token.calendar_ids)
        except Exception:
            pass
    return {
        "connected":           token is not None,
        "configured":          True,
        "last_synced":         token.last_synced.isoformat() if token and token.last_synced else None,
        "selected_calendar_ids": selected_ids,
    }


@router.get("/gcal/connect")
def gcal_connect(
    current_user: User = Depends(get_current_user),
):
    if not _gcal_available():
        raise HTTPException(status_code=503, detail="Google Calendar not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI to .env")
    flow = _build_flow()
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=str(current_user.id),
    )
    # Persist PKCE code verifier if the library generated one
    verifier = getattr(flow, "code_verifier", None) or getattr(
        getattr(flow, "oauth2session", None), "_code_verifier", None
    )
    if verifier:
        _code_verifiers[str(current_user.id)] = verifier
    return {"auth_url": auth_url}


@router.get("/gcal/callback")
def gcal_callback(
    code: str,
    state: str,
    db: Session = Depends(get_db),
):
    if not _gcal_available():
        raise HTTPException(status_code=503, detail="Google Calendar not configured")
    try:
        flow = _build_flow()
        verifier = _code_verifiers.pop(state, None)
        fetch_kwargs = {"code": code}
        if verifier:
            fetch_kwargs["code_verifier"] = verifier
        flow.fetch_token(**fetch_kwargs)
        creds = flow.credentials

        user_id = int(state)
        token = db.query(GoogleCalendarToken).filter(
            GoogleCalendarToken.user_id == user_id
        ).first()

        expiry = None
        if creds.expiry:
            expiry = creds.expiry.replace(tzinfo=None) if creds.expiry.tzinfo else creds.expiry

        if token:
            token.access_token  = creds.token
            token.refresh_token = creds.refresh_token or token.refresh_token
            token.token_expiry  = expiry
        else:
            token = GoogleCalendarToken(
                user_id=user_id,
                access_token=creds.token,
                refresh_token=creds.refresh_token,
                token_expiry=expiry,
            )
            db.add(token)

        db.commit()

        frontend = os.getenv("FRONTEND_URL", "http://localhost:5173")
        return RedirectResponse(url=f"{frontend}?gcal=connected")

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"OAuth error: {e}")


@router.delete("/gcal/disconnect")
def gcal_disconnect(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(GoogleCalendarToken).filter(
        GoogleCalendarToken.user_id == current_user.id
    ).delete()
    db.commit()
    return {"ok": True}


# ── Calendar sync ─────────────────────────────────────────────────────────────

def sync_today_events(user_id: int, db: Session) -> dict:
    """Pull today's Google Calendar events and create appointment Tasks.
    Returns dict: {created, calendars_queried, events_found}. Idempotent — skips duplicates."""
    token = db.query(GoogleCalendarToken).filter(
        GoogleCalendarToken.user_id == user_id
    ).first()
    if not token:
        return {"created": 0, "calendars_queried": [], "events_found": 0}

    try:
        from models import User as _User
        user = db.query(_User).filter(_User.id == user_id).first()
        tz_name = getattr(user, "timezone", None) or "America/Los_Angeles"
        tz = ZoneInfo(tz_name)
        now_local = datetime.now(tz)
        today = now_local.date()
        # Sync window: midnight to 23:59:59 in user's local timezone
        time_min = datetime(today.year, today.month, today.day, 0, 0, 0, tzinfo=tz).isoformat()
        time_max = datetime(today.year, today.month, today.day, 23, 59, 59, tzinfo=tz).isoformat()

        # Sync primary calendar + any stored calendar IDs
        cal_ids = ["primary"]
        if token.calendar_ids:
            try:
                extra = json.loads(token.calendar_ids)
                cal_ids = list(set(cal_ids + extra))
            except Exception:
                pass

        service = _get_service(token)
        created = 0
        events_found = 0
        calendars_queried = []
        for cal_id in cal_ids:
            try:
                result = service.events().list(
                    calendarId=cal_id,
                    timeMin=time_min,
                    timeMax=time_max,
                    singleEvents=True,
                    orderBy="startTime",
                ).execute()
                calendars_queried.append(cal_id)
                events_found += len(result.get("items", []))
            except Exception:
                continue

            for event in result.get("items", []):
                summary = event.get("summary", "").strip()
                if not summary:
                    continue

                # Skip all-day events with no time (optional: import them anyway)
                start = event.get("start", {})
                start_dt_str = start.get("dateTime")  # has time
                start_date_str = start.get("date")     # all-day

                if start_dt_str:
                    from datetime import datetime as DT
                    # Parse ISO 8601 with tz offset
                    try:
                        dt = DT.fromisoformat(start_dt_str)
                        due_date = dt.date()
                        due_time = dt.strftime("%H:%M")
                    except Exception:
                        due_date = today
                        due_time = None
                else:
                    due_date = today
                    due_time = None

                location = event.get("location", "").strip() or None
                description = event.get("description", "").strip() or None
                gcal_id = event.get("id", "")

                # Dedup: match on title + due_date. If found, repair scheduled_date
                # in case it was created with wrong UTC date from old sync bug.
                existing = db.query(Task).filter(
                    Task.owner_id == user_id,
                    Task.task_type == TaskType.appointment,
                    Task.title == summary,
                    Task.due_date == due_date,
                    Task.status != TaskStatus.deleted,
                ).first()

                correct_scheduled = datetime(today.year, today.month, today.day)
                if existing:
                    if existing.scheduled_date != correct_scheduled:
                        existing.scheduled_date = correct_scheduled
                        existing.status = TaskStatus.today
                    continue

                task = Task(
                    owner_id=user_id,
                    title=summary,
                    notes=description,
                    task_type=TaskType.appointment,
                    status=TaskStatus.today,
                    due_date=due_date,
                    due_time=due_time,
                    location_detail=location,
                    scheduled_date=datetime(today.year, today.month, today.day),
                )
                db.add(task)
                created += 1

        if created:
            db.commit()

        token.last_synced = utcnow()
        db.commit()
        return {"created": created, "calendars_queried": calendars_queried, "events_found": events_found}

    except Exception as e:
        print(f"gcal sync error for user {user_id}: {e}")
        raise  # re-raise so manual_sync can surface the error


@router.post("/gcal/sync")
def manual_sync(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        result = sync_today_events(current_user.id, db)
        return {**result, "error": None}
    except Exception as e:
        return {"created": 0, "calendars_queried": [], "events_found": 0, "error": str(e)}


@router.get("/gcal/calendars")
def list_calendars(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    token = db.query(GoogleCalendarToken).filter(
        GoogleCalendarToken.user_id == current_user.id
    ).first()
    if not token:
        raise HTTPException(status_code=404, detail="Not connected")
    try:
        service = _get_service(token)
        result = service.calendarList().list().execute()
        return [
            {"id": c["id"], "name": c.get("summary", c["id"])}
            for c in result.get("items", [])
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


from pydantic import BaseModel as _BM

class CalendarSelection(_BM):
    calendar_ids: list[str]

@router.patch("/gcal/calendars")
def update_calendars(
    body: CalendarSelection,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    token = db.query(GoogleCalendarToken).filter(
        GoogleCalendarToken.user_id == current_user.id
    ).first()
    if not token:
        raise HTTPException(status_code=404, detail="Not connected")
    # Store non-primary IDs; primary is always synced implicitly
    ids = [i for i in body.calendar_ids if i != "primary"]
    token.calendar_ids = json.dumps(ids)
    db.commit()
    return {"ok": True, "calendar_ids": ids}
