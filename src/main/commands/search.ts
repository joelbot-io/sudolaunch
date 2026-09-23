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
import * as g from './g'
import * as app from './app'
import * as custom from './custom'
import * as focus from './focus'
import * as gif from './gif'
import * as lookup from './lookup'
import * as tz from './tz'
import * as hash from './hash'
import * as uuid from './uuid'
import * as ip from './ip'
import * as pwd from './pwd'
import * as port from './port'
import * as unit from './unit'
import * as color from './color'
import * as caseCmd from './case'
import * as chmod from './chmod'
import * as cron from './cron'
import * as emoji from './emoji'
import * as git from './git'
import * as http from './http'
import * as json from './json'
import * as lorem from './lorem'
import * as mime from './mime'
import * as pt from './pt'
import * as qr from './qr'
import * as regex from './regex'
import * as text from './text'
import * as url from './url'
import * as diff from './diff'
import * as env from './env'
import * as key from './key'

interface Searchable {
  name: CommandName
  search: (query: string) => SearchResultItem[]
  execute: (item: SearchResultItem) => Promise<void>
}

// Imports each command module directly (same as commands/index.ts) rather than going
// through that module's private searchers/executors maps, to avoid a circular import.
const SEARCHABLE: Searchable[] = [
  { name: 'teams', search: (query) => teams.search(query, { excludeTeamLinks: true }), execute: teams.execute },
  { name: 'mail', search: mail.search, execute: mail.execute },
  { name: 'snippet', search: snippet.search, execute: snippet.execute },
  { name: 'fav', search: fav.search, execute: fav.execute },
  { name: 'g', search: g.search, execute: g.execute },
  { name: 'app', search: app.search, execute: app.execute },
  { name: 'custom', search: custom.search, execute: custom.execute },
  { name: 'focus', search: focus.search, execute: focus.execute },
  { name: 'gif', search: gif.search, execute: gif.execute },
  { name: 'lookup', search: lookup.search, execute: lookup.execute },
  { name: 'tz', search: tz.search, execute: tz.execute },
  { name: 'case', search: caseCmd.search, execute: caseCmd.execute },
  { name: 'chmod', search: chmod.search, execute: chmod.execute },
  { name: 'color', search: color.search, execute: color.execute },
  { name: 'cron', search: cron.search, execute: cron.execute },
  { name: 'emoji', search: emoji.search, execute: emoji.execute },
  { name: 'git', search: git.search, execute: git.execute },
  { name: 'hash', search: hash.search, execute: hash.execute },
  { name: 'http', search: http.search, execute: http.execute },
  { name: 'ip', search: ip.search, execute: ip.execute },
  { name: 'json', search: json.search, execute: json.execute },
  { name: 'lorem', search: lorem.search, execute: lorem.execute },
  { name: 'mime', search: mime.search, execute: mime.execute },
  { name: 'port', search: port.search, execute: port.execute },
  { name: 'pt', search: pt.search, execute: pt.execute },
  { name: 'pwd', search: pwd.search, execute: pwd.execute },
  { name: 'qr', search: qr.search, execute: qr.execute },
  { name: 'regex', search: regex.search, execute: regex.execute },
  { name: 'text', search: text.search, execute: text.execute },
  { name: 'unit', search: unit.search, execute: unit.execute },
  { name: 'url', search: url.search, execute: url.execute },
  { name: 'uuid', search: uuid.search, execute: uuid.execute },
  { name: 'diff', search: diff.search, execute: diff.execute },
  { name: 'env', search: env.search, execute: env.execute },
  { name: 'key', search: key.search, execute: key.execute }
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
