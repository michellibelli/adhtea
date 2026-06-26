import { useState, useEffect } from 'react'
import { warmUp } from '../api/client'
import { createTask } from '../api/tasks'

const TOTAL_WAIT = 60

const DIARY_PROMPTS = [
  'How are you feeling right now?',
  "What's on your mind?",
  'Any dreams, thoughts, or feelings to get out?',
  'What does your body need today?',
  'What are you carrying into today?',
]


function toDateStr(d) {
  return d.toISOString().split('T')[0]
}

function getPromptConfig() {
  const lastLog   = localStorage.getItem('aria_last_log_date')
  const today     = toDateStr(new Date())
  const yesterday = toDateStr(new Date(Date.now() - 86400000))
  const hour      = new Date().getHours()
  const isMorning = hour >= 5 && hour < 12

  if (lastLog === today) {
    return {
      heading:     "You've already logged today.",
      prompt:      DIARY_PROMPTS[Math.floor(Math.random() * DIARY_PROMPTS.length)],
      placeholder: 'thoughts, feelings, anything...',
      noteTitle:   '📓 Diary entry',
    }
  }
  if (isMorning && lastLog !== yesterday) {
    return {
      heading:     'No log from yesterday.',
      prompt:      'What did you do? Any wins, struggles, or moments worth remembering?',
      placeholder: 'yesterday was...',
      noteTitle:   '📓 Yesterday recap',
    }
  }
  return {
    heading:     'While you wait —',
    prompt:      'What have you done so far today?',
    placeholder: 'or just wait, no pressure ☕',
    noteTitle:   '📓 Morning check-in',
  }
}

// Animated connecting dots
function ConnectingDots() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-[#B4A8E0] mr-1">connecting</span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block w-2 h-2 rounded-full bg-[#B4A8E0]"
          style={{ animation: `dot-pulse 1.4s ease-in-out infinite`, animationDelay: `${i * 0.22}s` }}
        />
      ))}
    </div>
  )
}

// Hourglass that flips on an interval
function AnimatedTimer({ countdown, serverUp }) {
  const [flipped, setFlipped] = useState(false)
  useEffect(() => {
    if (serverUp) return
    const id = setInterval(() => setFlipped((f) => !f), 1200)
    return () => clearInterval(id)
  }, [serverUp])

  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="text-4xl"
        style={{
          display: 'inline-block',
          transition: 'transform 0.4s ease',
          transform: flipped ? 'rotate(180deg)' : 'rotate(0deg)',
          filter: serverUp ? 'grayscale(0)' : 'none',
        }}
      >
        ⏳
      </span>
      {!serverUp && countdown > 0 && (
        <span className="text-[11px] text-[#B4A8E0] tabular-nums font-mono">~{countdown}s</span>
      )}
      {!serverUp && countdown <= 0 && (
        <span className="text-[11px] text-[#B4A8E0]">almost...</span>
      )}
    </div>
  )
}

export default function WakeScreen({ onReady }) {
  const [splashDone, setSplashDone] = useState(false)
  const [serverUp,   setServerUp]   = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [ready,      setReady]      = useState(false)
  const [countdown,  setCountdown]  = useState(TOTAL_WAIT)
  const [entry,      setEntry]      = useState('')
  const [config] = useState(getPromptConfig)

  // Splash: 5 seconds then show wake phase
  useEffect(() => {
    const id = setTimeout(() => setSplashDone(true), 5000)
    return () => clearTimeout(id)
  }, [])

  // Countdown ticks only during wake phase, stops when server up
  useEffect(() => {
    if (!splashDone || serverUp || countdown <= 0) return
    const id = setTimeout(() => setCountdown((c) => Math.max(0, c - 1)), 1000)
    return () => clearTimeout(id)
  }, [splashDone, countdown, serverUp])

  // Wake server — starts immediately (runs in background during splash too)
  useEffect(() => {
    warmUp(() => {}).then(async () => {
      setServerUp(true)
      if (entry.trim()) {
        setSaving(true)
        try {
          await createTask({
            title:     config.noteTitle,
            task_type: 'note',
            notes:     entry.trim(),
          })
          localStorage.setItem('aria_last_log_date', toDateStr(new Date()))
        } catch (_) { /* non-blocking */ }
        setSaving(false)
      }
      setReady(true)
    })
    // Mount-only: warmUp callback closes over the entry value at warmUp resolution.
    // Re-running on each keystroke would re-trigger warmUp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { heading, prompt, placeholder } = config

  // ── Splash phase ──────────────────────────────────────────────────────────
  if (!splashDone) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
        style={{ background: '#FFFDF5' }}
      >
        <div className="relative z-10 flex flex-col items-center">
          <img
            src="/adhTeaLogo.png"
            alt="adhTea"
            className="object-contain rounded-3xl"
            style={{ width: '220px' }}
          />
        </div>
      </div>
    )
  }

  // ── Wake phase ────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 pb-12 relative overflow-hidden"
      style={{ background: '#FFFDF5' }}
    >
      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-xs">

        {/* Logo */}
        <div className="mb-5">
          <img
            src="/adhTeaLogo.png"
            alt="adhTea"
            className="w-16 object-contain opacity-80 rounded-xl"
          />
        </div>

        {/* Timer + connecting indicator */}
        <div className="mb-6 flex flex-col items-center gap-3">
          <AnimatedTimer countdown={countdown} serverUp={serverUp} />
          {!serverUp && <ConnectingDots />}
          {serverUp && saving && (
            <span className="text-xs text-[#B4A8E0]">saving your note...</span>
          )}
          {ready && (
            <button
              onClick={onReady}
              className="mt-1 px-5 py-2 rounded-sm border-2 border-[#B4A8E0] bg-[#B4A8E0] text-[#3D2B1F] text-sm font-semibold hover:bg-[#A498D0] hover:border-[#A498D0] active:scale-95 transition-all"
            >
              Let's go →
            </button>
          )}
        </div>

        {/* Diary section — always visible */}
        <div className="w-full">
          <div className="rounded-sm border-2 border-[#E8D8C8] bg-[#FDF8EE]/90 px-4 py-4 backdrop-blur-sm">
            <p className="text-[10px] font-semibold text-[#B4A8E0] uppercase tracking-widest mb-1">
              {heading}
            </p>
            <p className="text-sm text-[#7A6152] mb-3">{prompt}</p>
            <textarea
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              placeholder={placeholder}
              rows={4}
              className="w-full rounded-sm border-2 border-[#E8D8C8] bg-[#FFFDF5] px-3 py-2 text-sm text-[#3D2B1F] placeholder-[#C8B8A8] resize-none focus:outline-none focus:border-[#B4A8E0] transition-colors"
            />
            {entry.trim() && !serverUp && (
              <p className="text-[10px] text-[#B4A8E0] mt-1.5">
                ✓ will be saved when server wakes
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
