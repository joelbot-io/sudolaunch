import { shell } from 'electron'
import { existsSync, statSync } from 'fs'
import { basename, resolve } from 'path'
import { homedir } from 'os'
import type { CommandName, SearchResultItem } from '../../shared/types'
import { readSettings } from '../config'
import * as teams from './teams'
import * as mail from './mail'
import * as snippet from './snippet'
import * as fav from './fav'
import * as app from './app'
import * as custom from './custom'
import * as focus from './focus'
import * as gif from './gif'
import * as lookup from './lookup'

interface Searchable {
  name: CommandName
  search: (query: string) => SearchResultItem[]
  execute: (item: SearchResultItem) => Promise<void>
}

// Imports each command module directly (same as commands/index.ts) rather than going
// through that module's private searchers/executors maps, to avoid a circular import.
const SEARCHABLE: Searchable[] = [
  { name: 'teams', search: teams.search, execute: teams.execute },
  { name: 'mail', search: mail.search, execute: mail.execute },
  { name: 'snippet', search: snippet.search, execute: snippet.execute },
  { name: 'fav', search: fav.search, execute: fav.execute },
  { name: 'app', search: app.search, execute: app.execute },
  { name: 'custom', search: custom.search, execute: custom.execute },
  { name: 'focus', search: focus.search, execute: focus.execute },
  { name: 'gif', search: gif.search, execute: gif.execute },
  { name: 'lookup', search: lookup.search, execute: lookup.execute }
]

function getDirectResult(rawQuery: string): SearchResultItem | null {
  const q = rawQuery.trim()
  if (!q) return null

  // 1. Web URL
  if (/^https?:\/\//i.test(q) || /^www\.[a-z0-9-]+\.[a-z]{2,}/i.test(q)) {
    return {
      label: `Open ${q}`,
      sublabel: 'Open URL in default web browser',
      value: `__direct_url__::${q}`
    }
  }

  // 2. Windows drive path, UNC path, or home folder shortcut (~/...)
  if (/^[a-zA-Z]:[\\/]/.test(q) || /^[\\/]{2}/.test(q) || /^~[\\/]/.test(q)) {
    let targetPath = q
    if (q.startsWith('~')) {
      targetPath = resolve(homedir(), q.slice(1).replace(/^[\\/]/, ''))
    }
    if (existsSync(targetPath)) {
      try {
        const stat = statSync(targetPath)
        if (stat.isDirectory()) {
          return {
            label: `Browse folder "${basename(targetPath) || targetPath}"`,
            sublabel: `Open in File Explorer (${targetPath})`,
            value: `__direct_path__::${targetPath}`
          }
        } else {
          return {
            label: `Open file "${basename(targetPath)}"`,
            sublabel: `Open in default application (${targetPath})`,
            value: `__direct_path__::${targetPath}`
          }
        }
      } catch {
        // Fall through
      }
    }
    return {
      label: `Open "${q}"`,
      sublabel: `Open path in Windows (${targetPath})`,
      value: `__direct_path__::${targetPath}`
    }
  }

  return null
}

export function search(query: string): SearchResultItem[] {
  const direct = getDirectResult(query)
  const excluded = new Set(readSettings().searchExcludedCommands)
  const enabled = SEARCHABLE.filter((c) => !excluded.has(c.name))

  const results: SearchResultItem[] = []
  if (direct) {
    results.push(direct)
  }
  for (const c of enabled) {
    for (const item of c.search(query)) {
      if (item.disabled || item.isDirectory) continue
      results.push({
        label: item.label,
        sublabel: item.sublabel ? `${item.sublabel} · /${c.name}` : `/${c.name}`,
        value: `${c.name}::${item.value}`
      })
    }
  }
  return results
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value.startsWith('__direct_url__::')) {
    const rawUrl = item.value.slice('__direct_url__::'.length)
    const targetUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
    await shell.openExternal(targetUrl)
    return
  }
  if (item.value.startsWith('__direct_path__::')) {
    const targetPath = item.value.slice('__direct_path__::'.length)
    const result = await shell.openPath(targetPath)
    if (result) {
      throw new Error(result)
    }
    return
  }
  const source = SEARCHABLE.find((c) => item.value.startsWith(`${c.name}::`))
  if (!source) {
    throw new Error('Unknown search result source')
  }
  const originalValue = item.value.slice(source.name.length + 2)
  await source.execute({ ...item, value: originalValue })
}
