import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// TEMP diagnostic: forwards otherwise-silent renderer crashes (which leave the window
// looking "stuck"/unresponsive with nothing in DevTools reachable, since the window may
// be invisible) to main's console, since main's own log is easy to tail.
window.addEventListener('error', (e) => {
  window.api.reportRendererError?.(`window.onerror: ${e.message} at ${e.filename}:${e.lineno}:${e.colno}\n${e.error?.stack ?? ''}`)
})
window.addEventListener('unhandledrejection', (e) => {
  window.api.reportRendererError?.(`unhandledrejection: ${e.reason?.message ?? e.reason}\n${e.reason?.stack ?? ''}`)
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
