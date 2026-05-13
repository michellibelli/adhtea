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

const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 }

// Sort today tasks: critical first, then by priority, then by weight desc
function sortByImportance(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.is_critical !== b.is_critical) return a.is_critical ? -1 : 1
    const pa = PRIORITY_RANK[a.priority] ?? 4
    const pb = PRIORITY_RANK[b.priority] ?? 4
    if (pa !== pb) return pa - pb
    const wa = WEIGHTS[a.weight] || 2
    const wb = WEIGHTS[b.weight] || 2
    return wb - wa
  })
}


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


// ── Today review — trim an overwhelming list ───────────────────────────────────

function TodayReview({ todayItems, onDone }) {
  const sorted = sortByImportance(todayItems)
  const [deferred, setDeferred] = useState(new Set())
  const [saving, setSaving]     = useState(false)

  async function handleSave() {
    setSaving(true)
    const until = tomorrow()
    await Promise.all([...deferred].map(id => snoozeTask(id, until)))
    onDone()
  }

  function toggle(id) {
    setDeferred(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const keeping  = sorted.filter(t => !deferred.has(t.id))
  const deferring = sorted.filter(t =>  deferred.has(t.id))

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-lg mx-auto w-full">

        <div className="mb-5">
          <h1 className="text-2xl font-semibold text-ui-text mb-1">Sort today's list</h1>
          <p className="text-sm text-ui-subtext">Tap items you can move to tomorrow. Keep what actually needs to happen today.</p>
        </div>

        <div className="mb-4 px-4 py-3 rounded-xl bg-ui-surface border border-ui-border">
          <p className="text-xs text-ui-subtext leading-relaxed">
            Tasks are ordered by importance — critical and urgent at the top. Tap anything to defer it.
          </p>
        </div>

        <div className="space-y-2 mb-6">
          {sorted.map(task => {
            const isDeferring = deferred.has(task.id)
            return (
              <button
                key={task.id}
                onClick={() => toggle(task.id)}
                className={`w-full text-left transition-all duration-200 ${isDeferring ? 'opacity-40' : ''}`}
              >
                <Card className={`px-4 py-3.5 ${isDeferring ? 'border-dashed' : ''}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-ui-accent text-xs">{TYPE_ICONS[task.task_type] || '✦'}</span>
                        {task.is_critical && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Critical</span>}
                        {task.priority === 'urgent' && !task.is_critical && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">Urgent</span>}
                      </div>
                      <p className={`text-sm font-medium ${isDeferring ? 'line-through text-ui-subtext' : 'text-ui-text'}`}>{task.title}</p>
                    </div>
                    <span className={`text-xs flex-shrink-0 font-medium ${isDeferring ? 'text-ui-subtext' : 'text-ui-accent'}`}>
                      {isDeferring ? 'Tomorrow' : 'Today'}
                    </span>
                  </div>
                </Card>
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between text-xs text-ui-subtext mb-5 px-1">
          <span>Keeping today: <span className="text-ui-text font-medium">{keeping.length}</span></span>
          {deferring.length > 0 && <span>Moving to tomorrow: <span className="text-amber-400 font-medium">{deferring.length}</span></span>}
        </div>

        <Button size="lg" onClick={handleSave} disabled={saving} className="w-full">
          {saving ? 'Saving…' : deferring.length > 0 ? `Move ${deferring.length} to tomorrow` : 'Looks good — go to Today'}
        </Button>

        <button onClick={onDone} className="mt-4 block mx-auto text-xs text-ui-subtext/60 hover:text-ui-subtext transition-colors">
          Skip for now →
        </button>

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

export default function Triage({ onTriageDone }) {
  const [pool,         setPool]         = useState([])
  const [todayItems,   setTodayItems]   = useState([])
  const [capacity,     setCapacity]     = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [showCritical, setShowCritical] = useState(false)
  const [scheduledToday, setScheduledToday] = useState(0)
  const [picking,      setPicking]      = useState(false)
  // 'inbox' | 'today-review' | 'done'
  const [mode,         setMode]         = useState('inbox')

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
      // Auto-select mode based on state
      if (inbox.length === 0 && today.length > 0) {
        setMode('today-review')
      } else {
        setMode('inbox')
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const load    = computeLoad(todayItems)
  const loadCfg = LOAD_CONFIG[load]
  const trio    = pool.slice(0, 3)

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
  if (mode === 'today-review') return <TodayReview todayItems={todayItems} onDone={handleDone} />

  // Inbox empty — offer today review if there are tasks, else done
  if (pool.length === 0) {
    if (todayItems.length > 0) {
      return (
        <div className="aria-page">
          <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-lg mx-auto w-full">
            <Card className="mt-16 text-center px-8 py-12">
              <div className="text-4xl mb-4">✦</div>
              <h2 className="text-lg font-semibold text-ui-text mb-2">Inbox is clear</h2>
              <p className="text-sm text-ui-subtext mb-1">
                {scheduledToday > 0 ? `${scheduledToday} added · ` : ''}{todayItems.length} tasks on today's list.
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
              <div className="flex flex-col gap-2">
                {(load === 'heavy' || load === 'overloaded') && (
                  <Button size="lg" onClick={() => setMode('today-review')}>
                    Sort today's list →
                  </Button>
                )}
                <Button size="lg" variant={load === 'heavy' || load === 'overloaded' ? 'secondary' : 'primary'} onClick={handleDone}>
                  Go to Today →
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )
    }
    // Nothing in inbox, nothing today — done
    return (
      <div className="aria-page">
        <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-lg mx-auto w-full">
          <Card className="mt-16 text-center px-8 py-12">
            <div className="text-4xl mb-4">✦</div>
            <h2 className="text-lg font-semibold text-ui-text mb-2">Triage complete</h2>
            <p className="text-sm text-ui-subtext mb-6">Everything pushed out. Today is yours.</p>
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
          <div className="flex flex-col items-end gap-1 mt-1">
            <Button variant="ghost" size="sm" onClick={() => setShowCritical(true)}>
              Low focus →
            </Button>
            {todayItems.length > 0 && (
              <button
                onClick={() => setMode('today-review')}
                className="text-xs text-ui-subtext/60 hover:text-ui-subtext transition-colors"
              >
                Sort today's list →
              </button>
            )}
          </div>
        </div>

        {/* Load indicator */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs mb-1.5 px-0.5">
            <span className="text-ui-subtext">
              Today: <span className="font-medium text-ui-text">{todayItems.length}</span> tasks
            </span>
            <span className={`font-medium ${loadCfg.color}`}>{loadCfg.label}</span>
          </div>
          <div className="h-1.5 rounded-full bg-ui-border overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${loadCfg.bar}`}
              style={{ width: `${loadCfg.pct}%` }}
            />
          </div>
        </div>

        <CapacityBar capacity={capacity} compact />

        {/* Overloaded nudge */}
        {(load === 'heavy' || load === 'overloaded') && (
          <div className="mb-4 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <p className="text-xs text-amber-400">
              Today is already {load === 'overloaded' ? 'overloaded' : 'heavy'}.{' '}
              <button onClick={() => setMode('today-review')} className="underline">Sort today's list</button> to trim it first.
            </p>
          </div>
        )}

        {/* The trio */}
        <div className="mt-2 space-y-3">
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
