import { useState, useEffect, useCallback } from 'react'
import { getBacklog, completeTask, unsnoozeTask, deleteTask } from '../api/tasks'
import Card from '../components/Card'
import { PageLoading, PageError } from '../components/PageState'

const TYPE_ICONS = { task: '✦', appointment: '◷', routine: '↻', note: '◈' }

const STATUS_BADGE = {
  today:   { label: 'Today',   color: 'bg-ui-accent/20 text-ui-accent' },
  snoozed: { label: 'Snoozed', color: 'bg-amber-500/20 text-amber-400' },
  inbox:   { label: 'Inbox',   color: 'bg-ui-border text-ui-subtext' },
}

// ── Bucket logic ─────────────────────────────────────────────────────────────

function getRelevantDate(task) {
  if (task.snooze_until) return new Date(task.snooze_until)
  if (task.due_date)     return new Date(task.due_date + 'T00:00:00')
  if (task.status === 'today') return new Date()
  return null
}

function getBucket(task) {
  const date = getRelevantDate(task)
  if (!date) return { key: 'someday', label: 'Someday', order: 9999 }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  const days = Math.round((d - today) / 86400000)

  if (days <= 7)  return { key: 'week',    label: 'Next 7 days',       order: 0 }
  if (days <= 28) return { key: '3weeks',  label: 'Following 3 weeks', order: 1 }
  if (days <= 58) return { key: 'month',   label: 'Following month',   order: 2 }

  const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return { key: label, label, order: 3 + d.getFullYear() * 12 + d.getMonth() }
}

function groupTasks(tasks) {
  const map = {}
  for (const task of tasks) {
    const bucket = getBucket(task)
    if (!map[bucket.key]) map[bucket.key] = { ...bucket, tasks: [] }
    map[bucket.key].tasks.push(task)
  }
  return Object.values(map).sort((a, b) => a.order - b.order)
}

function formatDate(task) {
  const date = getRelevantDate(task)
  if (!date) return null
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Task row ─────────────────────────────────────────────────────────────────

function BacklogRow({ task, onComplete, onUnsnooze, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const badge = STATUS_BADGE[task.status] || STATUS_BADGE.inbox
  const date = formatDate(task)

  return (
    <div
      className="flex items-start gap-3 py-3 border-b border-ui-border last:border-0 cursor-pointer"
      onClick={() => setExpanded((v) => !v)}
    >
      <span className="text-xs mt-0.5 flex-shrink-0 text-ui-accent">{TYPE_ICONS[task.task_type] || '✦'}</span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ui-text leading-snug">{task.title}</p>
        {task.notes && !expanded && (
          <p className="text-xs text-ui-subtext mt-0.5 truncate">{task.notes}</p>
        )}
        {expanded && task.notes && (
          <p className="text-xs text-ui-subtext mt-1 leading-relaxed">{task.notes}</p>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badge.color}`}>
            {badge.label}
          </span>
          {date && <span className="text-[10px] text-ui-subtext">{date}</span>}
        </div>

        {expanded && (
          <div className="flex gap-3 mt-2">
            {task.status === 'today' && (
              <button
                onClick={(e) => { e.stopPropagation(); onComplete(task.id) }}
                className="text-xs text-emerald-400 hover:opacity-70 transition-opacity"
              >
                Done ✓
              </button>
            )}
            {task.status === 'snoozed' && (
              <button
                onClick={(e) => { e.stopPropagation(); onUnsnooze(task.id) }}
                className="text-xs text-ui-accent hover:opacity-70 transition-opacity"
              >
                Unsnooze ↩
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(task.id) }}
              className="text-xs text-red-400 hover:opacity-70 transition-opacity"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Waiting() {
  const [tasks,   setTasks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try { setTasks(await getBacklog()) }
    catch (err) { console.error(err); setError(true) }
    finally { setLoading(false) }
  }, [])

  // Mount-only fetch; fetchTasks is stable (useCallback []).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchTasks() }, [fetchTasks])

  async function handleComplete(id)  { await completeTask(id);  fetchTasks() }
  async function handleUnsnooze(id)  { await unsnoozeTask(id);  fetchTasks() }
  async function handleDelete(id)    { await deleteTask(id);    fetchTasks() }

  if (loading) return <PageLoading />
  if (error)   return <PageError onRetry={fetchTasks} />

  const groups = groupTasks(tasks)

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-2xl mx-auto w-full">

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-ui-text">Waiting Tasks</h1>
          {tasks.length > 0 && (
            <span className="text-sm text-ui-subtext">{tasks.length} total</span>
          )}
        </div>

        {tasks.length === 0 ? (
          <Card className="mt-16 text-center px-8 py-12">
            <div className="text-4xl mb-4">✦</div>
            <p className="text-base font-medium text-ui-text mb-2">All clear</p>
            <p className="text-sm text-ui-subtext">No active tasks. Capture something new.</p>
          </Card>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => (
              <div key={group.key}>
                <p className="text-xs font-semibold uppercase tracking-wider text-ui-subtext mb-2 px-1">
                  {group.label}
                  <span className="ml-2 font-normal normal-case tracking-normal text-ui-subtext/60">
                    {group.tasks.length}
                  </span>
                </p>
                <Card className="px-4 divide-y divide-ui-border">
                  {group.tasks.map((task) => (
                    <BacklogRow
                      key={task.id}
                      task={task}
                      onComplete={handleComplete}
                      onUnsnooze={handleUnsnooze}
                      onDelete={handleDelete}
                    />
                  ))}
                </Card>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
