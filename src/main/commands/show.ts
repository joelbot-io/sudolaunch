import type { SearchResultItem } from '../../shared/types'
import { readSettings, writeSettings } from '../config'
import { setBarVisible } from '../barWindow'

export function search(_query: string): SearchResultItem[] {
  const { barEnabled } = readSettings()
  return [
    {
      label: 'Show command dock',
      sublabel: barEnabled
        ? 'Turn on and display the persistent command dock on screen (currently visible) · ↵ to show'
        : 'Turn on and display the persistent command dock on screen · ↵ to show',
      value: 'show'
    }
  ]
}

export async function execute(): Promise<void> {
  const settings = readSettings()
  if (!settings.barEnabled) {
    writeSettings({ ...settings, barEnabled: true })
  }
  setBarVisible(true)
}
