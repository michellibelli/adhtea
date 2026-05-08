import { api, setToken, clearToken } from './client'

export async function login(username, password) {
  const res = await api.post('/login', { username, password })
  setToken(res.token)
  return res
}

export async function logout() {
  try {
    await api.post('/logout')
  } finally {
    clearToken()
  }
}

export async function setup(name, username, password) {
  const res = await api.post('/setup', { name, username, password })
  setToken(res.token)
  return res
}

export async function getMe() {
  return api.get('/me')
}

export async function updateSettings(settings) {
  return api.patch('/me/settings', settings)
}
