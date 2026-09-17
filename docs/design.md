# ARIA Design Document
## Adaptive Routine Intelligence Assistant — v2

*Last updated: 2026-05-07*

> **Historical vision doc — not current status.** The capacitor/battery model and the "who it
> serves" section below are still the honest reasoning behind the app (see PROJECT.md's design
> philosophy for the version that survived contact with real use). But specific mechanics
> interfaces — were deferred indefinitely or never built, and the capacity formula has been
> simplified since. For current architecture and status, read **`HANDOFF.md`**; for current design
> philosophy and the actual design system, read **`PROJECT.md`**.

---

## Vision

ARIA is a personal operating system for a family with ADHD. Its job is not to list tasks — it's to keep the foundation stable so that when high-stakes moments arrive, the energy and executive function needed to handle them is actually available.

The central insight is that ADHD executive function behaves more like a capacitor than a battery. When a circuit closes — a novel problem, an urgent deadline, something genuinely interesting — the capacitor dumps everything immediately, producing brilliant high-current output. But capacitors can't sustain a slow steady load. Routines need battery current: consistent, low-drama, available on demand. When the battery is low and only the capacitor is charged, the *desire* to do a routine can exist alongside the genuine *inability* to start it. ARIA models this honestly and works with it rather than against it.

Over time, ARIA learns which self-care actions recharge which power sources, and which actuators (the tasks and activities that convert stored energy into completed work) draw from which sources. The goal is not to optimize the user into a different kind of person. It's to help her understand her own circuit diagram and keep the lights on.

---

## Who It Serves

### the user / the user (Primary User)
- Adult with ADHD
- Strong at dynamic, high-stakes problem solving; struggles with routine and follow-through on mundane tasks
- The ADHD doom loop: side quests feel good → real stuff piles up → environment degrades → getting back on track costs more energy → side quests feel even better
- External structure works: work deadlines, kids counting on her, having company over
- Clean environment is a force multiplier — lowers activation energy for everything else
- Already has a working triage ritual at work; ARIA brings that home and makes it resilient
- Devices: phone (throughout the day), home PC, work PC
- Phone = capture and quick check-ins; PC = morning triage and planning

- Lives with the user ~90% of the time (~1 weekend/month with other parent)
- Has a phone; will have his own ARIA interface
- Same underlying power model as the user, but the surface is simpler
- Needs routine reminders; without them the compounding effect hits both of them

- No interface of her own — managed through the user's view
- Her schedule affects the user's available capacity and must be visible in load calculation

---

## Core Principles

### 1. Warm and forgiving, never clinical
The app feels like a calm, organized friend who knows your life. Missed routines are noted quietly, not highlighted with shame. Tone is always "here's where you are, here's what's next."

### 2. Trust in past-self
When the user sets up her list thoughtfully, she should be able to follow it on autopilot. Things don't disappear, snoozes actually work, priorities mean something.

### 3. Capture is zero friction
A thought that doesn't get captured immediately is lost. Getting something into ARIA from a phone should take seconds. Sorting happens at triage, not at capture. **However:** type-specific required fields are collected at capture time while motivation and memory are highest (due date for tasks, date+time for appointments, frequency+days for routines).

### 4. Snooze without guilt
Snoozed items come back at the right time. the user should never feel like she has to do something now or lose it forever.

### 5. Visible progress is motivating
Seeing the list get smaller through the day is a feature. Completion should feel good.

### 6. Load awareness over task count
ARIA knows the difference between a heavy day and a light one and communicates that clearly.

### 7. The model learns
Early versions make it easy to log. Later versions surface what the data means.

### 8. One thing at a time
The default home screen shows the single next task — not a list. One clear thing to do next reduces decision paralysis.

---

## The Power Model

### Power Sources

**Batteries** — slow to charge, steady output
- Sleep battery
- Nutrition battery
- Physical / exercise battery
- Emotional / social battery
- Environment battery (clean space, low clutter, good light)

**Capacitors** — charge quickly, discharge quickly, high peak output
- Executive function capacitor (novelty-fed)
- Creative capacitor
- Social energy capacitor

### Actuators
Preset categories (v1): Engineering, Parenting, Social, Romantic, Community, Artistic, Self Care.

Custom categories require a name + 2–3 sentence description of what energy it draws and produces. This friction is intentional.

### Capacity Model (v1 — rules-based)
Computed from SelfCareLog each time a log is submitted. Stored as CapacitySnapshot.

| Input | Source | Formula |
|-------|--------|---------|
| sleep_hours + sleep_quality | sleep_battery | min(hours/8, 1) × 100 × (0.6 + 0.4×quality/5) |
| meals | nutrition_battery | min(meals/4, 1) × 100 |
| exercise + exercise_minutes | physical_battery | 20 baseline; +up to 80 for ≥45 min |
| mood | emotional_battery | (mood−1)/4 × 100 |
| — | environment_battery | 60 (stable default until Phase 5) |
| sleep (non-linear) | executive_capacitor | 15/30/55/75/90 stepped by hour bucket, quality-adjusted |
| weighted average | overall | sleep×0.25 + nutrition×0.15 + physical×0.15 + emotional×0.20 + environment×0.10 + exec×0.15 |

---

## Core Features (as built)

### Capture
- Type picker: Task / Appointment / Routine / Note
- **Task:** title (req) + due date (req) + due time (opt) + notes (opt)
- **Appointment:** title (req) + date (req) + time (req) + location type (zoom/signal/phone/office/address/other, opt) + location detail (opt) + notes (opt)
- **Routine:** title (req) + frequency pills (daily/weekdays/weekends/weekly/custom, req) + day-circle picker (req for weekly/custom) + time-of-day (req) + exact time (opt) → creates Routine template, not a Task
- **Note:** title (req) + free-form tags (opt) + notes (opt)
- All items editable inline from any view (pencil icon → type-specific form)

### Focus View (default home screen)
- Single centered card showing the next task on today's list
- Sorted: appointments by due_time first, then by sort_order
- Actions: Done (complete), Snooze, Back to inbox
- Progress dots: how many tasks remain
- "See all →" link to full Today list
- Empty state: options to triage inbox or capture something new

### Morning Triage
- Triggers at 8 AM (configurable via triage_start_hour), stays active until done or skipped
- Live load indicator updates as items are scheduled
- **"Low focus →" skip button:** shows Critical List instead of Today
- Critical List: urgent tasks + today's appointments + is_critical routine instances
- User can mark routines as `is_critical` so they always surface on low-focus days
- Triage-complete state: transitions to Focus view

### Today's List
- Full list view, accessible from nav
- Sort controls: My order / Urgent first / Want to do
- Load bar (light/manageable/heavy/overloaded)
- CapacityBar (compact) above load bar
- Queued items hidden past visible_limit; revealed as items complete/snooze
- Done-today collapsible section at bottom
- Triage link in header

### Snooze System
- Snooze to: tonight / tomorrow / this weekend / next week / specific date
- Snoozed items in Waiting view, never in Today

### Routines
- Frequency: daily / weekdays / weekends / weekly / custom
- Time of day: morning / afternoon / evening / anytime
- Optional exact time (HH:MM)
- `is_critical` flag: always surfaces on low-focus Critical List
- Lazy daily instance generation: called on inbox/triage/today load
- Missed instances (prior days, untriaged): available at `/routines/missed`, not in normal inbox

### Self-Care Log (Foundation page)
- Daily upsert (one log per day per user)
- Fields: sleep hours, sleep quality (1–5), meals (0–4), exercise (bool + minutes), medication taken (bool), mood (1–5), notes
- Triggers CapacitySnapshot recomputation on submit
- CapacityBar: compact mode (overall + exec note) on Today/Triage; full mode (5 source bars) on Foundation page

### EOD Gate
- Triggers after 5 PM if no log submitted today
- **Only required field: mood emoji (1–5)**
- After submit: warm, positive, feminine daily summary showing tasks/routines/meds done + mood-aware encouragement
- "Skip for now" always available — user is never hard-blocked

### Medication Tracking
- Schedule: name, dose, reminder_times (CSV HH:MM)
- Log taken (idempotent per day)
- Visible on Foundation page

### Google Calendar Sync
- OAuth 2.0 integration (read-only calendar scope)
- Connect via Settings → Integrations → Google Calendar
- Lazy sync: runs on first inbox load each day if token exists
- Manual sync available in Settings
- Pulls today's events → creates appointment Tasks in Today list
- Dedup by title + due_date
- Requires env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `FRONTEND_URL`

### Import
- CSV import endpoint: auto-detects Notion export column names
- Recurring tasks in CSV → Routines; non-recurring → Tasks in inbox
- Skips completed (Done status) rows
- UI in Settings → Import section
- One-time Notion import already run: 112 tasks + 16 routines loaded

---

## User Flows

### Opening the App (Morning)
1. If hour ≥ triage_start_hour (8 AM) and triage not done today and inbox has items → Triage
2. Otherwise → Focus view (single next task card)

### Capture (any time)
1. Tap Capture in nav
2. Select type: Task / Appt / Routine / Note
3. Fill required fields for that type
4. Submit → Task lands in inbox (or Routine template created)

### Morning Triage
1. Review inbox items one by one
2. Schedule to today (with optional priority/weight), snooze, or delete
3. Load bar updates live
4. If overwhelmed: tap "Low focus →" → see Critical List
5. When done or "Done triaging" → Focus view

### Working Through the Day
1. Focus view shows next task
2. Mark done → animates out → next task appears
3. Snooze or defer without leaving the view
4. Full list always accessible via Today tab

### End of Day
1. After 5 PM: EOD gate if no log today
2. Tap mood emoji → submit
3. See warm daily summary (done count, routines, meds, encouragement)
4. Continue to app

---

## Data Model (current)

### User
```
id, name, username, hashed_password, role (primary|child)
parent_id (FK, for child accounts)
task_visible_limit (default 10)
notification_morning (HH:MM, default "08:00")
notification_evening (HH:MM, default "21:00")
triage_start_hour (default 8)
triage_end_hour (default 12)
```

### Task
```
id, owner_id, assigned_to_id, actuator_category_id, routine_id
title, notes, task_type (task|appointment|routine|note)
status (inbox|today|snoozed|done|deleted)
priority (urgent|high|normal|low)
importance (critical|high|normal|low)
desire (high|medium|low)
weight (light|medium|heavy)
is_critical (bool — always surface on low-focus list)
due_date (Date)
due_time (HH:MM string)
location_type (zoom|signal|phone|office|address|other)
location_detail (string)
tags (comma-separated string)
scheduled_date (DateTime)
snooze_until (DateTime)
sort_order (Float)
completed_at, created_at, updated_at
```

### Routine
```
id, user_id, title, notes
frequency (daily|weekdays|weekends|weekly|custom)
time_of_day (morning|afternoon|evening|anytime)
days_of_week (comma-separated 0=Mon…6=Sun)
exact_time (HH:MM)
is_critical (bool)
only_when_present (bool)
active (bool)
```

### SelfCareLog
```
id, user_id, log_date (Date), logged_at
sleep_hours, sleep_quality (1–5), meals (0–4)
exercise (bool), exercise_minutes
medication_taken (bool), mood (1–5), notes
```

### MedicationSchedule / MedicationLog
```
Schedule: id, user_id, name, dose, reminder_times (CSV), active
Log: id, schedule_id, user_id, log_date, taken_at
```

### CapacitySnapshot
```
id, user_id, log_date
sleep_battery, nutrition_battery, physical_battery
emotional_battery, environment_battery
executive_capacitor, overall
computed_at
```

### GoogleCalendarToken
```
id, user_id (unique), access_token, refresh_token
token_expiry, calendar_ids (JSON), last_synced
```

### ActuatorCategory
```
id, user_id, name, description, is_preset
```

---

## Technical Architecture

### Backend
- Python 3.14 / FastAPI / SQLAlchemy / SQLite (dev) → PostgreSQL (prod)
- Session token auth (30-day expiry, bearer tokens)
- Modular routes: auth, tasks, routines, selfcare, medication, gcal, import_csv
- Lazy pattern: carry-forward, snooze resolution, routine instance generation, gcal sync — all triggered on inbox/triage/today load, not cron

### Frontend
- React 19 / Vite / Tailwind CSS v4
- Single-file screen state in App.jsx (no router — simple enough for now)
- Pages: Login, Capture, Focus, Today, Triage, Inbox, Waiting, Routines, SelfCare, EODGate, Settings
- Components: TaskCard (with inline edit), TriageCard, CapacityBar, BottomNav, Card, Button, Input/Textarea, SnoozeSheet

### Navigation (BottomNav + desktop sidebar)
8 items: Capture | Now | Today | Inbox | Waiting | Routines | Log | Settings

### Deployment (Phase 7)
- Backend: Railway (Python + PostgreSQL)
- Frontend: Vercel (static build)
- Target: multi-device access (home PC + work PC + phone)
- HTTPS required

---

## Open Questions

3. **Snooze "when X happens"** — contextual snooze. Phase 3+ feature.
4. **Task weight estimation** — currently set by user during triage. Future: infer from history.
5. **BottomNav crowding** — 8 items is tight on mobile. Consider collapsing Waiting into Inbox or moving Settings to a swipe gesture. Revisit before Phase 7.
6. **Triage timing** — currently 8 AM–12 PM window, stays active until done. Should the window be configurable per-user in settings UI?
7. **Google Calendar multi-calendar** — currently syncs primary + any stored IDs. Need UI to let user pick which calendars to include (Settings → Integrations → Google Calendar → select calendars).

---

## Resolved

- ✅ Carry-forward: yesterday's incomplete Today items return to inbox automatically
- ✅ Low-focus day: triage skip → Critical List (system-generated, not user-editable)
- ✅ Critical routines: the user marks `is_critical` on a routine → always surfaces on low-focus list
- ✅ Routine capture: creates Routine template, not a Task
- ✅ Location on appointments: type dropdown + free text, no map picker
- ✅ Tags on notes: free-form comma-separated string
- ✅ EOD log gate: mood emoji required, rest optional, warm feminine summary on submit
- ✅ Visible task limit: default 10, configurable in user settings
- ✅ Actuator categories: preset list + custom creation requiring 2–3 sentence description
- ✅ Import from Notion: CSV import, 112 tasks + 16 routines already loaded
- ✅ Multi-device: Phase 7 deployment (Railway + Vercel), not Google Drive sync
