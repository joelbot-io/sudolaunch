import { clipboard } from 'electron'
import type { SearchResultItem } from '../../shared/types'

function computeLineDiff(text1: string, text2: string): { diffText: string; added: number; removed: number; unchanged: number } {
  const lines1 = text1.split('\n')
  const lines2 = text2.split('\n')

  const set1 = new Set(lines1)
  const set2 = new Set(lines2)

  let added = 0
  let removed = 0
  let unchanged = 0

  const diffLines: string[] = []

  for (const l of lines1) {
    if (!set2.has(l)) {
      diffLines.push(`- ${l}`)
      removed++
    } else {
      unchanged++
    }
  }

  for (const l of lines2) {
    if (!set1.has(l)) {
      diffLines.push(`+ ${l}`)
      added++
    }
  }

  return {
    diffText: diffLines.join('\n'),
    added,
    removed,
    unchanged
  }
}

function compareJson(obj1: Record<string, unknown>, obj2: Record<string, unknown>): { addedKeys: string[]; removedKeys: string[]; modifiedKeys: string[] } {
  const keys1 = new Set(Object.keys(obj1))
  const keys2 = new Set(Object.keys(obj2))

  const addedKeys = Array.from(keys2).filter((k) => !keys1.has(k))
  const removedKeys = Array.from(keys1).filter((k) => !keys2.has(k))
  const modifiedKeys = Array.from(keys1).filter((k) => keys2.has(k) && JSON.stringify(obj1[k]) !== JSON.stringify(obj2[k]))

  return { addedKeys, removedKeys, modifiedKeys }
}

export function search(query: string): SearchResultItem[] {
  let left = ''
  let right = ''

  if (query.includes(' vs ')) {
    const parts = query.split(' vs ')
    left = parts[0].trim()
    right = parts.slice(1).join(' vs ').trim()
  } else if (query.includes(' | ')) {
    const parts = query.split(' | ')
    left = parts[0].trim()
    right = parts.slice(1).join(' | ').trim()
  } else {
    const cb = clipboard.readText().trim()
    if (cb && query.trim()) {
      left = cb
      right = query.trim()
    }
  }

  if (!left || !right) {
    const cb = clipboard.readText().trim()
    const cbPreview = cb ? `Clipboard: "${cb.slice(0, 30)}${cb.length > 30 ? '...' : ''}"` : 'Clipboard is empty'
    return [
      {
        label: 'Compare text, code, or JSON',
        sublabel: `Syntax: /diff <text1> vs <text2> · Or copy text to clipboard and type: /diff <new text>`,
        value: '',
        disabled: true
      },
      {
        label: `Current Clipboard Context: ${cbPreview}`,
        sublabel: cb ? 'Type your new text after /diff to compare against clipboard' : 'Copy some text to clipboard first',
        value: cb,
        disabled: !cb
      }
    ]
  }

  const items: SearchResultItem[] = []

  // Check if both are valid JSON
  let isJson1 = false
  let isJson2 = false
  let json1: Record<string, unknown> = {}
  let json2: Record<string, unknown> = {}

  try {
    json1 = JSON.parse(left)
    isJson1 = typeof json1 === 'object' && json1 !== null && !Array.isArray(json1)
  } catch {
    // not JSON
  }

  try {
    json2 = JSON.parse(right)
    isJson2 = typeof json2 === 'object' && json2 !== null && !Array.isArray(json2)
  } catch {
    // not JSON
  }

  if (isJson1 && isJson2) {
    const { addedKeys, removedKeys, modifiedKeys } = compareJson(json1, json2)
    const jsonSummary = [
      `JSON Comparison:`,
      `+ Added Keys: ${addedKeys.length ? addedKeys.join(', ') : 'none'}`,
      `- Removed Keys: ${removedKeys.length ? removedKeys.join(', ') : 'none'}`,
      `~ Modified Keys: ${modifiedKeys.length ? modifiedKeys.join(', ') : 'none'}`
    ].join('\n')

    items.push({
      label: `JSON Diff: +${addedKeys.length} added, -${removedKeys.length} removed, ~${modifiedKeys.length} modified`,
      sublabel: 'Valid JSON detected · ↵ Copy key comparison breakdown',
      value: jsonSummary
    })
  }

  // Text / line-based diff
  const { diffText, added, removed } = computeLineDiff(left, right)
  const unifiedHeader = `--- original\n+++ updated\n${diffText}`

  const charDelta = right.length - left.length
  const sign = charDelta >= 0 ? `+${charDelta}` : `${charDelta}`

  items.push({
    label: `Unified Diff Patch: +${added} lines, -${removed} lines (${sign} chars)`,
    sublabel: 'Standard unified diff patch format · ↵ to copy patch to clipboard',
    value: unifiedHeader
  })

  items.push({
    label: `Left / Original Text (${left.length} chars, ${left.split('\n').length} lines)`,
    sublabel: `"${left.slice(0, 60)}${left.length > 60 ? '...' : ''}" · ↵ to copy original`,
    value: left
  })

  items.push({
    label: `Right / Updated Text (${right.length} chars, ${right.split('\n').length} lines)`,
    sublabel: `"${right.slice(0, 60)}${right.length > 60 ? '...' : ''}" · ↵ to copy updated`,
    value: right
  })

  return items
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
