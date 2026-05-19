import { api } from './client'

// R1–R3 triage endpoints. Bin-pack planning + pinning live here.
// preview returns the proposed layout without persisting; run applies it.
export const previewTriage   = () => api.post('/triage/preview')
export const runTriage       = () => api.post('/triage/run')
export const recomputeTriage = () => api.post('/triage/recompute')

// Pin/unpin: bin-pack respects pinned_for over its score-driven placement.
export const pinTask   = (taskId, isoDate) => api.post(`/triage/tasks/${taskId}/pin`, { date: isoDate })
export const unpinTask = (taskId)          => api.delete(`/triage/tasks/${taskId}/pin`)
