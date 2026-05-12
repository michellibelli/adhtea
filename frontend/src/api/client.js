// Base API client — handles auth headers, error normalization, and token storage.

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const TOKEN_KEY = 'aria_token'
const LAST_SUCCESS_KEY = 'aria_last_api_success'
const SLEEP_THRESHOLD_MS = 14 * 60 * 1000  // Render sleeps after 15 min idle

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

function getLastSuccess() {
  return parseInt(localStorage.getItem(LAST_SUCCESS_KEY) || '0', 10)
}

function markSuccess() {
  localStorage.setItem(LAST_SUCCESS_KEY, Date.now().toString())
}

export function likelySleeping() {
  const last = getLastSuccess()
  if (!last) return true  // never connected — assume cold
  return Date.now() - last >= SLEEP_THRESHOLD_MS
}

// Proactive wake — call before app init if likelySleeping().
// onLog(msg) fires for each status update. Resolves when server responds or gives up.
export async function warmUp(onLog) {
  const delays = [5000, 8000, 12000]
  onLog('Checking server...')
  for (let i = 0; i <= delays.length; i++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 4000)
      const res = await fetch(`${BASE_URL}/health`, { signal: controller.signal })
      clearTimeout(timer)
      if (res.ok) {
        markSuccess()
        onLog('Connected! Loading your app...')
        return true
      }
    } catch (_) { /* sleeping */ }

    if (i < delays.length) {
      onLog(`Server napping — waking it up... (attempt ${i + 2})`)
      await new Promise(r => setTimeout(r, delays[i]))
    }
  }
  onLog('Server slow to respond — loading anyway...')
  return false
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

  markSuccess()
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
