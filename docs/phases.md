# ARIA Build Phases

*Each phase is independently deployable and testable.*
*Last updated: 2026-05-07*

> **Historical planning doc — not current status.** Written before several major pivots: Triage
> (Phase 2) was later merged into Today (4.4.0) and the merge itself was eventually torn out
> further; Google Calendar (Phase 3.5) was removed entirely (2026-09-15); Phase 6 (Pattern
> Learning/nudges) was built, then almost entirely deleted after the nudge UI proved unwanted;
> Phase 7 (deployment) is done and the app has been live at adh-tea.fun for months. For what's
> actually true today, read **`HANDOFF.md`**. This file is kept for the reasoning behind early
> decisions, not as a status tracker.

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

## Phase 3.6 — Navigation Overhaul + Task Intelligence ✅ COMPLETE

*Not in original plan — added based on real-use feedback after first live session.*

### Built

**Navigation redesign**
- App always opens to Focus (home) — no auto-triage launch
- BottomNav mobile: Routines | Log | ☰ (hamburger, no label) + FAB for capture
- BottomNav desktop: sidebar unchanged
- Triage moved to Settings → "Triage inbox"
- "Triage ↻" shortcut remains on Focus header

**Triage overhaul — one item at a time**
- Shows one card at a time (large, 2xl title), not full list
- "→ Today" schedules immediately
- Defer buttons (Tomorrow / End of week / Next week / Pick date) set `due_date` — task stays inbox, hidden until that date arrives
- "Snooze 1 month" is the only true snooze (hides task completely)
- Directional slide animation (Today → right, defer ← left)
- TriageCard also has inline pencil-edit mode

**Task scheduling fixes**
- `schedule_today` uses `today_start()` (local midnight) for `scheduled_date` — fixes timezone filter mismatch that caused today's tasks to not appear in Focus
- `promote_due_tasks()` — runs on every `GET /tasks/today` load; auto-promotes inbox tasks with `due_date <= today` into the Today list without requiring re-triage
- `defer_task` clears `due_date` to prevent deferred tasks from immediately re-promoting
- Inbox filter hides tasks with `due_date > today` — they surface on their scheduled date
- Routine instances auto-generate with `status=today` (skip triage, appear directly in Focus)
- Stale routine instances soft-deleted by carry_forward (not sent to inbox)

**Bonus mode (Focus)**
- Activates when today's task list is fully cleared
- Shows all future-dated inbox tasks + snoozed tasks (ordered by date)
- Goldenrod/amber UI: "Bonus" header, amber ring border on card, amber progress dots
- "Skip" button (local remove, no API) instead of "Back to inbox"
- Done ✓ button turns amber

**AllTasks page (consolidated search + waiting)**
- Accessible from Settings → "All tasks"
- Filter bar (client-side, instant)
- Each row: checkbox, type icon, title+status, date pill (tap → inline date picker + Clear), snooze moon icon (green ring when active)
- Snooze toggle: ON = 1 month from now, OFF = unsnooze
- Batch actions (2+ selected): sticky bubble bar sticks 10px below mobile header (`top-[66px]`)
  - "Snooze (N)" amber bubble — snooze or unsnooze all selected
  - "Date (N)" accent bubble — expands inline date picker within sticky bar
- Optimistic local updates (no full refetch after edits)

**New backend endpoints**
- `GET /tasks/bonus` — future inbox (non-routine) + snoozed tasks
- `GET /tasks/search?q=` — case-insensitive title+notes search
- `GET /tasks/backlog` — all active tasks for AllTasks page

**Deployment prep**
- `backend/Procfile` for Railway
- `psycopg2-binary` added to requirements.txt
- `frontend/vercel.json` with SPA rewrites
- database.py already supports `DATABASE_URL` env var (SQLite dev / PostgreSQL prod)

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
- **Domain:** adh-tea.fun (purchased) — frontend at adh-tea.fun, backend at api.adh-tea.fun
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
