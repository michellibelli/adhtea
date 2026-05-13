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

  useEffect(() => {
    getMe()
      .then(async (u) => {
        setUser(u)
        if (u.needs_alpha_challenge) {
          setNeedsAlphaChallenge(true)
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
            <img src="/adhTeaLogo.png" alt="adhTea" className="h-10 object-contain" style={{imageRendering:'pixelated'}}/>
          </button>
          {user && (
            <span className="text-xs" style={{color:'#6A4080'}}>{user.name}</span>
          )}
        </div>
      </header>

      {/* Ambient twinkling stars */}
      <div aria-hidden="true">
        <span className="star-field-star" style={{top:'7%',  left:'18%', color:'#C490D1', fontSize:'13px', '--star-opacity':0.28, '--star-dur':'5.2s', '--star-delay':'0s'}}>✦</span>
        <span className="star-field-star" style={{top:'19%', left:'68%', color:'#F06B9A', fontSize:'9px',  '--star-opacity':0.22, '--star-dur':'4.1s', '--star-delay':'1.3s'}}>✧</span>
        <span className="star-field-star" style={{top:'38%', left:'82%', color:'#F7A165', fontSize:'11px', '--star-opacity':0.2,  '--star-dur':'6.8s', '--star-delay':'0.7s'}}>✦</span>
        <span className="star-field-star" style={{top:'54%', left:'9%',  color:'#9D8FD6', fontSize:'8px',  '--star-opacity':0.25, '--star-dur':'4.9s', '--star-delay':'2.1s'}}>✧</span>
        <span className="star-field-star" style={{top:'70%', left:'55%', color:'#6DC8CC', fontSize:'12px', '--star-opacity':0.2,  '--star-dur':'5.7s', '--star-delay':'0.4s'}}>✦</span>
        <span className="star-field-star" style={{top:'83%', left:'28%', color:'#F0E07A', fontSize:'9px',  '--star-opacity':0.3,  '--star-dur':'3.8s', '--star-delay':'1.8s'}}>✧</span>
        <span className="star-field-star" style={{top:'12%', left:'44%', color:'#7BC97A', fontSize:'7px',  '--star-opacity':0.18, '--star-dur':'6.2s', '--star-delay':'3.0s'}}>✦</span>
        <span className="star-field-star" style={{top:'62%', left:'91%', color:'#C490D1', fontSize:'10px', '--star-opacity':0.22, '--star-dur':'5.0s', '--star-delay':'1.0s'}}>✧</span>
      </div>

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
  const [authed, setAuthed]           = useState(isLoggedIn())
  const [warming, setWarming]         = useState(() => isLoggedIn() && likelySleeping())
  const [preAuthScreen, setPreAuthScreen] = useState(
    () => window.location.pathname === '/signup' ? 'signup' : 'login'
  )
  const inviteToken = new URLSearchParams(window.location.search).get('invite')

  function handleAuthed() {
    window.history.replaceState({}, '', '/')
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
      {authed
        ? <AppShell />
        : <Login onLogin={() => setAuthed(true)} onGoSignup={() => { window.history.replaceState({}, '', '/signup'); setPreAuthScreen('signup') }} />
      }
    </ThemeProvider>
  )
}
