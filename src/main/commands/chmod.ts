import { clipboard } from 'electron'
import type { SearchResultItem } from '../../shared/types'

interface ChmodPreset {
  octal: string
  symbolic: string
  name: string
  description: string
}

const PRESETS: ChmodPreset[] = [
  { octal: '755', symbolic: 'rwxr-xr-x', name: 'Standard Executable / Directory', description: 'User full (rwx), group read/exec (r-x), others read/exec (r-x)' },
  { octal: '644', symbolic: 'rw-r--r--', name: 'Standard Read/Write File', description: 'User read/write (rw-), group read (r--), others read (r--)' },
  { octal: '700', symbolic: 'rwx------', name: 'Private Executable / Folder', description: 'User full (rwx), no permissions for group or others' },
  { octal: '600', symbolic: 'rw-------', name: 'Private File / SSH Key', description: 'User read/write (rw-), no permissions for group or others (id_rsa)' },
  { octal: '400', symbolic: 'r--------', name: 'Read-Only Private File', description: 'User read-only (r--), no access for group or others' },
  { octal: '775', symbolic: 'rwxrwxr-x', name: 'Shared Team Folder', description: 'User full (rwx), group full (rwx), others read/exec (r-x)' },
  { octal: '664', symbolic: 'rw-rw-r--', name: 'Shared Team File', description: 'User read/write (rw-), group read/write (rw-), others read (r--)' },
  { octal: '777', symbolic: 'rwxrwxrwx', name: 'Full Public Access (Unrestricted)', description: 'Read, write, execute for everyone (warning: insecure)' }
]

function digitToSymbolic(d: number): string {
  const r = (d & 4) !== 0 ? 'r' : '-'
  const w = (d & 2) !== 0 ? 'w' : '-'
  const x = (d & 1) !== 0 ? 'x' : '-'
  return `${r}${w}${x}`
}

function symbolicToDigit(sym: string): number {
  let val = 0
  if (sym[0] === 'r') val += 4
  if (sym[1] === 'w') val += 2
  if (sym[2] === 'x') val += 1
  return val
}

function parsePermissions(input: string): { octal: string; symbolic: string; userDesc: string; groupDesc: string; otherDesc: string } | null {
  const clean = input.replace(/^chmod\s+/i, '').trim()

  // 1. Octal numeric format: 3 or 4 digits (e.g. 755, 0755, 644)
  const octalMatch = clean.match(/^0?([0-7])([0-7])([0-7])$/)
  if (octalMatch) {
    const u = parseInt(octalMatch[1], 10)
    const g = parseInt(octalMatch[2], 10)
    const o = parseInt(octalMatch[3], 10)
    const octal = `${u}${g}${o}`
    const uSym = digitToSymbolic(u)
    const gSym = digitToSymbolic(g)
    const oSym = digitToSymbolic(o)
    const symbolic = `${uSym}${gSym}${oSym}`
    return {
      octal,
      symbolic,
      userDesc: `User (Owner): ${u} (${uSym})`,
      groupDesc: `Group: ${g} (${gSym})`,
      otherDesc: `Others (World): ${o} (${oSym})`
    }
  }

  // 2. Symbolic string format (e.g. rwxr-xr-x or -rwxr-xr-x)
  const symClean = clean.startsWith('-') ? clean.slice(1) : clean
  const symMatch = symClean.match(/^([r-][w-][x-]){3}$/)
  if (symMatch) {
    const uStr = symClean.slice(0, 3)
    const gStr = symClean.slice(3, 6)
    const oStr = symClean.slice(6, 9)
    const u = symbolicToDigit(uStr)
    const g = symbolicToDigit(gStr)
    const o = symbolicToDigit(oStr)
    const octal = `${u}${g}${o}`
    return {
      octal,
      symbolic: symClean,
      userDesc: `User (Owner): ${u} (${uStr})`,
      groupDesc: `Group: ${g} (${gStr})`,
      otherDesc: `Others (World): ${o} (${oStr})`
    }
  }

  return null
}

export function search(query: string): SearchResultItem[] {
  let q = query.trim()

  if (!q) {
    const cb = clipboard.readText().trim()
    if (cb && (cb.match(/^0?[0-7]{3}$/) || cb.match(/^([r-][w-][x-]){3}$/))) {
      q = cb
    }
  }

  if (q) {
    const parsed = parsePermissions(q)
    if (parsed) {
      return [
        {
          label: `chmod ${parsed.octal} (${parsed.symbolic})`,
          sublabel: `Command: chmod ${parsed.octal} <file>`,
          value: `chmod ${parsed.octal} `
        },
        {
          label: `Symbolic: ${parsed.symbolic}`,
          sublabel: `${parsed.userDesc} · ${parsed.groupDesc} · ${parsed.otherDesc}`,
          value: parsed.symbolic
        },
        {
          label: `Octal Mode: ${parsed.octal}`,
          sublabel: 'Numeric file permission code',
          value: parsed.octal
        },
        {
          label: parsed.userDesc,
          sublabel: 'Permissions for the file owner',
          value: parsed.userDesc
        },
        {
          label: parsed.groupDesc,
          sublabel: 'Permissions for group members',
          value: parsed.groupDesc
        },
        {
          label: parsed.otherDesc,
          sublabel: 'Permissions for all other users',
          value: parsed.otherDesc
        }
      ]
    }
  }

  // Show standard presets if empty or no direct octal match
  const filtered = q
    ? PRESETS.filter(
        (p) =>
          p.octal.includes(q) ||
          p.symbolic.includes(q) ||
          p.name.toLowerCase().includes(q.toLowerCase()) ||
          p.description.toLowerCase().includes(q.toLowerCase())
      )
    : PRESETS

  if (filtered.length === 0) {
    return [
      {
        label: `Invalid permission string "${q}"`,
        sublabel: 'Examples: /chmod 755 · /chmod 644 · /chmod rwxr-xr-x · /chmod 600',
        value: '',
        disabled: true
      }
    ]
  }

  return filtered.map((p) => ({
    label: `chmod ${p.octal} (${p.symbolic}) — ${p.name}`,
    sublabel: p.description,
    value: `chmod ${p.octal} `
  }))
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
