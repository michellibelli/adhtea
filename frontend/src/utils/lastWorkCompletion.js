// Shared elapsed-time anchor for the post-completion minutes prompt's
// default, used by both Focus.jsx and Today.jsx. localStorage-backed (not a
// component ref) so the guess stays sane across navigation between the two —
// an in-memory ref would silently reset every time either page remounts.
const KEY = 'aria_last_work_completion_at'

export function elapsedMinutesSinceLastCompletion() {
  let anchor = null
  try {
    const v = Number(localStorage.getItem(KEY))
    if (Number.isFinite(v) && v > 0) anchor = v
  } catch { /* ignore */ }
  if (anchor == null) {
    // First completion of the day — anchor off "Start my day" instead
    // (stamped in Today.jsx's handleStartDay).
    try {
      const dayKey = `aria_day_started_at_${new Date().toLocaleDateString('en-CA')}`
      const v = Number(localStorage.getItem(dayKey))
      if (Number.isFinite(v) && v > 0) anchor = v
    } catch { /* ignore */ }
  }
  if (anchor == null) return null
  const mins = Math.round((Date.now() - anchor) / 60000)
  return mins >= 0 ? mins : null
}

export function markWorkCompletionNow() {
  try { localStorage.setItem(KEY, String(Date.now())) } catch { /* ignore */ }
}
