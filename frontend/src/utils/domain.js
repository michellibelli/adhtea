// Frontend mirror of backend/routes/domain_utils.py.
// Used to warn the user when a date picker selects a day the project's
// domain disallows. The backend will silently snap to the next allowed day;
// we surface that here so the user understands why their date changed.

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// JS Date.getDay(): Sun=0 ... Sat=6
// Backend Python date.weekday(): Mon=0 ... Sun=6
function jsToPyWeekday(jsDay) {
  return (jsDay + 6) % 7
}

function parseLocalDate(isoStr) {
  if (!isoStr) return null
  const [y, m, d] = isoStr.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function isDateAllowed(isoStr, rules) {
  if (!rules || rules.length === 0) return true
  const dt = parseLocalDate(isoStr)
  if (!dt) return true
  const pyWd = jsToPyWeekday(dt.getDay())
  return rules.some(rule => rule.days == null || rule.days.includes(pyWd))
}

function nextAllowedDate(isoStr, rules) {
  if (!rules || rules.length === 0) return isoStr
  const dt = parseLocalDate(isoStr)
  if (!dt) return isoStr
  for (let i = 0; i < 365; i++) {
    const candidate = new Date(dt.getTime() + i * 86400000)
    const pyWd = jsToPyWeekday(candidate.getDay())
    if (rules.some(r => r.days == null || r.days.includes(pyWd))) {
      const yyyy = candidate.getFullYear()
      const mm = String(candidate.getMonth() + 1).padStart(2, '0')
      const dd = String(candidate.getDate()).padStart(2, '0')
      return `${yyyy}-${mm}-${dd}`
    }
  }
  return isoStr
}

function weekdayName(isoStr) {
  const dt = parseLocalDate(isoStr)
  return dt ? DAY_NAMES[dt.getDay()] : ''
}

export { isDateAllowed, nextAllowedDate, weekdayName }
