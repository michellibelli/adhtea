import { useState, useEffect, useCallback } from 'react'
import { getInbox, getToday, scheduleToday, snoozeTask, deleteTask, getCriticalList, completeTask } from '../api/tasks'
import { getTodayCapacity } from '../api/selfcare'
import TriageCard from '../components/TriageCard'
import CapacityBar from '../components/CapacityBar'
import Card from '../components/Card'
import Button from '../components/Button'

const LOAD_CONFIG = {
  clear:       { label: 'No tasks yet',  color: 'text-ui-subtext',   bar: 'bg-ui-border',   pct: 0   },
  light:       { label: 'Light day',     color: 'text-emerald-400',  bar: 'bg-emerald-400', pct: 25  },
  manageable:  { label: 'Manageable',    color: 'text-blue-400',     bar: 'bg-blue-400',    pct: 55  },
  heavy:       { label: 'Heavy day',     color: 'text-amber-400',    bar: 'bg-amber-400',   pct: 80  },
  overloaded:  { label: 'Overloaded',    color: 'text-red-400',      bar: 'bg-red-400',     pct: 100 },
}

const WEIGHTS = { light: 1, medium: 2, heavy: 3 }

function computeLoad(tasks) {
  if (!tasks.length) return 'clear'
  const sum = tasks.reduce((a, t) => a + (WEIGHTS[t.weight] || 2), 0)
  if (sum <= 6)  return 'light'
  if (sum <= 12) return 'manageable'
  if (sum <= 18) return 'heavy'
  return 'overloaded'
}

// Persist triage-done state per calendar day
const TRIAGE_KEY = 'aria_triage_done'
export function markTriageDone() { localStorage.setItem(TRIAGE_KEY, new Date().toDateString()) }
export function wasTriageDoneToday() { return localStorage.getItem(TRIAGE_KEY) === new Date().toDateString() }

// ─── Critical list (low-focus fallback) ─────────────────────────────────────

function CriticalList({ onDone }) {
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCriticalList()
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleComplete(id) {
    await completeTask(id)
    setItems((prev) => prev.filter((t) => t.id !== id))
  }

  const TYPE_BADGE = {
    appointment: { label: 'Appt',    color: 'bg-blue-500/20 text-blue-400' },
    routine:     { label: 'Routine', color: 'bg-purple-500/20 text-purple-400' },
    task:        { label: 'Urgent',  color: 'bg-red-500/20 text-red-400' },
  }

  if (loading) {
    return <div className="aria-page flex items-center justify-center"><p className="text-sm text-ui-subtext">Loading…</p></div>
  }

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-2xl mx-auto w-full">

        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-2xl font-semibold text-ui-text">Low-focus day</h1>
            <p className="text-sm text-ui-subtext mt-0.5">Your must-not-miss items</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onDone} className="mt-1">
            Go to Today →
          </Button>
        </div>

        <div className="mb-5 px-4 py-3 rounded-xl bg-ui-surface border border-ui-border">
          <p className="text-xs text-ui-subtext leading-relaxed">
            Focus is low — that's okay. This is your short list: hard deadlines, appointments, and the routines that matter most.
            Everything else can wait.
          </p>
        </div>

        {items.length === 0 ? (
          <Card className="mt-8 text-center px-8 py-12">
            <div className="text-4xl mb-4">✦</div>
            <p className="text-base font-medium text-ui-text mb-2">Nothing critical today</p>
            <p className="text-sm text-ui-subtext mb-6">No urgent tasks, appointments, or critical routines due.</p>
            <Button onClick={onDone}>Go to Today's List</Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((task) => {
              const badge = TYPE_BADGE[task.task_type] || TYPE_BADGE.task
              return (
                <Card key={task.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.color}`}>
                          {badge.label}
                        </span>
                        {task.due_time && (
                          <span className="text-xs text-ui-subtext">{task.due_time}</span>
                        )}
                      </div>
                      <p className="text-sm text-ui-text font-medium truncate">{task.title}</p>
                      {task.notes && (
                        <p className="text-xs text-ui-subtext mt-0.5 line-clamp-1">{task.notes}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleComplete(task.id)}
                      className="flex-shrink-0 w-7 h-7 rounded-full border border-ui-border flex items-center justify-center text-ui-subtext hover:border-ui-accent hover:text-ui-accent transition-colors"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                  </div>
                </Card>
              )
            })}

            <div className="mt-6 text-center">
              <Button variant="secondary" onClick={onDone}>Done — go to Today</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


// ─── Main triage flow ────────────────────────────────────────────────────────

export default function Triage({ onTriageDone }) {
  const [inboxItems, setInboxItems]   = useState([])
  const [todayItems, setTodayItems]   = useState([])
  const [capacity,   setCapacity]     = useState(null)
  const [loading, setLoading]         = useState(true)
  const [showCritical, setShowCritical] = useState(false)
  const [dismissedOverload, setDismissedOverload] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      const [inbox, today, cap] = await Promise.all([getInbox(), getToday(), getTodayCapacity()])
      setInboxItems(inbox)
      setTodayItems(today)
      setCapacity(cap)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const load    = computeLoad(todayItems)
  const loadCfg = LOAD_CONFIG[load]
  const remaining = inboxItems.length

  async function handleScheduleToday(id, meta) {
    await scheduleToday(id, meta)
    const task = inboxItems.find((t) => t.id === id)
    if (task) {
      setInboxItems((prev) => prev.filter((t) => t.id !== id))
      setTodayItems((prev) => [...prev, { ...task, ...meta, status: 'today' }])
    }
  }

  async function handleSnooze(id, until) {
    await snoozeTask(id, until)
    setInboxItems((prev) => prev.filter((t) => t.id !== id))
  }

  async function handleDelete(id) {
    await deleteTask(id)
    setInboxItems((prev) => prev.filter((t) => t.id !== id))
  }

  function handleDone() {
    markTriageDone()
    onTriageDone?.()
  }

  if (loading) {
    return <div className="aria-page flex items-center justify-center"><p className="text-sm text-ui-subtext">Loading…</p></div>
  }

  // Show critical list when skip is pressed
  if (showCritical) {
    return <CriticalList onDone={handleDone} />
  }

  // Triage complete state
  if (remaining === 0) {
    return (
      <div className="aria-page">
        <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-2xl mx-auto w-full">
          <Card className="mt-16 text-center px-8 py-12">
            <div className="text-4xl mb-4">✦</div>
            <h2 className="text-lg font-semibold text-ui-text mb-2">Triage complete</h2>
            <p className="text-sm text-ui-subtext mb-2">
              {todayItems.length === 0
                ? 'Nothing on your plate today. Add something from Capture, or enjoy the space.'
                : `${todayItems.length} task${todayItems.length !== 1 ? 's' : ''} on your list.`}
            </p>

            {todayItems.length > 0 && (
              <div className="mt-4 mb-6">
                <div className="flex items-center justify-between text-xs mb-1.5 px-1">
                  <span className="text-ui-subtext">Today's load</span>
                  <span className={loadCfg.color}>{loadCfg.label}</span>
                </div>
                <div className="h-1.5 rounded-full bg-ui-border overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${loadCfg.bar}`} style={{ width: `${loadCfg.pct}%` }} />
                </div>
              </div>
            )}

            <Button size="lg" onClick={handleDone}>Go to Today's List</Button>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-2xl mx-auto w-full">

        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-2xl font-semibold text-ui-text">Triage</h1>
            <p className="text-sm text-ui-subtext mt-0.5">
              {remaining} item{remaining !== 1 ? 's' : ''} to review
            </p>
          </div>
          {/* Skip → shows critical list */}
          <Button variant="ghost" size="sm" onClick={() => setShowCritical(true)} className="mt-1">
            Low focus →
          </Button>
        </div>

        {/* Capacity */}
        <CapacityBar capacity={capacity} compact />

        {/* Live load indicator */}
        <div className="mb-5">
          <div className="flex items-center justify-between text-xs mb-1.5 px-0.5">
            <span className="text-ui-subtext">Today's load · {todayItems.length} scheduled</span>
            <span className={`font-medium ${loadCfg.color}`}>{loadCfg.label}</span>
          </div>
          <div className="h-1.5 rounded-full bg-ui-border overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${loadCfg.bar}`} style={{ width: `${loadCfg.pct}%` }} />
          </div>
        </div>

        {/* Overloaded warning */}
        {load === 'overloaded' && !dismissedOverload && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-between gap-3">
            <p className="text-sm text-red-400">You have more than a full day here. What moves?</p>
            <button onClick={() => setDismissedOverload(true)} className="text-red-400/60 hover:text-red-400 text-xs flex-shrink-0">
              Dismiss
            </button>
          </div>
        )}

        {/* Inbox items to triage */}
        <div className="space-y-3">
          {inboxItems.map((task) => (
            <TriageCard
              key={task.id}
              task={task}
              onScheduleToday={handleScheduleToday}
              onSnooze={handleSnooze}
              onDelete={handleDelete}
            />
          ))}
        </div>

        {/* Done early */}
        <div className="mt-6 text-center">
          <Button variant="secondary" onClick={handleDone}>
            Done triaging — go to Today
          </Button>
        </div>
      </div>
    </div>
  )
}
