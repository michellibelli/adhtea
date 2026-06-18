import { api } from './client'

export const computeWeekly = () => api.post('/insights/compute-weekly')
export const getWeekly     = () => api.get('/insights/weekly')
export const getNudge      = () => api.get('/insights/nudge')
export const respondNudge  = (id, response) =>
  api.post(`/insights/nudge/${id}/respond`, { response })
