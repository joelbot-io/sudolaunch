import { execFile } from 'child_process'
import { dialog, ipcMain } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { resolve, basename, join } from 'path'
import type { GitRepoStatus, GitWatcherConfigInput, KnownRepoItem } from '../shared/types'
import { readSettings, writeSettings, CONFIG_DIR } from './config'
import { dockManager } from './dock/DockManager'
import {
  clearGitWatcherLogs,
  deleteGitWatcher,
  detectRepoWatcherPresets,
  getGitWatchers,
  openGitWatcherInTerminal,
  saveGitWatcher,
  startGitWatcher,
  stopAllGitWatchers,
  stopGitWatcher,
  triggerGitWatcherReload
} from './gitWatcher'

let cachedGitPath: string | null = null

function getGitExecutable(): string {
  if (cachedGitPath) return cachedGitPath

  const localAppData = process.env.LOCALAPPDATA || ''
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const programW6432 = process.env.ProgramW6432 || 'C:\\Program Files'

  const candidates = [
    join(programFiles, 'Git', 'bin', 'git.exe'),
    join(programW6432, 'Git', 'bin', 'git.exe'),
    join(localAppData, 'Programs', 'Git', 'bin', 'git.exe'),
    join(programFilesX86, 'Git', 'bin', 'git.exe'),
    join(programFiles, 'Git', 'mingw64', 'bin', 'git.exe')
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      cachedGitPath = candidate
      return candidate
    }
  }

  cachedGitPath = 'git.exe'
  return cachedGitPath
}

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((res, rej) => {
    execFile(
      getGitExecutable(),
      args,
      { cwd, timeout: 2500, windowsHide: true },
      (err, stdout) => {
        if (err) rej(err)
        else res((stdout || '').trim())
      }
    )
  })
}

export function resolveRepoCwd(): string {
  const settings = readSettings()
  if (settings.gitRepoPath && existsSync(settings.gitRepoPath)) {
    return settings.gitRepoPath
  }
  // Try current process directory or parent directories
  const candidate = process.cwd()
  if (existsSync(candidate)) return candidate
  return resolve(__dirname, '../../..')
}

const cachedRepoRoots = new Map<string, string>()
const REPOS_JSON_CACHE_TTL_MS = 10_000
let cachedLookupRepos: {
  at: number
  items: Array<{ name: string; path: string; key: string; branch?: string }>
} | null = null

export function parseGitPorcelainStatus(statusOut: string): {
  branch: string
  ahead: number
  behind: number
  dirty: boolean
} {
  const lines = statusOut.split(/\r?\n/).filter(Boolean)

  let branch = 'HEAD'
  let ahead = 0
  let behind = 0
  if (lines.length > 0 && lines[0].startsWith('##')) {
    const header = lines[0].slice(2).trim()
    const bracketIdx = header.indexOf('[')
    const branchPart = (bracketIdx === -1 ? header : header.slice(0, bracketIdx)).trim()
    if (branchPart.startsWith('No commits yet on ')) {
      branch = branchPart.slice('No commits yet on '.length).trim() || 'HEAD'
    } else if (branchPart.startsWith('Initial commit on ')) {
      branch = branchPart.slice('Initial commit on '.length).trim() || 'HEAD'
    } else if (branchPart.includes('HEAD (no branch)')) {
      branch = 'HEAD'
    } else {
      branch = branchPart.split('...')[0].trim() || 'HEAD'
    }

    const match = header.match(/\[(?:ahead (\d+))?[,\s]*(?:behind (\d+))?\]/)
    if (match) {
      if (match[1]) ahead = parseInt(match[1], 10)
      if (match[2]) behind = parseInt(match[2], 10)
    }
  }

  // Any line not starting with '##' is a modified/untracked file
  const dirty = lines.some((l) => !l.startsWith('##'))

  return { branch: branch || 'HEAD', ahead, behind, dirty }
}

export async function getGitRepoStatus(): Promise<GitRepoStatus> {
  const cwd = resolveRepoCwd()
  try {
    // A single `git status --porcelain=v1 -b` call tells us whether `cwd` is inside a
    // work tree (exits non-zero if not), the current branch, ahead/behind counts, and
    // whether any tracked/untracked files are dirty — avoiding 3 extra git.exe spawns.
    const statusOut = await runGit(['status', '--porcelain=v1', '-b'], cwd)
    const { branch, ahead, behind, dirty } = parseGitPorcelainStatus(statusOut)

    let repoRoot = cachedRepoRoots.get(cwd)
    if (!repoRoot) {
      repoRoot = (await runGit(['rev-parse', '--show-toplevel'], cwd)) || cwd
      cachedRepoRoots.set(cwd, repoRoot)
    }

    return {
      isRepo: true,
      branch: branch || 'HEAD',
      dirty,
      ahead,
      behind,
      repoName: basename(repoRoot || cwd),
      repoPath: repoRoot || cwd
    }
  } catch {
    return { isRepo: false, branch: '', dirty: false, ahead: 0, behind: 0, repoPath: cwd }
  }
}

export async function getGitBranches(): Promise<string[]> {
  const cwd = resolveRepoCwd()
  try {
    const raw = await runGit(['branch', '--list', '--format=%(refname:short)'], cwd)
    return raw
      .split('\n')
      .map((b) => b.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

export async function checkoutGitBranch(branchName: string): Promise<{ success: boolean; message?: string }> {
  const cwd = resolveRepoCwd()
  try {
    const out = await runGit(['checkout', branchName], cwd)
    return { success: true, message: out }
  } catch (err: unknown) {
    return { success: false, message: (err as Error).message }
  }
}

export async function setActiveGitRepo(repoPath: string): Promise<GitRepoStatus> {
  const resolved = resolve(repoPath)
  if (!existsSync(resolved)) {
    throw new Error(`Path does not exist: ${repoPath}`)
  }

  const settings = readSettings()
  settings.gitRepoPath = resolved

  const recents = new Set<string>()
  recents.add(resolved)
  if (Array.isArray(settings.recentGitRepos)) {
    for (const p of settings.recentGitRepos) {
      if (p !== resolved) recents.add(p)
    }
  }
  settings.recentGitRepos = Array.from(recents).slice(0, 15)

  writeSettings(settings)

  dockManager.broadcast('config-changed')
  return getGitRepoStatus()
}

export async function selectGitRepoFolder(): Promise<GitRepoStatus | null> {
  const result = await dialog.showOpenDialog({
    title: 'Select Git Repository Folder',
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return setActiveGitRepo(result.filePaths[0])
}

export async function getKnownGitRepos(): Promise<KnownRepoItem[]> {
  const currentStatus = await getGitRepoStatus()
  const activePath = currentStatus.repoPath ? resolve(currentStatus.repoPath).toLowerCase() : ''
  const reposMap = new Map<string, KnownRepoItem>()

  // 1. Current active repo if valid
  if (currentStatus.isRepo && currentStatus.repoPath) {
    const p = resolve(currentStatus.repoPath)
    reposMap.set(p.toLowerCase(), {
      name: currentStatus.repoName || basename(p),
      path: p,
      branch: currentStatus.branch,
      isCurrent: true
    })
  }

  // 2. Recent repositories from settings
  const settings = readSettings()
  if (Array.isArray(settings.recentGitRepos)) {
    for (const rawPath of settings.recentGitRepos) {
      if (existsSync(rawPath)) {
        const p = resolve(rawPath)
        const key = p.toLowerCase()
        if (!reposMap.has(key)) {
          reposMap.set(key, {
            name: basename(p),
            path: p,
            isCurrent: key === activePath
          })
        }
      }
    }
  }

  // 3. Discovered repositories from ~/.sudolaunch/lookup/repos.json (cached for 10s)
  const now = Date.now()
  if (!cachedLookupRepos || now - cachedLookupRepos.at >= REPOS_JSON_CACHE_TTL_MS) {
    const parsedItems: Array<{ name: string; path: string; key: string; branch?: string }> = []
    const lookupPath = join(CONFIG_DIR, 'lookup', 'repos.json')
    if (existsSync(lookupPath)) {
      try {
        const data = JSON.parse(readFileSync(lookupPath, 'utf-8'))
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item.Path && existsSync(item.Path)) {
              const p = resolve(item.Path)
              parsedItems.push({
                name: item.Repository || basename(p),
                path: p,
                key: p.toLowerCase(),
                branch: item.Branch
              })
            }
          }
        }
      } catch {
        // ignore parse error
      }
    }
    cachedLookupRepos = { at: now, items: parsedItems }
  }

  for (const item of cachedLookupRepos.items) {
    if (!reposMap.has(item.key)) {
      reposMap.set(item.key, {
        name: item.name,
        path: item.path,
        branch: item.branch,
        isCurrent: item.key === activePath
      })
    }
  }

  const list = Array.from(reposMap.values())
  return list.sort((a, b) => {
    if (a.isCurrent) return -1
    if (b.isCurrent) return 1
    return a.name.localeCompare(b.name)
  })
}

export async function selectWatcherProjectFolder(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Select Project / Repository Folder to Watch',
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return resolve(result.filePaths[0])
}

export function registerGitStatusIpc(): void {
  ipcMain.handle('git-status-get', () => getGitRepoStatus())
  ipcMain.handle('git-branches-get', () => getGitBranches())
  ipcMain.handle('git-checkout-branch', (_event, branch: string) => checkoutGitBranch(branch))
  ipcMain.handle('git-select-repo-folder', () => selectGitRepoFolder())
  ipcMain.handle('git-set-active-repo', (_event, repoPath: string) => setActiveGitRepo(repoPath))
  ipcMain.handle('git-get-known-repos', () => getKnownGitRepos())

  // Hot-Reload Filesystem Watchers
  ipcMain.handle('git-watchers-get', () => getGitWatchers())
  ipcMain.handle('git-watcher-presets', (_event, repoPath?: string) =>
    detectRepoWatcherPresets(repoPath || resolveRepoCwd())
  )
  ipcMain.handle('git-watcher-save', (_event, input: GitWatcherConfigInput) => saveGitWatcher(input))
  ipcMain.handle('git-watcher-delete', (_event, id: string) => deleteGitWatcher(id))
  ipcMain.handle('git-watcher-start', (_event, id: string) => startGitWatcher(id))
  ipcMain.handle('git-watcher-stop', (_event, id: string) => stopGitWatcher(id))
  ipcMain.handle('git-watcher-stop-all', () => stopAllGitWatchers())
  ipcMain.handle('git-watcher-trigger', (_event, id: string) => triggerGitWatcherReload(id))
  ipcMain.handle('git-watcher-clear-logs', (_event, id: string) => clearGitWatcherLogs(id))
  ipcMain.handle('git-watcher-open-terminal', (_event, id: string) => openGitWatcherInTerminal(id))
  ipcMain.handle('git-watcher-select-folder', () => selectWatcherProjectFolder())
}

