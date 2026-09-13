import { clipboard } from 'electron'
import type { SearchResultItem } from '../../shared/types'

export function search(query: string): SearchResultItem[] {
  let raw = query.trim()

  if (!raw) {
    const cb = clipboard.readText().trim()
    if (cb && (cb.startsWith('{') || cb.startsWith('['))) {
      raw = cb
    }
  }

  if (!raw) {
    return [
      {
        label: 'Enter JSON or copy JSON to clipboard',
        sublabel: 'Examples: /json {"id": 123, "name": "Antigravity"} · /json [1, 2, 3]',
        value: '',
        disabled: true
      }
    ]
  }

  try {
    const parsed = JSON.parse(raw)
    const pretty2 = JSON.stringify(parsed, null, 2)
    const pretty4 = JSON.stringify(parsed, null, 4)
    const minified = JSON.stringify(parsed)
    const escaped = JSON.stringify(minified)

    const isArr = Array.isArray(parsed)
    const isObj = typeof parsed === 'object' && parsed !== null && !isArr
    const countText = isArr
      ? `${parsed.length} array items`
      : isObj
        ? `${Object.keys(parsed).length} top-level keys`
        : typeof parsed

    const bytes = Buffer.byteLength(minified, 'utf8')

    return [
      {
        label: `Prettify (2 spaces): ${minified.slice(0, 50)}${minified.length > 50 ? '...' : ''}`,
        sublabel: `Valid JSON · ${countText} · ${bytes} bytes`,
        value: pretty2
      },
      {
        label: `Minify / Compact: ${minified.slice(0, 50)}${minified.length > 50 ? '...' : ''}`,
        sublabel: 'Single-line compact JSON without whitespace',
        value: minified
      },
      {
        label: `Prettify (4 spaces)`,
        sublabel: 'Indented with 4 spaces',
        value: pretty4
      },
      {
        label: `Escaped JSON String: ${escaped.slice(0, 50)}...`,
        sublabel: 'Escaped for code string literals and env variables',
        value: escaped
      }
    ]
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return [
      {
        label: 'Invalid JSON',
        sublabel: `Error: ${errMsg}`,
        value: '',
        disabled: true
      }
    ]
  }
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
