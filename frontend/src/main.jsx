import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// On new build: wipe stale localStorage so bug fixes reach users who haven't
// manually cleared. Preserves the irreplaceables: aria_token (session),
// aria_session_expires_at (dropping it forced a fresh login on every single deploy),
// aria_theme (user pick), med_name_* (real medication names live ONLY here —
// server has placeholders, wipe = permanent data loss).
const BUILD = __BUILD_TIME__
const KEEP_ON_BUILD_CHANGE = ['aria_token', 'aria_session_expires_at', 'aria_theme']
const prevBuild = localStorage.getItem('aria_build')
if (prevBuild && prevBuild !== BUILD) {
  const kept = KEEP_ON_BUILD_CHANGE.map(k => [k, localStorage.getItem(k)])
  const medPairs = Object.keys(localStorage)
    .filter(k => k.startsWith('med_name_'))
    .map(k => [k, localStorage.getItem(k)])
  localStorage.clear()
  for (const [k, v] of [...kept, ...medPairs]) {
    if (v !== null) localStorage.setItem(k, v)
  }
}
localStorage.setItem('aria_build', BUILD)

// Auto-update for installed PWA: actively check for new SW on every foreground,
// then reload on next foreground once a new SW has taken control.
if ('serviceWorker' in navigator) {
  let needsReload = false
  navigator.serviceWorker.addEventListener('controllerchange', () => { needsReload = true })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (needsReload) {
      window.location.reload()
    } else {
      // Kick an update check — installed PWAs don't navigate so the browser
      // never gets a natural opportunity to detect a new service worker.
      navigator.serviceWorker.ready.then(r => r.update()).catch(() => {})
    }
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
