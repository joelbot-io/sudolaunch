import { lazy, Suspense } from 'react'
import { windowMode } from './windowMode'

const CommandPalette = lazy(() => import('./CommandPalette'))
const Terminal = lazy(() => import('./Terminal'))
const NotificationPanel = lazy(() => import('./NotificationPanel'))
const ShortcutsOverlay = lazy(() => import('./ShortcutsOverlay'))

export default function App(): JSX.Element {
  return (
    <Suspense fallback={null}>
      {windowMode === 'term' ? (
        <Terminal />
      ) : windowMode === 'notify' ? (
        <NotificationPanel />
      ) : windowMode === 'shortcuts' ? (
        <ShortcutsOverlay />
      ) : (
        <CommandPalette />
      )}
    </Suspense>
  )
}
