import { useState, useEffect } from 'react'
import { ThemeProvider } from './context/ThemeContext'
import { isLoggedIn } from './api/client'
import { getMe, logout } from './api/auth'
import { getInbox } from './api/tasks'
import { getTodayLog } from './api/selfcare'
import Login from './pages/Login'
import Capture from './pages/Capture'
import Triage, { wasTriageDoneToday } from './pages/Triage'
import Focus from './pages/Focus'
import Today from './pages/Today'
import Inbox from './pages/Inbox'
import Waiting from './pages/Waiting'
import Routines from './pages/Routines'
import SelfCare from './pages/SelfCare'
import EODGate from './pages/EODGate'
import Settings from './pages/Settings'
import BottomNav from './components/BottomNav'
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

// Determine the right opening screen:
// morning + triage not done today + inbox has items → triage
// otherwise → today
async function getOpeningScreen(user) {
  // Show triage if: it's at/after triage start hour AND not done today AND inbox has items
  const hour  = new Date().getHours()
  const start = user?.triage_start_hour ?? 8
  if (hour >= start && !wasTriageDoneToday()) {
    try {
      const inbox = await getInbox()
      if (inbox.length > 0) return 'triage'
    } catch { /* fall through */ }
  }
  return 'focus'
}

function AppShell() {
  const [screen, setScreen]           = useState('today')
  const [user, setUser]               = useState(null)
  const [carriedOver, setCarriedOver] = useState(false)
  const [ready, setReady]             = useState(false)
  const [showEOD, setShowEOD]         = useState(false)

  useEffect(() => {
    getMe()
      .then(async (u) => {
        setUser(u)
        const opening = await getOpeningScreen(u)
        setScreen(opening)
        // Check EOD gate: evening window + no log yet today
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

  if (showEOD) {
    return <EODGate onComplete={() => setShowEOD(false)} />
  }

  return (
    <div className="min-h-screen">
      {/* Mobile top bar */}
      <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-5 h-14 bg-ui-nav border-b border-ui-nav-border backdrop-blur-md md:hidden">
        <button
          onClick={() => setScreen('focus')}
          className="text-base font-bold tracking-widest text-ui-accent hover:opacity-70 transition-opacity"
        >
          ARIA
        </button>
        {user && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-ui-subtext">{user.name}</span>
            <button onClick={handleLogout} className="text-xs text-ui-subtext hover:opacity-70 transition-opacity">
              Sign out
            </button>
          </div>
        )}
      </header>

      <main className="pt-14 md:pt-0">
        {screen === 'capture'  && <Capture />}
        {screen === 'triage'   && <Triage onTriageDone={handleTriageDone} />}
        {screen === 'focus'    && <Focus onGoToList={() => setScreen('today')} onTriage={() => setScreen('triage')} />}
        {screen === 'today'    && <Today visibleLimit={user?.task_visible_limit ?? 10} carriedOver={carriedOver} onTriage={() => setScreen('triage')} />}
        {screen === 'inbox'    && <Inbox />}
        {screen === 'waiting'  && <Waiting />}
        {screen === 'routines' && <Routines />}
        {screen === 'selfcare'  && <SelfCare />}
        {screen === 'settings'  && <Settings onNavigate={setScreen} />}
      </main>

      {/* Desktop sign out */}
      <div className="hidden md:flex fixed left-0 bottom-0 z-50 w-20 flex-col items-center pb-4">
        {user && (
          <button onClick={handleLogout} className="text-[9px] text-ui-subtext hover:opacity-70 transition-opacity px-2 text-center leading-tight">
            Sign<br />out
          </button>
        )}
      </div>

      <BottomNav active={screen} onNavigate={setScreen} onCapture={() => setScreen('capture')} />
    </div>
  )
}

export default function App() {
  const [authed, setAuthed] = useState(isLoggedIn())
  return (
    <ThemeProvider>
      {authed ? <AppShell /> : <Login onLogin={() => setAuthed(true)} />}
    </ThemeProvider>
  )
}
