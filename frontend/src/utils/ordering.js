// The single ordering rule for today's tasks. Both the tea-box (which bag sits
// where) and the Focus card (which task is picked) sort with this, so the
// focused task is always the first selectable bag in the box. They used to sort
// differently — the box by due_time, Focus by sort_order — which left an early
// routine sitting at the front of the box while a later one held the card.
//
// Automatic order, top to bottom:
//   1. imminent routines (due_time ≤ 5 min away) — an 8:00 routine at 7:58
//      trumps everything, clock pressure she can't drag past
//   2. routines in the "first" bucket
//   3. up to 2 easy tasks
//   4. routines in the "morning" bucket
//   5. up to 2 hard tasks
//   6. routines in the "midday" bucket
//   7. up to 2 hard tasks
//   8. routines in the "afternoon" bucket
//   9. whatever's left (remaining easy + hard tasks, creation order)
// Same-bucket / same-difficulty-slice ordering falls back to sort_order —
// the app's existing creation-order-or-manual-drag convention, not a new one.
//
// Manual mode (she's dragged a bag in the tea-box) ignores all of this and
// sorts purely by sort_order — see compareTasksManual.
import { minutesUntil } from './timing'

const BUCKET_ORDER = ['first', 'morning', 'midday', 'afternoon']
const INTERLEAVE_CAP = 2

export function isImminent(task) {
  return task.task_type === 'routine' && !!task.due_time && minutesUntil(task.due_time) <= 5
}

function bySortOrder(items) {
  return [...items].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
}

export function buildAutomaticOrder(tasks) {
  const imminent = tasks.filter(isImminent)
  const rest = tasks.filter(t => !isImminent(t))

  const routines = bySortOrder(rest.filter(t => t.task_type === 'routine'))
  const byBucket = { first: [], morning: [], midday: [], afternoon: [] }
  for (const r of routines) {
    if (BUCKET_ORDER.includes(r.bucket)) byBucket[r.bucket].push(r)
    else byBucket.first.push(r)  // no/unrecognized bucket — surface it, don't hide it
  }

  const plainTasks = rest.filter(t => t.task_type !== 'routine')
  // Unclassified (difficulty null) reads as easy — least disruptive default
  // for tasks created before this shipped.
  const easy = bySortOrder(plainTasks.filter(t => t.difficulty !== 'hard'))
  const hard = bySortOrder(plainTasks.filter(t => t.difficulty === 'hard'))

  return [
    ...imminent,
    ...byBucket.first,
    ...easy.splice(0, INTERLEAVE_CAP),
    ...byBucket.morning,
    ...hard.splice(0, INTERLEAVE_CAP),
    ...byBucket.midday,
    ...hard.splice(0, INTERLEAVE_CAP),
    ...byBucket.afternoon,
    ...easy,
    ...hard,
  ]
}

export function compareTasksManual(a, b) {
  return (a.sort_order ?? 999) - (b.sort_order ?? 999)
}

export function orderTasks(tasks, manual = false) {
  return manual ? [...tasks].sort(compareTasksManual) : buildAutomaticOrder(tasks)
}
