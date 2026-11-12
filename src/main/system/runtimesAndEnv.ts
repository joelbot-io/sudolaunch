import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { DevRuntimeStatus, PathEntryHealth, SystemEnvVarItem } from '../../shared/types'
import { runElevated } from '../elevation'

const execFileAsync = promisify(execFile)

// ============================================================================
// 2. Dev Runtimes & PATH Doctor
// ============================================================================

interface RuntimeCatalogEntry {
  id: string
  name: string
  icon: string
  arg: string
  wingetId: string
  fallbackPaths?: string[]
}

const RUNTIME_CATALOG: RuntimeCatalogEntry[] = [
  { id: 'node', name: 'Node.js', icon: '🟢', arg: '--version', wingetId: 'OpenJS.NodeJS.LTS' },
  { id: 'npm', name: 'npm CLI', icon: '📦', arg: '--version', wingetId: 'OpenJS.NodeJS.LTS' },
  { id: 'python', name: 'Python', icon: '🐍', arg: '--version', wingetId: 'Python.Python.3.12' },
  {
    id: 'go',
    name: 'Go (Golang)',
    icon: '🐹',
    arg: 'version',
    wingetId: 'GoLang.Go',
    fallbackPaths: [
      'C:\\Program Files\\Go\\bin\\go.exe',
      'C:\\Go\\bin\\go.exe',
      join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Programs', 'Go', 'bin', 'go.exe')
    ]
  },
  { id: 'git', name: 'Git', icon: '🌿', arg: '--version', wingetId: 'Git.Git' },
  { id: 'rustc', name: 'Rust (rustc)', icon: '🦀', arg: '--version', wingetId: 'Rustlang.Rustup' },
  { id: 'dotnet', name: '.NET SDK', icon: '🟣', arg: '--version', wingetId: 'Microsoft.DotNet.SDK.8' },
  { id: 'pwsh', name: 'PowerShell 7', icon: '🐚', arg: '--version', wingetId: 'Microsoft.PowerShell' },
  { id: 'uv', name: 'Astral uv', icon: '⚡', arg: '--version', wingetId: 'astral-sh.uv' },
  { id: 'docker', name: 'Docker CLI', icon: '🐳', arg: '--version', wingetId: 'Docker.DockerDesktop' },
  { id: 'java', name: 'Java (JDK)', icon: '☕', arg: '--version', wingetId: 'EclipseAdoptium.Temurin.21.JDK' },
  { id: 'winget', name: 'WinGet CLI', icon: '🪽', arg: '--version', wingetId: 'Microsoft.AppInstaller' }
]

let cachedDevRuntimes: { ts: number; list: DevRuntimeStatus[] } | null = null

async function getFreshCombinedPath(): Promise<string> {
  try {
    const script = `
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
      $m = [Environment]::GetEnvironmentVariable('Path', 'Machine')
      $u = [Environment]::GetEnvironmentVariable('Path', 'User')
      Write-Output "$m;$u"
    `
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 3000, windowsHide: true }
    )
    const fresh = stdout.trim()
    if (fresh) {
      return `${fresh};${process.env.PATH || ''}`
    }
  } catch {
    // fallback to process.env.PATH
  }
  return process.env.PATH || ''
}

export async function getDevRuntimesStatus(force = false): Promise<DevRuntimeStatus[]> {
  if (!force && cachedDevRuntimes && Date.now() - cachedDevRuntimes.ts < 30_000) {
    return cachedDevRuntimes.list
  }

  const combinedPath = await getFreshCombinedPath()
  const childEnv = { ...process.env, PATH: combinedPath, Path: combinedPath }

  const results = await Promise.all(
    RUNTIME_CATALOG.map(async (tool): Promise<DevRuntimeStatus> => {
      try {
        let allPaths: string[] = []
        try {
          const { stdout: whereOut } = await execFileAsync('where.exe', [tool.id], {
            timeout: 3000,
            windowsHide: true,
            env: childEnv
          })
          allPaths = whereOut
            .split(/\r?\n/)
            .map((p) => p.trim())
            .filter(Boolean)
        } catch {
          // where.exe returns non-zero when not found on PATH; check fallbackPaths next
        }

        if (tool.fallbackPaths) {
          for (const fb of tool.fallbackPaths) {
            if (existsSync(fb) && !allPaths.some((p) => p.toLowerCase() === fb.toLowerCase())) {
              allPaths.push(fb)
            }
          }
        }

        if (allPaths.length === 0) {
          return {
            id: tool.id,
            name: tool.name,
            icon: tool.icon,
            wingetId: tool.wingetId,
            installed: false,
            version: 'Not Found',
            activePath: '',
            allPaths: [],
            hasShadowConflict: false
          }
        }

        const activePath = allPaths[0]
        let version = 'Installed'
        try {
          const { stdout: verOut, stderr: verErr } = await execFileAsync(activePath, [tool.arg], {
            timeout: 3500,
            windowsHide: true,
            env: childEnv
          })
          const firstLine = `${verOut}\n${verErr}`
            .split(/\r?\n/)
            .map((l) => l.trim())
            .find(Boolean)
          if (firstLine) {
            version = firstLine
          }
        } catch {
          // WindowsApps alias shim (e.g. Store python.exe stub)
          if (activePath.toLowerCase().includes('windowsapps') && tool.id === 'python') {
            version = 'Windows Store Stub (Not Installed)'
          }
        }

        // Deduplicate case-insensitively and ignore .cmd/.bat pairs in the same directory
        const uniqueDirs = new Set(
          allPaths.map((p) => p.replace(/\\[^\\]+$/, '').toLowerCase())
        )

        return {
          id: tool.id,
          name: tool.name,
          icon: tool.icon,
          wingetId: tool.wingetId,
          installed: !version.includes('Store Stub'),
          version,
          activePath,
          allPaths,
          hasShadowConflict: uniqueDirs.size > 1
        }
      } catch {
        return {
          id: tool.id,
          name: tool.name,
          icon: tool.icon,
          wingetId: tool.wingetId,
          installed: false,
          version: 'Not Installed',
          activePath: '',
          allPaths: [],
          hasShadowConflict: false
        }
      }
    })
  )

  cachedDevRuntimes = { ts: Date.now(), list: results }
  return results
}

export async function getPathHealth(): Promise<PathEntryHealth[]> {
  try {
    const script = `
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
      $u = [Environment]::GetEnvironmentVariable('Path', 'User')
      $m = [Environment]::GetEnvironmentVariable('Path', 'Machine')
      [PSCustomObject]@{ user = $u; machine = $m } | ConvertTo-Json -Compress
    `
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 4000, windowsHide: true }
    )
    const parsed = JSON.parse(stdout.trim() || '{}')
    const userParts = String(parsed.user || '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
    const machineParts = String(parsed.machine || '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)

    const seen = new Set<string>()
    const entries: PathEntryHealth[] = []

    const addEntries = (list: string[], scope: 'User' | 'Machine'): void => {
      for (const rawPath of list) {
        const norm = rawPath.replace(/\\+$/, '').toLowerCase()
        const isDuplicate = seen.has(norm)
        seen.add(norm)
        entries.push({
          path: rawPath,
          scope,
          exists: existsSync(rawPath),
          isDuplicate
        })
      }
    }

    addEntries(machineParts, 'Machine')
    addEntries(userParts, 'User')
    return entries
  } catch {
    return []
  }
}

// ============================================================================
// 7. Persistent Environment Variables (User & Machine Registry)
// ============================================================================

const SECRET_ENV_REGEX = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|PAT|CREDENTIAL|AUTH|PRIVATE/i

export async function getSystemEnvVars(): Promise<SystemEnvVarItem[]> {
  const script = `
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $ErrorActionPreference = 'SilentlyContinue'
    $out = @()
    $uVars = [Environment]::GetEnvironmentVariables('User')
    foreach ($k in $uVars.Keys) {
      $name = [string]$k
      if ($name -ieq 'Path') { continue }
      $out += [PSCustomObject]@{
        name  = $name
        value = [string]$uVars[$k]
        scope = 'User'
      }
    }
    $mVars = [Environment]::GetEnvironmentVariables('Machine')
    foreach ($k in $mVars.Keys) {
      $name = [string]$k
      if ($name -ieq 'Path') { continue }
      $out += [PSCustomObject]@{
        name  = $name
        value = [string]$mVars[$k]
        scope = 'Machine'
      }
    }
    $out | ConvertTo-Json -Compress
  `
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 8000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
    )
    const trimmed = stdout.trim()
    if (!trimmed) return []
    const parsed = JSON.parse(trimmed)
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    const items: SystemEnvVarItem[] = arr
      .filter((x) => x && x.name)
      .map((x) => {
        const name = String(x.name)
        const scope: 'User' | 'Machine' = x.scope === 'Machine' ? 'Machine' : 'User'
        return {
          name,
          value: String(x.value ?? ''),
          scope,
          isSecret: SECRET_ENV_REGEX.test(name)
        }
      })
    items.sort((a, b) => {
      if (a.scope !== b.scope) return a.scope === 'User' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return items
  } catch {
    return []
  }
}

export async function setSystemEnvVar(params: {
  name: string
  value: string
  scope: 'User' | 'Machine'
  elevated?: boolean
}): Promise<{ success: boolean; message: string; items: SystemEnvVarItem[] }> {
  const cleanName = params.name.trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(cleanName)) {
    return {
      success: false,
      message: 'Variable name must contain only letters, digits, and underscores',
      items: await getSystemEnvVars()
    }
  }
  const safeName = cleanName.replace(/'/g, "''")
  const safeVal = params.value.replace(/'/g, "''")
  const targetScope = params.scope === 'Machine' ? 'Machine' : 'User'
  const psCmd = `[Environment]::SetEnvironmentVariable('${safeName}', '${safeVal}', '${targetScope}')`

  try {
    if (targetScope === 'Machine' && params.elevated) {
      runElevated(psCmd, `Set Machine Env: ${cleanName}`, 'system')
      process.env[cleanName] = params.value
      return {
        success: true,
        message: `Triggered UAC to set Machine variable ${cleanName}`,
        items: await getSystemEnvVars()
      }
    }
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psCmd],
      { timeout: 7000, windowsHide: true }
    )
    process.env[cleanName] = params.value
    return {
      success: true,
      message: `Saved ${targetScope} variable ${cleanName}`,
      items: await getSystemEnvVars()
    }
  } catch {
    if (targetScope === 'Machine') {
      runElevated(psCmd, `Set Machine Env: ${cleanName}`, 'system')
      return {
        success: true,
        message: `Requested UAC elevation to save Machine variable ${cleanName}`,
        items: await getSystemEnvVars()
      }
    }
    return {
      success: false,
      message: `Failed to set variable ${cleanName}`,
      items: await getSystemEnvVars()
    }
  }
}

export async function deleteSystemEnvVar(params: {
  name: string
  scope: 'User' | 'Machine'
  elevated?: boolean
}): Promise<{ success: boolean; message: string; items: SystemEnvVarItem[] }> {
  const cleanName = params.name.trim()
  const safeName = cleanName.replace(/'/g, "''")
  const targetScope = params.scope === 'Machine' ? 'Machine' : 'User'
  const psCmd = `[Environment]::SetEnvironmentVariable('${safeName}', $null, '${targetScope}')`

  try {
    if (targetScope === 'Machine' && params.elevated) {
      runElevated(psCmd, `Remove Machine Env: ${cleanName}`, 'system')
      return {
        success: true,
        message: `Triggered UAC to remove Machine variable ${cleanName}`,
        items: await getSystemEnvVars()
      }
    }
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psCmd],
      { timeout: 7000, windowsHide: true }
    )
    return {
      success: true,
      message: `Removed ${targetScope} variable ${cleanName}`,
      items: await getSystemEnvVars()
    }
  } catch {
    if (targetScope === 'Machine') {
      runElevated(psCmd, `Remove Machine Env: ${cleanName}`, 'system')
      return {
        success: true,
        message: `Requested UAC elevation to remove Machine variable ${cleanName}`,
        items: await getSystemEnvVars()
      }
    }
    return {
      success: false,
      message: `Failed to remove variable ${cleanName}`,
      items: await getSystemEnvVars()
    }
  }
}
