import { useState } from 'react'
import { createPortal } from 'react-dom'
import Card from './Card'
import Button from './Button'

// Post-completion ask — appears once the celebration animation finishes.
// "Save" = work, minutes recorded. "Not work" = personal, no minutes kept.
// Mirrors NudgeModal's portal/backdrop/Card shape for visual consistency.
export default function MinutesPrompt({ title, defaultMinutes, onSave, onSkip }) {
  const [value, setValue] = useState(defaultMinutes != null ? String(defaultMinutes) : '')

  function save() {
    const n = parseInt(value, 10)
    onSave(Number.isFinite(n) && n >= 0 ? n : null)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[20vh] overflow-y-auto"
      style={{ background: 'rgba(60,40,20,0.35)', backdropFilter: 'blur(2px)' }}
      onClick={onSkip}
    >
      <Card
        className="px-6 py-5 max-w-sm w-full"
        style={{ background: 'color-mix(in srgb, var(--aria-surface) 80%, transparent)', backdropFilter: 'blur(8px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <span className="text-3xl flex-shrink-0" aria-hidden="true">🍵</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ui-text truncate">{title}</p>
            <p className="text-xs text-ui-subtext mt-0.5">How many minutes was that?</p>
          </div>
        </div>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save() }}
          placeholder="min"
          className="w-full text-lg text-center bg-ui-input border border-ui-input-border rounded-xl px-3 py-2.5 text-ui-text outline-none focus:border-ui-accent transition-colors mb-4"
        />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onSkip}>Not work</Button>
          <Button onClick={save}>Save</Button>
        </div>
      </Card>
    </div>,
    document.body,
  )
}
