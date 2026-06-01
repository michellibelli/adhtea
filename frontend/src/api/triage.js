import { api } from './client'

// R1–R3 triage endpoints. Bin-pack planning + pinning live here.
// preview returns the proposed layout without persisting; run applies it.
export const previewTriage   = () => api.post('/triage/preview')
export const runTriage       = () => api.post('/triage/run')
export const recomputeTriage = () => api.post('/triage/recompute')

// Pin/unpin: bin-pack respects pinned_for over its score-driven placement.
export const pinTask   = (taskId, isoDate) => api.post(`/triage/tasks/${taskId}/pin`, { date: isoDate })
export const unpinTask = (taskId)          => api.delete(`/triage/tasks/${taskId}/pin`)

// New triage flow: user-ordered list + overflow resolution.
export const applyOrderedTriage = (ordered_ids) =>
  api.post('/triage/apply-ordered', { ordered_task_ids: ordered_ids })
export const resolveOverflow = (keep_today_ids, bump_ids) =>
  api.post('/triage/resolve-overflow', { keep_today_ids, bump_ids })
