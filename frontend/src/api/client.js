// Base API client — handles auth headers, error normalization, and token storage.

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const TOKEN_KEY = 'aria_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function isLoggedIn() {
  return !!getToken()
}

async function request(method, path, body = undefined, isForm = false) {
  const token = getToken()
  const headers = {}
  if (!isForm) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    clearToken()
    window.location.reload()
    return
  }

  if (!res.ok) {
    let detail = `Request failed: ${res.status}`
    try {
      const err = await res.json()
      detail = err.detail || detail
    } catch (_) {}
    throw new Error(detail)
  }

  if (res.status === 204) return null
  return res.json()
}

export const api = {
  get:      (path)       => request('GET',    path),
  post:     (path, body) => request('POST',   path, body),
  patch:    (path, body) => request('PATCH',  path, body),
  delete:   (path)       => request('DELETE', path),
  postForm: (path, form) => request('POST',   path, form, true),
}
