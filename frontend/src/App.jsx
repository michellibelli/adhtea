import { useState, useEffect } from 'react'

const BUILD_CHIP_KEY = 'show_build_chip'
function readShowBuildChip() {
  const v = localStorage.getItem(BUILD_CHIP_KEY)
  return v === null ? true : v === 'true'
}

import { ThemeProvider } from './context/ThemeContext'
import { isLoggedIn, loginExpired, getPendingReviews } from './api/client'
import { getMe, logout } from './api/auth'
import { getTodayLog, getTodayCapacity } from './api/selfcare'
import { getReviewPending } from './api/review'
import { prefetchFirstScreenAssets } from './utils/prefetch'
import { markLoad, getLoadMarks } from './utils/loadTimer'
import Login from './pages/Login'
import Register from './pages/Register'
import Signup from './pages/Signup'
import AlphaChallenge from './pages/AlphaChallenge'
import Capture from './pages/Capture'
// Tournament removed — triage merged into Today page
import Focus from './pages/Focus'
import Today from './pages/Today'
import MorningReview from './pages/MorningReview'
import Inbox from './pages/Inbox'
import Waiting from './pages/Waiting'
import Routines from './pages/Routines'
import SelfCare from './pages/SelfCare'
import EODGate from './pages/EODGate'
import Settings from './pages/Settings'
import AllTasks from './pages/AllTasks'
import Projects from './pages/Projects'
import OnboardingWelcome from './pages/OnboardingWelcome'
import Logo from './components/Logo'
import PageProgress from './components/PageProgress'
import './App.css'

// Returns true if it's EOD time — after 5 PM by default
function isEODWindow(user) {
  const hour = new Date().getHours()
  const eveningStr = user?.notification_evening ?? '21:00'
  const eveningHour = parseInt(eveningStr.split(':')[0], 10)
  return hour >= 17 && hour <= eveningHour
}

async function getOpeningScreen() {
  return 'focus'
}

function AppShell() {
  const [screen, setScreen]                   = useState('focus')
  // triageReturnTo removed — triage merged into Today
  const [user, setUser]                       = useState(null)
  const [capacity, setCapacity]               = useState(null)
  const [carriedOver, setCarriedOver]         = useState(false)
  const [ready, setReady]                     = useState(false)
  const [showEOD, setShowEOD]                 = useState(false)
  const [showCheckIn, setShowCheckIn]         = useState(false)
  const [showReview, setShowReview]           = useState(false)
  const [review, setReview]                   = useState(null)
  const [checkInLog, setCheckInLog]           = useState(undefined)
  const [needsAlphaChallenge, setNeedsAlphaChallenge] = useState(false)
  const [showOnboarding, setShowOnboarding]   = useState(false)

  useEffect(() => {
    // Boot fetches go out in parallel, not as a waterfall. getMe still gates the
    // branching below — the alpha-challenge and onboarding paths return before
    // any other result is read — but all four requests are already in flight by
    // then, so the common (onboarded) path pays one round trip here instead of
    // two. This was the measured cost of the 1-2s open after Render Starter
    // removed hibernation; see the trial baseline in SESSION.md.
    //
    // Each promise carries its own .catch AT CREATION, not at the await: on an
    // early return nobody awaits them, and an un-caught rejection would surface
    // as an unhandled promise rejection in the console.
    //
    // Firing these ahead of the onboarding check is safe because all three are
    // read-only GETs — /capacity/today returns None when no snapshot exists
    // rather than lazily creating one, and /review/pending only reads (the
    // commit lives in POST /review/commit). No row can be created for a user
    // who never gets past the gate.
    const mePromise      = getMe()
    const logPromise     = getTodayLog().catch(() => undefined)
    const pendingPromise = getReviewPending().catch(() => null)
    const capacityPromise = getTodayCapacity().catch(() => null)

    mePromise
      .then(async (u) => {
        setUser(u)

        if (u.needs_alpha_challenge) {
          setNeedsAlphaChallenge(true)
          setReady(true)
          return
        }
        if (!u.is_onboarded) {
          setShowOnboarding(true)
          setReady(true)
          return
        }
        const opening = await getOpeningScreen()
        setScreen(opening)
        capacityPromise.then(setCapacity)

        // Decide the morning self-care gate / EOD BEFORE revealing the app so
        // the user lands on the right screen (never flashes Focus then yanks to
        // the gate). A timeout here would risk skipping the gate on a cold
        // morning, which is exactly the bug we're avoiding.
        try {
          // Both went out alongside getMe above, so by now they are usually
          // already settled — this await is what orders the gate decision, not
          // what pays for the fetch.
          const [log, pending] = await Promise.all([logPromise, pendingPromise])
          setCheckInLog(log)   // hand to the gate so it paints without a 2nd fetch
          // A commit for this day may already be sitting in the local queue —
          // durable-committed on a cold backend that never advanced
          // `reviewed_through`, so /review/pending still returns it. Treat that
          // day as already reviewed (the 30s flush will sync it) so we don't
          // fire the same morning review a second time.
          const queuedDates = new Set(getPendingReviews().map(p => p.date))
          if (pending && pending.tasks && pending.tasks.length &&
              !queuedDates.has(pending.date)) {
            // Review yesterday first; its Continue button runs the self-care
            // gate decision below (see MorningReview onComplete).
            setReview(pending)
            setShowReview(true)
          } else {
            applyDayGate(log, u)
          }
        } catch { /* slow/cold server — proceed without blocking */ }
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [])

  useEffect(() => { if (ready) markLoad('ready') }, [ready])

  useEffect(() => {
    const onLoaded = () => markLoad('page')
    window.addEventListener('aria:page-loaded', onLoaded)
    return () => window.removeEventListener('aria:page-loaded', onLoaded)
  }, [])

  function handleLogout() { logout().then(() => window.location.reload()) }

  // The morning self-care / EOD gate decision. Faithful to the original inline
  // logic — used both when there's no pending review and (via MorningReview's
  // Continue) right after the review is committed.
  function applyDayGate(log, u = user) {
    const hour = new Date().getHours()
    const isMorningWindow = hour < 14
    if (!log && isMorningWindow) setShowCheckIn(true)
    else if (log && isEODWindow(u)) setShowEOD(true)
  }

  // handleTriageDone + openTriage removed — triage merged into Today

  // The themed background is rendered by App(), outside this component, so the
  // pre-reveal window shows that rather than nothing. The app appears when its
  // data lands — measured by loadTimer's `ready` mark.
  if (!ready) return null

  if (needsAlphaChallenge) {
    return (
      <ThemeProvider>
        <AlphaChallenge
          onVerified={() => setNeedsAlphaChallenge(false)}
          onLogout={() => window.location.reload()}
        />
      </ThemeProvider>
    )
  }

  if (showOnboarding) {
    return (
      <ThemeProvider>
        <OnboardingWelcome onDone={() => { setShowOnboarding(false); setScreen('focus') }} />
      </ThemeProvider>
    )
  }

  if (showReview && review) {
    return (
      <ThemeProvider>
        <MorningReview
          data={review}
          onComplete={() => {
            setShowReview(false)
            // Now run the normal morning gate: self-care if not yet logged,
            // otherwise straight into Today (the plan surface).
            const hour = new Date().getHours()
            if (!checkInLog && hour < 14) setShowCheckIn(true)
            else setScreen('today')
          }}
        />
      </ThemeProvider>
    )
  }

  if (showCheckIn) {
    return (
      <ThemeProvider>
        <SelfCare
          userId={user?.id}
          gateMode
          preloadedLog={checkInLog}
          preloadedCapacity={capacity}
          onComplete={() => {
            setShowCheckIn(false)
            setScreen('today')
            getTodayCapacity().then(setCapacity).catch(() => {})
          }}
        />
      </ThemeProvider>
    )
  }

  if (showEOD) {
    return <EODGate onComplete={() => setShowEOD(false)} />
  }

  return (
    <div className="min-h-screen">
      <PageProgress trigger={screen} />
      {/* Mobile top bar — logo on the left, capacity track + stats stacked
          on the right inside the same 52px frame. Stats only show on the
          Focus screen once Focus pushes them up. */}
      <header
        className="fixed top-0 left-0 right-0 z-40 flex justify-center pt-2"
        style={{ pointerEvents: 'none' }}
      >
        <div
          className="header-pill flex items-center gap-3 px-5 w-full backdrop-blur-md transition-colors duration-300"
          style={{ pointerEvents: 'auto' }}
        >
          {/* Left — flower accent (geometric on Cafe, pressed watercolor on Linen) */}
          <div className="header-pill-flower flex items-center justify-start" style={{ width: 40 }}>
            <svg className="header-flower-geo" viewBox="0 -8 24 40" fill="none" style={{ width: 28, height: 28 }}>
              <ellipse cx="12" cy="4.5" rx="3.5" ry="7.5" fill="var(--aria-text)" fillOpacity="0.08" stroke="var(--aria-text)" strokeWidth={0.7} />
              <ellipse cx="12" cy="4.5" rx="3.5" ry="7.5" fill="var(--aria-text)" fillOpacity="0.08" stroke="var(--aria-text)" strokeWidth={0.7} transform="rotate(72 12 12)" />
              <ellipse cx="12" cy="4.5" rx="3.5" ry="7.5" fill="var(--aria-text)" fillOpacity="0.08" stroke="var(--aria-text)" strokeWidth={0.7} transform="rotate(144 12 12)" />
              <ellipse cx="12" cy="4.5" rx="3.5" ry="7.5" fill="var(--aria-text)" fillOpacity="0.08" stroke="var(--aria-text)" strokeWidth={0.7} transform="rotate(216 12 12)" />
              <ellipse cx="12" cy="4.5" rx="3.5" ry="7.5" fill="var(--aria-text)" fillOpacity="0.08" stroke="var(--aria-text)" strokeWidth={0.7} transform="rotate(288 12 12)" />
              <circle cx="12" cy="12" r="2.8" fill="var(--aria-text)" fillOpacity="0.2" stroke="var(--aria-text)" strokeWidth={0.6} />
            </svg>
            <img className="header-flower-pressed" src="/pressed-flower.svg" alt="" width={34} height={34} />
          </div>
          {/* Center — logo */}
          <button
            onClick={() => setScreen('focus')}
            className="flex-1 flex items-center justify-center hover:opacity-80 transition-opacity"
            aria-label="Home"
          >
            <Logo size={34} />
          </button>
          {/* Right — journal icon for settings */}
          <div className="flex items-center justify-end" style={{ width: 40 }}>
            <button
              onClick={() => setScreen('settings')}
              className="p-1 rounded-md hover:opacity-70 transition-opacity"
              aria-label="Settings"
            >
              <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" style={{ width: 26, height: 26 }}>
                <line className="header-menu-stroke" x1="4" y1="7" x2="20" y2="7" stroke="var(--aria-text)" strokeWidth={2} />
                <line className="header-menu-stroke" x1="4" y1="12" x2="20" y2="12" stroke="var(--aria-text)" strokeWidth={2} />
                <path className="header-menu-stroke" d="M4 17 Q8 15.5 12 17 Q16 18.5 20 17" stroke="var(--aria-text)" strokeWidth={2} fill="none" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="pt-[64px] relative z-10">
        {screen === 'capture'  && <Capture onNavigate={setScreen} />}
        {screen === 'focus'    && (
          <Focus
            onGoToList={() => setScreen('today')}
            onNavigate={setScreen}
            boxManual={!!user?.box_manual}
            onBoxOrdered={() => setUser(u => u ? { ...u, box_manual: true } : u)}
          />
        )}
        {screen === 'today'    && (
          <Today
            carriedOver={carriedOver}
            onNavigate={setScreen}
            dayPlanned={!!user?.day_planned}
            onDayPlanned={() => setUser(u => u ? { ...u, day_planned: true } : u)}
          />
        )}
        {screen === 'inbox'    && <Inbox />}
        {screen === 'waiting'  && <Waiting />}
        {screen === 'routines' && <Routines />}
        {screen === 'selfcare'  && <SelfCare userId={user?.id} />}
        {screen === 'settings'  && <Settings onNavigate={setScreen} user={user} />}
        {screen === 'tasks'     && <AllTasks />}
        {screen === 'projects'  && <Projects onNavigate={setScreen} />}
      </main>

    </div>
  )
}

export default function App() {
  // Require a fresh login each morning even if the 30-day token is still valid.
  const [authed, setAuthed]           = useState(isLoggedIn() && !loginExpired())
  const [preAuthScreen, setPreAuthScreen] = useState(
    () => window.location.pathname === '/signup' ? 'signup' : 'login'
  )
  const [showChip, setShowChip] = useState(readShowBuildChip)
  const [timing, setTiming] = useState(getLoadMarks)
  const inviteToken = new URLSearchParams(window.location.search).get('invite')

  useEffect(() => {
    const handler = () => setShowChip(readShowBuildChip())
    window.addEventListener('aria:build-chip-changed', handler)
    return () => window.removeEventListener('aria:build-chip-changed', handler)
  }, [])

  useEffect(() => {
    const onTiming = (e) => setTiming(e.detail)
    window.addEventListener('aria:load-timing', onTiming)
    return () => window.removeEventListener('aria:load-timing', onTiming)
  }, [])

  // Warm the first-screen image cache while the user is on the login screen, so
  // the post-login Focus paint doesn't pop in asset-by-asset.
  useEffect(() => {
    if (!authed) prefetchFirstScreenAssets()
  }, [authed])

  function handleAuthed() {
    window.history.replaceState({}, '', '/')
    setAuthed(true)
  }

  if (!authed && inviteToken) {
    return (
      <ThemeProvider>
        <Register inviteToken={inviteToken} onRegister={handleAuthed} />
      </ThemeProvider>
    )
  }

  if (!authed && preAuthScreen === 'signup') {
    return (
      <ThemeProvider>
        <Signup
          onLogin={handleAuthed}
          onGoLogin={() => { window.history.replaceState({}, '', '/'); setPreAuthScreen('login') }}
        />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <div className="aria-page-bg" aria-hidden="true" />
      <div className="linen-flower-banner" aria-hidden="true" />
      <div className="linen-side-vines" aria-hidden="true">
        {/* Left vine */}
        <img className="linen-vine-img" src="/flowers/leaf_3-removebg-preview.png" alt="" style={{ left: -8, top: '8vh', width: 50, transform: 'rotate(-15deg)' }} />
        <img className="linen-vine-img" src="/flowers/leaf_7-removebg-preview.png" alt="" style={{ left: -5, top: '30vh', width: 50, transform: 'rotate(10deg)' }} />
        <img className="linen-vine-img" src="/flowers/flower_5-removebg-preview.png" alt="" style={{ left: -10, top: '52vh', width: 50, transform: 'rotate(-10deg)' }} />
        <img className="linen-vine-img" src="/flowers/leaf_5-removebg-preview.png" alt="" style={{ left: -5, top: '74vh', width: 50, transform: 'rotate(5deg)' }} />
        {/* Right vine */}
        <img className="linen-vine-img" src="/flowers/leaf_6-removebg-preview.png" alt="" style={{ right: -5, top: '12vh', width: 45, transform: 'scaleX(-1) rotate(-15deg)' }} />
        <img className="linen-vine-img" src="/flowers/leaf_4-removebg-preview.png" alt="" style={{ right: -5, top: '35vh', width: 45, transform: 'scaleX(-1) rotate(10deg)' }} />
        <img className="linen-vine-img" src="/flowers/leaf_2-removebg-preview.png" alt="" style={{ right: -8, top: '55vh', width: 45, transform: 'scaleX(-1) rotate(-5deg)' }} />
        <img className="linen-vine-img" src="/flowers/leaf_7-removebg-preview.png" alt="" style={{ right: -5, top: '75vh', width: 50, transform: 'scaleX(-1) rotate(15deg)' }} />
      </div>
      {showChip && (
        <div style={{
          position: 'fixed', bottom: 'calc(12px + env(safe-area-inset-bottom))', right: 6, zIndex: 9999,
          background: 'transparent', color: 'var(--aria-subtext)', fontWeight: 500,
          padding: 0, fontSize: 9, fontFamily: 'monospace',
          pointerEvents: 'none', textAlign: 'right', lineHeight: '1.3', opacity: 0.55,
        }}>
          <div>{typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'dev'}</div>
          {timing.ready != null && (
            <div>{timing.ready}ms{timing.page != null ? ` · +${timing.page - timing.ready}ms` : ''}</div>
          )}
          <a href="https://www.vecteezy.com" target="_blank" rel="noopener noreferrer" style={{ pointerEvents: 'auto', color: 'inherit', textDecoration: 'none' }}>Vecteezy.com</a>
        </div>
      )}
      {authed
        ? <AppShell />
        : <Login onLogin={() => setAuthed(true)} onGoSignup={() => { window.history.replaceState({}, '', '/signup'); setPreAuthScreen('signup') }} />
      }
    </ThemeProvider>
  )
}
