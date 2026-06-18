import { useState, useEffect } from 'react'
import { getWeekly } from '../api/insights'
import Card from './Card'

function weekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const year = d.getFullYear()
  const jan1 = new Date(year, 0, 1)
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7)
  return `${year}-W${week}`
}

export default function WeeklyInsightCard() {
  const [insight, setInsight] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    getWeekly()
      .then((data) => {
        if (cancelled || !data || !data.insight_copy) return
        const key = `aria_weekly_insight_dismissed_${weekKey(data.week_start)}`
        if (localStorage.getItem(key)) return
        setInsight(data)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!insight || dismissed) return null

  function dismiss() {
    const key = `aria_weekly_insight_dismissed_${weekKey(insight.week_start)}`
    localStorage.setItem(key, '1')
    setDismissed(true)
  }

  return (
    <Card className="px-4 py-3 mb-3 relative">
      <button
        className="absolute top-1 right-2 text-ui-subtext text-xs opacity-60 hover:opacity-100"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        ✕
      </button>
      <p className="text-sm text-ui-text leading-relaxed pr-4">
        {insight.insight_copy}
      </p>
    </Card>
  )
}
