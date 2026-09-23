import { clipboard } from 'electron'
import type { SearchResultItem } from '../../shared/types'

interface ParsedCurl {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

function parseCurlCommand(raw: string): ParsedCurl | null {
  const clean = raw.replace(/\\\r?\n/g, ' ').trim()
  if (!clean.toLowerCase().startsWith('curl')) return null

  // Extract URL: either first non-flag argument or after -X/flags
  let url = ''
  let method = 'GET'
  const headers: Record<string, string> = {}
  let body: string | undefined

  // Match flags
  const tokens: string[] = []
  let current = ''
  let inQuote: '"' | "'" | null = null

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null
      } else {
        current += ch
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch
    } else if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
    } else {
      current += ch
    }
  }
  if (current) tokens.push(current)

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === '-X' || t === '--request') {
      method = (tokens[++i] || 'GET').toUpperCase()
    } else if (t === '-H' || t === '--header') {
      const h = tokens[++i] || ''
      const colon = h.indexOf(':')
      if (colon !== -1) {
        headers[h.slice(0, colon).trim()] = h.slice(colon + 1).trim()
      }
    } else if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary') {
      body = tokens[++i] || ''
      if (method === 'GET') method = 'POST'
    } else if (!t.startsWith('-') && !url) {
      url = t
    }
  }

  if (!url) return null
  return { url, method, headers, body }
}

function generateFetchSnippet(parsed: ParsedCurl): string {
  const options: Record<string, unknown> = {
    method: parsed.method
  }
  if (Object.keys(parsed.headers).length > 0) {
    options.headers = parsed.headers
  }
  if (parsed.body) {
    options.body = parsed.body
  }

  return `const response = await fetch("${parsed.url}", ${JSON.stringify(options, null, 2)});\nconst data = await response.json();\nconsole.log(data);`
}

function generatePythonSnippet(parsed: ParsedCurl): string {
  const lines = ['import requests', '']
  const fn = parsed.method.toLowerCase()
  let args = `"${parsed.url}"`
  if (Object.keys(parsed.headers).length > 0) {
    args += `, headers=${JSON.stringify(parsed.headers)}`
  }
  if (parsed.body) {
    args += `, data=${JSON.stringify(parsed.body)}`
  }
  lines.push(`response = requests.${fn}(${args})`)
  lines.push('print(response.status_code, response.text)')
  return lines.join('\n')
}

function generateGoSnippet(parsed: ParsedCurl): string {
  return `req, err := http.NewRequest("${parsed.method}", "${parsed.url}", ${parsed.body ? `strings.NewReader(${JSON.stringify(parsed.body)})` : 'nil'})\nif err != nil {\n\tlog.Fatal(err)\n}`
}

function generatePowerShellSnippet(parsed: ParsedCurl): string {
  let cmd = `Invoke-RestMethod -Uri "${parsed.url}" -Method ${parsed.method}`
  if (Object.keys(parsed.headers).length > 0) {
    const h = Object.entries(parsed.headers)
      .map(([k, v]) => `"${k}" = "${v}"`)
      .join('; ')
    cmd += ` -Headers @{ ${h} }`
  }
  if (parsed.body) {
    cmd += ` -Body '${parsed.body}'`
  }
  return cmd
}

export async function search(query: string): Promise<SearchResultItem[]> {
  const q = query.trim()
  const cb = clipboard.readText().trim()

  const curlCandidate = q.toLowerCase().startsWith('curl ')
    ? q
    : cb.toLowerCase().startsWith('curl ')
      ? cb
      : null

  if (curlCandidate) {
    const parsed = parseCurlCommand(curlCandidate)
    if (parsed) {
      const fetchCode = generateFetchSnippet(parsed)
      const pythonCode = generatePythonSnippet(parsed)
      const psCode = generatePowerShellSnippet(parsed)
      const goCode = generateGoSnippet(parsed)

      return [
        {
          label: `⚡ Convert to JS/TS fetch() (${parsed.method} ${parsed.url})`,
          sublabel: 'Standard async fetch snippet · ↵ to copy JavaScript code',
          value: fetchCode
        },
        {
          label: `🐍 Convert to Python requests (${parsed.method})`,
          sublabel: 'requests library call · ↵ to copy Python code',
          value: pythonCode
        },
        {
          label: `💻 Convert to PowerShell (Invoke-RestMethod)`,
          sublabel: 'PowerShell native REST command · ↵ to copy command',
          value: psCode
        },
        {
          label: `🔷 Convert to Go (net/http)`,
          sublabel: 'Go HTTP request creation · ↵ to copy Go code',
          value: goCode
        },
        {
          label: `📋 Raw cURL Command`,
          sublabel: `${curlCandidate.slice(0, 60)}... · ↵ to copy raw cURL`,
          value: curlCandidate
        }
      ]
    }
  }

  // URL probe mode
  const urlCandidate = q.startsWith('http://') || q.startsWith('https://') ? q : null

  if (urlCandidate) {
    try {
      const start = Date.now()
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 4000)

      const res = await fetch(urlCandidate, {
        method: 'HEAD',
        signal: controller.signal
      }).catch(async () => {
        // Fallback to GET if HEAD rejected
        return await fetch(urlCandidate, {
          method: 'GET',
          signal: controller.signal
        })
      })

      clearTimeout(timeoutId)
      const latency = Date.now() - start

      const statusIcon = res.status >= 200 && res.status < 300 ? '🟢' : res.status < 400 ? '🟡' : '🔴'
      const contentType = res.headers.get('content-type') || 'unknown'
      const contentLength = res.headers.get('content-length')
      const server = res.headers.get('server') || 'unknown'

      return [
        {
          label: `${statusIcon} HTTP ${res.status} ${res.statusText} (${latency}ms)`,
          sublabel: `${urlCandidate} · Content-Type: ${contentType} · ↵ Copy Status`,
          value: `${res.status} ${res.statusText}`
        },
        {
          label: `Server: ${server} · Size: ${contentLength ? `${contentLength} bytes` : 'chunked'}`,
          sublabel: `Latency: ${latency}ms · ↵ Copy Headers`,
          value: Array.from(res.headers.entries())
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')
        }
      ]
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return [
        {
          label: `Failed to probe ${urlCandidate}`,
          sublabel: msg,
          value: '',
          disabled: true
        }
      ]
    }
  }

  return [
    {
      label: 'cURL Code Generator & HTTP Prober',
      sublabel: 'Paste a cURL command (or copy one to clipboard) to convert to fetch/Python/Go, or type a URL to test it',
      value: '',
      disabled: true
    }
  ]
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
