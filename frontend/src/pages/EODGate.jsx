import { useState } from 'react'
import { upsertLog, getDailySummary } from '../api/selfcare'
import Button from '../components/Button'

const MOODS = [
  { value: 1, emoji: '😔', label: 'Rough' },
  { value: 2, emoji: '😕', label: 'Low' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '✨', label: 'Great' },
]

function warmSummary(summary, moodValue) {
  const { tasks_done_count = 0, routines_done_count = 0, medications_taken = 0 } = summary
  const total = tasks_done_count + routines_done_count
  const mood = MOODS.find((m) => m.value === moodValue)

  const lines = []

  if (total === 0 && medications_taken === 0) {
    lines.push("Today was hard, and that's real. You're still here, and that matters.")
    lines.push("Rest is part of the work. Tomorrow is a fresh start.")
  } else {
    if (routines_done_count > 0) {
      lines.push(
        routines_done_count === 1
          ? `You kept up with a routine today — that's the quiet kind of strength.`
          : `You kept up with ${routines_done_count} routine${routines_done_count > 1 ? 's' : ''} — that consistency adds up more than you know.`
      )
    }
    if (tasks_done_count > 0) {
      lines.push(
        tasks_done_count === 1
          ? `You got one thing done. Sometimes one is everything.`
          : `You crossed ${tasks_done_count} thing${tasks_done_count > 1 ? 's' : ''} off your list. That's real progress.`
      )
    }
    if (medications_taken > 0) {
      lines.push(`You took care of your medication. Taking care of yourself is an act of love.`)
    }
  }

  if (mood && mood.value <= 2) {
    lines.push("Even on the low days, you're doing something right by just showing up.")
  } else if (mood && mood.value >= 4) {
    lines.push("That energy you're carrying? Hold onto it.")
  }

  lines.push("You're doing better than you think. See you tomorrow. 💛")

  return lines
}

// ─── Summary screen ──────────────────────────────────────────────────────────

function SummaryScreen({ summary, moodValue, onContinue }) {
  const lines = warmSummary(summary, moodValue)
  const mood  = MOODS.find((m) => m.value === moodValue)
  const total = (summary.tasks_done_count || 0) + (summary.routines_done_count || 0)

  return (
    <div className="aria-page flex items-center justify-center">
      <div className="px-6 pb-32 md:pb-8 max-w-sm w-full text-center">

        <div className="text-5xl mb-3">{mood?.emoji || '✨'}</div>
        <h2 className="text-xl font-semibold text-ui-text mb-1">
          {mood?.value >= 4 ? 'You had a good day.' : mood?.value >= 3 ? 'You made it through.' : 'You showed up today.'}
        </h2>

        {/* Stats row */}
        {total > 0 && (
          <div className="flex items-center justify-center gap-4 mt-4 mb-6">
            {summary.tasks_done_count > 0 && (
              <div className="text-center">
                <div className="text-2xl font-bold text-ui-accent">{summary.tasks_done_count}</div>
                <div className="text-xs text-ui-subtext">task{summary.tasks_done_count !== 1 ? 's' : ''}</div>
              </div>
            )}
            {summary.routines_done_count > 0 && (
              <div className="text-center">
                <div className="text-2xl font-bold text-ui-accent">{summary.routines_done_count}</div>
                <div className="text-xs text-ui-subtext">routine{summary.routines_done_count !== 1 ? 's' : ''}</div>
              </div>
            )}
            {summary.medications_taken > 0 && (
              <div className="text-center">
                <div className="text-2xl font-bold text-ui-accent">{summary.medications_taken}</div>
                <div className="text-xs text-ui-subtext">med{summary.medications_taken !== 1 ? 's' : ''}</div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-3 mb-8 text-left">
          {lines.map((line, i) => (
            <p key={i} className="text-sm text-ui-subtext leading-relaxed">{line}</p>
          ))}
        </div>

        <Button size="lg" onClick={onContinue}>Start a new day</Button>
      </div>
    </div>
  )
}


// ─── EOD Gate ────────────────────────────────────────────────────────────────

export default function EODGate({ onComplete }) {
  const [mood,    setMood]    = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [summary, setSummary] = useState(null)

  async function handleSubmit() {
    if (!mood) return
    setSaving(true)
    try {
      await upsertLog({ mood })
      localStorage.setItem('aria_last_log_date', new Date().toISOString().split('T')[0])
      const s = await getDailySummary()
      setSummary(s)
    } catch (err) {
      console.error(err)
      onComplete()
    } finally {
      setSaving(false)
    }
  }

  if (summary) {
    return <SummaryScreen summary={summary} moodValue={mood} onContinue={onComplete} />
  }

  return (
    <div className="aria-page flex items-center justify-center">
      <div className="px-6 pb-32 md:pb-8 max-w-sm w-full text-center">

        <div className="text-4xl mb-3">🌙</div>
        <h2 className="text-xl font-semibold text-ui-text mb-1">End of day check-in</h2>
        <p className="text-sm text-ui-subtext mb-8">Just one question, the rest is optional.</p>

        {/* Mood — required */}
        <div className="mb-8">
          <p className="text-xs text-ui-subtext mb-3">How did today feel?</p>
          <div className="flex justify-center gap-3">
            {MOODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMood(m.value)}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
                  mood === m.value
                    ? 'bg-ui-primary/20 ring-1 ring-ui-accent/40 scale-110'
                    : 'hover:bg-ui-surface'
                }`}
              >
                <span className="text-2xl">{m.emoji}</span>
                <span className="text-[10px] text-ui-subtext">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        <Button size="lg" disabled={!mood || saving} onClick={handleSubmit}>
          {saving ? '…' : 'Done for today'}
        </Button>

        <button
          onClick={onComplete}
          className="mt-4 block mx-auto text-xs text-ui-subtext/60 hover:text-ui-subtext transition-colors"
        >
          Skip for now
        </button>

      </div>
    </div>
  )
}
