import type { SearchResultItem } from '../../shared/types'
import { readSettings, writeSettings } from '../config'
import { getGitWatchers, startGitWatcher, stopGitWatcher } from '../gitWatcher'

export function search(query: string): SearchResultItem[] {
  const settings = readSettings()
  const recent = settings.recentGitRepos ?? []
  const watchers = getGitWatchers()
  const activeCount = watchers.filter((w) => w.enabled).length

  const items: SearchResultItem[] = [
    {
      label: 'Git Repository Status & Branch Switcher',
      sublabel: settings.gitRepoPath ? `Active: ${settings.gitRepoPath}` : 'Open Git status panel',
      value: '__openGitPanel'
    },
    {
      label: `🔥 Hot-Reload Filesystem Watchers (${activeCount} active / ${watchers.length} saved)`,
      sublabel: 'Manage multiple dev project filesystem watchers, auto-reload commands, and live logs',
      value: '__openGitWatchers'
    }
  ]

  const q = query.trim().toLowerCase()

  for (const w of watchers) {
    if (
      !q ||
      'watch'.includes(q) ||
      'reload'.includes(q) ||
      w.name.toLowerCase().includes(q) ||
      w.repoName.toLowerCase().includes(q) ||
      w.command.toLowerCase().includes(q)
    ) {
      items.push({
        label: `${w.enabled ? '⏹ Stop' : '▶ Start'} Watcher: ${w.name} (${w.repoName})`,
        sublabel: `${w.enabled ? `Active (${w.reloadCount} reloads)` : 'Stopped'} · ${w.command} · ${w.repoPath}`,
        value: `__toggleWatcher::${w.id}`
      })
    }
  }

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
    if (!item.value || item.value === '__openGitPanel' || item.value === '__openGitWatchers') {
      return
    }
    if (item.value.startsWith('__toggleWatcher::')) {
      const id = item.value.split('::')[1]
      const w = getGitWatchers().find((x) => x.id === id)
      if (w) {
        if (w.enabled) {
          await stopGitWatcher(id)
        } else {
          await startGitWatcher(id)
        }
      }
      return
    }
    const settings = readSettings()
    writeSettings({ ...settings, gitRepoPath: item.value })
  }
