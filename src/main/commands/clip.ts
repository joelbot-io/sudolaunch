import { existsSync } from 'fs'
import { clipboard, shell } from 'electron'
import Fuse from 'fuse.js'
import type { SearchResultItem } from '../../shared/types'

interface ClipEntry {
  id: number
  text: string
  preview: string
  kind: 'url' | 'json' | 'path' | 'color' | 'text'
  chars: number
  lines: number
  timestamp: string
}

const MAX_CLIP_HISTORY = 40
let clipRing: ClipEntry[] = []
let nextClipId = 1
let lastObservedText = ''
let pollerStarted = false

function detectKind(raw: string): ClipEntry['kind'] {
  const t = raw.trim()
  if (/^https?:\/\/\S+$/i.test(t)) return 'url'
  if (/^#[0-9a-fA-F]{3,8}$/.test(t) || /^rgba?\([^)]+\)$/i.test(t)) return 'color'
  if (/^[a-zA-Z]:[\\/][^\r\n]+$/.test(t)) return 'path'
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      JSON.parse(t)
      return 'json'
    } catch {
      // not json
    }
  }
  return 'text'
}

function kindBadge(kind: ClipEntry['kind']): string {
  switch (kind) {
    case 'url':
      return '🔗 URL'
    case 'json':
      return '{} JSON'
    case 'path':
      return '📂 Path'
    case 'color':
      return '🎨 Color'
    default:
      return '📋 Text'
  }
}

function captureCurrentClipboard(): void {
  try {
    const current = clipboard.readText()
    if (!current || !current.trim()) return
    if (current === lastObservedText) return
    lastObservedText = current

    const existingIdx = clipRing.findIndex((c) => c.text === current)
    if (existingIdx !== -1) {
      const [existing] = clipRing.splice(existingIdx, 1)
      existing.timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      clipRing.unshift(existing)
      return
    }

    const lines = current.split(/\r?\n/).length
    const oneLine = current.replace(/\s+/g, ' ').trim()
    const preview = oneLine.length > 85 ? `${oneLine.slice(0, 82)}...` : oneLine

    clipRing.unshift({
      id: nextClipId++,
      text: current,
      preview,
      kind: detectKind(current),
      chars: current.length,
      lines,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    })

    if (clipRing.length > MAX_CLIP_HISTORY) {
      clipRing.length = MAX_CLIP_HISTORY
    }
  } catch {
    // ignore clipboard read errors
  }
}

function ensureClipboardPoller(): void {
  if (pollerStarted) return
  pollerStarted = true
  captureCurrentClipboard()
  const timer = setInterval(captureCurrentClipboard, 1200)
  timer.unref?.()
}

// Start tracking clipboard history as soon as the module is loaded
ensureClipboardPoller()

function renderEntryDrilldown(id: number): SearchResultItem[] {
  const entry = clipRing.find((c) => c.id === id)
  if (!entry) {
    return [
      {
        label: '← Back to Clipboard History',
        sublabel: 'Return to /clip list',
        value: '',
        completion: '/clip '
      }
    ]
  }

  const items: SearchResultItem[] = [
    {
      label: '← Back to Clipboard History',
      sublabel: 'Return to /clip list',
      value: '',
      completion: '/clip '
    },
    {
      label: `📋 Copy Original (${entry.chars} chars, ${entry.lines} line${entry.lines === 1 ? '' : 's'})`,
      sublabel: entry.preview,
      value: entry.text
    }
  ]

  const collapsed = entry.text.replace(/\s+/g, ' ').trim()
  if (collapsed !== entry.text) {
    items.push({
      label: `📏 Copy as Single Line (Collapsed Whitespace)`,
      sublabel: collapsed.length > 85 ? `${collapsed.slice(0, 82)}...` : collapsed,
      value: collapsed
    })
  }

  if (entry.kind === 'json') {
    try {
      const parsed = JSON.parse(entry.text)
      const pretty = JSON.stringify(parsed, null, 2)
      const minified = JSON.stringify(parsed)
      items.push({
        label: `{} Copy Prettified JSON (2-space indent)`,
        sublabel: 'Format JSON with indentation',
        value: pretty
      })
      items.push({
        label: `{} Copy Minified JSON`,
        sublabel: minified.length > 85 ? `${minified.slice(0, 82)}...` : minified,
        value: minified
      })
    } catch {
      // ignore
    }
  }

  if (entry.kind === 'url') {
    items.push({
      label: `🌐 Open URL in Browser`,
      sublabel: entry.text.trim(),
      value: `__open_url::${entry.text.trim()}`
    })
  }

  if (entry.kind === 'path' && existsSync(entry.text.trim())) {
    items.push({
      label: `📂 Reveal Path in File Explorer`,
      sublabel: entry.text.trim(),
      value: `__explorer::${entry.text.trim()}`
    })
  }

  // Base64 encode
  const b64 = Buffer.from(entry.text, 'utf8').toString('base64')
  items.push({
    label: `🔐 Copy as Base64 Encoded`,
    sublabel: b64.length > 80 ? `${b64.slice(0, 77)}...` : b64,
    value: b64
  })

  items.push({
    label: `🗑️ Remove Entry from Clipboard History`,
    sublabel: 'Delete this item from /clip ring buffer',
    value: `__delete::${entry.id}`
  })

  return items
}

export function search(query: string): SearchResultItem[] {
  ensureClipboardPoller()
  captureCurrentClipboard()

  const raw = query.trim()

  const drillMatch = raw.match(/^@(\d+)$/)
  if (drillMatch) {
    return renderEntryDrilldown(parseInt(drillMatch[1], 10))
  }

  if (raw.toLowerCase() === 'clear') {
    return [
      {
        label: '🧹 Clear Clipboard History & System Clipboard',
        sublabel: `Remove all ${clipRing.length} recorded clipboard items · ↵ Confirm`,
        value: '__clear_all'
      }
    ]
  }

  const matched = raw
    ? new Fuse(clipRing, {
        keys: ['text', 'preview', 'kind'],
        threshold: 0.35,
        ignoreLocation: true
      })
        .search(raw)
        .map((r) => r.item)
    : clipRing

  const items: SearchResultItem[] = []

  for (let i = 0; i < matched.length; i++) {
    const c = matched[i]
    const activeTag = i === 0 && !raw ? ' · Current' : ''
    items.push({
      label: `${kindBadge(c.kind)}: ${c.preview}`,
      sublabel: `${c.chars} chars · ${c.lines} line${c.lines === 1 ? '' : 's'} · ${c.timestamp}${activeTag} · ↵ Copy · Tab Transform`,
      value: c.text,
      completion: `/clip @${c.id}`,
      executeOnEnter: true
    })
  }

  if (clipRing.length > 0 && (!raw || 'clear'.includes(raw.toLowerCase()))) {
    items.push({
      label: `🧹 Clear Clipboard History (${clipRing.length} items)`,
      sublabel: 'Wipe in-memory clipboard history ring',
      value: '__clear_all'
    })
  }

  if (items.length === 0) {
    return [
      {
        label: raw ? `No clipboard items matching "${raw}"` : 'Clipboard is currently empty',
        sublabel: 'Copy any text, URL, JSON, or file path and it will appear here automatically',
        value: '',
        disabled: true
      }
    ]
  }

  return items
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (!item.value) return

  if (item.value === '__clear_all') {
    clipRing = []
    lastObservedText = ''
    clipboard.clear()
    return
  }

  if (item.value.startsWith('__delete::')) {
    const id = parseInt(item.value.slice('__delete::'.length), 10)
    clipRing = clipRing.filter((c) => c.id !== id)
    return
  }

  if (item.value.startsWith('__open_url::')) {
    const url = item.value.slice('__open_url::'.length)
    await shell.openExternal(url)
    return
  }

  if (item.value.startsWith('__explorer::')) {
    const targetPath = item.value.slice('__explorer::'.length)
    if (existsSync(targetPath)) {
      shell.showItemInFolder(targetPath)
    }
    return
  }

  lastObservedText = item.value
  clipboard.writeText(item.value)
}

