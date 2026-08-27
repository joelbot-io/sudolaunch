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

export function search(query: string): SearchResultItem[] {
  const excluded = new Set(readSettings().searchExcludedCommands)
  const enabled = SEARCHABLE.filter((c) => !excluded.has(c.name))

  const results: SearchResultItem[] = []
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
  const source = SEARCHABLE.find((c) => item.value.startsWith(`${c.name}::`))
  if (!source) {
    throw new Error('Unknown search result source')
  }
  const originalValue = item.value.slice(source.name.length + 2)
  await source.execute({ ...item, value: originalValue })
}
