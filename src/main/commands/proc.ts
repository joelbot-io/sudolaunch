import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { clipboard, shell } from 'electron'
import Fuse from 'fuse.js'
import type { SearchResultItem } from '../../shared/types'
import { runInTerminal } from '../terminalWindow'
import { runElevated } from '../elevation'
import { addNotification } from '../notifications'

const execFileAsync = promisify(execFile)

interface ProcessInfo {
  pid: number
  name: string
  memMb: number
  cpuSec: number
  path?: string
  title?: string
}

let cachedProcs: { timestamp: number; list: ProcessInfo[] } | null = null
let inflightProcs: Promise<ProcessInfo[]> | null = null

async function getProcesses(force = false): Promise<ProcessInfo[]> {
  if (!force && cachedProcs && Date.now() - cachedProcs.timestamp < 5000) {
    return cachedProcs.list
  }
  if (inflightProcs) return inflightProcs

  inflightProcs = (async () => {
    try {
      const script = `
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        $ErrorActionPreference = 'SilentlyContinue'
        Get-Process |
          Select-Object Id, ProcessName, @{N='MemMb';E={[math]::Round($_.WorkingSet64 / 1MB, 1)}}, @{N='CpuSec';E={[math]::Round([double]$_.CPU, 1)}}, Path, MainWindowTitle |
          Sort-Object MemMb -Descending |
          Select-Object -First 150 |
          ConvertTo-Json -Compress
      `
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { timeout: 3500, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
      )
      const trimmed = stdout.trim()
      const list: ProcessInfo[] = []
      if (trimmed) {
        const parsed = JSON.parse(trimmed)
        const arr = Array.isArray(parsed) ? parsed : [parsed]
        for (const p of arr) {
          if (typeof p?.Id !== 'number' || !p?.ProcessName) continue
          list.push({
            pid: p.Id,
            name: String(p.ProcessName),
            memMb: typeof p.MemMb === 'number' ? p.MemMb : 0,
            cpuSec: typeof p.CpuSec === 'number' ? p.CpuSec : 0,
            path: p.Path ? String(p.Path) : undefined,
            title: p.MainWindowTitle ? String(p.MainWindowTitle).trim() : undefined
          })
        }
      }
      cachedProcs = { timestamp: Date.now(), list }
      return list
    } catch {
      return cachedProcs?.list ?? []
    } finally {
      inflightProcs = null
    }
  })()

  return inflightProcs
}

async function renderPidDrilldown(pid: number, procs: ProcessInfo[]): Promise<SearchResultItem[]> {
  const proc = procs.find((p) => p.pid === pid)
  let cmdLine = ''
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction SilentlyContinue).CommandLine`
      ],
      { timeout: 2000, windowsHide: true }
    )
    cmdLine = stdout.trim()
  } catch {
    // ignore
  }

  const name = proc?.name ?? `PID ${pid}`
  const items: SearchResultItem[] = [
    {
      label: '← Back to Process List',
      sublabel: 'Return to live running processes',
      value: '',
      completion: '/proc '
    },
    {
      label: `🛑 Kill ${name} (PID ${pid})`,
      sublabel: 'Terminate process immediately · ↵ Kill · Ctrl+↵ Elevated Admin Kill',
      value: `__kill::${pid}::${name}`
    },
    {
      label: `🛡️ Force Kill ${name} as Administrator (PID ${pid})`,
      sublabel: 'Run elevated Stop-Process -Id -Force (UAC prompt)',
      value: `__kill_admin::${pid}::${name}`
    },
    {
      label: `📋 Copy PID: ${pid}`,
      sublabel: `${name} (${proc ? `${proc.memMb} MB RAM, ${proc.cpuSec}s CPU` : ''}) · ↵ Copy PID`,
      value: String(pid)
    }
  ]

  if (cmdLine) {
    items.push({
      label: `📋 Copy Command Line`,
      sublabel: `${cmdLine.length > 90 ? cmdLine.slice(0, 87) + '...' : cmdLine} · ↵ Copy full command line`,
      value: cmdLine
    })
  }

  if (proc?.path) {
    items.push({
      label: `📋 Copy Executable Path`,
      sublabel: `${proc.path} · ↵ Copy path`,
      value: proc.path
    })
    if (existsSync(proc.path)) {
      items.push({
        label: `📂 Reveal Executable in File Explorer`,
        sublabel: `${proc.path} · ↵ Show in Explorer`,
        value: `__explorer::${proc.path}`
      })
    }
  }

  items.push({
    label: `🔌 Inspect Listening Ports for PID ${pid} in Terminal`,
    sublabel: `Run "Get-NetTCPConnection -OwningProcess ${pid}" in SudoLaunch Terminal`,
    value: `__term::Get-NetTCPConnection -OwningProcess ${pid} -ErrorAction SilentlyContinue | Format-Table LocalAddress, LocalPort, RemoteAddress, RemotePort, State -AutoSize`
  })

  return items
}

export async function search(query: string): Promise<SearchResultItem[]> {
  const raw = query.trim()
  const procs = await getProcesses()

  // 1. Explicit PID drill-down: /proc @1234
  const pidDrill = raw.match(/^@(\d+)$/)
  if (pidDrill) {
    return renderPidDrilldown(parseInt(pidDrill[1], 10), procs)
  }

  let sortBy: 'mem' | 'cpu' = 'mem'
  let filter = raw
  if (/^cpu(?:\s+|$)/i.test(raw)) {
    sortBy = 'cpu'
    filter = raw.replace(/^cpu\s*/i, '').trim()
  } else if (/^mem(?:\s+|$)/i.test(raw)) {
    sortBy = 'mem'
    filter = raw.replace(/^mem\s*/i, '').trim()
  }

  const sorted = [...procs].sort((a, b) => (sortBy === 'cpu' ? b.cpuSec - a.cpuSec : b.memMb - a.memMb))

  const matched = filter
    ? new Fuse(sorted, {
        keys: [
          { name: 'name', weight: 0.5 },
          { name: 'title', weight: 0.3 },
          { name: 'path', weight: 0.2 }
        ],
        threshold: 0.35,
        ignoreLocation: true
      })
        .search(filter)
        .map((r) => r.item)
        .concat(sorted.filter((p) => String(p.pid).startsWith(filter)))
    : sorted

  // Deduplicate by PID
  const seen = new Set<number>()
  const unique: ProcessInfo[] = []
  for (const p of matched) {
    if (!seen.has(p.pid)) {
      seen.add(p.pid)
      unique.push(p)
    }
  }

  const items: SearchResultItem[] = []

  if (!filter) {
    items.push({
      label: sortBy === 'mem' ? '🔥 Sort by CPU Time (/proc cpu)' : '💾 Sort by Memory Usage (/proc mem)',
      sublabel: `Currently sorted by ${sortBy === 'mem' ? 'Memory (RAM)' : 'CPU Time'} · Tab/↵ to switch`,
      value: '',
      completion: sortBy === 'mem' ? '/proc cpu ' : '/proc mem '
    })
  }

  for (const p of unique.slice(0, 45)) {
    const titlePart = p.title ? ` — "${p.title.slice(0, 40)}${p.title.length > 40 ? '…' : ''}"` : ''
    items.push({
      label: `⚙️ ${p.name} (PID ${p.pid})${titlePart}`,
      sublabel: `${p.memMb.toFixed(1)} MB RAM · ${p.cpuSec.toFixed(1)}s CPU · ↵ Kill (Ctrl+↵ Admin Kill) · Tab Inspect`,
      value: `__kill::${p.pid}::${p.name}`,
      completion: `/proc @${p.pid}`,
      executeOnEnter: true
    })
  }

  if (unique.length === 0) {
    return [
      {
        label: `No running processes matching "${filter}"`,
        sublabel: 'Try searching by process name, window title, or PID (alias: /ps)',
        value: '',
        disabled: true
      }
    ]
  }

  return items
}

export async function execute(item: SearchResultItem, _query?: string, elevated?: boolean): Promise<void> {
  if (!item.value) return

  if (item.value.startsWith('__kill::') || item.value.startsWith('__kill_admin::')) {
    const forceAdmin = item.value.startsWith('__kill_admin::')
    const payload = item.value.replace(/^__kill(?:_admin)?::/, '')
    const [pidStr, name] = payload.split('::')
    const pid = parseInt(pidStr, 10)
    if (isNaN(pid)) return

    if (elevated || forceAdmin) {
      runElevated(`Stop-Process -Id ${pid} -Force`, `Kill ${name || pid} (PID ${pid})`, 'proc')
      cachedProcs = null
      return
    }

    try {
      process.kill(pid)
      cachedProcs = null
      addNotification({
        title: `Terminated ${name || 'Process'} (PID ${pid})`,
        body: 'Process was stopped successfully. Use Ctrl+Enter for elevated kill if a system process resists.',
        type: 'success',
        commandName: 'proc'
      })
    } catch {
      // Fallback to taskkill /F /PID or elevated if access denied
      try {
        await execFileAsync('taskkill.exe', ['/F', '/PID', String(pid)], { timeout: 3000, windowsHide: true })
        cachedProcs = null
        addNotification({
          title: `Terminated ${name || 'Process'} (PID ${pid})`,
          type: 'success',
          commandName: 'proc'
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        addNotification({
          title: `Could not kill ${name || 'Process'} (PID ${pid})`,
          body: `${msg.slice(0, 120)} — Retry with Ctrl+Enter to kill as Administrator.`,
          type: 'error',
          commandName: 'proc'
        })
      }
    }
    return
  }

  if (item.value.startsWith('__explorer::')) {
    const targetPath = item.value.slice('__explorer::'.length)
    if (existsSync(targetPath)) {
      shell.showItemInFolder(targetPath)
    }
    return
  }

  if (item.value.startsWith('__term::')) {
    const cmd = item.value.slice('__term::'.length)
    if (elevated) {
      runElevated(cmd, `Process: ${cmd}`, 'proc')
    } else {
      runInTerminal(cmd)
    }
    return
  }

  clipboard.writeText(item.value)
}

