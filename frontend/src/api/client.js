// Base API client — handles auth headers, error normalization, and token storage.

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const TOKEN_KEY = 'aria_token'
const LAST_SUCCESS_KEY = 'aria_last_api_success'
const EXPIRES_KEY = 'aria_session_expires_at'
const SLEEP_THRESHOLD_MS = 10 * 60 * 1000  // Render sleeps after 15 min; check at 10

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

// The server decides when a session dies — the user's next 4am — and hands the
// moment back at login. Storing it (rather than recomputing a boundary here) keeps
// the client from having to know about timezones or the day-start hour at all, and
// means the two can't drift apart.
export function setToken(token, expiresAt) {
  localStorage.setItem(TOKEN_KEY, token)
  const ms = expiresAt ? Date.parse(expiresAt.endsWith('Z') ? expiresAt : `${expiresAt}Z`) : NaN
  if (Number.isFinite(ms)) localStorage.setItem(EXPIRES_KEY, String(ms))
  else localStorage.removeItem(EXPIRES_KEY)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EXPIRES_KEY)
}

export function isLoggedIn() {
  if (import.meta.env.DEV) return true
  return !!getToken()
}

// True when the stored session has reached its expiry, so the app can show the
// login screen up front instead of firing a request that 401s and reloads. The
// server enforces the same moment; this only saves the round trip.
//
// A missing expiry means a login from before 4.9.8, so ask once and move on.
export function loginExpired() {
  if (import.meta.env.DEV) return false
  if (!getToken()) return false
  const at = parseInt(localStorage.getItem(EXPIRES_KEY) || '', 10)
  if (!Number.isFinite(at)) return true
  return Date.now() >= at
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
  // Fire once per wake cycle (guarded by _warmUpPromise) so the app shell can
  // raise a loading cover the moment any request hits a sleeping server —
  // covers the case where the tab stayed visible (e.g. app on a second monitor)
  // so visibilitychange never fired.
  window.dispatchEvent(new Event('aria:server-waking'))
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
    const error = new Error(detail)
    error.status = res.status  // let callers distinguish 4xx (permanent) from 5xx/network
    throw error
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
// File download
// A plain <a href> can't carry the bearer token, so fetch the body ourselves
// and hand the browser an object URL. Same 401 + wake-retry behavior as
// request(); the response is a blob rather than JSON.
// ---------------------------------------------------------------------------

async function rawDownload(path, fallbackName) {
  const token = getToken()
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, { headers })

  if (res.status === 401) {
    if (import.meta.env.DEV) throw new Error('Auth required (dev mode — skipping reload)')
    clearToken()
    window.location.reload()
    return
  }

  if (!res.ok) {
    let detail = `Download failed: ${res.status}`
    try {
      const err = await res.json()
      detail = err.detail || detail
    } catch (_) {}
    const error = new Error(detail)
    error.status = res.status
    throw error
  }

  markSuccess()

  // Server names the file (it knows the user's app-day); header is exposed via
  // Access-Control-Expose-Headers on the route.
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="?([^";]+)"?/i)
  const filename = match ? match[1] : fallbackName

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick — revoking synchronously can cancel the download
  // in Safari before it has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return filename
}

// ---------------------------------------------------------------------------
// Offline-resilient completion queue
// Stores task IDs that were completed locally but failed to sync. Flushed
// automatically whenever any API request succeeds (i.e. backend is awake).
// ---------------------------------------------------------------------------

const PENDING_KEY = 'aria_pending_completes'

// Queue writes can throw — quota exhausted, Safari private mode, storage
// disabled. The reads have always been guarded; the writes were not, so a
// failed write silently dropped an item the caller believed was queued. Return
// success so callers can tell the difference between "queued" and "lost".
function _writeQueue(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (err) {
    console.error(`[aria] queue write failed for ${key}`, err)
    window.dispatchEvent(new CustomEvent('aria:queue-write-failed', { detail: { key } }))
    return false
  }
}

export function getPendingCompletes() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]') }
  catch { return [] }
}

function setPendingCompletes(ids) {
  return _writeQueue(PENDING_KEY, ids)
}

export function queueComplete(taskId) {
  const pending = getPendingCompletes()
  if (!pending.includes(taskId)) {
    pending.push(taskId)
    setPendingCompletes(pending)
  }
}

export function removeComplete(taskId) {
  setPendingCompletes(getPendingCompletes().filter(id => id !== taskId))
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
  return _writeQueue(PENDING_SNOOZE_KEY, items)
}

export function queueSnooze(taskId, snoozeUntil) {
  const pending = getPendingSnoozes()
  if (!pending.some(s => s.id === taskId)) {
    pending.push({ id: taskId, snooze_until: snoozeUntil })
    setPendingSnoozes(pending)
  }
}

export function removeSnooze(taskId) {
  setPendingSnoozes(getPendingSnoozes().filter(s => s.id !== taskId))
}

// ---------------------------------------------------------------------------
// Offline-resilient morning-review queue
// The morning review's Continue tap often lands on a cold/slow Render backend.
// If that POST is lost, `reviewed_through` never advances and the same day
// resurfaces the next morning. So persist the commit and flush it on wake,
// exactly like completions/snoozes. Keyed by review date; a later commit for
// the same date replaces the earlier one.
// ---------------------------------------------------------------------------

const PENDING_REVIEW_KEY = 'aria_pending_reviews'

export function getPendingReviews() {
  try { return JSON.parse(localStorage.getItem(PENDING_REVIEW_KEY) || '[]') }
  catch { return [] }
}

function setPendingReviews(items) {
  return _writeQueue(PENDING_REVIEW_KEY, items)
}

export function queueReviewCommit(payload) {
  const pending = getPendingReviews().filter(p => p.date !== payload.date)
  pending.push(payload)
  setPendingReviews(pending)
}

export function removeReviewCommit(date) {
  setPendingReviews(getPendingReviews().filter(p => p.date !== date))
}

let _flushing = false

// Backoff for the periodic flush. Without it, a genuinely unreachable backend
// gets probed every 30s forever; with it, the gap widens to a 5-minute ceiling
// and snaps back to normal the moment anything succeeds.
const FLUSH_INTERVAL_MS = 30000
const FLUSH_BACKOFF_MAX_MS = 5 * 60 * 1000
let _flushFailures = 0
let _nextFlushAt = 0

function _noteFlushFailure() {
  _flushFailures += 1
  const delay = Math.min(FLUSH_INTERVAL_MS * 2 ** _flushFailures, FLUSH_BACKOFF_MAX_MS)
  _nextFlushAt = Date.now() + delay
}

function _noteFlushSuccess() {
  _flushFailures = 0
  _nextFlushAt = 0
}

function _hasPending() {
  return !!(getPendingCompletes().length || getPendingSnoozes().length ||
            getPendingReviews().length)
}

// Total items waiting to sync, for a UI indicator. The queue used to be
// completely invisible: the dangerous state is not a failed write, it's the
// user believing something saved when it didn't.
export function pendingCount() {
  return getPendingCompletes().length + getPendingSnoozes().length +
         getPendingReviews().length
}

// A single silent /health probe. Deliberately NOT warmUp(): warmUp dispatches
// `aria:server-waking` and takes the shared wake lock — fine
// when the user is waiting on a page, wrong for a background flush that would
// then throw a cover over whatever she's doing.
async function _probeHealth() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(`${BASE_URL}/health`, { signal: controller.signal })
    clearTimeout(timer)
    if (res.ok) {
      markSuccess()
      return true
    }
  } catch (_) { /* unreachable */ }
  return false
}

// A 4xx (except timeout/rate-limit) means the request will never succeed —
// e.g. the task was deleted server-side, so /complete 404s forever. Drop it so
// it can't wedge the head of the queue. 5xx / network / 429 are transient → retry.
function _isPermanentFailure(err) {
  const s = err?.status
  return typeof s === 'number' && s >= 400 && s < 500 && s !== 408 && s !== 429
}

// Drain one queue. Returns false if it stopped on a transient failure, so the
// caller knows to back off rather than treat the pass as clean.
async function _drain(read, send, drop) {
  let items = read()
  while (items.length) {
    const item = items[0]
    try {
      await send(item)
      drop(item)
    } catch (err) {
      if (_isPermanentFailure(err)) drop(item)  // drop; don't jam the queue
      else return false                         // transient; retry next flush
    }
    items = read()
  }
  return true
}

async function flushQueues({ force = false } = {}) {
  if (_flushing) return
  if (!_hasPending()) return
  if (!force && Date.now() < _nextFlushAt) return

  _flushing = true
  try {
    // The old guard here was `if (likelySleeping()) return`, which meant the
    // flush refused to run in precisely the condition the queue exists for:
    // likelySleeping() is true whenever nothing has succeeded in 10 minutes,
    // which is exactly when items are sitting in the queue. Nothing else calls
    // flushQueues, so the queue could not self-heal — it drained only when the
    // user happened to make a request that succeeded. Probe instead of bail.
    if (likelySleeping() && !(await _probeHealth())) {
      _noteFlushFailure()
      return
    }

    let clean = await _drain(
      getPendingCompletes,
      (id) => request('POST', `/tasks/${id}/complete`),
      removeComplete,
    )
    clean = await _drain(
      getPendingSnoozes,
      (s) => request('POST', `/tasks/${s.id}/snooze`, { snooze_until: s.snooze_until }),
      (s) => removeSnooze(s.id),
    ) && clean
    clean = await _drain(
      getPendingReviews,
      (r) => request('POST', '/review/commit', r),
      (r) => removeReviewCommit(r.date),
    ) && clean

    if (clean) _noteFlushSuccess()
    else _noteFlushFailure()
  } catch (err) {
    // Nothing should reach here — the per-item handlers catch send failures —
    // but an unexpected throw used to leave _flushing stuck true, killing the
    // queue for the life of the page with no symptom.
    console.error('[aria] flushQueues failed', err)
    _noteFlushFailure()
  } finally {
    _flushing = false
  }
}

export { flushQueues }

setInterval(flushQueues, FLUSH_INTERVAL_MS)

// The interval alone leaves up to 30s of exposure and can't react to the app
// coming back to life. Flush on any successful request, and whenever the tab
// regains focus.
window.addEventListener('aria:server-awake', () => { flushQueues({ force: true }) })
window.addEventListener('focus', () => { flushQueues({ force: true }) })
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') flushQueues({ force: true })
})

export const api = {
  get:      (path)       => request('GET',    path),
  post:     (path, body) => request('POST',   path, body),
  patch:    (path, body) => request('PATCH',  path, body),
  delete:   (path)       => request('DELETE', path),
  postForm: (path, form) => request('POST',   path, form, true),
  download: async (path, fallbackName) => {
    try {
      return await rawDownload(path, fallbackName)
    } catch (err) {
      if (!likelySleeping()) throw err
      await warmUp(() => {})
      return rawDownload(path, fallbackName)
    }
  },
}
