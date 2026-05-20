// Snooze date calculations.
// All dates returned as ISO strings (UTC) for the API.

// Domain-name → allowed weekday filter for snooze targets.
// Home tasks should land on weekends ("do it on my day off");
// Work tasks should never land on a weekend.
// Other domains (custom, or null) have no constraint.
// JS Date.getDay(): Sun=0 ... Sat=6.
function allowedDayForDomain(domainName, jsDay) {
  if (domainName === 'Home') return jsDay === 0 || jsDay === 6
  if (domainName === 'Work') return jsDay >= 1 && jsDay <= 5
  return true
}

function snapToDomainDay(date, domainName) {
  if (!date || !domainName) return date
  const d = new Date(date)
  for (let i = 0; i < 14; i++) {
    if (allowedDayForDomain(domainName, d.getDay())) return d
    d.setDate(d.getDate() + 1)
  }
  return date  // safety fallback; shouldn't happen
}

export const SNOOZE_OPTIONS = [
  { id: 'tonight', label: 'Tonight', sublabel: 'Back tomorrow morning' },
  { id: 'tomorrow', label: 'Tomorrow', sublabel: '' },
  { id: 'weekend', label: 'This Weekend', sublabel: '' },
  { id: 'next_week', label: 'Next Week', sublabel: '+7 days' },
  { id: 'in_two_weeks', label: 'In Two Weeks', sublabel: '' },
  { id: 'custom', label: 'Pick a Date…', sublabel: '' },
]

// Returns a Date object for the snooze target. `domainName` (optional)
// constrains the result to days the task's domain allows: Home → weekends,
// Work → weekdays. Used by SnoozeSheet to keep snooze targets sensible
// without forcing the user to think about which day to pick.
export function resolveSnoozeDate(optionId, customDate = null, domainName = null) {
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

  return snapToDomainDay(target, domainName)
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
