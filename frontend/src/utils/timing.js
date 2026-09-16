// Shared time-of-day math for routine due_time handling (see utils/ordering.js).

export function minutesUntil(dueTime) {
  const [h, m] = dueTime.split(':').map(Number)
  const now = new Date()
  const due = new Date(now)
  due.setHours(h, m, 0, 0)
  return (due - now) / 60000
}
