import { execFile } from 'child_process'
import { promisify } from 'util'
import { clipboard } from 'electron'
import Fuse from 'fuse.js'
import type { SearchResultItem } from '../../shared/types'
import { runInTerminal } from '../terminalWindow'
import { runElevated } from '../elevation'
import { addNotification } from '../notifications'

const execFileAsync = promisify(execFile)

interface ServiceInfo {
  name: string
  displayName: string
  status: 'Running' | 'Stopped' | string
  startType: string
}

let cachedServices: { timestamp: number; list: ServiceInfo[] } | null = null
let inflightServices: Promise<ServiceInfo[]> | null = null

async function getServices(force = false): Promise<ServiceInfo[]> {
  if (!force && cachedServices && Date.now() - cachedServices.timestamp < 7000) {
    return cachedServices.list
  }
  if (inflightServices) return inflightServices

  inflightServices = (async () => {
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
        { timeout: 4000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
      )
      const trimmed = stdout.trim()
      const list: ServiceInfo[] = []
      if (trimmed) {
        const parsed = JSON.parse(trimmed)
        const arr = Array.isArray(parsed) ? parsed : [parsed]
        for (const s of arr) {
          if (!s?.Name) continue
          list.push({
            name: String(s.Name),
            displayName: String(s.DisplayName || s.Name),
            status: String(s.Status || 'Unknown'),
            startType: String(s.StartType || 'Manual')
          })
        }
      }
      list.sort((a, b) => {
        if (a.status === 'Running' && b.status !== 'Running') return -1
        if (a.status !== 'Running' && b.status === 'Running') return 1
        return a.displayName.localeCompare(b.displayName)
      })
      cachedServices = { timestamp: Date.now(), list }
      return list
    } catch {
      return cachedServices?.list ?? []
    } finally {
      inflightServices = null
    }
  })()

  return inflightServices
}

async function renderServiceDrilldown(svcName: string, services: ServiceInfo[]): Promise<SearchResultItem[]> {
  const svc = services.find((s) => s.name.toLowerCase() === svcName.toLowerCase())
  const canonicalName = svc?.name ?? svcName
  const displayName = svc?.displayName ?? canonicalName
  const isRunning = svc?.status === 'Running'

  let binPath = ''
  try {
    const safe = canonicalName.replace(/'/g, "''")
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-CimInstance Win32_Service -Filter "Name = '${safe}'" -ErrorAction SilentlyContinue).PathName`
      ],
      { timeout: 2500, windowsHide: true }
    )
    binPath = stdout.trim()
  } catch {
    // ignore
  }

  const items: SearchResultItem[] = [
    {
      label: '← Back to Windows Services',
      sublabel: 'Return to service search',
      value: '',
      completion: '/svc '
    }
  ]

  if (isRunning) {
    items.push({
      label: `🔄 Restart Service: ${displayName} (${canonicalName})`,
      sublabel: 'Run Restart-Service -Force · Automatically elevates if required (Ctrl+↵ force elevated)',
      value: `__svc_action::restart::${canonicalName}`
    })
    items.push({
      label: `⏹️ Stop Service: ${displayName} (${canonicalName})`,
      sublabel: 'Run Stop-Service -Force · Automatically elevates if required',
      value: `__svc_action::stop::${canonicalName}`
    })
  } else {
    items.push({
      label: `▶️ Start Service: ${displayName} (${canonicalName})`,
      sublabel: 'Run Start-Service · Automatically elevates if required (Ctrl+↵ force elevated)',
      value: `__svc_action::start::${canonicalName}`
    })
  }

  items.push({
    label: `>_ Inspect ${canonicalName} Status & Config in Terminal`,
    sublabel: `Run "Get-Service '${canonicalName}' | Format-List *" in SudoLaunch Terminal`,
    value: `__term::Get-CimInstance Win32_Service -Filter "Name='${canonicalName.replace(/'/g, "''")}'" | Format-List Name, DisplayName, State, StartMode, StartName, PathName, ProcessId`
  })

  if (binPath) {
    items.push({
      label: `📋 Copy Service Binary Path`,
      sublabel: `${binPath} · ↵ Copy to clipboard`,
      value: binPath
    })
  }

  items.push({
    label: `📋 Copy Service Name: ${canonicalName}`,
    sublabel: `${displayName} (${svc?.status ?? 'Unknown'} · ${svc?.startType ?? ''}) · ↵ Copy name`,
    value: canonicalName
  })

  return items
}

export async function search(query: string): Promise<SearchResultItem[]> {
  const raw = query.trim()
  const services = await getServices()

  if (raw.startsWith('@')) {
    const svcName = raw.slice(1).trim()
    if (svcName) {
      return renderServiceDrilldown(svcName, services)
    }
  }

  let statusFilter: 'all' | 'running' | 'stopped' = 'all'
  let searchFilter = raw
  if (/^running(?:\s+|$)/i.test(raw)) {
    statusFilter = 'running'
    searchFilter = raw.replace(/^running\s*/i, '').trim()
  } else if (/^stopped(?:\s+|$)/i.test(raw)) {
    statusFilter = 'stopped'
    searchFilter = raw.replace(/^stopped\s*/i, '').trim()
  }

  const baseList =
    statusFilter === 'running'
      ? services.filter((s) => s.status === 'Running')
      : statusFilter === 'stopped'
        ? services.filter((s) => s.status === 'Stopped')
        : services

  const matched = searchFilter
    ? new Fuse(baseList, {
        keys: [
          { name: 'name', weight: 0.5 },
          { name: 'displayName', weight: 0.5 }
        ],
        threshold: 0.35,
        ignoreLocation: true
      })
        .search(searchFilter)
        .map((r) => r.item)
    : baseList

  const items: SearchResultItem[] = []

  if (!raw) {
    const runningCount = services.filter((s) => s.status === 'Running').length
    const stoppedCount = services.filter((s) => s.status === 'Stopped').length
    items.push({
      label: `🟢 Running Services (${runningCount})`,
      sublabel: 'Filter to currently active Windows services · Tab/↵',
      value: '',
      completion: '/svc running '
    })
    items.push({
      label: `🔴 Stopped Services (${stoppedCount})`,
      sublabel: 'Filter to stopped Windows services · Tab/↵',
      value: '',
      completion: '/svc stopped '
    })
  }

  for (const s of matched.slice(0, 45)) {
    const icon = s.status === 'Running' ? '🟢' : '🔴'
    items.push({
      label: `${icon} ${s.displayName} (${s.name})`,
      sublabel: `${s.status} · Startup: ${s.startType} · ↵ / Tab for Start, Stop, Restart & Details`,
      value: s.name,
      completion: `/svc @${s.name}`
    })
  }

  if (matched.length === 0) {
    return [
      {
        label: `No Windows services matching "${searchFilter}"`,
        sublabel: 'Try: /svc running · /svc stopped · /svc spooler · /svc docker · /svc ssh',
        value: '',
        disabled: true
      }
    ]
  }

  return items
}

export async function execute(item: SearchResultItem, _query?: string, elevated?: boolean): Promise<void> {
  if (!item.value) return

  if (item.value.startsWith('__svc_action::')) {
    const [, action, svcName] = item.value.split('::')
    if (!action || !svcName) return
    const safeName = svcName.replace(/'/g, "''")
    const psCmd =
      action === 'start'
        ? `Start-Service -Name '${safeName}'`
        : action === 'stop'
          ? `Stop-Service -Name '${safeName}' -Force`
          : `Restart-Service -Name '${safeName}' -Force`

    if (elevated) {
      runElevated(psCmd, `${action.toUpperCase()} Service: ${svcName}`, 'svc')
      cachedServices = null
      return
    }

    try {
      await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
        timeout: 8000,
        windowsHide: true
      })
      cachedServices = null
      addNotification({
        title: `Service ${svcName}: ${action} succeeded`,
        type: 'success',
        commandName: 'svc'
      })
    } catch {
      // Windows services commonly require Administrator privileges to start/stop — elevate automatically
      runElevated(psCmd, `${action.toUpperCase()} Service: ${svcName}`, 'svc')
      cachedServices = null
    }
    return
  }

  if (item.value.startsWith('__term::')) {
    const cmd = item.value.slice('__term::'.length)
    if (elevated) {
      runElevated(cmd, `Service: ${cmd}`, 'svc')
    } else {
      runInTerminal(cmd)
    }
    return
  }

  clipboard.writeText(item.value)
}

