import { clipboard } from 'electron'
import type { SearchResultItem } from '../../shared/types'

export function search(query: string): SearchResultItem[] {
  let raw = query.trim()

  if (!raw) {
    const cb = clipboard.readText().trim()
    if (cb && (cb.startsWith('http://') || cb.startsWith('https://') || cb.startsWith('www.') || cb.includes('?'))) {
      raw = cb
    }
  }

  if (!raw) {
    return [
      {
        label: 'Enter URL to inspect components, query params, and generate code snippets',
        sublabel: 'Examples: /url https://api.example.com/v1/users?org=acme&role=admin&limit=50',
        value: '',
        disabled: true
      }
    ]
  }

  let urlStr = raw
  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = `https://${urlStr}`
  }

  try {
    const parsed = new URL(urlStr)
    const results: SearchResultItem[] = []

    // 1. Overview
    results.push({
      label: `Clean URL: ${parsed.origin}${parsed.pathname}`,
      sublabel: `Base URL without query string or hash (${parsed.hostname})`,
      value: `${parsed.origin}${parsed.pathname}`
    })

    // 2. Individual query parameters
    const params = Array.from(parsed.searchParams.entries())
    if (params.length > 0) {
      for (const [key, val] of params) {
        results.push({
          label: `Param "${key}": "${val}"`,
          sublabel: `Query parameter in search string (${key}=${val})`,
          value: val
        })
      }
    }

    // 3. Components
    results.push({
      label: `Hostname: ${parsed.hostname}`,
      sublabel: `Domain / Host (${parsed.port ? `Port: ${parsed.port}` : 'Default Port'})`,
      value: parsed.hostname
    })

    results.push({
      label: `Pathname: ${parsed.pathname}`,
      sublabel: 'URL resource path',
      value: parsed.pathname
    })

    results.push({
      label: `Origin: ${parsed.origin}`,
      sublabel: `Protocol (${parsed.protocol}) + Hostname (${parsed.hostname})`,
      value: parsed.origin
    })

    if (parsed.hash) {
      results.push({
        label: `Hash / Fragment: ${parsed.hash}`,
        sublabel: 'Anchor / URL fragment',
        value: parsed.hash
      })
    }

    // 4. Code Snippets
    const curlSnippet = `curl -X GET "${urlStr}"`
    const fetchSnippet = `const res = await fetch("${urlStr}");\nconst data = await res.json();`
    const psSnippet = `Invoke-RestMethod -Uri "${urlStr}" -Method Get`

    results.push({
      label: `cURL: ${curlSnippet.slice(0, 50)}...`,
      sublabel: 'cURL command-line HTTP request',
      value: curlSnippet
    })

    results.push({
      label: `JavaScript fetch(): const res = await fetch(...)`,
      sublabel: 'ES6 async/await HTTP request boilerplate',
      value: fetchSnippet
    })

    results.push({
      label: `PowerShell: Invoke-RestMethod -Uri ...`,
      sublabel: 'PowerShell REST API invocation command',
      value: psSnippet
    })

    // 5. Encoded / Decoded
    results.push({
      label: `Decoded URL: ${decodeURIComponent(urlStr).slice(0, 50)}...`,
      sublabel: 'URL with percent-encoding decoded',
      value: decodeURIComponent(urlStr)
    })

    results.push({
      label: `Encoded URL: ${encodeURI(urlStr).slice(0, 50)}...`,
      sublabel: 'Safely encoded URL string',
      value: encodeURI(urlStr)
    })

    return results
  } catch (err) {
    return [
      {
        label: 'Invalid URL Format',
        sublabel: err instanceof Error ? err.message : String(err),
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
