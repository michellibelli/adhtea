import { api, queueComplete, getPendingCompletes } from './client'

// Capture
export const createTask = (data) => api.post('/tasks', data)

// Lists
export const getInbox = () => api.get('/tasks/inbox')
export async function getToday() {
  const tasks = await api.get('/tasks/today')
  const pending = getPendingCompletes()
  if (!pending.length) return tasks
  return tasks.filter(t => !pending.includes(t.id))
}
export const getWaiting = () => api.get('/tasks/waiting')
export const getDoneToday = () => api.get('/tasks/done')

// Triage summary + low-focus critical list
export const getTriageSummary = () => api.get('/tasks/triage-summary')
export const getCriticalList  = () => api.get('/tasks/critical-list')
export const getBacklog       = () => api.get('/tasks/backlog')
export async function getBonusTasks() {
  const tasks = await api.get('/tasks/bonus')
  const pending = getPendingCompletes()
  if (!pending.length) return tasks
  return tasks.filter(t => !pending.includes(t.id))
}
export const searchTasks      = (q) => api.get(`/tasks/search?q=${encodeURIComponent(q)}`)

// Actions
export const scheduleToday = (id, meta = {}) => api.post(`/tasks/${id}/schedule-today`, meta)
export async function completeTask(id) {
  try {
    return await api.post(`/tasks/${id}/complete`)
  } catch {
    queueComplete(id)
  }
}
export const snoozeTask = (id, snooze_until) => api.post(`/tasks/${id}/snooze`, { snooze_until })
export const unsnoozeTask = (id) => api.post(`/tasks/${id}/unsnooze`)
export const deferTask = (id) => api.post(`/tasks/${id}/defer`)
export const updateTask = (id, data) => api.patch(`/tasks/${id}`, data)
export const deleteTask = (id) => api.delete(`/tasks/${id}`)
export const reorderTasks = (ordered_ids) => api.post('/tasks/reorder', { ordered_ids })

// Actuator categories
export const getActuatorCategories = () => api.get('/actuator-categories')
export const createActuatorCategory = (data) => api.post('/actuator-categories', data)
