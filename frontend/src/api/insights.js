import { api } from './client'

export const computeWeekly = () => api.post('/insights/compute-weekly')
export const getWeekly     = () => api.get('/insights/weekly')
