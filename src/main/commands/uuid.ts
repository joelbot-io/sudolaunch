import { clipboard } from 'electron'
import { randomUUID, randomBytes } from 'crypto'
import type { SearchResultItem } from '../../shared/types'

/**
 * Generates a UUID v7 (timestamp-ordered 128-bit ID).
 */
function generateUuidV7(): string {
  const timestamp = BigInt(Date.now())
  const bytes = randomBytes(16)

  // 48-bit timestamp in milliseconds
  bytes[0] = Number((timestamp >> 40n) & 0xffn)
  bytes[1] = Number((timestamp >> 32n) & 0xffn)
  bytes[2] = Number((timestamp >> 24n) & 0xffn)
  bytes[3] = Number((timestamp >> 16n) & 0xffn)
  bytes[4] = Number((timestamp >> 8n) & 0xffn)
  bytes[5] = Number(timestamp & 0xffn)

  // Version 7: set bits 4-7 of byte 6 to 0111 (0x70)
  bytes[6] = (bytes[6] & 0x0f) | 0x70
  // Variant: set bits 6-7 of byte 8 to 10 (0x80)
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function parseUuidInfo(uuidStr: string): { version?: number; variant?: string; timestamp?: string } | null {
  const cleaned = uuidStr.trim().replace(/^urn:uuid:/i, '').replace(/[{}]/g, '').toLowerCase()
  const match = cleaned.match(/^([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})$/)
  if (!match) return null

  const versionHex = match[3].charAt(0)
  const version = parseInt(versionHex, 16)
  const variantByte = parseInt(match[4].slice(0, 2), 16)

  let variant = 'RFC 4122 / Leach-Salz'
  if ((variantByte & 0x80) === 0) variant = 'NCS backward compatibility'
  else if ((variantByte & 0xc0) === 0x80) variant = 'RFC 4122 standard'
  else if ((variantByte & 0xe0) === 0xc0) variant = 'Microsoft GUID legacy'
  else variant = 'Reserved for future definition'

  let timestampStr: string | undefined
  if (version === 7) {
    const timeHex = match[1] + match[2]
    const ms = parseInt(timeHex, 16)
    timestampStr = new Date(ms).toISOString()
  }

  return { version, variant, timestamp: timestampStr }
}

export function search(query: string): SearchResultItem[] {
  const q = query.trim()

  // 1. Inspect existing UUID if query looks like one
  if (q) {
    const info = parseUuidInfo(q)
    if (info) {
      const results: SearchResultItem[] = []
      const norm = q.replace(/[{}]/g, '').toLowerCase()
      results.push({
        label: `UUID v${info.version ?? '?'}: ${norm}`,
        sublabel: `Variant: ${info.variant}${info.timestamp ? ` · Embedded Time: ${info.timestamp}` : ''}`,
        value: norm
      })
      results.push({
        label: `Uppercase: ${norm.toUpperCase()}`,
        sublabel: 'Standard uppercase formatted UUID',
        value: norm.toUpperCase()
      })
      results.push({
        label: `GUID struct: {${norm}}`,
        sublabel: 'C# / Windows Registry bracketed GUID format',
        value: `{${norm}}`
      })
      results.push({
        label: `No Hyphens: ${norm.replace(/-/g, '')}`,
        sublabel: '32-character compact hexadecimal string',
        value: norm.replace(/-/g, '')
      })
      return results
    }
  }

  // 2. Generate new UUIDs
  const v4 = randomUUID()
  const v7 = generateUuidV7()
  const b64 = Buffer.from(v4.replace(/-/g, ''), 'hex').toString('base64url')

  return [
    {
      label: `UUID v4: ${v4}`,
      sublabel: 'Standard random UUID (RFC 4122 v4)',
      value: v4
    },
    {
      label: `Uppercase: ${v4.toUpperCase()}`,
      sublabel: 'Standard uppercase formatted UUID',
      value: v4.toUpperCase()
    },
    {
      label: `No Hyphens: ${v4.replace(/-/g, '')}`,
      sublabel: '32-character compact hex string',
      value: v4.replace(/-/g, '')
    },
    {
      label: `GUID: {${v4}}`,
      sublabel: 'C# / Windows Registry format',
      value: `{${v4}}`
    },
    {
      label: `UUID v7 (Time-Ordered): ${v7}`,
      sublabel: 'Modern timestamp-ordered UUID v7',
      value: v7
    },
    {
      label: `Short (Base64url): ${b64}`,
      sublabel: '22-character URL-safe compact UUID',
      value: b64
    },
    {
      label: `URN: urn:uuid:${v4}`,
      sublabel: 'Formal Uniform Resource Name format',
      value: `urn:uuid:${v4}`
    }
  ]
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
