import { shell } from 'electron'
import Fuse from 'fuse.js'
import { readContacts } from '../config'
import type { Contact, SearchResultItem } from '../../shared/types'

let cachedContactsRef: Contact[] | null = null
let cachedContactsFuse: Fuse<Contact> | null = null

export function search(query: string): SearchResultItem[] {
  const contacts = readContacts()
  if (cachedContactsRef !== contacts || !cachedContactsFuse) {
    cachedContactsRef = contacts
    cachedContactsFuse = new Fuse(contacts, { keys: ['name', 'alias', 'email'], threshold: 0.35 })
  }
  const matches = query ? cachedContactsFuse.search(query).map((r) => r.item) : contacts
  return matches.map((c) => ({ label: c.name, sublabel: c.email, value: c.email }))
}

export async function execute(item: SearchResultItem): Promise<void> {
  await shell.openExternal(`mailto:${encodeURIComponent(item.value)}`)
}
