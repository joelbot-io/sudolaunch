import { shell } from 'electron'
import Fuse from 'fuse.js'
import { readLinks } from '../config'
import type { Link, SearchResultItem } from '../../shared/types'

let cachedLinksRef: Link[] | null = null
let cachedLinksFuse: Fuse<Link> | null = null

export function search(query: string): SearchResultItem[] {
  const links = readLinks()
  if (cachedLinksRef !== links || !cachedLinksFuse) {
    cachedLinksRef = links
    cachedLinksFuse = new Fuse(links, { keys: ['name', 'url'], threshold: 0.35 })
  }
  const matches = query ? cachedLinksFuse.search(query).map((r) => r.item) : links
  return matches.map((l) => ({ label: l.name, sublabel: l.url, value: l.url }))
}

export async function execute(item: SearchResultItem): Promise<void> {
  await shell.openExternal(item.value)
}
