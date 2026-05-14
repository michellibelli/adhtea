import { useState, useEffect } from 'react'
import { ThemeProvider } from './context/ThemeContext'
import { isLoggedIn, likelySleeping } from './api/client'
import WakeScreen from './components/WakeScreen'
import { getMe, logout } from './api/auth'
import { getTodayLog } from './api/selfcare'
import Login from './pages/Login'
import Register from './pages/Register'
import Signup from './pages/Signup'
import AlphaChallenge from './pages/AlphaChallenge'
import Capture from './pages/Capture'
import Triage from './pages/Triage'
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
  const [carriedOver, setCarriedOver]         = useState(false)
  const [ready, setReady]                     = useState(false)
  const [showEOD, setShowEOD]                 = useState(false)
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
        if (isEODWindow(u)) {
          try {
            const log = await getTodayLog()
            if (!log) setShowEOD(true)
          } catch { /* non-blocking */ }
        }
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

  if (showEOD) {
    return <EODGate onComplete={() => setShowEOD(false)} />
  }

  return (
    <div className="min-h-screen">
      <PageProgress trigger={screen} />
      {/* Mobile top bar */}
      <header className="fixed top-0 left-0 right-0 z-40 backdrop-blur-md md:hidden" style={{background:'#2A0E58', borderBottom:'4px solid #6A3090'}}>
        <div className="pride-stripe" />
        <div className="flex items-center justify-between px-5 h-14">
          <button
            onClick={() => setScreen('focus')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <img src="/adhTeaLogo.png" alt="adhTea" className="h-10 w-10 object-contain rounded-lg" />
          </button>
          {user && (
            <span className="text-xs" style={{color:'#6A4080'}}>{user.name}</span>
          )}
        </div>
      </header>

      <main className="pt-[57px] md:pt-0">
        {screen === 'capture'  && <Capture onNavigate={setScreen} />}
        {screen === 'triage'   && <Triage onTriageDone={handleTriageDone} />}
        {screen === 'focus'    && <Focus onGoToList={() => setScreen('today')} onTriage={() => setScreen('triage')} onNavigate={setScreen} />}
        {screen === 'today'    && <Today visibleLimit={user?.task_visible_limit ?? 10} carriedOver={carriedOver} onTriage={() => setScreen('triage')} />}
        {screen === 'inbox'    && <Inbox />}
        {screen === 'waiting'  && <Waiting />}
        {screen === 'routines' && <Routines />}
        {screen === 'selfcare'  && <SelfCare />}
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
  const inviteToken = new URLSearchParams(window.location.search).get('invite')

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
      <div style={{
        position: 'fixed', top: 4, right: 4, zIndex: 9999,
        background: 'rgba(74,50,96,0.85)', color: '#F5E6D3', fontWeight: 600,
        padding: '2px 7px', fontSize: 10, fontFamily: 'monospace',
        borderRadius: 4, pointerEvents: 'none',
        border: '1px solid rgba(245,230,211,0.25)',
      }}>{typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'dev'}</div>
      {authed
        ? <AppShell />
        : <Login onLogin={() => setAuthed(true)} onGoSignup={() => { window.history.replaceState({}, '', '/signup'); setPreAuthScreen('signup') }} />
      }
    </ThemeProvider>
  )
}
