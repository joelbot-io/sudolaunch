import { readSettings, writeSettings } from '../config'
import { COMMANDS } from '../../shared/types'
import type { SearchResultItem } from '../../shared/types'

export function search(query: string): SearchResultItem[] {
  const q = query.trim().toLowerCase()
  const settings = readSettings()
  const current = settings.defaultCommand || 'none'

  const items: SearchResultItem[] = [
    {
      label: 'Clear default command',
      sublabel: `Current default: /${current}`,
      value: 'clear'
    },
    ...COMMANDS.filter((c) => c.name !== 'default').map((c) => ({
      label: `Set /${c.name} as default`,
      sublabel: c.name === settings.defaultCommand ? 'Currently set as default' : c.description,
      value: c.name
    }))
  ]

  if (!q) return items
  return items.filter(
    (item) => item.label.toLowerCase().includes(q) || item.value.toLowerCase().includes(q)
  )
}

export async function execute(item: SearchResultItem, query: string): Promise<void> {
  const target = item.value || query.trim().replace(/^\//, '').toLowerCase()
  if (target === 'clear' || target === 'none') {
    writeSettings({ ...readSettings(), defaultCommand: '' })
  } else {
    const valid = COMMANDS.find((c) => c.name === target)
    if (valid) {
      writeSettings({ ...readSettings(), defaultCommand: valid.name })
    }
  }
}
