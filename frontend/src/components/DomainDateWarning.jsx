import { isDateAllowed, nextAllowedDate, weekdayName } from '../utils/domain'

export default function DomainDateWarning({ date, rules, className = '' }) {
  if (!date || !rules || rules.length === 0) return null
  if (isDateAllowed(date, rules)) return null

  const picked = weekdayName(date)
  const snapped = nextAllowedDate(date, rules)
  const snappedName = weekdayName(snapped)

  return (
    <p className={`text-[10px] text-amber-500 ${className}`}>
      {picked} not allowed for this project — will move to {snappedName} ({snapped})
    </p>
  )
}
