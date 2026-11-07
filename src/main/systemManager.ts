import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { ipcMain, shell } from 'electron'
import type {
  EcosystemUpdateItem,
  DevRuntimeStatus,
  PathEntryHealth,
  SystemServiceItem,
  SystemStartupAppItem,
  SystemPortItem,
  SystemProcessItem,
  CleanupTargetItem,
  WindowsUpdateStatus,
  WindowsPendingUpdateItem,
  WindowsHotfixItem,
  SystemEnvVarItem,
  SystemScheduledTaskItem,
  SystemHostEntryItem,
  SystemNetworkAdapterItem,
  SystemStorageVolumeItem,
  SystemPhysicalDiskItem,
  SystemPowerPlanItem,
  SystemSleepLockItem,
  SystemStorageAndPowerOverview,
  SystemBitLockerVolumeItem,
  SystemSecurityPosture,
  SystemEventLogItem
} from '../shared/types'
import { runElevated } from './elevation'
import { addNotification } from './notifications'
import { openTerminal, runInTerminal } from './terminalWindow'

const execFileAsync = promisify(execFile)

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
// 3. Windows Services & Startup Apps
// ============================================================================

const DEFAULT_PINNED_SERVICES = [
  'com.docker.service',
  'ssh-agent',
  'WslService',
  'LxssManager',
  'Spooler',
  'wuauserv',
  'WinDefend'
]

function getPinnedServicesPath(): string {
  const dir = join(homedir(), '.sudolaunch')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'pinned-services.json')
}

function loadPinnedServiceNames(): Set<string> {
  try {
    const file = getPinnedServicesPath()
    if (!existsSync(file)) {
      return new Set(DEFAULT_PINNED_SERVICES.map((s) => s.toLowerCase()))
    }
    const arr = JSON.parse(readFileSync(file, 'utf8'))
    if (Array.isArray(arr)) {
      return new Set(arr.map((s) => String(s).toLowerCase()))
    }
  } catch {
    // ignore
  }
  return new Set(DEFAULT_PINNED_SERVICES.map((s) => s.toLowerCase()))
}

function savePinnedServiceNames(set: Set<string>): void {
  try {
    writeFileSync(getPinnedServicesPath(), JSON.stringify([...set], null, 2), 'utf8')
  } catch {
    // ignore
  }
}

let cachedSystemServices: { ts: number; list: SystemServiceItem[] } | null = null

export async function getSystemServices(force = false): Promise<SystemServiceItem[]> {
  if (!force && cachedSystemServices && Date.now() - cachedSystemServices.ts < 6000) {
    return cachedSystemServices.list
  }

  try {
    const script = `
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
      $ErrorActionPreference = 'SilentlyContinue'
      Get-Service |
        Select-Object Name, DisplayName, @{N='Status';E={$_.Status.ToString()}}, @{N='StartType';E={$_.StartType.ToString()}} |
        ConvertTo-Json -Compress
    `
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 5000, windowsHide: true, maxBuffer: 5 * 1024 * 1024 }
    )
    const pinnedSet = loadPinnedServiceNames()
    const rawArr = JSON.parse(stdout.trim() || '[]')
    const arr = Array.isArray(rawArr) ? rawArr : [rawArr]

    const list: SystemServiceItem[] = arr
      .filter((s) => s && s.Name)
      .map((s) => {
        const name = String(s.Name)
        return {
          name,
          displayName: String(s.DisplayName || name),
          status: String(s.Status || 'Unknown'),
          startType: String(s.StartType || 'Manual'),
          isPinned: pinnedSet.has(name.toLowerCase())
        }
      })

    list.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1
      if (a.status === 'Running' && b.status !== 'Running') return -1
      if (a.status !== 'Running' && b.status === 'Running') return 1
      return a.displayName.localeCompare(b.displayName)
    })

    cachedSystemServices = { ts: Date.now(), list }
    return list
  } catch {
    return cachedSystemServices?.list ?? []
  }
}

export async function togglePinSystemService(serviceName: string): Promise<SystemServiceItem[]> {
  const pinned = loadPinnedServiceNames()
  const key = serviceName.toLowerCase()
  if (pinned.has(key)) {
    pinned.delete(key)
  } else {
    pinned.add(key)
  }
  savePinnedServiceNames(pinned)
  if (cachedSystemServices) {
    cachedSystemServices.list = cachedSystemServices.list
      .map((s) => (s.name.toLowerCase() === key ? { ...s, isPinned: pinned.has(key) } : s))
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1
        if (!a.isPinned && b.isPinned) return 1
        if (a.status === 'Running' && b.status !== 'Running') return -1
        if (a.status !== 'Running' && b.status === 'Running') return 1
        return a.displayName.localeCompare(b.displayName)
      })
    return cachedSystemServices.list
  }
  return getSystemServices(true)
}

export async function runSystemServiceAction(params: {
  name: string
  action: 'start' | 'stop' | 'restart' | 'auto' | 'manual' | 'disabled'
  elevated?: boolean
}): Promise<{ success: boolean; message: string; services: SystemServiceItem[] }> {
  const safeName = params.name.replace(/'/g, "''")
  let psCmd = ''
  switch (params.action) {
    case 'start':
      psCmd = `Start-Service -Name '${safeName}'`
      break
    case 'stop':
      psCmd = `Stop-Service -Name '${safeName}' -Force`
      break
    case 'restart':
      psCmd = `Restart-Service -Name '${safeName}' -Force`
      break
    case 'auto':
      psCmd = `Set-Service -Name '${safeName}' -StartupType Automatic`
      break
    case 'manual':
      psCmd = `Set-Service -Name '${safeName}' -StartupType Manual`
      break
    case 'disabled':
      psCmd = `Set-Service -Name '${safeName}' -StartupType Disabled`
      break
  }

  if (!params.elevated) {
    try {
      await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', psCmd],
        { timeout: 8000, windowsHide: true }
      )
      const services = await getSystemServices(true)
      return {
        success: true,
        message: `Service ${params.name}: ${params.action} succeeded`,
        services
      }
    } catch {
      // Fall through to UAC elevation
    }
  }

  // Run with UAC elevation and wait
  try {
    const escaped = psCmd.replace(/'/g, "''")
    const elevateWait = `
      $p = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-NonInteractive','-Command','${escaped}' -Verb RunAs -Wait -PassThru -WindowStyle Hidden
      exit $p.ExitCode
    `
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', elevateWait],
      { timeout: 25000, windowsHide: true }
    )
    const services = await getSystemServices(true)
    return {
      success: true,
      message: `Service ${params.name}: ${params.action} completed (Elevated)`,
      services
    }
  } catch (err) {
    const services = await getSystemServices(true)
    return {
      success: false,
      message: `Service action failed or canceled: ${err}`,
      services
    }
  }
}

export async function getSystemStartupApps(): Promise<SystemStartupAppItem[]> {
  try {
    const script = `
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
      $ErrorActionPreference = 'SilentlyContinue'
      $items = @()
      $paths = @(
        @{ loc = 'HKCU Run'; path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' },
        @{ loc = 'HKLM Run'; path = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' }
      )
      foreach ($p in $paths) {
        if (Test-Path $p.path) {
          $props = Get-ItemProperty $p.path
          foreach ($prop in $props.PSObject.Properties) {
            if ($prop.Name -notin @('PSPath','PSParentPath','PSChildName','PSDrive','PSProvider')) {
              $items += [PSCustomObject]@{
                name = $prop.Name
                command = [string]$prop.Value
                location = $p.loc
              }
            }
          }
        }
      }
      $startupDir = [Environment]::GetFolderPath('Startup')
      if (Test-Path $startupDir) {
        Get-ChildItem -Path $startupDir -File | ForEach-Object {
          $items += [PSCustomObject]@{
            name = $_.BaseName
            command = $_.FullName
            location = 'Startup Folder'
          }
        }
      }
      $items | ConvertTo-Json -Compress
    `
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 5000, windowsHide: true }
    )
    const parsed = JSON.parse(stdout.trim() || '[]')
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    return arr
      .filter((i) => i && i.name)
      .map((i) => ({
        name: String(i.name),
        command: String(i.command || ''),
        location: String(i.location || 'Registry')
      }))
  } catch {
    return []
  }
}

// ============================================================================
// 4. Active Ports & Processes
// ============================================================================

const DEV_PORTS = new Set([
  80, 443, 1433, 3000, 3001, 3002, 3306, 4000, 4200, 5000, 5001, 5173, 5174, 5432, 6379, 7000, 8000,
  8080, 8081, 8443, 8888, 9000, 9090, 9229, 27017
])

function isCommonDevPort(port: number): boolean {
  return DEV_PORTS.has(port) || (port >= 3000 && port <= 9999)
}

export async function getSystemPorts(): Promise<SystemPortItem[]> {
  try {
    const [netstatRes, procRes] = await Promise.all([
      execFileAsync('netstat.exe', ['-ano', '-p', 'tcp'], { timeout: 4000, windowsHide: true }),
      getSystemProcesses()
    ])
    const procMap = new Map<number, SystemProcessItem>()
    for (const p of procRes) {
      procMap.set(p.pid, p)
    }

    // Also grab full process name map via tasklist for lower-memory processes not in top list
    const { stdout: taskOut } = await execFileAsync('tasklist.exe', ['/FO', 'CSV', '/NH'], {
      timeout: 3000,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024
    })
    const taskNameMap = new Map<number, string>()
    for (const line of taskOut.split(/\r?\n/)) {
      const parts = line.trim().split('","')
      if (parts.length >= 2) {
        const name = parts[0].replace(/^"/, '')
        const pid = parseInt(parts[1].replace(/"$/, ''), 10)
        if (!isNaN(pid)) taskNameMap.set(pid, name)
      }
    }

    const entries: SystemPortItem[] = []
    const seen = new Set<string>()
    for (const line of netstatRes.stdout.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('TCP') || !trimmed.includes('LISTENING')) continue
      const parts = trimmed.split(/\s+/)
      if (parts.length >= 5) {
        const localAddress = parts[1]
        const pid = parseInt(parts[4], 10)
        const lastColon = localAddress.lastIndexOf(':')
        if (lastColon !== -1 && !isNaN(pid)) {
          const port = parseInt(localAddress.slice(lastColon + 1), 10)
          const key = `${port}-${pid}`
          if (!seen.has(key) && !isNaN(port)) {
            seen.add(key)
            const proc = procMap.get(pid)
            entries.push({
              proto: 'TCP',
              localAddress,
              port,
              pid,
              processName: proc?.name || taskNameMap.get(pid) || 'System',
              memoryMb: proc?.memoryMb,
              path: proc?.path,
              isCommonDevPort: isCommonDevPort(port)
            })
          }
        }
      }
    }

    return entries.sort((a, b) => {
      if (a.isCommonDevPort && !b.isCommonDevPort) return -1
      if (!a.isCommonDevPort && b.isCommonDevPort) return 1
      return a.port - b.port
    })
  } catch {
    return []
  }
}

export async function getSystemProcesses(): Promise<SystemProcessItem[]> {
  try {
    const script = `
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
      $ErrorActionPreference = 'SilentlyContinue'
      Get-Process |
        Sort-Object WorkingSet64 -Descending |
        Select-Object -First 60 Id, ProcessName, @{N='MemMb';E={[math]::Round($_.WorkingSet64 / 1MB, 1)}}, @{N='CpuSec';E={[math]::Round($_.CPU, 1)}}, MainWindowTitle, Path |
        ConvertTo-Json -Compress
    `
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 5000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
    )
    const parsed = JSON.parse(stdout.trim() || '[]')
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    return arr
      .filter((p) => p && typeof p.Id === 'number')
      .map((p) => ({
        pid: Number(p.Id),
        name: String(p.ProcessName || 'Unknown'),
        memoryMb: Number(p.MemMb || 0),
        cpuSec: Number(p.CpuSec || 0),
        windowTitle: p.MainWindowTitle ? String(p.MainWindowTitle) : undefined,
        path: p.Path ? String(p.Path) : undefined
      }))
  } catch {
    return []
  }
}

export async function killSystemProcess(
  pid: number,
  elevated?: boolean
): Promise<{ success: boolean; message: string }> {
  if (elevated) {
    runElevated(`taskkill /F /PID ${pid}`, `Kill Process PID ${pid}`, 'system')
    return { success: true, message: `Sent elevated kill command for PID ${pid}` }
  }
  try {
    await execFileAsync('taskkill.exe', ['/F', '/PID', String(pid)], {
      timeout: 5000,
      windowsHide: true
    })
    return { success: true, message: `Terminated process PID ${pid}` }
  } catch (err) {
    return {
      success: false,
      message: `Failed to kill PID ${pid} (Ctrl+Click to run with UAC elevation): ${err}`
    }
  }
}

// ============================================================================
// 5. Disk & Dev Cache Cleanup
// ============================================================================

function getCacheDefinitions(): Array<{
  id: string
  name: string
  icon: string
  category: 'Developer Cache' | 'System Temp'
  description: string
  path: string
}> {
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
  const tempDir = process.env.TEMP || join(localAppData, 'Temp')
  return [
    {
      id: 'winget-temp',
      name: 'WinGet Installer Download Cache',
      icon: '🪽',
      category: 'Developer Cache',
      description: 'Cached installer binaries downloaded during WinGet package installs/updates',
      path: join(tempDir, 'WinGet')
    },
    {
      id: 'npm-cache',
      name: 'npm Package Cache',
      icon: '📦',
      category: 'Developer Cache',
      description: 'Cached tarballs and HTTP metadata for Node/npm packages',
      path: join(localAppData, 'npm-cache')
    },
    {
      id: 'pip-cache',
      name: 'Python pip Wheel & HTTP Cache',
      icon: '🐍',
      category: 'Developer Cache',
      description: 'Cached wheels and source archives from pip installs',
      path: join(localAppData, 'pip', 'Cache')
    },
    {
      id: 'uv-cache',
      name: 'Astral uv Package Cache',
      icon: '⚡',
      category: 'Developer Cache',
      description: 'Cached Python wheels and environments managed by uv',
      path: join(localAppData, 'uv', 'cache')
    },
    {
      id: 'go-build-cache',
      name: 'Go Build & Compiler Cache',
      icon: '🐹',
      category: 'Developer Cache',
      description: 'Cached Go build artifacts in AppData\\Local\\go-build',
      path: join(localAppData, 'go-build')
    },
    {
      id: 'crash-dumps',
      name: 'User Crash Dumps',
      icon: '💥',
      category: 'System Temp',
      description: 'Application crash memory dumps (.dmp) in AppData\\Local\\CrashDumps',
      path: join(localAppData, 'CrashDumps')
    },
    {
      id: 'user-temp',
      name: 'Windows User Temp Directory (%TEMP%)',
      icon: '🧹',
      category: 'System Temp',
      description: 'Temporary files created by applications (locked files are safely skipped)',
      path: tempDir
    }
  ]
}

export async function getCleanupTargets(): Promise<CleanupTargetItem[]> {
  const defs = getCacheDefinitions()
  try {
    const pathsJson = JSON.stringify(defs.map((d) => ({ id: d.id, path: d.path }))).replace(
      /'/g,
      "''"
    )
    const script = `
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
      $ErrorActionPreference = 'SilentlyContinue'
      $targets = '${pathsJson}' | ConvertFrom-Json
      $res = @()
      foreach ($t in $targets) {
        if (Test-Path -LiteralPath $t.path) {
          $files = Get-ChildItem -LiteralPath $t.path -Recurse -File -Force -ErrorAction SilentlyContinue
          $sum = ($files | Measure-Object -Property Length -Sum).Sum
          $count = ($files | Measure-Object).Count
          $res += [PSCustomObject]@{
            id = $t.id
            exists = $true
            sizeMb = [math]::Round(($sum / 1MB), 1)
            fileCount = [int]$count
          }
        } else {
          $res += [PSCustomObject]@{
            id = $t.id
            exists = $false
            sizeMb = 0
            fileCount = 0
          }
        }
      }
      $res | ConvertTo-Json -Compress
    `
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 20000, windowsHide: true }
    )
    const parsed = JSON.parse(stdout.trim() || '[]')
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    const sizeMap = new Map<string, { exists: boolean; sizeMb: number; fileCount: number }>()
    for (const item of arr) {
      if (item?.id) {
        sizeMap.set(String(item.id), {
          exists: Boolean(item.exists),
          sizeMb: Number(item.sizeMb || 0),
          fileCount: Number(item.fileCount || 0)
        })
      }
    }

    return defs.map((d) => {
      const stat = sizeMap.get(d.id)
      return {
        ...d,
        exists: stat?.exists ?? existsSync(d.path),
        sizeMb: stat?.sizeMb ?? 0,
        fileCount: stat?.fileCount ?? 0
      }
    })
  } catch {
    return defs.map((d) => ({
      ...d,
      exists: existsSync(d.path),
      sizeMb: 0,
      fileCount: 0
    }))
  }
}

export async function cleanSystemTargets(
  targetIds: string[]
): Promise<{ success: boolean; message: string; targets: CleanupTargetItem[] }> {
  const defs = getCacheDefinitions().filter((d) => targetIds.includes(d.id))
  if (defs.length === 0) {
    return {
      success: false,
      message: 'No cleanup targets selected',
      targets: await getCleanupTargets()
    }
  }

  const beforeTargets = await getCleanupTargets()
  const beforeMb = beforeTargets
    .filter((t) => targetIds.includes(t.id))
    .reduce((acc, t) => acc + t.sizeMb, 0)

  for (const def of defs) {
    if (!existsSync(def.path)) continue
    try {
      const safePath = def.path.replace(/'/g, "''")
      const cleanScript = `
        $ErrorActionPreference = 'SilentlyContinue'
        Get-ChildItem -LiteralPath '${safePath}' -Force -ErrorAction SilentlyContinue |
          Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
      `
      await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', cleanScript],
        { timeout: 20000, windowsHide: true }
      )
    } catch {
      // ignore locked files
    }
  }

  const afterTargets = await getCleanupTargets()
  const afterMb = afterTargets
    .filter((t) => targetIds.includes(t.id))
    .reduce((acc, t) => acc + t.sizeMb, 0)
  const reclaimed = Math.max(0, +(beforeMb - afterMb).toFixed(1))

  const msg = `Cleaned ${defs.length} target(s) • Reclaimed ~${reclaimed} MB`
  addNotification({
    title: 'System Cache Cleanup Complete',
    body: msg,
    type: 'success',
    commandName: 'system'
  })

  return {
    success: true,
    message: msg,
    targets: afterTargets
  }
}

// ============================================================================
// 6. Pending Reboot & Windows Update Status
// ============================================================================

let cachedWindowsUpdateStatus: WindowsUpdateStatus | null = null
let cachedPendingUpdates: WindowsPendingUpdateItem[] = []
let hasScannedPendingOnce = false

export async function getWindowsUpdateStatus(options?: {
  force?: boolean
  scanPending?: boolean
  online?: boolean
}): Promise<WindowsUpdateStatus> {
  const scanPending = Boolean(options?.scanPending)
  const online = Boolean(options?.online)

  if (!options?.force && !scanPending && cachedWindowsUpdateStatus) {
    return cachedWindowsUpdateStatus
  }

  try {
    const script = `
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
      $ErrorActionPreference = 'SilentlyContinue'

      $reasons = @()
      if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending') {
        $reasons += 'Component Based Servicing (CBS RebootPending)'
      }
      if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired') {
        $reasons += 'Windows Update (Auto Update RebootRequired)'
      }
      $sm = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager' -Name PendingFileRenameOperations -ErrorAction SilentlyContinue
      if ($sm -and $sm.PendingFileRenameOperations -and $sm.PendingFileRenameOperations.Count -gt 0) {
        $reasons += "Pending File Rename Operations ($($sm.PendingFileRenameOperations.Count) entries)"
      }
      $updVolatile = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Updates' -Name UpdateExeVolatile -ErrorAction SilentlyContinue
      if ($updVolatile -and $updVolatile.UpdateExeVolatile -ne 0) {
        $reasons += 'Microsoft Updates (UpdateExeVolatile)'
      }

      $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
      $lastBootStr = ''
      $uptimeDays = 0
      $uptimeHours = 0
      if ($os -and $os.LastBootUpTime) {
        $lastBootStr = $os.LastBootUpTime.ToString('yyyy-MM-dd HH:mm')
        $span = (Get-Date) - $os.LastBootUpTime
        $uptimeDays = [int][math]::Floor($span.TotalDays)
        $uptimeHours = [int]$span.Hours
      }

      $wua = Get-Service -Name wuauserv -ErrorAction SilentlyContinue
      $wuaStatus = if ($wua) { $wua.Status.ToString() } else { 'Unknown' }

      $hotfixes = @()
      $hfList = Get-HotFix -ErrorAction SilentlyContinue | Sort-Object InstalledOn -Descending | Select-Object -First 12
      foreach ($hf in $hfList) {
        $dateStr = if ($hf.InstalledOn) { $hf.InstalledOn.ToString('yyyy-MM-dd') } else { 'Installed' }
        $hotfixes += [PSCustomObject]@{
          hotFixId = [string]$hf.HotFixID
          description = [string]$hf.Description
          installedOn = $dateStr
        }
      }

      $pending = @()
      $didScan = $${scanPending ? 'true' : 'false'}
      if ($didScan) {
        try {
          $session = New-Object -ComObject Microsoft.Update.Session
          $searcher = $session.CreateUpdateSearcher()
          $searcher.Online = $${online ? 'true' : 'false'}
          $res = $searcher.Search("IsInstalled=0 and IsHidden=0")
          foreach ($u in $res.Updates) {
            $kbs = @($u.KBArticleIDs | ForEach-Object { "KB$_" })
            $sizeMb = if ($u.MaxDownloadSize) { [math]::Round(($u.MaxDownloadSize / 1MB), 1) } else { 0 }
            $pending += [PSCustomObject]@{
              title = [string]$u.Title
              kbs = ($kbs -join ', ')
              isDownloaded = [bool]$u.IsDownloaded
              rebootRequired = [bool]$u.RebootRequired
              severity = if ($u.MsrcSeverity) { [string]$u.MsrcSeverity } else { 'Optional / Driver' }
              sizeMb = [double]$sizeMb
            }
          }
        } catch {
          # Ignore COM errors if Windows Update is busy
        }
      }

      [PSCustomObject]@{
        rebootPending = ($reasons.Count -gt 0)
        rebootReasons = $reasons
        osCaption = if ($os) { [string]$os.Caption } else { 'Microsoft Windows' }
        osVersion = if ($os) { [string]$os.Version } else { '' }
        osBuild = if ($os) { [string]$os.BuildNumber } else { '' }
        lastBootTime = $lastBootStr
        uptimeDays = $uptimeDays
        uptimeHours = $uptimeHours
        wuaServiceStatus = $wuaStatus
        recentHotfixes = $hotfixes
        pendingUpdates = $pending
        pendingScanned = $didScan
      } | ConvertTo-Json -Depth 4 -Compress
    `

    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: online ? 45000 : 20000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
    )

    const parsed = JSON.parse(stdout.trim() || '{}')
    const reasonsRaw = parsed.rebootReasons
    const rebootReasons: string[] = Array.isArray(reasonsRaw)
      ? reasonsRaw.map(String)
      : reasonsRaw
        ? [String(reasonsRaw)]
        : []

    const hfRaw = parsed.recentHotfixes
    const recentHotfixes: WindowsHotfixItem[] = (Array.isArray(hfRaw) ? hfRaw : hfRaw ? [hfRaw] : [])
      .filter((h) => h && h.hotFixId)
      .map((h) => ({
        hotFixId: String(h.hotFixId),
        description: String(h.description || 'Update'),
        installedOn: String(h.installedOn || '')
      }))

    if (scanPending) {
      const pendRaw = parsed.pendingUpdates
      cachedPendingUpdates = (Array.isArray(pendRaw) ? pendRaw : pendRaw ? [pendRaw] : [])
        .filter((u) => u && u.title)
        .map((u) => ({
          title: String(u.title),
          kbs: String(u.kbs || ''),
          isDownloaded: Boolean(u.isDownloaded),
          rebootRequired: Boolean(u.rebootRequired),
          severity: String(u.severity || 'Standard'),
          sizeMb: Number(u.sizeMb || 0)
        }))
      hasScannedPendingOnce = true
    }

    const status: WindowsUpdateStatus = {
      rebootPending: Boolean(parsed.rebootPending),
      rebootReasons,
      osCaption: String(parsed.osCaption || 'Microsoft Windows'),
      osVersion: String(parsed.osVersion || ''),
      osBuild: String(parsed.osBuild || ''),
      lastBootTime: String(parsed.lastBootTime || ''),
      uptimeDays: Number(parsed.uptimeDays || 0),
      uptimeHours: Number(parsed.uptimeHours || 0),
      wuaServiceStatus: String(parsed.wuaServiceStatus || 'Unknown'),
      recentHotfixes,
      pendingUpdates: cachedPendingUpdates,
      pendingScanned: hasScannedPendingOnce,
      lastCheckedAt: new Date().toLocaleTimeString()
    }

    cachedWindowsUpdateStatus = status
    return status
  } catch {
    return (
      cachedWindowsUpdateStatus ?? {
        rebootPending: false,
        rebootReasons: [],
        osCaption: 'Microsoft Windows',
        osVersion: '',
        osBuild: '',
        lastBootTime: '',
        uptimeDays: 0,
        uptimeHours: 0,
        wuaServiceStatus: 'Unknown',
        recentHotfixes: [],
        pendingUpdates: cachedPendingUpdates,
        pendingScanned: hasScannedPendingOnce,
        lastCheckedAt: new Date().toLocaleTimeString()
      }
    )
  }
}

export async function runWindowsUpdateAction(
  action:
    | 'open-settings'
    | 'open-history'
    | 'trigger-scan'
    | 'schedule-reboot-60s'
    | 'cancel-reboot'
): Promise<{ success: boolean; message: string }> {
  try {
    if (action === 'open-settings') {
      await shell.openExternal('ms-settings:windowsupdate')
      return { success: true, message: 'Opened Windows Update Settings' }
    }
    if (action === 'open-history') {
      await shell.openExternal('ms-settings:windowsupdate-history')
      return { success: true, message: 'Opened Windows Update History' }
    }
    if (action === 'trigger-scan') {
      execFile('UsoClient.exe', ['StartInteractiveScan'], { windowsHide: true }, () => { })
      await shell.openExternal('ms-settings:windowsupdate')
      return {
        success: true,
        message: 'Triggered Windows Update interactive scan and opened Settings'
      }
    }
    if (action === 'schedule-reboot-60s') {
      await execFileAsync(
        'shutdown.exe',
        [
          '/r',
          '/t',
          '60',
          '/c',
          'SudoLaunch: System restart scheduled in 60 seconds. Use Cancel Reboot in SudoLaunch to abort.'
        ],
        { timeout: 5000, windowsHide: true }
      )
      return {
        success: true,
        message: 'System restart scheduled in 60 seconds (Click "Cancel Reboot" to abort)'
      }
    }
    if (action === 'cancel-reboot') {
      await execFileAsync('shutdown.exe', ['/a'], { timeout: 5000, windowsHide: true })
      return { success: true, message: 'Cancelled scheduled Windows restart' }
    }
    return { success: false, message: 'Unknown action' }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Action failed'
    }
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

// ============================================================================
// 8. Scheduled Tasks Inspector
// ============================================================================

let cachedScheduledTasks: SystemScheduledTaskItem[] | null = null

export async function getSystemScheduledTasks(force = false): Promise<SystemScheduledTaskItem[]> {
  if (!force && cachedScheduledTasks) return cachedScheduledTasks

  const script = `
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $ErrorActionPreference = 'SilentlyContinue'
    $all = Get-ScheduledTask -ErrorAction SilentlyContinue
    $custom = @($all | Where-Object { $_.TaskPath -notlike '\\Microsoft\\Windows\\*' })
    $ms = @($all | Where-Object { $_.TaskPath -like '\\Microsoft\\Windows\\*' } | Select-Object -First 45)
    $selected = $custom + $ms
    $out = @()
    foreach ($t in $selected) {
      $info = Get-ScheduledTaskInfo -TaskName $t.TaskName -TaskPath $t.TaskPath -ErrorAction SilentlyContinue
      $lastRun = ''
      if ($info -and $info.LastRunTime -and $info.LastRunTime.Year -gt 2000) {
        $lastRun = $info.LastRunTime.ToString('yyyy-MM-dd HH:mm')
      }
      $nextRun = ''
      if ($info -and $info.NextRunTime -and $info.NextRunTime.Year -gt 2000) {
        $nextRun = $info.NextRunTime.ToString('yyyy-MM-dd HH:mm')
      }
      $resCode = ''
      if ($info -and $null -ne $info.LastTaskResult) {
        if ($info.LastTaskResult -eq 0) { $resCode = '0x0 (OK)' }
        elseif ($info.LastTaskResult -eq 267009) { $resCode = 'Running' }
        elseif ($info.LastTaskResult -eq 267011) { $resCode = 'Never Run' }
        else { $resCode = ('0x{0:X}' -f $info.LastTaskResult) }
      }
      $out += [PSCustomObject]@{
        name         = [string]$t.TaskName
        path         = [string]$t.TaskPath
        state        = [string]$t.State
        author       = [string]$t.Author
        description  = [string]$t.Description
        lastRunTime  = $lastRun
        lastResult   = $resCode
        nextRunTime  = $nextRun
        isSystemTask = [bool]($t.TaskPath -like '\\Microsoft\\Windows\\*')
      }
    }
    $out | ConvertTo-Json -Compress
  `
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 14000, windowsHide: true, maxBuffer: 6 * 1024 * 1024 }
    )
    const trimmed = stdout.trim()
    if (!trimmed) return []
    const parsed = JSON.parse(trimmed)
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    const items: SystemScheduledTaskItem[] = arr
      .filter((x) => x && x.name)
      .map((x) => ({
        name: String(x.name),
        path: String(x.path || '\\'),
        state: String(x.state || 'Ready'),
        author: String(x.author || ''),
        description: String(x.description || ''),
        lastRunTime: String(x.lastRunTime || ''),
        lastResult: String(x.lastResult || ''),
        nextRunTime: String(x.nextRunTime || ''),
        isSystemTask: Boolean(x.isSystemTask)
      }))
    cachedScheduledTasks = items
    return items
  } catch {
    return cachedScheduledTasks ?? []
  }
}

export async function runSystemScheduledTaskAction(params: {
  taskPath: string
  taskName: string
  action: 'run' | 'enable' | 'disable'
  elevated?: boolean
}): Promise<{ success: boolean; message: string; tasks: SystemScheduledTaskItem[] }> {
  const safePath = params.taskPath.replace(/'/g, "''")
  const safeName = params.taskName.replace(/'/g, "''")
  const verb =
    params.action === 'run'
      ? 'Start-ScheduledTask'
      : params.action === 'enable'
        ? 'Enable-ScheduledTask'
        : 'Disable-ScheduledTask'
  const psCmd = `${verb} -TaskPath '${safePath}' -TaskName '${safeName}' -ErrorAction Stop`

  try {
    if (params.elevated) {
      runElevated(psCmd, `Scheduled Task (${params.action}): ${params.taskName}`, 'system')
      await new Promise((r) => setTimeout(r, 1200))
      const tasks = await getSystemScheduledTasks(true)
      return {
        success: true,
        message: `Executed ${params.action} on task "${params.taskName}" (Elevated)`,
        tasks
      }
    }
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psCmd],
      { timeout: 8000, windowsHide: true }
    )
    const tasks = await getSystemScheduledTasks(true)
    return {
      success: true,
      message: `Task "${params.taskName}": ${params.action} succeeded`,
      tasks
    }
  } catch {
    runElevated(psCmd, `Scheduled Task (${params.action}): ${params.taskName}`, 'system')
    await new Promise((r) => setTimeout(r, 1200))
    const tasks = await getSystemScheduledTasks(true)
    return {
      success: true,
      message: `Requested UAC elevation to ${params.action} task "${params.taskName}"`,
      tasks
    }
  }
}

// ============================================================================
// 9. Hosts File, Network Adapters, DNS Switcher & Firewall Helper
// ============================================================================

const HOSTS_FILE_PATH = 'C:\\Windows\\System32\\drivers\\etc\\hosts'

export function getSystemHostsEntries(): SystemHostEntryItem[] {
  try {
    if (!existsSync(HOSTS_FILE_PATH)) return []
    const raw = readFileSync(HOSTS_FILE_PATH, 'utf-8')
    const lines = raw.split(/\r?\n/)
    const entries: SystemHostEntryItem[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      // Match active or single-hash commented host mapping lines:
      // e.g. "127.0.0.1 api.local.dev # local test" or "# 127.0.0.1 api.local.dev # disabled"
      const m = line.match(
        /^(#\s*)?((?:\d{1,3}\.){3}\d{1,3}|[0-9a-fA-F:]{2,})\s+([a-zA-Z0-9._-]+)(?:\s+#\s*(.*))?$/
      )
      if (!m) continue
      const isCommented = Boolean(m[1])
      const ip = m[2]
      const hostname = m[3]
      const comment = (m[4] || '').trim()

      // Skip default Windows sample comments ("# 102.54.94.97 rhino.acme.com" / "# 38.25.63.10 x.acme.com")
      if (
        isCommented &&
        (hostname === 'rhino.acme.com' || hostname === 'x.acme.com' || hostname === 'localhost')
      ) {
        continue
      }

      entries.push({
        lineIndex: i,
        ip,
        hostname,
        comment,
        enabled: !isCommented
      })
    }
    return entries
  } catch {
    return []
  }
}

export async function saveSystemHostEntry(params: {
  action: 'toggle' | 'add' | 'delete'
  lineIndex?: number
  ip?: string
  hostname?: string
  comment?: string
}): Promise<{ success: boolean; message: string; entries: SystemHostEntryItem[] }> {
  try {
    if (!existsSync(HOSTS_FILE_PATH)) {
      return { success: false, message: 'hosts file not found', entries: [] }
    }
    const raw = readFileSync(HOSTS_FILE_PATH, 'utf-8')
    const lines = raw.split(/\r?\n/)

    if (params.action === 'toggle' && typeof params.lineIndex === 'number') {
      const idx = params.lineIndex
      if (idx >= 0 && idx < lines.length) {
        const cur = lines[idx].trim()
        if (cur.startsWith('#')) {
          lines[idx] = cur.replace(/^#\s*/, '')
        } else {
          lines[idx] = `# ${cur}`
        }
      }
    } else if (params.action === 'delete' && typeof params.lineIndex === 'number') {
      const idx = params.lineIndex
      if (idx >= 0 && idx < lines.length) {
        lines.splice(idx, 1)
      }
    } else if (params.action === 'add') {
      const ip = (params.ip || '127.0.0.1').trim()
      const host = (params.hostname || '').trim()
      const comment = (params.comment || '').trim()
      if (!host || !/^[a-zA-Z0-9.-]+$/.test(host)) {
        return {
          success: false,
          message: 'Enter a valid hostname (e.g. api.local.test)',
          entries: getSystemHostsEntries()
        }
      }
      const newLine = `${ip}\t${host}${comment ? ` # ${comment}` : ''}`
      lines.push(newLine)
    }

    const updatedContent = lines.join('\r\n')
    try {
      writeFileSync(HOSTS_FILE_PATH, updatedContent, 'utf-8')
      return {
        success: true,
        message: 'Updated C:\\Windows\\System32\\drivers\\etc\\hosts',
        entries: getSystemHostsEntries()
      }
    } catch {
      // Write to temp file and copy via UAC elevation
      const tempDir = join(homedir(), '.sudolaunch')
      if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })
      const tempFile = join(tempDir, 'hosts.staging')
      writeFileSync(tempFile, updatedContent, 'utf-8')
      const safeTemp = tempFile.replace(/'/g, "''")
      const psCmd = `Copy-Item -LiteralPath '${safeTemp}' -Destination '${HOSTS_FILE_PATH}' -Force; ipconfig /flushdns | Out-Null`
      runElevated(psCmd, 'Update Windows hosts file', 'system')
      await new Promise((r) => setTimeout(r, 1600))
      return {
        success: true,
        message: 'Applied hosts file update via Administrator UAC and flushed DNS',
        entries: getSystemHostsEntries()
      }
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Failed to update hosts file',
      entries: getSystemHostsEntries()
    }
  }
}

export async function getSystemNetworkAdapters(): Promise<SystemNetworkAdapterItem[]> {
  const script = `
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $ErrorActionPreference = 'SilentlyContinue'
    $configs = Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' -or $_.IPv4Address -ne $null }
    $out = @()
    foreach ($c in $configs) {
      $ipv4 = ($c.IPv4Address | Select-Object -First 1).IPAddress
      $gw = ($c.IPv4DefaultGateway | Select-Object -First 1).NextHop
      $dns = @($c.DNSServer | Where-Object { $_.AddressFamily -eq 2 } | Select-Object -ExpandProperty ServerAddresses)
      $out += [PSCustomObject]@{
        name        = [string]$c.InterfaceAlias
        description = [string]$c.InterfaceDescription
        status      = [string]$c.NetAdapter.Status
        macAddress  = [string]$c.NetAdapter.MacAddress
        ipv4        = [string]$ipv4
        gateway     = [string]$gw
        dnsServers  = $dns
      }
    }
    $out | ConvertTo-Json -Compress
  `
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 8000, windowsHide: true }
    )
    const trimmed = stdout.trim()
    if (!trimmed) return []
    const parsed = JSON.parse(trimmed)
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    return arr
      .filter((x) => x && x.name)
      .map((x) => ({
        name: String(x.name),
        description: String(x.description || ''),
        status: String(x.status || 'Up'),
        macAddress: String(x.macAddress || ''),
        ipv4: String(x.ipv4 || ''),
        gateway: String(x.gateway || ''),
        dnsServers: Array.isArray(x.dnsServers)
          ? x.dnsServers.map(String)
          : x.dnsServers
            ? [String(x.dnsServers)]
            : []
      }))
  } catch {
    return []
  }
}

export async function runSystemNetworkAction(params: {
  action: 'flush-dns' | 'reset-winsock' | 'set-dns' | 'allow-port-firewall' | 'open-hosts-folder'
  adapterName?: string
  dnsPreset?: 'cloudflare' | 'google' | 'quad9' | 'dhcp'
  port?: number
}): Promise<{ success: boolean; message: string }> {
  try {
    if (params.action === 'open-hosts-folder') {
      shell.showItemInFolder(HOSTS_FILE_PATH)
      return { success: true, message: 'Opened drivers\\etc\\hosts in File Explorer' }
    }
    if (params.action === 'flush-dns') {
      await execFileAsync('ipconfig.exe', ['/flushdns'], { timeout: 5000, windowsHide: true })
      return { success: true, message: 'Successfully flushed Windows DNS Resolver Cache' }
    }
    if (params.action === 'reset-winsock') {
      runElevated(
        'netsh winsock reset; netsh int ip reset; ipconfig /flushdns',
        'Reset Winsock & TCP/IP Stack',
        'system'
      )
      return { success: true, message: 'Triggered elevated Winsock & TCP/IP reset' }
    }
    if (params.action === 'set-dns' && params.adapterName && params.dnsPreset) {
      const safeAdapter = params.adapterName.replace(/'/g, "''")
      let psCmd = ''
      if (params.dnsPreset === 'dhcp') {
        psCmd = `Set-DnsClientServerAddress -InterfaceAlias '${safeAdapter}' -ResetServerAddresses; ipconfig /flushdns`
      } else {
        const servers =
          params.dnsPreset === 'cloudflare'
            ? "'1.1.1.1','1.0.0.1'"
            : params.dnsPreset === 'google'
              ? "'8.8.8.8','8.8.4.4'"
              : "'9.9.9.9','149.112.112.112'"
        psCmd = `Set-DnsClientServerAddress -InterfaceAlias '${safeAdapter}' -ServerAddresses @(${servers}); ipconfig /flushdns`
      }
      runElevated(psCmd, `Set DNS (${params.dnsPreset}) on ${params.adapterName}`, 'system')
      return {
        success: true,
        message: `Applied ${params.dnsPreset.toUpperCase()} DNS on "${params.adapterName}" via UAC`
      }
    }
    if (params.action === 'allow-port-firewall' && params.port) {
      const p = Number(params.port)
      const psCmd = `New-NetFirewallRule -DisplayName 'SudoLaunch Dev Port TCP ${p}' -Direction Inbound -LocalPort ${p} -Protocol TCP -Action Allow -Profile Private,Domain`
      runElevated(psCmd, `Allow TCP Port ${p} in Windows Firewall`, 'system')
      return {
        success: true,
        message: `Created inbound Windows Firewall rule for TCP port ${p} via UAC`
      }
    }
    return { success: false, message: 'Unsupported network action' }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Network action failed'
    }
  }
}

// ============================================================================
// 10. Storage SMART Health, Power Plans, Sleep Locks & Repair Toolkit
// ============================================================================

export async function getSystemStorageAndPower(): Promise<SystemStorageAndPowerOverview> {
  const script = `
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $ErrorActionPreference = 'SilentlyContinue'

    $vols = @()
    foreach ($v in (Get-Volume | Where-Object { $_.DriveLetter -and $_.Size -gt 0 } | Sort-Object DriveLetter)) {
      $totGb = [math]::Round($v.Size / 1GB, 1)
      $freeGb = [math]::Round($v.SizeRemaining / 1GB, 1)
      $usedGb = [math]::Round(($v.Size - $v.SizeRemaining) / 1GB, 1)
      $pct = 0
      if ($v.Size -gt 0) {
        $pct = [math]::Round((($v.Size - $v.SizeRemaining) / $v.Size) * 100, 1)
      }
      $vols += [PSCustomObject]@{
        driveLetter  = [string]$v.DriveLetter
        label        = [string]$v.FileSystemLabel
        fileSystem   = [string]$v.FileSystem
        healthStatus = [string]$v.HealthStatus
        totalGb      = $totGb
        freeGb       = $freeGb
        usedGb       = $usedGb
        usedPercent  = $pct
      }
    }

    $disks = @()
    foreach ($d in (Get-PhysicalDisk | Sort-Object DeviceId)) {
      $disks += [PSCustomObject]@{
        friendlyName      = [string]$d.FriendlyName
        mediaType         = [string]$d.MediaType
        busType           = [string]$d.BusType
        healthStatus      = [string]$d.HealthStatus
        operationalStatus = [string]$d.OperationalStatus
        sizeGb            = [math]::Round($d.Size / 1GB, 1)
      }
    }

    $plans = @()
    $planLines = powercfg.exe /list 2>$null
    foreach ($line in $planLines) {
      if ($line -match '([0-9a-fA-F-]{36})\s+\(([^)]+)\)(\s+\*)?') {
        $plans += [PSCustomObject]@{
          guid     = $matches[1]
          name     = $matches[2].Trim()
          isActive = [bool]$matches[3]
        }
      }
    }

    [PSCustomObject]@{
      volumes    = $vols
      disks      = $disks
      powerPlans = $plans
    } | ConvertTo-Json -Depth 4 -Compress
  `
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 10000, windowsHide: true }
    )
    const trimmed = stdout.trim()
    if (!trimmed) {
      return { volumes: [], disks: [], powerPlans: [], sleepLocks: [] }
    }
    const parsed = JSON.parse(trimmed)
    const rawVols = Array.isArray(parsed.volumes)
      ? parsed.volumes
      : parsed.volumes
        ? [parsed.volumes]
        : []
    const rawDisks = Array.isArray(parsed.disks)
      ? parsed.disks
      : parsed.disks
        ? [parsed.disks]
        : []
    const rawPlans = Array.isArray(parsed.powerPlans)
      ? parsed.powerPlans
      : parsed.powerPlans
        ? [parsed.powerPlans]
        : []

    const volumes: SystemStorageVolumeItem[] = rawVols
      .filter((v: Record<string, unknown>) => v && v.driveLetter)
      .map((v: Record<string, unknown>) => ({
        driveLetter: String(v.driveLetter),
        label: String(v.label || 'Local Disk'),
        fileSystem: String(v.fileSystem || 'NTFS'),
        healthStatus: String(v.healthStatus || 'Healthy'),
        totalGb: Number(v.totalGb || 0),
        freeGb: Number(v.freeGb || 0),
        usedGb: Number(v.usedGb || 0),
        usedPercent: Number(v.usedPercent || 0)
      }))

    const disks: SystemPhysicalDiskItem[] = rawDisks
      .filter((d: Record<string, unknown>) => d && d.friendlyName)
      .map((d: Record<string, unknown>) => ({
        friendlyName: String(d.friendlyName),
        mediaType: String(d.mediaType || 'SSD'),
        busType: String(d.busType || 'NVMe'),
        healthStatus: String(d.healthStatus || 'Healthy'),
        operationalStatus: String(d.operationalStatus || 'OK'),
        sizeGb: Number(d.sizeGb || 0)
      }))

    const powerPlans: SystemPowerPlanItem[] = rawPlans
      .filter((p: Record<string, unknown>) => p && p.guid)
      .map((p: Record<string, unknown>) => ({
        guid: String(p.guid),
        name: String(p.name || 'Power Plan'),
        isActive: Boolean(p.isActive)
      }))

    // Also attempt a non-elevated/fast check of powercfg /requests
    const sleepLocks: SystemSleepLockItem[] = []
    try {
      const { stdout: reqOut } = await execFileAsync('powercfg.exe', ['/requests'], {
        timeout: 4000,
        windowsHide: true
      })
      let curCat = ''
      const lines = (reqOut || '').split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i].trim()
        if (!ln) continue
        if (/^(DISPLAY|SYSTEM|AWAYMODE|EXECUTION|PERFBOOST|ACTIVELOCKSCREEN):$/i.test(ln)) {
          curCat = ln.replace(':', '')
          continue
        }
        if (curCat && ln !== 'None.' && ln.startsWith('[')) {
          const detail = (lines[i + 1] || '').trim()
          sleepLocks.push({
            category: curCat,
            requester: ln,
            details: detail !== 'None.' ? detail : ''
          })
        }
      }
    } catch {
      // powercfg /requests requires elevation on some Windows builds; ignore gracefully
    }

    return { volumes, disks, powerPlans, sleepLocks }
  } catch {
    return { volumes: [], disks: [], powerPlans: [], sleepLocks: [] }
  }
}

export async function runSystemPowerOrRepairAction(params: {
  action:
    | 'set-power-plan'
    | 'wsl-shutdown'
    | 'sfc-scannow'
    | 'dism-check'
    | 'dism-restore'
    | 'dism-cleanup'
    | 'wsreset'
    | 'battery-report'
  planGuid?: string
}): Promise<{ success: boolean; message: string }> {
  try {
    if (params.action === 'set-power-plan' && params.planGuid) {
      if (!/^[0-9a-fA-F-]{36}$/.test(params.planGuid)) {
        return { success: false, message: 'Invalid power scheme GUID' }
      }
      await execFileAsync('powercfg.exe', ['/setactive', params.planGuid], {
        timeout: 5000,
        windowsHide: true
      })
      return { success: true, message: 'Activated selected Windows Power Plan' }
    }
    if (params.action === 'wsl-shutdown') {
      await execFileAsync('wsl.exe', ['--shutdown'], { timeout: 8000, windowsHide: true })
      return {
        success: true,
        message: 'Shut down all WSL 2 distributions and reclaimed vmmemWSL memory'
      }
    }
    if (params.action === 'sfc-scannow') {
      runElevated('sfc.exe /scannow', 'System File Checker (sfc /scannow)', 'system')
      return { success: true, message: 'Started elevated System File Checker (sfc /scannow)' }
    }
    if (params.action === 'dism-check') {
      openTerminal()
      runInTerminal('DISM.exe /Online /Cleanup-Image /CheckHealth')
      return { success: true, message: 'Running DISM /CheckHealth in SudoLaunch Terminal' }
    }
    if (params.action === 'dism-restore') {
      runElevated(
        'DISM.exe /Online /Cleanup-Image /RestoreHealth',
        'DISM RestoreHealth',
        'system'
      )
      return { success: true, message: 'Started elevated DISM /RestoreHealth scan' }
    }
    if (params.action === 'dism-cleanup') {
      runElevated(
        'DISM.exe /Online /Cleanup-Image /StartComponentCleanup',
        'DISM WinSxS Component Store Cleanup',
        'system'
      )
      return { success: true, message: 'Started elevated DISM WinSxS Component Cleanup' }
    }
    if (params.action === 'wsreset') {
      execFile('wsreset.exe', [], { windowsHide: false }, () => {})
      return { success: true, message: 'Launched Microsoft Store Cache Reset (wsreset.exe)' }
    }
    if (params.action === 'battery-report') {
      const reportPath = join(homedir(), '.sudolaunch', 'battery-report.html')
      await execFileAsync('powercfg.exe', ['/batteryreport', '/output', reportPath], {
        timeout: 8000,
        windowsHide: true
      })
      await shell.openPath(reportPath)
      return { success: true, message: `Generated and opened Battery Report (${reportPath})` }
    }
    return { success: false, message: 'Unknown repair action' }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Action failed'
    }
  }
}

// ============================================================================
// 11. Security Posture (Defender, Exclusions, BitLocker, Local Admins) & Event Log
// ============================================================================

let cachedSecurityPosture: SystemSecurityPosture | null = null

export async function getSystemSecurityPosture(force = false): Promise<SystemSecurityPosture> {
  if (!force && cachedSecurityPosture) return cachedSecurityPosture

  const script = `
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $ErrorActionPreference = 'SilentlyContinue'

    $mp = Get-MpComputerStatus -ErrorAction SilentlyContinue
    $pref = Get-MpPreference -ErrorAction SilentlyContinue

    $sigUpdated = ''
    if ($mp -and $mp.AntivirusSignatureLastUpdated) {
      $sigUpdated = $mp.AntivirusSignatureLastUpdated.ToString('yyyy-MM-dd HH:mm')
    }

    $exPaths = @()
    if ($pref -and $pref.ExclusionPath) {
      $exPaths = @($pref.ExclusionPath | Where-Object { $_ } | ForEach-Object { [string]$_ })
    }
    $exProcs = @()
    if ($pref -and $pref.ExclusionProcess) {
      $exProcs = @($pref.ExclusionProcess | Where-Object { $_ } | ForEach-Object { [string]$_ })
    }

    $blList = @()
    $blVols = Get-BitLockerVolume -ErrorAction SilentlyContinue
    if ($blVols) {
      foreach ($b in $blVols) {
        $blList += [PSCustomObject]@{
          mountPoint        = [string]$b.MountPoint
          volumeStatus      = [string]$b.VolumeStatus
          protectionStatus  = [string]$b.ProtectionStatus
          encryptionPercent = [int]$b.EncryptionPercentage
        }
      }
    }

    $admins = @()
    $admMembers = Get-LocalGroupMember -Group 'Administrators' -ErrorAction SilentlyContinue
    foreach ($m in $admMembers) {
      $admins += [string]("$($m.Name) ($($m.PrincipalSource))")
    }

    [PSCustomObject]@{
      realtimeProtectionEnabled = [bool]($mp.RealTimeProtectionEnabled)
      antivirusEnabled          = [bool]($mp.AntivirusEnabled)
      tamperProtectionEnabled   = [bool]($mp.IsTamperProtected)
      behaviorMonitorEnabled    = [bool]($mp.BehaviorMonitorEnabled)
      signatureVersion          = [string]($mp.AntivirusSignatureVersion)
      signatureLastUpdated      = $sigUpdated
      quickScanAgeDays          = [int]($mp.QuickScanAge)
      exclusionPaths            = $exPaths
      exclusionProcesses        = $exProcs
      bitLockerVolumes          = $blList
      localAdmins               = $admins
    } | ConvertTo-Json -Depth 4 -Compress
  `
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 10000, windowsHide: true }
    )
    const trimmed = stdout.trim()
    if (!trimmed) {
      throw new Error('Empty output')
    }
    const parsed = JSON.parse(trimmed)
    const rawBl = Array.isArray(parsed.bitLockerVolumes)
      ? parsed.bitLockerVolumes
      : parsed.bitLockerVolumes
        ? [parsed.bitLockerVolumes]
        : []

    const posture: SystemSecurityPosture = {
      realtimeProtectionEnabled: Boolean(parsed.realtimeProtectionEnabled),
      antivirusEnabled: Boolean(parsed.antivirusEnabled),
      tamperProtectionEnabled: Boolean(parsed.tamperProtectionEnabled),
      behaviorMonitorEnabled: Boolean(parsed.behaviorMonitorEnabled),
      signatureVersion: String(parsed.signatureVersion || 'N/A'),
      signatureLastUpdated: String(parsed.signatureLastUpdated || ''),
      quickScanAgeDays: Number(parsed.quickScanAgeDays ?? 0),
      exclusionPaths: Array.isArray(parsed.exclusionPaths)
        ? parsed.exclusionPaths.map(String)
        : parsed.exclusionPaths
          ? [String(parsed.exclusionPaths)]
          : [],
      exclusionProcesses: Array.isArray(parsed.exclusionProcesses)
        ? parsed.exclusionProcesses.map(String)
        : parsed.exclusionProcesses
          ? [String(parsed.exclusionProcesses)]
          : [],
      bitLockerVolumes: rawBl
        .filter((b: Record<string, unknown>) => b && b.mountPoint)
        .map((b: Record<string, unknown>) => ({
          mountPoint: String(b.mountPoint),
          volumeStatus: String(b.volumeStatus || 'Unknown'),
          protectionStatus: String(b.protectionStatus || 'Unknown'),
          encryptionPercent: Number(b.encryptionPercent ?? 0)
        })),
      localAdmins: Array.isArray(parsed.localAdmins)
        ? parsed.localAdmins.map(String)
        : parsed.localAdmins
          ? [String(parsed.localAdmins)]
          : []
    }
    cachedSecurityPosture = posture
    return posture
  } catch {
    return (
      cachedSecurityPosture ?? {
        realtimeProtectionEnabled: true,
        antivirusEnabled: true,
        tamperProtectionEnabled: true,
        behaviorMonitorEnabled: true,
        signatureVersion: 'Unknown',
        signatureLastUpdated: '',
        quickScanAgeDays: 0,
        exclusionPaths: [],
        exclusionProcesses: [],
        bitLockerVolumes: [],
        localAdmins: []
      }
    )
  }
}

export async function runSystemSecurityAction(params: {
  action:
    | 'update-signatures'
    | 'quick-scan'
    | 'open-defender'
    | 'add-exclusion-path'
    | 'remove-exclusion-path'
  targetPath?: string
}): Promise<{ success: boolean; message: string; posture?: SystemSecurityPosture }> {
  try {
    if (params.action === 'open-defender') {
      await shell.openExternal('windowsdefender:')
      return { success: true, message: 'Opened Windows Security Center' }
    }
    if (params.action === 'update-signatures') {
      await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', 'Update-MpSignature'],
        { timeout: 25000, windowsHide: true }
      )
      const posture = await getSystemSecurityPosture(true)
      return {
        success: true,
        message: `Updated Windows Defender signatures (${posture.signatureVersion})`,
        posture
      }
    }
    if (params.action === 'quick-scan') {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', 'Start-MpScan -ScanType QuickScan'],
        { windowsHide: true },
        () => {}
      )
      return { success: true, message: 'Started Windows Defender Quick Scan in the background' }
    }
    if (
      (params.action === 'add-exclusion-path' || params.action === 'remove-exclusion-path') &&
      params.targetPath
    ) {
      const safePath = params.targetPath.trim().replace(/'/g, "''")
      const cmd =
        params.action === 'add-exclusion-path'
          ? `Add-MpPreference -ExclusionPath '${safePath}'`
          : `Remove-MpPreference -ExclusionPath '${safePath}'`
      runElevated(cmd, `Windows Defender Exclusion: ${params.targetPath}`, 'system')
      await new Promise((r) => setTimeout(r, 1500))
      const posture = await getSystemSecurityPosture(true)
      return {
        success: true,
        message: `Requested UAC to update Windows Defender Exclusion for "${params.targetPath}"`,
        posture
      }
    }
    return { success: false, message: 'Unknown security action' }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Security action failed'
    }
  }
}

export async function getSystemEventLogs(): Promise<SystemEventLogItem[]> {
  const script = `
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $ErrorActionPreference = 'SilentlyContinue'
    $since = (Get-Date).AddDays(-4)
    $evts = Get-WinEvent -FilterHashtable @{ LogName=@('Application','System'); Level=@(1,2); StartTime=$since } -MaxEvents 60 -ErrorAction SilentlyContinue
    $out = @()
    foreach ($e in $evts) {
      $msg = [string]$e.Message
      if ($msg.Length -gt 360) { $msg = $msg.Substring(0, 360) + '...' }
      $lvl = if ($e.Level -eq 1) { 'Critical' } elseif ($e.Level -eq 2) { 'Error' } else { 'Warning' }
      $out += [PSCustomObject]@{
        id           = [int]$e.Id
        recordId     = [long]$e.RecordId
        timeCreated  = $e.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss')
        logName      = [string]$e.LogName
        level        = $lvl
        providerName = [string]$e.ProviderName
        message      = ($msg -replace '\r?\n', ' ')
      }
    }
    $out | ConvertTo-Json -Compress
  `
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 10000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
    )
    const trimmed = stdout.trim()
    if (!trimmed) return []
    const parsed = JSON.parse(trimmed)
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    return arr
      .filter((e) => e && e.providerName)
      .map((e) => ({
        id: Number(e.id || 0),
        recordId: Number(e.recordId || 0),
        timeCreated: String(e.timeCreated || ''),
        logName: String(e.logName || 'Application'),
        level: (e.level === 'Critical' ? 'Critical' : 'Error') as 'Critical' | 'Error' | 'Warning',
        providerName: String(e.providerName || ''),
        message: String(e.message || '')
      }))
  } catch {
    return []
  }
}

// ============================================================================
// Register System Manager IPC
// ============================================================================

export function registerSystemManagerIpc(): void {
  ipcMain.handle(
    'system-get-windows-update-status',
    (
      _event,
      options?: { force?: boolean; scanPending?: boolean; online?: boolean }
    ) => getWindowsUpdateStatus(options)
  )
  ipcMain.handle(
    'system-run-windows-update-action',
    (
      _event,
      action:
        | 'open-settings'
        | 'open-history'
        | 'trigger-scan'
        | 'schedule-reboot-60s'
        | 'cancel-reboot'
    ) => runWindowsUpdateAction(action)
  )
  ipcMain.handle('system-get-ecosystem-updates', (_event, force?: boolean) =>
    getEcosystemUpdates(Boolean(force))
  )
  ipcMain.handle(
    'system-run-ecosystem-update',
    (
      _event,
      params: {
        manager: 'npm' | 'pip' | 'psmodule' | 'wsl'
        id?: string
        all?: boolean
        inTerminal?: boolean
      }
    ) => runEcosystemUpdate(params)
  )
  ipcMain.handle('system-get-runtimes', (_event, force?: boolean) =>
    getDevRuntimesStatus(Boolean(force))
  )
  ipcMain.handle('system-get-path-health', () => getPathHealth())
  ipcMain.handle('system-get-env-vars', () => getSystemEnvVars())
  ipcMain.handle(
    'system-set-env-var',
    (
      _event,
      params: { name: string; value: string; scope: 'User' | 'Machine'; elevated?: boolean }
    ) => setSystemEnvVar(params)
  )
  ipcMain.handle(
    'system-delete-env-var',
    (_event, params: { name: string; scope: 'User' | 'Machine'; elevated?: boolean }) =>
      deleteSystemEnvVar(params)
  )
  ipcMain.handle('system-get-services', (_event, force?: boolean) =>
    getSystemServices(Boolean(force))
  )
  ipcMain.handle('system-toggle-pin-service', (_event, name: string) =>
    togglePinSystemService(name)
  )
  ipcMain.handle(
    'system-run-service-action',
    (
      _event,
      params: {
        name: string
        action: 'start' | 'stop' | 'restart' | 'auto' | 'manual' | 'disabled'
        elevated?: boolean
      }
    ) => runSystemServiceAction(params)
  )
  ipcMain.handle('system-get-startup-apps', () => getSystemStartupApps())
  ipcMain.handle('system-get-scheduled-tasks', (_event, force?: boolean) =>
    getSystemScheduledTasks(Boolean(force))
  )
  ipcMain.handle(
    'system-run-scheduled-task-action',
    (
      _event,
      params: {
        taskPath: string
        taskName: string
        action: 'run' | 'enable' | 'disable'
        elevated?: boolean
      }
    ) => runSystemScheduledTaskAction(params)
  )
  ipcMain.handle('system-get-ports', () => getSystemPorts())
  ipcMain.handle('system-get-processes', () => getSystemProcesses())
  ipcMain.handle('system-kill-process', (_event, pid: number, elevated?: boolean) =>
    killSystemProcess(pid, elevated)
  )
  ipcMain.handle('system-get-hosts-entries', () => getSystemHostsEntries())
  ipcMain.handle(
    'system-save-host-entry',
    (
      _event,
      params: {
        action: 'toggle' | 'add' | 'delete'
        lineIndex?: number
        ip?: string
        hostname?: string
        comment?: string
      }
    ) => saveSystemHostEntry(params)
  )
  ipcMain.handle('system-get-network-adapters', () => getSystemNetworkAdapters())
  ipcMain.handle(
    'system-run-network-action',
    (
      _event,
      params: {
        action:
          | 'flush-dns'
          | 'reset-winsock'
          | 'set-dns'
          | 'allow-port-firewall'
          | 'open-hosts-folder'
        adapterName?: string
        dnsPreset?: 'cloudflare' | 'google' | 'quad9' | 'dhcp'
        port?: number
      }
    ) => runSystemNetworkAction(params)
  )
  ipcMain.handle('system-get-cleanup-targets', () => getCleanupTargets())
  ipcMain.handle('system-clean-targets', (_event, ids: string[]) => cleanSystemTargets(ids))
  ipcMain.handle('system-get-storage-and-power', () => getSystemStorageAndPower())
  ipcMain.handle(
    'system-run-power-or-repair-action',
    (
      _event,
      params: {
        action:
          | 'set-power-plan'
          | 'wsl-shutdown'
          | 'sfc-scannow'
          | 'dism-check'
          | 'dism-restore'
          | 'dism-cleanup'
          | 'wsreset'
          | 'battery-report'
        planGuid?: string
      }
    ) => runSystemPowerOrRepairAction(params)
  )
  ipcMain.handle('system-get-security-posture', (_event, force?: boolean) =>
    getSystemSecurityPosture(Boolean(force))
  )
  ipcMain.handle(
    'system-run-security-action',
    (
      _event,
      params: {
        action:
          | 'update-signatures'
          | 'quick-scan'
          | 'open-defender'
          | 'add-exclusion-path'
          | 'remove-exclusion-path'
        targetPath?: string
      }
    ) => runSystemSecurityAction(params)
  )
  ipcMain.handle('system-get-event-logs', () => getSystemEventLogs())
  ipcMain.handle('system-open-external', (_event, url: string) => {
    if (url && /^https?:\/\//i.test(url)) {
      shell.openExternal(url)
    }
  })
  ipcMain.handle('system-reveal-path', (_event, targetPath: string) => {
    if (targetPath && existsSync(targetPath)) {
      shell.showItemInFolder(targetPath)
    }
  })
}

