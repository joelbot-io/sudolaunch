import CommandPalette from './CommandPalette'
import Terminal from './Terminal'
import NotificationPanel from './NotificationPanel'
import { windowMode } from './windowMode'

export default function App(): JSX.Element {
  if (windowMode === 'term') return <Terminal />
  if (windowMode === 'notify') return <NotificationPanel />
  return <CommandPalette />
}
