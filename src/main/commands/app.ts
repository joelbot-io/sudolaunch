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

const CACHE_TTL_MS = 10 * 60 * 1000
let cachedShortcuts: AppEntry[] | null = null
let lastCacheTime = 0

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

// Every discovered shortcut, unfiltered — used by the "//" App Visibility settings screen.
export function listApps(): AppEntry[] {
  return listShortcuts()
}

export function search(query: string): SearchResultItem[] {
  const disabled = new Set(readSettings().disabledApps)
  const shortcuts = listShortcuts().filter((s) => !disabled.has(s.path))
  const matches = query
    ? new Fuse(shortcuts, { keys: ['name'], threshold: 0.35 }).search(query).map((r) => r.item)
    : shortcuts.slice(0, 25)
  return matches.map((s) => ({ label: s.name, sublabel: s.path, value: s.path }))
}

export async function execute(item: SearchResultItem): Promise<void> {
  const result = await shell.openPath(item.value)
  if (result) {
    throw new Error(result)
  }
}
