import { useState } from 'react'
import Button from './Button'

export default function EditTaskSheet({ task, onSave, onClose, isNew = false }) {
  // Fresh from quick-add: start the title blank with the placeholder standing
  // in for it, so she can click the kettle and start typing straight away
  // instead of selecting-and-clearing "New task" first. Blank saves fall back
  // to task.title (below), so an untouched field still saves as "New task".
  const [title,   setTitle]   = useState(isNew ? '' : task.title)
  const [notes,   setNotes]   = useState(task.notes || '')
  const [dueDate, setDueDate] = useState(task.due_date || '')
  const [dueTime, setDueTime] = useState(task.due_time || '')

  async function handleSave() {
    await onSave({
      title:    title.trim() || task.title,
      notes:    notes.trim() || null,
      due_date: dueDate || null,
      due_time: dueTime || null,
    })
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-ui-surface border-t border-ui-border rounded-t-2xl pb-safe md:left-1/2 md:right-auto md:bottom-auto md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-96 md:rounded-2xl md:border">
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full bg-ui-border" />
        </div>
        <div className="px-4 pt-2 pb-6 space-y-3">
          <p className="text-base font-semibold text-ui-text">Edit task</p>
          <input
            className="w-full text-sm bg-ui-input border border-ui-input-border rounded-xl px-3 py-2.5 text-ui-text outline-none focus:border-ui-accent transition-colors"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose() }}
            placeholder={isNew ? task.title : 'Task title'}
            autoFocus
          />
          <textarea
            className="w-full text-sm bg-ui-input border border-ui-input-border rounded-xl px-3 py-2.5 text-ui-text outline-none focus:border-ui-accent transition-colors resize-none"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Notes…"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="flex-1 text-sm bg-ui-input border border-ui-input-border rounded-xl px-3 py-2.5 text-ui-text outline-none focus:border-ui-accent transition-colors"
            />
            {task.task_type === 'routine' && (
              <input
                type="time"
                value={dueTime}
                onChange={e => setDueTime(e.target.value)}
                className="flex-1 text-sm bg-ui-input border border-ui-input-border rounded-xl px-3 py-2.5 text-ui-text outline-none focus:border-ui-accent transition-colors"
              />
            )}
          </div>
          <Button onClick={handleSave} className="w-full">Save</Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </>
  )
}
