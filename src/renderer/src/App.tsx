import CommandPalette from './CommandPalette'
import Terminal from './Terminal'
import { windowMode } from './windowMode'

export default function App(): JSX.Element {
  if (windowMode === 'term') return <Terminal />
  return <CommandPalette />
}
