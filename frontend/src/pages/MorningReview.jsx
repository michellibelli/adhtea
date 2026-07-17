import { useState } from 'react'
import { commitReview } from '../api/review'
import Card from '../components/Card'
import Button from '../components/Button'

// Morning review — first thing she sees on the day's first sign-in when there's
// an unreviewed activity-day. A sunny greeting, then yesterday's finished tasks
// pre-tagged small/big; she only flips the wrong ones, then one button carries
// her into the self-care gate. Effort tags feed the capacity-vs-output signal.
export default function MorningReview({ data, onComplete }) {
  const [efforts, setEfforts] = useState(() =>
    Object.fromEntries((data.tasks || []).map(t => [t.id, t.effort_guess]))
  )
  const [saving, setSaving] = useState(false)

  function setEffort(id, val) {
    setEfforts(prev => ({ ...prev, [id]: val }))
  }

  async function handleContinue() {
    setSaving(true)
    try {
      await commitReview({
        date: data.date,
        tasks: (data.tasks || []).map(t => ({ id: t.id, effort: efforts[t.id] })),
      })
    } catch {
      // Never block her morning on this — proceed even if the save failed.
    }
    onComplete()
  }

  const dateLabel = new Date(data.date + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <div className="aria-page">
      <div className="px-4 pt-10 pb-8 max-w-2xl mx-auto w-full">

        {/* Sunny good-morning */}
        <div className="mb-6">
          <p className="text-[11px] font-semibold text-ui-accent uppercase tracking-widest mb-2">
            Good morning ☀️
          </p>
          <p className="text-lg text-ui-text leading-relaxed">
            {data.greeting}
          </p>
        </div>

        {/* Yesterday review */}
        <div className="mb-2 flex items-baseline justify-between">
          <h1 className="text-xl font-semibold text-ui-text">Yesterday</h1>
          <span className="text-xs text-ui-subtext">{dateLabel}</span>
        </div>
        <p className="text-xs text-ui-subtext mb-4">
          A quick look back — tap to fix any that are off. Quick errand or a real effort?
        </p>

        <div className="space-y-2.5">
          {(data.tasks || []).map(t => (
            <Card key={t.id} className="px-4 py-3 flex items-center gap-3">
              <span className="flex-1 text-sm text-ui-text">{t.title}</span>
              <div className="flex gap-1.5 shrink-0">
                {['small', 'big'].map(opt => (
                  <button
                    key={opt}
                    onClick={() => setEffort(t.id, opt)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                      efforts[t.id] === opt
                        ? 'bg-ui-primary text-ui-primary-text border-transparent'
                        : 'border-ui-border text-ui-subtext hover:text-ui-accent'
                    }`}
                  >
                    {opt === 'small' ? 'Quick' : 'Big'}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>

        {/* Into the self-care gate */}
        <div className="mt-8 pb-48">
          <Button
            size="lg"
            className="w-full"
            onClick={handleContinue}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'How are you today? →'}
          </Button>
        </div>

      </div>
    </div>
  )
}
