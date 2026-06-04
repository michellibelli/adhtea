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
// BottomNav removed — nav items live in CafeShelf on Focus/Today pages
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
          className="flex items-center gap-3 px-5 w-full backdrop-blur-md transition-colors duration-300"
          style={{
            pointerEvents: 'auto',
            height: 54,
            background: focusStats?.isBonus
              ? 'linear-gradient(135deg, rgba(251,191,36,0.4) 0%, rgba(180,130,20,0.3) 100%)'
              : 'linear-gradient(180deg, #F5ECD7 0%, #E8DCC8 100%)',
            border: focusStats?.isBonus
              ? '2.5px solid rgba(180,130,20,0.5)'
              : '2.5px solid color-mix(in srgb, var(--aria-text) 22%, transparent)',
            borderRadius: 16,
            maxWidth: 360,
            boxShadow: '0 3px 12px rgba(40,24,10,0.16), 0 1px 4px rgba(40,24,10,0.10), inset 0 1px 0 rgba(255,248,224,0.4)',
          }}
        >
          <button
            onClick={() => setScreen('focus')}
            className="flex-shrink-0 hover:opacity-80 transition-opacity"
            aria-label="Home"
          >
            <Logo size={28} />
          </button>
          {/* Floral vine accent */}
          <div className="flex-1 flex items-center justify-center overflow-hidden" style={{ opacity: 0.2 }}>
            <svg viewBox="0 0 200 20" fill="none" style={{ width: '100%', height: 16 }}>
              <path d="M0 10 Q25 2 50 10 Q75 18 100 10 Q125 2 150 10 Q175 18 200 10" stroke="var(--aria-text)" strokeWidth={0.8} fill="none" />
              <circle cx="50" cy="10" r="2.5" fill="none" stroke="var(--aria-text)" strokeWidth={0.6} />
              <circle cx="47" cy="8" r="1.2" fill="none" stroke="var(--aria-text)" strokeWidth={0.5} />
              <circle cx="53" cy="8" r="1.2" fill="none" stroke="var(--aria-text)" strokeWidth={0.5} />
              <circle cx="100" cy="10" r="3" fill="none" stroke="var(--aria-text)" strokeWidth={0.7} />
              <circle cx="96" cy="8" r="1.5" fill="none" stroke="var(--aria-text)" strokeWidth={0.5} />
              <circle cx="104" cy="8" r="1.5" fill="none" stroke="var(--aria-text)" strokeWidth={0.5} />
              <circle cx="100" cy="6" r="1" fill="none" stroke="var(--aria-text)" strokeWidth={0.4} />
              <circle cx="150" cy="10" r="2.5" fill="none" stroke="var(--aria-text)" strokeWidth={0.6} />
              <circle cx="147" cy="8" r="1.2" fill="none" stroke="var(--aria-text)" strokeWidth={0.5} />
              <circle cx="153" cy="8" r="1.2" fill="none" stroke="var(--aria-text)" strokeWidth={0.5} />
              {/* Small leaves along vine */}
              <path d="M30 10 Q28 6 32 7" stroke="var(--aria-text)" strokeWidth={0.5} fill="none" />
              <path d="M70 10 Q72 14 68 13" stroke="var(--aria-text)" strokeWidth={0.5} fill="none" />
              <path d="M130 10 Q128 6 132 7" stroke="var(--aria-text)" strokeWidth={0.5} fill="none" />
              <path d="M170 10 Q172 14 168 13" stroke="var(--aria-text)" strokeWidth={0.5} fill="none" />
            </svg>
          </div>
          <button
            onClick={() => setScreen('settings')}
            className="flex-shrink-0 p-1 rounded-md hover:opacity-70 transition-opacity"
            aria-label="Settings"
            style={{ opacity: 0.4 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--aria-text)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
              <ellipse cx="12" cy="7" rx="2.5" ry="3.5" />
              <ellipse cx="17" cy="12" rx="3.5" ry="2.5" />
              <ellipse cx="12" cy="17" rx="2.5" ry="3.5" />
              <ellipse cx="7" cy="12" rx="3.5" ry="2.5" />
              <circle cx="12" cy="12" r="2.5" fill="var(--aria-text)" fillOpacity="0.2" stroke="var(--aria-text)" />
            </svg>
          </button>
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
