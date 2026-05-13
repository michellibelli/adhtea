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

export async function listUsers() {
  return api.get('/users')
}

export async function createUser(name, username, password) {
  return api.post('/users', { name, username, password })
}

export async function deleteUser(id) {
  return api.delete(`/users/${id}`)
}

export async function register(invite_token, name, username, password) {
  const res = await api.post('/register', { invite_token, name, username, password })
  setToken(res.token)
  return res
}

export async function createInvite() {
  return api.post('/invites')
}

export async function listInvites() {
  return api.get('/invites')
}

export async function revokeInvite(token) {
  return api.delete(`/invites/${token}`)
}
