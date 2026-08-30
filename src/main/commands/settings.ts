import type { SearchResultItem } from '../../shared/types'

export function search(): SearchResultItem[] {
  return [
    {
      label: 'Open Settings',
      sublabel: 'Configure hotkeys, shortcuts, commands, and preferences',
      value: 'open'
    }
  ]
}

export async function execute(): Promise<void> {
  // Executed directly in renderer (opens ConfigManager view)
}
