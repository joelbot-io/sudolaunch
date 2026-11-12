import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type {
  SystemServiceItem,
  SystemStartupAppItem,
  SystemScheduledTaskItem
} from '../../shared/types'
import { runElevated } from '../elevation'

const execFileAsync = promisify(execFile)

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

  // Run with UAC elevation and wait using UTF-16LE -EncodedCommand
  try {
    const encoded = Buffer.from(psCmd, 'utf16le').toString('base64')
    const elevateWait = `
      $p = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}') -Verb RunAs -Wait -PassThru -WindowStyle Hidden
      if ($p -and $p.ExitCode -eq 0) { exit 0 } else { exit 1 }
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
