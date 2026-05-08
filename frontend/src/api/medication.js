import { api } from './client'

export const getMedication        = ()         => api.get('/medication')
export const createMedication     = (data)     => api.post('/medication', data)
export const updateMedication     = (id, data) => api.patch(`/medication/${id}`, data)
export const deleteMedication     = (id)       => api.delete(`/medication/${id}`)
export const logMedicationTaken   = (id)       => api.post(`/medication/${id}/log`)
export const getMedicationTodayLog = (id)      => api.get(`/medication/${id}/log/today`)
