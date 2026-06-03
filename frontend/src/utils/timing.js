// Shared helpers for time-of-day visibility rules.
//
// Appointments + routines both have due_time; we only want them on-screen
// near their actual time. The windows differ:
//   - appointment: 5 min before start  →  30 min after start
//   - routine:     5 min before start  →  60 min after start (routines slip)
// Anything without a due_time or that's not timed is always visible.

export function minutesUntil(dueTime) {
  const [h, m] = dueTime.split(':').map(Number)
  const now = new Date()
  const due = new Date(now)
  due.setHours(h, m, 0, 0)
  return (due - now) / 60000
}

export function isTimedVisible(task) {
  if (!task?.due_time) return true
  if (task.task_type === 'appointment') {
    const m = minutesUntil(task.due_time)
    return m <= 5 && m >= -30
  }
  // Routines are always visible — gentle pressure to complete them daily.
  if (task.task_type === 'routine') return true
  return true
}
