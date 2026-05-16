import { useState, useEffect, useCallback } from 'react'
import { getToday, getCriticalList, completeTask, snoozeTask } from '../api/tasks'
import { getTodayCapacity } from '../api/selfcare'
import CapacityBar from '../components/CapacityBar'
import Card from '../components/Card'
import Button from '../components/Button'
import ProjectBadge from '../components/ProjectBadge'

// ── Helpers ───────────────────────────────────────────────────────────────────

const TRIAGE_KEY = 'aria_triage_done'
export function markTriageDone()     { localStorage.setItem(TRIAGE_KEY, new Date().toDateString()) }
export function wasTriageDoneToday() { return localStorage.getItem(TRIAGE_KEY) === new Date().toDateString() }

function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0] + 'T00:00:00.000Z'
}

const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 }
const WEIGHT_RANK   = { heavy: 0, medium: 1, light: 2 }

function sortByUrgency(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.is_critical !== b.is_critical) return a.is_critical ? -1 : 1
    const pa = PRIORITY_RANK[a.priority] ?? 4
    const pb = PRIORITY_RANK[b.priority] ?? 4
    if (pa !== pb) return pa - pb
    // appointments with a time bubble up
    if (a.due_time && !b.due_time) return -1
    if (b.due_time && !a.due_time) return 1
    const wa = WEIGHT_RANK[a.weight] ?? 1
    const wb = WEIGHT_RANK[b.weight] ?? 1
    return wa - wb
  })
}

const TYPE_ICONS = { task: '✦', appointment: '◷', routine: '↻', note: '◈' }

// How many tasks triage tries to surface at once in the "critical" low-focus mode.
// Kept small so it doesn't feel overwhelming on bad executive-function days.
const TRIAGE_SHOW_LIMIT = 7

// ── Critical list (low-focus mode) ────────────────────────────────────────────

function CriticalList({ onDone }) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCriticalList().then(setItems).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="aria-page flex items-center justify-center"><p className="text-sm text-ui-subtext">Loading…</p></div>

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-2xl mx-auto w-full">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-ui-text">Low-focus day</h1>
            <p className="text-sm text-ui-subtext mt-0.5">Your must-not-miss items</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onDone} className="mt-1">Done →</Button>
        </div>
        <div className="mb-5 px-4 py-3 rounded-xl bg-ui-surface border border-ui-border">
          <p className="text-xs text-ui-subtext leading-relaxed">
            Focus is low — that's okay. Hard deadlines, appointments, and critical routines only.
          </p>
        </div>
        {items.length === 0 ? (
          <Card className="mt-8 text-center px-8 py-12">
            <p className="text-base font-medium text-ui-text mb-4">Nothing critical today</p>
            <Button onClick={onDone}>Go to Today</Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map(task => (
              <Card key={task.id} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ui-text font-medium">{task.title}</p>
                    {task.due_time && <p className="text-xs text-ui-subtext mt-0.5">{task.due_time}</p>}
                  </div>
                  <button
                    onClick={async () => {
                      // Optimistic remove: drop the task from the list first, then call the API.
                      // If the API fails we re-fetch so the UI doesn't lie about server state.
                      setItems(prev => prev.filter(t => t.id !== task.id))
                      try { await completeTask(task.id) }
                      catch (err) {
                        console.error(err)
                        getCriticalList().then(setItems).catch(() => {})
                      }
                    }}
                    className="flex-shrink-0 w-7 h-7 rounded-full border border-ui-border flex items-center justify-center text-ui-subtext hover:border-ui-accent hover:text-ui-accent transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                </div>
              </Card>
            ))}
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
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              {task.is_critical && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Critical</span>
              )}
              {task.priority === 'urgent' && !task.is_critical && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">Urgent</span>
              )}
              {task.due_time && (
                <span className="text-[10px] text-amber-400">◷ {task.due_time}</span>
              )}
            </div>
            <p className="text-sm font-medium text-ui-text leading-snug">{task.title}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <ProjectBadge name={task.project_name} size="xs" />
            </div>
            {task.notes && (
              <p className="text-[10px] text-ui-subtext/60 mt-0.5 truncate">{task.notes}</p>
            )}
          </div>
          <span className="text-ui-border text-lg flex-shrink-0">→</span>
        </div>
      </Card>
    </button>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function Triage({ onTriageDone }) {
  const [pool,         setPool]         = useState([])   // tasks not yet processed
  const [keepCount,    setKeepCount]    = useState(0)    // how many won a round (stay today)
  const [snoozedCount, setSnoozedCount] = useState(0)
  const [capacity,     setCapacity]     = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [picking,      setPicking]      = useState(false)
  const [showCritical, setShowCritical] = useState(false)
  const [totalToday,   setTotalToday]   = useState(0)

  useEffect(() => {
    Promise.all([getToday(), getTodayCapacity()])
      .then(([todayTasks, cap]) => {
        setCapacity(cap)
        // Routines + appointments happen on their own schedule and never enter
        // the triage cycle. Only true `task`-type items are eligible.
        const triageable = todayTasks.filter(t => t.task_type === 'task')
        setTotalToday(triageable.length)
        if (triageable.length <= TRIAGE_SHOW_LIMIT) {
          setPool([])
        } else {
          setPool(sortByUrgency(triageable))
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const trio      = pool.slice(0, 3)
  const remaining = keepCount + pool.length   // tasks that will stay today after triage

  async function handlePick(taskId) {
    if (picking) return
    setPicking(true)
    const losers = trio.filter(t => t.id !== taskId)
    const until  = tomorrow()
    await Promise.all(losers.map(t => snoozeTask(t.id, until)))
    setSnoozedCount(n => n + losers.length)
    setKeepCount(n => n + 1)
    setPool(prev => prev.slice(3))
    setPicking(false)
  }

  function handleDone() {
    markTriageDone()
    onTriageDone?.()
  }

  if (loading) return <div className="aria-page flex items-center justify-center"><p className="text-sm text-ui-subtext">Loading…</p></div>
  if (showCritical) return <CriticalList onDone={handleDone} />

  // Already manageable — nothing to trim
  if (totalToday <= TRIAGE_SHOW_LIMIT && snoozedCount === 0) {
    return (
      <div className="aria-page">
        <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-lg mx-auto w-full">
          <Card className="mt-16 text-center px-8 py-12">
            <div className="text-4xl mb-4">✦</div>
            <h2 className="text-lg font-semibold text-ui-text mb-2">Today looks manageable</h2>
            <p className="text-sm text-ui-subtext mb-6">
              {totalToday === 0 ? 'Nothing on your list yet.' : `${totalToday} task${totalToday !== 1 ? 's' : ''} — you're within your limit.`}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setShowCritical(true)} className="mb-4 block mx-auto">
              Low focus mode →
            </Button>
            <Button size="lg" onClick={handleDone}>Go to Today →</Button>
          </Card>
        </div>
      </div>
    )
  }

  // Tournament done — trimmed to target
  if (pool.length === 0 || remaining <= TRIAGE_SHOW_LIMIT) {
    const finalCount = remaining <= TRIAGE_SHOW_LIMIT ? remaining : keepCount
    return (
      <div className="aria-page">
        <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-lg mx-auto w-full">
          <Card className="mt-16 text-center px-8 py-12">
            <div className="text-4xl mb-4">✦</div>
            <h2 className="text-lg font-semibold text-ui-text mb-2">Today is sorted</h2>
            <p className="text-sm text-ui-subtext mb-1">
              {snoozedCount > 0
                ? `${snoozedCount} moved to tomorrow · ${remaining} staying today.`
                : 'Your list is trimmed down.'}
            </p>
            <Button size="lg" onClick={handleDone} className="mt-6">Go to Today →</Button>
          </Card>
        </div>
      </div>
    )
  }

  // Active tournament
  const progress = Math.max(0, totalToday - remaining)

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-lg mx-auto w-full">

        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-2xl font-semibold text-ui-text">Triage</h1>
            <p className="text-sm text-ui-subtext mt-0.5">Which matters most today?</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowCritical(true)} className="mt-1">
            Low focus →
          </Button>
        </div>

        {/* Progress toward target */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs mb-1.5 px-0.5">
            <span className="text-ui-subtext">
              Keeping today: <span className="font-medium text-ui-text">{remaining}</span>
              <span className="text-ui-subtext/60"> / target {TRIAGE_SHOW_LIMIT}</span>
            </span>
            {snoozedCount > 0 && (
              <span className="text-amber-400 font-medium">{snoozedCount} → tomorrow</span>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-ui-border overflow-hidden">
            <div
              className="h-full rounded-full bg-ui-accent transition-all duration-500"
              style={{ width: `${Math.min((progress / Math.max(totalToday - TRIAGE_SHOW_LIMIT, 1)) * 100, 100)}%` }}
            />
          </div>
        </div>

        <CapacityBar capacity={capacity} compact />

        <p className="text-xs text-ui-subtext mb-4 mt-2">Tap the one that matters most — the others move to tomorrow.</p>

        {/* The trio */}
        <div className="space-y-3">
          {trio.map(task => (
            <TournamentCard
              key={task.id}
              task={task}
              onPick={handlePick}
              picking={picking}
            />
          ))}
        </div>

        <div className="mt-5 text-center">
          <button
            onClick={handleDone}
            className="text-xs text-ui-subtext/60 hover:text-ui-subtext transition-colors"
          >
            Done for now →
          </button>
        </div>

        {pool.length > 3 && (
          <p className="text-center text-[10px] text-ui-subtext/40 mt-3">
            {pool.length - 3} more to review
          </p>
        )}

      </div>
    </div>
  )
}
