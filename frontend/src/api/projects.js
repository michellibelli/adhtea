import { api } from './client'

export const listProjects             = ()                   => api.get('/projects')
export const createProject            = (title, description) => api.post('/projects', { title, description })
export const getProject               = (id)                 => api.get(`/projects/${id}`)
export const updateProject            = (id, patch)          => api.patch(`/projects/${id}`, patch)
export const deleteProject            = (id)                 => api.delete(`/projects/${id}`)
export const generateProjectTasks     = (id, description)    => api.post(`/projects/${id}/generate`, { description })
export const addTaskToProject         = (projectId, taskId)  => api.post(`/projects/${projectId}/tasks/${taskId}`, {})
export const removeTaskFromProject    = (projectId, taskId)  => api.delete(`/projects/${projectId}/tasks/${taskId}`)
