import { useEffect, useState } from 'react'
import { DndContext, closestCenter, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { upsertLog, getDailySummary } from '../api/selfcare'
import { getDoneToday, updateTask } from '../api/tasks'
import { SmartPointerSensor } from '../utils/dnd'
import Button from '../components/Button'

function formatMinutes(total) {
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// ─── Work log screen ─────────────────────────────────────────────────────────
// Retrospective by default (docs/time-tracking.md) — most items arrive here
// already classified by the post-completion prompt or capture-time ask. This
// screen is the correction pass: drag to fix a wrong call, and the source for
// the daily copy-paste to her boss (work list only).

function MinutesInlineInput({ onCommit }) {
  const [value, setValue] = useState('')
  function commit() {
    const n = parseInt(value, 10)
    if (Number.isFinite(n) && n >= 0) onCommit(n)
  }
  return (
    <input
      type="number"
      inputMode="numeric"
      min="0"
      placeholder="min"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
      className="w-14 text-xs text-right bg-ui-input border border-ui-input-border rounded-lg px-1.5 py-1 text-ui-text outline-none focus:border-ui-accent transition-colors"
    />
  )
}

function DraggableTaskRow({ task, onMinutesCommit }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    touchAction: 'none',
  }
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className="flex items-start gap-2 bg-ui-surface border border-ui-border rounded-lg px-2.5 py-2 cursor-grab active:cursor-grabbing"
    >
      <span className="flex-1 min-w-0 text-xs text-ui-text break-words">{task.title}</span>
      {task.minutes_spent != null
        ? <span className="text-xs text-ui-subtext flex-shrink-0 pt-px">{task.minutes_spent}m</span>
        : onMinutesCommit && <MinutesInlineInput onCommit={onMinutesCommit} />}
    </div>
  )
}

function DropZone({ id, label, count, children }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-0 min-h-[100px] rounded-xl border-2 border-dashed p-2 space-y-1.5 transition-colors ${
        isOver ? 'border-ui-accent bg-ui-accent/5' : 'border-ui-border'
      }`}
    >
      <p className="text-[10px] font-semibold text-ui-subtext uppercase tracking-wide mb-1 px-0.5">
        {label} ({count})
      </p>
      {children}
    </div>
  )
}

function LogScreen({ onContinue }) {
  const [tasks,  setTasks]  = useState(null)   // null = loading; plain tasks only
  const [copied, setCopied] = useState(false)
  const sensors = useSensors(
    useSensor(SmartPointerSensor, { activationConstraint: { distance: 6 } }),
  )

  useEffect(() => {
    getDoneToday()
      .then((done) => setTasks(done.filter((t) => t.task_type === 'task' && !t.completed_retroactively)))
      .catch(() => setTasks([]))
  }, [])

  function patchTask(id, patch) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    updateTask(id, patch).catch(() => {})
  }

  function handleDragEnd({ active, over }) {
    if (!over) return
    const isWork = over.id === 'zone-work'
    if (!isWork && over.id !== 'zone-notwork') return
    patchTask(active.id, { is_work: isWork })
  }

  async function handleCopy() {
    const lines = workItems
      .filter((t) => t.minutes_spent != null)
      .map((t) => `${t.title} — ${formatMinutes(t.minutes_spent)}`)
    const total = workItems.reduce((sum, t) => sum + (t.minutes_spent || 0), 0)
    const text = [...lines, '', `Total: ${formatMinutes(total)}`].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked — text is still on screen to select by hand
    }
  }

  const list = tasks || []
  // Unclassified (null) bucket with not-work — fail-closed, matches every
  // other default in this feature: nothing reaches the boss unless it was
  // actively marked work.
  const workItems    = list.filter((t) => t.is_work === true)
  const notWorkItems = list.filter((t) => t.is_work !== true)
  const anyMinutes = workItems.some((t) => t.minutes_spent != null)
  const total = workItems.reduce((sum, t) => sum + (t.minutes_spent || 0), 0)

  return (
    <div className="aria-page flex items-center justify-center">
      <div className="px-6 pb-32 md:pb-8 max-w-md w-full">

        <div className="text-4xl mb-3 text-center">🍵</div>
        <h2 className="text-xl font-semibold text-ui-text mb-1 text-center">Today's work</h2>
        <p className="text-sm text-ui-subtext mb-4 text-center">
          Drag to fix a wrong call. Dropping into Work asks for minutes if it doesn't have any yet.
        </p>

        {tasks === null && <p className="text-sm text-ui-subtext text-center">Loading…</p>}

        {tasks?.length === 0 && (
          <p className="text-sm text-ui-subtext text-center mb-6">Nothing marked done today.</p>
        )}

        {tasks && tasks.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex gap-2 mb-4">
              <DropZone id="zone-work" label="Work" count={workItems.length}>
                {workItems.map((t) => (
                  <DraggableTaskRow key={t.id} task={t} onMinutesCommit={(m) => patchTask(t.id, { minutes_spent: m })} />
                ))}
              </DropZone>
              <DropZone id="zone-notwork" label="Not work" count={notWorkItems.length}>
                {notWorkItems.map((t) => (
                  <DraggableTaskRow key={t.id} task={t} />
                ))}
              </DropZone>
            </div>
          </DndContext>
        )}

        {anyMinutes && (
          <p className="text-xs text-ui-subtext text-center mb-3">Total: {formatMinutes(total)}</p>
        )}

        {tasks && tasks.length > 0 && (
          <Button size="lg" variant="secondary" className="w-full mb-3" onClick={handleCopy} disabled={!anyMinutes}>
            {copied ? 'Copied!' : 'Copy for boss'}
          </Button>
        )}

        <Button size="lg" className="w-full" onClick={onContinue}>Continue</Button>
      </div>
    </div>
  )
}

const MOODS = [
  { value: 1, emoji: '😔', label: 'Rough' },
  { value: 2, emoji: '😕', label: 'Low' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '✨', label: 'Great' },
]

function warmSummary(summary, moodValue) {
  const { tasks_done_count = 0, routines_done_count = 0, medications_taken = 0 } = summary
  const total = tasks_done_count + routines_done_count
  const mood = MOODS.find((m) => m.value === moodValue)

  const lines = []

  if (total === 0 && medications_taken === 0) {
    lines.push("Today was hard, and that's real. You're still here, and that matters.")
    lines.push("Rest is part of the work. Tomorrow is a fresh start.")
  } else {
    if (routines_done_count > 0) {
      lines.push(
        routines_done_count === 1
          ? `You kept up with a routine today — that's the quiet kind of strength.`
          : `You kept up with ${routines_done_count} routine${routines_done_count > 1 ? 's' : ''} — that consistency adds up more than you know.`
      )
    }
    if (tasks_done_count > 0) {
      lines.push(
        tasks_done_count === 1
          ? `You got one thing done. Sometimes one is everything.`
          : `You crossed ${tasks_done_count} thing${tasks_done_count > 1 ? 's' : ''} off your list. That's real progress.`
      )
    }
    if (medications_taken > 0) {
      lines.push(`You took care of your medication. Taking care of yourself is an act of love.`)
    }
  }

  if (mood && mood.value <= 2) {
    lines.push("Even on the low days, you're doing something right by just showing up.")
  } else if (mood && mood.value >= 4) {
    lines.push("That energy you're carrying? Hold onto it.")
  }

  lines.push("You're doing better than you think. See you tomorrow. 💛")

  return lines
}

// ─── Summary screen ──────────────────────────────────────────────────────────

function SummaryScreen({ summary, moodValue, onContinue }) {
  const lines = warmSummary(summary, moodValue)
  const mood  = MOODS.find((m) => m.value === moodValue)
  const total = (summary.tasks_done_count || 0) + (summary.routines_done_count || 0)

  return (
    <div className="aria-page flex items-center justify-center">
      <div className="px-6 pb-32 md:pb-8 max-w-sm w-full text-center">

        <div className="text-5xl mb-3">{mood?.emoji || '✨'}</div>
        <h2 className="text-xl font-semibold text-ui-text mb-1">
          {mood?.value >= 4 ? 'You had a good day.' : mood?.value >= 3 ? 'You made it through.' : 'You showed up today.'}
        </h2>

        {/* Stats row */}
        {total > 0 && (
          <div className="flex items-center justify-center gap-4 mt-4 mb-6">
            {summary.tasks_done_count > 0 && (
              <div className="text-center">
                <div className="text-2xl font-bold text-ui-accent">{summary.tasks_done_count}</div>
                <div className="text-xs text-ui-subtext">task{summary.tasks_done_count !== 1 ? 's' : ''}</div>
              </div>
            )}
            {summary.routines_done_count > 0 && (
              <div className="text-center">
                <div className="text-2xl font-bold text-ui-accent">{summary.routines_done_count}</div>
                <div className="text-xs text-ui-subtext">routine{summary.routines_done_count !== 1 ? 's' : ''}</div>
              </div>
            )}
            {summary.medications_taken > 0 && (
              <div className="text-center">
                <div className="text-2xl font-bold text-ui-accent">{summary.medications_taken}</div>
                <div className="text-xs text-ui-subtext">med{summary.medications_taken !== 1 ? 's' : ''}</div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-3 mb-8 text-left">
          {lines.map((line, i) => (
            <p key={i} className="text-sm text-ui-subtext leading-relaxed">{line}</p>
          ))}
        </div>

        <Button size="lg" onClick={onContinue}>Start a new day</Button>
      </div>
    </div>
  )
}


// ─── EOD Gate ────────────────────────────────────────────────────────────────

export default function EODGate({ onComplete }) {
  const [step,    setStep]    = useState('log')   // 'log' -> 'mood' -> summary
  const [mood,    setMood]    = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [summary, setSummary] = useState(null)

  async function handleSubmit() {
    if (!mood) return
    setSaving(true)
    try {
      await upsertLog({ mood })
      localStorage.setItem('aria_last_log_date', new Date().toISOString().split('T')[0])
      const s = await getDailySummary()
      setSummary(s)
    } catch (err) {
      console.error(err)
      onComplete()
    } finally {
      setSaving(false)
    }
  }

  if (step === 'log') {
    return <LogScreen onContinue={() => setStep('mood')} />
  }

  if (summary) {
    return <SummaryScreen summary={summary} moodValue={mood} onContinue={onComplete} />
  }

  return (
    <div className="aria-page flex items-center justify-center">
      <div className="px-6 pb-32 md:pb-8 max-w-sm w-full text-center">

        <div className="text-4xl mb-3">🌙</div>
        <h2 className="text-xl font-semibold text-ui-text mb-1">End of day check-in</h2>
        <p className="text-sm text-ui-subtext mb-8">Just one question, the rest is optional.</p>

        {/* Mood — required */}
        <div className="mb-8">
          <p className="text-xs text-ui-subtext mb-3">How did today feel?</p>
          <div className="flex justify-center gap-3">
            {MOODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMood(m.value)}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
                  mood === m.value
                    ? 'bg-ui-primary/20 ring-1 ring-ui-accent/40 scale-110'
                    : 'hover:bg-ui-surface'
                }`}
              >
                <span className="text-2xl">{m.emoji}</span>
                <span className="text-[10px] text-ui-subtext">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        <Button size="lg" disabled={!mood || saving} onClick={handleSubmit}>
          {saving ? '…' : 'Done for today'}
        </Button>

        <button
          onClick={onComplete}
          className="mt-4 block mx-auto text-xs text-ui-subtext/60 hover:text-ui-subtext transition-colors"
        >
          Skip for now
        </button>

      </div>
    </div>
  )
}
