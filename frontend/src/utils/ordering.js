// The single ordering rule for today's tasks. Both the tea-box (which bag sits
// where) and the Focus card (which task is picked) sort with this, so the
// focused task is always the first selectable bag in the box. They used to sort
// differently — the box by due_time, Focus by sort_order — which left an early
// routine sitting at the front of the box while a later one held the card.
//
// Tiers, top wins:
//   1. imminent timed items (≤ 5 min away) — a 9:00 appointment at 8:58 trumps all
//   2. due/overdue routines — gentle pressure to clear the day's foundation
//   3. earlier clock time — so the box reads morning → evening; untimed sorts last
//   4. sort_order — the user's manual priority from Today
import { minutesUntil } from './timing'

export function isImminent(task) {
  if (!task.due_time) return false
  if (task.task_type !== 'appointment' && task.task_type !== 'routine') return false
  return minutesUntil(task.due_time) <= 5
}

export function isRoutineDue(task) {
  return task.task_type === 'routine' && (!task.due_time || minutesUntil(task.due_time) <= 5)
}

export function compareTasks(a, b) {
  const aImm = isImminent(a)
  const bImm = isImminent(b)
  if (aImm !== bImm) return aImm ? -1 : 1

  const aRtn = isRoutineDue(a)
  const bRtn = isRoutineDue(b)
  if (aRtn !== bRtn) return aRtn ? -1 : 1

  const at = a.due_time || '99:99'
  const bt = b.due_time || '99:99'
  if (at !== bt) return at.localeCompare(bt)

  return (a.sort_order ?? 999) - (b.sort_order ?? 999)
}

export function orderTasks(tasks) {
  return [...tasks].sort(compareTasks)
}
