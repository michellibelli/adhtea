import { useState, useEffect, useCallback } from 'react'
import { getTournamentState, submitTournamentRound, startTournament, deleteTask, snoozeTask } from '../api/tasks'
import Card from '../components/Card'
import Button from '../components/Button'
import ProjectBadge from '../components/ProjectBadge'
import { markTriageDone } from './Triage'

// Random tea-pun pool reused for the 20% surprise reward
const TEA_PUNS = [
  'Steeped in success!',
  "You're brewtiful!",
  'That was tea-riffic!',
  'Earl Grey-t pick!',
  'Matcha this energy!',
  'Brewing brilliance!',
  'On a rolling boil!',
  'Chai-ve, that\'s done!',
  'Pekoe-sitively crushing it!',
  'Tea-rrific choice!',
]
function randomPun() { return TEA_PUNS[Math.floor(Math.random() * TEA_PUNS.length)] }

// Visual rank metadata for the tap feedback
const RANK_META = {
  1: { label: '1st', ring: 'ring-yellow-400', bg: 'bg-yellow-400/15',  text: 'text-yellow-500' },
  2: { label: '2nd', ring: 'ring-slate-300',  bg: 'bg-slate-300/15',   text: 'text-slate-400' },
  3: { label: '3rd', ring: 'ring-amber-700',  bg: 'bg-amber-700/10',   text: 'text-amber-600' },
}

function dayLabel(offset, isoDate) {
  if (offset === 0) return 'Today'
  if (offset === 1) return 'Tomorrow'
  if (!isoDate) return `Day +${offset}`
  const d = new Date(isoDate + 'T00:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'long' })
}

// Tea-cup with leaf-drop progress visual
function TeaCupProgress({ filled, cap }) {
  const pct = Math.min(100, Math.round((filled / cap) * 100))
  return (
    <div className="flex items-center gap-3">
      <div className="relative" style={{ width: 56, height: 64 }}>
        <svg viewBox="0 0 56 64" width="56" height="64" aria-hidden="true">
          <defs>
            <clipPath id="cup-clip">
              <path d="M8 18 L48 18 L44 56 Q44 60 40 60 L16 60 Q12 60 12 56 Z"/>
            </clipPath>
          </defs>
          {/* Cup outline */}
          <path d="M8 18 L48 18 L44 56 Q44 60 40 60 L16 60 Q12 60 12 56 Z"
                fill="none" stroke="#4A3FA8" strokeWidth="2" strokeLinejoin="round"/>
          {/* Saucer */}
          <ellipse cx="28" cy="60" rx="22" ry="2.5" fill="none" stroke="#4A3FA8" strokeWidth="1.5"/>
          {/* Tea fill */}
          <rect x="0" y={60 - (pct * 0.42)} width="56" height="64"
                clipPath="url(#cup-clip)"
                fill="url(#tea-grad)"
                style={{ transition: 'y 400ms ease-out' }}/>
          <defs>
            <linearGradient id="tea-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%"  stopColor="#C8985C"/>
              <stop offset="100%" stopColor="#7A4A18"/>
            </linearGradient>
          </defs>
          {/* Steam (only when at least one leaf in) */}
          {filled > 0 && (
            <g stroke="#4A3FA8" strokeWidth="1.5" strokeLinecap="round" opacity="0.6">
              <line x1="20" y1="12" x2="20" y2="4" />
              <line x1="28" y1="10" x2="28" y2="2" />
              <line x1="36" y1="12" x2="36" y2="4" />
            </g>
          )}
        </svg>
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-ui-text">{filled} / {cap}</span>
        <span className="text-[10px] text-ui-subtext uppercase tracking-wider">in today's brew</span>
      </div>
    </div>
  )
}

// One task card. Visual rank changes if the user has tapped it this round.
// onSnooze / onDelete are corner-action buttons that don't trigger the rank tap.
function TaskTile({ task, rank, dimmed, onRank, onSnooze, onDelete }) {
  const meta = rank && RANK_META[rank]
  function stop(e) { e.stopPropagation() }
  return (
    <div
      onClick={onRank}
      className={`w-full cursor-pointer transition-all duration-200 ${dimmed ? 'opacity-40 scale-[0.98]' : 'opacity-100'}`}
    >
      <Card className={`relative px-4 py-3 ${meta ? `ring-2 ring-offset-2 ring-offset-ui-surface ${meta.ring} ${meta.bg}` : ''}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-ui-accent text-sm">✦</span>
              {meta && (
                <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.text}`}>
                  {meta.label}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-ui-text leading-snug">{task.title}</p>
            {task.notes && (
              <p className="text-xs text-ui-subtext mt-1 leading-snug line-clamp-2">{task.notes}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {task.due_date && (
                <span className="text-[10px] text-ui-subtext">📅 {task.due_date}</span>
              )}
              {task.weight && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-ui-border/30 text-ui-subtext">
                  {task.weight}
                </span>
              )}
              <ProjectBadge name={task.project_name} size="xs" />
            </div>
          </div>
          <div className="flex flex-col gap-1 flex-shrink-0">
            <button
              onClick={(e) => { stop(e); onSnooze() }}
              title="Snooze (defer to later)"
              className="w-7 h-7 rounded-full border border-ui-border text-ui-subtext/60 hover:text-amber-400 hover:border-amber-400/50 transition-colors flex items-center justify-center"
            >🌙</button>
            <button
              onClick={(e) => { stop(e); onDelete() }}
              title="Delete this task"
              className="w-7 h-7 rounded-full border border-ui-border text-ui-subtext/60 hover:text-red-400 hover:border-red-400/50 transition-colors flex items-center justify-center text-xs"
            >✕</button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function oneMonthFromNow() {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export default function Tournament({ onDone }) {
  const [state,    setState]    = useState(null)   // {today_count, cap, remaining_slots, inbox_pending, next_batch}
  const [loading,  setLoading]  = useState(true)
  const [taps,     setTaps]     = useState([])     // ordered task IDs the user has tapped this round
  const [round,    setRound]    = useState(1)
  const [punFlash, setPunFlash] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error,    setError]    = useState(null)

  const refresh = useCallback(async () => {
    try {
      const s = await getTournamentState()
      setState(s)
    } catch (e) {
      setError(e?.message || 'Could not load tournament')
    }
  }, [])

  useEffect(() => { (async () => { await refresh(); setLoading(false) })() }, [refresh])

  // Auto-submit when 3 picked (after a brief beat so the 3rd-place ring is visible).
  // Declared BEFORE any conditional return — rules of hooks.
  useEffect(() => {
    if (taps.length === 3 && !submitting) {
      const t = setTimeout(() => handleSubmit(), 350)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taps])

  function handleTap(taskId) {
    if (taps.includes(taskId)) {
      // Tap again to un-rank
      setTaps(taps.filter(id => id !== taskId))
      return
    }
    if (taps.length >= 3) return
    const next = [...taps, taskId]
    setTaps(next)
  }

  async function handleSubmit() {
    if (taps.length === 0) return
    const ordered = [...taps]
    // If 2 tapped, infer the 3rd
    const batch = state?.next_batch || []
    if (ordered.length === 2 && batch.length === 3) {
      const remaining = batch.find(t => !ordered.includes(t.id))
      if (remaining) ordered.push(remaining.id)
    }
    setSubmitting(true)
    setError(null)
    try {
      const fresh = await submitTournamentRound(ordered)
      // 20% surprise pun
      if (Math.random() < 0.2) {
        setPunFlash(randomPun())
        setTimeout(() => setPunFlash(null), 1200)
      }
      setState(fresh)
      setTaps([])
      setRound(r => r + 1)
      // If horizon full or inbox empty → tournament complete
      const done = fresh.horizon_full || fresh.inbox_pending === 0
      if (done) {
        markTriageDone()
      }
    } catch (e) {
      setError(e?.message || 'Could not submit round')
    } finally { setSubmitting(false) }
  }

  function handleFinish() {
    markTriageDone()
    onDone?.()
  }

  async function handleSnooze(taskId) {
    setSubmitting(true)
    setError(null)
    try {
      await snoozeTask(taskId, oneMonthFromNow())
      setTaps(taps.filter(id => id !== taskId))
      await refresh()
    } catch (e) {
      setError(e?.message || 'Snooze failed')
    } finally { setSubmitting(false) }
  }

  async function handleDelete(taskId) {
    if (!confirm('Delete this task?')) return
    setSubmitting(true)
    setError(null)
    try {
      await deleteTask(taskId)
      setTaps(taps.filter(id => id !== taskId))
      await refresh()
    } catch (e) {
      setError(e?.message || 'Delete failed')
    } finally { setSubmitting(false) }
  }

  if (loading) {
    return <div className="aria-page flex items-center justify-center"><p className="text-sm text-ui-subtext">Loading…</p></div>
  }

  const batch = state?.next_batch || []
  const horizonFull = state?.horizon_full
  const inboxEmpty = state?.inbox_pending === 0 || batch.length === 0
  const isDone = horizonFull || inboxEmpty
  const targetLabel  = dayLabel(state?.target_offset ?? 0, state?.target_date)
  const targetTasks  = state?.target_tasks ?? 0
  const targetTotal  = state?.target_total ?? 0
  const maxTasks     = state?.max_tasks_per_day ?? 10
  const maxTotal     = state?.max_total_per_day ?? 15
  const canSubmit = taps.length >= 1 && !submitting

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-md mx-auto w-full">

        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] text-ui-subtext uppercase tracking-wider mb-0.5">
                Filling <span className="text-ui-accent font-semibold">{targetLabel}</span>
              </p>
              <h1 className="text-2xl font-semibold text-ui-text">Round {round}</h1>
            </div>
            <TeaCupProgress filled={targetTasks} cap={maxTasks} />
          </div>

          {/* Progress bar for current target day */}
          <div className="h-1.5 rounded-full bg-ui-border/40 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-ui-accent to-ui-primary transition-all duration-500"
              style={{ width: `${Math.min(100, (targetTasks / maxTasks) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-ui-subtext mt-1">
            <span>total {targetTotal}/{maxTotal} (incl. routines + appts)</span>
            <span>{state?.inbox_pending ?? 0} inbox left</span>
          </div>
        </div>

        {/* Variable surprise pun */}
        {punFlash && (
          <div className="text-center mb-3 animate-bounce">
            <span className="text-sm font-semibold text-ui-accent">{punFlash} ✨</span>
          </div>
        )}

        {/* Horizon full or inbox empty */}
        {isDone ? (
          <Card className="px-5 py-6 text-center">
            <div className="text-3xl mb-2">🍵</div>
            <p className="text-base font-semibold text-ui-text mb-1">
              {inboxEmpty ? 'Inbox cleared' : 'All days full'}
            </p>
            <p className="text-xs text-ui-subtext mb-4">
              {state?.today_count ?? 0} tasks queued for today
            </p>
            <Button onClick={handleFinish}>Done</Button>
          </Card>
        ) : (
          <>
            <p className="text-xs text-ui-subtext text-center mb-3">
              Tap in order of importance: most important first
            </p>

            <div className="space-y-3">
              {batch.map((task) => {
                const tapIndex = taps.indexOf(task.id)
                const rank = tapIndex === -1 ? null : tapIndex + 1
                const dimmed = taps.length === 3 && rank === null
                return (
                  <TaskTile
                    key={task.id}
                    task={task}
                    rank={rank}
                    dimmed={dimmed}
                    onRank={() => handleTap(task.id)}
                    onSnooze={() => handleSnooze(task.id)}
                    onDelete={() => handleDelete(task.id)}
                  />
                )
              })}
            </div>

            {/* Action row */}
            <div className="flex items-center justify-between mt-5 gap-3">
              <button
                onClick={() => setTaps([])}
                disabled={taps.length === 0 || submitting}
                className="text-xs text-ui-subtext/70 hover:opacity-70 transition-opacity disabled:opacity-30"
              >
                Reset taps
              </button>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {submitting
                  ? '…'
                  : taps.length === 0
                    ? 'Tap to rank'
                    : taps.length === 3
                      ? 'Confirm'
                      : `Confirm (${taps.length} ranked)`}
              </Button>
            </div>

            {error && <p className="text-xs text-red-400 text-center mt-3">{error}</p>}
          </>
        )}

      </div>
    </div>
  )
}
