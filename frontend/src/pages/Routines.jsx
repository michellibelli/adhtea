import { useState, useEffect } from 'react'
import { getRoutines, createRoutine, updateRoutine, deleteRoutine, getMissedRoutines } from '../api/routines'
import { completeTask, deleteTask } from '../api/tasks'
import Card from '../components/Card'
import Button from '../components/Button'
import { Input } from '../components/Input'

// "Tue May 20" — short label for when a missed routine was originally due.
function missedDateLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

const FREQ_LABELS  = { daily: 'Daily', weekdays: 'Weekdays', weekends: 'Weekends', weekly: 'Weekly', custom: 'Custom' }
const TIME_LABELS  = { anytime: 'Anytime', morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' }
const DAY_NAMES    = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const EMPTY_FORM   = { title: '', frequency: 'daily', time_of_day: 'anytime', days_of_week: '', only_when_present: false, exact_time: '' }


// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PillPicker({ options, labels, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt, i) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
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

function RoutineForm({ form, setForm, onSave, onCancel, editing = false }) {
  const needsDays = form.frequency === 'weekly' || form.frequency === 'custom'
  const selectedDays = form.days_of_week
    ? form.days_of_week.split(',').filter(Boolean).map(Number)
    : []

  function toggleDay(idx) {
    const days = new Set(selectedDays)
    days.has(idx) ? days.delete(idx) : days.add(idx)
    setForm(f => ({ ...f, days_of_week: [...days].sort().join(',') }))
  }

  return (
    <Card className="px-4 py-4 mb-4 space-y-3">
      <p className="text-xs text-ui-subtext uppercase tracking-wider">{editing ? 'Edit routine' : 'New routine'}</p>

      <Input
        value={form.title}
        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
        placeholder="Routine name"
      />

      <div>
        <p className="text-xs text-ui-subtext mb-1.5">Repeats</p>
        <PillPicker
          options={['daily', 'weekdays', 'weekends', 'weekly', 'custom']}
          labels={['Daily', 'Weekdays', 'Weekends', 'Weekly', 'Custom']}
          value={form.frequency}
          onChange={v => setForm(f => ({ ...f, frequency: v }))}
        />
      </div>

      {needsDays && (
        <div className="flex flex-wrap gap-1.5">
          {DAY_NAMES.map((d, i) => (
            <button
              key={i}
              onClick={() => toggleDay(i)}
              className={`w-9 h-9 rounded-full text-xs font-medium border transition-all ${
                selectedDays.includes(i)
                  ? 'bg-ui-primary text-ui-primary-text border-transparent'
                  : 'border-ui-border text-ui-subtext hover:text-ui-accent'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      <div>
        <p className="text-xs text-ui-subtext mb-1.5">Time of day</p>
        <PillPicker
          options={['anytime', 'morning', 'afternoon', 'evening']}
          labels={['Anytime', 'Morning', 'Afternoon', 'Evening']}
          value={form.time_of_day}
          onChange={v => setForm(f => ({ ...f, time_of_day: v }))}
        />
      </div>

      <div>
        <p className="text-xs text-ui-subtext mb-1.5">Exact time <span className="opacity-50">(optional — surfaces in Focus 5 min before)</span></p>
        <input
          type="time"
          value={form.exact_time || ''}
          onChange={e => setForm(f => ({ ...f, exact_time: e.target.value || null }))}
          className="px-3 py-1.5 text-sm rounded-lg bg-ui-input border border-ui-input-border text-ui-text outline-none focus:border-ui-input-focus transition-colors"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <Button onClick={onSave} disabled={!form.title.trim()} className="flex-1">
          {editing ? 'Save changes' : 'Add routine'}
        </Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  )
}

function RoutineItem({ routine, onEdit, onDeactivate }) {
  return (
    <Card className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ui-text leading-snug">{routine.title}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-ui-primary/10 text-ui-accent font-medium">
              {FREQ_LABELS[routine.frequency]}
            </span>
            {routine.time_of_day !== 'anytime' && !routine.exact_time && (
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-ui-border text-ui-subtext font-medium">
                {TIME_LABELS[routine.time_of_day]}
              </span>
            )}
            {routine.exact_time && (
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-ui-border text-ui-subtext font-medium">
                ⏰ {routine.exact_time}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <Button size="sm" variant="secondary" onClick={onEdit}>Edit</Button>
          <Button size="sm" variant="danger" onClick={onDeactivate}>✕</Button>
        </div>
      </div>
    </Card>
  )
}


// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Routines() {
  const [routines, setRoutines] = useState([])
  const [missed, setMissed]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => {
    Promise.all([getRoutines(), getMissedRoutines()])
      .then(([r, m]) => { setRoutines(r); setMissed(m) })
      .finally(() => setLoading(false))
  }, [])

  async function completeMissed(id) {
    setMissed(prev => prev.filter(t => t.id !== id))  // optimistic
    try { await completeTask(id) } catch (err) { console.error(err); getMissedRoutines().then(setMissed) }
  }

  async function dismissMissed(id) {
    setMissed(prev => prev.filter(t => t.id !== id))  // optimistic
    try { await deleteTask(id) } catch (err) { console.error(err); getMissedRoutines().then(setMissed) }
  }

  async function handleSave() {
    const data = {
      ...form,
      days_of_week: (form.frequency === 'weekly' || form.frequency === 'custom')
        ? form.days_of_week || null
        : null,
    }
    try {
      if (editingId) {
        const updated = await updateRoutine(editingId, data)
        setRoutines(prev => prev.map(r => r.id === editingId ? updated : r))
        setEditingId(null)
      } else {
        const created = await createRoutine(data)
        setRoutines(prev => [...prev, created])
        setShowForm(false)
      }
      setForm(EMPTY_FORM)
    } catch (err) { console.error(err) }
  }

  function startEdit(r) {
    setEditingId(r.id)
    setShowForm(false)
    setForm({
      title: r.title,
      frequency: r.frequency,
      time_of_day: r.time_of_day,
      days_of_week: r.days_of_week || '',
      only_when_present: r.only_when_present,
      exact_time: r.exact_time || '',
    })
  }

  function cancelEdit() { setEditingId(null); setForm(EMPTY_FORM) }

  async function handleDeactivate(id) {
    await deleteRoutine(id)
    setRoutines(prev => prev.map(r => r.id === id ? { ...r, active: false } : r))
  }

  async function handleReactivate(id) {
    await updateRoutine(id, { active: true })
    setRoutines(prev => prev.map(r => r.id === id ? { ...r, active: true } : r))
  }

  const active   = routines.filter(r => r.active)
  const inactive = routines.filter(r => !r.active)

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-2xl mx-auto w-full">

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-ui-text">Routines</h1>
          <Button
            size="sm"
            onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(EMPTY_FORM) }}
          >
            {showForm ? 'Cancel' : '+ Add'}
          </Button>
        </div>

        {missed.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-ui-subtext uppercase tracking-wider mb-2">
              Missed — {missed.length} from previous days
            </p>
            <div className="space-y-2">
              {missed.map(t => (
                <Card key={t.id} variant="flat" className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-ui-text leading-snug truncate">{t.title}</p>
                      <p className="text-[10px] text-ui-subtext mt-0.5">{missedDateLabel(t.scheduled_date)}</p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <Button size="sm" onClick={() => completeMissed(t.id)}>✓ Done</Button>
                      <Button size="sm" variant="secondary" onClick={() => dismissMissed(t.id)}>Dismiss</Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {showForm && (
          <RoutineForm
            form={form}
            setForm={setForm}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setForm(EMPTY_FORM) }}
          />
        )}

        {loading ? (
          <p className="text-sm text-ui-subtext text-center py-8">Loading…</p>
        ) : active.length === 0 && !showForm ? (
          <Card className="text-center px-8 py-12 mt-4">
            <div className="text-4xl mb-4">↻</div>
            <p className="text-base font-medium text-ui-text mb-2">No active routines</p>
            <p className="text-sm text-ui-subtext">Add your first routine — it'll appear in Triage each day it's scheduled.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {active.map(r =>
              editingId === r.id ? (
                <RoutineForm
                  key={r.id}
                  form={form}
                  setForm={setForm}
                  onSave={handleSave}
                  onCancel={cancelEdit}
                  editing
                />
              ) : (
                <RoutineItem
                  key={r.id}
                  routine={r}
                  onEdit={() => startEdit(r)}
                  onDeactivate={() => handleDeactivate(r.id)}
                />
              )
            )}
          </div>
        )}

        {inactive.length > 0 && (
          <div className="mt-8">
            <p className="text-xs text-ui-subtext uppercase tracking-wider mb-3">Inactive</p>
            <div className="space-y-2">
              {inactive.map(r => (
                <Card key={r.id} variant="flat" className="px-4 py-3 opacity-50">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ui-text">{r.title}</span>
                    <Button size="sm" variant="secondary" onClick={() => handleReactivate(r.id)}>
                      Restore
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
