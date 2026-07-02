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
import { getToday, getInbox, getDoneToday, completeTask, snoozeTask, deferTask, deleteTask, scheduleToday, reorderTasks } from '../api/tasks'
import { getTodayCapacity } from '../api/selfcare'
import TaskCard from '../components/TaskCard'
import CapacityBar from '../components/CapacityBar'
import Card from '../components/Card'
import Button from '../components/Button'
import { PageLoading, PageError } from '../components/PageState'
import { isTimedVisible } from '../utils/timing'

const FALLBACK_MAX_TODAY = 10
const MAX_TOTAL = 20

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

function SortableTaskRow({ task, onComplete, onSnooze, onDefer, onDelete, completing }) {
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
      className={`cursor-grab active:cursor-grabbing ${completing ? 'animate-task-complete' : ''}`}
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

export default function Today({ carriedOver = false, onNavigate }) {
  const [todayTasks, setTodayTasks] = useState([])
  const [inboxTasks, setInboxTasks] = useState([])
  const [doneTasks, setDone]        = useState([])
  const [capacity, setCapacity]     = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error,   setError]         = useState(null)
  const [completingId, setCompletingId] = useState(null)
  const [showDone, setShowDone]     = useState(false)
  const [expandedDoneId, setExpandedDoneId] = useState(null)
  const [sortBy, setSortBy]         = useState('manual')

  const sensors = useSensors(
    useSensor(SmartPointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [todayList, inboxList, doneList, cap] = await Promise.all([
        getToday(), getInbox(), getDoneToday(), getTodayCapacity(),
      ])
      setTodayTasks(todayList)
      setInboxTasks(inboxList)
      setDone(doneList)
      setCapacity(cap)
    } catch (err) { console.error(err); setError(true) }
    finally { setLoading(false) }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAll() }, [fetchAll])

  const maxToday = capacity?.max_slots ?? FALLBACK_MAX_TODAY

  const timed = todayTasks
    .filter(t => t.task_type === 'appointment' || t.task_type === 'routine')
    .filter(isTimedVisible)
    .sort((a, b) => {
      const at = a.due_time || '99:99'
      const bt = b.due_time || '99:99'
      if (at !== bt) return at.localeCompare(bt)
      return (a.due_date || '').localeCompare(b.due_date || '')
    })

  const regular = sortTasks(
    todayTasks.filter(t => t.task_type !== 'appointment' && t.task_type !== 'routine'),
    sortBy
  )
  const overCapacity = regular.length > maxToday

  const upNextSlots = Math.max(0, MAX_TOTAL - regular.length - timed.length)
  const upNext = inboxTasks
    .filter(t => t.task_type === 'task')
    .slice(0, upNextSlots)

  async function handleComplete(id) {
    setCompletingId(id)
    completeTask(id)
    setTimeout(() => {
      setTodayTasks(prev => prev.filter(t => t.id !== id))
      setCompletingId(null)
      getDoneToday().then(setDone).catch(() => {})
      getTodayCapacity().then(setCapacity).catch(() => {})
    }, 350)
  }

  async function handleSnooze(id, until) {
    setTodayTasks(prev => prev.filter(t => t.id !== id))
    try { await snoozeTask(id, until) }
    catch (err) { console.error(err); fetchAll() }
  }

  async function handleCompleteUpNext(id) {
    setInboxTasks(prev => prev.filter(t => t.id !== id))
    completeTask(id)
    getDoneToday().then(setDone).catch(() => {})
  }

  async function handleSnoozeUpNext(id, until) {
    setInboxTasks(prev => prev.filter(t => t.id !== id))
    try {
      await snoozeTask(id, until)
      const fresh = await getInbox()
      setInboxTasks(fresh)
    } catch (err) { console.error(err); fetchAll() }
  }

  async function handleDefer(id) {
    setTodayTasks(prev => prev.filter(t => t.id !== id))
    try { await deferTask(id) }
    catch (err) { console.error(err); fetchAll() }
  }

  async function handleDelete(id) {
    setTodayTasks(prev => prev.filter(t => t.id !== id))
    try { await deleteTask(id) }
    catch (err) { console.error(err); fetchAll() }
  }

  async function handlePromote(task) {
    setInboxTasks(prev => prev.filter(t => t.id !== task.id))
    setTodayTasks(prev => [...prev, task])
    try { await scheduleToday(task.id) }
    catch (err) { console.error(err); fetchAll() }
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = regular.findIndex(t => t.id === active.id)
    const newIndex = regular.findIndex(t => t.id === over.id)
    const reordered = arrayMove(regular, oldIndex, newIndex).map((t, i) => ({ ...t, sort_order: i }))
    setTodayTasks([...timed, ...reordered])
    await reorderTasks(reordered.map(t => t.id))
  }

  if (loading) return <PageLoading />
  if (error)   return <PageError onRetry={fetchAll} />

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-8 max-w-2xl mx-auto w-full">

        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold text-ui-text">Today</h1>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <span className="text-sm text-ui-subtext mr-1">{regular.length + timed.length} today</span>
            {onNavigate && (
              <>
                <Button variant="secondary" className="!px-2 !py-1.5" onClick={() => onNavigate('capture')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 inline mr-1"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>
                  Capture
                </Button>
                <Button variant="secondary" className="!px-2 !py-1.5" onClick={() => onNavigate('projects')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 inline mr-1"><path d="M12 22v-9"/><path d="M12 13C12 13 7 10 7 5c0 0 3.5 0 5 3.5C13.5 5 17 5 17 5c0 5-5 8-5 8z"/></svg>
                  Projects
                </Button>
                <Button variant="secondary" className="!px-2 !py-1.5" onClick={() => onNavigate('routines')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 inline mr-1"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  Routines
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Capacity */}
        <CapacityBar capacity={capacity} compact />

        {/* Carried-over banner */}
        {carriedOver && (
          <Card className="mb-4 px-4 py-2.5">
            <p className="text-xs text-ui-subtext">Some items carried over from yesterday</p>
          </Card>
        )}

        {todayTasks.length === 0 && inboxTasks.length === 0 ? (
          <Card className="mt-16 text-center px-8 py-12">
            <div className="text-4xl mb-4">✦</div>
            <p className="text-base font-medium text-ui-text mb-2">Nothing on your list</p>
            <p className="text-sm text-ui-subtext">Head to Inbox to schedule tasks, or Capture to add something new.</p>
          </Card>
        ) : (
          <div className="space-y-6">

            {/* Schedule — appointments + routines */}
            {timed.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-ui-subtext uppercase tracking-wider mb-2 px-0.5">Schedule</p>
                <div className="space-y-3">
                  {timed.map(task => (
                    <TaskCard key={task.id} task={task} variant="today"
                      onComplete={handleComplete} onSnooze={handleSnooze}
                      onDefer={handleDefer} onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Today section ── */}
            <div>
              <div className="flex items-center justify-between mb-2 px-0.5">
                <p className={`text-[10px] font-medium uppercase tracking-wider ${overCapacity ? 'text-amber-600' : 'text-ui-subtext'}`}>
                  Today ({regular.length}/{maxToday})
                </p>
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

              {overCapacity && (
                <p className="text-[11px] text-amber-600 px-0.5 mb-2">
                  Over capacity — consider deferring {regular.length - maxToday} task{regular.length - maxToday > 1 ? 's' : ''} to stay on track.
                </p>
              )}

              {regular.length === 0 ? (
                <p className="text-xs text-ui-subtext px-0.5">No tasks today — promote from below or add from Capture.</p>
              ) : sortBy === 'manual' ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={regular.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3">
                      {regular.map(task => (
                        <SortableTaskRow key={task.id} task={task}
                          onComplete={handleComplete} onSnooze={handleSnooze}
                          onDefer={handleDefer} onDelete={handleDelete}
                          completing={completingId === task.id}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="space-y-3">
                  {regular.map(task => (
                    <div key={task.id} className={completingId === task.id ? 'animate-task-complete' : ''}>
                      <TaskCard task={task} variant="today"
                        onComplete={handleComplete} onSnooze={handleSnooze}
                        onDefer={handleDefer} onDelete={handleDelete}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Divider ── */}
            {upNext.length > 0 && (
              <>
                <div className="flex items-center gap-3 px-0.5">
                  <div className="flex-1 h-px bg-ui-border" />
                  <span className="text-[10px] font-medium text-ui-subtext uppercase tracking-wider">Up Next</span>
                  <div className="flex-1 h-px bg-ui-border" />
                </div>

                {/* ── Up Next section ── */}
                <div className="space-y-3">
                  {upNext.map(task => (
                    <div key={task.id} className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <TaskCard task={task} variant="today"
                          onComplete={handleCompleteUpNext}
                          onSnooze={(id, until) => handleSnoozeUpNext(id, until)}
                          onDefer={(id) => {
                            setInboxTasks(prev => prev.filter(t => t.id !== id))
                            deferTask(id).catch(() => fetchAll())
                          }}
                          onDelete={(id) => {
                            setInboxTasks(prev => prev.filter(t => t.id !== id))
                            deleteTask(id).catch(() => fetchAll())
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePromote(task)}
                        title="Add to today"
                        className="flex-shrink-0 mt-3 w-7 h-7 rounded-full border border-ui-border flex items-center justify-center text-sm text-ui-subtext hover:border-ui-accent hover:text-ui-accent transition-colors"
                      >
                        +
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
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
