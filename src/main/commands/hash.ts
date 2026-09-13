import { clipboard } from 'electron'
import { createHash } from 'crypto'
import type { SearchResultItem } from '../../shared/types'

function tryDecodeJwt(token: string): { header: string; payload: string } | null {
  const parts = token.trim().split('.')
  if (parts.length !== 3) return null
  try {
    const headerStr = Buffer.from(parts[0], 'base64url').toString('utf-8')
    const payloadStr = Buffer.from(parts[1], 'base64url').toString('utf-8')
    // Validate that header and payload parse as valid JSON objects
    const headerJson = JSON.parse(headerStr)
    const payloadJson = JSON.parse(payloadStr)
    if (typeof headerJson === 'object' && typeof payloadJson === 'object') {
      return {
        header: JSON.stringify(headerJson, null, 2),
        payload: JSON.stringify(payloadJson, null, 2)
      }
    }
  } catch {
    // Not a valid JWT
  }
  return null
}

function tryBase64Decode(str: string): string | null {
  try {
    const decoded = Buffer.from(str, 'base64').toString('utf-8')
    // Basic sanity check: re-encoding should roughly match or produce printable characters
    if (/^[\x20-\x7E\r\n\t]+$/.test(decoded) && decoded !== str) {
      return decoded
    }
  } catch {
    // ignore
  }
  return null
}

function tryUrlDecode(str: string): string | null {
  try {
    const decoded = decodeURIComponent(str)
    if (decoded !== str) return decoded
  } catch {
    // ignore
  }
  return null
}

function tryHexDecode(str: string): string | null {
  const cleaned = str.replace(/^0x/i, '').replace(/\s+/g, '')
  if (/^[0-9a-fA-F]+$/.test(cleaned) && cleaned.length % 2 === 0) {
    try {
      const decoded = Buffer.from(cleaned, 'hex').toString('utf-8')
      if (/^[\x20-\x7E\r\n\t]+$/.test(decoded)) {
        return decoded
      }
    } catch {
      // ignore
    }
  }
  return null
}

export function search(query: string): SearchResultItem[] {
  let q = query.trim()

  if (!q) {
    const cb = clipboard.readText().trim()
    if (cb && cb.length < 1000) {
      q = cb
    }
  }

  if (!q) {
    return [
      {
        label: 'Enter text to hash or decode (or copy to clipboard)',
        sublabel: 'Examples: /hash myPassword123 · /hash eyJhbGciOi... (JWT) · /hash aGVsbG8= (Base64)',
        value: '',
        disabled: true
      }
    ]
  }

  const results: SearchResultItem[] = []

  // 1. Check for JWT
  const jwt = tryDecodeJwt(q)
  if (jwt) {
    results.push({
      label: 'JWT Payload (JSON)',
      sublabel: jwt.payload.replace(/\s+/g, ' ').slice(0, 100) + '...',
      value: jwt.payload
    })
    results.push({
      label: 'JWT Header (JSON)',
      sublabel: jwt.header.replace(/\s+/g, ' '),
      value: jwt.header
    })
  }

  // 2. Check for Decodings (Base64, URL, Hex)
  const b64Decoded = tryBase64Decode(q)
  if (b64Decoded) {
    results.push({
      label: `Base64 Decoded: ${b64Decoded.slice(0, 60)}`,
      sublabel: 'Decoded from Base64 string',
      value: b64Decoded
    })
  }

  const urlDecoded = tryUrlDecode(q)
  if (urlDecoded) {
    results.push({
      label: `URL Decoded: ${urlDecoded.slice(0, 60)}`,
      sublabel: 'Decoded from URL-encoded string',
      value: urlDecoded
    })
  }

  const hexDecoded = tryHexDecode(q)
  if (hexDecoded) {
    results.push({
      label: `Hex Decoded: ${hexDecoded.slice(0, 60)}`,
      sublabel: 'Decoded from Hex string',
      value: hexDecoded
    })
  }

  // 3. Hashes
  const sha256 = createHash('sha256').update(q, 'utf8').digest('hex')
  results.push({
    label: `SHA-256: ${sha256.slice(0, 16)}…${sha256.slice(-8)}`,
    sublabel: sha256,
    value: sha256
  })

  const sha512 = createHash('sha512').update(q, 'utf8').digest('hex')
  results.push({
    label: `SHA-512: ${sha512.slice(0, 16)}…${sha512.slice(-8)}`,
    sublabel: sha512,
    value: sha512
  })

  const md5 = createHash('md5').update(q, 'utf8').digest('hex')
  results.push({
    label: `MD5: ${md5}`,
    sublabel: '32-character hexadecimal MD5 hash',
    value: md5
  })

  const sha1 = createHash('sha1').update(q, 'utf8').digest('hex')
  results.push({
    label: `SHA-1: ${sha1}`,
    sublabel: '40-character hexadecimal SHA-1 hash',
    value: sha1
  })

  // 4. Encodings
  const b64Encoded = Buffer.from(q, 'utf8').toString('base64')
  results.push({
    label: `Base64: ${b64Encoded.length > 50 ? b64Encoded.slice(0, 47) + '...' : b64Encoded}`,
    sublabel: 'UTF-8 Base64 encoded string',
    value: b64Encoded
  })

  const urlEncoded = encodeURIComponent(q)
  results.push({
    label: `URL Encoded: ${urlEncoded.length > 50 ? urlEncoded.slice(0, 47) + '...' : urlEncoded}`,
    sublabel: 'Percent-encoded URI component',
    value: urlEncoded
  })

  const hexEncoded = Buffer.from(q, 'utf8').toString('hex')
  results.push({
    label: `Hex: ${hexEncoded.length > 50 ? hexEncoded.slice(0, 47) + '...' : hexEncoded}`,
    sublabel: 'Hexadecimal string representation',
    value: hexEncoded
  })

  return results
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
