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
  const [triageReturnTo, setTriageReturnTo]   = useState('focus')
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
    setScreen(triageReturnTo)
    setCarriedOver(false)
  }

  function openTriage(returnTo = 'focus') {
    setTriageReturnTo(returnTo)
    setScreen('tournament')
  }

  if (!ready) {
    return (
      <div className="aria-page flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 -mt-12">
          {/* Logo with three warm steam wisps rising off the tea leaf so the
              wake splash reads as "brewing" instead of a blank hold. */}
          <div className="relative">
            <span className="steam-wisp" style={{ left: 8,  bottom: '88%', height: 18, background: 'rgba(120,110,90,0.45)', '--steam-dur': '2.4s', '--steam-delay': '0s' }} />
            <span className="steam-wisp" style={{ left: 26, bottom: '92%', height: 22, background: 'rgba(120,110,90,0.40)', '--steam-dur': '2.8s', '--steam-delay': '0.6s' }} />
            <span className="steam-wisp" style={{ left: 17, bottom: '90%', height: 20, background: 'rgba(120,110,90,0.42)', '--steam-dur': '2.6s', '--steam-delay': '1.2s' }} />
            <Logo size={56} />
          </div>
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
            openTriage('focus')
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
          className={`header-pill flex items-center gap-3 px-5 w-full backdrop-blur-md transition-colors duration-300${focusStats?.isBonus ? ' header-pill-bonus' : ''}`}
          style={{ pointerEvents: 'auto' }}
        >
          {/* TEMP: 4 menu icon candidates for comparison. Pick one, then revert. */}
          <div className="flex-1 flex items-center justify-around">
            {/* 1 — Three tea leaves */}
            <div className="flex flex-col items-center gap-1">
              <svg viewBox="0 0 24 24" fill="none" style={{ width: 26, height: 26 }}>
                <ellipse cx="12" cy="5" rx="5" ry="2.8" transform="rotate(-10 12 5)" fill="var(--aria-text)" fillOpacity="0.15" stroke="var(--aria-text)" strokeWidth={1.2} />
                <ellipse cx="12" cy="12" rx="5.5" ry="2.8" transform="rotate(8 12 12)" fill="var(--aria-text)" fillOpacity="0.15" stroke="var(--aria-text)" strokeWidth={1.2} />
                <ellipse cx="12" cy="19" rx="5" ry="2.8" transform="rotate(-5 12 19)" fill="var(--aria-text)" fillOpacity="0.15" stroke="var(--aria-text)" strokeWidth={1.2} />
                <line x1="7" y1="5" x2="12" y2="5" stroke="var(--aria-text)" strokeWidth={0.8} opacity="0.4" />
                <line x1="6.5" y1="12" x2="12" y2="12" stroke="var(--aria-text)" strokeWidth={0.8} opacity="0.4" />
                <line x1="7" y1="19" x2="12" y2="19" stroke="var(--aria-text)" strokeWidth={0.8} opacity="0.4" />
              </svg>
              <span style={{ fontSize: 8, opacity: 0.5, fontFamily: 'var(--font-pixel)' }}>1</span>
            </div>
            {/* 2 — Three botanical stems */}
            <div className="flex flex-col items-center gap-1">
              <svg viewBox="0 0 24 24" fill="none" style={{ width: 26, height: 26 }}>
                <line x1="4" y1="6" x2="20" y2="6" stroke="var(--aria-text)" strokeWidth={1.3} strokeLinecap="round" opacity="0.5" />
                <ellipse cx="20" cy="5.5" rx="2.2" ry="1.3" transform="rotate(-20 20 5.5)" fill="var(--aria-text)" fillOpacity="0.18" stroke="var(--aria-text)" strokeWidth={0.8} />
                <line x1="4" y1="12" x2="20" y2="12" stroke="var(--aria-text)" strokeWidth={1.3} strokeLinecap="round" opacity="0.5" />
                <ellipse cx="20" cy="11.5" rx="2.2" ry="1.3" transform="rotate(15 20 11.5)" fill="var(--aria-text)" fillOpacity="0.18" stroke="var(--aria-text)" strokeWidth={0.8} />
                <line x1="4" y1="18" x2="20" y2="18" stroke="var(--aria-text)" strokeWidth={1.3} strokeLinecap="round" opacity="0.5" />
                <ellipse cx="20" cy="17.5" rx="2.2" ry="1.3" transform="rotate(-25 20 17.5)" fill="var(--aria-text)" fillOpacity="0.18" stroke="var(--aria-text)" strokeWidth={0.8} />
              </svg>
              <span style={{ fontSize: 8, opacity: 0.5, fontFamily: 'var(--font-pixel)' }}>2</span>
            </div>
            {/* 3 — Mortar & pestle */}
            <div className="flex flex-col items-center gap-1">
              <svg viewBox="0 0 24 24" fill="none" style={{ width: 26, height: 26 }}>
                <path d="M5 11 Q5 20 12 20 Q19 20 19 11" fill="var(--aria-text)" fillOpacity="0.1" stroke="var(--aria-text)" strokeWidth={1.3} strokeLinecap="round" />
                <ellipse cx="12" cy="11" rx="7.5" ry="2.5" fill="var(--aria-text)" fillOpacity="0.08" stroke="var(--aria-text)" strokeWidth={1.2} />
                <line x1="16" y1="10" x2="20" y2="4" stroke="var(--aria-text)" strokeWidth={1.8} strokeLinecap="round" opacity="0.5" />
                <circle cx="20.5" cy="3.5" r="1.5" fill="var(--aria-text)" fillOpacity="0.2" stroke="var(--aria-text)" strokeWidth={0.8} />
              </svg>
              <span style={{ fontSize: 8, opacity: 0.5, fontFamily: 'var(--font-pixel)' }}>3</span>
            </div>
            {/* 4 — Open book / journal */}
            <div className="flex flex-col items-center gap-1">
              <svg viewBox="0 0 24 24" fill="none" style={{ width: 26, height: 26 }}>
                <path d="M12 5 Q8 4 3 5 L3 19 Q8 18 12 19" fill="var(--aria-text)" fillOpacity="0.06" stroke="var(--aria-text)" strokeWidth={1.2} strokeLinejoin="round" />
                <path d="M12 5 Q16 4 21 5 L21 19 Q16 18 12 19" fill="var(--aria-text)" fillOpacity="0.06" stroke="var(--aria-text)" strokeWidth={1.2} strokeLinejoin="round" />
                <line x1="12" y1="5" x2="12" y2="19" stroke="var(--aria-text)" strokeWidth={0.8} opacity="0.3" />
                <line x1="6" y1="9" x2="10" y2="9" stroke="var(--aria-text)" strokeWidth={0.7} opacity="0.25" />
                <line x1="6" y1="12" x2="9" y2="12" stroke="var(--aria-text)" strokeWidth={0.7} opacity="0.25" />
                <line x1="6" y1="15" x2="10" y2="15" stroke="var(--aria-text)" strokeWidth={0.7} opacity="0.25" />
                <ellipse cx="17" cy="11" rx="2" ry="2.5" fill="var(--aria-text)" fillOpacity="0.08" stroke="var(--aria-text)" strokeWidth={0.7} opacity="0.35" />
              </svg>
              <span style={{ fontSize: 8, opacity: 0.5, fontFamily: 'var(--font-pixel)' }}>4</span>
            </div>
          </div>
        </div>
      </header>

      <main className="pt-[64px]">
        {screen === 'capture'  && <Capture onNavigate={setScreen} />}
        {screen === 'tournament' && <Tournament onDone={handleTriageDone} />}
        {screen === 'focus'    && <Focus onGoToList={() => setScreen('today')} onTriage={() => openTriage('focus')} onNavigate={setScreen} onStatsChange={setFocusStats} />}
        {screen === 'today'    && <Today carriedOver={carriedOver} onTournament={() => openTriage('today')} onNavigate={setScreen} />}
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
          position: 'fixed', bottom: 'calc(12px + env(safe-area-inset-bottom))', right: 6, zIndex: 9999,
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
