import { clipboard } from 'electron'
import Fuse from 'fuse.js'
import { readSnippets } from '../config'
import type { SearchResultItem, Snippet } from '../../shared/types'

let cachedSnippetsRef: Snippet[] | null = null
let cachedSnippetsFuse: Fuse<Snippet> | null = null

export function search(query: string): SearchResultItem[] {
  const snippets = readSnippets()
  if (cachedSnippetsRef !== snippets || !cachedSnippetsFuse) {
    cachedSnippetsRef = snippets
    cachedSnippetsFuse = new Fuse(snippets, { keys: ['name'], threshold: 0.35 })
  }
  const matches = query ? cachedSnippetsFuse.search(query).map((r) => r.item) : snippets
  return matches.map((s) => ({ label: s.name, sublabel: s.text.slice(0, 60), value: s.text }))
}

export async function execute(item: SearchResultItem): Promise<void> {
  clipboard.writeText(item.value)
}
