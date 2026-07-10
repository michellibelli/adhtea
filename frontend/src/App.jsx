import { useState, useEffect, useRef } from 'react'

const BUILD_CHIP_KEY = 'show_build_chip'
function readShowBuildChip() {
  const v = localStorage.getItem(BUILD_CHIP_KEY)
  return v === null ? true : v === 'true'
}

import { ThemeProvider } from './context/ThemeContext'
import { isLoggedIn, needsMorningLogin, likelySleeping, warmUp } from './api/client'
import { getMe, logout } from './api/auth'
import { getTodayLog, getTodayCapacity } from './api/selfcare'
import { createTask } from './api/tasks'
import Login from './pages/Login'
import Register from './pages/Register'
import Signup from './pages/Signup'
import AlphaChallenge from './pages/AlphaChallenge'
import Capture from './pages/Capture'
// Tournament removed — triage merged into Today page
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

// Screens that fetch data on mount and emit aria:page-loaded when it lands.
// Only these get a loading cover on navigation — instant/form pages (capture,
// settings, etc.) would just flash it, so they're excluded.
const COVER_SCREENS = new Set(['focus', 'today', 'selfcare'])

const DIARY_PROMPTS = [
  'How are you feeling right now?',
  "What's on your mind?",
  'Any dreams, thoughts, or feelings to get out?',
  'What does your body need today?',
  'What are you carrying into today?',
]

function getDiaryConfig() {
  const lastLog   = localStorage.getItem('aria_last_log_date')
  const today     = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const hour      = new Date().getHours()
  const isMorning = hour >= 5 && hour < 12

  if (lastLog === today) {
    return {
      heading:     "You've already logged today.",
      prompt:      DIARY_PROMPTS[Math.floor(Math.random() * DIARY_PROMPTS.length)],
      placeholder: 'thoughts, feelings, anything...',
      noteTitle:   'Diary entry',
    }
  }
  if (isMorning && lastLog !== yesterday) {
    return {
      heading:     'No log from yesterday.',
      prompt:      'What did you do? Any wins, struggles, or moments worth remembering?',
      placeholder: 'yesterday was...',
      noteTitle:   'Yesterday recap',
    }
  }
  return {
    heading:     'While you wait —',
    prompt:      'What have you done so far today?',
    placeholder: 'or just wait, no pressure',
    noteTitle:   'Morning check-in',
  }
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
  const [checkInLog, setCheckInLog]           = useState(undefined)
  const [needsAlphaChallenge, setNeedsAlphaChallenge] = useState(false)
  const [showOnboarding, setShowOnboarding]   = useState(false)
  const [diaryEntry, setDiaryEntry]           = useState('')
  const [diaryConfig]                         = useState(getDiaryConfig)
  const [serverUp, setServerUp]               = useState(false)
  const [showWake, setShowWake]               = useState(false)
  const [coverPageReady, setCoverPageReady]   = useState(false)
  const [wakeReady, setWakeReady]             = useState(false)
  const [wakeDiary, setWakeDiary]             = useState('')
  const wakePromptRef = useRef('')
  const wakeDiaryRef = useRef('')
  const diaryRef = useRef('')
  const prevScreenRef = useRef('focus')
  const pageLoadedRef = useRef(false)
  const coverInitDoneRef = useRef(false)
  const [refreshKey, setRefreshKey]           = useState(0)

  useEffect(() => {
    getMe()
      .then(async (u) => {
        setUser(u)
        setServerUp(true)

        if (diaryRef.current.trim()) {
          createTask({
            title:     diaryConfig.noteTitle,
            task_type: 'note',
            notes:     diaryRef.current.trim(),
          }).then(() => {
            localStorage.setItem('aria_last_log_date', new Date().toISOString().split('T')[0])
          }).catch(() => {})
        }

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

        // Decide the morning self-care gate / EOD BEFORE revealing the app so
        // the user lands on the right screen (never flashes Focus then yanks to
        // the gate). getMe has already warmed the server, so getTodayLog is
        // fast — await it directly. A timeout here would risk skipping the gate
        // on a cold morning, which is exactly the bug we're avoiding.
        try {
          const log = await getTodayLog()
          setCheckInLog(log)   // hand to the gate so it paints without a 2nd fetch
          const hour = new Date().getHours()
          const isMorningWindow = hour < 14
          if (!log && isMorningWindow) {
            setShowCheckIn(true)
          } else if (log && isEODWindow(u)) {
            setShowEOD(true)
          }
        } catch { /* slow/cold server — proceed without blocking */ }
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [])

  // Raise the full-screen loading cover for the page we're about to show. The
  // page mounts and fetches *underneath* the cover; it lifts only once that
  // page's data has loaded (aria:page-loaded), so the user never sees the bare
  // "…" skeleton while a cold Render server spins up.
  const raiseCover = () => {
    setWakeDiary('')
    wakeDiaryRef.current = ''
    setWakeReady(false)
    setCoverPageReady(false)
    wakePromptRef.current = DIARY_PROMPTS[Math.floor(Math.random() * DIARY_PROMPTS.length)]
    setShowWake(true)
  }

  // Cover the destination on every in-session screen change. NOT on the first
  // reveal: the full-screen `!ready` loading screen already covered the cold
  // wait, so raising a second (differently-styled) cover on top of it just
  // reads as "two loading screens." Let the freshly-revealed page show its own
  // quick skeleton on the now-warm server instead.
  useEffect(() => {
    if (!ready) return
    const changed = screen !== prevScreenRef.current
    const initial = !coverInitDoneRef.current
    if (!changed && !initial) return
    prevScreenRef.current = screen
    coverInitDoneRef.current = true
    if (initial) return
    // Instant/form pages (capture, settings) have no data fetch and emit no
    // page-loaded — covering them just flashes the loader. Skip.
    if (!COVER_SCREENS.has(screen)) return
    pageLoadedRef.current = false

    const onLoad = () => { pageLoadedRef.current = true }
    window.addEventListener('aria:page-loaded', onLoad)

    if (likelySleeping()) {
      raiseCover()
      return () => window.removeEventListener('aria:page-loaded', onLoad)
    }
    // Warm server: only cover if the page is actually slow, to avoid a flash on
    // fast navigations (fast pages emit aria:page-loaded well under this delay).
    const timer = setTimeout(() => { if (!pageLoadedRef.current) raiseCover() }, 1200)
    return () => { clearTimeout(timer); window.removeEventListener('aria:page-loaded', onLoad) }
  }, [screen, ready])

  // While the cover is up: update the "brewing/almost there" label as the server
  // responds, and auto-lift only once the page's DATA has actually loaded
  // (coverPageReady) — never merely because the server socket answered, which
  // would reveal the "…" skeleton. Manual Continue also gates on coverPageReady,
  // so pressing it can never drop the user onto a still-loading page.
  useEffect(() => {
    if (!showWake) return
    const markReady = () => { if (!likelySleeping()) setWakeReady(true) }
    markReady()
    const interval = setInterval(markReady, 500)

    let settle
    const pageReady = (delay) => {
      setCoverPageReady(true)
      if (wakeDiaryRef.current.trim()) return   // respect an in-progress journal entry
      clearTimeout(settle)
      settle = setTimeout(() => dismissWake(), delay)
    }
    // Preferred: the page's own data landed (instrumented pages: Focus/Today/SelfCare).
    const onPageLoaded = () => pageReady(500)
    // Fallback for pages that emit no page-loaded: a beat after the server
    // answers, give the quick warm refetch time to paint (page-loaded wins if both).
    const onAwake = () => pageReady(1500)
    window.addEventListener('aria:page-loaded', onPageLoaded)
    window.addEventListener('aria:server-awake', onAwake)

    const hard = setTimeout(() => dismissWake(), 60000)   // safety: never trap the user (cold Render wake ~30-45s)

    return () => {
      clearInterval(interval)
      clearTimeout(settle)
      clearTimeout(hard)
      window.removeEventListener('aria:server-awake', onAwake)
      window.removeEventListener('aria:page-loaded', onPageLoaded)
    }
  }, [showWake])

  // Returning to an already-open tab after the server has likely slept (e.g.
  // away 2h). Raise the loading cover, wake the server, and remount the current
  // screen (bump refreshKey) so it refetches — the cover lifts on the fresh
  // page's aria:page-loaded. Without this, the user would click through a stale
  // cached list while the server silently warms in the background.
  useEffect(() => {
    if (!ready) return
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return
      if (!likelySleeping()) return
      // warmUp fires aria:server-waking, which raises the cover and refetches
      // (see the aria:server-waking effect below) — single source of truth.
      warmUp(() => {}).catch(() => {})
    }
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)
    return () => {
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('focus', onReturn)
    }
  }, [ready])

  // Reactive: any request that hits a sleeping server (client.js fires
  // aria:server-waking once per wake cycle) raises the cover and refetches the
  // current page. Covers the visible-tab case — e.g. app left open on a second
  // monitor while the server naps — where visibilitychange never fires. The
  // action that triggered the wake is already queued in localStorage, so
  // nothing is lost; this just gives the wake a loading screen and fresh data.
  useEffect(() => {
    if (!ready) return
    const onWaking = () => {
      raiseCover()
      setRefreshKey(k => k + 1)
    }
    window.addEventListener('aria:server-waking', onWaking)
    return () => window.removeEventListener('aria:server-waking', onWaking)
  }, [ready])

  function dismissWake() {
    if (wakeDiaryRef.current.trim()) {
      createTask({
        title: 'Diary entry',
        task_type: 'note',
        notes: wakeDiaryRef.current.trim(),
      }).catch(() => {})
    }
    setShowWake(false)
  }

  function handleLogout() { logout().then(() => window.location.reload()) }

  // handleTriageDone + openTriage removed — triage merged into Today

  if (!ready) {
    return (
      <div className="aria-page flex flex-col items-center justify-center px-6 pb-12">
        <div className="flex flex-col items-center w-full max-w-xs">

          <div className="relative mb-4">
            <span className="steam-wisp" style={{ left: 8,  bottom: '88%', height: 18, background: 'rgba(120,110,90,0.45)', '--steam-dur': '2.9s', '--steam-delay': '0s' }} />
            <span className="steam-wisp" style={{ left: 26, bottom: '92%', height: 22, background: 'rgba(120,110,90,0.40)', '--steam-dur': '3.4s', '--steam-delay': '0.7s' }} />
            <span className="steam-wisp" style={{ left: 17, bottom: '90%', height: 20, background: 'rgba(120,110,90,0.42)', '--steam-dur': '3.1s', '--steam-delay': '1.4s' }} />
            <Logo size={56} />
          </div>

          <p
            className="text-sm text-ui-subtext mb-6"
            style={{ fontFamily: 'Caveat, cursive', fontSize: 18, letterSpacing: '0.02em' }}
          >{serverUp ? 'almost there…' : 'brewing…'}</p>

          <div className="w-full">
            <div className="rounded-xl border border-ui-border/60 bg-ui-card/80 px-4 py-4 backdrop-blur-sm">
              <p className="text-[10px] font-semibold text-ui-accent uppercase tracking-widest mb-1">
                {diaryConfig.heading}
              </p>
              <p className="text-sm text-ui-subtext mb-3">{diaryConfig.prompt}</p>
              <textarea
                value={diaryEntry}
                onChange={(e) => { setDiaryEntry(e.target.value); diaryRef.current = e.target.value }}
                placeholder={diaryConfig.placeholder}
                rows={4}
                className="w-full rounded-lg border border-ui-border/60 bg-ui-bg px-3 py-2 text-sm text-ui-text placeholder-ui-subtext/50 resize-none focus:outline-none focus:border-ui-accent transition-colors"
              />
              {diaryEntry.trim() && !serverUp && (
                <p className="text-[10px] text-ui-accent mt-1.5">
                  will be saved when server wakes
                </p>
              )}
            </div>
          </div>
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

      {/* key includes refreshKey so a return-from-sleep remounts the current
          page and it refetches fresh data instead of showing the stale cache. */}
      <main className="pt-[64px] relative z-10" key={refreshKey}>
        {screen === 'capture'  && <Capture onNavigate={setScreen} />}
        {screen === 'focus'    && <Focus onGoToList={() => setScreen('today')} onNavigate={setScreen} />}
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

      {showWake && (
        <div className="aria-page fixed inset-0 z-50 flex flex-col items-center justify-center px-6 pb-12" style={{ background: 'var(--aria-surface)' }}>
          <div className="flex flex-col items-center w-full max-w-xs">
            <div className="relative mb-4">
              <span className="steam-wisp" style={{ left: 8,  bottom: '88%', height: 18, background: 'rgba(120,110,90,0.45)', '--steam-dur': '2.9s', '--steam-delay': '0s' }} />
              <span className="steam-wisp" style={{ left: 26, bottom: '92%', height: 22, background: 'rgba(120,110,90,0.40)', '--steam-dur': '3.4s', '--steam-delay': '0.7s' }} />
              <span className="steam-wisp" style={{ left: 17, bottom: '90%', height: 20, background: 'rgba(120,110,90,0.42)', '--steam-dur': '3.1s', '--steam-delay': '1.4s' }} />
              <Logo size={56} />
            </div>

            <p
              className="text-sm text-ui-subtext mb-6"
              style={{ fontFamily: 'Caveat, cursive', fontSize: 18, letterSpacing: '0.02em' }}
            >{wakeReady ? 'ready when you are' : 'brewing…'}</p>

            <div className="w-full">
              <div className="rounded-xl px-4 py-4" style={{ border: '1.5px solid var(--aria-border)', background: 'var(--aria-card, var(--aria-surface))', boxShadow: '0 2px 16px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.5)' }}>
                <p className="text-[10px] font-semibold text-ui-accent uppercase tracking-widest mb-1">
                  While you wait —
                </p>
                <p className="text-sm text-ui-subtext mb-3">
                  {wakePromptRef.current}
                </p>
                <textarea
                  value={wakeDiary}
                  onChange={(e) => { setWakeDiary(e.target.value); wakeDiaryRef.current = e.target.value }}
                  placeholder="or just wait, no pressure"
                  rows={4}
                  className="w-full rounded-lg px-3 py-2 text-sm text-ui-text placeholder-ui-subtext/50 resize-none focus:outline-none transition-colors"
                  style={{ border: '1.5px solid var(--aria-border)', background: 'var(--aria-surface)' }}
                />
                {wakeDiary.trim() && !wakeReady && (
                  <p className="text-[10px] text-ui-accent mt-1.5">
                    will be saved when server wakes
                  </p>
                )}
              </div>
            </div>

            {/* Continue only appears once the page's data is actually loaded, so
                it can never drop the user onto a still-loading "…" screen. Non-
                journaling users are auto-dismissed; this is mainly for someone
                mid-diary who wants to finish and proceed. */}
            {coverPageReady && (
              <button
                onClick={dismissWake}
                className="mt-4 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300"
                style={{
                  background: 'var(--aria-accent)',
                  color: 'var(--aria-bg)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                }}
              >
                {wakeDiary.trim() ? 'Save & continue' : 'Continue'}
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

export default function App() {
  // Require a fresh login each morning even if the 30-day token is still valid.
  const [authed, setAuthed]           = useState(isLoggedIn() && !needsMorningLogin())
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

  // Wake the (free-tier, likely-sleeping) server in parallel while the user is
  // on the login screen, so submitting credentials doesn't then wait ~40s for
  // the cold start. No-op if already warm.
  useEffect(() => {
    if (!authed && likelySleeping()) warmUp(() => {}).catch(() => {})
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
