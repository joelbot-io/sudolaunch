import { shell } from 'electron'
import { existsSync, statSync } from 'fs'
import { basename, resolve } from 'path'
import { homedir } from 'os'
import { COMMANDS, type CommandName, type SearchResultItem } from '../../shared/types'
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
import * as expmod from './expmod'
import * as ssh from './ssh'
import * as clip from './clip'

const DEFAULT_EXCLUDED_BY_DEF = new Set<CommandName>(
  COMMANDS.filter((c) => c.excludeFromSearch).map((c) => c.name)
)

interface Searchable {
  name: CommandName
  excludeFromSearch?: boolean
  search: (query: string) => SearchResultItem[]
  execute: (item: SearchResultItem) => Promise<void>
}

// Imports each command module directly (same as commands/index.ts) rather than going
// through that module's private searchers/executors maps, to avoid a circular import.
// Each entry inherits `excludeFromSearch` from COMMANDS in shared/types.ts by default.
const RAW_SEARCHABLE: Searchable[] = [
  { name: 'teams', search: (query) => teams.search(query, { excludeTeamLinks: true }), execute: teams.execute },
  { name: 'mail', search: mail.search, execute: mail.execute },
  { name: 'snippet', search: snippet.search, execute: snippet.execute },
  { name: 'fav', search: fav.search, execute: fav.execute },
  { name: 'g', search: g.search, execute: g.execute },
  { name: 'app', search: app.search, execute: app.execute },
  { name: 'custom', search: (query) => custom.search(query, { fromUniversalSearch: true }), execute: custom.execute },
  { name: 'focus', search: focus.search, execute: focus.execute },
  { name: 'gif', search: gif.search, execute: gif.execute },
  { name: 'lookup', search: lookup.search, execute: lookup.execute },
  { name: 'tz', excludeFromSearch: true, search: tz.search, execute: tz.execute },
  { name: 'case', excludeFromSearch: true, search: caseCmd.search, execute: caseCmd.execute },
  { name: 'chmod', excludeFromSearch: true, search: chmod.search, execute: chmod.execute },
  { name: 'color', excludeFromSearch: true, search: color.search, execute: color.execute },
  { name: 'cron', excludeFromSearch: true, search: cron.search, execute: cron.execute },
  { name: 'emoji', search: emoji.search, execute: emoji.execute },
  { name: 'git', search: git.search, execute: git.execute },
  { name: 'hash', excludeFromSearch: true, search: hash.search, execute: hash.execute },
  { name: 'http', excludeFromSearch: true, search: http.search, execute: http.execute },
  { name: 'ip', excludeFromSearch: true, search: ip.search, execute: ip.execute },
  { name: 'json', excludeFromSearch: true, search: json.search, execute: json.execute },
  { name: 'lorem', excludeFromSearch: true, search: lorem.search, execute: lorem.execute },
  { name: 'mime', excludeFromSearch: true, search: mime.search, execute: mime.execute },
  { name: 'port', excludeFromSearch: true, search: port.search, execute: port.execute },
  { name: 'pt', search: pt.search, execute: pt.execute },
  { name: 'pwd', excludeFromSearch: true, search: pwd.search, execute: pwd.execute },
  { name: 'qr', excludeFromSearch: true, search: qr.search, execute: qr.execute },
  { name: 'regex', excludeFromSearch: true, search: regex.search, execute: regex.execute },
  { name: 'text', excludeFromSearch: true, search: text.search, execute: text.execute },
  { name: 'unit', excludeFromSearch: true, search: unit.search, execute: unit.execute },
  { name: 'url', excludeFromSearch: true, search: url.search, execute: url.execute },
  { name: 'uuid', excludeFromSearch: true, search: uuid.search, execute: uuid.execute },
  { name: 'diff', excludeFromSearch: true, search: diff.search, execute: diff.execute },
  { name: 'env', excludeFromSearch: true, search: env.search, execute: env.execute },
  { name: 'expmod', excludeFromSearch: true, search: expmod.searchSync, execute: expmod.execute },
  { name: 'ssh', search: ssh.search, execute: ssh.execute },
  { name: 'clip', excludeFromSearch: true, search: clip.search, execute: clip.execute },
  { name: 'key', excludeFromSearch: true, search: key.search, execute: key.execute }
]

const SEARCHABLE: Searchable[] = RAW_SEARCHABLE.map((entry) => ({
  ...entry,
  excludeFromSearch: entry.excludeFromSearch ?? DEFAULT_EXCLUDED_BY_DEF.has(entry.name)
}))

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
  if (!query.trim()) return []
  const direct = getDirectResult(query)
  const settingsExcluded = readSettings().searchExcludedCommands
  const excluded = new Set<CommandName>(
    Array.isArray(settingsExcluded) && settingsExcluded.length > 0
      ? settingsExcluded
      : SEARCHABLE.filter((c) => c.excludeFromSearch).map((c) => c.name)
  )
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
        value: `${c.name}::${item.value}`,
        completion: item.completion,
        executeOnEnter: item.executeOnEnter
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
