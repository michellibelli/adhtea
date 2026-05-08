// TriageCard — a task card optimised for the morning triage ritual.
// Shows inline weight / urgency / desire selectors so the user can
// set metadata and schedule in one compact interaction.

import { useState } from 'react'
import Card from './Card'
import Button from './Button'
import SnoozeSheet from './SnoozeSheet'

const TYPE_ICONS = { task: '✦', appointment: '◷', routine: '↻', note: '◈' }

// Pill selector — renders a row of small toggle buttons
function PillSelector({ label, options, value, onChange }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-ui-subtext uppercase tracking-wider w-14 flex-shrink-0">{label}</span>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(value === opt.value ? null : opt.value)}
            className={`px-2 py-0.5 rounded-lg text-xs font-medium border transition-all duration-100 ${
              value === opt.value
                ? 'bg-ui-primary text-ui-primary-text border-transparent'
                : 'border-ui-border text-ui-subtext hover:text-ui-accent hover:border-ui-accent/40'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function TriageCard({ task, onScheduleToday, onSnooze, onDelete }) {
  const [weight,    setWeight]    = useState(task.weight    ?? 'medium')
  const [priority,  setPriority]  = useState(task.priority  ?? null)
  const [desire,    setDesire]    = useState(task.desire    ?? null)
  const [showMeta,  setShowMeta]  = useState(false)
  const [showSnooze, setShowSnooze] = useState(false)
  const [leaving,   setLeaving]   = useState(false)

  function handleSchedule() {
    setLeaving(true)
    setTimeout(() => onScheduleToday(task.id, { weight, priority, desire }), 300)
  }

  function handleSnooze(isoDate) {
    setShowSnooze(false)
    setLeaving(true)
    setTimeout(() => onSnooze(task.id, isoDate), 300)
  }

  function handleDelete() {
    setLeaving(true)
    setTimeout(() => onDelete(task.id), 300)
  }

  return (
    <>
      <Card className={`px-4 py-3 transition-all duration-300 ${leaving ? 'opacity-0 scale-95' : 'opacity-100'}`}>
        {/* Title row */}
        <div className="flex items-start gap-2 mb-3">
          <span className="text-xs mt-0.5 flex-shrink-0 text-ui-accent">{TYPE_ICONS[task.task_type] || '✦'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ui-text leading-snug">{task.title}</p>
            {task.notes && (
              <p className="text-xs text-ui-subtext mt-0.5 line-clamp-1">{task.notes}</p>
            )}
          </div>
          {/* Expand/collapse meta toggle */}
          <button
            onClick={() => setShowMeta(!showMeta)}
            className="text-ui-subtext hover:text-ui-accent transition-colors flex-shrink-0 mt-0.5"
            title="Set priority"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
              <circle cx="8" cy="4" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="12" r="1.5" />
            </svg>
          </button>
        </div>

        {/* Inline meta selectors (collapsed by default) */}
        {showMeta && (
          <div className="space-y-2 mb-3 pl-4 border-l-2 border-ui-border">
            <PillSelector
              label="Weight"
              value={weight}
              onChange={setWeight}
              options={[
                { value: 'light',  label: 'Light' },
                { value: 'medium', label: 'Medium' },
                { value: 'heavy',  label: 'Heavy' },
              ]}
            />
            <PillSelector
              label="Urgent"
              value={priority}
              onChange={setPriority}
              options={[
                { value: 'urgent', label: 'Yes' },
                { value: 'normal', label: 'No' },
              ]}
            />
            <PillSelector
              label="Desire"
              value={desire}
              onChange={setDesire}
              options={[
                { value: 'high',   label: '↑' },
                { value: 'medium', label: '=' },
                { value: 'low',    label: '↓' },
              ]}
            />
          </div>
        )}

        {/* Action row */}
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSchedule} className="flex-1">
            → Today
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setShowSnooze(true)}>
            ◷
          </Button>
          <Button size="sm" variant="danger" onClick={handleDelete}>
            ✕
          </Button>
        </div>
      </Card>

      {showSnooze && (
        <SnoozeSheet onSnooze={handleSnooze} onClose={() => setShowSnooze(false)} />
      )}
    </>
  )
}
