import { api, queueComplete, removeComplete, getPendingCompletes, queueSnooze, removeSnooze, getPendingSnoozes } from './client'

// Capture
export const createTask = (data) => api.post('/tasks', data)

// Lists
export async function getInbox() {
  const tasks = await api.get('/tasks/inbox')
  const pendingC = getPendingCompletes()
  const pendingS = getPendingSnoozes().map(s => s.id)
  const exclude = [...pendingC, ...pendingS]
  if (!exclude.length) return tasks
  return tasks.filter(t => !exclude.includes(t.id))
}
export async function getToday() {
  const tasks = await api.get('/tasks/today')
  const pendingC = getPendingCompletes()
  const pendingS = getPendingSnoozes().map(s => s.id)
  const exclude = [...pendingC, ...pendingS]
  if (!exclude.length) return tasks
  return tasks.filter(t => !exclude.includes(t.id))
}
export const getWaiting = () => api.get('/tasks/waiting')
export const getDoneToday = () => api.get('/tasks/done')

// Low-focus critical list
export const getCriticalList  = () => api.get('/tasks/critical-list')
export const getBacklog       = () => api.get('/tasks/backlog')
export async function getBonusTasks() {
  const tasks = await api.get('/tasks/bonus')
  const pendingC = getPendingCompletes()
  const pendingS = getPendingSnoozes().map(s => s.id)
  const exclude = [...pendingC, ...pendingS]
  if (!exclude.length) return tasks
  return tasks.filter(t => !exclude.includes(t.id))
}
export const searchTasks      = (q) => api.get(`/tasks/search?q=${encodeURIComponent(q)}`)

// Actions
export const scheduleToday = (id, meta = {}) => api.post(`/tasks/${id}/schedule-today`, meta)
export const planDay = () => api.post('/tasks/plan-day')
export async function completeTask(id) {
  queueComplete(id)
  try {
    const result = await api.post(`/tasks/${id}/complete`)
    removeComplete(id)
    return result
  } catch {
    // already queued — will flush later
  }
}
export async function snoozeTask(id, snooze_until) {
  queueSnooze(id, snooze_until)
  try {
    const result = await api.post(`/tasks/${id}/snooze`, { snooze_until })
    removeSnooze(id)
    return result
  } catch {
    // already queued — will flush later
  }
}
export const unsnoozeTask = (id) => api.post(`/tasks/${id}/unsnooze`)
export const deferTask = (id) => api.post(`/tasks/${id}/defer`)
export const updateTask = (id, data) => api.patch(`/tasks/${id}`, data)
export const deleteTask = (id) => api.delete(`/tasks/${id}`)
// manual_box: set by a tea-box drag — hands the day to her manual order.
export const reorderTasks = (ordered_ids, manual_box = false) =>
  api.post('/tasks/reorder', { ordered_ids, manual_box })

// Actuator categories
export const getActuatorCategories = () => api.get('/actuator-categories')
export const createActuatorCategory = (data) => api.post('/actuator-categories', data)
