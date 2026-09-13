import { clipboard } from 'electron'
import Fuse from 'fuse.js'
import type { SearchResultItem } from '../../shared/types'

interface RegexPreset {
  name: string
  pattern: string
  category: string
  description: string
  example: string
}

const PRESETS: RegexPreset[] = [
  {
    name: 'Email Address (RFC 5322 Standard)',
    pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
    category: 'Validation',
    description: 'Matches standard email addresses (user@domain.com)',
    example: 'user.name+tag@example.co.uk'
  },
  {
    name: 'URL / Web Address (HTTP/HTTPS)',
    pattern: 'https?:\\/\\/(www\\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\\.[a-zA-Z0-9()]{1,6}\\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)',
    category: 'Web',
    description: 'Matches full web URLs with optional protocol, paths, and query parameters',
    example: 'https://sub.domain.com:8080/path?key=val#hash'
  },
  {
    name: 'IPv4 Address',
    pattern: '^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$',
    category: 'Network',
    description: 'Strict IPv4 octet validation (0-255 range)',
    example: '192.168.1.254'
  },
  {
    name: 'IPv6 Address',
    pattern: '^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$',
    category: 'Network',
    description: 'Standard and compressed IPv6 addresses',
    example: '2001:0db8:85a3:0000:0000:8a2e:0370:7334'
  },
  {
    name: 'Semantic Versioning (SemVer 2.0.0)',
    pattern: '^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$',
    category: 'Dev',
    description: 'Official SemVer regex supporting pre-release and build metadata',
    example: '1.2.3-alpha.1+build.42'
  },
  {
    name: 'UUID / GUID (v1-v7)',
    pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-7][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
    category: 'Identifiers',
    description: 'Standard 36-character hyphenated UUID/GUID',
    example: '4f964095-d227-4c4c-8828-9121a8d0554c'
  },
  {
    name: 'ISO 8601 Date & Timestamp',
    pattern: '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})?)?$',
    category: 'Time',
    description: 'ISO 8601 date, UTC Z-timestamp, or timezone offset',
    example: '2026-09-13T18:30:00.000Z'
  },
  {
    name: 'URL Slug / Kebab Identifier',
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
    category: 'Strings',
    description: 'Lowercase alphanumeric words separated by single hyphens',
    example: 'incident-response-war-room-2026'
  },
  {
    name: 'Strong Password Policy',
    pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$',
    category: 'Security',
    description: 'Min 8 chars: 1 uppercase, 1 lowercase, 1 number, 1 special symbol',
    example: 'P@ssw0rd123!'
  },
  {
    name: 'HEX Color Code',
    pattern: '^#?([a-fA-F0-9]{6}|[a-fA-F0-9]{3}|[a-fA-F0-9]{8})$',
    category: 'Color',
    description: 'Matches 3, 6, or 8 character HEX color strings',
    example: '#3b82f6ff'
  },
  {
    name: 'MAC Hardware Address',
    pattern: '^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$',
    category: 'Network',
    description: 'Colon or hyphen separated 6-byte Ethernet MAC address',
    example: '00:1A:2B:3C:4D:5E'
  },
  {
    name: 'Phone Number (US / North America)',
    pattern: '^\\+?1?[-.\\s]?\\(?[0-9]{3}\\)?[-.\\s]?[0-9]{3}[-.\\s]?[0-9]{4}$',
    category: 'Validation',
    description: 'US formats with optional country code, parentheses, and dashes',
    example: '+1 (555) 019-2834'
  }
]

const fuse = new Fuse(PRESETS, {
  keys: ['name', 'pattern', 'category', 'description', 'example'],
  threshold: 0.35,
  ignoreLocation: true
})

function tryLiveTest(input: string): SearchResultItem[] | null {
  // Check if input looks like: /pattern/flags testString or /pattern/ testString
  const slashMatch = input.match(/^\/([^/]+)\/([gimsuy]*)\s+(.+)$/)
  if (slashMatch) {
    const rawPattern = slashMatch[1]
    const flags = slashMatch[2]
    const testStr = slashMatch[3]
    try {
      const re = new RegExp(rawPattern, flags.includes('g') ? flags : flags + 'g')
      const matches = Array.from(testStr.matchAll(re))
      if (matches.length === 0) {
        return [
          {
            label: `No match found in "${testStr.slice(0, 40)}"`,
            sublabel: `Tested pattern /${rawPattern}/${flags} (0 matches)`,
            value: rawPattern
          }
        ]
      }

      const results: SearchResultItem[] = [
        {
          label: `Match Success: ${matches.length} match${matches.length === 1 ? '' : 'es'} found`,
          sublabel: `Pattern: /${rawPattern}/${flags} · String: "${testStr.slice(0, 40)}"`,
          value: matches[0][0]
        }
      ]

      matches.slice(0, 5).forEach((m, idx) => {
        results.push({
          label: `Match #${idx + 1}: "${m[0]}"`,
          sublabel: `At index ${m.index} in input string`,
          value: m[0]
        })
        if (m.length > 1) {
          for (let g = 1; g < m.length; g++) {
            if (m[g] !== undefined) {
              results.push({
                label: `Capture Group $${g}: "${m[g]}"`,
                sublabel: `Submatch from match #${idx + 1}`,
                value: m[g]
              })
            }
          }
        }
        if (m.groups) {
          for (const [key, val] of Object.entries(m.groups)) {
            results.push({
              label: `Named Group ?<${key}>: "${val}"`,
              sublabel: `Named submatch from match #${idx + 1}`,
              value: val ?? ''
            })
          }
        }
      })

      return results
    } catch (err) {
      return [
        {
          label: 'Regex Syntax Error',
          sublabel: err instanceof Error ? err.message : String(err),
          value: '',
          disabled: true
        }
      ]
    }
  }

  return null
}

export function search(query: string): SearchResultItem[] {
  const q = query.trim()

  if (q) {
    const live = tryLiveTest(q)
    if (live) return live
  }

  const list = q ? fuse.search(q).map((r) => r.item) : PRESETS

  if (list.length === 0) {
    return [
      {
        label: `No regex pattern matching "${q}"`,
        sublabel: 'Try: /regex email · /regex url · /regex ipv4 · /regex semver or test with /pattern/ test_string',
        value: '',
        disabled: true
      }
    ]
  }

  return list.map((item) => ({
    label: `${item.name}: ${item.pattern.slice(0, 45)}${item.pattern.length > 45 ? '...' : ''}`,
    sublabel: `${item.category} · ${item.description}`,
    value: item.pattern
  }))
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
