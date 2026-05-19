import { useState, useEffect } from 'react'

const BUILD_CHIP_KEY = 'show_build_chip'
function readShowBuildChip() {
  const v = localStorage.getItem(BUILD_CHIP_KEY)
  return v === null ? true : v === 'true'
}

// Six tea-leaf SVGs drifting top-to-bottom across the viewport. Sizes,
// columns, durations, and (negative) delays are set per-leaf in
// index.css so they appear scattered from page load. Pointer-events
// none + fixed under-everything z-index keeps them purely decorative.
function FallingLeaves() {
  return (
    <div className="falling-leaves" aria-hidden="true">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <svg key={i} className={`falling-leaf falling-leaf-${i}`} viewBox="0 0 12 24">
          <path d="M 6 0 C 13 5 13 18 6 22 C -1 18 -1 5 6 0 Z" fill="rgba(24,59,78,0.45)" />
          <line x1="6" y1="2" x2="6" y2="20" stroke="rgba(24,59,78,0.65)" strokeWidth="0.6" strokeLinecap="round" />
        </svg>
      ))}
    </div>
  )
}
import { ThemeProvider } from './context/ThemeContext'
import { isLoggedIn, likelySleeping } from './api/client'
import WakeScreen from './components/WakeScreen'
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
import PageProgress from './components/PageProgress'
import './App.css'

// Returns true if current hour is within triage window
function isMorningWindow(user) {
  const hour  = new Date().getHours()
  const start = user?.triage_start_hour ?? 6
  const end   = user?.triage_end_hour   ?? 10
  return hour >= start && hour < end
}

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
        // guess. Gate is dismissed the moment a log exists.
        try {
          const log = await getTodayLog()
          if (!log) {
            setShowCheckIn(true)
          } else if (isEODWindow(u)) {
            // Already checked in this morning; still pop the EOD gate in the
            // evening if there's no closing entry.
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
    return <div className="aria-page flex items-center justify-center"><p className="text-sm text-ui-subtext">…</p></div>
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
      {/* Mobile top bar */}
      <header className="fixed top-0 left-0 right-0 z-40 backdrop-blur-md md:hidden bg-ui-nav border-b-4 border-ui-nav-border">
        <div className="pride-stripe" />
        <div className="flex items-center gap-3 px-4 h-[84px]">
          <button
            onClick={() => setScreen('focus')}
            className="flex-shrink-0 hover:opacity-80 transition-opacity"
          >
            <img src="/adhTeaLogo.png" alt="adhTea" className="h-16 w-16 object-contain rounded-xl" />
          </button>
          <div className="flex-1 min-w-0">
            <CapacityBar capacity={capacity} compact hideLabels className="" />
          </div>
        </div>
      </header>

      <main className="pt-[88px] md:pt-0">
        {screen === 'capture'  && <Capture onNavigate={setScreen} />}
        {screen === 'tournament' && <Tournament onDone={handleTriageDone} />}
        {screen === 'focus'    && <Focus onGoToList={() => setScreen('today')} onTriage={() => setScreen('tournament')} onNavigate={setScreen} />}
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
  const [warming, setWarming]         = useState(() => isLoggedIn() && likelySleeping())
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
    setWarming(true)
    setAuthed(true)
  }

  if (warming) {
    return (
      <ThemeProvider>
        <WakeScreen onReady={() => setWarming(false)} />
      </ThemeProvider>
    )
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
      <FallingLeaves />
      {showChip && (
        <div style={{
          position: 'fixed', top: 4, right: 4, zIndex: 9999,
          background: 'rgba(74,50,96,0.85)', color: '#F5E6D3', fontWeight: 600,
          padding: '2px 7px', fontSize: 10, fontFamily: 'monospace',
          borderRadius: 4, pointerEvents: 'none', textAlign: 'right', lineHeight: '1.5',
          border: '1px solid rgba(245,230,211,0.25)',
        }}>
          <div>build {typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'dev'}</div>
          <div style={{fontWeight:400, opacity:0.75}}>{new Date().toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'2-digit'})}</div>
        </div>
      )}
      {authed
        ? <AppShell />
        : <Login onLogin={() => setAuthed(true)} onGoSignup={() => { window.history.replaceState({}, '', '/signup'); setPreAuthScreen('signup') }} />
      }
    </ThemeProvider>
  )
}
