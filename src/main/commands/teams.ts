import { shell } from 'electron'
import type { SearchResultItem } from '../../shared/types'
import { searchContacts } from './contactSearch'

export function search(query: string): SearchResultItem[] {
  return searchContacts(query)
}

export async function execute(item: SearchResultItem): Promise<void> {
  // https://teams.microsoft.com/l/chat/... is the deep link format new Teams registers as a
  // protocol handler and routes into the desktop app; msteams://l/chat/... launches the app
  // but new Teams doesn't reliably act on the deep-link payload, leaving it on the home screen.
  const url = `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(item.value)}`
  await shell.openExternal(url)
}
