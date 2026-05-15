import { useState, useRef, useEffect } from 'react'
import { createTask } from '../api/tasks'
import { createRoutine } from '../api/routines'
import { createProject, generateProjectTasks } from '../api/projects'
import Button from '../components/Button'
import { Input, Textarea } from '../components/Input'

const TASK_TYPES = [
  { id: 'task',        label: 'Task',    icon: '✦' },
  { id: 'appointment', label: 'Appt',   icon: '◷' },
  { id: 'routine',     label: 'Routine', icon: '↻' },
  { id: 'note',        label: 'Note',    icon: '◈' },
  { id: 'project',     label: 'Project', icon: '🌱' },
]

const LOCATION_TYPES = [
  { id: 'zoom',    label: 'Zoom' },
  { id: 'signal',  label: 'Signal' },
  { id: 'phone',   label: 'Phone' },
  { id: 'office',  label: 'Office' },
  { id: 'address', label: 'Address' },
  { id: 'other',   label: 'Other' },
]

const FREQUENCIES = [
  { id: 'daily',    label: 'Daily' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'weekends', label: 'Weekends' },
  { id: 'weekly',   label: 'Weekly' },
  { id: 'custom',   label: 'Custom' },
]

const TIMES_OF_DAY = [
  { id: 'morning',   label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening',   label: 'Evening' },
  { id: 'anytime',   label: 'Any time' },
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
  location_type: '',
  location_detail: '',
  tags: '',
  frequency: 'daily',
  time_of_day: 'anytime',
  days_of_week: '',
  exact_time: '',
}

function isValid(taskType, form) {
  if (!form.title.trim()) return false
  if (taskType === 'task') return !!form.due_date
  if (taskType === 'appointment') return !!form.due_date && !!form.due_time
  if (taskType === 'routine') {
    const needsDays = form.frequency === 'weekly' || form.frequency === 'custom'
    return needsDays ? !!form.days_of_week : true
  }
  return true  // note / project: just title required
}

export default function Capture({ onNavigate }) {
  const [taskType, setTaskType] = useState('task')
  const [form, setForm]         = useState(BLANK)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(null)
  const [error, setError]       = useState(null)
  const titleRef = useRef(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  function set(field, val) { setForm((f) => ({ ...f, [field]: val })) }

  function reset() {
    setForm(BLANK)
    setTimeout(() => titleRef.current?.focus(), 50)
  }

  async function handleSubmit(e) {
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
          time_of_day: form.time_of_day,
          days_of_week: form.days_of_week || undefined,
          exact_time: form.exact_time || undefined,
        }
        await createRoutine(payload)
        setSaved('routine')
        reset()
      } else if (taskType === 'project') {
        const p = await createProject(form.title.trim(), form.notes.trim() || null)
        if (form.notes.trim()) {
          await generateProjectTasks(p.id, form.notes.trim())
        }
        onNavigate?.('projects')
        return
      } else {
        const today = new Date().toISOString().split('T')[0]
        const dueToday = form.due_date && form.due_date <= today
        const payload = {
          title: form.title.trim(),
          task_type: taskType,
          notes: form.notes.trim() || undefined,
          due_date: form.due_date || undefined,
          due_time: form.due_time || undefined,
          location_type: form.location_type || undefined,
          location_detail: form.location_detail.trim() || undefined,
          tags: form.tags.trim() || undefined,
        }
        await createTask(payload)
        setSaved(dueToday ? 'today' : taskType)
        reset()
      }
      setTimeout(() => setSaved(null), 2500)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Could not save — check connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const needsDays = form.frequency === 'weekly' || form.frequency === 'custom'
  const valid = isValid(taskType, form)

  const successMsg = saved === 'routine'
    ? '↻ Routine saved — appears in your daily tasks'
    : saved === 'today'
    ? '✦ Added to today — go to Focus to see it'
    : saved
    ? '✦ Captured — in your inbox for triage'
    : ''

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-lg mx-auto w-full">

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
                taskType === 'task'        ? 'What needs doing?' :
                taskType === 'appointment' ? 'What appointment?' :
                taskType === 'routine'     ? 'What routine?' :
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

          {/* ── APPOINTMENT fields ── */}
          {taskType === 'appointment' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Date" required>
                  <Input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
                </FieldRow>
                <FieldRow label="Time" required>
                  <Input type="time" value={form.due_time} onChange={(e) => set('due_time', e.target.value)} />
                </FieldRow>
              </div>

              <FieldRow label="Location (optional)">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {LOCATION_TYPES.map((loc) => (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => set('location_type', form.location_type === loc.id ? '' : loc.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                        form.location_type === loc.id
                          ? 'bg-ui-primary text-ui-primary-text border-transparent'
                          : 'border-ui-border text-ui-subtext hover:text-ui-accent'
                      }`}
                    >
                      {loc.label}
                    </button>
                  ))}
                </div>
                {form.location_type && (
                  <Input
                    value={form.location_detail}
                    onChange={(e) => set('location_detail', e.target.value)}
                    placeholder={
                      form.location_type === 'zoom'    ? 'Meeting link' :
                      form.location_type === 'signal'  ? 'Phone number' :
                      form.location_type === 'phone'   ? 'Phone number' :
                      form.location_type === 'office'  ? 'Room or building' :
                      form.location_type === 'address' ? 'Street address' :
                                                         'Details'
                    }
                  />
                )}
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
                label="Time of day *"
                options={TIMES_OF_DAY}
                value={form.time_of_day}
                onChange={(v) => set('time_of_day', v)}
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

          {/* ── PROJECT fields ── */}
          {taskType === 'project' && (
            <FieldRow label="Describe the project">
              <Textarea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                rows={4}
                placeholder="What does this project involve? AI will break it into daily tasks scheduled starting tomorrow…"
                autoFocus
              />
            </FieldRow>
          )}

          {/* Notes — task / appointment / note only */}
          {taskType !== 'routine' && taskType !== 'project' && (
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
              {taskType === 'task'        && 'Due date required'}
              {taskType === 'appointment' && 'Date and time required'}
              {taskType === 'routine'     && (needsDays ? 'Days required' : '')}
            </p>
            <Button type="submit" disabled={!valid || saving}>
              {saving
                ? '…'
                : taskType === 'routine'
                  ? 'Save routine'
                  : taskType === 'project'
                    ? 'Create project'
                    : 'Capture'}
            </Button>
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
