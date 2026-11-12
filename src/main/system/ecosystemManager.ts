import { execFile } from 'child_process'
import type { EcosystemUpdateItem } from '../../shared/types'
import { openTerminal, runInTerminal } from '../terminalWindow'

// ============================================================================
// 1. Multi-Manager Ecosystem Updates (npm, pip, WSL)
// ============================================================================

let cachedEcosystemUpdates: { ts: number; items: EcosystemUpdateItem[] } | null = null

async function checkNpmGlobalOutdated(): Promise<EcosystemUpdateItem[]> {
  return new Promise((resolve) => {
    execFile(
      'cmd.exe',
      ['/d', '/s', '/c', 'npm outdated -g --json'],
      { timeout: 15000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (_err, stdout) => {
        // Note: npm outdated exits with code 1 when outdated packages exist
        const trimmed = (stdout || '').trim()
        if (!trimmed || !trimmed.startsWith('{')) {
          resolve([])
          return
        }
        try {
          const parsed = JSON.parse(trimmed) as Record<
            string,
            { current?: string; wanted?: string; latest?: string; location?: string }
          >
          const list: EcosystemUpdateItem[] = []
          for (const [pkgName, info] of Object.entries(parsed)) {
            if (!info || !info.latest || info.current === info.latest) continue
            list.push({
              manager: 'npm',
              id: pkgName,
              name: pkgName,
              currentVersion: String(info.current || 'installed'),
              latestVersion: String(info.latest),
              location: info.location
            })
          }
          resolve(list)
        } catch {
          resolve([])
        }
      }
    )
  })
}

async function checkPipOutdated(): Promise<EcosystemUpdateItem[]> {
  return new Promise((resolve) => {
    execFile(
      'python.exe',
      ['-m', 'pip', 'list', '--outdated', '--format=json', '--disable-pip-version-check'],
      { timeout: 18000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (_err, stdout) => {
        const trimmed = (stdout || '').trim()
        if (!trimmed || !trimmed.startsWith('[')) {
          resolve([])
          return
        }
        try {
          const parsed = JSON.parse(trimmed) as Array<{
            name: string
            version: string
            latest_version: string
          }>
          const list: EcosystemUpdateItem[] = parsed.map((p) => ({
            manager: 'pip',
            id: p.name,
            name: p.name,
            currentVersion: String(p.version),
            latestVersion: String(p.latest_version)
          }))
          resolve(list)
        } catch {
          resolve([])
        }
      }
    )
  })
}

async function checkWslVersion(): Promise<EcosystemUpdateItem[]> {
  return new Promise((resolve) => {
    execFile(
      'wsl.exe',
      ['--version'],
      { timeout: 4000, windowsHide: true },
      (err, stdout) => {
        if (err && !stdout) {
          resolve([])
          return
        }
        // WSL outputs UTF-16LE on some builds; strip null bytes
        const clean = (stdout || '').replace(/\0/g, '').trim()
        const firstLine = clean.split(/\r?\n/)[0]?.trim() || 'Installed'
        const verMatch = /([0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?)/.exec(firstLine)
        resolve([
          {
            manager: 'wsl',
            id: 'wsl-engine',
            name: 'Windows Subsystem for Linux (WSL Kernel & Engine)',
            currentVersion: verMatch ? verMatch[1] : 'Installed',
            latestVersion: 'Check / Update via wsl --update'
          }
        ])
      }
    )
  })
}

export async function getEcosystemUpdates(force = false): Promise<EcosystemUpdateItem[]> {
  if (!force && cachedEcosystemUpdates && Date.now() - cachedEcosystemUpdates.ts < 60_000) {
    return cachedEcosystemUpdates.items
  }
  const [npmItems, pipItems, wslItems] = await Promise.all([
    checkNpmGlobalOutdated(),
    checkPipOutdated(),
    checkWslVersion()
  ])
  const items = [...npmItems, ...pipItems, ...wslItems]
  cachedEcosystemUpdates = { ts: Date.now(), items }
  return items
}

export async function runEcosystemUpdate(params: {
  manager: 'npm' | 'pip' | 'psmodule' | 'wsl'
  id?: string
  all?: boolean
  inTerminal?: boolean
}): Promise<{ success: boolean; message: string }> {
  let cmd = ''
  if (params.manager === 'npm') {
    const safeId = (params.id || '').replace(/[^a-zA-Z0-9@_./-]/g, '')
    cmd = params.all ? 'npm update -g' : `npm install -g ${safeId}@latest`
  } else if (params.manager === 'pip') {
    const safeId = (params.id || '').replace(/[^a-zA-Z0-9_.-]/g, '')
    cmd = `python -m pip install --upgrade ${safeId}`
  } else if (params.manager === 'wsl') {
    cmd = 'wsl --update'
  }

  if (!cmd) {
    return { success: false, message: 'Unsupported ecosystem update command' }
  }

  if (params.inTerminal || params.manager === 'wsl') {
    runInTerminal(cmd)
    openTerminal()
    cachedEcosystemUpdates = null
    return { success: true, message: `Running "${cmd}" in SudoLaunch Terminal` }
  }

  return new Promise((resolve) => {
    execFile(
      'cmd.exe',
      ['/d', '/s', '/c', cmd],
      { timeout: 90_000, windowsHide: true },
      (err, stdout, stderr) => {
        cachedEcosystemUpdates = null
        const ok = !err
        const msg = ok
          ? `Successfully updated ${params.id || params.manager}`
          : (stderr || stdout || err?.message || 'Update failed').trim().split(/\r?\n/).slice(-1)[0]
        resolve({ success: ok, message: msg })
      }
    )
  })
}

