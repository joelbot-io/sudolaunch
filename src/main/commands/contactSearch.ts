import Fuse from 'fuse.js'
import { readContacts } from '../config'
import type { SearchResultItem } from '../../shared/types'

export function searchContacts(query: string): SearchResultItem[] {
  const contacts = readContacts()
  if (!query) {
    return contacts.map(toResultItem)
  }
  const fuse = new Fuse(contacts, { keys: ['name', 'alias', 'email'], threshold: 0.35 })
  return fuse.search(query).map((r) => toResultItem(r.item))
}

function toResultItem(contact: ReturnType<typeof readContacts>[number]): SearchResultItem {
  return { label: contact.name, sublabel: contact.email, value: contact.teamsId }
}
