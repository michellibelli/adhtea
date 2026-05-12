# ARIA v2 — Handoff Doc
*Last updated: 2026-05-11*

## Project layout

```
aria/v2/
  backend/   FastAPI + SQLite dev / PostgreSQL (Supabase) prod
  frontend/  React 19 + Vite + Tailwind v4
  docs/      design.md, phases.md, tests.md
```

Run locally:
```
cd backend && python -m uvicorn main:app --reload
cd frontend && npm run dev
```

Primary user (prod): username=`demo_user`, password=`Blueberrywaffles`, user_id=2.

---

## Deployment (live)

| Service | URL | Notes |
|---------|-----|-------|
| Frontend | https://adh-tea.fun | Vercel, auto-deploys on push |
| Backend | https://api.adh-tea.fun | Render free tier, sleeps after 15 min idle |
| Database | Supabase PostgreSQL | Pooler connection, project ref `yyolrtwpsbtamncihmls` |

**Render sleeps** — add UptimeRobot ping to `https://api.adh-tea.fun/health` every 5 min when ready.

**Render DATABASE_URL** — password must be URL-encoded (`&` → `%26`, `@` → `%40`).

---

## Status

Phases 1–3.6 complete. All previous handoff tasks complete.

**Completed this session:**
- Task 1: `pickNext()` in `Focus.jsx` — appointments only surface when ≤5 min away (`isImminent()` helper, lines 16–34)
- Task 2: Focus card visual redesign — bigger padding, `text-3xl` title, amber time pill, larger dots
- Task 3: Deployed to Render + Vercel + Supabase (adh-tea.fun live)

---

## Design direction — adhTea

**Vibe:** Lighthearted, queer, slightly pixelated. Queer Stardew Valley energy.

**Color palette** — pulled from colorTea logo (`colorfinder/colorTeaLogo.png`):

| Token | Color | Hex |
|-------|-------|-----|
| Background | Warm cream | `#F5F0E8` |
| Card | Slightly warmer cream | `#EDE8DC` |
| Text | Dark brown | `#3D2B1F` |
| Subtext | Medium brown | `#7A6152` |
| Border | Soft brown | `#C8B8A8` |
| Accent | Periwinkle (steam) | `#B8C5E8` |
| Accent 2 | Peach (steam) | `#F4C5A8` |
| Accent 3 | Lavender (steam) | `#C5B8E8` |
| Pride stripe | Full rainbow | red→violet |

**Pixel details:** Use `rounded-none` or `rounded-sm` on cards + subtle pixel-border effect (2px solid outline) to get the pixelated feel. Consider a pixel font for headings (e.g. Press Start 2P for titles, readable sans for body).

**App name:** `adhTea` (user-facing). Domain: `adh-tea.fun`.

---

## Task 1 — Multi-user support (up to ~20 test users)

**What:** Family and friends, each with their own login and isolated data. No registration page — admin creates users.

**Goals:**
- Admin endpoint to create users (or a simple invite-code flow)
- Each user sees only their own data (already isolated by `user_id` in DB)
- Cap ~20 users

**Where to start:**
- `backend/routes/auth.py` — add `/register` endpoint gated by admin role or invite code
- `backend/models.py` — `User` model already has `role` field
- `frontend/src/pages/Settings.jsx` — admin section to create users

---

## Task 2 — Aesthetic overhaul (adhTea design system)

**What:** Apply the adhTea palette and pixel vibe across the whole app.

**Order of attack:**
1. `frontend/tailwind.config.js` — define color tokens from palette above
2. `frontend/src/index.css` — global bg, text defaults, pixel font import
3. `frontend/src/components/Card.jsx` — pixel border style, warm bg
4. `frontend/src/pages/Focus.jsx` — most important screen, get right first
5. Remaining pages top-down

**Pixel font option:** [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) for headings only (it's very small at body size). Pair with a clean readable sans for body text.

---

## Task 3 — Focus as home + navigation hub

**What:** App always opens to Focus. All navigation radiates from there.

**Decisions made:**
- FAB "+" in bottom right stays — it's for Capture, keep it
- Hamburger/sandwich menu replaces Settings tab — contains Today, Triage, Routines, SelfCare, etc. listed by their own name (no "Settings" label, no section title)
- Bottom nav bar removed or collapsed to just the FAB
- Back always returns to Focus

**Where:**
- `frontend/src/App.jsx` — default route → Focus
- `frontend/src/components/BottomNav.jsx` — strip down to FAB only
- `frontend/src/pages/Focus.jsx` — add hamburger menu icon (top right or top left)
- New component: `HamburgerMenu.jsx` — slide-out or dropdown with nav links

---

## Task 4 — Persistent login

**Current state:** Token stored in `localStorage`, 30-day expiry. Likely not a real problem — was probably just reloads during dev. Monitor in prod — if users report getting logged out, extend `TOKEN_EXPIRY_DAYS` in `backend/routes/auth.py` line 15 to 90 or 365.

**No action needed now.**

---

## Task 5 — adhTea Android app (PWA → Play Store)

**Yes, PWA is a real thing.** Users install from browser, get a home screen icon, app opens fullscreen with no browser chrome — feels native. No app store needed for Phase A.

### Phase A — PWA (do first, ~1 hour)
```bash
cd frontend && npm install vite-plugin-pwa
```

Add to `vite.config.js`:
```js
import { VitePWA } from 'vite-plugin-pwa'

VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'adhTea',
    short_name: 'adhTea',
    theme_color: '#F5F0E8',
    background_color: '#F5F0E8',
    display: 'standalone',
    start_url: '/',
    icons: [/* 192x192, 512x512 pixel art icons */]
  }
})
```

Need to create pixel-art icons (192×192 and 512×512) using the colorTea mug as inspiration.

Android users: open `adh-tea.fun` in Chrome → three dots → "Add to Home Screen" → done.
iOS users: open in Safari → share → "Add to Home Screen" → done.

### Phase B — Google Play Store via TWA (later)
Wrap the PWA using [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap). Generates an APK. Requires $25 Google Play Developer account one-time fee.

### Phase C — iOS App Store (later)
Use Capacitor. Requires $99/year Apple Developer account.

---

## Backend file map (quick reference)

```
backend/
  main.py           app setup, CORS, router registration
  database.py       SQLAlchemy engine, session, DATABASE_URL env var
  models.py         all ORM models
  schemas.py        Pydantic request/response schemas
  routes/
    auth.py         login, session tokens (TOKEN_EXPIRY_DAYS=30)
    tasks.py        CRUD + today/inbox/bonus/search/backlog endpoints
    routines.py     routines + lazy daily instance generation
    selfcare.py     SelfCareLog + CapacitySnapshot
    medication.py   MedicationSchedule + MedicationLog
    gcal.py         Google Calendar OAuth + sync
    import_csv.py   CSV import endpoint
```

## Frontend file map (quick reference)

```
frontend/src/
  App.jsx                   routing, nav state
  pages/
    Focus.jsx               home screen — single next-task card + bonus mode
    Triage.jsx              one-at-a-time inbox triage
    Today.jsx               full today list (drag to reorder)
    Capture.jsx             type-aware capture form
    Routines.jsx            routine CRUD
    SelfCare.jsx            foundation / self-care log page
    AllTasks.jsx            consolidated search + batch actions
    Settings.jsx            integrations, import, nav to triage/all-tasks
    EODGate.jsx             end-of-day mood + summary
  components/
    TriageCard.jsx          triage item card (inline edit at line 263)
    TaskCard.jsx            today/list item card
    CapacityBar.jsx         load indicator (compact + full modes)
    BottomNav.jsx           mobile bottom nav + FAB (strip to FAB only)
    SnoozeSheet.jsx         snooze date picker sheet
    Card.jsx / Button.jsx / Input.jsx   base UI primitives
```

---

## What's next after these tasks

- Phase 6: pattern learning + weekly insights
