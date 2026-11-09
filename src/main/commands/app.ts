import { shell } from 'electron'
import Fuse from 'fuse.js'
import { readdirSync, statSync } from 'fs'
import { join, basename, extname } from 'path'
import type { AppEntry, SearchResultItem } from '../../shared/types'
import { readSettings } from '../config'

const START_MENU_DIRS = [
  join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  join(process.env.ProgramData ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
]

function walk(dir: string, out: AppEntry[]): void {
  let entries: string[] = []
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      walk(fullPath, out)
    } else if (extname(entry).toLowerCase() === '.lnk') {
      out.push({ name: basename(entry, '.lnk'), path: fullPath })
    }
  }
}

const CACHE_TTL_MS = 20 * 60 * 1000
let cachedShortcuts: AppEntry[] | null = null
let lastCacheTime = 0
let cachedFilteredRef: AppEntry[] | null = null
let cachedDisabledKey = ''
let cachedFilteredShortcuts: AppEntry[] = []
let cachedShortcutsFuse: Fuse<AppEntry> | null = null

function listShortcuts(): AppEntry[] {
  const now = Date.now()
  if (cachedShortcuts && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedShortcuts
  }
  const out: AppEntry[] = []
  for (const dir of START_MENU_DIRS) {
    walk(dir, out)
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  cachedShortcuts = out
  lastCacheTime = now
  return out
}

// Every discovered shortcut, unfiltered — used by the "/settings" App Visibility settings screen.
export function listApps(): AppEntry[] {
  return listShortcuts()
}

export function search(query: string): SearchResultItem[] {
  const allShortcuts = listShortcuts()
  const disabledApps = readSettings().disabledApps
  const disabledKey = disabledApps.join('\0')

  if (
    cachedFilteredRef !== allShortcuts ||
    cachedDisabledKey !== disabledKey ||
    !cachedShortcutsFuse
  ) {
    const disabled = new Set(disabledApps)
    cachedFilteredShortcuts = allShortcuts.filter((s) => !disabled.has(s.path))
    cachedShortcutsFuse = new Fuse(cachedFilteredShortcuts, { keys: ['name'], threshold: 0.35 })
    cachedFilteredRef = allShortcuts
    cachedDisabledKey = disabledKey
  }

  const matches = query
    ? cachedShortcutsFuse.search(query, { limit: 30 }).map((r) => r.item)
    : cachedFilteredShortcuts.slice(0, 25)
  return matches.map((s) => ({ label: s.name, sublabel: s.path, value: s.path }))
}

export async function execute(item: SearchResultItem): Promise<void> {
  const result = await shell.openPath(item.value)
  if (result) {
    throw new Error(result)
  }
}
