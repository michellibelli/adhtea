import { useState, useEffect, useRef } from 'react'
import { warmUp } from '../api/client'
import { createTask } from '../api/tasks'

const PRIDE = 'linear-gradient(to right, #ED8E89, #F7B685, #F3EBA5, #94C691, #9BD6D9, #B4A8E0)'

const PROMPTS = [
  'How are you feeling right now?',
  'What\'s on your mind this morning?',
  'One thing you\'re looking forward to today?',
  'Take a breath. What do you notice?',
  'Any dreams, thoughts, or feelings to get out?',
  'What does your body need today?',
]

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

export default function WakeScreen({ onReady }) {
  const [log,     setLog]     = useState([])
  const [done,    setDone]    = useState(false)
  const [secs,    setSecs]    = useState(0)
  const [entry,   setEntry]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const prompt = useRef(PROMPTS[Math.floor(Math.random() * PROMPTS.length)])

  function addLog(msg) {
    setLog((prev) => [...prev, {
      msg,
      ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    }])
  }

  // Tick timer while waiting
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Start warming up
  useEffect(() => {
    warmUp(addLog).then(async () => {
      setDone(true)
      if (entry.trim()) {
        setSaving(true)
        try {
          await createTask({
            title: '📓 Wake-up note',
            task_type: 'note',
            notes: entry.trim(),
          })
        } catch (_) { /* non-blocking — note lost if save fails */ }
        setSaving(false)
      }
      setTimeout(onReady, 500)
    })
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 pb-12"
      style={{ background: '#FFFDF5' }}>

      {/* Rainbow stripe */}
      <div className="fixed top-0 left-0 right-0 h-1" style={{ background: PRIDE }} />

      {/* Logo */}
      <div className="mb-6">
        <img src="/adhTeaLogo.png" alt="adhTea"
          className="w-20 object-contain"
          style={{ imageRendering: 'pixelated' }} />
      </div>

      {/* Status log */}
      <div className="w-full max-w-xs rounded-sm border-2 border-[#E8D8C8] bg-[#FDF8EE] px-4 py-3 font-mono text-xs text-[#7A6152] space-y-1.5 min-h-[64px]">
        {log.map((entry, i) => (
          <div key={i} className="flex gap-2 items-start">
            <span className="text-[#C8B8A8] shrink-0">{entry.ts}</span>
            <span className={done && i === log.length - 1 ? 'text-[#94C691] font-medium' : ''}>
              {entry.msg}
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
        {saving && (
          <div className="text-[#B4A8E0]">saving your note...</div>
        )}
      </div>

      {/* Divider */}
      {!done && (
        <div className="w-full max-w-xs mt-6">
          <p className="text-[10px] text-[#C8B8A8] text-center mb-3 tracking-wide uppercase">
            while you wait
          </p>

          {/* Prompt */}
          <p className="text-sm text-[#7A6152] mb-2 text-center">
            {prompt.current}
          </p>

          {/* Diary textarea */}
          <textarea
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            placeholder="or just wait — no pressure ☕"
            rows={4}
            className="w-full rounded-sm border-2 border-[#E8D8C8] bg-[#FDF8EE] px-3 py-2 text-sm text-[#3D2B1F] placeholder-[#C8B8A8] resize-none focus:outline-none focus:border-[#B4A8E0] transition-colors"
          />

          <p className="text-[10px] text-[#C8B8A8] mt-2 text-center">
            if you write something, it'll be saved as a note when the server wakes
          </p>
        </div>
      )}
    </div>
  )
}
