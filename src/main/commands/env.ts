import fs from 'fs'
import { clipboard } from 'electron'
import type { SearchResultItem } from '../../shared/types'

const SENSITIVE_REGEX = /password|secret|token|key|auth|cred|private/i

function isSensitive(key: string): boolean {
  return SENSITIVE_REGEX.test(key)
}

function parseDotEnv(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx !== -1) {
      const k = trimmed.slice(0, eqIdx).trim()
      let v = trimmed.slice(eqIdx + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      result[k] = v
    }
  }
  return result
}

export function search(query: string): SearchResultItem[] {
  const q = query.trim()
  const qLower = q.toLowerCase()
  const items: SearchResultItem[] = []

  // Check if user is asking for /env path
  if (qLower === 'path') {
    const rawPath = process.env.PATH || process.env.Path || ''
    const dirs = rawPath
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)

    items.push({
      label: `PATH Environment Variable (${dirs.length} entries)`,
      sublabel: 'Press Enter to copy the entire raw PATH string',
      value: rawPath
    })

    for (let i = 0; i < dirs.length; i++) {
      const dir = dirs[i]
      const exists = fs.existsSync(dir)
      const icon = exists ? '🟢' : '🔴'
      const status = exists ? 'Valid directory' : 'Missing / Broken directory path'
      items.push({
        label: `${icon} [${i + 1}] ${dir}`,
        sublabel: `${status} · ↵ to copy path`,
        value: dir
      })
    }
    return items
  }

  // Check clipboard for .env file format if query is empty or starts with "convert"
  const cb = clipboard.readText().trim()
  const checkText = q.includes('=') ? q : cb.includes('=') && cb.includes('\n') ? cb : ''

  if (checkText) {
    const parsed = parseDotEnv(checkText)
    const keys = Object.keys(parsed)
    if (keys.length > 0) {
      const jsonStr = JSON.stringify(parsed, null, 2)
      const psStr = keys.map((k) => `$env:${k} = "${parsed[k]}"`).join('\n')
      const bashStr = keys.map((k) => `export ${k}="${parsed[k]}"`).join('\n')

      items.push({
        label: `📄 Convert .env to JSON (${keys.length} variables)`,
        sublabel: `Valid parsed .env · ↵ to copy formatted JSON`,
        value: jsonStr
      })
      items.push({
        label: `📄 Convert .env to PowerShell ($env:KEY = "VAL")`,
        sublabel: `Export script for PowerShell · ↵ to copy script`,
        value: psStr
      })
      items.push({
        label: `📄 Convert .env to Bash (export KEY="VAL")`,
        sublabel: `Export script for Bash/Zsh · ↵ to copy script`,
        value: bashStr
      })
    }
  }

  // Filter process.env variables
  const envKeys = Object.keys(process.env).sort((a, b) => a.localeCompare(b))
  const matched = envKeys.filter((k) => k.toLowerCase().includes(qLower))

  if (matched.length === 0 && items.length === 0) {
    return [
      {
        label: `No environment variables matching "${query}"`,
        sublabel: 'Try typing a variable name (e.g. /env PATH, /env USERNAME, /env NODE)',
        value: '',
        disabled: true
      }
    ]
  }

  for (const k of matched.slice(0, 30)) {
    const rawVal = process.env[k] ?? ''
    const sensitive = isSensitive(k)
    const displayVal = sensitive ? '••••••••' : rawVal.length > 80 ? `${rawVal.slice(0, 77)}...` : rawVal
    items.push({
      label: `${k}`,
      sublabel: `${displayVal} · ↵ Copy Value`,
      value: rawVal
    })
  }

  return items
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
