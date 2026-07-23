import { shell } from 'electron'
import type { SearchResultItem } from '../../shared/types'
import { searchContacts } from './contactSearch'

export function search(query: string): SearchResultItem[] {
  return searchContacts(query)
}

export async function execute(item: SearchResultItem): Promise<void> {
  // See teams.ts — https://teams.microsoft.com/l/call/... is the deep link format new Teams
  // reliably routes into the desktop app; msteams://l/call/... often just opens to the home screen.
  const url = `https://teams.microsoft.com/l/call/0/0?users=${encodeURIComponent(item.value)}`
  await shell.openExternal(url)
}
