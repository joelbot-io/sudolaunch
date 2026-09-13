import { clipboard } from 'electron'
import type { SearchResultItem } from '../../shared/types'

export function search(query: string): SearchResultItem[] {
  let text = query.trim()

  if (!text) {
    const cb = clipboard.readText().trim()
    if (cb) {
      text = cb
    }
  }

  if (!text) {
    return [
      {
        label: 'Enter text or copy text to clipboard to analyze and transform',
        sublabel: 'Examples: /text Apple, Banana, Cherry · /text multi-line text',
        value: '',
        disabled: true
      }
    ]
  }

  const lines = text.split(/\r?\n/)
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0)
  const words = text.split(/\s+/).filter((w) => w.length > 0)
  const charCount = text.length
  const charNoSpaces = text.replace(/\s+/g, '').length
  const readMins = Math.max(1, Math.round(words.length / 200))

  // Transformations
  const sortedAsc = [...nonEmptyLines].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join('\n')
  const sortedDesc = [...nonEmptyLines].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).join('\n')
  const uniqueLines = Array.from(new Set(nonEmptyLines.map((l) => l.trim()))).join('\n')
  const trimmed = nonEmptyLines.map((l) => l.trim()).join('\n')
  const commaJoined = nonEmptyLines.map((l) => l.trim()).join(', ')
  const quotedCommaJoined = nonEmptyLines.map((l) => `"${l.trim()}"`).join(', ')
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const reversed = text.split('').reverse().join('')

  const results: SearchResultItem[] = [
    {
      label: `Text Stats: ${words.length} words · ${charCount} chars (${charNoSpaces} without spaces)`,
      sublabel: `${lines.length} lines (${nonEmptyLines.length} non-empty) · ~${readMins} min read`,
      value: `${words.length} words, ${charCount} characters, ${lines.length} lines`
    },
    {
      label: `Deduplicate Lines (${uniqueLines.split('\n').length} unique lines)`,
      sublabel: 'Removes duplicate lines while preserving single occurrences',
      value: uniqueLines
    },
    {
      label: `Sort Lines (A-Z)`,
      sublabel: 'Alphabetically sorted non-empty lines',
      value: sortedAsc
    },
    {
      label: `Sort Lines (Z-A)`,
      sublabel: 'Reverse alphabetically sorted non-empty lines',
      value: sortedDesc
    },
    {
      label: `Join Lines with Commas: ${commaJoined.slice(0, 50)}${commaJoined.length > 50 ? '...' : ''}`,
      sublabel: 'Flattens multiple lines into comma-separated items',
      value: commaJoined
    },
    {
      label: `Join with Quotes: ${quotedCommaJoined.slice(0, 50)}${quotedCommaJoined.length > 50 ? '...' : ''}`,
      sublabel: 'Surrounds each line with quotes and comma-separates',
      value: quotedCommaJoined
    },
    {
      label: `Strip Empty Lines & Trim`,
      sublabel: 'Removes leading/trailing whitespace and blank rows',
      value: trimmed
    },
    {
      label: `URL Slug: ${slug.slice(0, 50)}${slug.length > 50 ? '...' : ''}`,
      sublabel: 'Converts text to URL-friendly lowercase kebab-case slug',
      value: slug
    },
    {
      label: `Reverse Text: ${reversed.slice(0, 50)}${reversed.length > 50 ? '...' : ''}`,
      sublabel: 'Inverts string characters end-to-start',
      value: reversed
    }
  ]

  return results
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
