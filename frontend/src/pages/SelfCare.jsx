import { useState, useEffect } from 'react'
import { getTodayLog, upsertLog, getTodayCapacity } from '../api/selfcare'
import { createTask } from '../api/tasks'
import CapacityBar from '../components/CapacityBar'
import Card from '../components/Card'
import Button from '../components/Button'
import { PageLoading, PageError } from '../components/PageState'


// ---------------------------------------------------------------------------
// Small shared primitives
// ---------------------------------------------------------------------------

function TapRow({ options, labels, value, onChange }) {
  return (
    <div className="flex gap-1.5">
      {options.map((opt, i) => (
        <button
          key={opt}
          onClick={() => onChange(value === opt ? null : opt)}
          className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${
            value === opt
              ? 'bg-ui-primary text-ui-primary-text border-transparent'
              : 'border-ui-border text-ui-subtext hover:text-ui-accent'
          }`}
        >
          {labels ? labels[i] : opt}
        </button>
      ))}
    </div>
  )
}


// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const EMPTY_FORM = {
  sleep_hours: null,
  sleep_quality: null,
  meals: null,
  exercise: null,
  exercise_minutes: null,
  medication_taken: null,
  mood: null,
}

function formFromLog(log) {
  if (!log) return EMPTY_FORM
  return {
    sleep_hours:       log.sleep_hours,
    sleep_quality:     log.sleep_quality,
    meals:             log.meals,
    exercise:          log.exercise,
    exercise_minutes:  log.exercise_minutes,
    medication_taken:  log.medication_taken,
    mood:              log.mood,
  }
}

export default function SelfCare({ medicationQuestionEnabled = true, gateMode = false, onComplete, preloadedLog, preloadedCapacity }) {
  // When the app shell already fetched the log (the morning gate), seed state
  // from it and skip the blocking spinner — the form paints instantly.
  // Otherwise fall back to a normal blocking load.
  const hasPreload = preloadedLog !== undefined
  const [log,        setLog]        = useState(preloadedLog ?? null)
  const [capacity,   setCapacity]   = useState(preloadedCapacity ?? null)
  const [loading,    setLoading]    = useState(!hasPreload)
  const [error,      setError]      = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [form,       setForm]       = useState(() => formFromLog(preloadedLog))

  const [checkinText,   setCheckinText]   = useState('')
  const [checkinSaving, setCheckinSaving] = useState(false)
  const [checkinDone,   setCheckinDone]   = useState(false)

  // `background` mode (used when preloaded) refreshes data without the blocking
  // spinner and without clobbering the form the user may already be editing.
  function fetchAll(background = false) {
    if (!background) setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const [todayLog, cap] = await Promise.all([getTodayLog(), getTodayCapacity()])
        setLog(todayLog)
        setCapacity(cap)
        if (todayLog && !background) setForm(formFromLog(todayLog))
      } catch (err) { console.error(err); if (!background) setError(true) }
      finally {
        if (!background) setLoading(false)
        window.dispatchEvent(new Event('aria:page-loaded'))
      }
    })()
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll(hasPreload) }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const saved = await upsertLog(form)
      setLog(saved)
      const cap = await getTodayCapacity()
      setCapacity(cap)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  async function handleCheckin() {
    if (!checkinText.trim()) return
    setCheckinSaving(true)
    try {
      await createTask({ title: '📓 Diary entry', task_type: 'note', notes: checkinText.trim() })
      setCheckinText('')
      setCheckinDone(true)
      setTimeout(() => setCheckinDone(false), 2500)
    } catch (_) { /* non-blocking */ }
    setCheckinSaving(false)
  }

  if (loading) return <PageLoading />
  if (error) return <PageError onRetry={fetchAll} />

  // In gate mode, the bottom nav is hidden and there's no way out except
  // saving the log. Renders a banner up top + a "Continue" CTA at the
  // bottom once `log` is populated (first save flips it on).
  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-8 max-w-2xl mx-auto w-full">

        {gateMode && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-ui-accent/10 border border-ui-accent/30">
            <p className="text-sm font-semibold text-ui-accent">Morning check-in</p>
            <p className="text-xs text-ui-subtext mt-0.5">
              Quick log first — your capacity for today drives how many tasks
              land on your plate.
            </p>
          </div>
        )}

        <h1 className="text-2xl font-semibold text-ui-text mb-6">Log</h1>

        {/* Diary note */}
        <div className="mb-6">
          <p className="text-xs text-ui-subtext uppercase tracking-wider mb-3">Diary</p>
          <Card className="px-4 py-4">
            <textarea
              value={checkinText}
              onChange={e => setCheckinText(e.target.value)}
              placeholder="thoughts, feelings, anything on your mind..."
              rows={4}
              className="w-full rounded-lg border border-ui-border bg-ui-input px-3 py-2 text-sm text-ui-text placeholder-ui-subtext/50 resize-none focus:outline-none focus:border-ui-accent transition-colors mb-3"
            />
            <div className="flex items-center justify-between">
              <span className={`text-xs transition-opacity duration-300 ${checkinDone ? 'opacity-100 text-ui-accent' : 'opacity-0'}`}>
                ✓ note saved
              </span>
              <Button size="sm" onClick={handleCheckin} disabled={checkinSaving || !checkinText.trim()}>
                {checkinSaving ? 'Saving…' : 'Save note'}
              </Button>
            </div>
          </Card>
        </div>

        {/* Capacity */}
        <div className="mb-6">
          <p className="text-xs text-ui-subtext uppercase tracking-wider mb-2">Today's capacity</p>
          <CapacityBar capacity={capacity} />
        </div>

        {/* Self-care log */}
        <div className="mb-6">
          <p className="text-xs text-ui-subtext uppercase tracking-wider mb-3">
            {log ? 'Update log' : 'Morning check-in'}
          </p>
          <Card className="px-4 py-4 space-y-4">

            {/* Sleep hours */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-ui-subtext">Sleep last night</span>
                <span className="text-xs font-medium text-ui-text">
                  {form.sleep_hours != null ? `${form.sleep_hours}h` : '—'}
                </span>
              </div>
              <input
                type="range" min={0} max={12} step={0.5}
                value={form.sleep_hours ?? 7}
                onChange={e => setForm(f => ({ ...f, sleep_hours: parseFloat(e.target.value) }))}
                className="w-full accent-ui-accent"
              />
              <div className="flex justify-between text-[10px] text-ui-subtext mt-0.5">
                <span>0h</span><span>6h</span><span>12h</span>
              </div>
            </div>

            {/* Sleep quality */}
            <div>
              <span className="text-xs text-ui-subtext block mb-1.5">Sleep quality last night</span>
              <TapRow
                options={[1,2,3,4,5]}
                labels={['1','2','3','4','5']}
                value={form.sleep_quality}
                onChange={v => setForm(f => ({ ...f, sleep_quality: v }))}
              />
            </div>

            {/* Meals */}
            <div>
              <span className="text-xs text-ui-subtext block mb-1.5">Meals yesterday</span>
              <TapRow
                options={[0,1,2,3,4]}
                labels={['0','1','2','3','4']}
                value={form.meals}
                onChange={v => setForm(f => ({ ...f, meals: v }))}
              />
            </div>

            {/* Exercise */}
            <div>
              <span className="text-xs text-ui-subtext block mb-1.5">Exercise yesterday</span>
              <div className="flex items-center gap-2 flex-wrap">
                {[{ v: true, l: 'Yes' }, { v: false, l: 'No' }].map(({ v, l }) => (
                  <button
                    key={l}
                    onClick={() => setForm(f => ({ ...f, exercise: v }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      form.exercise === v
                        ? 'bg-ui-primary text-ui-primary-text border-transparent'
                        : 'border-ui-border text-ui-subtext hover:text-ui-accent'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Medication — plain yes/no, nothing else stored. Off entirely
                when disabled in Settings. */}
            {medicationQuestionEnabled && (
              <div>
                <span className="text-xs text-ui-subtext block mb-1.5">Did you take your medicine?</span>
                <div className="flex items-center gap-2 flex-wrap">
                  {[{ v: true, l: 'Yes' }, { v: false, l: 'No' }].map(({ v, l }) => (
                    <button
                      key={l}
                      onClick={() => setForm(f => ({ ...f, medication_taken: v }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        form.medication_taken === v
                          ? 'bg-ui-primary text-ui-primary-text border-transparent'
                          : 'border-ui-border text-ui-subtext hover:text-ui-accent'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Mood */}
            <div>
              <span className="text-xs text-ui-subtext block mb-1.5">Mood</span>
              <TapRow
                options={[1,2,3,4,5]}
                labels={['😔','😐','🙂','😊','✨']}
                value={form.mood}
                onChange={v => setForm(f => ({ ...f, mood: v }))}
              />
            </div>

            {/* Save */}
            <div className="flex items-center gap-3 pt-1">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? 'Saving…' : log ? 'Update log' : 'Save log'}
              </Button>
              {saved && <span className="text-xs text-ui-accent font-medium">✓ Saved</span>}
            </div>

          </Card>
        </div>

        {/* Gate mode: prominent continue CTA, only enabled once the log
            exists (i.e. handleSave or pre-existing log loaded). */}
        {gateMode && (
          <div className="mt-8 pb-48">
            <Button
              size="lg"
              className="w-full"
              onClick={onComplete}
              disabled={!log}
            >
              {log ? 'Continue → Today' : 'Log first to continue'}
            </Button>
          </div>
        )}

      </div>
    </div>
  )
}
