import { useState, useEffect } from 'react'
import { getTodayLog, upsertLog, getTodayCapacity } from '../api/selfcare'
import { getMedication, createMedication, logMedicationTaken, getMedicationTodayLog } from '../api/medication'
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

export default function SelfCare() {
  const [log,        setLog]        = useState(null)
  const [capacity,   setCapacity]   = useState(null)
  const [medication, setMedication] = useState([])
  const [medLogs,    setMedLogs]    = useState({})   // schedule_id → log
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [form,       setForm]       = useState(EMPTY_FORM)

  const [showMedForm, setShowMedForm] = useState(false)
  const [medForm,     setMedForm]     = useState({ name: '', dose: '' })

  useEffect(() => {
    Promise.all([getTodayLog(), getTodayCapacity(), getMedication()])
      .then(async ([todayLog, cap, meds]) => {
        setLog(todayLog)
        setCapacity(cap)
        setMedication(meds)
        if (todayLog) {
          setForm({
            sleep_hours:     todayLog.sleep_hours,
            sleep_quality:   todayLog.sleep_quality,
            meals:           todayLog.meals,
            exercise:        todayLog.exercise,
            exercise_minutes: todayLog.exercise_minutes,
            mood:            todayLog.mood,
          })
        }
        const ml = {}
        await Promise.all(
          meds.map(m =>
            getMedicationTodayLog(m.id).then(l => { if (l) ml[m.id] = l })
          )
        )
        setMedLogs(ml)
      })
      .finally(() => setLoading(false))
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

  async function handleAddMed() {
    if (!medForm.name.trim()) return
    try {
      const created = await createMedication({ name: medForm.name.trim(), dose: medForm.dose.trim() || null })
      setMedication(prev => [...prev, created])
      setMedForm({ name: '', dose: '' })
      setShowMedForm(false)
    } catch (err) { console.error(err) }
  }

  if (loading) {
    return <div className="aria-page flex items-center justify-center"><p className="text-sm text-ui-subtext">Loading…</p></div>
  }

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-2xl mx-auto w-full">

        <h1 className="text-2xl font-semibold text-ui-text mb-6">Foundation</h1>

        {/* Capacity */}
        <div className="mb-6">
          <p className="text-xs text-ui-subtext uppercase tracking-wider mb-2">Today's capacity</p>
          <CapacityBar capacity={capacity} />
        </div>

        {/* Self-care log */}
        <div className="mb-6">
          <p className="text-xs text-ui-subtext uppercase tracking-wider mb-3">
            {log ? 'Update today\'s log' : 'Morning log'}
          </p>
          <Card className="px-4 py-4 space-y-4">

            {/* Sleep hours */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-ui-subtext">Sleep</span>
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
              <span className="text-xs text-ui-subtext block mb-1.5">Sleep quality</span>
              <TapRow
                options={[1,2,3,4,5]}
                labels={['1','2','3','4','5']}
                value={form.sleep_quality}
                onChange={v => setForm(f => ({ ...f, sleep_quality: v }))}
              />
            </div>

            {/* Meals */}
            <div>
              <span className="text-xs text-ui-subtext block mb-1.5">Meals today</span>
              <TapRow
                options={[0,1,2,3,4]}
                labels={['0','1','2','3','4']}
                value={form.meals}
                onChange={v => setForm(f => ({ ...f, meals: v }))}
              />
            </div>

            {/* Exercise */}
            <div>
              <span className="text-xs text-ui-subtext block mb-1.5">Exercise</span>
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
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-ui-subtext uppercase tracking-wider">Medication</p>
            <Button size="sm" variant="secondary" onClick={() => setShowMedForm(!showMedForm)}>
              {showMedForm ? 'Cancel' : '+ Add'}
            </Button>
          </div>

          {showMedForm && (
            <Card className="px-4 py-3 mb-3 space-y-2">
              <Input
                value={medForm.name}
                onChange={e => setMedForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Medication name"
              />
              <Input
                value={medForm.dose}
                onChange={e => setMedForm(f => ({ ...f, dose: e.target.value }))}
                placeholder="Dose (optional)"
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
                return (
                  <Card key={med.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ui-text">{med.name}</p>
                      {med.dose && <p className="text-xs text-ui-subtext">{med.dose}</p>}
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

      </div>
    </div>
  )
}
