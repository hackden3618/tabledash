import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ui/ErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Hand off from the static boot splash (inlined in index.html, painted
// before this file even loaded) once React has mounted. First-time-today
// visitors get the full "Preparing your menu…" beat; returning visitors
// get a fast, near-instant dismiss — first impression is emotion, daily
// use should respect people's time.
function dismissBootSplash() {
  const splash = document.getElementById('boot-splash')
  if (!splash) return

  const RETURN_WINDOW_MS = 24 * 60 * 60 * 1000
  const lastVisit = Number(localStorage.getItem('ladha_last_visit') || 0)
  const isReturning = Date.now() - lastVisit < RETURN_WINDOW_MS
  localStorage.setItem('ladha_last_visit', String(Date.now()))

  const hide = () => {
    splash.classList.add('boot-splash--hide')
    setTimeout(() => splash.remove(), 400)
  }

  if (isReturning) {
    setTimeout(hide, 150)
    return
  }

  const message = document.getElementById('boot-splash-message')
  if (message) message.hidden = false
  setTimeout(hide, 1100)
}

requestAnimationFrame(() => requestAnimationFrame(dismissBootSplash))
