import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './shared/i18n'
import App from './app/App'

// After a new deploy, a tab that was already open asks for old code files that no longer exist.
// Reload once to pick up the new version instead of showing a white screen.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  const key = 'mm-reloaded-at'
  const last = Number(sessionStorage.getItem(key) ?? 0)
  if (Date.now() - last > 10_000) {
    sessionStorage.setItem(key, String(Date.now()))
    window.location.reload()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
