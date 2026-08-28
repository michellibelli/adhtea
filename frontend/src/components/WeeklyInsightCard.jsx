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
    // Compact on phones — on Focus this card sits in a fixed-height column
    // between the teabag and the tea box, so every pixel it takes is a pixel
    // off the bag. Full size returns at md, where height isn't contested.
    //
    // Capped at 300px and centred because it was the only full-width element on
    // Focus: the teabag is 180 and the tea box row 220, so at the column's full
    // width this card alone reached the fixed leaf decorations at the screen
    // edges and painted over them. The vines occupy roughly the outer 45px each
    // side; 320 was still grazing them, 300 clears with room. The type drops to
    // 12px so the usual one-line copy still fits on one line at the narrower
    // width — wrapping to two would undo the height saving.
    <Card className="px-3 py-1.5 mb-2 relative w-full max-w-[300px] mx-auto md:max-w-none md:px-4 md:py-3 md:mb-3">
      <button
        className="absolute top-1 right-2 text-ui-subtext text-xs opacity-60 hover:opacity-100"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        ✕
      </button>
      <p className="text-[12px] leading-snug text-ui-text text-center px-2 md:text-sm md:leading-relaxed md:px-0 md:pr-4 md:text-left">
        {insight.insight_copy}
      </p>
    </Card>
  )
}
