import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// On new build: wipe stale localStorage so bug fixes reach users who haven't
// manually cleared. Preserves the irreplaceables: aria_token (session),
// aria_session_expires_at (dropping it forced a fresh login on every single deploy),
// aria_theme (user pick).
const BUILD = __BUILD_TIME__
const KEEP_ON_BUILD_CHANGE = [
  'aria_token',
  'aria_session_expires_at',
  'aria_theme',
]
const prevBuild = localStorage.getItem('aria_build')
if (prevBuild && prevBuild !== BUILD) {
  const kept = KEEP_ON_BUILD_CHANGE.map(k => [k, localStorage.getItem(k)])
  localStorage.clear()
  for (const [k, v] of kept) {
    if (v !== null) localStorage.setItem(k, v)
  }
}
localStorage.setItem('aria_build', BUILD)

// Auto-update for installed PWA.
//
// The SW is built with skipWaiting + clientsClaim + cleanupOutdatedCaches (that
// trio is what `registerType: 'autoUpdate'` generates). So the moment a new SW
// installs it activates, claims this page, and DELETES the old precache — while
// the page is still running the old build off it. Anything the old build asks
// for after that falls through to network, where old hashed filenames 404 a
// deploy or two later.
//
// The previous version of this block deferred the reload to the next
// visibilitychange. But the cache deletion is not deferred, so an installed PWA
// that was just opened sat in that broken window with no next foreground coming
// — the "PWA is goofed up after every deploy" symptom. Reload as soon as the
// new worker takes control instead; the gap is a brief flash, not a broken app.
//
// `hadController` distinguishes an UPDATE from the first-ever install. On a
// first visit the page starts uncontrolled and clientsClaim fires
// controllerchange too — reloading on that would be a pointless extra load.
// `reloading` guards against a double-fire looping.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    window.location.reload()
  })
  const checkForUpdate = () => navigator.serviceWorker.ready.then(r => r.update()).catch(() => {})
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    // Kick an update check — installed PWAs don't navigate, so the browser
    // never gets a natural opportunity to detect a new service worker.
    checkForUpdate()
  })
  // A mobile tab left open for days (OS session-restore across reboots, an
  // installed PWA never force-quit) may never re-fire visibilitychange or a
  // real navigation, so it can sit on a build that's many releases stale
  // until someone manually clears site data. Also check immediately on load
  // and on a standing interval so staleness caps out at ~20 minutes instead
  // of "however long this tab happens to stay open."
  checkForUpdate()
  setInterval(checkForUpdate, 20 * 60 * 1000)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
