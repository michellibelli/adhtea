import { useState, useEffect, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SmartPointerSensor } from '../utils/dnd'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getToday, getDoneToday, completeTask, snoozeTask, deferTask, deleteTask, reorderTasks, startTournament } from '../api/tasks'
import { getTodayCapacity } from '../api/selfcare'
import TaskCard from '../components/TaskCard'
import CapacityBar from '../components/CapacityBar'
import Card from '../components/Card'
import Button from '../components/Button'

const WEIGHTS = { light: 1, medium: 2, heavy: 3 }

function computeLoad(tasks) {
  if (!tasks.length) return { label: 'All clear', color: 'text-emerald-400', bar: 'bg-emerald-400', pct: 0, level: 'clear' }
  const sum = tasks.reduce((a, t) => a + (WEIGHTS[t.weight] || 2), 0)
  if (sum <= 6)  return { label: 'Light day',  color: 'text-emerald-400', bar: 'bg-emerald-400', pct: 25,  level: 'light' }
  if (sum <= 12) return { label: 'Manageable', color: 'text-blue-400',    bar: 'bg-blue-400',    pct: 55,  level: 'manageable' }
  if (sum <= 18) return { label: 'Heavy day',  color: 'text-amber-400',   bar: 'bg-amber-400',   pct: 80,  level: 'heavy' }
  return              { label: 'Overloaded',  color: 'text-red-400',     bar: 'bg-red-400',     pct: 100, level: 'overloaded' }
}

const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 }
const DESIRE_RANK   = { high: 0, medium: 1, low: 2 }

function sortTasks(tasks, sortBy) {
  const copy = [...tasks]
  if (sortBy === 'priority') {
    return copy.sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 4
      const pb = PRIORITY_RANK[b.priority] ?? 4
      if (pa !== pb) return pa - pb
      return (a.sort_order ?? 999) - (b.sort_order ?? 999)
    })
  }
  if (sortBy === 'desire') {
    return copy.sort((a, b) => {
      const da = DESIRE_RANK[a.desire] ?? 3
      const db = DESIRE_RANK[b.desire] ?? 3
      if (da !== db) return da - db
      return (a.sort_order ?? 999) - (b.sort_order ?? 999)
    })
  }
  return copy.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
}

function SortableTaskRow({ task, onComplete, onSnooze, onDefer, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing"
    >
      <TaskCard
        task={task}
        variant="today"
        onComplete={onComplete}
        onSnooze={onSnooze}
        onDefer={onDefer}
        onDelete={onDelete}
      />
    </div>
  )
}

export default function Today({ visibleLimit = 10, carriedOver = false, onTriage, onTournament }) {
  const [tasks, setTasks]       = useState([])
  const [doneTasks, setDone]    = useState([])
  const [capacity, setCapacity] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [showDone, setShowDone] = useState(false)
  const [expandedDoneId, setExpandedDoneId] = useState(null)
  const [sortBy, setSortBy]     = useState('manual')
  const [dismissOverload, setDismissOverload] = useState(false)

  const sensors = useSensors(
    useSensor(SmartPointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  const fetchTasks = useCallback(async () => {
    try {
      const [todayList, doneList, cap] = await Promise.all([getToday(), getDoneToday(), getTodayCapacity()])
      setTasks(todayList)
      setDone(doneList)
      setCapacity(cap)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const timed = tasks
    .filter(t => t.task_type === 'appointment' || t.task_type === 'routine')
    .sort((a, b) => {
      const at = a.due_time || '99:99'
      const bt = b.due_time || '99:99'
      if (at !== bt) return at.localeCompare(bt)
      return (a.due_date || '').localeCompare(b.due_date || '')
    })

  const regular = sortTasks(
    tasks.filter(t => t.task_type !== 'appointment' && t.task_type !== 'routine'),
    sortBy
  )
  const visible = regular.slice(0, visibleLimit)
  const queued  = regular.slice(visibleLimit)
  const load    = computeLoad(tasks)

  async function handleComplete(id) { await completeTask(id); fetchTasks() }
  async function handleSnooze(id, until) { await snoozeTask(id, until); fetchTasks() }
  async function handleDefer(id) { await deferTask(id); fetchTasks() }
  async function handleDelete(id) { await deleteTask(id); fetchTasks() }

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = regular.findIndex(t => t.id === active.id)
    const newIndex = regular.findIndex(t => t.id === over.id)
    const reordered = arrayMove(regular, oldIndex, newIndex).map((t, i) => ({ ...t, sort_order: i }))
    setTasks([...timed, ...reordered])
    await reorderTasks(reordered.map(t => t.id))
  }

  if (loading) return <div className="aria-page flex items-center justify-center"><p className="text-sm text-ui-subtext">Loading…</p></div>

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-2xl mx-auto w-full">

        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold text-ui-text">Today</h1>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className="text-sm text-ui-subtext">{visible.length} of {tasks.length}</span>
            {onTournament && (
              <Button variant="secondary" onClick={async () => {
                if (!confirm('This will re-rank all your incomplete tasks across consecutive days. Existing day assignments will be cleared. Continue?')) return
                try { await startTournament() } catch (e) { console.error(e) }
                onTournament()
              }}>
                🍵 Triage all
              </Button>
            )}
            {onTriage && (
              <Button variant="secondary" onClick={onTriage}>
                <span className="text-red-500">✚</span> Triage
              </Button>
            )}
          </div>
        </div>

        {/* Capacity */}
        <CapacityBar capacity={capacity} compact />

        {/* Load bar */}
        {tasks.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs mb-1 px-0.5">
              <span className="text-ui-subtext">Load</span>
              <span className={`font-medium ${load.color}`}>{load.label}</span>
            </div>
            <div className="h-1 rounded-full bg-ui-border overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${load.bar}`} style={{ width: `${load.pct}%` }} />
            </div>
          </div>
        )}

        {/* Carried-over banner */}
        {carriedOver && (
          <Card className="mb-4 px-4 py-2.5">
            <p className="text-xs text-ui-subtext">Some items carried over from yesterday</p>
          </Card>
        )}

        {/* Overloaded prompt */}
        {load.level === 'overloaded' && !dismissOverload && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-between gap-3">
            <p className="text-sm text-red-400">You have more than a full day here. What moves?</p>
            <button onClick={() => setDismissOverload(true)} className="text-red-400/60 hover:text-red-400 text-xs flex-shrink-0">✕</button>
          </div>
        )}

        {/* Two-column layout */}
        {tasks.length === 0 ? (
          <Card className="mt-16 text-center px-8 py-12">
            <div className="text-4xl mb-4">✦</div>
            <p className="text-base font-medium text-ui-text mb-2">Nothing on your list</p>
            <p className="text-sm text-ui-subtext">Head to Inbox to schedule tasks, or Capture to add something new.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">

            {/* Left — appointments & routines */}
            <div>
              {timed.length > 0 && (
                <>
                  <p className="text-[10px] font-medium text-ui-subtext uppercase tracking-wider mb-2 px-0.5">Schedule</p>
                  <div className="space-y-3">
                    {timed.map(task => (
                      <TaskCard key={task.id} task={task} variant="today"
                        onComplete={handleComplete} onSnooze={handleSnooze}
                        onDefer={handleDefer} onDelete={handleDelete}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Right — tasks */}
            <div>
              <div className="flex items-center justify-between mb-2 px-0.5">
                <p className="text-[10px] font-medium text-ui-subtext uppercase tracking-wider">Tasks</p>
                {regular.length > 1 && (
                  <div className="flex gap-1">
                    {[['manual', '↕'], ['priority', '!'], ['desire', '♥']].map(([val, lbl]) => (
                      <button
                        key={val}
                        onClick={() => setSortBy(val)}
                        title={val === 'manual' ? 'My order' : val === 'priority' ? 'Urgent first' : 'Want to do'}
                        className={`w-6 h-6 rounded text-xs font-medium border transition-all ${
                          sortBy === val
                            ? 'bg-ui-primary text-ui-primary-text border-transparent'
                            : 'border-ui-border text-ui-subtext hover:text-ui-accent'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {regular.length === 0 ? (
                <p className="text-xs text-ui-subtext px-0.5">No tasks today</p>
              ) : sortBy === 'manual' ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={visible.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3">
                      {visible.map(task => (
                        <SortableTaskRow key={task.id} task={task}
                          onComplete={handleComplete} onSnooze={handleSnooze}
                          onDefer={handleDefer} onDelete={handleDelete}
                        />
                      ))}
                      {queued.length > 0 && (
                        <Card variant="ghost" className="px-4 py-3 text-center text-sm text-ui-subtext">
                          {queued.length} more waiting
                        </Card>
                      )}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="space-y-3">
                  {visible.map(task => (
                    <TaskCard key={task.id} task={task} variant="today"
                      onComplete={handleComplete} onSnooze={handleSnooze}
                      onDefer={handleDefer} onDelete={handleDelete}
                    />
                  ))}
                  {queued.length > 0 && (
                    <Card variant="ghost" className="px-4 py-3 text-center text-sm text-ui-subtext">
                      {queued.length} more waiting
                    </Card>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Done today */}
        {doneTasks.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setShowDone(!showDone)}
              className="flex items-center gap-2 text-sm text-ui-subtext hover:opacity-70 transition-opacity mb-3"
            >
              <span>{showDone ? '▾' : '▸'}</span>
              <span>Done today ({doneTasks.length})</span>
            </button>
            {showDone && (
              <div className="space-y-2">
                {doneTasks.map((t) => {
                  const expanded = expandedDoneId === t.id
                  return (
                    <div key={t.id} className="flex items-center gap-2">
                      <Card
                        className={`flex-1 px-4 py-3 cursor-pointer transition-opacity ${expanded ? 'opacity-100' : 'opacity-50'}`}
                        onClick={() => setExpandedDoneId(expanded ? null : t.id)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-ui-accent">✓</span>
                          <span className={`text-sm ${expanded ? 'text-ui-text' : 'line-through text-ui-subtext'}`}>{t.title}</span>
                        </div>
                      </Card>
                      {expanded && (
                        <Button
                          variant="secondary"
                          className="shrink-0"
                          onClick={async () => {
                            await deferTask(t.id)
                            setDone(prev => prev.filter(x => x.id !== t.id))
                            setExpandedDoneId(null)
                          }}
                        >
                          Redo
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
