import { api } from './client'

export const getGcalStatus    = ()  => api.get('/gcal/status')
export const getGcalConnectUrl = () => api.get('/gcal/connect')
export const disconnectGcal   = ()  => api.delete('/gcal/disconnect')
export const syncGcal         = ()  => api.post('/gcal/sync')
export const listCalendars    = ()  => api.get('/gcal/calendars')
export const updateCalendars  = (ids) => api.patch('/gcal/calendars', { calendar_ids: ids })
