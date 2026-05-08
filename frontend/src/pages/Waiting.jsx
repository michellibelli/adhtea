import { useState, useEffect, useCallback } from 'react'
import { getWaiting, unsnoozeTask, deleteTask } from '../api/tasks'
import TaskCard from '../components/TaskCard'
import Card from '../components/Card'

function groupByDate(tasks) {
  const groups = {}
  for (const task of tasks) {
    const key = task.snooze_until ? new Date(task.snooze_until).toDateString() : 'Unknown'
    if (!groups[key]) groups[key] = { label: key, tasks: [] }
    groups[key].tasks.push(task)
  }
  return Object.values(groups)
}

function formatGroupLabel(dateString) {
  const d = new Date(dateString)
  const today = new Date()
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate() + 7)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  if (d < nextWeek) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

export default function Waiting() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchTasks = useCallback(async () => {
    try { setTasks(await getWaiting()) }
    catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  async function handleUnsnooze(id) { await unsnoozeTask(id); fetchTasks() }
  async function handleDelete(id) { await deleteTask(id); fetchTasks() }

  if (loading) return <div className="aria-page flex items-center justify-center"><p className="text-sm text-ui-subtext">Loading…</p></div>

  const groups = groupByDate(tasks)

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-ui-text">Waiting</h1>
          {tasks.length > 0 && <span className="text-sm text-ui-subtext">{tasks.length} snoozed</span>}
        </div>

        {tasks.length === 0 ? (
          <Card className="mt-16 text-center px-8 py-12">
            <div className="text-4xl mb-4">◷</div>
            <p className="text-base font-medium text-ui-text mb-2">Nothing waiting</p>
            <p className="text-sm text-ui-subtext">When you snooze a task, it rests here. Nothing gets lost.</p>
          </Card>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="text-xs font-semibold uppercase tracking-wider text-ui-subtext mb-2 px-1">
                  {formatGroupLabel(group.label)}
                </p>
                <div className="space-y-3">
                  {group.tasks.map((task) => (
                    <TaskCard key={task.id} task={task} variant="waiting"
                      onUnsnooze={handleUnsnooze} onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
