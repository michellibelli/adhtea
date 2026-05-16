import { useState } from 'react'
import { updateTask } from '../api/tasks'
import { formatSnoozeLabel } from '../utils/snooze'
import SnoozeSheet from './SnoozeSheet'
import Button from './Button'
import Card from './Card'
import { Input, Textarea } from './Input'
import ProjectBadge from './ProjectBadge'

const TYPE_ICONS  = { task: '✦', appointment: '◷', routine: '↻', note: '◈' }
const WEIGHT_DOTS = { light: 1, medium: 2, heavy: 3 }

const LOCATION_TYPES = [
  { id: 'zoom',    label: 'Zoom' },
  { id: 'signal',  label: 'Signal' },
  { id: 'phone',   label: 'Phone' },
  { id: 'office',  label: 'Office' },
  { id: 'address', label: 'Address' },
  { id: 'other',   label: 'Other' },
]

// ── Inline edit form ─────────────────────────────────────────────────────────

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
      // Build the patch object: empty strings become null so the API clears the field.
      // .trim() removes accidental leading/trailing spaces before saving.
      const patch = {
        title:           form.title.trim(),
        notes:           form.notes.trim() || null,
        due_date:        form.due_date        || null,
        due_time:        form.due_time        || null,
        location_type:   form.location_type   || null,
        location_detail: form.location_detail.trim() || null,
        tags:            form.tags.trim()     || null,
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
  const isTask    = task.task_type === 'task'
  const isNote    = task.task_type === 'note'
  const isRoutine = task.task_type === 'routine'

  return (
    <form onSubmit={handleSave} className="space-y-3 pt-1">

      {/* Title */}
      <Input
        value={form.title}
        onChange={(e) => set('title', e.target.value)}
        placeholder="Title"
        autoFocus
      />

      {/* Date / time */}
      {(isTask || isAppt) && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] text-ui-subtext mb-1">
              Date{(isTask || isAppt) && <span className="text-red-400 ml-0.5">*</span>}
            </p>
            <Input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] text-ui-subtext mb-1">Time{isAppt && <span className="text-red-400 ml-0.5">*</span>}</p>
            <Input type="time" value={form.due_time} onChange={(e) => set('due_time', e.target.value)} />
          </div>
        </div>
      )}

      {/* Location (appointments) */}
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

      {/* Tags (notes) */}
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

      {/* Notes */}
      {!isRoutine && (
        <Textarea
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={2}
          placeholder="Notes…"
        />
      )}

      {/* Actions */}
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


// ── Task card ────────────────────────────────────────────────────────────────

export default function TaskCard({
  task: initialTask,
  variant = 'today',
  onComplete,
  onSnooze,
  onUnsnooze,
  onDefer,
  onDelete,
  onScheduleToday,
}) {
  const [task,        setTask]        = useState(initialTask)
  const [showSnooze,  setShowSnooze]  = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [editing,     setEditing]     = useState(false)
  const [leaving,     setLeaving]     = useState(false)

  function handleComplete() {
    setLeaving(true)
    setTimeout(() => onComplete?.(task.id), 350)
  }

  function handleSnooze(isoDate) {
    setShowSnooze(false)
    onSnooze?.(task.id, isoDate)
  }

  function handleSaved(updated) {
    setTask(updated)
    setEditing(false)
    setShowActions(false)
  }

  const dots = WEIGHT_DOTS[task.weight] || 1

  return (
    <>
      <Card className={`px-4 py-3 transition-all duration-300 ${leaving ? 'opacity-0 scale-95 translate-x-3' : 'opacity-100'}`}>

        {editing ? (
          <EditForm task={task} onSave={handleSaved} onCancel={() => setEditing(false)} />
        ) : (
          <>
            <div className="flex items-start gap-3">
              {/* Complete circle */}
              {(variant === 'today' || variant === 'inbox') && (
                <button
                  onClick={handleComplete}
                  className="mt-0.5 w-6 h-6 rounded-full border-2 border-ui-accent/50 flex-shrink-0 flex items-center justify-center hover:bg-ui-primary hover:border-transparent hover:text-ui-primary-text active:scale-90 transition-all duration-150 group"
                >
                  <svg viewBox="0 0 12 10" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <polyline points="1 5 4.5 8.5 11 1" />
                  </svg>
                </button>
              )}

              {/* Content */}
              <div className="flex-1 min-w-0" onClick={() => setShowActions(!showActions)}>
                <div className="flex items-start gap-2">
                  <span className="text-xs mt-0.5 flex-shrink-0 text-ui-accent">
                    {TYPE_ICONS[task.task_type] || '✦'}
                  </span>
                  <span className="text-sm font-medium leading-snug text-ui-text break-words">
                    {task.title}
                  </span>
                </div>

                {task.notes && (
                  <p className="text-xs mt-1 ml-4 text-ui-subtext line-clamp-2">{task.notes}</p>
                )}

                {/* Meta row */}
                <div className="flex items-center gap-2 mt-1.5 ml-4 flex-wrap">
                  <div className="flex gap-0.5">
                    {[1, 2, 3].map((d) => (
                      <div key={d} className={`w-1.5 h-1.5 rounded-full ${d <= dots ? 'bg-ui-accent' : 'bg-ui-border'}`} />
                    ))}
                  </div>

                  <ProjectBadge name={task.project_name} size="xs" />

                  {task.due_time && (
                    <span className="text-[10px] text-ui-subtext">{task.due_time}</span>
                  )}
                  {task.due_date && !task.due_time && (
                    <span className="text-[10px] text-ui-subtext">{task.due_date}</span>
                  )}
                  {task.location_detail && (
                    <span className="text-[10px] text-ui-subtext truncate max-w-[120px]">📍 {task.location_detail}</span>
                  )}
                  {task.tags && (
                    <span className="text-[10px] text-ui-subtext/70 truncate max-w-[100px]">{task.tags}</span>
                  )}

                  {variant === 'waiting' && task.snooze_until && (
                    <span className="text-xs bg-ui-badge text-ui-badge-text px-1.5 py-0.5 rounded-full">
                      {formatSnoozeLabel(task.snooze_until)}
                    </span>
                  )}

                  {task.priority === 'urgent' && (
                    <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-medium">Urgent</span>
                  )}
                  {task.is_critical && task.priority !== 'urgent' && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-medium">Critical</span>
                  )}
                </div>
              </div>

              {/* Edit pencil */}
              <button
                onClick={(e) => { e.stopPropagation(); setEditing(true); setShowActions(false) }}
                className="flex-shrink-0 p-1 text-ui-subtext/40 hover:text-ui-subtext transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>

            {/* Expanded actions */}
            {showActions && (
              <div className="mt-3 pt-3 border-t border-ui-border flex flex-wrap gap-2">
                {variant === 'inbox' && (
                  <Button size="sm" variant="secondary" onClick={() => { setShowActions(false); onScheduleToday?.(task.id) }}>
                    → Today
                  </Button>
                )}
                {(variant === 'today' || variant === 'inbox') && (
                  <Button size="sm" variant="secondary" onClick={() => { setShowActions(false); setShowSnooze(true) }}>
                    ◷ Snooze
                  </Button>
                )}
                {variant === 'today' && (
                  <Button size="sm" variant="secondary" onClick={() => { setShowActions(false); onDefer?.(task.id) }}>
                    ↩ Inbox
                  </Button>
                )}
                {variant === 'waiting' && (
                  <Button size="sm" variant="secondary" onClick={() => { setShowActions(false); onUnsnooze?.(task.id) }}>
                    ↩ Back to Inbox
                  </Button>
                )}
                <Button size="sm" variant="danger" onClick={() => { setShowActions(false); onDelete?.(task.id) }}>
                  Delete
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {showSnooze && <SnoozeSheet onSnooze={handleSnooze} onClose={() => setShowSnooze(false)} />}
    </>
  )
}
