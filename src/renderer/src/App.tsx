import CommandPalette from './CommandPalette'
import Terminal from './Terminal'
import NotificationPanel from './NotificationPanel'
import ShortcutsOverlay from './ShortcutsOverlay'
import { windowMode } from './windowMode'

export default function App(): JSX.Element {
  if (windowMode === 'term') return <Terminal />
  if (windowMode === 'notify') return <NotificationPanel />
  if (windowMode === 'shortcuts') return <ShortcutsOverlay />
  return <CommandPalette />
}
