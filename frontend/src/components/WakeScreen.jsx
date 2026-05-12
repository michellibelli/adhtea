import { useState, useEffect } from 'react'
import { warmUp } from '../api/client'

const PRIDE = 'linear-gradient(to right, #ED8E89, #F7B685, #F3EBA5, #94C691, #9BD6D9, #B4A8E0)'

export default function WakeScreen({ onReady }) {
  const [log, setLog] = useState([])
  const [done, setDone] = useState(false)

  function addLog(msg) {
    setLog((prev) => [...prev, { msg, ts: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }])
  }

  useEffect(() => {
    warmUp(addLog).then(() => {
      setDone(true)
      setTimeout(onReady, 600)
    })
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: '#FFFDF5' }}>

      {/* Rainbow stripe */}
      <div className="fixed top-0 left-0 right-0 h-1" style={{ background: PRIDE }} />

      {/* Logo */}
      <div className="mb-8">
        <img src="/adhTeaLogo.png" alt="adhTea"
          className="w-24 object-contain"
          style={{ imageRendering: 'pixelated' }} />
      </div>

      {/* Log terminal */}
      <div className="w-full max-w-xs rounded-sm border-2 border-[#E8D8C8] bg-[#FDF8EE] px-4 py-3 font-mono text-xs text-[#7A6152] space-y-1.5 min-h-[80px]">
        {log.map((entry, i) => (
          <div key={i} className="flex gap-2 items-start animate-fade-in">
            <span className="text-[#C8B8A8] shrink-0">{entry.ts}</span>
            <span className={done && i === log.length - 1 ? 'text-[#94C691]' : ''}>{entry.msg}</span>
          </div>
        ))}
        {!done && (
          <div className="flex gap-1 pt-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#B4A8E0] animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )}
      </div>

      <p className="mt-4 text-[10px] text-[#C8B8A8]">
        free tier server — wakes up on first visit
      </p>
    </div>
  )
}
