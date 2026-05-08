# ARIA Acceptance Tests

*Human-readable acceptance criteria. Each phase must pass all its tests before being considered complete and before the next phase begins. Tests from earlier phases must continue to pass in all later phases.*

---

## Phase 1 — The Core Loop

### Capture
- [ ] When the user opens the app on her phone, the capture input is the first thing she sees (or one tap away from the home screen)
- [ ] the user can type a task and submit it in under 10 seconds with no required fields other than the text itself
- [ ] After submitting, the capture field clears and is ready for another entry immediately
- [ ] A captured item appears in the Inbox within 1 second of submission
- [ ] the user can optionally tag a capture as: task / appointment / routine / note before submitting
- [ ] If no tag is selected, the item defaults to "task"
- [ ] the user can capture from a PWA home screen shortcut without navigating through the full app

### Inbox
- [ ] All unscheduled captured items appear in the Inbox
- [ ] Items are shown in order of capture (newest first, or oldest first — consistent and clear)
- [ ] the user can move an item from Inbox to Today's list with a single action
- [ ] the user can delete an item from Inbox with a confirmation step (no accidental deletions)
- [ ] the user can snooze an item from Inbox to: tonight / tomorrow / this weekend / next week / a specific date

### Today's List
- [ ] Today's list shows only items explicitly scheduled for today
- [ ] the user can reorder items by dragging
- [ ] Completing an item removes it from the active list with a small satisfying animation
- [ ] Completed items are accessible in a "Done today" view (not just gone)
- [ ] the user can defer an item from Today's list back to Inbox
- [ ] the user can snooze an item from Today's list (same snooze options as Inbox)
- [ ] The list shows a count of remaining items for today

### Snooze System
- [ ] A snoozed item does not appear in Today's list or Inbox — only in the Waiting view
- [ ] The Waiting view shows all snoozed items with their snooze-until date visible
- [ ] When the snooze date arrives, the item appears in Inbox (or Triage, once Phase 2 exists)
- [ ] "Tonight" snooze resolves to: the item re-appears in tomorrow's triage
- [ ] "This weekend" snooze resolves to: Friday of the current week (or current day if it is a weekend)
- [ ] Snoozing never deletes an item
- [ ] the user can un-snooze an item from the Waiting view, returning it to Inbox immediately

### Navigation & Feel
- [ ] Bottom navigation on phone: Capture / Today / Inbox / Waiting — always visible
- [ ] Sidebar navigation on PC with the same four areas
- [ ] Time-of-day background theme applies on app load: dawn (0–6h), morning (6–12h), afternoon (12–18h), evening (18–24h)
- [ ] The app loads and is interactive in under 3 seconds on a standard mobile connection
- [ ] The app works offline for viewing Today's list and Inbox (captures queue for sync)
- [ ] PWA install prompt appears appropriately (not on every visit)

### Auth
- [ ] the user can log in with a username and password
- [ ] Session persists for 30 days (she doesn't have to log in every day)
- [ ] Logging out clears the session and returns to login screen
- [ ] Failed login shows a clear but non-specific error (not "wrong password" — just "couldn't sign in")

---

## Phase 2 — Morning Triage

### Triage View
- [ ] When the user opens the app in the morning (configurable window, default 6am–10am), the Triage view is the default screen (not Today's list)
- [ ] Triage view surfaces: all Inbox items + all items snoozed until today + routine instances for today (placeholder cards until Phase 3)
- [ ] Items in triage are shown without a default order — the user sets the order through triage actions
- [ ] the user can take one of these actions per item: Schedule Today / Snooze / Delete
- [ ] "Schedule Today" moves the item to Today's list
- [ ] Snooze in triage uses the same options as Phase 1 snooze
- [ ] Triage view shows a count of remaining items to triage

### Priority Fields
- [ ] When scheduling an item for today, the user can optionally set: urgency (urgent / not urgent), importance (important / not important), desire (high / medium / low)
- [ ] These fields default to unset — she is never required to fill them
- [ ] Priority fields take 1–2 taps each, not a long form
- [ ] Today's list can be sorted by: priority (urgent+important first), desire, or manual order

### Load Indicator
- [ ] After items are scheduled for today, a load indicator is visible on the Triage screen and Today's list
- [ ] Load levels: light / manageable / heavy / overloaded — based on count and estimated weight of scheduled items
- [ ] When estimated weight is not set, tasks default to "medium"
- [ ] the user can set estimated weight per item during triage: light / medium / heavy
- [ ] When load is "overloaded," a gentle prompt appears: "You have more than a full day here. What moves?" — with a button to go back to triage
- [ ] The prompt is dismissible and does not reappear during the same triage session

### Triage Completion
- [ ] When all inbox/snoozed items have been triaged, the user sees a "Triage complete" state with her today's list and load indicator
- [ ] From this state, a single tap transitions to Today's list view
- [ ] the user can re-enter triage at any point during the day if new captures arrive

### Skip-Triage Handling
- [ ] If the user doesn't open the app in the morning, incomplete items from yesterday carry forward to today's inbox automatically
- [ ] A quiet banner on Today's list indicates: "Some items carried over from yesterday" — not alarming, just visible
- [ ] Carried-over items behave like normal inbox items for today's triage

---

## Phase 3 — Foundation Tracking

### Routines
- [ ] the user can create a routine with: title, frequency (daily / weekdays / weekends / weekly / custom days), time-of-day bucket (morning / afternoon / evening / anytime)
- [ ] On a routine's scheduled day, a routine instance automatically appears in Triage
- [ ] the user can complete a routine instance (it then behaves like a completed task)
- [ ] the user can skip a routine instance from Triage without it being flagged as a failure
- [ ] Missed routines (not completed, not skipped, day has passed) appear in a quiet "Missed" view — not on Today's list, not highlighted on the main screen
- [ ] the user can edit or deactivate a routine; deactivated routines stop generating instances
- [ ] Routine history is preserved even when a routine is deactivated

### Self-Care Log
- [ ] A self-care log prompt notification fires at the user's configured morning time (default 8am) and evening time (default 9pm)
- [ ] The self-care log screen has: sleep hours (number input or slider), sleep quality (1–5 tap), meals today (0–4 tap), exercise (yes/no + optional minutes), medication taken (yes/no), mood (1–5 tap)
- [ ] All fields have a clear default (e.g., not filled, not assumed) — the user cannot accidentally submit a misleading log
- [ ] The entire log can be completed in under 60 seconds
- [ ] After submitting, the user sees a brief confirmation — no score, no streak count, no comparison to previous days
- [ ] the user can view her log history in a simple timeline
- [ ] the user can edit a log entry from the same day

### Medication
- [ ] the user can configure a medication: name, dose, reminder times
- [ ] Reminder notifications fire at configured times
- [ ] the user can log "taken" from the notification or from the app with one tap
- [ ] The medication log is visible in the self-care log view
- [ ] Medication history is private and never displayed as a streak or score

### Capacity Model
- [ ] After a self-care log is submitted, a capacity snapshot is computed
- [ ] The capacity indicator is visible on Today's list and Triage view
- [ ] The indicator shows named power sources (sleep battery, nutrition battery, etc.) in a visual format inspired by batteries and capacitors
- [ ] A plain-language note accompanies the indicator: e.g., "Sleep battery low — executive tasks may feel harder today"
- [ ] When sleep hours < 6, the executive capacitor indicator is visibly reduced
- [ ] When no self-care log exists for today, the indicator shows "Log your morning to see today's capacity" — not a default full/empty state
- [ ] The capacity indicator influences Triage visually: heavy/executive tasks are softly flagged when executive capacitor is low (visual flag only — the user decides)

---


### Multi-User Auth

- [ ] Routines are shown in time-of-day order (morning first, etc.)
- [ ] The interface feels like his own tool, not a parental dashboard

### Reminders

- [ ] The alert, if enabled, fires as a quiet notification — not an alarm

### Delegation

---


- [ ] The default schedule (Tue 5pm–Wed 5pm, Fri 5pm–Sun 5pm) is supported as a recurring pattern

- [ ] the user can add one-off activities (playdates, birthdays, zoo trips) on specific dates
- [ ] Activities appear in the user's Today view on the relevant day with time and description
- [ ] Activities appear in the weekly planner view

### Family Context in Today View

### Load Calculation Update
- [ ] the user can see what's contributing to her load calculation (tap the load indicator for a breakdown)


---

## Phase 6 — Pattern Learning + Insights

### Observation Logging
- [ ] Every day, ARIA silently logs: self-care inputs for the day, tasks completed by actuator category, capacity levels computed
- [ ] This logging is automatic — the user does not have to do anything extra
- [ ] the user can view her raw log data and export it at any time
- [ ] the user can delete her observation history

### Actuator Categories
- [ ] the user can tag any task with an actuator category: engineering / physical home / parenting / creative / errands / self-care / other
- [ ] Category can be set during capture, triage, or after the fact
- [ ] the user can create custom actuator categories
- [ ] ARIA suggests a category based on task title (simple keyword matching initially)

### Weekly Insights
- [ ] After 2+ weeks of logging, a weekly insights card appears in the user's home view
- [ ] Insights are plain-language observations, e.g.: "You complete more physical tasks on days you exercise." "Your highest-focus days follow 7+ hours of sleep."
- [ ] Insights are based only on observed patterns in the user's own data — no external benchmarks or comparisons
- [ ] Insights are never phrased as criticism or prescriptions ("You should sleep more")
- [ ] the user can dismiss an insight card; it does not reappear for 7 days
- [ ] No insights surface with fewer than 10 data points for the relevant pattern

### Circuit Visualization
- [ ] After 4+ weeks of logging with actuator categories tagged, a circuit visualization is available
- [ ] The visualization shows observed connections: which self-care sources connect to which actuator types, weighted by observed correlation strength
- [ ] Connections with insufficient data are shown as "unknown" — not assumed
- [ ] The visualization is explorable (tap a connection to see the underlying observations)
- [ ] the user can share a screenshot of the visualization (but raw data is not shared without explicit export)

---

## Phase 7 — Polish + Launch

### Error Handling
- [ ] Every screen handles a failed API call gracefully — no white screens or unhandled errors
- [ ] Offline state is communicated clearly: "You're offline — changes will sync when you reconnect"
- [ ] Failed captures are queued and retried automatically when connection returns
- [ ] Auth expiry shows a friendly re-login prompt, not an error screen

### Loading States
- [ ] Every data-loading screen shows a skeleton layout — not a spinner in the center of a blank page
- [ ] Skeleton screens match the layout of the loaded content (not generic placeholders)

### Empty States
- [ ] First-run Inbox: welcoming message + prompt to capture first task
- [ ] First-run Today: prompt to do morning triage or add something directly
- [ ] First-run Waiting: explanation of what snoozing does
- [ ] First-run Routines: prompt to create first routine with a suggestion or two

### Onboarding
- [ ] Each step is skippable — she can complete setup later
- [ ] After onboarding, the user lands on Today view with the first triage prompted

### PWA
- [ ] App is installable as a PWA on iOS and Android
- [ ] Install prompt appears after 2+ visits, not on first load
- [ ] Installed PWA opens directly to Today view, not a browser tab
- [ ] Push notifications work when the app is installed as PWA on both iOS and Android

### Performance
- [ ] App is interactive in under 3 seconds on a 4G connection
- [ ] Today's list renders in under 500ms after auth
- [ ] Animations run at 60fps on a mid-range phone (no janky transitions)
- [ ] No layout shifts after initial load

### Accessibility
- [ ] All tap targets are at least 44x44px
- [ ] Font sizes are readable without zooming on a standard phone screen
- [ ] Color is not the only indicator of state (completion, warnings, etc.)
- [ ] App is navigable without animations for users with motion sensitivity (respects prefers-reduced-motion)

### Feedback
- [ ] A "Send feedback" button is accessible from every main screen (tucked in settings or a long-press)
- [ ] Feedback submits to a simple log the user can review
- [ ] Beta users can leave feedback without creating an account

### Deployment
- [ ] App is live at a real HTTPS URL
- [ ] Backend is deployed and accessible from outside localhost
- [ ] A new user can sign up and use the app end-to-end without developer assistance
- [ ] the user can share the URL with friends and family and they can access it

---

## Regression: All Previous Phase Tests
When any phase is complete, all prior phase tests must still pass. A feature that worked in Phase 1 should still work in Phase 7. Run the full test list before marking any phase as complete.
