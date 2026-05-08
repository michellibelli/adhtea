import { api } from './client'

export const getTodayLog      = ()       => api.get('/self-care/today')
export const upsertLog        = (data)   => api.post('/self-care/log', data)
export const getLogHistory    = (days=7) => api.get(`/self-care/history?days=${days}`)
export const getTodayCapacity = ()       => api.get('/capacity/today')
export const getDailySummary  = ()       => api.get('/self-care/daily-summary')
