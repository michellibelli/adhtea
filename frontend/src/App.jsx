import { useState, useEffect } from 'react'

const BUILD_CHIP_KEY = 'show_build_chip'
function readShowBuildChip() {
  const v = localStorage.getItem(BUILD_CHIP_KEY)
  return v === null ? true : v === 'true'
}

import { ThemeProvider } from './context/ThemeContext'
import { isLoggedIn } from './api/client'
import { getMe, logout } from './api/auth'
import { getTodayLog, getTodayCapacity } from './api/selfcare'
import CapacityBar from './components/CapacityBar'
import Login from './pages/Login'
import Register from './pages/Register'
import Signup from './pages/Signup'
import AlphaChallenge from './pages/AlphaChallenge'
import Capture from './pages/Capture'
import Tournament from './pages/Tournament'
import Focus from './pages/Focus'
import Today from './pages/Today'
import Inbox from './pages/Inbox'
import Waiting from './pages/Waiting'
import Routines from './pages/Routines'
import SelfCare from './pages/SelfCare'
import EODGate from './pages/EODGate'
import Settings from './pages/Settings'
import AllTasks from './pages/AllTasks'
import Projects from './pages/Projects'
import OnboardingWelcome from './pages/OnboardingWelcome'
import BottomNav from './components/BottomNav'
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
  const [user, setUser]                       = useState(null)
  const [capacity, setCapacity]               = useState(null)
  const [carriedOver, setCarriedOver]         = useState(false)
  const [ready, setReady]                     = useState(false)
  const [showEOD, setShowEOD]                 = useState(false)
  const [showCheckIn, setShowCheckIn]         = useState(false)
  const [needsAlphaChallenge, setNeedsAlphaChallenge] = useState(false)
  const [showOnboarding, setShowOnboarding]   = useState(false)
  // Headline stats pushed up from <Focus /> so the mobile top bar can
  // render "Now / X done / Y left" beneath the capacity bar. Null when
  // Focus isn't mounted or its data hasn't loaded yet.
  const [focusStats, setFocusStats]           = useState(null)

  useEffect(() => {
    getMe()
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
        getTodayCapacity().then(setCapacity).catch(() => {})

        // Morning check-in hard gate: every day, the user logs once before
        // touching the rest of the app. Confidence in "do this next" requires
        // knowing today's capacity — without a log the bin-pack budget is a
        // guess. Gate only applies in the morning window (before 14:00) —
        // if the user opens the app later in the day with no log yet, just
        // let them in instead of forcing a stale "morning" check-in.
        try {
          const log = await getTodayLog()
          const hour = new Date().getHours()
          const isMorningWindow = hour < 14
          if (!log && isMorningWindow) {
            setShowCheckIn(true)
          } else if (log && isEODWindow(u)) {
            // Morning log exists; still pop the EOD gate in the evening
            // if there's no closing entry.
            setShowEOD(true)
          }
        } catch { /* non-blocking */ }
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [])

  function handleLogout() { logout().then(() => window.location.reload()) }

  function handleTriageDone() {
    setScreen('focus')
    setCarriedOver(false)
  }

  if (!ready) {
    return (
      <div className="aria-page flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 -mt-12">
          <Logo size={56} />
          <p
            className="text-sm text-ui-subtext"
            style={{ fontFamily: 'var(--font-pixel)', fontStyle: 'italic', letterSpacing: '0.04em' }}
          >brewing…</p>
        </div>
      </div>
    )
  }

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

  if (showCheckIn) {
    return (
      <ThemeProvider>
        <SelfCare
          userId={user?.id}
          gateMode
          onComplete={() => {
            setShowCheckIn(false)
            setScreen('tournament')
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
      {/* Mobile top bar — slim paper strip. Logo on the left, capacity
          bar + Focus stats stacked on the right inside the same 52px
          frame. Stats only show when on the Focus screen and Focus has
          pushed up its current Now/done/left labels. */}
      <header className="fixed top-0 left-0 right-0 z-40 backdrop-blur-md md:hidden bg-ui-nav border-b border-ui-nav-border">
        <div className="flex items-center gap-3 px-4 h-[52px]">
          <button
            onClick={() => setScreen('focus')}
            className="flex-shrink-0 hover:opacity-80 transition-opacity"
            aria-label="Home"
          >
            <Logo size={32} />
          </button>
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
            <CapacityBar capacity={capacity} compact hideLabels className="" />
            {screen === 'focus' && focusStats && (
              <div
                className="flex items-center justify-between"
                style={{
                  fontFamily: 'var(--font-pixel)',
                  fontSize: '9.5px',
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  lineHeight: 1,
                  color: focusStats.isBonus ? '#92400e' : 'var(--aria-subtext)',
                }}
              >
                <span>{focusStats.label}</span>
                <span className="flex gap-2">
                  {focusStats.done && <span>{focusStats.done}</span>}
                  <span>{focusStats.remaining}</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="pt-[56px] md:pt-0">
        {screen === 'capture'  && <Capture onNavigate={setScreen} />}
        {screen === 'tournament' && <Tournament onDone={handleTriageDone} />}
        {screen === 'focus'    && <Focus onGoToList={() => setScreen('today')} onTriage={() => setScreen('tournament')} onNavigate={setScreen} onStatsChange={setFocusStats} />}
        {screen === 'today'    && <Today visibleLimit={user?.task_visible_limit ?? 10} carriedOver={carriedOver} onTournament={() => setScreen('tournament')} />}
        {screen === 'inbox'    && <Inbox />}
        {screen === 'waiting'  && <Waiting />}
        {screen === 'routines' && <Routines />}
        {screen === 'selfcare'  && <SelfCare userId={user?.id} />}
        {screen === 'settings'  && <Settings onNavigate={setScreen} user={user} />}
        {screen === 'tasks'     && <AllTasks />}
        {screen === 'projects'  && <Projects onNavigate={setScreen} />}
      </main>

      {/* Desktop sign out */}
      <div className="hidden md:flex fixed left-0 bottom-0 z-50 w-20 flex-col items-center pb-4">
        {user && (
          <button onClick={handleLogout} className="text-[9px] text-white/60 hover:text-white transition-colors px-2 text-center leading-tight">
            Sign<br />out
          </button>
        )}
      </div>

      <BottomNav active={screen} onNavigate={setScreen} onCapture={() => setScreen('capture')} />
    </div>
  )
}

export default function App() {
  const [authed, setAuthed]           = useState(isLoggedIn())
  const [preAuthScreen, setPreAuthScreen] = useState(
    () => window.location.pathname === '/signup' ? 'signup' : 'login'
  )
  const [showChip, setShowChip] = useState(readShowBuildChip)
  const inviteToken = new URLSearchParams(window.location.search).get('invite')

  useEffect(() => {
    const handler = () => setShowChip(readShowBuildChip())
    window.addEventListener('aria:build-chip-changed', handler)
    return () => window.removeEventListener('aria:build-chip-changed', handler)
  }, [])

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
      {showChip && (
        <div style={{
          position: 'fixed', bottom: 'calc(96px + env(safe-area-inset-bottom))', right: 6, zIndex: 9999,
          background: 'transparent', color: 'var(--aria-subtext)', fontWeight: 500,
          padding: 0, fontSize: 9, fontFamily: 'monospace',
          pointerEvents: 'none', textAlign: 'right', lineHeight: '1.3', opacity: 0.55,
        }}>
          <div>{typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'dev'}</div>
        </div>
      )}
      {authed
        ? <AppShell />
        : <Login onLogin={() => setAuthed(true)} onGoSignup={() => { window.history.replaceState({}, '', '/signup'); setPreAuthScreen('signup') }} />
      }
    </ThemeProvider>
  )
}
