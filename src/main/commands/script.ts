import { spawn } from 'child_process'
import Fuse from 'fuse.js'
import { readdirSync, statSync } from 'fs'
import { dirname, extname, join, resolve, sep } from 'path'
import type { SearchResultItem } from '../../shared/types'
import { readSettings } from '../config'

interface Entry {
  name: string
  relPath: string
  isDirectory: boolean
}

const SCRIPT_EXTENSIONS = ['.py', '.ps1']

function normalizeQuery(query: string): string {
  return query.replace(/\\/g, '/').replace(/^\/+/, '')
}

function splitQuery(query: string): { dirPart: string; filterPart: string } {
  const idx = query.lastIndexOf('/')
  return idx === -1
    ? { dirPart: '', filterPart: query }
    : { dirPart: query.slice(0, idx), filterPart: query.slice(idx + 1) }
}

// Resolves relPath against root and returns it only if it stays within root — blocks "../" escapes.
function resolveSafe(root: string, relPath: string): string | null {
  const target = resolve(root, relPath)
  return target === root || target.startsWith(root + sep) ? target : null
}

export function search(query: string): SearchResultItem[] {
  const { scriptsFolder } = readSettings()
  if (!scriptsFolder) {
    return [{ label: 'Set a scripts folder in // Settings first', value: '', disabled: true }]
  }

  const root = resolve(scriptsFolder)
  const { dirPart, filterPart } = splitQuery(normalizeQuery(query))
  const absDir = resolveSafe(root, dirPart)
  let dirStat
  try {
    dirStat = absDir ? statSync(absDir) : null
  } catch {
    dirStat = null
  }
  if (!absDir || !dirStat?.isDirectory()) {
    return [{ label: 'Invalid path', value: '', disabled: true }]
  }

  let names: string[] = []
  try {
    names = readdirSync(absDir)
  } catch {
    names = []
  }

  const children: Entry[] = []
  for (const name of names) {
    const fullPath = join(absDir, name)
    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      children.push({ name, relPath: dirPart ? `${dirPart}/${name}` : name, isDirectory: true })
    } else if (SCRIPT_EXTENSIONS.includes(extname(name).toLowerCase())) {
      children.push({ name, relPath: dirPart ? `${dirPart}/${name}` : name, isDirectory: false })
    }
  }
  children.sort((a, b) =>
    a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1
  )

  const matches = filterPart
    ? new Fuse(children, { keys: ['name'], threshold: 0.35 }).search(filterPart).map((r) => r.item)
    : children

  const results: SearchResultItem[] = matches.map((c) => ({
    label: c.isDirectory ? `${c.name}/` : c.name,
    sublabel: c.relPath,
    value: c.relPath,
    isDirectory: c.isDirectory
  }))

  if (dirPart) {
    const parent = dirPart.includes('/') ? dirPart.slice(0, dirPart.lastIndexOf('/')) : ''
    results.unshift({ label: '.. (up one level)', value: parent, isDirectory: true })
  }

  return results
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.disabled || item.isDirectory) return

  const { scriptsFolder } = readSettings()
  const root = resolve(scriptsFolder)
  const absPath = resolveSafe(root, item.value)
  let stat
  try {
    stat = absPath ? statSync(absPath) : null
  } catch {
    stat = null
  }
  if (!absPath || !stat?.isFile()) {
    throw new Error('Script no longer exists or is outside the configured scripts folder')
  }

  const ext = extname(absPath).toLowerCase()
  const inner =
    ext === '.py'
      ? ['cmd.exe', '/k', 'python', absPath]
      : ext === '.ps1'
        ? ['powershell', '-NoExit', '-File', absPath]
        : null
  if (!inner) {
    throw new Error('Unsupported script type')
  }

  // Wrapping in `cmd /c start ""` guarantees a brand-new, visible console window
  // regardless of whether Electron itself has a console attached (dev vs packaged).
  spawn('cmd.exe', ['/c', 'start', '""', ...inner], {
    cwd: dirname(absPath),
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  }).unref()
}
