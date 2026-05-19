import { useState, useEffect, useMemo } from 'react'
import { getBacklog, updateTask, snoozeTask, unsnoozeTask, deleteTask } from '../api/tasks'
import { listProjects, addTaskToProject } from '../api/projects'
import Card from '../components/Card'
import { Input } from '../components/Input'
import ProjectBadge from '../components/ProjectBadge'
import ConfirmModal from '../components/ConfirmModal'
import { InlineSkeletonCards, PageError } from '../components/PageState'

const TYPE_ICONS = { task: '✦', appointment: '◷', routine: '↻', note: '◈' }

function fmtDate(iso) {
  if (!iso) return null
  // Add T00:00:00 for date-only strings so the browser doesn't interpret them as UTC midnight
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const STATUS_STYLE = {
  today:   'bg-ui-accent/20 text-ui-accent',
  snoozed: 'bg-amber-500/20 text-amber-400',
  done:    'bg-emerald-500/20 text-emerald-400',
}

// ── Snooze icon ───────────────────────────────────────────────────────────────

function MoonIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function SnoozeIcon({ active }) {
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
      active ? 'ring-2 ring-emerald-400 text-emerald-400' : 'text-ui-subtext/40'
    }`}>
      <MoonIcon />
    </div>
  )
}

// ── Task row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, selected, onToggle, onDateSave, onSnoozeToggle, isEditing, onStartEdit, onCancelEdit, projects, isProjectPicking, onStartProjectPick, onCancelProjectPick, onProjectPick, onDelete }) {
  const [localDate, setLocalDate] = useState(task.due_date || '')
  const isSnoozed = !!task.snooze_until
  const badge = STATUS_STYLE[task.status]

  return (
    <div className={`border-b border-ui-border last:border-0 transition-colors ${selected ? 'bg-ui-accent/5' : ''}`}>
      <div className="flex items-center gap-2 py-3">
        {/* Checkbox */}
        <button
          onClick={() => onToggle(task.id)}
          className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
            selected ? 'bg-ui-accent border-ui-accent' : 'border-ui-border'
          }`}
        >
          {selected && (
            <svg viewBox="0 0 10 8" fill="none" stroke="white" strokeWidth={2.5} className="w-2.5 h-2.5">
              <polyline points="1 4 3.5 6.5 9 1" />
            </svg>
          )}
        </button>

        <span className="text-[11px] flex-shrink-0 text-ui-accent">{TYPE_ICONS[task.task_type] || '✦'}</span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ui-text leading-snug truncate">{task.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {badge && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badge}`}>
                {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
              </span>
            )}
            <ProjectBadge name={task.project_name} size="xs" />
          </div>
        </div>

        {/* Date pill */}
        <button
          onClick={() => isEditing ? onCancelEdit() : onStartEdit(task.id)}
          className={`flex-shrink-0 text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap transition-colors ${
            task.due_date
              ? 'border-ui-accent/40 text-ui-accent hover:bg-ui-accent/10'
              : 'border-ui-border/50 text-ui-subtext/40 hover:border-ui-border'
          }`}
        >
          {task.due_date ? fmtDate(task.due_date) : '—'}
        </button>

        {/* Project button */}
        {projects.length > 0 && (
          <button
            onClick={() => isProjectPicking ? onCancelProjectPick() : onStartProjectPick(task.id)}
            title="Add to project"
            className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all ${
              isProjectPicking ? 'ring-2 ring-ui-accent text-ui-accent' : 'text-ui-subtext/40 hover:text-ui-subtext'
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
            </svg>
          </button>
        )}

        {/* Snooze toggle */}
        <button onClick={() => onSnoozeToggle(task)} title={isSnoozed ? 'Remove snooze' : 'Snooze 1 month'}>
          <SnoozeIcon active={isSnoozed} />
        </button>

        {/* Delete */}
        <button
          onClick={() => onDelete?.(task)}
          title="Delete task"
          className="w-7 h-7 rounded-full flex items-center justify-center text-ui-subtext/40 hover:text-red-400 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-4 h-4">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"/>
          </svg>
        </button>
      </div>

      {/* Inline date picker */}
      {isEditing && (
        <div className="flex items-center gap-2 pb-3 pl-7">
          <input
            type="date"
            value={localDate}
            onChange={(e) => setLocalDate(e.target.value)}
            className="text-xs bg-ui-surface border border-ui-border rounded-lg px-2 py-1 text-ui-text focus:outline-none focus:border-ui-accent"
            autoFocus
          />
          <button
            onClick={() => { onDateSave(task.id, localDate || null); onCancelEdit() }}
            className="text-xs text-ui-accent font-medium hover:opacity-70 transition-opacity"
          >
            Set
          </button>
          {task.due_date && (
            <button
              onClick={() => { onDateSave(task.id, null); onCancelEdit() }}
              className="text-xs text-ui-subtext hover:opacity-70 transition-opacity"
            >
              Clear
            </button>
          )}
          <button onClick={onCancelEdit} className="text-xs text-ui-subtext/50 hover:opacity-70 transition-opacity">✕</button>
        </div>
      )}

      {/* Inline project picker */}
      {isProjectPicking && (
        <div className="flex items-center gap-2 pb-3 pl-7 flex-wrap">
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => onProjectPick(task.id, p.id)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-ui-accent/40 text-ui-accent hover:bg-ui-accent/10 transition-colors"
            >
              {p.title}
            </button>
          ))}
          <button onClick={onCancelProjectPick} className="text-xs text-ui-subtext/50 hover:opacity-70 transition-opacity">✕</button>
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AllTasks() {
  const [tasks,            setTasks]            = useState([])
  const [projects,         setProjects]         = useState([])
  const [loading,          setLoading]          = useState(true)
  const [error,            setError]            = useState(null)
  const [query,            setQuery]            = useState('')
  const [selected,         setSelected]         = useState(new Set())
  const [editingId,        setEditingId]        = useState(null)
  const [projectPickerId,  setProjectPickerId]  = useState(null)
  const [batchDateMode,    setBatchDateMode]    = useState(false)
  const [batchDate,        setBatchDate]        = useState('')
  const [askDelete,        setAskDelete]        = useState(null)  // task object or null

  function fetchAll() {
    setLoading(true)
    setError(null)
    Promise.all([getBacklog(), listProjects()])
      .then(([t, p]) => { setTasks(t); setProjects(p.filter(p => p.status === 'active')) })
      .catch(err => { console.error(err); setError(true) })
      .finally(() => setLoading(false))
  }

  // Mount-only fetch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAll() }, [])

  const filtered = query.trim()
    ? tasks.filter((t) =>
        t.title.toLowerCase().includes(query.toLowerCase()) ||
        (t.notes || '').toLowerCase().includes(query.toLowerCase())
      )
    : tasks

  // ── Selection ──

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setEditingId(null)
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((t) => t.id)))
    }
  }

  // ── Single-task actions ──

  async function handleDateSave(id, due_date) {
    try {
      await updateTask(id, { due_date })
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, due_date } : t))
    } catch (err) { console.error(err) }
  }

  async function handleDeleteConfirm() {
    const task = askDelete
    setAskDelete(null)
    if (!task) return
    try {
      await deleteTask(task.id)
      setTasks(prev => prev.filter(t => t.id !== task.id))
    } catch (err) { console.error(err) }
  }

  async function handleSnoozeToggle(task) {
    try {
      if (task.snooze_until) {
        await unsnoozeTask(task.id)
        setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, snooze_until: null, status: 'inbox' } : t))
      } else {
        // Snooze "long-term": push 30 days out so it leaves the active list
        const d = new Date(); d.setMonth(d.getMonth() + 1); d.setHours(0, 0, 0, 0)
        const snooze_until = d.toISOString()
        await snoozeTask(task.id, snooze_until)
        setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, snooze_until, status: 'snoozed' } : t))
      }
    } catch (err) { console.error(err) }
  }

  async function handleProjectPick(taskId, projectId) {
    try {
      await addTaskToProject(projectId, taskId)
    } catch (err) { console.error(err) }
    setProjectPickerId(null)
  }

  // ── Batch actions ──

  async function handleBatchSnooze() {
    const ids = [...selected]
    const allSnoozed = ids.every((id) => tasks.find((t) => t.id === id)?.snooze_until)
    try {
      if (allSnoozed) {
        await Promise.all(ids.map((id) => unsnoozeTask(id)))
        setTasks((prev) => prev.map((t) => selected.has(t.id) ? { ...t, snooze_until: null, status: 'inbox' } : t))
      } else {
        // Snooze "long-term": push 30 days out so it leaves the active list
        const d = new Date(); d.setMonth(d.getMonth() + 1); d.setHours(0, 0, 0, 0)
        const snooze_until = d.toISOString()
        await Promise.all(ids.map((id) => snoozeTask(id, snooze_until)))
        setTasks((prev) => prev.map((t) => selected.has(t.id) ? { ...t, snooze_until, status: 'snoozed' } : t))
      }
      setSelected(new Set())
    } catch (err) { console.error(err) }
  }

  async function handleBatchDate() {
    if (!batchDate) return
    const ids = [...selected]
    try {
      await Promise.all(ids.map((id) => updateTask(id, { due_date: batchDate })))
      setTasks((prev) => prev.map((t) => selected.has(t.id) ? { ...t, due_date: batchDate } : t))
      setSelected(new Set())
      setBatchDateMode(false)
      setBatchDate('')
    } catch (err) { console.error(err) }
  }

  const allSelected  = filtered.length > 0 && selected.size === filtered.length
  const batchVisible = selected.size >= 2

  return (
    <div className="aria-page">
      <ConfirmModal
        open={!!askDelete}
        emoji="🗑️"
        title="Delete this task?"
        body={askDelete ? `"${askDelete.title}" — gone for good. This can't be undone.` : ''}
        confirmLabel="Delete"
        cancelLabel="Keep it"
        onCancel={() => setAskDelete(null)}
        onConfirm={handleDeleteConfirm}
      />
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-2xl mx-auto w-full">

        <h1 className="text-2xl font-semibold text-ui-text mb-4">All Tasks</h1>

        {/* Search / filter */}
        <div className="mb-3">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter tasks…" />
        </div>

        {/* Select-all row */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between mb-2 px-1">
            <button onClick={toggleAll} className="text-xs text-ui-subtext hover:text-ui-accent transition-colors">
              {allSelected ? 'Deselect all' : `Select all (${filtered.length})`}
            </button>
            {selected.size > 0 && (
              <button onClick={() => setSelected(new Set())} className="text-xs text-ui-subtext/60 hover:opacity-70 transition-opacity">
                Clear selection
              </button>
            )}
          </div>
        )}

        {/* ── Sticky batch bubble bar ── */}
        {/* Shows when 2+ selected. Sticks 10px below the mobile header (h-14 = 56px → top-[66px]).
            On desktop sidebar layout there's no top header → top-[10px]. */}
        {batchVisible && (
          <div className="sticky top-[66px] md:top-[10px] z-30 -mx-4 px-4 py-2 bg-ui-nav/95 backdrop-blur-md border-b border-ui-border mb-3">
            <div className="max-w-2xl mx-auto space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={handleBatchSnooze}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
                >
                  <MoonIcon className="w-3.5 h-3.5" />
                  Snooze ({selected.size})
                </button>
                <button
                  onClick={() => { setBatchDateMode((v) => !v); setBatchDate('') }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    batchDateMode
                      ? 'bg-ui-accent text-white border-transparent'
                      : 'bg-ui-accent/20 text-ui-accent border-ui-accent/30 hover:bg-ui-accent/30'
                  }`}
                >
                  ◷ Date ({selected.size})
                </button>
              </div>
              {batchDateMode && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={batchDate}
                    onChange={(e) => setBatchDate(e.target.value)}
                    className="text-xs bg-ui-surface border border-ui-border rounded-lg px-2 py-1 text-ui-text focus:outline-none focus:border-ui-accent"
                    autoFocus
                  />
                  <button
                    onClick={handleBatchDate}
                    disabled={!batchDate}
                    className="text-xs text-ui-accent font-medium hover:opacity-70 transition-opacity disabled:opacity-40"
                  >
                    Set
                  </button>
                  <button
                    onClick={() => { setBatchDateMode(false); setBatchDate('') }}
                    className="text-xs text-ui-subtext/50 hover:opacity-70 transition-opacity"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Task list */}
        {loading ? (
          <InlineSkeletonCards />
        ) : error ? (
          <PageError onRetry={fetchAll} />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-ui-subtext px-1">
            {query ? `No results for "${query}"` : 'No active tasks'}
          </p>
        ) : (
          <Card className="px-4">
            {filtered.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selected={selected.has(task.id)}
                onToggle={toggleOne}
                onDateSave={handleDateSave}
                onSnoozeToggle={handleSnoozeToggle}
                isEditing={editingId === task.id}
                onStartEdit={(id) => { setEditingId(id); setProjectPickerId(null) }}
                onCancelEdit={() => setEditingId(null)}
                projects={projects}
                isProjectPicking={projectPickerId === task.id}
                onStartProjectPick={(id) => { setProjectPickerId(id); setEditingId(null) }}
                onCancelProjectPick={() => setProjectPickerId(null)}
                onProjectPick={handleProjectPick}
                onDelete={(t) => setAskDelete(t)}
              />
            ))}
          </Card>
        )}

        {tasks.length > 0 && (
          <p className="text-xs text-ui-subtext/50 mt-3 px-1 text-center">
            {query ? `${filtered.length} of ${tasks.length}` : `${tasks.length} total`}
          </p>
        )}

      </div>
    </div>
  )
}
