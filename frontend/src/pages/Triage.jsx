import { useState, useEffect, useCallback } from 'react'
import { getInbox, getToday, scheduleToday, snoozeTask, updateTask, deleteTask, getCriticalList, completeTask } from '../api/tasks'
import { getTodayCapacity } from '../api/selfcare'
import CapacityBar from '../components/CapacityBar'
import Card from '../components/Card'
import Button from '../components/Button'

// ── Date helpers ──────────────────────────────────────────────────────────────

function datetimeStr(d) { return d.toISOString().split('T')[0] + 'T00:00:00.000Z' }
function tomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0,0,0,0)
  return datetimeStr(d)
}

// ── Triage persistence ────────────────────────────────────────────────────────

const TRIAGE_KEY = 'aria_triage_done'
export function markTriageDone()    { localStorage.setItem(TRIAGE_KEY, new Date().toDateString()) }
export function wasTriageDoneToday() { return localStorage.getItem(TRIAGE_KEY) === new Date().toDateString() }

// ── Load helpers ──────────────────────────────────────────────────────────────

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

const TYPE_ICONS  = { task: '✦', appointment: '◷', routine: '↻', note: '◈' }
const TYPE_LABELS = { task: 'Task', appointment: 'Appt', routine: 'Routine', note: 'Note' }

// ── Critical list ─────────────────────────────────────────────────────────────

function CriticalList({ onDone }) {
  const [items,   setItems]   = useState([])
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


// ── Tournament card ───────────────────────────────────────────────────────────

function TournamentCard({ task, onPick, picking }) {
  return (
    <button
      onClick={() => !picking && onPick(task.id)}
      disabled={picking}
      className={`w-full text-left transition-all duration-200 ${picking ? 'opacity-40 scale-95' : 'hover:scale-[1.02] active:scale-[0.98]'}`}
    >
      <Card className="px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="text-ui-accent text-base mt-0.5 flex-shrink-0">
            {TYPE_ICONS[task.task_type] || '✦'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ui-text leading-snug">{task.title}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[10px] text-ui-subtext">{TYPE_LABELS[task.task_type]}</span>
              {task.due_date && (
                <span className="text-[10px] text-ui-subtext">· {task.due_date}</span>
              )}
              {task.due_time && (
                <span className="text-[10px] text-amber-400">· {task.due_time}</span>
              )}
              {task.notes && (
                <span className="text-[10px] text-ui-subtext/60 truncate max-w-[140px]">· {task.notes}</span>
              )}
            </div>
          </div>
          <span className="text-ui-border text-lg flex-shrink-0">→</span>
        </div>
      </Card>
    </button>
  )
}


// ── Main triage ───────────────────────────────────────────────────────────────

const TODAY_LIMIT = 10

export default function Triage({ onTriageDone }) {
  const [pool,         setPool]         = useState([])   // inbox items not yet handled
  const [todayItems,   setTodayItems]   = useState([])
  const [capacity,     setCapacity]     = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [showCritical, setShowCritical] = useState(false)
  const [scheduledToday, setScheduledToday] = useState(0)
  const [picking,      setPicking]      = useState(false) // debounce mid-animation

  const fetchAll = useCallback(async () => {
    try {
      const [inbox, today, cap] = await Promise.all([getInbox(), getToday(), getTodayCapacity()])
      const todayStr = new Date().toISOString().slice(0, 10)
      inbox.sort((a, b) => {
        const aOver = a.due_date && a.due_date < todayStr
        const bOver = b.due_date && b.due_date < todayStr
        if (aOver && !bOver) return -1
        if (bOver && !aOver) return 1
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
        if (a.due_date) return -1
        if (b.due_date) return 1
        return new Date(a.created_at) - new Date(b.created_at)
      })
      setPool(inbox)
      setTodayItems(today)
      setCapacity(cap)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const load    = computeLoad(todayItems)
  const loadCfg = LOAD_CONFIG[load]

  // Today's limit — stop when reached
  const todayFull = todayItems.length >= TODAY_LIMIT

  // The 3 current candidates
  const trio = pool.slice(0, 3)

  async function handlePick(taskId) {
    if (picking) return
    setPicking(true)
    const task = pool.find((t) => t.id === taskId)
    await scheduleToday(taskId, {})
    setPool((prev) => prev.filter((t) => t.id !== taskId))
    setTodayItems((prev) => [...prev, { ...task, status: 'today' }])
    setScheduledToday((n) => n + 1)
    setPicking(false)
  }

  async function handleSnoozeAll() {
    if (picking || trio.length === 0) return
    setPicking(true)
    const until = tomorrow()
    await Promise.all(trio.map((t) => snoozeTask(t.id, until)))
    const ids = new Set(trio.map((t) => t.id))
    setPool((prev) => prev.filter((t) => !ids.has(t.id)))
    setPicking(false)
  }

  function handleDone() {
    markTriageDone()
    onTriageDone?.()
  }

  if (loading) return <div className="aria-page flex items-center justify-center"><p className="text-sm text-ui-subtext">Loading…</p></div>
  if (showCritical) return <CriticalList onDone={handleDone} />

  // All done or today full
  if (pool.length === 0 || todayFull) {
    return (
      <div className="aria-page">
        <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-lg mx-auto w-full">
          <Card className="mt-16 text-center px-8 py-12">
            <div className="text-4xl mb-4">✦</div>
            <h2 className="text-lg font-semibold text-ui-text mb-2">
              {todayFull ? "Today's list is full" : 'Triage complete'}
            </h2>
            <p className="text-sm text-ui-subtext mb-1">
              {scheduledToday > 0
                ? `${scheduledToday} added · ${todayItems.length} total on your list.`
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
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-2xl font-semibold text-ui-text">Triage</h1>
            <p className="text-sm text-ui-subtext mt-0.5">Which matters most right now?</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowCritical(true)} className="mt-1">
            Low focus →
          </Button>
        </div>

        {/* Progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs mb-1.5 px-0.5">
            <span className="text-ui-subtext">
              Today: <span className="font-medium text-ui-text">{todayItems.length}</span> / {TODAY_LIMIT}
            </span>
            <span className={`font-medium ${loadCfg.color}`}>{loadCfg.label}</span>
          </div>
          <div className="h-1.5 rounded-full bg-ui-border overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${loadCfg.bar}`}
              style={{ width: `${Math.min((todayItems.length / TODAY_LIMIT) * 100, 100)}%` }}
            />
          </div>
        </div>

        <CapacityBar capacity={capacity} compact />

        {/* The trio */}
        <div className="mt-5 space-y-3">
          {trio.map((task) => (
            <TournamentCard
              key={task.id}
              task={task}
              onPick={handlePick}
              picking={picking}
            />
          ))}
        </div>

        {/* Snooze all + done */}
        <div className="mt-5 flex flex-col items-center gap-2">
          {trio.length > 0 && (
            <button
              onClick={handleSnoozeAll}
              disabled={picking}
              className="text-xs text-ui-subtext/60 hover:text-ui-subtext transition-colors disabled:opacity-40"
            >
              None of these — snooze all to tomorrow
            </button>
          )}
          <button
            onClick={handleDone}
            className="text-xs text-ui-subtext/60 hover:text-ui-subtext transition-colors"
          >
            Done for now →
          </button>
        </div>

        {/* Remaining pool count */}
        {pool.length > 3 && (
          <p className="text-center text-[10px] text-ui-subtext/40 mt-4">
            {pool.length - 3} more in inbox
          </p>
        )}

      </div>
    </div>
  )
}
