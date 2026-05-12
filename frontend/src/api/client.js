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

const RETRY_DELAYS = [5000, 10000, 15000]  // ms between retries while Render wakes

function emit(name) {
  window.dispatchEvent(new CustomEvent(name))
}

async function request(method, path, body = undefined, isForm = false, attempt = 0) {
  const token = getToken()
  const headers = {}
  if (!isForm) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (_) {
    // Network error — backend likely sleeping (Render cold start)
    if (attempt < RETRY_DELAYS.length) {
      emit('api:sleeping')
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]))
      return request(method, path, body, isForm, attempt + 1)
    }
    emit('api:awake')  // give up, let caller handle
    throw new Error('Server unreachable — try again in a moment.')
  }

  if (attempt > 0) emit('api:awake')  // recovered after sleeping

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
