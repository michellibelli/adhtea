import { useState } from 'react'
import { commitReview } from '../api/review'
import { removeComplete } from '../api/client'
import Card from '../components/Card'
import Button from '../components/Button'

// Effort toggle shared by reviewed + added rows.
function EffortToggle({ value, onChange }) {
  return (
    <div className="flex gap-1.5 shrink-0">
      {['small', 'big'].map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
            value === opt
              ? 'bg-ui-primary text-ui-primary-text border-transparent'
              : 'border-ui-border text-ui-subtext hover:text-ui-accent'
          }`}
        >
          {opt === 'small' ? 'Quick' : 'Big'}
        </button>
      ))}
    </div>
  )
}

// Morning review — first thing she sees on the day's first sign-in when there's
// an unreviewed activity-day. A sunny greeting, then yesterday's finished tasks
// pre-tagged small/big; she flips the wrong ones, adds anything she did that
// wasn't in the app, then one button carries her into the self-care gate.
export default function MorningReview({ data, onComplete }) {
  const [efforts, setEfforts] = useState(() =>
    Object.fromEntries((data.tasks || []).map(t => [t.id, t.effort_guess]))
  )
  const [notDone, setNotDone] = useState(() => new Set())   // ids she says weren't done
  const [added, setAdded] = useState([])   // {key, title, effort}
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  function setEffort(id, val) {
    setEfforts(prev => ({ ...prev, [id]: val }))
  }

  // A toggle, not a delete — a mis-tap has to be recoverable.
  function toggleNotDone(id) {
    setNotDone(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function addItem() {
    const title = draft.trim()
    if (!title) return
    setAdded(a => [...a, { key: Date.now() + Math.random(), title, effort: 'small' }])
    setDraft('')
  }

  function setAddedEffort(key, val) {
    setAdded(a => a.map(x => (x.key === key ? { ...x, effort: val } : x)))
  }

  function removeAdded(key) {
    setAdded(a => a.filter(x => x.key !== key))
  }

  async function handleContinue() {
    setSaving(true)
    // commitReview is durable — on a cold-backend failure it queues the commit
    // for background flush rather than throwing, so the morning is never blocked
    // and `reviewed_through` still lands once the backend wakes.
    // Drop each un-flagged id from the offline completion queue first. If one is
    // still queued, the next successful request flushes it and silently
    // re-completes the task she just said she didn't do.
    notDone.forEach(id => removeComplete(id))
    await commitReview({
      date: data.date,
      tasks: (data.tasks || []).map(t => (
        notDone.has(t.id)
          ? { id: t.id, done: false }
          : { id: t.id, effort: efforts[t.id], done: true }
      )),
      added: added.map(x => ({ title: x.title, effort: x.effort })),
    })
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
          Tap × if something on here wasn't actually done.
        </p>

        <div className="space-y-2.5">
          {(data.tasks || []).map(t => {
            const off = notDone.has(t.id)
            return (
              <Card
                key={t.id}
                className={`px-4 py-3 flex items-center gap-3 transition-opacity ${off ? 'opacity-50' : ''}`}
              >
                <button
                  onClick={() => toggleNotDone(t.id)}
                  className="text-ui-subtext hover:text-ui-accent text-lg leading-none shrink-0"
                  aria-label={off ? 'Put it back as done' : "Mark as not done"}
                >
                  {off ? '↺' : '×'}
                </button>
                <span className={`flex-1 text-sm ${off ? 'text-ui-subtext line-through' : 'text-ui-text'}`}>
                  {t.title}
                </span>
                {off
                  ? <span className="text-xs text-ui-subtext shrink-0 pr-1">Not done</span>
                  : <EffortToggle value={efforts[t.id]} onChange={v => setEffort(t.id, v)} />}
              </Card>
            )
          })}

          {/* Things she did that weren't in the app */}
          {added.map(x => (
            <Card key={x.key} className="px-4 py-3 flex items-center gap-3">
              <button
                onClick={() => removeAdded(x.key)}
                className="text-ui-subtext hover:text-ui-accent text-lg leading-none shrink-0"
                aria-label="Remove"
              >
                ×
              </button>
              <span className="flex-1 text-sm text-ui-text">{x.title}</span>
              <EffortToggle value={x.effort} onChange={v => setAddedEffort(x.key, v)} />
            </Card>
          ))}
        </div>

        {/* Add something you did */}
        <div className="mt-3 flex gap-2">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
            placeholder="Did something else? Add it…"
            className="flex-1 rounded-lg border border-ui-border bg-ui-input px-3 py-2 text-sm text-ui-text placeholder-ui-subtext/50 focus:outline-none focus:border-ui-accent transition-colors"
          />
          <Button size="sm" onClick={addItem} disabled={!draft.trim()}>Add</Button>
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
