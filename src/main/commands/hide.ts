import type { SearchResultItem } from '../../shared/types'
import { readSettings, writeSettings } from '../config'
import { setBarVisible } from '../barWindow'

export function search(_query: string): SearchResultItem[] {
  const { barEnabled } = readSettings()
  return [
    {
      label: 'Hide command dock',
      sublabel: !barEnabled
        ? 'Hide the persistent command dock from the screen (currently hidden) · ↵ to hide'
        : 'Hide the persistent command dock from the screen · ↵ to hide',
      value: 'hide'
    }
  ]
}

export async function execute(): Promise<void> {
  const settings = readSettings()
  if (settings.barEnabled) {
    writeSettings({ ...settings, barEnabled: false })
  }
  setBarVisible(false)
}
