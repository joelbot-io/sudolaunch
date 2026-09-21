import { spawn } from 'child_process'
import Fuse from 'fuse.js'
import { readdirSync, statSync } from 'fs'
import { dirname, extname, join, resolve, sep, basename } from 'path'
import { CONFIG_DIR } from './config'
import { runInTerminal, openTerminal } from './terminalWindow'
import { runElevated } from './elevation'
import type { SearchResultItem } from '../shared/types'

// Backs any custom command whose JSON defines "Folder" instead of "Action" — one
// controller shared by every such command, parameterized by the folder it's pointed at
// (see commands/custom.ts). Ported from what used to be a dedicated built-in /script
// command; folding it in here means a folder-browsing command is just another JSON file,
// same as an action-type one, with no code changes needed to add more.

interface Entry {
  name: string
  relPath: string
  isDirectory: boolean
}

export const SCRIPT_EXTENSIONS = ['.py', '.ps1']

function normalizeQuery(query: string): string {
  return query.replace(/\\/g, '/').replace(/^\/+/, '')
}

function splitQuery(query: string): { dirPart: string; filterPart: string } {
  const idx = query.lastIndexOf('/')
  return idx === -1
    ? { dirPart: '', filterPart: query }
    : { dirPart: query.slice(0, idx), filterPart: query.slice(idx + 1) }
}

// Resolves relPath against base and returns it only if it stays within base — blocks "../"
// escapes (and absolute-path overrides, since path.resolve would otherwise honor those).
function resolveWithin(base: string, relPath: string): string | null {
  const target = resolve(base, relPath)
  return target === base || target.startsWith(base + sep) ? target : null
}

// Every folder-based feature (the "gif" command, a folder-type custom command's Folder)
// defaults to, and is always resolved relative to, ~/.sudolaunch/<feature-name> — never an
// arbitrary absolute path — so a mistyped "../" (or absolute path) can only ever escape as
// far as outside ~/.sudolaunch, where this rejects it.
export function resolveFolderRoot(folder: string): string | null {
  return resolveWithin(resolve(CONFIG_DIR), folder)
}

// Wraps a path in literal quotes for use with spawn's windowsVerbatimArguments — Windows
// filenames can never contain `"`, so this is always safe and, unlike Node's default
// argv quoting (which only quotes args containing whitespace), it also neutralizes
// cmd.exe metacharacters (&, |, ^, %, (, )) in paths that have no spaces at all.
function quoteArg(path: string): string {
  return `"${path}"`
}

export function browseFolder(root: string, query: string, extensions: string[]): SearchResultItem[] {
  const { dirPart, filterPart } = splitQuery(normalizeQuery(query))
  const absDir = resolveWithin(root, dirPart)
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
    } else if (extensions.includes(extname(name).toLowerCase())) {
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

// Resolves relPath under root and confirms it points at a real, existing file — shared by
// runScript and any other command that needs to turn a browseFolder() result back into an
// absolute path (e.g. commands/gif.ts copying the selected file to the clipboard).
export function resolveFileWithin(root: string, relPath: string): string | null {
  const absPath = resolveWithin(root, relPath)
  let stat
  try {
    stat = absPath ? statSync(absPath) : null
  } catch {
    stat = null
  }
  return absPath && stat?.isFile() ? absPath : null
}

export function runScript(root: string, relPath: string, elevated?: boolean, showTerminal?: boolean): void {
  const absPath = resolveFileWithin(root, relPath)
  if (!absPath) {
    throw new Error('Script no longer exists or is outside the configured folder')
  }

  const ext = extname(absPath).toLowerCase()
  const scriptName = basename(absPath)
  let cmdStr = ''
  if (ext === '.ps1') {
    cmdStr = `& '${absPath.replace(/'/g, "''")}'`
  } else if (ext === '.py') {
    cmdStr = `python '${absPath.replace(/'/g, "''")}'`
  } else {
    cmdStr = `& '${absPath.replace(/'/g, "''")}'`
  }

  if (elevated) {
    runElevated(cmdStr, scriptName)
    return
  }

  if (showTerminal) {
    openTerminal()
  }

  // Default: run visibly in SudoLaunch's own persistent terminal
  runInTerminal(cmdStr)
}
