// Snooze date calculations.
// All dates returned as ISO strings (UTC) for the API.

export const SNOOZE_OPTIONS = [
  { id: 'tonight', label: 'Tonight', sublabel: 'Back tomorrow morning' },
  { id: 'tomorrow', label: 'Tomorrow', sublabel: '' },
  { id: 'weekend', label: 'This Weekend', sublabel: '' },
  { id: 'next_week', label: 'Next Week', sublabel: '+7 days' },
  { id: 'in_two_weeks', label: 'In Two Weeks', sublabel: '' },
  { id: 'custom', label: 'Pick a Date…', sublabel: '' },
]

// Returns a Date object for the snooze target.
export function resolveSnoozeDate(optionId, customDate = null) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  let target
  switch (optionId) {
    case 'tonight': {
      const d = new Date(today)
      d.setDate(d.getDate() + 1)
      d.setHours(6, 0, 0, 0)
      target = d
      break
    }
    case 'tomorrow': {
      const d = new Date(today)
      d.setDate(d.getDate() + 1)
      d.setHours(6, 0, 0, 0)
      target = d
      break
    }
    case 'weekend': {
      const d = new Date(today)
      const day = d.getDay()
      const rawDays = (5 - day + 7) % 7
      const daysUntil = rawDays === 0 ? 7 : rawDays
      d.setDate(d.getDate() + daysUntil)
      d.setHours(8, 0, 0, 0)
      target = d
      break
    }
    case 'next_week': {
      // +7 days — chronically snoozed tasks shouldn't all pile up on Mondays.
      const d = new Date(today)
      d.setDate(d.getDate() + 7)
      d.setHours(6, 0, 0, 0)
      target = d
      break
    }
    case 'in_two_weeks': {
      const d = new Date(today)
      d.setDate(d.getDate() + 14)
      d.setHours(6, 0, 0, 0)
      target = d
      break
    }
    case 'custom': {
      if (!customDate) return null
      const d = new Date(customDate)
      d.setHours(6, 0, 0, 0)
      target = d
      break
    }
    default:
      return null
  }

  return target
}

export function formatSnoozeLabel(isoDate) {
  if (!isoDate) return ''
  const d = new Date(isoDate)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const nextWeek = new Date(today)
  nextWeek.setDate(nextWeek.getDate() + 7)

  if (d < tomorrow) return 'Tonight'
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  if (d < nextWeek) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatDate(isoDate) {
  if (!isoDate) return ''
  return new Date(isoDate).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}
