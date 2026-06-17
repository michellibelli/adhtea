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
import { createTask, snoozeTask, updateTask, reorderTasks, completeTask } from '../api/tasks'
import { createPortal } from 'react-dom'
import Card from '../components/Card'
import Button from '../components/Button'
import TaskCard from '../components/TaskCard'
import EditTaskSheet from '../components/EditTaskSheet'
import { PageLoading, PageError } from '../components/PageState'
import { markTriageDone } from '../utils/triage'

const FALLBACK_MAX_TODAY = 15
const MAX_TOTAL = 20

function todayIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function offsetDate(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}


// ── Sortable triage row ─────────────────────────────────────────────────────

function SortableTriageRow({ task, onSnooze, onEdit, onComplete, onWhy, showWhy }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing mb-1.5">
      <TaskCard
        task={task}
        variant="triage"
        onComplete={onComplete}
        onSnooze={onSnooze}
        showScore
        showWhy={showWhy}
        onWhy={() => onWhy(task.id)}
      />
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

function DraggableUpNextRow({ task, onSnooze, onPromote, canPromote, onWhy, showWhy }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <TaskCard
            task={task}
            variant="triage"
            onSnooze={onSnooze}
            showScore
            showWhy={showWhy}
            onWhy={() => onWhy(task.id)}
          />
        </div>
        {canPromote && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPromote(task) }}
            title="Add to today"
            className="flex-shrink-0 mt-2 w-7 h-7 rounded-full border border-ui-border flex items-center justify-center text-sm text-ui-subtext hover:border-ui-accent hover:text-ui-accent transition-colors"
          >+</button>
        )}
      </div>
    </div>
  )
}


export default function Tournament({ onDone }) {
  const [triageTasks, setTriageTasks] = useState([])
  const [allTasks,    setAllTasks]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [busy,        setBusy]        = useState(false)
  const [applied,     setApplied]     = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [overflowItems, setOverflowItems] = useState(null)
  const [showWhyId,   setShowWhyId]   = useState(null)
  const [addingTask,  setAddingTask]  = useState(false)
  const [capacity,    setCapacity]    = useState(null)
  const [showOverWarning, setShowOverWarning] = useState(false)

  const sensors = useSensors(
    useSensor(SmartPointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,        { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  const refresh = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await previewTriage()
      if (data.today_capacity) setCapacity(data.today_capacity)
      const maxToday = data.today_capacity?.max_slots ?? FALLBACK_MAX_TODAY
      const flat = [...data.days.flatMap(d => d.items), ...data.overflow]
      const seen = new Set()
      const unique = flat.filter(t => {
        if (seen.has(t.id)) return false
        seen.add(t.id)
        return true
      })
      unique.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      setAllTasks(unique)
      const iso = todayIso()
      const today = unique.filter(t => t.status === 'today' || t.due_date === iso).slice(0, maxToday)
      setTriageTasks(today)
    } catch (e) {
      setError(e?.message || 'Could not load triage')
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh() }, [refresh])

  const maxToday = capacity?.max_slots ?? FALLBACK_MAX_TODAY
  const triageIds = useMemo(() => new Set(triageTasks.map(t => t.id)), [triageTasks])

  const upNextSlots = Math.max(0, MAX_TOTAL - triageTasks.length)
  const upNext = useMemo(
    () => allTasks.filter(t => !triageIds.has(t.id)).slice(0, upNextSlots),
    [allTasks, triageIds, upNextSlots],
  )

  const taskMap = useMemo(() => {
    const m = new Map()
    for (const t of allTasks) m.set(t.id, t)
    for (const t of triageTasks) m.set(t.id, t)
    return m
  }, [allTasks, triageTasks])

  // ── Handlers ──

  async function handleCreateTask(title) {
    if (addingTask || triageTasks.length >= maxToday) return
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
    if (triageTasks.length >= maxToday) return
    if (triageIds.has(task.id)) return
    const iso = todayIso()
    const updated = { ...task, due_date: iso, status: 'today' }
    setTriageTasks(prev => [updated, ...prev])
    setAllTasks(prev => prev.map(t => t.id === task.id ? updated : t))
    updateTask(task.id, { due_date: iso }).catch(() => {})
  }

  async function handlePromote(task) {
    if (triageTasks.length >= maxToday) return
    const iso = todayIso()
    const updated = { ...task, due_date: iso, status: 'today' }
    setTriageTasks(prev => [...prev, updated])
    setAllTasks(prev => prev.map(t => t.id === task.id ? updated : t))
    try { await updateTask(task.id, { due_date: iso }) }
    catch (e) { setError(e?.message || 'Could not update task') }
  }

  async function handleComplete(taskId) {
    setTriageTasks(prev => prev.filter(t => t.id !== taskId))
    setAllTasks(prev => prev.filter(t => t.id !== taskId))
    try { await completeTask(taskId) }
    catch (e) { setError(e?.message || 'Complete failed') }
  }

  async function handleSnooze(taskId, isoDate) {
    setTriageTasks(prev => prev.filter(t => t.id !== taskId))
    setAllTasks(prev => prev.filter(t => t.id !== taskId))
    try { await snoozeTask(taskId, isoDate) }
    catch (e) { setError(e?.message || 'Snooze failed') }
  }

  async function handleEditSave(patch) {
    if (!editingTask) return
    try {
      await updateTask(editingTask.id, patch)
      const updater = prev => prev.map(t => t.id === editingTask.id ? { ...t, ...patch } : t)
      setTriageTasks(updater)
      setAllTasks(updater)
    } catch (e) {
      setError(e?.message || 'Could not update task')
    }
    setEditingTask(null)
  }

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const isFromUpNext = !triageIds.has(active.id)
    const isOverToday = triageIds.has(over.id)

    if (isFromUpNext && isOverToday && triageTasks.length < maxToday) {
      const task = allTasks.find(t => t.id === active.id)
      if (!task) return
      const iso = todayIso()
      const updated = { ...task, due_date: iso, status: 'today' }
      const overIndex = triageTasks.findIndex(t => t.id === over.id)
      const inserted = [...triageTasks]
      inserted.splice(overIndex, 0, updated)
      setTriageTasks(inserted)
      setAllTasks(prev => prev.map(t => t.id === task.id ? updated : t))
      updateTask(task.id, { due_date: iso }).catch(() => {})
      reorderTasks(inserted.map(t => t.id))
      return
    }

    if (isFromUpNext) {
      const task = allTasks.find(t => t.id === active.id)
      if (task && triageTasks.length < maxToday) handlePromote(task)
      return
    }

    const oldIndex = triageTasks.findIndex(t => t.id === active.id)
    const newIndex = triageTasks.findIndex(t => t.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
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

  async function handleApply(force = false) {
    if (!force && capacity && triageTasks.length > maxToday) {
      setShowOverWarning(true)
      return
    }
    setBusy(true); setError(null)
    setShowOverWarning(false)
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
      <div className="px-4 pt-8 pb-8 max-w-2xl mx-auto w-full">

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

        {/* Capacity bar */}
        {capacity && (
          <div className="mb-3 px-0.5">
            <div className="flex items-center justify-between text-[10px] text-ui-subtext mb-1">
              <span>Capacity: {Math.round(capacity.remaining)} of {Math.round(capacity.budget)} units free</span>
              {capacity.routine_drain > 0 && <span>{capacity.routine_drain} used by routines</span>}
            </div>
            <div className="h-1.5 rounded-full bg-ui-border/40 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, ((capacity.budget - capacity.remaining) / capacity.budget) * 100)}%`,
                  background: triageTasks.length > maxToday ? '#D97706' : 'var(--aria-accent, #8B7355)',
                }}
              />
            </div>
          </div>
        )}

        {/* Over-capacity warning */}
        {showOverWarning && (
          <Card className="px-4 py-3 mb-3 border-amber-400/50 bg-amber-400/10">
            <p className="text-sm text-ui-text font-medium mb-1">Over capacity</p>
            <p className="text-xs text-ui-subtext mb-3">
              You have {triageTasks.length} tasks but capacity allows {maxToday}.
              Apply anyway, or go back and trim.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowOverWarning(false)}>Go back</Button>
              <Button size="sm" onClick={() => handleApply(true)}>Apply anyway</Button>
            </div>
          </Card>
        )}

        {/* ── Today section ── */}
        <p className="text-[10px] font-medium text-ui-subtext uppercase tracking-wider mb-2 px-0.5">
          Today ({triageTasks.length}/{maxToday})
        </p>

        {/* Add new task input */}
        {triageTasks.length < maxToday && (
          <NewTaskInput
            allTasks={allTasks}
            triageIds={triageIds}
            onCreated={handleCreateTask}
            onPick={handlePickExisting}
            busy={addingTask}
          />
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={[...triageTasks.map(t => t.id), ...upNext.map(t => t.id)]} strategy={verticalListSortingStrategy}>

            {triageTasks.length === 0 ? (
              <p className="text-xs text-ui-subtext text-center py-8">
                No tasks to triage — add one above or hit Recompute.
              </p>
            ) : (
              triageTasks.map(t => (
                <SortableTriageRow
                  key={t.id}
                  task={t}
                  onSnooze={handleSnooze}
                  onEdit={(id) => setEditingTask(taskMap.get(id) || t)}
                  onComplete={handleComplete}
                  onWhy={(id) => setShowWhyId(prev => prev === id ? null : id)}
                  showWhy={showWhyId === t.id}
                />
              ))
            )}

            {/* ── Divider + Up Next ── */}
            {upNext.length > 0 && (
              <>
                <div className="flex items-center gap-3 px-0.5 mt-4 mb-4">
                  <div className="flex-1 h-px bg-ui-border" />
                  <span className="text-[10px] font-medium text-ui-subtext uppercase tracking-wider">Up Next — drag up to add</span>
                  <div className="flex-1 h-px bg-ui-border" />
                </div>

                <div className="space-y-1.5">
                  {upNext.map(t => (
                    <DraggableUpNextRow
                      key={t.id}
                      task={t}
                      onSnooze={handleSnooze}
                      onEdit={(id) => setEditingTask(taskMap.get(id) || t)}
                      onPromote={handlePromote}
                      canPromote={triageTasks.length < maxToday}
                      onWhy={(id) => setShowWhyId(prev => prev === id ? null : id)}
                      showWhy={showWhyId === t.id}
                    />
                  ))}
                </div>
              </>
            )}

          </SortableContext>
        </DndContext>

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

      {/* Edit sheet */}
      {editingTask && (
        <EditTaskSheet
          task={editingTask}
          onSave={handleEditSave}
          onClose={() => setEditingTask(null)}
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
