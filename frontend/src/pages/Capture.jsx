import { useState, useRef, useEffect } from 'react'
import { createTask } from '../api/tasks'
import { createRoutine } from '../api/routines'
import Button from '../components/Button'
import { Input, Textarea } from '../components/Input'

const TASK_TYPES = [
  { id: 'task',    label: 'Task',    icon: '✦' },
  { id: 'routine', label: 'Routine', icon: '↻' },
  { id: 'note',    label: 'Note',    icon: '◈' },
]

const FREQUENCIES = [
  { id: 'daily',    label: 'Daily' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'weekends', label: 'Weekends' },
  { id: 'weekly',   label: 'Weekly' },
  { id: 'custom',   label: 'Custom' },
]

const BUCKETS = [
  { id: 'first',     label: 'First' },
  { id: 'morning',   label: 'Morning' },
  { id: 'midday',    label: 'Mid Day' },
  { id: 'afternoon', label: 'Afternoon' },
]

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function PillRow({ options, value, onChange, label }) {
  return (
    <div>
      {label && <p className="text-xs text-ui-subtext mb-1.5">{label}</p>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              value === opt.id
                ? 'bg-ui-primary text-ui-primary-text border-transparent'
                : 'border-ui-border text-ui-subtext hover:text-ui-accent'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function DayPicker({ value, onChange }) {
  const selected = value ? value.split(',').map(Number).filter((n) => !isNaN(n)) : []
  function toggle(idx) {
    const next = selected.includes(idx) ? selected.filter((d) => d !== idx) : [...selected, idx]
    onChange(next.sort((a, b) => a - b).join(','))
  }
  return (
    <div>
      <p className="text-xs text-ui-subtext mb-1.5">Days <span className="text-red-400">*</span></p>
      <div className="flex gap-1.5">
        {DAYS.map((d, i) => (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            className={`w-8 h-8 rounded-full text-xs font-semibold border transition-all flex items-center justify-center ${
              selected.includes(i)
                ? 'bg-ui-primary text-ui-primary-text border-transparent'
                : 'border-ui-border text-ui-subtext hover:text-ui-accent'
            }`}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  )
}

function TeaCupIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
         strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      {/* cup */}
      <path d="M4 8h13v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z" />
      {/* handle */}
      <path d="M17 9h2.25a2.25 2.25 0 0 1 0 4.5H17" />
      {/* saucer */}
      <path d="M3 20h15" />
      {/* steam */}
      <path d="M8 2.5c-.4.7-.4 1.3 0 2M12 2.5c-.4.7-.4 1.3 0 2" />
    </svg>
  )
}

function FieldRow({ label, required, children }) {
  return (
    <div>
      <p className="text-xs text-ui-subtext mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </p>
      {children}
    </div>
  )
}

const BLANK = {
  title: '',
  notes: '',
  due_date: '',
  due_time: '',
  tags: '',
  frequency: 'daily',
  bucket: 'morning',
  days_of_week: '',
  exact_time: '',
}

function isValid(taskType, form) {
  if (!form.title.trim()) return false
  if (taskType === 'task') return !!form.due_date
  if (taskType === 'routine') {
    const needsDays = form.frequency === 'weekly' || form.frequency === 'custom'
    return needsDays ? !!form.days_of_week : true
  }
  return true  // note: just title required
}

export default function Capture({ onNavigate }) {
  const [taskType, setTaskType] = useState('task')
  const [form, setForm]         = useState(BLANK)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(null)
  const [savedDate, setSavedDate] = useState(null)
  const [error, setError]       = useState(null)
  const titleRef = useRef(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  function set(field, val) { setForm((f) => ({ ...f, [field]: val })) }

  function reset() {
    setForm(BLANK)
    setTimeout(() => titleRef.current?.focus(), 50)
  }

  async function handleSubmit(e, addAnother = false) {
    e.preventDefault()
    if (!isValid(taskType, form)) return
    setSaving(true)
    setError(null)
    try {
      if (taskType === 'routine') {
        const payload = {
          title: form.title.trim(),
          notes: form.notes.trim() || undefined,
          frequency: form.frequency,
          bucket: form.bucket,
          days_of_week: form.days_of_week || undefined,
          exact_time: form.exact_time || undefined,
        }
        await createRoutine(payload)
        setSaved('routine')
        reset()
      } else {
        const today = new Date().toISOString().split('T')[0]
        const dueToday = form.due_date && form.due_date <= today
        // is_work isn't set here — plain tasks default to work server-side;
        // correct it afterward with the cup-icon toggle on the task card.
        const payload = {
          title: form.title.trim(),
          task_type: taskType,
          notes: form.notes.trim() || undefined,
          due_date: form.due_date || undefined,
          due_time: form.due_time || undefined,
          tags: form.tags.trim() || undefined,
        }
        const created = await createTask(payload)
        if (created.status === 'today') {
          setSaved('today')
        } else if (dueToday) {
          // Aimed for today but rescheduled — today is full.
          setSavedDate(created.due_date)
          setSaved('snapped')
        } else {
          setSaved(taskType)
        }
        reset()
      }
      // "Add another" keeps the user on Capture (form already reset); the
      // primary tea-cup action returns them to Focus after the flash.
      setTimeout(() => { setSaved(null); if (!addAnother) onNavigate?.('focus') }, 1500)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Could not save — check connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const needsDays = form.frequency === 'weekly' || form.frequency === 'custom'
  const valid = isValid(taskType, form)

  const savedDateLabel = savedDate
    ? new Date(savedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'later'
  const successMsg = saved === 'routine'
    ? '↻ Routine saved — appears in your daily tasks'
    : saved === 'today'
    ? '✦ Added to today — go to Focus to see it'
    : saved === 'snapped'
    ? `✦ Rescheduled to ${savedDateLabel} — see your inbox`
    : saved
    ? '✦ Captured — in your inbox'
    : ''

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-8 max-w-lg mx-auto w-full">

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-ui-text">Capture</h1>
          <p className="text-sm mt-1 text-ui-subtext">Get it out of your head</p>
        </div>

        {/* Type selector — wraps on very narrow screens so 5 pills can't overflow */}
        <div className="flex flex-wrap gap-1 mb-5 justify-center">
          {TASK_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => { setTaskType(type.id); setForm(BLANK) }}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-medium border transition-all duration-150 ${
                taskType === type.id
                  ? 'bg-ui-primary text-ui-primary-text border-transparent'
                  : 'bg-ui-surface border-ui-border text-ui-subtext hover:text-ui-accent'
              }`}
            >
              <span>{type.icon}</span>
              <span>{type.label}</span>
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Title — always present */}
          <FieldRow label={taskType === 'note' ? 'Note' : 'Title'} required>
            <Input
              ref={titleRef}
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder={
                taskType === 'task'    ? 'What needs doing?' :
                taskType === 'routine' ? 'What routine?' :
                                         'What do you want to remember?'
              }
            />
          </FieldRow>

          {/* ── TASK fields ── */}
          {taskType === 'task' && (
            <>
              <FieldRow label="Due date" required>
                <Input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
              </FieldRow>
              <FieldRow label="Due time (optional)">
                <Input type="time" value={form.due_time} onChange={(e) => set('due_time', e.target.value)} />
              </FieldRow>
            </>
          )}

          {/* ── ROUTINE fields ── */}
          {taskType === 'routine' && (
            <>
              <PillRow
                label="How often *"
                options={FREQUENCIES}
                value={form.frequency}
                onChange={(v) => set('frequency', v)}
              />
              {needsDays && (
                <DayPicker value={form.days_of_week} onChange={(v) => set('days_of_week', v)} />
              )}
              <PillRow
                label="When *"
                options={BUCKETS}
                value={form.bucket}
                onChange={(v) => set('bucket', v)}
              />
              <FieldRow label="Exact time (optional)">
                <Input type="time" value={form.exact_time} onChange={(e) => set('exact_time', e.target.value)} />
              </FieldRow>
            </>
          )}

          {/* ── NOTE fields ── */}
          {taskType === 'note' && (
            <FieldRow label="Tags (optional)">
              <Input
                value={form.tags}
                onChange={(e) => set('tags', e.target.value)}
                placeholder="work, ideas, health — comma separated"
              />
            </FieldRow>
          )}

          {/* Notes — task / note only */}
          {taskType !== 'routine' && (
            <FieldRow label="Notes (optional)">
              <Textarea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                rows={2}
                placeholder="Any extra context…"
              />
            </FieldRow>
          )}

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-ui-subtext">
              {taskType === 'task'    && 'Due date required'}
              {taskType === 'routine' && (needsDays ? 'Days required' : '')}
            </p>

            {taskType === 'routine' ? (
              <Button type="submit" disabled={!valid || saving}>
                {saving ? '…' : 'Save routine'}
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                {/* Capture and immediately add another — stays on Capture */}
                <button
                  type="button"
                  onClick={(e) => handleSubmit(e, true)}
                  disabled={!valid || saving}
                  title="Capture and add another"
                  aria-label="Capture and add another"
                  className="w-12 h-12 rounded-full border-2 border-ui-border flex items-center justify-center text-ui-subtext hover:text-ui-accent hover:border-ui-accent disabled:opacity-40 transition-colors"
                >
                  <span className="text-2xl leading-none pb-0.5">+</span>
                </button>
                {/* Capture and return to Focus (primary) */}
                <button
                  type="submit"
                  disabled={!valid || saving}
                  title="Capture and go to Focus"
                  aria-label="Capture and go to Focus"
                  className="w-12 h-12 rounded-full bg-ui-primary text-ui-primary-text flex items-center justify-center disabled:opacity-40 transition-opacity"
                >
                  {saving ? <span className="text-lg leading-none">…</span> : <TeaCupIcon />}
                </button>
              </div>
            )}
          </div>
        </form>

        {/* Success flash */}
        <div className={`mt-5 text-center text-sm font-medium text-ui-accent transition-opacity duration-300 ${saved ? 'opacity-100' : 'opacity-0'}`}>
          {successMsg}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-3 text-center text-sm font-medium text-red-400">
            {error}
          </div>
        )}

      </div>
    </div>
  )
}
