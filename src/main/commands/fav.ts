import { shell } from 'electron'
import Fuse from 'fuse.js'
import { readLinks } from '../config'
import type { SearchResultItem } from '../../shared/types'

export function search(query: string): SearchResultItem[] {
  const links = readLinks()
  const matches = query
    ? new Fuse(links, { keys: ['name', 'url'], threshold: 0.35 }).search(query).map((r) => r.item)
    : links
  return matches.map((l) => ({ label: l.name, sublabel: l.url, value: l.url }))
}

export async function execute(item: SearchResultItem): Promise<void> {
  await shell.openExternal(item.value)
}
