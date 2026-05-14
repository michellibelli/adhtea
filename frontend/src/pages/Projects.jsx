import { useState, useEffect } from 'react'
import {
  DndContext, closestCenter, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { SmartPointerSensor } from '../utils/dnd'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  listProjects, createProject, getProject,
  updateProject, generateProjectTasks, removeTaskFromProject,
} from '../api/projects'
import { createTask, completeTask, reorderTasks, updateTask } from '../api/tasks'
import { listDomains, createDomain } from '../api/domains'
import DomainPicker from '../components/DomainPicker'

function fmtDate(iso) {
  if (!iso) return null
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
import Card from '../components/Card'
import Button from '../components/Button'
import { Input, Textarea } from '../components/Input'

function ProgressBar({ done, total }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-[10px] text-ui-subtext mb-1">
        <span>{done}/{total} done</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-ui-border overflow-hidden">
        <div
          className="h-full rounded-full bg-ui-accent transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function DragHandle(props) {
  return (
    <button
      {...props}
      className="flex-shrink-0 text-ui-subtext/25 hover:text-ui-subtext transition-colors cursor-grab active:cursor-grabbing touch-none p-0.5"
      tabIndex={-1}
    >
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
        <circle cx="5" cy="4"  r="1.2"/><circle cx="11" cy="4"  r="1.2"/>
        <circle cx="5" cy="8"  r="1.2"/><circle cx="11" cy="8"  r="1.2"/>
        <circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
      </svg>
    </button>
  )
}

function SortableTaskRow({ task, projectId, onComplete, onRemove, onUpdate, selected, onToggleSelect }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const [editing, setEditing]     = useState(false)
  const [localTitle, setLocalTitle] = useState(task.title)
  const [localDate,  setLocalDate]  = useState(task.due_date || '')

  function startEdit() { setLocalTitle(task.title); setLocalDate(task.due_date || ''); setEditing(true) }
  function cancelEdit() { setEditing(false) }
  function saveEdit() {
    if (localTitle.trim()) onUpdate(projectId, task.id, { title: localTitle.trim(), due_date: localDate || null })
    setEditing(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`border-b border-ui-border/40 last:border-0 ${task.status === 'done' ? 'opacity-40' : ''}`}
    >
      {editing ? (
        <div className="flex flex-col gap-2 px-4 py-3">
          <input
            value={localTitle}
            onChange={e => setLocalTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
            autoFocus
            className="w-full text-sm bg-ui-input border border-ui-input-border rounded-lg px-3 py-1.5 text-ui-text outline-none focus:border-ui-input-focus transition-colors"
          />
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={localDate}
              onChange={e => setLocalDate(e.target.value)}
              className="text-xs bg-ui-input border border-ui-input-border rounded-lg px-2 py-1.5 text-ui-text outline-none focus:border-ui-input-focus transition-colors"
            />
            <button onClick={saveEdit} className="text-xs text-ui-accent font-medium hover:opacity-70 transition-opacity">Save</button>
            <button onClick={cancelEdit} className="text-xs text-ui-subtext/50 hover:opacity-70 transition-opacity">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-2.5">
          <DragHandle {...attributes} {...listeners} />

          {/* Multi-select checkbox */}
          <button
            onClick={() => onToggleSelect(task.id)}
            className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
              selected ? 'bg-ui-accent border-ui-accent' : 'border-ui-border hover:border-ui-accent'
            }`}
          >
            {selected && (
              <svg viewBox="0 0 10 8" fill="none" stroke="white" strokeWidth={2.5} className="w-2 h-2">
                <polyline points="1 4 3.5 6.5 9 1"/>
              </svg>
            )}
          </button>

          {/* Complete / uncomplete circle */}
          <button
            onClick={() => onComplete(projectId, task.id)}
            className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
              task.status === 'done'
                ? 'bg-ui-accent border-ui-accent hover:opacity-70'
                : 'border-ui-accent/50 hover:border-ui-accent active:scale-90'
            }`}
          >
            {task.status === 'done' && (
              <svg viewBox="0 0 12 10" fill="none" stroke="white" strokeWidth={2.5} className="w-2.5 h-2.5">
                <polyline points="1 5 4.5 8.5 11 1"/>
              </svg>
            )}
          </button>

          <div className="flex-1 min-w-0">
            <p className={`text-sm text-ui-text leading-snug ${task.status === 'done' ? 'line-through' : ''}`}>
              {task.title}
            </p>
            {task.due_date && (
              <p className="text-[10px] text-ui-subtext mt-0.5">{task.due_date}</p>
            )}
          </div>

          <button onClick={startEdit} className="flex-shrink-0 p-1 text-ui-subtext/25 hover:text-ui-subtext transition-colors" title="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>

          <button onClick={() => onRemove(projectId, task.id)} className="flex-shrink-0 p-1 text-ui-subtext/25 hover:text-red-400 transition-colors" title="Remove">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

function SortableTaskList({ tasks, projectId, onReorder, onComplete, onRemove, onUpdate, selected, onToggleSelect }) {
  const sensors = useSensors(
    useSensor(SmartPointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,        { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const oldIndex = tasks.findIndex(t => t.id === active.id)
    const newIndex = tasks.findIndex(t => t.id === over.id)
    // Swap date slots: the date at each position stays, tasks move into new positions
    const dateSlots = tasks.map(t => t.due_date)
    const reordered = arrayMove(tasks, oldIndex, newIndex).map((t, i) => ({ ...t, due_date: dateSlots[i] }))
    onReorder(projectId, reordered)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        {tasks.map(task => (
          <SortableTaskRow
            key={task.id}
            task={task}
            projectId={projectId}
            onComplete={onComplete}
            onRemove={onRemove}
            onUpdate={onUpdate}
            selected={selected.has(task.id)}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </SortableContext>
    </DndContext>
  )
}

export default function Projects({ onNavigate }) {
  const [projects,  setProjects]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [expanded,  setExpanded]  = useState(null)
  const [detail,    setDetail]    = useState({})

  const [showCreate, setShowCreate] = useState(false)
  const [newForm,    setNewForm]    = useState({ title: '', description: '' })
  const [creating,   setCreating]   = useState(false)

  const [showGenerate, setShowGenerate] = useState(null)
  const [generateDesc, setGenerateDesc] = useState('')
  const [generating,   setGenerating]   = useState(false)
  const [genError,     setGenError]     = useState(null)

  const [showAddTask,  setShowAddTask]  = useState(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDue,   setNewTaskDue]   = useState('')
  const [newTaskSize,  setNewTaskSize]  = useState('medium')
  const [addingTask,   setAddingTask]   = useState(false)

  const [editingTitle, setEditingTitle] = useState(null)
  const [editTitle,    setEditTitle]    = useState('')

  const [selected,      setSelected]      = useState(new Set())
  const [batchDateMode, setBatchDateMode] = useState(false)
  const [batchDate,     setBatchDate]     = useState('')

  const [domains,      setDomains]      = useState([])
  const [newDomainId,  setNewDomainId]  = useState(null)

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false))
    listDomains().then(setDomains).catch(console.error)
  }, [])

  async function loadDetail(id) {
    try {
      const d = await getProject(id)
      setDetail(prev => ({ ...prev, [id]: d }))
    } catch (err) { console.error(err) }
  }

  function toggleExpand(id) {
    if (expanded === id) {
      setExpanded(null)
    } else {
      setExpanded(id)
      if (!detail[id]) loadDetail(id)
      setSelected(new Set())
      setBatchDateMode(false)
    }
  }

  function toggleSelect(taskId) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(taskId) ? next.delete(taskId) : next.add(taskId)
      return next
    })
  }

  async function handleCreate() {
    if (!newForm.title.trim()) return
    setCreating(true)
    try {
      const p = await createProject(newForm.title, newForm.description || null, newDomainId)
      setProjects(prev => [{ ...p }, ...prev])
      setShowCreate(false)
      setExpanded(p.id)
      setDetail(prev => ({ ...prev, [p.id]: { ...p, tasks: [] } }))
      if (newForm.description.trim()) {
        setShowGenerate(p.id)
        setGenerateDesc(newForm.description)
      }
      setNewForm({ title: '', description: '' })
      setNewDomainId(null)
    } catch (err) { console.error(err) }
    finally { setCreating(false) }
  }

  async function handleSetProjectDomain(projectId, domainId) {
    try {
      const updated = await updateProject(projectId, { domain_id: domainId })
      setProjects(prev => prev.map(p => p.id === projectId
        ? { ...p, domain_id: updated.domain_id, domain_name: updated.domain_name }
        : p
      ))
    } catch (err) { console.error(err) }
  }

  async function handleGenerate(projectId) {
    if (!generateDesc.trim()) return
    setGenerating(true)
    setGenError(null)
    try {
      const newTasks = await generateProjectTasks(projectId, generateDesc)
      setDetail(prev => ({
        ...prev,
        [projectId]: { ...prev[projectId], tasks: [...(prev[projectId]?.tasks || []), ...newTasks] },
      }))
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, task_count: p.task_count + newTasks.length } : p
      ))
      setShowGenerate(null)
      setGenerateDesc('')
    } catch (err) {
      setGenError(err.message || 'Generation failed — check API key or try again')
    } finally { setGenerating(false) }
  }

  async function handleAddTask(projectId) {
    if (!newTaskTitle.trim()) return
    setAddingTask(true)
    try {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const due = newTaskDue || tomorrow.toISOString().split('T')[0]
      const weight = newTaskSize === 'small' ? 'light' : newTaskSize === 'large' ? 'heavy' : 'medium'
      const task = await createTask({ title: newTaskTitle.trim(), project_id: projectId, due_date: due, weight })
      setDetail(prev => ({
        ...prev,
        [projectId]: { ...prev[projectId], tasks: [...(prev[projectId]?.tasks || []), task] },
      }))
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, task_count: p.task_count + 1 } : p
      ))
      setNewTaskTitle('')
      setNewTaskDue('')
      setNewTaskSize('medium')
      setShowAddTask(null)
    } catch (err) { console.error(err) }
    finally { setAddingTask(false) }
  }

  async function handleComplete(projectId, taskId) {
    const task = detail[projectId]?.tasks.find(t => t.id === taskId)
    if (!task) return
    const isUndo = task.status === 'done'
    try {
      if (isUndo) {
        await updateTask(taskId, { status: 'inbox' })
      } else {
        await completeTask(taskId)
      }
      setDetail(prev => ({
        ...prev,
        [projectId]: {
          ...prev[projectId],
          tasks: prev[projectId].tasks.map(t =>
            t.id === taskId ? { ...t, status: isUndo ? 'inbox' : 'done' } : t
          ),
        },
      }))
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, done_count: p.done_count + (isUndo ? -1 : 1) } : p
      ))
    } catch (err) { console.error(err) }
  }

  async function handleBatchDate() {
    if (!batchDate) return
    const ids = [...selected]
    try {
      await Promise.all(ids.map(id => updateTask(id, { due_date: batchDate })))
      if (expanded) {
        setDetail(prev => ({
          ...prev,
          [expanded]: {
            ...prev[expanded],
            tasks: prev[expanded].tasks.map(t =>
              selected.has(t.id) ? { ...t, due_date: batchDate } : t
            ),
          },
        }))
      }
      setSelected(new Set())
      setBatchDateMode(false)
      setBatchDate('')
    } catch (err) { console.error(err) }
  }

  async function handleRemove(projectId, taskId) {
    try {
      await removeTaskFromProject(projectId, taskId)
      setDetail(prev => ({
        ...prev,
        [projectId]: {
          ...prev[projectId],
          tasks: prev[projectId].tasks.filter(t => t.id !== taskId),
        },
      }))
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, task_count: Math.max(0, p.task_count - 1) } : p
      ))
    } catch (err) { console.error(err) }
  }

  async function handleSaveTitle(projectId) {
    if (!editTitle.trim()) return
    try {
      const updated = await updateProject(projectId, { title: editTitle.trim() })
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, title: updated.title } : p))
      setEditingTitle(null)
    } catch (err) { console.error(err) }
  }

  async function handleUpdateProjectTask(projectId, taskId, patch) {
    try {
      await updateTask(taskId, patch)
      setDetail(prev => ({
        ...prev,
        [projectId]: {
          ...prev[projectId],
          tasks: prev[projectId].tasks.map(t => t.id === taskId ? { ...t, ...patch } : t),
        },
      }))
    } catch (err) { console.error(err) }
  }

  async function handleProjectReorder(projectId, updatedTasks) {
    const original = detail[projectId]?.tasks || []
    setDetail(prev => ({ ...prev, [projectId]: { ...prev[projectId], tasks: updatedTasks } }))
    await reorderTasks(updatedTasks.map(t => t.id))
    const taskMap = Object.fromEntries(original.map(t => [t.id, t]))
    const changed = updatedTasks.filter(t => taskMap[t.id]?.due_date !== t.due_date)
    if (changed.length) await Promise.all(changed.map(t => updateTask(t.id, { due_date: t.due_date })))
  }

  async function handleArchive(projectId) {
    try {
      await updateProject(projectId, { status: 'archived' })
      setProjects(prev => prev.filter(p => p.id !== projectId))
      if (expanded === projectId) setExpanded(null)
    } catch (err) { console.error(err) }
  }

  if (loading) {
    return (
      <div className="aria-page flex items-center justify-center">
        <p className="text-sm text-ui-subtext">Loading…</p>
      </div>
    )
  }

  return (
    <div className="aria-page">
      <div className="px-4 pt-8 pb-32 md:pb-8 md:pl-28 max-w-2xl mx-auto w-full">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-ui-text">Projects</h1>
          <Button size="sm" onClick={() => { setShowCreate(!showCreate); setNewForm({ title: '', description: '' }) }}>
            {showCreate ? 'Cancel' : '+ New'}
          </Button>
        </div>

        {/* Create form */}
        {showCreate && (
          <Card className="px-4 py-4 mb-4 space-y-3">
            <Input
              value={newForm.title}
              onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Project name"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <Textarea
              value={newForm.description}
              onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="Describe the project — AI will generate tasks from this (optional)"
            />
            <DomainPicker
              domains={domains}
              value={newDomainId}
              onChange={setNewDomainId}
              onCreate={d => setDomains(prev => [...prev, d])}
            />
            <Button onClick={handleCreate} disabled={!newForm.title.trim() || creating}>
              {creating
                ? 'Creating…'
                : newForm.description.trim()
                  ? 'Create & Generate Tasks'
                  : 'Create Project'}
            </Button>
          </Card>
        )}

        {/* Empty state */}
        {projects.length === 0 && !showCreate && (
          <Card className="mt-16 text-center px-8 py-12">
            <div className="text-4xl mb-4">🌱</div>
            <p className="text-base font-medium text-ui-text mb-2">No projects yet</p>
            <p className="text-sm text-ui-subtext mb-6">Create a project and let AI break it into daily tasks.</p>
            <Button onClick={() => setShowCreate(true)}>+ New Project</Button>
          </Card>
        )}

        {/* Project cards */}
        <div className="space-y-3">
          {projects.map(project => {
            const isExpanded = expanded === project.id
            const d = detail[project.id]

            return (
              <Card key={project.id} className="overflow-hidden">

                {/* Project header row */}
                <div className="px-4 py-3.5">
                  <div className="flex items-start gap-2">

                    {editingTitle === project.id ? (
                      <div className="flex-1 flex gap-2">
                        <Input
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleSaveTitle(project.id)
                            if (e.key === 'Escape') setEditingTitle(null)
                          }}
                          autoFocus
                        />
                        <Button size="sm" onClick={() => handleSaveTitle(project.id)}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingTitle(null)}>✕</Button>
                      </div>
                    ) : (
                      <button className="flex-1 text-left min-w-0" onClick={() => toggleExpand(project.id)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-ui-text leading-snug">{project.title}</p>
                          {project.domain_name && (
                            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-ui-accent/15 text-ui-accent font-semibold">
                              {project.domain_name}
                            </span>
                          )}
                        </div>
                        <ProgressBar done={project.done_count} total={project.task_count} />
                      </button>
                    )}

                    {editingTitle !== project.id && (
                      <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
                        <button
                          onClick={() => { setEditingTitle(project.id); setEditTitle(project.title) }}
                          className="p-1 text-ui-subtext/30 hover:text-ui-subtext transition-colors"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => toggleExpand(project.id)}
                          className="p-1 text-ui-subtext/50 transition-colors text-xs"
                        >
                          {isExpanded ? '▾' : '▸'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded content (animated open/close via grid-rows trick) */}
                <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden">
                  <div className="border-t border-ui-border">

                    {!d && isExpanded && (
                      <p className="text-sm text-ui-subtext px-4 py-3">Loading…</p>
                    )}

                    {d && (
                      <>
                        {/* Domain selector — change at any time */}
                        <div className="px-4 py-3 border-b border-ui-border/40">
                          <DomainPicker
                            domains={domains}
                            value={project.domain_id}
                            onChange={(id) => handleSetProjectDomain(project.id, id)}
                            onCreate={d => {
                              setDomains(prev => [...prev, d])
                              handleSetProjectDomain(project.id, d.id)
                            }}
                          />
                        </div>

                        {d.tasks.length === 0 && showGenerate !== project.id && showAddTask !== project.id && (
                          <p className="text-sm text-ui-subtext px-4 py-3">
                            No tasks yet — add some below.
                          </p>
                        )}

                        {/* Batch bar — shown when 2+ selected */}
                        {selected.size >= 2 && expanded === project.id && (
                          <div className="sticky top-[66px] md:top-[10px] z-30 px-4 py-2 bg-ui-nav/95 backdrop-blur-md border-b border-ui-border space-y-2">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => { setBatchDateMode(v => !v); setBatchDate('') }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                  batchDateMode
                                    ? 'bg-ui-accent text-white border-transparent'
                                    : 'bg-ui-accent/20 text-ui-accent border-ui-accent/30 hover:bg-ui-accent/30'
                                }`}
                              >
                                ◷ Set date ({selected.size})
                              </button>
                              <button
                                onClick={() => { setSelected(new Set()); setBatchDateMode(false) }}
                                className="text-xs text-ui-subtext/60 hover:opacity-70 transition-opacity"
                              >
                                Clear
                              </button>
                            </div>
                            {batchDateMode && (
                              <div className="flex items-center gap-2">
                                <input
                                  type="date"
                                  value={batchDate}
                                  onChange={e => setBatchDate(e.target.value)}
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
                        )}

                        {/* Sortable task rows */}
                        {d.tasks.length > 0 && (
                          <SortableTaskList
                            tasks={d.tasks}
                            projectId={project.id}
                            onReorder={handleProjectReorder}
                            onComplete={handleComplete}
                            onRemove={handleRemove}
                            onUpdate={handleUpdateProjectTask}
                            selected={selected}
                            onToggleSelect={toggleSelect}
                          />
                        )}

                        {/* Add task form */}
                        {showAddTask === project.id && (
                          <div className="px-4 py-3 border-b border-ui-border/40 space-y-2">
                            <Input
                              value={newTaskTitle}
                              onChange={e => setNewTaskTitle(e.target.value)}
                              placeholder="Task title"
                              onKeyDown={e => e.key === 'Enter' && handleAddTask(project.id)}
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <Input
                                type="date"
                                value={newTaskDue}
                                onChange={e => setNewTaskDue(e.target.value)}
                                className="flex-1"
                              />
                              <div className="flex gap-1">
                                {[['small','Light'],['medium','Med'],['large','Heavy']].map(([val, lbl]) => (
                                  <button
                                    key={val}
                                    type="button"
                                    onClick={() => setNewTaskSize(val)}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                      newTaskSize === val
                                        ? 'bg-ui-primary text-ui-primary-text border-transparent'
                                        : 'border-ui-border text-ui-subtext hover:text-ui-accent'
                                    }`}
                                  >
                                    {lbl}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleAddTask(project.id)} disabled={!newTaskTitle.trim() || addingTask}>
                                {addingTask ? '…' : 'Add task'}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setShowAddTask(null); setNewTaskTitle(''); setNewTaskDue(''); setNewTaskSize('medium') }}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Generate inline form */}
                        {showGenerate === project.id && (
                          <div className="px-4 py-3 border-b border-ui-border/40 space-y-2">
                            <Textarea
                              value={generateDesc}
                              onChange={e => setGenerateDesc(e.target.value)}
                              rows={2}
                              placeholder="Describe what still needs doing — AI will generate tasks…"
                              autoFocus
                            />
                            {genError && <p className="text-xs text-red-400">{genError}</p>}
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleGenerate(project.id)} disabled={!generateDesc.trim() || generating}>
                                {generating ? 'Generating…' : 'Generate tasks'}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setShowGenerate(null); setGenError(null) }}>Cancel</Button>
                            </div>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="px-4 py-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => { setShowAddTask(project.id === showAddTask ? null : project.id); setShowGenerate(null) }}
                          >
                            + Task 🛠️
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => { setShowGenerate(project.id === showGenerate ? null : project.id); setShowAddTask(null); setGenerateDesc(''); setGenError(null) }}
                          >
                            + Task <span className="sparkle" style={{animationDuration:'1.4s'}}>✨</span>
                          </Button>
                          <button
                            onClick={() => handleArchive(project.id)}
                            className="px-2.5 py-1 text-xs text-ui-subtext/40 hover:text-ui-subtext transition-colors"
                          >
                            Archive
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>

      </div>
    </div>
  )
}
