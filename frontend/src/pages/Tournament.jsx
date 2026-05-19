// Triage redesign R4 — new entry point at /tournament route.
// Replaces the prior multi-round drag-to-rank "Tournament" UI.
//
// Layout: rolling 7-day window as column cards. Each column shows a
// capacity gauge (used vs budget weight units) and the items the
// bin-pack placed there. Each card has a pin button (★/☆) and a score
// chip that opens the "Why this?" component breakdown — confidence
// comes from showing the math, not hiding it. Apply persists the layout.
import { useState, useEffect, useCallback } from 'react'
import {
  previewTriage, runTriage, recomputeTriage, pinTask, unpinTask,
} from '../api/triage'
import Card from '../components/Card'
import Button from '../components/Button'
import ProjectBadge from '../components/ProjectBadge'
import { PageLoading, PageError } from '../components/PageState'
import { markTriageDone } from './Triage'


// Human-readable labels for `score_components` keys. Anything missing here
// renders as the raw key — fine for early iteration; we can add labels as
// new levers get introduced.
const LEVER_LABELS = {
  priority:       'Priority',
  critical_bonus: 'Critical',
  overdue_boost:  'Overdue',
  due_today:      'Due today',
  due_soon:       'Due soon',
  project_stall:  'Stalling project',
  in_context:     'Fits this time',
  age_boost:      'Inbox age',
  push_penalty:   'Pushed before',
}


function dayLabel(isoDate, offset) {
  if (offset === 0) return 'Today'
  if (offset === 1) return 'Tomorrow'
  const d = new Date(isoDate + 'T00:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}


function CapacityBar({ used, committed, budget }) {
  const total  = used + committed
  const pct    = budget > 0 ? Math.min(100, (total / budget) * 100) : 0
  const over   = total > budget
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between text-[10px] text-ui-subtext mb-1">
        <span>{total.toFixed(0)} / {budget.toFixed(0)} units</span>
        {over && <span className="text-red-400 font-medium">over capacity</span>}
      </div>
      <div className="h-1 rounded-full bg-ui-border overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${over ? 'bg-red-400' : 'bg-ui-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}


function WhyTooltip({ components, total }) {
  if (!components) return null
  // Sort by absolute contribution (largest first) so the dominant
  // reasons render on top.
  const entries = Object.entries(components).sort(
    (a, b) => Math.abs(b[1]) - Math.abs(a[1]),
  )
  return (
    <div className="mt-2 pt-2 border-t border-ui-border/50 space-y-0.5">
      <p className="text-[10px] font-semibold text-ui-text mb-1">
        Total score: {Math.round(total)}
      </p>
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between text-[10px]">
          <span className="text-ui-subtext">{LEVER_LABELS[k] || k}</span>
          <span className={`font-mono ${v >= 0 ? 'text-ui-accent' : 'text-red-400'}`}>
            {v >= 0 ? '+' : ''}{v}
          </span>
        </div>
      ))}
    </div>
  )
}


function TriageCard({ task, dayDate, pinDisabled, onPin, onUnpin }) {
  const [showWhy, setShowWhy] = useState(false)
  const isPinned = task.pinned_for === dayDate
  const components = task.score_components
    ? (() => { try { return JSON.parse(task.score_components) } catch { return null } })()
    : null
  const score = task.score == null ? null : Math.round(task.score)

  return (
    <Card className={`px-3 py-2 mb-1.5 ${isPinned ? 'ring-1 ring-amber-400/40' : ''}`}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => (isPinned ? onUnpin() : onPin())}
          disabled={!isPinned && pinDisabled}
          title={isPinned ? 'Unpin' : pinDisabled ? 'Day already has 3 pins' : 'Pin to this day'}
          className={`flex-shrink-0 text-base leading-none transition-colors ${
            isPinned
              ? 'text-amber-400'
              : pinDisabled
                ? 'text-ui-subtext/30 cursor-not-allowed'
                : 'text-ui-subtext/40 hover:text-amber-400'
          }`}
        >
          {isPinned ? '★' : '☆'}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ui-text leading-snug break-words">{task.title}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <ProjectBadge name={task.project_name} size="xs" />
            {task.domain_name && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-ui-border/60 text-ui-subtext uppercase tracking-wider">
                {task.domain_name}
              </span>
            )}
            {task.is_critical && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">critical</span>
            )}
            {task.due_date && (
              <span className="text-[9px] text-ui-subtext">due {task.due_date}</span>
            )}
          </div>
        </div>
        {score != null && (
          <button
            type="button"
            onClick={() => setShowWhy(!showWhy)}
            title="Why this score?"
            className="flex-shrink-0 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-ui-border/40 text-ui-text hover:bg-ui-accent/20 hover:text-ui-accent transition-colors"
          >
            {score}
          </button>
        )}
      </div>
      {showWhy && <WhyTooltip components={components} total={task.score} />}
    </Card>
  )
}


function DayColumn({ day, offset, onPin, onUnpin, pinCount }) {
  const dayDate    = day.date
  const pinDisabled = pinCount >= 3
  return (
    <Card className="px-3 py-3 flex flex-col">
      <div className="flex items-baseline justify-between mb-1.5">
        <h3 className="text-sm font-semibold text-ui-text">{dayLabel(dayDate, offset)}</h3>
        <span className="text-[10px] text-ui-subtext">
          {day.items.length} task{day.items.length === 1 ? '' : 's'}
        </span>
      </div>
      <CapacityBar used={day.used} committed={day.committed} budget={day.budget} />
      {day.items.length === 0 ? (
        <p className="text-[10px] text-ui-subtext/60 italic text-center py-3">empty</p>
      ) : (
        day.items.map(task => (
          <TriageCard
            key={task.id}
            task={task}
            dayDate={dayDate}
            pinDisabled={pinDisabled}
            onPin={()   => onPin(task.id, dayDate)}
            onUnpin={() => onUnpin(task.id)}
          />
        ))
      )}
    </Card>
  )
}


export default function Tournament({ onDone }) {
  const [layout, setLayout] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [busy,    setBusy]    = useState(false)
  const [applied, setApplied] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await previewTriage()
      setLayout(data)
    } catch (e) {
      setError(e?.message || 'Could not load triage')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function handleRecompute() {
    setBusy(true)
    try { await recomputeTriage(); await refresh() }
    finally { setBusy(false) }
  }

  async function handleApply() {
    setBusy(true)
    try {
      await runTriage()
      markTriageDone()
      setApplied(true)
      setTimeout(() => onDone?.(), 800)
    } catch (e) {
      setError(e?.message || 'Could not apply triage')
    } finally { setBusy(false) }
  }

  async function handlePin(taskId, isoDate) {
    setBusy(true)
    try { await pinTask(taskId, isoDate); await refresh() }
    catch (e) { alert(e?.message || 'Pin failed') }
    finally { setBusy(false) }
  }

  async function handleUnpin(taskId) {
    setBusy(true)
    try { await unpinTask(taskId); await refresh() }
    finally { setBusy(false) }
  }

  if (loading) return <PageLoading />
  if (error)   return <PageError onRetry={refresh} />
  if (!layout) return <PageError onRetry={refresh} />

  // Count pins per day so the UI can disable the pin button when a day is
  // already at the max (3) — matches the server-side cap.
  const pinsPerDay = {}
  for (const d of layout.days) {
    pinsPerDay[d.date] = d.items.filter(t => t.pinned_for === d.date).length
  }

  const totalToPlace = layout.days.reduce((n, d) => n + d.items.length, 0) + layout.overflow.length

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-6xl mx-auto w-full">

        {/* Header */}
        <div className="flex items-start justify-between mb-1 flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-ui-text">Triage</h1>
            <p className="text-sm text-ui-subtext mt-0.5">
              {totalToPlace} task{totalToPlace === 1 ? '' : 's'} sorted into the next 7 days
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={handleRecompute} disabled={busy}>
              ↻ Recompute
            </Button>
            <Button onClick={handleApply} disabled={busy}>
              {applied ? '✓ Applied' : 'Apply triage'}
            </Button>
          </div>
        </div>

        <p className="text-xs text-ui-subtext mb-4 mt-1">
          Tap ★ on a card to pin it to that day. Tap the score chip to see the math.
          "Apply triage" makes the placement real.
        </p>

        {/* Day columns — responsive: 1 col mobile, 2 desktop, 3 wide */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {layout.days.map((day, i) => (
            <DayColumn
              key={day.date}
              day={day}
              offset={i}
              pinCount={pinsPerDay[day.date]}
              onPin={handlePin}
              onUnpin={handleUnpin}
            />
          ))}
        </div>

        {/* Overflow pile — items that didn't fit anywhere in the 7-day window */}
        {layout.overflow.length > 0 && (
          <Card className="mt-4 px-3 py-3">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-semibold text-ui-text">The pile</h3>
              <span className="text-[10px] text-ui-subtext">
                {layout.overflow.length} task{layout.overflow.length === 1 ? '' : 's'} beyond the window
              </span>
            </div>
            {layout.overflow.map(task => (
              <TriageCard
                key={task.id}
                task={task}
                dayDate={null}
                pinDisabled
                onPin={() => {}}
                onUnpin={() => handleUnpin(task.id)}
              />
            ))}
          </Card>
        )}

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => onDone?.()}
            className="text-xs text-ui-subtext/60 hover:text-ui-subtext transition-colors"
          >
            Back to Today →
          </button>
        </div>
      </div>
    </div>
  )
}
