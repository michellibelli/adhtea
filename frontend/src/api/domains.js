import { api } from './client'

export const listDomains   = ()         => api.get('/domains')
export const createDomain  = (data)     => api.post('/domains', data)
export const updateDomain  = (id, data) => api.patch(`/domains/${id}`, data)
export const deleteDomain  = (id)       => api.delete(`/domains/${id}`)
