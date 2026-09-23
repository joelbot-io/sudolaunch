import type { SearchResultItem } from '../../shared/types'

export function search(): SearchResultItem[] {
  return [
    {
      label: 'Focus & Pomodoro Timer',
      sublabel: '5m to 60m focus sessions, custom countdown, and presets · ↵ to open',
      value: '__openTimer'
    }
  ]
}

export async function execute(): Promise<void> {
  // Handled in renderer view switcher
}
