import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Reload on next app foreground after a SW update — avoids mid-task interruption
if ('serviceWorker' in navigator) {
  let needsReload = false
  navigator.serviceWorker.addEventListener('controllerchange', () => { needsReload = true })
  document.addEventListener('visibilitychange', () => {
    if (needsReload && document.visibilityState === 'visible') window.location.reload()
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
