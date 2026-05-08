import { useState, useEffect, useCallback } from 'react'
import { getInbox, scheduleToday, snoozeTask, deleteTask } from '../api/tasks'
import TaskCard from '../components/TaskCard'
import Card from '../components/Card'

export default function Inbox({ onCountChange }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchTasks = useCallback(async () => {
    try {
      const list = await getInbox()
      setTasks(list)
      onCountChange?.(list.length)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [onCountChange])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  async function handleScheduleToday(id) { await scheduleToday(id); fetchTasks() }
  async function handleSnooze(id, until) { await snoozeTask(id, until); fetchTasks() }
  async function handleDelete(id) { await deleteTask(id); fetchTasks() }

  if (loading) return <div className="aria-page flex items-center justify-center"><p className="text-sm text-ui-subtext">Loading…</p></div>

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-ui-text">Inbox</h1>
          {tasks.length > 0 && <span className="text-sm text-ui-subtext">{tasks.length} item{tasks.length !== 1 ? 's' : ''}</span>}
        </div>

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
                  onScheduleToday={handleScheduleToday}
                  onSnooze={handleSnooze}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
