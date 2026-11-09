import Fuse from 'fuse.js'
import { readContacts } from '../config'
import type { Contact, SearchResultItem } from '../../shared/types'

let cachedContactsRef: Contact[] | null = null
let cachedContactsFuse: Fuse<Contact> | null = null

export function searchContacts(query: string): SearchResultItem[] {
  const contacts = readContacts()
  if (!query) {
    return contacts.map(toResultItem)
  }
  if (cachedContactsRef !== contacts || !cachedContactsFuse) {
    cachedContactsRef = contacts
    cachedContactsFuse = new Fuse(contacts, { keys: ['name', 'alias', 'email'], threshold: 0.35 })
  }
  return cachedContactsFuse.search(query).map((r) => toResultItem(r.item))
}

function toResultItem(contact: Contact): SearchResultItem {
  return { label: contact.name, sublabel: contact.email, value: contact.teamsId }
}
