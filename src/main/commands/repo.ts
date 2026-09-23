import type { SearchResultItem } from '../../shared/types'
import { readSettings, writeSettings } from '../config'

export function search(query: string): SearchResultItem[] {
  const settings = readSettings()
  const recent = settings.recentGitRepos ?? []
  const items: SearchResultItem[] = [
    {
      label: 'Git Repository Status & Branch Switcher',
      sublabel: settings.gitRepoPath ? `Active: ${settings.gitRepoPath}` : 'Open Git status panel',
      value: '__openGitPanel'
    }
  ]

  const q = query.trim().toLowerCase()
  for (const p of recent) {
    if (!q || p.toLowerCase().includes(q)) {
      items.push({
        label: p.split(/[\\/]/).pop() || p,
        sublabel: p,
        value: p
      })
    }
  }

  return items
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value && item.value !== '__openGitPanel') {
    const settings = readSettings()
    writeSettings({ ...settings, gitRepoPath: item.value })
  }
}
