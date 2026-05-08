# ARIA Build Phases

*Each phase is independently deployable and testable.*
*Last updated: 2026-05-07*

---

## Phase 1 — The Core Loop ✅ COMPLETE

**Goal:** the user can capture tasks and work through a daily list.

### Built
- FastAPI backend, React 19 frontend, SQLite DB
- Session token auth (30-day expiry)
- Quick Capture (text + type tag)
- Inbox, Today list (drag to reorder), Waiting (snoozed)
- Snooze system (tonight / tomorrow / this weekend / next week / specific date)
- Carry-forward: yesterday's incomplete Today items return to inbox on next open
- Time-of-day theming (dawn / morning / afternoon / evening)
- Responsive layout: phone-first, desktop sidebar

---

## Phase 2 — Morning Triage ✅ COMPLETE

**Goal:** Formalized morning ritual with calibrated daily load.

### Built
- Triage view: inbox items + routine instances + capacity bar
- Per-item actions: schedule today (with priority/weight/desire), snooze, delete
- Live load indicator: light / manageable / heavy / overloaded
- Overloaded prompt with dismiss
- **"Low focus →" skip button** → Critical List (urgent tasks + today's appointments + is_critical routines)
- Triage-complete state → transitions to Focus view
- `wasTriageDoneToday()` localStorage flag; resets at midnight
- Triage triggers at 8 AM (configurable), stays active all day until done/skipped

---

## Phase 3 — Foundation Tracking ✅ COMPLETE

**Goal:** Routines, self-care logging, medication, capacity model.

### Built

**Routines**
- Create/edit/deactivate via Routines page
- Frequency: daily / weekdays / weekends / weekly / custom
- Time of day: morning / afternoon / evening / anytime
- Exact time (optional HH:MM)
- `is_critical` flag (always surfaces on low-focus Critical List)
- Lazy daily instance generation (called on inbox/triage/today load)
- Missed instances available at `/routines/missed`, not cluttering inbox
- 16 routines imported from Notion

**Self-Care (Foundation page)**
- Daily log: sleep hours/quality, meals, exercise/minutes, medication, mood, notes
- One log per day per user (upsert)
- Triggers CapacitySnapshot recomputation
- CapacityBar: compact mode on Today/Triage, full mode on Foundation page
- Rules-based capacity model (see design.md for formula)

**Medication**
- Configure: name, dose, reminder times
- Log taken (idempotent per day)
- Visible on Foundation page alongside self-care log

**EOD Gate**
- Triggers after 5 PM if no log today
- Required: mood emoji only (1–5)
- Submit → warm, positive, feminine daily summary (tasks/routines/meds done + encouragement)
- "Skip for now" always available

**New Task Fields (added for Phase 3)**
- `due_date`, `due_time`, `location_type`, `location_detail`, `tags`, `is_critical`

---

## Phase 3.5 — Capture Overhaul + Focus View ✅ COMPLETE

*Not in original plan — added based on user feedback.*

### Built

**Capture rewrite**
- Type-specific required fields collected at capture time
- Task → due date required
- Appointment → date + time required, location type + detail optional
- Routine → frequency + time-of-day required, days required for weekly/custom → calls `createRoutine`, not `createTask`
- Note → free-form tags optional
- All items have inline edit from any view (pencil icon → type-appropriate form)

**Focus View (new default home screen)**
- Single centered card: next task on today's list
- Appointments sorted by due_time, then by sort_order
- Actions: Done, Snooze, Back to inbox
- Progress dots showing remaining count
- "See all →" to full Today list
- Empty state: triage or capture options

**Critical List (triage skip)**
- Auto-generated: urgent priority tasks + today's appointments + is_critical routine instances
- Completeable directly from the list
- Accessible via "Low focus →" on Triage, or when triage is skipped

**TaskCard inline edit**
- Pencil icon on every card
- Expands inline form with type-appropriate fields
- Saves via PATCH /tasks/{id}, updates card in place

**Google Calendar integration**
- Full OAuth 2.0 flow (read-only)
- Connect via Settings → Integrations
- Lazy morning sync on inbox load
- Manual sync available
- Pulls today's events → appointment Tasks in Today list
- Dedup by title + date
- Requires Google Cloud credentials in .env (see .env.example)

**Settings page**
- Google Calendar connect / disconnect / sync-now
- CSV import UI

**Notion import (one-time, already run)**
- 112 tasks imported → inbox
- 16 routines imported (daily/weekly mapped to Routine frequency)
- `python import_notion.py` in backend folder

---



### To Build
- Multi-user auth: child account linked to primary
- Completion status in the user's view (quiet indicator)
- Simplified interface (no capacity model visible, no triage ritual)

### Dependencies
Phase 3 (routines), Phase 1 (auth)

---


**Goal:** ARIA knows who is home. the user's load reflects the full picture.

### To Build
- Weekend planner: simple weekly view

### Dependencies
Phase 3 (routines, capacity model), Phase 2 (load indicator)

---

## Phase 6 — Pattern Learning + Insights 🔲 NOT STARTED

**Goal:** ARIA surfaces what the data means.

### To Build
- PowerModelObservation logging (silent daily log: self-care inputs, tasks by category, capacity levels)
- Weekly insights card: plain-language observations
- Actuator category tagging on tasks
- Correlation surfacing (4–6 weeks of data needed)
- Circuit visualization v1: visual power source → actuator connection map
- Data export

### Dependencies
Phase 3 (self-care logs), Phase 5 (full context)

---

## Phase 7 — Deployment + Polish 🔲 NOT STARTED

**Goal:** Multi-device access (home PC + work PC + phone). Stable and shareable.

### To Build
- **Deployment:** Railway (backend + PostgreSQL) + Vercel (frontend)
- Migrate SQLite → PostgreSQL (update DATABASE_URL in .env)
- Error states: every screen handles API failure gracefully
- Loading states: skeleton screens
- Empty states: welcoming first-run experience
- PWA install prompt + push notification setup
- Performance + accessibility pass
- Beta feedback button

### Pre-deployment checklist
- [ ] Change `chris` password from `yourpassword`
- [ ] Set real `SECRET_KEY` in .env
- [ ] Set `ALLOWED_ORIGINS` to production domain
- [ ] Set `GOOGLE_REDIRECT_URI` to production callback URL
- [ ] Migrate aria.db data to PostgreSQL
- [ ] Set up HTTPS

### Dependencies
All previous phases

---

## Summary

| Phase | Name | Status |
|-------|------|--------|
| 1 | The Core Loop | ✅ Complete |
| 2 | Morning Triage | ✅ Complete |
| 3 | Foundation Tracking | ✅ Complete |
| 3.5 | Capture + Focus + Calendar | ✅ Complete |
| 6 | Pattern Learning | 🔲 Not started |
| 7 | Deployment + Polish | 🔲 Not started |

## Immediate Next Session Priorities

1. **Test end-to-end** — start server, log in, verify Focus view, triage, edit tasks, EOD gate
2. **Fix any bugs found** from first real use
3. **Google Calendar setup** — create Google Cloud project, add credentials to .env, test sync
4. **TriageCard edit mode** — TriageCard doesn't yet have an edit button (TaskCard does)
5. **BottomNav** — 8 items is crowded on mobile; consider UX before Phase 7
