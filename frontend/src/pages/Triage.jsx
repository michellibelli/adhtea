import { useState, useEffect, useCallback } from 'react'
import { getInbox, getToday, scheduleToday, snoozeTask, updateTask, deleteTask, getCriticalList, completeTask } from '../api/tasks'
import { getTodayCapacity } from '../api/selfcare'
import CapacityBar from '../components/CapacityBar'
import Card from '../components/Card'
import Button from '../components/Button'

// ── Date helpers ─────────────────────────────────────────────────────────────

// Date-only string for due_date (defer)
function dateStr(d) { return d.toISOString().slice(0, 10) }

// Full ISO datetime string for snooze_until
function datetimeStr(d) { return d.toISOString().split('T')[0] + 'T00:00:00.000Z' }

function tomorrow()   { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0,0,0,0); return dateStr(d) }
function endOfWeek()  {
  const d = new Date()
  const dow = d.getDay()
  const toFriday = dow <= 5 ? 5 - dow || 7 : 6
  d.setDate(d.getDate() + toFriday); d.setHours(0,0,0,0); return dateStr(d)
}
function nextMonday() {
  const d = new Date()
  const toMon = (8 - d.getDay()) % 7 || 7
  d.setDate(d.getDate() + toMon); d.setHours(0,0,0,0); return dateStr(d)
}
function oneMonth()   { const d = new Date(); d.setMonth(d.getMonth() + 1); d.setHours(0,0,0,0); return datetimeStr(d) }

// ── Load config ───────────────────────────────────────────────────────────────

const LOAD_CONFIG = {
  clear:      { label: 'No tasks yet', color: 'text-ui-subtext',  bar: 'bg-ui-border',   pct: 0   },
  light:      { label: 'Light day',    color: 'text-emerald-400', bar: 'bg-emerald-400', pct: 25  },
  manageable: { label: 'Manageable',   color: 'text-blue-400',    bar: 'bg-blue-400',    pct: 55  },
  heavy:      { label: 'Heavy day',    color: 'text-amber-400',   bar: 'bg-amber-400',   pct: 80  },
  overloaded: { label: 'Overloaded',   color: 'text-red-400',     bar: 'bg-red-400',     pct: 100 },
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

// ── Triage persistence ────────────────────────────────────────────────────────

const TRIAGE_KEY = 'aria_triage_done'
export function markTriageDone()    { localStorage.setItem(TRIAGE_KEY, new Date().toDateString()) }
export function wasTriageDoneToday() { return localStorage.getItem(TRIAGE_KEY) === new Date().toDateString() }

const TYPE_ICONS = { task: '✦', appointment: '◷', routine: '↻', note: '◈' }

// ── Critical list ─────────────────────────────────────────────────────────────

function CriticalList({ onDone }) {
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCriticalList().then(setItems).catch(console.error).finally(() => setLoading(false))
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

  if (loading) return <div className="aria-page flex items-center justify-center"><p className="text-sm text-ui-subtext">Loading…</p></div>

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-2xl mx-auto w-full">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-ui-text">Low-focus day</h1>
            <p className="text-sm text-ui-subtext mt-0.5">Your must-not-miss items</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onDone} className="mt-1">Go to Today →</Button>
        </div>
        <div className="mb-5 px-4 py-3 rounded-xl bg-ui-surface border border-ui-border">
          <p className="text-xs text-ui-subtext leading-relaxed">
            Focus is low — that's okay. Hard deadlines, appointments, and must-do routines only. Everything else can wait.
          </p>
        </div>
        {items.length === 0 ? (
          <Card className="mt-8 text-center px-8 py-12">
            <div className="text-4xl mb-4">✦</div>
            <p className="text-base font-medium text-ui-text mb-2">Nothing critical today</p>
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
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.color}`}>{badge.label}</span>
                        {task.due_time && <span className="text-xs text-ui-subtext">{task.due_time}</span>}
                      </div>
                      <p className="text-sm text-ui-text font-medium">{task.title}</p>
                      {task.notes && <p className="text-xs text-ui-subtext mt-0.5 line-clamp-1">{task.notes}</p>}
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


// ── One-at-a-time triage card ─────────────────────────────────────────────────

function TriageOne({ task, index, total, scheduledCount, onToday, onDefer, onSnooze, onDelete, capacity }) {
  const [showCal, setShowCal]     = useState(false)
  const [calDate, setCalDate]     = useState('')
  const [leaving, setLeaving]     = useState(false)
  const [direction, setDirection] = useState(1)

  function animate(dir, fn) {
    setDirection(dir)
    setLeaving(true)
    setTimeout(fn, 280)
  }

  function handleToday()     { animate( 1, onToday) }
  function handleTomorrow()  { animate(-1, () => onDefer(tomorrow())) }
  function handleEndWeek()   { animate(-1, () => onDefer(endOfWeek())) }
  function handleNextWeek()  { animate(-1, () => onDefer(nextMonday())) }
  function handleSnoozeLong(){ animate(-1, () => onSnooze(oneMonth())) }
  function handleDelete()    { animate(-1, onDelete) }
  function handleCalSubmit() {
    if (!calDate) return
    animate(-1, () => onDefer(calDate))
  }

  return (
    <div className={`transition-all duration-280 ${leaving
      ? direction > 0 ? 'opacity-0 translate-x-8' : 'opacity-0 -translate-x-8'
      : 'opacity-100 translate-x-0'
    }`}>
      <Card className="px-6 py-8 mb-4">
        {/* Type + counter */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="text-ui-accent text-lg">{TYPE_ICONS[task.task_type] || '✦'}</span>
            <span className="text-xs text-ui-subtext capitalize">{task.task_type}</span>
          </div>
          <span className="text-xs text-ui-subtext/60">{index + 1} of {total}</span>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-semibold text-ui-text leading-snug mb-3">
          {task.title}
        </h2>

        {/* Meta */}
        {(task.due_date || task.due_time) && (
          <div className="flex items-center gap-1.5 mb-2 text-sm text-ui-subtext">
            <span>◷</span>
            <span>{task.due_time ?? ''}{task.due_time && task.due_date ? ' · ' : ''}{task.due_date ?? ''}</span>
          </div>
        )}
        {task.location_detail && (
          <p className="text-sm text-ui-subtext mb-2">📍 {task.location_detail}</p>
        )}
        {task.notes && (
          <p className="text-sm text-ui-subtext leading-relaxed border-t border-ui-border pt-3 mt-3">
            {task.notes}
          </p>
        )}
      </Card>

      {/* Primary action */}
      <Button size="lg" onClick={handleToday} className="w-full mb-3">
        → Today
      </Button>

      {/* Defer row */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <Button variant="secondary" onClick={handleTomorrow}>Tomorrow</Button>
        <Button variant="secondary" onClick={handleEndWeek}>End of week</Button>
        <Button variant="secondary" onClick={handleNextWeek}>Next week</Button>
        <Button variant="secondary" onClick={() => setShowCal((v) => !v)}>
          {showCal ? 'Cancel' : 'Pick date ◷'}
        </Button>
      </div>

      {showCal && (
        <div className="flex gap-2 mb-2">
          <input
            type="date"
            value={calDate}
            onChange={(e) => setCalDate(e.target.value)}
            className="flex-1 bg-ui-surface border border-ui-border rounded-xl px-3 py-2 text-sm text-ui-text focus:outline-none focus:border-ui-accent"
          />
          <Button variant="secondary" onClick={handleCalSubmit} disabled={!calDate}>Set</Button>
        </div>
      )}

      {/* Bottom row */}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={handleSnoozeLong} className="text-ui-subtext/70">
          Snooze 1 month
        </Button>
        <Button variant="danger" onClick={handleDelete}>Delete</Button>
      </div>
    </div>
  )
}


// ── Main triage ───────────────────────────────────────────────────────────────

export default function Triage({ onTriageDone }) {
  const [inboxItems,   setInboxItems]   = useState([])
  const [todayItems,   setTodayItems]   = useState([])
  const [capacity,     setCapacity]     = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [showCritical, setShowCritical] = useState(false)
  const [currentIdx,   setCurrentIdx]   = useState(0)
  const [scheduledToday, setScheduledToday] = useState(0)

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

  // Current item is whichever inbox item is at currentIdx
  const currentItem = inboxItems[currentIdx] ?? null
  const remaining   = inboxItems.length

  function advance() {
    // Don't advance index — after removal the same index points to next item
  }

  async function handleToday() {
    if (!currentItem) return
    await scheduleToday(currentItem.id, {})
    setInboxItems((prev) => prev.filter((t) => t.id !== currentItem.id))
    setTodayItems((prev) => [...prev, { ...currentItem, status: 'today' }])
    setScheduledToday((n) => n + 1)
  }

  async function handleDefer(dueDate) {
    if (!currentItem) return
    await updateTask(currentItem.id, { due_date: dueDate })
    setInboxItems((prev) => prev.filter((t) => t.id !== currentItem.id))
  }

  async function handleSnooze(until) {
    if (!currentItem) return
    await snoozeTask(currentItem.id, until)
    setInboxItems((prev) => prev.filter((t) => t.id !== currentItem.id))
  }

  async function handleDelete() {
    if (!currentItem) return
    await deleteTask(currentItem.id)
    setInboxItems((prev) => prev.filter((t) => t.id !== currentItem.id))
  }

  function handleDone() {
    markTriageDone()
    onTriageDone?.()
  }

  if (loading) return <div className="aria-page flex items-center justify-center"><p className="text-sm text-ui-subtext">Loading…</p></div>
  if (showCritical) return <CriticalList onDone={handleDone} />

  // All done
  if (remaining === 0) {
    return (
      <div className="aria-page">
        <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-lg mx-auto w-full">
          <Card className="mt-16 text-center px-8 py-12">
            <div className="text-4xl mb-4">✦</div>
            <h2 className="text-lg font-semibold text-ui-text mb-2">Triage complete</h2>
            <p className="text-sm text-ui-subtext mb-1">
              {scheduledToday > 0
                ? `${scheduledToday} added to today · ${todayItems.length} total on your list.`
                : 'Everything pushed out. Today is yours.'}
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
            <Button size="lg" onClick={handleDone}>Go to Today →</Button>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-lg mx-auto w-full">

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-ui-text">Triage</h1>
            <p className="text-sm text-ui-subtext mt-0.5">
              {remaining} left · {scheduledToday} added today
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowCritical(true)} className="mt-1">
            Low focus →
          </Button>
        </div>

        {/* Load bar */}
        <CapacityBar capacity={capacity} compact />
        <div className="mb-5">
          <div className="flex items-center justify-between text-xs mb-1.5 px-0.5">
            <span className="text-ui-subtext">Today's load · {todayItems.length} scheduled</span>
            <span className={`font-medium ${loadCfg.color}`}>{loadCfg.label}</span>
          </div>
          <div className="h-1.5 rounded-full bg-ui-border overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${loadCfg.bar}`} style={{ width: `${loadCfg.pct}%` }} />
          </div>
        </div>

        {/* One card at a time */}
        {currentItem && (
          <TriageOne
            key={currentItem.id}
            task={currentItem}
            index={0}
            total={remaining}
            scheduledCount={scheduledToday}
            onToday={handleToday}
            onDefer={handleDefer}
            onSnooze={handleSnooze}
            onDelete={handleDelete}
            capacity={capacity}
          />
        )}

        {/* Done early */}
        <div className="mt-4 text-center">
          <Button variant="ghost" size="sm" onClick={handleDone} className="text-ui-subtext/60">
            Done for now →
          </Button>
        </div>

      </div>
    </div>
  )
}
