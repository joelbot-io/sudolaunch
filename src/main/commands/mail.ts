import { shell } from 'electron'
import Fuse from 'fuse.js'
import { readContacts } from '../config'
import type { SearchResultItem } from '../../shared/types'

export function search(query: string): SearchResultItem[] {
  const contacts = readContacts()
  const matches = query
    ? new Fuse(contacts, { keys: ['name', 'alias', 'email'], threshold: 0.35 }).search(query).map((r) => r.item)
    : contacts
  return matches.map((c) => ({ label: c.name, sublabel: c.email, value: c.email }))
}

export async function execute(item: SearchResultItem): Promise<void> {
  await shell.openExternal(`mailto:${encodeURIComponent(item.value)}`)
}
