// Triage — full day-planning surface.
//
// Flow: add new tasks → snooze what you don't want today → drag into
// execution order → Apply. If over capacity, an overflow bumper lets
// you tap tasks to bump to tomorrow.
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  DndContext, closestCenter, useSensor, useSensors, TouchSensor,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { SmartPointerSensor } from '../utils/dnd'
import {
  previewTriage, recomputeTriage, applyOrderedTriage, resolveOverflow,
} from '../api/triage'
import { createTask, snoozeTask, reorderTasks } from '../api/tasks'
import { createPortal } from 'react-dom'
import Card from '../components/Card'
import Button from '../components/Button'
import ProjectBadge from '../components/ProjectBadge'
import SnoozeSheet from '../components/SnoozeSheet'
import { PageLoading, PageError } from '../components/PageState'
import { markTriageDone } from '../utils/triage'

const STALE_PUSH_THRESHOLD = 5
const MAX_TRIAGE_TASKS = 32

const LEVER_LABELS = {
  priority:        'Priority',
  critical_bonus:  'Critical',
  overdue_boost:   'Overdue',
  due_today:       'Due today',
  due_soon:        'Due soon',
  same_day_create: 'Same-day deadline',
  project_stall:   'Stalling project',
  in_context:      'Fits this time',
  age_boost:       'Inbox age',
  push_penalty:    'Pushed before',
}


function todayIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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


// ── Sortable triage row ─────────────────────────────────────────────────────

function SortableTriageRow({ task, onSnooze, onWhy, showWhy }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const components = parseComponents(task.score_components)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  }

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={`px-3 py-2 mb-1.5 ${(task.push_count || 0) >= STALE_PUSH_THRESHOLD ? 'border-amber-400/40' : ''}`}>
        <div className="flex items-start gap-2">
          {/* Drag handle */}
          <span
            {...attributes}
            {...listeners}
            className="text-ui-subtext/40 text-[11px] flex-shrink-0 cursor-grab active:cursor-grabbing px-0.5 select-none mt-1"
            aria-label="Drag to reorder"
          >⋮⋮</span>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ui-text leading-snug break-words">{task.title}</p>
            <div className="mt-1">
              <MetaBadges task={task} />
            </div>
          </div>

          <ScoreChip task={task} onClick={() => onWhy(task.id)} />

          {/* Snooze button */}
          <button
            type="button"
            onClick={() => onSnooze(task.id)}
            title="Snooze"
            aria-label="Snooze"
            className="flex-shrink-0 p-1 text-ui-subtext/40 hover:text-ui-accent transition-colors mt-0.5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15.5 14" />
            </svg>
          </button>
        </div>
        {showWhy && <WhyTooltip components={components} total={task.score} />}
      </Card>
    </div>
  )
}


// ── New task input ──────────────────────────────────────────────────────────

function NewTaskInput({ allTasks, triageIds, onCreated, onPick, busy }) {
  const [query, setQuery] = useState('')

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allTasks
      .filter(t => !triageIds.has(t.id) && t.title.toLowerCase().includes(q))
      .slice(0, 6)
  }, [query, allTasks, triageIds])

  async function handleCreate() {
    const t = query.trim()
    if (!t) return
    setQuery('')
    await onCreated(t)
  }

  return (
    <Card className="px-3 py-3 border-dashed mb-4">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key !== 'Enter') return
                if (matches.length > 0) { onPick(matches[0]); setQuery('') }
                else if (query.trim()) handleCreate()
              }}
              placeholder="add a task to today…"
              disabled={busy}
              className="flex-1 min-w-0 text-sm bg-transparent text-ui-text placeholder-ui-subtext/50 outline-none"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy || !query.trim()}
              title="Add new task due today"
              className="flex-shrink-0 w-6 h-6 rounded-full border border-ui-border flex items-center justify-center text-xs font-bold text-ui-subtext hover:border-amber-400 hover:text-amber-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >+</button>
          </div>
          {query.trim() && matches.length > 0 && (
            <div className="mt-2 pt-1.5 border-t border-ui-border/50 space-y-0.5">
              {matches.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { onPick(t); setQuery('') }}
                  className="w-full flex items-center gap-2 text-left px-1 py-1 rounded hover:bg-ui-accent/10 transition-colors"
                >
                  <span className="text-sm text-ui-text flex-1 truncate">{t.title}</span>
                  {t.score != null && (
                    <span className="text-[10px] font-mono text-ui-subtext flex-shrink-0">{Math.round(t.score)}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}


// ── Overflow bumper sheet ────────────────────────────────────────────────────

function OverflowBumper({ tasks, taskMap, onResolve, onKeepAll }) {
  const [bumped, setBumped] = useState(new Set())

  function toggle(id) {
    setBumped(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleDone() {
    const keepIds = tasks.filter(id => !bumped.has(id))
    const bumpIds = tasks.filter(id => bumped.has(id))
    onResolve(keepIds, bumpIds)
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-start md:justify-center md:pt-[15vh]">
      <div className="fixed inset-0 bg-black/30" onClick={onKeepAll} />
      <div className="relative bg-ui-surface rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[70vh] overflow-y-auto shadow-xl">
        <div className="p-4">
          <div className="w-10 h-1 rounded-full bg-ui-border mx-auto mb-3 md:hidden" />
          <h3 className="text-base font-semibold text-ui-text mb-1">Over capacity</h3>
          <p className="text-xs text-ui-subtext mb-4">
            Tap tasks to bump them to tomorrow. Or keep all and power through.
          </p>

          <div className="space-y-1.5">
            {tasks.map(id => {
              const task = taskMap.get(id)
              if (!task) return null
              const isBumped = bumped.has(id)
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all ${
                    isBumped
                      ? 'border-amber-400/50 bg-amber-400/10 opacity-60'
                      : 'border-ui-border bg-ui-input hover:bg-ui-accent/5'
                  }`}
                >
                  <span className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] transition-colors ${
                    isBumped ? 'border-amber-400 bg-amber-400 text-white' : 'border-ui-border'
                  }`}>
                    {isBumped && '→'}
                  </span>
                  <span className={`text-sm flex-1 truncate ${isBumped ? 'line-through text-ui-subtext' : 'text-ui-text'}`}>
                    {task.title}
                  </span>
                  {task.weight && (
                    <span className="text-[9px] text-ui-subtext flex-shrink-0">{task.weight}</span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="flex gap-2 mt-4">
            <Button variant="ghost" className="flex-1" onClick={onKeepAll}>
              Keep all
            </Button>
            <Button className="flex-1" onClick={handleDone} disabled={bumped.size === 0}>
              Bump {bumped.size} to tomorrow
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}


// ── Main page ────────────────────────────────────────────────────────────────

export default function Tournament({ onDone }) {
  const [triageTasks, setTriageTasks] = useState([])
  const [allTasks,    setAllTasks]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [busy,        setBusy]        = useState(false)
  const [applied,     setApplied]     = useState(false)
  const [showSnoozeFor, setShowSnoozeFor] = useState(null)
  const [overflowItems, setOverflowItems] = useState(null)
  const [showWhyId,   setShowWhyId]   = useState(null)
  const [addingTask,  setAddingTask]  = useState(false)

  const sensors = useSensors(
    useSensor(SmartPointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,        { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  const refresh = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await previewTriage()
      const flat = [...data.days.flatMap(d => d.items), ...data.overflow]
      const seen = new Set()
      const unique = flat.filter(t => {
        if (seen.has(t.id)) return false
        seen.add(t.id)
        return true
      })
      unique.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      setAllTasks(unique)
      const day0 = unique.slice(0, MAX_TRIAGE_TASKS)
      setTriageTasks(day0)
    } catch (e) {
      setError(e?.message || 'Could not load triage')
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh() }, [refresh])

  const triageIds = useMemo(() => new Set(triageTasks.map(t => t.id)), [triageTasks])

  const taskMap = useMemo(() => {
    const m = new Map()
    for (const t of allTasks) m.set(t.id, t)
    for (const t of triageTasks) m.set(t.id, t)
    return m
  }, [allTasks, triageTasks])

  // ── Handlers ──

  async function handleCreateTask(title) {
    if (addingTask || triageTasks.length >= MAX_TRIAGE_TASKS) return
    setAddingTask(true); setError(null)
    try {
      const iso = todayIso()
      const created = await createTask({ title, task_type: 'task', due_date: iso })
      setTriageTasks(prev => [created, ...prev])
      setAllTasks(prev => [created, ...prev])
    } catch (e) {
      setError(e?.message || 'Could not add task')
    } finally {
      setAddingTask(false)
    }
  }

  function handlePickExisting(task) {
    if (triageTasks.length >= MAX_TRIAGE_TASKS) return
    if (triageIds.has(task.id)) return
    setTriageTasks(prev => [task, ...prev])
  }

  async function handleSnooze(taskId, isoDate) {
    setShowSnoozeFor(null)
    setTriageTasks(prev => prev.filter(t => t.id !== taskId))
    try { await snoozeTask(taskId, isoDate) }
    catch (e) { setError(e?.message || 'Snooze failed') }
  }

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = triageTasks.findIndex(t => t.id === active.id)
    const newIndex = triageTasks.findIndex(t => t.id === over.id)
    const reordered = arrayMove(triageTasks, oldIndex, newIndex)
    setTriageTasks(reordered)
    reorderTasks(reordered.map(t => t.id))
  }

  async function handleRecompute() {
    setBusy(true)
    try {
      await recomputeTriage()
      await refresh()
    } finally { setBusy(false) }
  }

  async function handleApply() {
    setBusy(true); setError(null)
    try {
      const result = await applyOrderedTriage(triageTasks.map(t => t.id))
      if (result.overflow && result.overflow.length > 0) {
        setOverflowItems(result.overflow)
      } else {
        markTriageDone()
        setApplied(true)
        setTimeout(() => onDone?.(), 600)
      }
    } catch (e) {
      setError(e?.message || 'Could not apply triage')
    } finally { setBusy(false) }
  }

  async function handleOverflowResolve(keepIds, bumpIds) {
    setBusy(true); setError(null)
    try {
      await resolveOverflow(keepIds, bumpIds)
      setOverflowItems(null)
      markTriageDone()
      setApplied(true)
      setTimeout(() => onDone?.(), 600)
    } catch (e) {
      setError(e?.message || 'Could not resolve overflow')
    } finally { setBusy(false) }
  }

  function handleKeepAll() {
    const allIds = overflowItems || []
    handleOverflowResolve(allIds, [])
  }

  if (loading) return <PageLoading />
  if (error && !triageTasks.length) return <PageError onRetry={refresh} />

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-2xl mx-auto w-full">

        {/* Header */}
        <div className="flex items-start justify-between mb-1 flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-ui-text">Triage</h1>
            <p className="text-sm text-ui-subtext mt-0.5">
              Add, snooze, reorder — then apply.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={handleRecompute} disabled={busy}>
              ↻ Recompute
            </Button>
            <Button onClick={handleApply} disabled={busy || triageTasks.length === 0}>
              {applied ? '✓ Applied' : `Apply (${triageTasks.length})`}
            </Button>
          </div>
        </div>

        {/* Task count + capacity hint */}
        <p className="text-[10px] text-ui-subtext mb-4 px-0.5">
          {triageTasks.length} task{triageTasks.length === 1 ? '' : 's'} for today
          {triageTasks.length >= MAX_TRIAGE_TASKS && ' (max)'}
        </p>

        {/* Add new task input */}
        {triageTasks.length < MAX_TRIAGE_TASKS && (
          <NewTaskInput
            allTasks={allTasks}
            triageIds={triageIds}
            onCreated={handleCreateTask}
            onPick={handlePickExisting}
            busy={addingTask}
          />
        )}

        {/* Sortable triage list */}
        {triageTasks.length === 0 ? (
          <p className="text-xs text-ui-subtext text-center py-8">
            No tasks to triage — add one above or hit Recompute.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={triageTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {triageTasks.map(t => (
                <SortableTriageRow
                  key={t.id}
                  task={t}
                  onSnooze={() => setShowSnoozeFor(t.id)}
                  onWhy={(id) => setShowWhyId(prev => prev === id ? null : id)}
                  showWhy={showWhyId === t.id}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}

        {error && <p className="text-xs text-red-400 text-center my-3">{error}</p>}

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

      {/* Snooze sheet */}
      {showSnoozeFor != null && (
        <SnoozeSheet
          onSnooze={(isoDate) => handleSnooze(showSnoozeFor, isoDate)}
          onClose={() => setShowSnoozeFor(null)}
          domainName={taskMap.get(showSnoozeFor)?.domain_name}
        />
      )}

      {/* Overflow bumper */}
      {overflowItems && (
        <OverflowBumper
          tasks={overflowItems}
          taskMap={taskMap}
          onResolve={handleOverflowResolve}
          onKeepAll={handleKeepAll}
        />
      )}
    </div>
  )
}
