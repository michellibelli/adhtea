import { useState, useEffect, useRef } from 'react'
import { warmUp } from '../api/client'
import { createTask } from '../api/tasks'

const PRIDE = 'linear-gradient(to right, #ED8E89, #F7B685, #F3EBA5, #94C691, #9BD6D9, #B4A8E0)'

const DIARY_PROMPTS = [
  'How are you feeling right now?',
  'What\'s on your mind?',
  'Any dreams, thoughts, or feelings to get out?',
  'What does your body need today?',
  'What are you carrying into today?',
]

function toDateStr(d) {
  return d.toISOString().split('T')[0]
}

function getPromptConfig() {
  const lastLog  = localStorage.getItem('aria_last_log_date')  // 'YYYY-MM-DD' or null
  const today    = toDateStr(new Date())
  const yesterday= toDateStr(new Date(Date.now() - 86400000))
  const hour     = new Date().getHours()
  const isMorning = hour >= 5 && hour < 12

  if (lastLog === today) {
    return {
      heading:     'You\'ve already logged today.',
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

function fmt(s) {
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

export default function WakeScreen({ onReady }) {
  const [log,    setLog]    = useState([])
  const [done,   setDone]   = useState(false)
  const [secs,   setSecs]   = useState(0)
  const [entry,  setEntry]  = useState('')
  const [saving, setSaving] = useState(false)
  const config = useRef(getPromptConfig())

  function addLog(msg) {
    setLog((prev) => [...prev, {
      msg,
      ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    }])
  }

  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    warmUp(addLog).then(async () => {
      setDone(true)
      if (entry.trim()) {
        setSaving(true)
        try {
          await createTask({
            title:     config.current.noteTitle,
            task_type: 'note',
            notes:     entry.trim(),
          })
          localStorage.setItem('aria_last_log_date', toDateStr(new Date()))
        } catch (_) { /* non-blocking */ }
        setSaving(false)
      }
      setTimeout(onReady, 500)
    })
  }, [])

  const { heading, prompt, placeholder } = config.current

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 pb-12"
      style={{ background: '#FFFDF5' }}>

      <div className="fixed top-0 left-0 right-0 h-1" style={{ background: PRIDE }} />

      {/* Logo */}
      <div className="mb-6">
        <img src="/adhTeaLogo.png" alt="adhTea"
          className="w-20 object-contain"
          style={{ imageRendering: 'pixelated' }} />
      </div>

      {/* Server status log */}
      <div className="w-full max-w-xs rounded-sm border-2 border-[#E8D8C8] bg-[#FDF8EE] px-4 py-3 font-mono text-xs text-[#7A6152] space-y-1.5 min-h-[64px]">
        {log.map((e, i) => (
          <div key={i} className="flex gap-2 items-start">
            <span className="text-[#C8B8A8] shrink-0">{e.ts}</span>
            <span className={done && i === log.length - 1 ? 'text-[#94C691] font-medium' : ''}>
              {e.msg}
            </span>
          </div>
        ))}
        {!done && (
          <div className="flex items-center gap-2 pt-0.5">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#B4A8E0] animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <span className="text-[#C8B8A8] tabular-nums">{fmt(secs)}</span>
          </div>
        )}
        {saving && <div className="text-[#B4A8E0]">saving your note...</div>}
      </div>

      {/* Log / diary section — hides when done */}
      {!done && (
        <div className="w-full max-w-xs mt-6">
          <p className="text-[11px] font-semibold text-[#B4A8E0] uppercase tracking-widest mb-1">
            {heading}
          </p>
          <p className="text-sm text-[#7A6152] mb-3">{prompt}</p>

          <textarea
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            placeholder={placeholder}
            rows={5}
            className="w-full rounded-sm border-2 border-[#E8D8C8] bg-[#FDF8EE] px-3 py-2 text-sm text-[#3D2B1F] placeholder-[#C8B8A8] resize-none focus:outline-none focus:border-[#B4A8E0] transition-colors"
          />

          {entry.trim() && (
            <p className="text-[10px] text-[#B4A8E0] mt-1.5">
              ✓ will be saved as a note when server wakes
            </p>
          )}
        </div>
      )}
    </div>
  )
}
