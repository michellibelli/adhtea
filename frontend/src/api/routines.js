import { api } from './client'

export const getRoutines      = ()         => api.get('/routines')
export const createRoutine    = (data)     => api.post('/routines', data)
export const updateRoutine    = (id, data) => api.patch(`/routines/${id}`, data)
export const deleteRoutine    = (id)       => api.delete(`/routines/${id}`)
export const getMissedRoutines = ()        => api.get('/routines/missed')
