// Base API client — handles auth headers, error normalization, and token storage.

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const TOKEN_KEY = 'aria_token'
const LAST_SUCCESS_KEY = 'aria_last_api_success'
const SLEEP_THRESHOLD_MS = 10 * 60 * 1000  // Render sleeps after 15 min; check at 10

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
  if (import.meta.env.DEV) return true
  return !!getToken()
}

function getLastSuccess() {
  return parseInt(localStorage.getItem(LAST_SUCCESS_KEY) || '0', 10)
}

function markSuccess() {
  localStorage.setItem(LAST_SUCCESS_KEY, Date.now().toString())
  window.dispatchEvent(new Event('aria:server-awake'))
}

export function likelySleeping() {
  const last = getLastSuccess()
  if (!last) return true  // never connected — assume cold
  return Date.now() - last >= SLEEP_THRESHOLD_MS
}

// How long to wait between each retry when waking the server (milliseconds).
// Render.com free tier spins down after 15 minutes of inactivity; spin-up
// typically takes 30-45 seconds, so 8 retries × 5s = 40s total wait time.
const WARMUP_RETRY_DELAY_MS = 5000

// Proactive wake — call before app init if likelySleeping().
// onLog(msg) fires for each status update. Resolves when server responds or gives up.
// The _warmUpPromise guard prevents multiple simultaneous wake attempts.
let _warmUpPromise = null

export async function warmUp(onLog) {
  if (_warmUpPromise) return _warmUpPromise
  _warmUpPromise = _doWarmUp(onLog).finally(() => { _warmUpPromise = null })
  return _warmUpPromise
}

async function _doWarmUp(onLog) {
  const delays = Array(8).fill(WARMUP_RETRY_DELAY_MS)
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

async function rawRequest(method, path, body, isForm) {
  const token = getToken()
  const headers = {}
  if (!isForm) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

  const opts = {
    method,
    headers,
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
  }

  const res = await fetch(`${BASE_URL}${path}`, opts)

  if (res.status === 401) {
    if (import.meta.env.DEV) throw new Error('Auth required (dev mode — skipping reload)')
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

async function request(method, path, body = undefined, isForm = false) {
  try {
    return await rawRequest(method, path, body, isForm)
  } catch (err) {
    if (!likelySleeping()) throw err
    await warmUp(() => {})
    return rawRequest(method, path, body, isForm)
  }
}

// ---------------------------------------------------------------------------
// Offline-resilient completion queue
// Stores task IDs that were completed locally but failed to sync. Flushed
// automatically whenever any API request succeeds (i.e. backend is awake).
// ---------------------------------------------------------------------------

const PENDING_KEY = 'aria_pending_completes'

export function getPendingCompletes() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]') }
  catch { return [] }
}

function setPendingCompletes(ids) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(ids))
}

export function queueComplete(taskId) {
  const pending = getPendingCompletes()
  if (!pending.includes(taskId)) {
    pending.push(taskId)
    setPendingCompletes(pending)
  }
}

// ---------------------------------------------------------------------------
// Offline-resilient snooze queue
// ---------------------------------------------------------------------------

const PENDING_SNOOZE_KEY = 'aria_pending_snoozes'

export function getPendingSnoozes() {
  try { return JSON.parse(localStorage.getItem(PENDING_SNOOZE_KEY) || '[]') }
  catch { return [] }
}

function setPendingSnoozes(items) {
  localStorage.setItem(PENDING_SNOOZE_KEY, JSON.stringify(items))
}

export function queueSnooze(taskId, snoozeUntil) {
  const pending = getPendingSnoozes()
  if (!pending.some(s => s.id === taskId)) {
    pending.push({ id: taskId, snooze_until: snoozeUntil })
    setPendingSnoozes(pending)
  }
}

let _flushing = false

async function flushQueues() {
  if (_flushing) return
  const pendingCompletes = getPendingCompletes()
  const pendingSnoozes = getPendingSnoozes()
  if (!pendingCompletes.length && !pendingSnoozes.length) return
  _flushing = true

  const stillCompletes = []
  for (const id of pendingCompletes) {
    try {
      await request('POST', `/tasks/${id}/complete`)
    } catch {
      stillCompletes.push(id)
    }
  }
  setPendingCompletes(stillCompletes)

  const stillSnoozes = []
  for (const s of pendingSnoozes) {
    try {
      await request('POST', `/tasks/${s.id}/snooze`, { snooze_until: s.snooze_until })
    } catch {
      stillSnoozes.push(s)
    }
  }
  setPendingSnoozes(stillSnoozes)

  _flushing = false
}

setInterval(flushQueues, 30000)

export const api = {
  get:      (path)       => request('GET',    path),
  post:     (path, body) => request('POST',   path, body),
  patch:    (path, body) => request('PATCH',  path, body),
  delete:   (path)       => request('DELETE', path),
  postForm: (path, form) => request('POST',   path, form, true),
}
