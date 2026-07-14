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
import { minutesUntil, isTimedVisible } from './timing'

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

// An appointment that is starting now (or is underway) — the same window that
// governs whether it's on-screen at all, see isTimedVisible. Note this is
// narrower than isImminent, which counts anything past its due_time: an 08:00
// routine is "imminent" at 2pm, which is fine for tiebreaking the computed order
// but must NOT outrank her hand-ordering, or a stale morning routine would pin
// itself to the front of the box all day and she could never drag past it.
export function isAppointmentNow(task) {
  return task.task_type === 'appointment' && !!task.due_time && isTimedVisible(task)
}

// Once she drags a bag in the tea-box, her hand-ordering outranks the clock for
// the rest of the app-day (backend User.box_ordered_on). Tiers 2 and 3 above
// stop applying — bags stay exactly where she dropped them. The single exception
// is an appointment that's happening right now: the one thing the box must never
// do is let her walk past a 9:00 appointment at 8:58 because she dragged
// something else to the front.
export function compareTasksManual(a, b) {
  const aNow = isAppointmentNow(a)
  const bNow = isAppointmentNow(b)
  if (aNow !== bNow) return aNow ? -1 : 1

  return (a.sort_order ?? 999) - (b.sort_order ?? 999)
}

export function orderTasks(tasks, manual = false) {
  return [...tasks].sort(manual ? compareTasksManual : compareTasks)
}
