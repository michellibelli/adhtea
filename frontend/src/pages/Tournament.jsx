import { useState, useEffect, useCallback, useRef } from 'react'
import { DndContext, closestCenter, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { SmartPointerSensor } from '../utils/dnd'
import { getTournamentState, submitTournamentRound, startTournament, deleteTask, snoozeTask, completeTask } from '../api/tasks'
import Card from '../components/Card'
import Button from '../components/Button'
import ProjectBadge from '../components/ProjectBadge'
import SnoozeSheet from '../components/SnoozeSheet'
import { markTriageDone } from './Triage'

const MAX_PASSES_PER_DAY = 3

function todayKey() { return new Date().toISOString().slice(0, 10) }

function getTodayPassCount() {
  if (localStorage.getItem('triage_pass_date') !== todayKey()) return 0
  return parseInt(localStorage.getItem('triage_pass_count') || '0', 10)
}

function recordPassComplete() {
  localStorage.setItem('triage_pass_date', todayKey())
  localStorage.setItem('triage_pass_count', String(getTodayPassCount() + 1))
}

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

// Sortable tile — user drags to reorder. Top of list = most important.
// onSnooze / onDelete corner buttons stop drag propagation.
function TaskTile({ task, rank, onSnooze, onDelete, onComplete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const meta = rank && RANK_META[rank]
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 30 : 'auto',
  }
  function stop(e) { e.stopPropagation() }
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="w-full cursor-grab active:cursor-grabbing select-none"
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
          <div className="flex flex-col gap-1 flex-shrink-0" onPointerDown={stop}>
            <button
              onPointerDown={stop}
              onClick={(e) => { stop(e); onComplete() }}
              title="Already done — mark complete"
              className="w-7 h-7 rounded-full border border-ui-border text-ui-subtext/60 hover:text-emerald-400 hover:border-emerald-400/50 transition-colors flex items-center justify-center text-xs font-bold"
            >✓</button>
            <button
              onPointerDown={stop}
              onClick={(e) => { stop(e); onSnooze() }}
              title="Snooze (defer to later)"
              className="w-7 h-7 rounded-full border border-ui-border text-ui-subtext/60 hover:text-amber-400 hover:border-amber-400/50 transition-colors flex items-center justify-center"
            >🌙</button>
            <button
              onPointerDown={stop}
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


export default function Tournament({ onDone }) {
  const [state,      setState]      = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [order,      setOrder]      = useState([])     // task IDs in user's current rank order (top = most important)
  const [round,      setRound]      = useState(1)
  const [punFlash,   setPunFlash]   = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState(null)
  const [snoozeTarget, setSnoozeTarget] = useState(null)  // task id currently picking snooze date
  const [passCount,  setPassCount]  = useState(() => getTodayPassCount())

  const sensors = useSensors(
    useSensor(SmartPointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,        { activationConstraint: { delay: 180, tolerance: 6 } }),
  )

  const refresh = useCallback(async () => {
    try {
      const s = await getTournamentState()
      setState(s)
      setOrder((s.next_batch || []).map(t => t.id))
    } catch (e) {
      setError(e?.message || 'Could not load tournament')
    }
  }, [])

  useEffect(() => { (async () => { await refresh(); setLoading(false) })() }, [refresh])

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    setOrder(prev => {
      const oldIdx = prev.indexOf(active.id)
      const newIdx = prev.indexOf(over.id)
      if (oldIdx < 0 || newIdx < 0) return prev
      return arrayMove(prev, oldIdx, newIdx)
    })
  }

  async function handleSubmit() {
    if (order.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const fresh = await submitTournamentRound(order)
      if (Math.random() < 0.2) {
        setPunFlash(randomPun())
        setTimeout(() => setPunFlash(null), 1200)
      }
      setState(fresh)
      setOrder((fresh.next_batch || []).map(t => t.id))
      setRound(r => r + 1)
      const done = fresh.horizon_full || fresh.inbox_pending === 0
      if (done) markTriageDone()
    } catch (e) {
      setError(e?.message || 'Could not submit round')
    } finally { setSubmitting(false) }
  }

  function handleFinish() {
    markTriageDone()
    recordPassComplete()
    setPassCount(p => p + 1)
    onDone?.()
  }

  async function handleSnoozePick(isoDate) {
    const taskId = snoozeTarget
    setSnoozeTarget(null)
    if (!taskId) return
    setSubmitting(true)
    setError(null)
    try {
      await snoozeTask(taskId, isoDate)
      await refresh()
    } catch (e) {
      setError(e?.message || 'Snooze failed')
    } finally { setSubmitting(false) }
  }

  async function handleDelete(taskId) {
    setSubmitting(true)
    setError(null)
    try {
      await deleteTask(taskId)
      await refresh()
    } catch (e) {
      setError(e?.message || 'Delete failed')
    } finally { setSubmitting(false) }
  }

  async function handleComplete(taskId) {
    setSubmitting(true)
    setError(null)
    try {
      await completeTask(taskId)
      await refresh()
    } catch (e) {
      setError(e?.message || 'Complete failed')
    } finally { setSubmitting(false) }
  }

  if (loading) {
    return <div className="aria-page flex items-center justify-center"><p className="text-sm text-ui-subtext">Loading…</p></div>
  }

  // Hard cap — triaged 3 times today already
  if (passCount >= MAX_PASSES_PER_DAY) {
    return (
      <div className="aria-page">
        <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-md mx-auto w-full">
          <Card className="px-5 py-6 text-center">
            <div className="text-3xl mb-2">🍵</div>
            <p className="text-base font-semibold text-ui-text mb-2">Priorities are locked in</p>
            <p className="text-sm text-ui-subtext mb-1">
              You've refined your list {MAX_PASSES_PER_DAY} times today — that's the daily limit.
            </p>
            <p className="text-xs text-ui-subtext/70 mb-5">Come back tomorrow to triage fresh tasks.</p>
            <Button onClick={() => onDone?.()}>Go to Today</Button>
          </Card>
        </div>
      </div>
    )
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

  return (
    <div className="aria-page">
      {snoozeTarget && (
        <SnoozeSheet
          onSnooze={handleSnoozePick}
          onClose={() => setSnoozeTarget(null)}
        />
      )}
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-md mx-auto w-full">

        {/* Header */}
        <div className="mb-5">
          {/* Pass context banner — only shown on repeat visits today */}
          {passCount > 0 && (
            <div className="mb-3 rounded-xl border border-ui-accent/30 bg-ui-accent/8 px-3 py-2">
              <p className="text-xs text-ui-accent font-medium">
                {passCount + 1 < MAX_PASSES_PER_DAY
                  ? `Refinement pass ${passCount + 1} of ${MAX_PASSES_PER_DAY} — you've already triaged today. Each pass sharpens your priorities.`
                  : `Final pass for today (${MAX_PASSES_PER_DAY} of ${MAX_PASSES_PER_DAY}) — make it count.`}
              </p>
            </div>
          )}

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
              Drag to reorder — top is most important, bottom is least
            </p>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={order} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {order.map((id, i) => {
                    const task = batch.find(t => t.id === id)
                    if (!task) return null
                    return (
                      <TaskTile
                        key={id}
                        task={task}
                        rank={i + 1}
                        onSnooze={() => setSnoozeTarget(id)}
                        onDelete={() => handleDelete(id)}
                        onComplete={() => handleComplete(id)}
                      />
                    )
                  })}
                </div>
              </SortableContext>
            </DndContext>

            {/* Action row */}
            <div className="flex items-center justify-end mt-5 gap-3">
              <Button
                onClick={handleSubmit}
                disabled={submitting || order.length === 0}
              >
                {submitting ? '…' : 'Confirm this round'}
              </Button>
            </div>

            {error && <p className="text-xs text-red-400 text-center mt-3">{error}</p>}
          </>
        )}

      </div>
    </div>
  )
}
