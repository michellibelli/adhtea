import { useState } from 'react'
import Card from './Card'
import Button from './Button'
import SnoozeSheet from './SnoozeSheet'
import { Input, Textarea } from './Input'
import { updateTask } from '../api/tasks'

const TYPE_ICONS = { task: '✦', appointment: '◷', routine: '↻', note: '◈' }

const LOCATION_TYPES = [
  { id: 'zoom',    label: 'Zoom' },
  { id: 'signal',  label: 'Signal' },
  { id: 'phone',   label: 'Phone' },
  { id: 'office',  label: 'Office' },
  { id: 'address', label: 'Address' },
  { id: 'other',   label: 'Other' },
]

function PillSelector({ label, options, value, onChange }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-ui-subtext uppercase tracking-wider w-14 flex-shrink-0">{label}</span>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(value === opt.value ? null : opt.value)}
            className={`px-2 py-0.5 rounded-lg text-xs font-medium border transition-all duration-100 ${
              value === opt.value
                ? 'bg-ui-primary text-ui-primary-text border-transparent'
                : 'border-ui-border text-ui-subtext hover:text-ui-accent hover:border-ui-accent/40'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function EditForm({ task, onSave, onCancel }) {
  const [form, setForm] = useState({
    title:           task.title ?? '',
    notes:           task.notes ?? '',
    due_date:        task.due_date ?? '',
    due_time:        task.due_time ?? '',
    location_type:   task.location_type ?? '',
    location_detail: task.location_detail ?? '',
    tags:            task.tags ?? '',
  })
  const [saving, setSaving] = useState(false)

  function set(field, val) { setForm((f) => ({ ...f, [field]: val })) }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const patch = {
        title:           form.title.trim(),
        notes:           form.notes.trim() || null,
        due_date:        form.due_date   || null,
        due_time:        form.due_time   || null,
        location_type:   form.location_type   || null,
        location_detail: form.location_detail.trim() || null,
        tags:            form.tags.trim() || null,
      }
      const updated = await updateTask(task.id, patch)
      onSave(updated)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const isAppt    = task.task_type === 'appointment'
  const isNote    = task.task_type === 'note'
  const isRoutine = task.task_type === 'routine'

  return (
    <form onSubmit={handleSave} className="space-y-3 pt-1">
      <Input
        value={form.title}
        onChange={(e) => set('title', e.target.value)}
        placeholder="Title"
        autoFocus
      />

      {(task.task_type === 'task' || isAppt) && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] text-ui-subtext mb-1">Date</p>
            <Input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] text-ui-subtext mb-1">Time</p>
            <Input type="time" value={form.due_time} onChange={(e) => set('due_time', e.target.value)} />
          </div>
        </div>
      )}

      {isAppt && (
        <div>
          <p className="text-[10px] text-ui-subtext mb-1">Location</p>
          <div className="flex flex-wrap gap-1 mb-1.5">
            {LOCATION_TYPES.map((loc) => (
              <button
                key={loc.id}
                type="button"
                onClick={() => set('location_type', form.location_type === loc.id ? '' : loc.id)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border transition-all ${
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
        </div>
      )}

      {isNote && (
        <div>
          <p className="text-[10px] text-ui-subtext mb-1">Tags</p>
          <Input
            value={form.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="work, ideas — comma separated"
          />
        </div>
      )}

      {!isRoutine && (
        <Textarea
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={2}
          placeholder="Notes…"
        />
      )}

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={!form.title.trim() || saving}>
          {saving ? '…' : 'Save'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export default function TriageCard({ task: initialTask, onScheduleToday, onSnooze, onDelete }) {
  const [task,       setTask]       = useState(initialTask)
  const [weight,     setWeight]     = useState(initialTask.weight    ?? 'medium')
  const [priority,   setPriority]   = useState(initialTask.priority  ?? null)
  const [desire,     setDesire]     = useState(initialTask.desire    ?? null)
  const [showMeta,   setShowMeta]   = useState(false)
  const [showSnooze, setShowSnooze] = useState(false)
  const [leaving,    setLeaving]    = useState(false)
  const [editing,    setEditing]    = useState(false)

  function handleSchedule() {
    setLeaving(true)
    setTimeout(() => onScheduleToday(task.id, { weight, priority, desire }), 300)
  }

  function handleSnooze(isoDate) {
    setShowSnooze(false)
    setLeaving(true)
    setTimeout(() => onSnooze(task.id, isoDate), 300)
  }

  function handleDelete() {
    setLeaving(true)
    setTimeout(() => onDelete(task.id), 300)
  }

  function handleSaved(updated) {
    setTask(updated)
    setEditing(false)
  }

  return (
    <>
      <Card className={`px-4 py-3 transition-all duration-300 ${leaving ? 'opacity-0 scale-95' : 'opacity-100'}`}>
        {editing ? (
          <EditForm task={task} onSave={handleSaved} onCancel={() => setEditing(false)} />
        ) : (
          <>
            {/* Title row */}
            <div className="flex items-start gap-2 mb-3">
              <span className="text-xs mt-0.5 flex-shrink-0 text-ui-accent">{TYPE_ICONS[task.task_type] || '✦'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ui-text leading-snug">{task.title}</p>
                {task.notes && (
                  <p className="text-xs text-ui-subtext mt-0.5 line-clamp-1">{task.notes}</p>
                )}
              </div>
              {/* Edit pencil */}
              <button
                onClick={() => { setEditing(true); setShowMeta(false) }}
                className="flex-shrink-0 p-1 text-ui-subtext/40 hover:text-ui-subtext transition-colors"
                title="Edit"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              {/* Expand/collapse meta toggle */}
              <button
                onClick={() => setShowMeta(!showMeta)}
                className="text-ui-subtext hover:text-ui-accent transition-colors flex-shrink-0 mt-0.5"
                title="Set priority"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                  <circle cx="8" cy="4" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="12" r="1.5" />
                </svg>
              </button>
            </div>

            {/* Inline meta selectors */}
            {showMeta && (
              <div className="space-y-2 mb-3 pl-4 border-l-2 border-ui-border">
                <PillSelector
                  label="Weight"
                  value={weight}
                  onChange={setWeight}
                  options={[
                    { value: 'light',  label: 'Light' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'heavy',  label: 'Heavy' },
                  ]}
                />
                <PillSelector
                  label="Urgent"
                  value={priority}
                  onChange={setPriority}
                  options={[
                    { value: 'urgent', label: 'Yes' },
                    { value: 'normal', label: 'No' },
                  ]}
                />
                <PillSelector
                  label="Desire"
                  value={desire}
                  onChange={setDesire}
                  options={[
                    { value: 'high',   label: '↑' },
                    { value: 'medium', label: '=' },
                    { value: 'low',    label: '↓' },
                  ]}
                />
              </div>
            )}

            {/* Action row */}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSchedule} className="flex-1">
                → Today
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setShowSnooze(true)}>
                ◷
              </Button>
              <Button size="sm" variant="danger" onClick={handleDelete}>
                ✕
              </Button>
            </div>
          </>
        )}
      </Card>

      {showSnooze && (
        <SnoozeSheet onSnooze={handleSnooze} onClose={() => setShowSnooze(false)} />
      )}
    </>
  )
}
