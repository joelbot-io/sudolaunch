import { getHistory, clearHistory } from '../history'
import { execute as executeCmd } from './index'
import type { SearchResultItem } from '../../shared/types'

export function search(query: string): SearchResultItem[] {
  const q = query.trim().toLowerCase()
  const historyEntries = getHistory()

  const items: SearchResultItem[] = []

  if (historyEntries.length > 0) {
    items.push({
      label: 'Clear all command history',
      sublabel: `Erase ${historyEntries.length} saved history ${historyEntries.length === 1 ? 'entry' : 'entries'}`,
      value: '__clear_all'
    })
  }

  for (const h of historyEntries) {
    const timeStr = h.timestamp ? new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
    items.push({
      label: h.label,
      sublabel: `/${h.command} ${h.query}${timeStr ? ` · ${timeStr}` : ''}`,
      value: JSON.stringify(h)
    })
  }

  if (!q) return items

  if ('clear'.startsWith(q) || q === 'clear all') {
    return items.filter((item) => item.value === '__clear_all' || item.label.toLowerCase().includes(q))
  }

  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      (item.sublabel && item.sublabel.toLowerCase().includes(q))
  )
}

export async function execute(item: SearchResultItem, query: string): Promise<void> {
  const target = item.value || query.trim().toLowerCase()
  if (target === '__clear_all' || target === 'clear') {
    clearHistory()
    return
  }

  try {
    const h = JSON.parse(item.value)
    if (h && h.command) {
      await executeCmd(h.command, { label: h.label, value: h.value }, h.query, false)
    }
  } catch {
    // If not JSON, ignore
  }
}
