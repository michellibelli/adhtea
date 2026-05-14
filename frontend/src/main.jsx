import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

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
