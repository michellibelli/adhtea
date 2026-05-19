// Triage redesign R7+ — top-3 primary view with interactive 7-day plan.
//
// Workflow target: open the page with ~10 minutes, pick the 3 tasks for
// today, hit Apply, system bin-packs the rest into days 1–6 silently.
// The full 7-day grid is hidden by default behind a "Show full plan"
// disclosure. When opened: each item is draggable to any other day card,
// and the ★ per item pins to today + drops into the next open top-3 slot.
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  DndContext, closestCenter, useSensor, useSensors, useDraggable, useDroppable, TouchSensor,
} from '@dnd-kit/core'
import { SmartPointerSensor } from '../utils/dnd'
import {
  previewTriage, runTriage, recomputeTriage, pinTask, unpinTask,
} from '../api/triage'
import { deleteTask, snoozeTask } from '../api/tasks'
import Card from '../components/Card'
import Button from '../components/Button'
import ProjectBadge from '../components/ProjectBadge'
import { PageLoading, PageError } from '../components/PageState'
import { markTriageDone } from '../utils/triage'

// At ≥ this many pushes, surface the archive/delete prompt instead of letting
// the task drift through another snooze cycle.
const STALE_PUSH_THRESHOLD = 5

// Initial suggested-candidate count before "show more". Tuned so the list
// fits a phone viewport without scrolling.
const SUGGESTED_INITIAL = 10
const SUGGESTED_PAGE = 25

// Human-readable labels for `score_components` keys, used by WhyTooltip.
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


function todayIso() {
  // Local-date ISO (YYYY-MM-DD) — what the pin endpoint expects.
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}


function dayLabel(isoDate, offset) {
  if (offset === 0) return 'Today'
  if (offset === 1) return 'Tomorrow'
  const d = new Date(isoDate + 'T00:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}


function parseComponents(raw) {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}


function WhyTooltip({ components, total }) {
  if (!components) return null
  const entries = Object.entries(components).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
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


function ScoreChip({ task, onClick }) {
  if (task.score == null) return null
  return (
    <button
      type="button"
      onClick={onClick}
      title="Why this score?"
      className="flex-shrink-0 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-ui-border/40 text-ui-text hover:bg-ui-accent/20 hover:text-ui-accent transition-colors"
    >
      {Math.round(task.score)}
    </button>
  )
}


function MetaBadges({ task }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <ProjectBadge name={task.project_name} size="xs" />
      {task.domain_name && (
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-ui-border/60 text-ui-subtext uppercase tracking-wider">
          {task.domain_name}
        </span>
      )}
      {task.is_critical && (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">critical</span>
      )}
      {(task.push_count || 0) >= STALE_PUSH_THRESHOLD && (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 font-medium">stale ×{task.push_count}</span>
      )}
      {task.due_date && (
        <span className="text-[9px] text-ui-subtext">due {task.due_date}</span>
      )}
    </div>
  )
}


function StalePrompt({ task, onAfterAction }) {
  const [busy, setBusy] = useState(false)
  async function handleDelete() {
    setBusy(true)
    try { await deleteTask(task.id); await onAfterAction() }
    catch (e) { alert(e?.message || 'Delete failed') }
    finally { setBusy(false) }
  }
  async function handleSnoozeMonth() {
    setBusy(true)
    try {
      const until = new Date()
      until.setDate(until.getDate() + 30)
      until.setHours(0, 0, 0, 0)
      await snoozeTask(task.id, until.toISOString())
      await onAfterAction()
    } catch (e) { alert(e?.message || 'Snooze failed') }
    finally { setBusy(false) }
  }
  return (
    <div className="mt-2 pt-2 border-t border-amber-400/30 bg-amber-400/5 -mx-3 -mb-2 px-3 py-2 rounded-b-xl">
      <p className="text-[10px] text-amber-500 leading-snug">
        Pushed {task.push_count}× — keep delaying, or let it go?
      </p>
      <div className="flex gap-2 mt-1.5">
        <button type="button" onClick={handleDelete} disabled={busy}
          className="text-[10px] font-medium px-2 py-1 rounded border border-red-400/30 text-red-400 hover:bg-red-400/10 transition-colors">
          Delete
        </button>
        <button type="button" onClick={handleSnoozeMonth} disabled={busy}
          className="text-[10px] font-medium px-2 py-1 rounded border border-ui-border text-ui-subtext hover:text-ui-text transition-colors">
          Snooze 30d
        </button>
      </div>
    </div>
  )
}


// ── Top-3 slot card ──────────────────────────────────────────────────────────

function SlotCard({ index, task, onClear, onWhy, showWhy }) {
  const components = task ? parseComponents(task.score_components) : null
  return (
    <Card className={`px-3 py-3 ${task ? 'ring-1 ring-amber-400/50 bg-amber-400/5' : 'border-dashed opacity-70'}`}>
      <div className="flex items-start gap-2">
        <span className="text-base text-amber-400 flex-shrink-0 font-semibold">★{index + 1}</span>
        <div className="flex-1 min-w-0">
          {task ? (
            <>
              <p className="text-sm font-medium text-ui-text leading-snug break-words">{task.title}</p>
              <div className="mt-1">
                <MetaBadges task={task} />
              </div>
            </>
          ) : (
            <p className="text-sm text-ui-subtext italic">tap a suggestion below to fill</p>
          )}
        </div>
        {task && <ScoreChip task={task} onClick={onWhy} />}
        {task && (
          <button
            type="button"
            onClick={onClear}
            title="Remove from top 3"
            className="flex-shrink-0 text-ui-subtext/40 hover:text-red-400 transition-colors text-sm font-bold"
          >×</button>
        )}
      </div>
      {showWhy && task && <WhyTooltip components={components} total={task.score} />}
    </Card>
  )
}


// ── Candidate row in the suggested / search list ─────────────────────────────

function CandidateRow({ task, onAdd, onWhy, showWhy, inSlots, slotsFull, onAfterStale }) {
  const components = parseComponents(task.score_components)
  const isStale  = (task.push_count || 0) >= STALE_PUSH_THRESHOLD
  return (
    <Card className={`px-3 py-2 mb-1.5 ${inSlots ? 'opacity-50' : ''} ${isStale ? 'border-amber-400/40' : ''}`}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onAdd}
          disabled={inSlots || slotsFull}
          title={inSlots ? 'Already in top 3' : slotsFull ? 'Clear a slot first' : 'Add to top 3'}
          className={`flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold transition-colors ${
            inSlots
              ? 'border-amber-400/60 text-amber-400'
              : slotsFull
                ? 'border-ui-border text-ui-subtext/30 cursor-not-allowed'
                : 'border-ui-border text-ui-subtext hover:border-amber-400 hover:text-amber-400'
          }`}
        >
          {inSlots ? '★' : '+'}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ui-text leading-snug break-words">{task.title}</p>
          <div className="mt-1">
            <MetaBadges task={task} />
          </div>
        </div>
        <ScoreChip task={task} onClick={onWhy} />
      </div>
      {showWhy && <WhyTooltip components={components} total={task.score} />}
      {isStale && <StalePrompt task={task} onAfterAction={onAfterStale} />}
    </Card>
  )
}


// ── Full plan view (collapsible 7-column grid) ───────────────────────────────

function CapacityBar({ used, committed, budget }) {
  const total = used + committed
  const pct   = budget > 0 ? Math.min(100, (total / budget) * 100) : 0
  const over  = total > budget
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between text-[10px] text-ui-subtext mb-1">
        <span>{total.toFixed(0)} / {budget.toFixed(0)} units</span>
        {over && <span className="text-red-400 font-medium">over capacity</span>}
      </div>
      <div className="h-1 rounded-full bg-ui-border overflow-hidden">
        <div className={`h-full transition-all duration-300 ${over ? 'bg-red-400' : 'bg-ui-accent'}`}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}


function PlanItem({ task, isToday, onPinToday }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `plan-item-${task.id}`,
    data: { taskId: task.id },
  })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 50 : undefined }
    : undefined
  const starTitle = isToday ? 'Add to top 3' : 'Pin to today'
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1 py-1 border-b border-ui-border/30 last:border-0 touch-none"
    >
      <span
        {...attributes}
        {...listeners}
        className="text-ui-subtext/40 text-[11px] flex-shrink-0 cursor-grab active:cursor-grabbing px-0.5 select-none"
        aria-label="Drag to move"
      >⋮⋮</span>
      <span className="text-xs text-ui-text flex-1 truncate">{task.title}</span>
      <button
        type="button"
        onClick={() => onPinToday(task.id)}
        title={starTitle}
        className="text-[11px] text-ui-subtext/60 hover:text-amber-400 transition-colors px-1 flex-shrink-0"
      >★</button>
    </div>
  )
}


function PlanDay({ day, offset, children }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `plan-day-${day.date}`,
    data: { date: day.date },
  })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-sm bg-ui-surface pixel-card px-3 py-3 transition-colors ${isOver ? 'ring-2 ring-amber-400 bg-amber-400/10' : ''}`}
    >
      <div className="flex items-baseline justify-between mb-1.5">
        <h3 className="text-sm font-semibold text-ui-text">{dayLabel(day.date, offset)}</h3>
        <span className="text-[10px] text-ui-subtext">
          {day.items.length} task{day.items.length === 1 ? '' : 's'}
        </span>
      </div>
      <CapacityBar used={day.used} committed={day.committed} budget={day.budget} />
      {children}
    </div>
  )
}


function FullPlanView({ layout, onPinToday }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">
      {layout.days.map((day, i) => (
        <PlanDay key={day.date} day={day} offset={i}>
          {day.items.length === 0 ? (
            <p className="text-[10px] text-ui-subtext/60 italic text-center py-3">empty — drop a task here</p>
          ) : (
            day.items.map(t => (
              <PlanItem key={t.id} task={t} isToday={i === 0} onPinToday={onPinToday} />
            ))
          )}
        </PlanDay>
      ))}
      {layout.overflow.length > 0 && (
        <Card className="px-3 py-3 md:col-span-2 xl:col-span-3">
          <h3 className="text-sm font-semibold text-ui-text mb-2">
            The pile — {layout.overflow.length} task{layout.overflow.length === 1 ? '' : 's'} beyond the window
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-3">
            {layout.overflow.map(t => (
              <PlanItem key={t.id} task={t} isToday={false} onPinToday={onPinToday} />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}


// ── Main page ────────────────────────────────────────────────────────────────

export default function Tournament({ onDone }) {
  const [layout, setLayout] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [busy,    setBusy]    = useState(false)
  const [applied, setApplied] = useState(false)

  // [taskId, taskId, taskId] — null in empty slots.
  const [slots, setSlots] = useState([null, null, null])
  const [search, setSearch] = useState('')
  const [showWhyId, setShowWhyId] = useState(null)
  const [suggestedShown, setSuggestedShown] = useState(SUGGESTED_INITIAL)
  const [showFullPlan, setShowFullPlan] = useState(false)
  const [planError, setPlanError] = useState(null)

  // Once the user touches slots (manual + / × / star-from-plan), refresh-driven
  // pre-population stops overwriting their picks. Without this, recompute or a
  // pin from the full-plan view would silently wipe their top-3.
  const slotsTouchedRef = useRef(false)

  const sensors = useSensors(
    useSensor(SmartPointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,        { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

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

  // Mount-only fetch; refresh is stable (useCallback []).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh() }, [refresh])

  // All live tasks the bin-pack saw, flattened + sorted by score desc.
  // Includes currently-pinned items (they're inside their day's bucket) so
  // pre-populating the slots and the suggested list both read the same data.
  const allTasks = useMemo(() => {
    if (!layout) return []
    const flat = [...layout.days.flatMap(d => d.items), ...layout.overflow]
    // Dedupe by id (pinned items appear in their day's bucket already).
    const seen = new Set()
    const unique = flat.filter(t => {
      if (seen.has(t.id)) return false
      seen.add(t.id)
      return true
    })
    return unique.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  }, [layout])

  // Pre-populate slots once layout arrives: existing pins for today first,
  // then top-scored items fill remaining slots. User can swap any.
  // If the user has already touched slots, only validate existing ids (drop
  // any that no longer exist) — never overwrite their picks on refresh.
  useEffect(() => {
    if (!layout) return
    const validIds = new Set(allTasks.map(t => t.id))
    setSlots(prev => {
      const validated = prev.map(id => (id != null && validIds.has(id) ? id : null))
      if (slotsTouchedRef.current) return validated
      const iso = todayIso()
      const pinned = allTasks.filter(t => t.pinned_for === iso).slice(0, 3)
      const next = [pinned[0]?.id ?? null, pinned[1]?.id ?? null, pinned[2]?.id ?? null]
      let fillCursor = 0
      for (let i = 0; i < 3; i++) {
        if (next[i] != null) continue
        while (fillCursor < allTasks.length) {
          const t = allTasks[fillCursor++]
          if (next.includes(t.id)) continue
          next[i] = t.id
          break
        }
      }
      return next
    })
    // intentional: run only when allTasks changes shape, not on every slot edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout])

  const taskById = useMemo(() => {
    const m = new Map()
    for (const t of allTasks) m.set(t.id, t)
    return m
  }, [allTasks])

  const slotsFull = slots.every(s => s != null)

  // Suggested + search list: filter, then paginate.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allTasks
    return allTasks.filter(t => t.title.toLowerCase().includes(q))
  }, [allTasks, search])

  const visible = filtered.slice(0, suggestedShown)
  const moreCount = Math.max(0, filtered.length - suggestedShown)

  function assignToFirstEmptySlot(taskId) {
    slotsTouchedRef.current = true
    setSlots(prev => {
      // If already in a slot, this is a no-op (button is disabled).
      if (prev.includes(taskId)) return prev
      const idx = prev.findIndex(s => s == null)
      if (idx === -1) return prev
      const next = [...prev]
      next[idx] = taskId
      return next
    })
  }

  function clearSlot(idx) {
    slotsTouchedRef.current = true
    setSlots(prev => { const n = [...prev]; n[idx] = null; return n })
  }

  // ★ on a plan-view item: pin to today + drop into the first empty slot.
  // Errors (e.g. 409 if today already has 3 different pins) bubble into the
  // plan error banner so the user knows the pin didn't land.
  async function handlePinFromPlan(taskId) {
    setPlanError(null)
    const iso = todayIso()
    try {
      await pinTask(taskId, iso)
      assignToFirstEmptySlot(taskId)
      await refresh()
    } catch (e) {
      const msg = String(e?.message || e || '')
      if (e?.status === 409 || /409|already has/.test(msg)) {
        setPlanError('Today already has 3 pins — clear one in the top-3 first.')
      } else {
        setPlanError(msg || 'Pin failed')
      }
    }
  }

  // Drag-end from the full plan view: re-pin to the target day. Cap is 3 pins
  // per day server-side; surface a friendly message on 409.
  async function handlePlanDragEnd(event) {
    const { active, over } = event
    if (!over) return
    const taskId = active?.data?.current?.taskId
    const targetDate = over?.data?.current?.date
    if (!taskId || !targetDate) return
    setPlanError(null)
    try {
      await pinTask(taskId, targetDate)
      await refresh()
    } catch (e) {
      const msg = String(e?.message || e || '')
      if (e?.status === 409 || /409|already has/.test(msg)) {
        setPlanError(`${dayLabel(targetDate, -1)} already has 3 pins.`)
      } else {
        setPlanError(msg || 'Move failed')
      }
    }
  }

  function toggleWhy(taskId) {
    setShowWhyId(prev => (prev === taskId ? null : taskId))
  }

  async function handleRecompute() {
    setBusy(true)
    try { await recomputeTriage(); await refresh() }
    finally { setBusy(false) }
  }

  async function handleApply() {
    setBusy(true); setError(null)
    try {
      const iso = todayIso()
      // Pin everything in slots. Server caps at 3/day; we send sequentially
      // to surface a pin failure (e.g. existing other pin) clearly.
      for (const id of slots.filter(Boolean)) {
        try { await pinTask(id, iso) }
        catch (e) {
          // 409 = day already at cap. Pre-existing pins might be eating
          // the slots; unpin anything not in our chosen 3 and retry.
          if (e?.status === 409 || /409/.test(String(e?.message))) {
            const day0 = layout?.days?.[0]
            const conflicts = (day0?.items || []).filter(t => t.pinned_for === iso && !slots.includes(t.id))
            for (const c of conflicts) await unpinTask(c.id)
            await pinTask(id, iso)
          } else { throw e }
        }
      }
      await runTriage()
      markTriageDone()
      setApplied(true)
      setTimeout(() => onDone?.(), 800)
    } catch (e) {
      setError(e?.message || 'Could not apply triage')
    } finally { setBusy(false) }
  }

  if (loading) return <PageLoading />
  if (error)   return <PageError onRetry={refresh} />
  if (!layout) return <PageError onRetry={refresh} />

  const totalLive = allTasks.length

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-2xl mx-auto w-full">

        {/* Header */}
        <div className="flex items-start justify-between mb-1 flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-ui-text">Triage</h1>
            <p className="text-sm text-ui-subtext mt-0.5">
              Pick your top 3 for today — system handles the rest.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={handleRecompute} disabled={busy}>
              ↻ Recompute
            </Button>
            <Button onClick={handleApply} disabled={busy || slots.every(s => s == null)}>
              {applied ? '✓ Applied' : 'Apply'}
            </Button>
          </div>
        </div>

        {/* Top-3 slots */}
        <div className="space-y-2 mt-5 mb-6">
          {slots.map((id, idx) => (
            <SlotCard
              key={idx}
              index={idx}
              task={id != null ? taskById.get(id) : null}
              onClear={() => clearSlot(idx)}
              onWhy={() => id != null && toggleWhy(id)}
              showWhy={id != null && showWhyId === id}
            />
          ))}
        </div>

        {/* Search */}
        <div className="mb-3">
          <input
            type="search"
            value={search}
            onChange={e => { setSearch(e.target.value); setSuggestedShown(SUGGESTED_INITIAL) }}
            placeholder={`Search ${totalLive} task${totalLive === 1 ? '' : 's'}…`}
            className="w-full text-sm bg-ui-input border border-ui-input-border rounded-xl px-3 py-2 text-ui-text placeholder-ui-subtext/50 outline-none focus:border-ui-accent transition-colors"
          />
        </div>

        {/* Suggested / search results */}
        <div className="mb-4">
          <div className="flex items-baseline justify-between mb-2 px-0.5">
            <p className="text-[10px] font-medium text-ui-subtext uppercase tracking-wider">
              {search ? 'Results' : 'Suggested — top scored'}
            </p>
            <span className="text-[10px] text-ui-subtext">
              {filtered.length} match{filtered.length === 1 ? '' : 'es'}
            </span>
          </div>
          {visible.length === 0 ? (
            <p className="text-xs text-ui-subtext text-center py-6">no matches</p>
          ) : (
            visible.map(t => (
              <CandidateRow
                key={t.id}
                task={t}
                inSlots={slots.includes(t.id)}
                slotsFull={slotsFull}
                onAdd={() => assignToFirstEmptySlot(t.id)}
                onWhy={() => toggleWhy(t.id)}
                showWhy={showWhyId === t.id}
                onAfterStale={refresh}
              />
            ))
          )}
          {moreCount > 0 && (
            <button
              type="button"
              onClick={() => setSuggestedShown(n => n + SUGGESTED_PAGE)}
              className="w-full mt-2 text-xs text-ui-subtext hover:text-ui-text py-2 transition-colors"
            >
              Show {Math.min(moreCount, SUGGESTED_PAGE)} more ↓
            </button>
          )}
        </div>

        {error && <p className="text-xs text-red-400 text-center my-3">{error}</p>}

        {/* Full-plan disclosure */}
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowFullPlan(s => !s)}
            className="w-full flex items-center justify-center gap-2 text-xs text-ui-subtext hover:text-ui-text py-2 transition-colors border-t border-ui-border pt-4"
          >
            <span>{showFullPlan ? '▾' : '▸'}</span>
            <span>{showFullPlan ? 'Hide' : 'Show'} full 7-day plan</span>
          </button>
          {showFullPlan && (
            <>
              <p className="text-[10px] text-ui-subtext text-center mt-2">
                Drag between days to repin · tap ★ to send to today
              </p>
              {planError && (
                <p className="text-xs text-amber-400 text-center mt-2">{planError}</p>
              )}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePlanDragEnd}>
                <FullPlanView layout={layout} onPinToday={handlePinFromPlan} />
              </DndContext>
            </>
          )}
        </div>

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
