import { useState, useEffect } from 'react'
import {
  listProjects, createProject, getProject,
  updateProject, generateProjectTasks, removeTaskFromProject,
} from '../api/projects'
import { createTask, completeTask } from '../api/tasks'
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
  const [addingTask,   setAddingTask]   = useState(false)

  const [editingTitle, setEditingTitle] = useState(null)
  const [editTitle,    setEditTitle]    = useState('')

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false))
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
    }
  }

  async function handleCreate() {
    if (!newForm.title.trim()) return
    setCreating(true)
    try {
      const p = await createProject(newForm.title, newForm.description || null)
      setProjects(prev => [{ ...p }, ...prev])
      setShowCreate(false)
      setExpanded(p.id)
      setDetail(prev => ({ ...prev, [p.id]: { ...p, tasks: [] } }))
      if (newForm.description.trim()) {
        setShowGenerate(p.id)
        setGenerateDesc(newForm.description)
      }
      setNewForm({ title: '', description: '' })
    } catch (err) { console.error(err) }
    finally { setCreating(false) }
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
      const due = tomorrow.toISOString().split('T')[0]
      const task = await createTask({ title: newTaskTitle.trim(), project_id: projectId, due_date: due })
      setDetail(prev => ({
        ...prev,
        [projectId]: { ...prev[projectId], tasks: [...(prev[projectId]?.tasks || []), task] },
      }))
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, task_count: p.task_count + 1 } : p
      ))
      setNewTaskTitle('')
      setShowAddTask(null)
    } catch (err) { console.error(err) }
    finally { setAddingTask(false) }
  }

  async function handleComplete(projectId, taskId) {
    try {
      await completeTask(taskId)
      setDetail(prev => ({
        ...prev,
        [projectId]: {
          ...prev[projectId],
          tasks: prev[projectId].tasks.map(t => t.id === taskId ? { ...t, status: 'done' } : t),
        },
      }))
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, done_count: p.done_count + 1 } : p
      ))
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
                        <p className="text-sm font-semibold text-ui-text leading-snug">{project.title}</p>
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

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-ui-border">

                    {!d && (
                      <p className="text-sm text-ui-subtext px-4 py-3">Loading…</p>
                    )}

                    {d && (
                      <>
                        {d.tasks.length === 0 && showGenerate !== project.id && showAddTask !== project.id && (
                          <p className="text-sm text-ui-subtext px-4 py-3">
                            No tasks yet — add some below.
                          </p>
                        )}

                        {/* Task rows */}
                        {d.tasks.map(task => (
                          <div
                            key={task.id}
                            className={`flex items-center gap-3 px-4 py-2.5 border-b border-ui-border/40 last:border-0 ${task.status === 'done' ? 'opacity-40' : ''}`}
                          >
                            <button
                              onClick={() => task.status !== 'done' && handleComplete(project.id, task.id)}
                              className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                task.status === 'done'
                                  ? 'bg-ui-accent border-ui-accent'
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

                            <button
                              onClick={() => handleRemove(project.id, task.id)}
                              className="flex-shrink-0 p-1 text-ui-subtext/25 hover:text-red-400 transition-colors"
                              title="Remove from project"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </div>
                        ))}

                        {/* Add task inline form */}
                        {showAddTask === project.id && (
                          <div className="px-4 py-3 border-b border-ui-border/40 flex gap-2">
                            <Input
                              value={newTaskTitle}
                              onChange={e => setNewTaskTitle(e.target.value)}
                              placeholder="Task title"
                              onKeyDown={e => e.key === 'Enter' && handleAddTask(project.id)}
                              autoFocus
                            />
                            <Button size="sm" onClick={() => handleAddTask(project.id)} disabled={!newTaskTitle.trim() || addingTask}>
                              {addingTask ? '…' : 'Add'}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setShowAddTask(null)}>✕</Button>
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

                        {/* Action links */}
                        <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <button
                            onClick={() => { setShowAddTask(project.id); setShowGenerate(null) }}
                            className="text-xs text-ui-accent hover:opacity-70 transition-opacity"
                          >
                            + Add task
                          </button>
                          <span className="text-ui-border text-xs">·</span>
                          <button
                            onClick={() => { setShowGenerate(project.id); setShowAddTask(null); setGenerateDesc(''); setGenError(null) }}
                            className="text-xs text-ui-accent hover:opacity-70 transition-opacity"
                          >
                            ✦ Generate more
                          </button>
                          <span className="text-ui-border text-xs">·</span>
                          <button
                            onClick={() => handleArchive(project.id)}
                            className="text-xs text-ui-subtext/40 hover:text-ui-subtext transition-colors"
                          >
                            Archive
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>

      </div>
    </div>
  )
}
