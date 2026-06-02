import { useState, useEffect } from 'react'
import { getTodayLog, upsertLog, getTodayCapacity } from '../api/selfcare'
import { getMedication, createMedication, updateMedication, logMedicationTaken, getMedicationTodayLog } from '../api/medication'
import { getMedName, setMedName } from '../utils/medicationStore'
import { createTask } from '../api/tasks'
import CapacityBar from '../components/CapacityBar'
import Card from '../components/Card'
import Button from '../components/Button'
import { Input } from '../components/Input'


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
// One-time migration: pre-3.9.13 meds were stored with real names server-side.
// On first load after deploy, copy the real name into localStorage and rename
// the server row to "Medication N" so the server only ever holds placeholders.
// Idempotent — once renamed, the regex match skips the row.
// ---------------------------------------------------------------------------
const PLACEHOLDER_RE = /^Medication \d+$/

async function migrateLegacyMedNames(meds, userId) {
  if (!userId) return meds
  const sorted = [...meds].sort((a, b) => a.id - b.id)
  let counter = 1
  const out = []
  for (const m of sorted) {
    if (PLACEHOLDER_RE.test(m.name)) {
      out.push(m)
      const n = parseInt(m.name.slice('Medication '.length), 10)
      if (n >= counter) counter = n + 1
      continue
    }
    setMedName(userId, m.id, m.name)
    const placeholder = `Medication ${counter++}`
    try {
      const updated = await updateMedication(m.id, { name: placeholder })
      out.push(updated)
    } catch (err) {
      console.error('med pseudonym migration failed for', m.id, err)
      out.push(m)
    }
  }
  return out
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
  mood: null,
}

export default function SelfCare({ userId, gateMode = false, onComplete }) {
  const [log,        setLog]        = useState(null)
  const [capacity,   setCapacity]   = useState(null)
  const [medication, setMedication] = useState([])
  const [medLogs,    setMedLogs]    = useState({})   // schedule_id → log
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [form,       setForm]       = useState(EMPTY_FORM)

  const [showMedForm,   setShowMedForm]   = useState(false)
  const [medForm,       setMedForm]       = useState({ name: '', reminder_times: '' })
  const [checkinText,   setCheckinText]   = useState('')
  const [checkinSaving, setCheckinSaving] = useState(false)
  const [checkinDone,   setCheckinDone]   = useState(false)

  useEffect(() => {
    async function fetchAll() {
      try {
        const [todayLog, cap, rawMeds] = await Promise.all([getTodayLog(), getTodayCapacity(), getMedication()])
        const meds = await migrateLegacyMedNames(rawMeds, userId)
        setLog(todayLog)
        setCapacity(cap)
        setMedication(meds)
        if (todayLog) {
          setForm({
            sleep_hours:      todayLog.sleep_hours,
            sleep_quality:    todayLog.sleep_quality,
            meals:            todayLog.meals,
            exercise:         todayLog.exercise,
            exercise_minutes: todayLog.exercise_minutes,
            mood:             todayLog.mood,
          })
        }
        const ml = {}
        await Promise.all(
          meds.map(m => getMedicationTodayLog(m.id).then(l => { if (l) ml[m.id] = l }))
        )
        setMedLogs(ml)
      } catch (err) { console.error(err) }
      finally { setLoading(false) }
    }
    fetchAll()
    // Mount-only fetch; userId is stable for the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  async function handleLogMed(id) {
    try {
      const ml = await logMedicationTaken(id)
      setMedLogs(prev => ({ ...prev, [id]: ml }))
    } catch (err) { console.error(err) }
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

  async function handleAddMed() {
    if (!medForm.name.trim()) return
    try {
      const times = medForm.reminder_times.trim().replace(/\s+/g, '').replace(/,+/g, ',').replace(/,$/, '') || null
      // Server gets a placeholder — it never sees the actual medication name
      const placeholder = `Medication ${medication.length + 1}`
      const created = await createMedication({ name: placeholder, reminder_times: times })
      if (userId) setMedName(userId, created.id, medForm.name.trim())
      setMedication(prev => [...prev, created])
      setMedForm({ name: '', reminder_times: '' })
      setShowMedForm(false)
    } catch (err) { console.error(err) }
  }

  if (loading) {
    return <div className="aria-page flex items-center justify-center"><p className="text-sm text-ui-subtext">Loading…</p></div>
  }

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
              Quick log first — your capacity for today drives what Triage
              surfaces next.
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
                    onClick={() => setForm(f => ({
                      ...f,
                      exercise: v,
                      exercise_minutes: v ? (f.exercise_minutes ?? 30) : null,
                    }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      form.exercise === v
                        ? 'bg-ui-primary text-ui-primary-text border-transparent'
                        : 'border-ui-border text-ui-subtext hover:text-ui-accent'
                    }`}
                  >
                    {l}
                  </button>
                ))}
                {form.exercise && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number" min={5} max={180}
                      value={form.exercise_minutes ?? 30}
                      onChange={e => setForm(f => ({ ...f, exercise_minutes: parseInt(e.target.value) || 30 }))}
                      className="w-16 px-2 py-1.5 text-xs rounded-lg bg-ui-input border border-ui-input-border text-ui-text outline-none focus:border-ui-input-focus"
                    />
                    <span className="text-xs text-ui-subtext">min</span>
                  </div>
                )}
              </div>
            </div>

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

        {/* Medication */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-ui-subtext uppercase tracking-wider">Medication</p>
            <Button size="sm" variant="secondary" onClick={() => setShowMedForm(!showMedForm)}>
              {showMedForm ? 'Cancel' : '+ Add'}
            </Button>
          </div>
          <p className="text-[11px] text-ui-subtext/60 mb-3 leading-snug">
            Names stored on this device only — the server only knows "Medication 1", "Medication 2", etc.
            If you clear browser data or switch devices, names will show as placeholders until re-entered.
            Your logs and reminders are always safe on the server.
          </p>

          {showMedForm && (
            <Card className="px-4 py-3 mb-3 space-y-2">
              <Input
                value={medForm.name}
                onChange={e => setMedForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Medication name"
              />
              <Input
                value={medForm.reminder_times}
                onChange={e => setMedForm(f => ({ ...f, reminder_times: e.target.value }))}
                placeholder="Reminder times e.g. 08:00, 14:00 (optional)"
              />
              <Button onClick={handleAddMed} disabled={!medForm.name.trim()}>Add</Button>
            </Card>
          )}

          {medication.length === 0 && !showMedForm ? (
            <p className="text-sm text-ui-subtext">No medication configured.</p>
          ) : (
            <div className="space-y-2">
              {medication.map(med => {
                const taken = !!medLogs[med.id]
                const displayName = getMedName(userId, med.id, med.name)
                const nameIsLocal = displayName !== med.name
                const times = med.reminder_times ? med.reminder_times.split(',').map(t => t.trim()) : []
                return (
                  <Card key={med.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ui-text">{displayName}</p>
                      {!nameIsLocal && (
                        <p className="text-[10px] text-ui-subtext/50 italic">name not on this device</p>
                      )}
                      {times.length > 0 && (
                        <p className="text-xs text-ui-subtext mt-0.5">⏰ {times.join(' · ')}</p>
                      )}
                    </div>
                    {taken ? (
                      <span className="text-xs text-ui-accent font-medium flex-shrink-0">✓ Taken</span>
                    ) : (
                      <Button size="sm" onClick={() => handleLogMed(med.id)} className="flex-shrink-0">
                        Mark taken
                      </Button>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        {/* Gate mode: prominent continue CTA, only enabled once the log
            exists (i.e. handleSave or pre-existing log loaded). */}
        {gateMode && (
          <div className="mt-8">
            <Button
              size="lg"
              className="w-full"
              onClick={onComplete}
              disabled={!log}
            >
              {log ? 'Continue → Triage' : 'Log first to continue'}
            </Button>
          </div>
        )}

      </div>
    </div>
  )
}
