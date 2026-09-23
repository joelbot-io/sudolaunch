import { execFile } from 'child_process'
import { dialog, ipcMain } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { resolve, basename, join } from 'path'
import type { GitRepoStatus, KnownRepoItem } from '../shared/types'
import { readSettings, writeSettings, CONFIG_DIR } from './config'
import { dockManager } from './dock/DockManager'

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

export async function getGitRepoStatus(): Promise<GitRepoStatus> {
  const cwd = resolveRepoCwd()
  try {
    const isInside = await runGit(['rev-parse', '--is-inside-work-tree'], cwd)
    if (isInside !== 'true') {
      return { isRepo: false, branch: '', dirty: false, ahead: 0, behind: 0, repoPath: cwd }
    }

    const branch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
    const statusOut = await runGit(['status', '--porcelain=v1', '-b'], cwd)
    const lines = statusOut.split('\n').filter(Boolean)

    let ahead = 0
    let behind = 0
    if (lines.length > 0 && lines[0].startsWith('##')) {
      const match = lines[0].match(/\[(?:ahead (\d+))?[,\s]*(?:behind (\d+))?\]/)
      if (match) {
        if (match[1]) ahead = parseInt(match[1], 10)
        if (match[2]) behind = parseInt(match[2], 10)
      }
    }

    // Any line not starting with '##' is a modified/untracked file
    const dirty = lines.some((l) => !l.startsWith('##'))
    const repoRoot = await runGit(['rev-parse', '--show-toplevel'], cwd)

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

  // 3. Discovered repositories from ~/.sudolaunch/lookup/repos.json
  const lookupPath = join(CONFIG_DIR, 'lookup', 'repos.json')
  if (existsSync(lookupPath)) {
    try {
      const data = JSON.parse(readFileSync(lookupPath, 'utf-8'))
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.Path && existsSync(item.Path)) {
            const p = resolve(item.Path)
            const key = p.toLowerCase()
            if (!reposMap.has(key)) {
              reposMap.set(key, {
                name: item.Repository || basename(p),
                path: p,
                branch: item.Branch,
                isCurrent: key === activePath
              })
            }
          }
        }
      }
    } catch {
      // ignore parse error
    }
  }

  const list = Array.from(reposMap.values())
  return list.sort((a, b) => {
    if (a.isCurrent) return -1
    if (b.isCurrent) return 1
    return a.name.localeCompare(b.name)
  })
}

export function registerGitStatusIpc(): void {
  ipcMain.handle('git-status-get', () => getGitRepoStatus())
  ipcMain.handle('git-branches-get', () => getGitBranches())
  ipcMain.handle('git-checkout-branch', (_event, branch: string) => checkoutGitBranch(branch))
  ipcMain.handle('git-select-repo-folder', () => selectGitRepoFolder())
  ipcMain.handle('git-set-active-repo', (_event, repoPath: string) => setActiveGitRepo(repoPath))
  ipcMain.handle('git-get-known-repos', () => getKnownGitRepos())
}

