import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { shell } from 'electron'
import type {
  SystemPortItem,
  SystemProcessItem,
  SystemHostEntryItem,
  SystemNetworkAdapterItem
} from '../../shared/types'
import { runElevated } from '../elevation'

const execFileAsync = promisify(execFile)

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
