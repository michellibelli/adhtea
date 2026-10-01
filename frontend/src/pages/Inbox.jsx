import { useState, useEffect, useCallback, useRef } from 'react'
import { getInbox, scheduleToday, snoozeTask, deleteTask, completeTask, updateTask } from '../api/tasks'
import TaskCard from '../components/TaskCard'
import Card from '../components/Card'
import MinutesPrompt from '../components/MinutesPrompt'
import { PageLoading, PageError } from '../components/PageState'

export default function Inbox({ onCountChange }) {
  const [tasks,   setTasks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [notice,  setNotice]  = useState(null)
  const [pendingMinutes, setPendingMinutes] = useState(null)  // { id, title }

  // Store onCountChange in a ref so fetchTasks doesn't need it as a dependency.
  // Without this, every time the parent re-renders (creating a new function reference),
  // fetchTasks would recreate and the useEffect would fire, causing unnecessary re-fetches.
  const onCountChangeRef = useRef(onCountChange)
  useEffect(() => { onCountChangeRef.current = onCountChange }, [onCountChange])

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await getInbox()
      setTasks(list)
      onCountChangeRef.current?.(list.length)
    } catch (err) { console.error(err); setError(true) }
    finally { setLoading(false) }
  }, [])  // stable — doesn't recreate when parent re-renders with a new callback ref

  // Mount-only fetch; fetchTasks is stable (useCallback []).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchTasks() }, [fetchTasks])

  async function handleScheduleToday(id) {
    try {
      await scheduleToday(id)
      fetchTasks()
    } catch (err) {
      // e.g. 409 when Today is at the 15-item cap.
      setNotice(err?.message || 'Could not schedule for today.')
      setTimeout(() => setNotice(null), 4500)
    }
  }
  // Completing straight from Inbox is backlog catch-up, same as Today's
  // Up Next gate — retroactive, excluded from the EOD work-log (see
  // Task.completed_retroactively). Plain tasks default to work at creation
  // (missing/null reads the same as true), so this goes straight to the
  // minutes ask — no work/not-work popup needed. No elapsed-time guess and
  // no anchor update, since this isn't a real-time work session.
  async function handleComplete(id) {
    const task = tasks.find(t => t.id === id)
    setTasks(prev => prev.filter(t => t.id !== id))
    completeTask(id)
    updateTask(id, { completed_retroactively: true }).catch(() => {})
    if (task?.task_type === 'task' && task.is_work !== false) {
      setPendingMinutes({ id, title: task.title })
    }
  }

  function handleMinutesSave(minutes) {
    const target = pendingMinutes
    setPendingMinutes(null)
    if (!target) return
    updateTask(target.id, { minutes_spent: minutes }).catch(() => {})
  }

  function handleMinutesSkip() { setPendingMinutes(null) }
  async function handleSnooze(id, until) { await snoozeTask(id, until); fetchTasks() }
  async function handleDelete(id) { await deleteTask(id); fetchTasks() }

  if (loading) return <PageLoading />
  if (error)   return <PageError onRetry={fetchTasks} />

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-8 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-ui-text">Inbox</h1>
          {tasks.length > 0 && <span className="text-sm text-ui-subtext">{tasks.length} item{tasks.length !== 1 ? 's' : ''}</span>}
        </div>

        {notice && (
          <div
            onClick={() => setNotice(null)}
            className="mb-4 px-3 py-2 rounded-xl text-sm cursor-pointer"
            style={{
              background: 'rgba(181,137,0,0.12)',
              border: '1px solid rgba(181,137,0,0.35)',
              color: '#7A5C00',
            }}
          >
            {notice}
          </div>
        )}

        {tasks.length === 0 ? (
          <Card className="mt-16 text-center px-8 py-12">
            <div className="text-4xl mb-4">◈</div>
            <p className="text-base font-medium text-ui-text mb-2">Inbox is empty</p>
            <p className="text-sm text-ui-subtext">Use Capture to add tasks. They'll land here for triage.</p>
          </Card>
        ) : (
          <>
            <p className="text-sm text-ui-subtext mb-4">Tap a task to schedule it for today, snooze it, or delete it.</p>
            <div className="space-y-3">
              {tasks.map((task) => (
                <TaskCard key={task.id} task={task} variant="inbox"
                  onComplete={handleComplete}
                  onScheduleToday={handleScheduleToday}
                  onSnooze={handleSnooze}
                  onDelete={handleDelete}
                  onUpdate={(u) => setTasks(prev => prev.map(t => t.id === u.id ? { ...t, ...u } : t))}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {pendingMinutes && (
        <MinutesPrompt
          title={pendingMinutes.title}
          defaultMinutes={null}
          onSave={handleMinutesSave}
          onSkip={handleMinutesSkip}
        />
      )}
    </div>
  )
}
