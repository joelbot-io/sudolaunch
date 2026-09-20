import { clipboard, shell } from 'electron'
import type { SearchResultItem } from '../../shared/types'

export function search(query: string): SearchResultItem[] {
  const trimmed = query.trim()
  if (trimmed) {
    const url = `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
    return [
      {
        label: `Google Search: "${trimmed}"`,
        sublabel: `Open in default browser (${url})`,
        value: url
      }
    ]
  }

  const results: SearchResultItem[] = []
  const cb = clipboard.readText().trim()

  if (cb && !cb.includes('\n') && cb.length < 150) {
    const cbUrl = `https://www.google.com/search?q=${encodeURIComponent(cb)}`
    results.push({
      label: `Google Search: "${cb}"`,
      sublabel: `Search clipboard text (${cbUrl})`,
      value: cbUrl
    })
  }

  results.push({
    label: 'Google Search',
    sublabel: 'Type search query to search on Google (e.g. /g electron app)',
    value: 'https://www.google.com'
  })

  return results
}

export async function execute(item: SearchResultItem, query?: string): Promise<void> {
  const trimmed = query ? query.trim() : ''
  const targetUrl =
    item.value || (trimmed ? `https://www.google.com/search?q=${encodeURIComponent(trimmed)}` : 'https://www.google.com')
  await shell.openExternal(targetUrl)
}
