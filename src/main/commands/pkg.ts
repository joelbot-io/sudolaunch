import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { clipboard, shell } from 'electron'
import type { SearchResultItem } from '../../shared/types'
import { runInTerminal } from '../terminalWindow'
import { runElevated } from '../elevation'

const execFileAsync = promisify(execFile)

interface ToolDef {
  id: string
  name: string
  icon: string
  arg: string
}

const TOOL_DEFS: ToolDef[] = [
  { id: 'node', name: 'Node.js', icon: '🟢', arg: '--version' },
  { id: 'npm', name: 'npm', icon: '📦', arg: '--version' },
  { id: 'python', name: 'Python', icon: '🐍', arg: '--version' },
  { id: 'pwsh', name: 'PowerShell 7', icon: '⚡', arg: '--version' },
  { id: 'git', name: 'Git', icon: '🌿', arg: '--version' },
  { id: 'dotnet', name: '.NET SDK', icon: '🟣', arg: '--version' },
  { id: 'go', name: 'Go', icon: '🐹', arg: 'version' },
  { id: 'rustc', name: 'Rust (rustc)', icon: '🦀', arg: '--version' },
  { id: 'docker', name: 'Docker CLI', icon: '🐳', arg: '--version' },
  { id: 'winget', name: 'WinGet', icon: '🪽', arg: '--version' }
]

interface RuntimeInfo {
  id: string
  name: string
  icon: string
  version: string
  path: string
}

let cachedRuntimes: RuntimeInfo[] | null = null
let inflightRuntimes: Promise<RuntimeInfo[]> | null = null

async function getRuntimes(force = false): Promise<RuntimeInfo[]> {
  if (!force && cachedRuntimes) return cachedRuntimes
  if (inflightRuntimes) return inflightRuntimes

  inflightRuntimes = (async () => {
    try {
      const script = `
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        $ErrorActionPreference = 'SilentlyContinue'
        $tools = @(
          @{ id='node'; arg='--version' },
          @{ id='npm'; arg='--version' },
          @{ id='python'; arg='--version' },
          @{ id='pwsh'; arg='--version' },
          @{ id='git'; arg='--version' },
          @{ id='dotnet'; arg='--version' },
          @{ id='go'; arg='version' },
          @{ id='rustc'; arg='--version' },
          @{ id='docker'; arg='--version' },
          @{ id='winget'; arg='--version' }
        )
        $out = @()
        foreach ($t in $tools) {
          $cmd = Get-Command $t.id -ErrorAction SilentlyContinue | Select-Object -First 1
          if ($cmd -and $cmd.Source) {
            $ver = (& $cmd.Source $t.arg 2>&1 | Select-Object -First 1 | Out-String).Trim()
            if ($ver) {
              $out += [PSCustomObject]@{
                id = $t.id
                version = $ver
                path = $cmd.Source
              }
            }
          }
        }
        $out | ConvertTo-Json -Compress
      `
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { timeout: 5000, windowsHide: true }
      )
      const trimmed = stdout.trim()
      const list: RuntimeInfo[] = []
      if (trimmed) {
        const parsed = JSON.parse(trimmed)
        const arr = Array.isArray(parsed) ? parsed : [parsed]
        for (const r of arr) {
          if (!r?.id || !r?.path) continue
          const def = TOOL_DEFS.find((t) => t.id === r.id)
          list.push({
            id: String(r.id),
            name: def?.name ?? String(r.id),
            icon: def?.icon ?? '🛠️',
            version: String(r.version || 'Installed'),
            path: String(r.path)
          })
        }
      }
      cachedRuntimes = list
      return list
    } catch {
      return cachedRuntimes ?? []
    } finally {
      inflightRuntimes = null
    }
  })()

  return inflightRuntimes
}

function renderRuntimeDrilldown(rtId: string, runtimes: RuntimeInfo[]): SearchResultItem[] {
  const rt = runtimes.find((r) => r.id.toLowerCase() === rtId.toLowerCase())
  if (!rt) {
    return [
      {
        label: '← Back to Packages & Runtimes',
        sublabel: 'Return to /pkg overview',
        value: '',
        completion: '/pkg '
      }
    ]
  }

  const items: SearchResultItem[] = [
    {
      label: '← Back to Packages & Runtimes',
      sublabel: 'Return to /pkg overview',
      value: '',
      completion: '/pkg '
    },
    {
      label: `📋 Copy Version: ${rt.version}`,
      sublabel: `${rt.name} version string · ↵ Copy`,
      value: rt.version
    },
    {
      label: `📋 Copy Executable Path: ${rt.path}`,
      sublabel: `↵ Copy full binary path to clipboard`,
      value: rt.path
    }
  ]

  if (existsSync(rt.path)) {
    items.push({
      label: `📂 Reveal ${rt.id} Binary in File Explorer`,
      sublabel: `${rt.path} · ↵ Open folder in Explorer`,
      value: `__explorer::${rt.path}`
    })
  }

  items.push({
    label: `>_ Check All Installed "${rt.id}" Locations in Terminal (where.exe ${rt.id})`,
    sublabel: `Run "where.exe ${rt.id}" in SudoLaunch Terminal to inspect PATH shadowing`,
    value: `__term::where.exe ${rt.id}`
  })

  return items
}

export async function search(query: string): Promise<SearchResultItem[]> {
  const raw = query.trim()
  const runtimes = await getRuntimes()

  if (raw.startsWith('@')) {
    const rtId = raw.slice(1).trim()
    if (rtId) {
      return renderRuntimeDrilldown(rtId, runtimes)
    }
  }

  const qLower = raw.toLowerCase()
  const items: SearchResultItem[] = []

  // WinGet top-level actions when query is empty or starts with upgrade/update/list
  if (!raw || 'upgrade update winget'.includes(qLower)) {
    items.push({
      label: '⬆️ Check Available WinGet Package Updates',
      sublabel: 'Run "winget upgrade" in SudoLaunch Terminal to see outdated packages',
      value: '__term::winget upgrade'
    })
    items.push({
      label: '🚀 Upgrade All Outdated WinGet Packages',
      sublabel: 'Run "winget upgrade --all" in SudoLaunch Terminal (Ctrl+↵ for Elevated)',
      value: '__term::winget upgrade --all'
    })
  }

  // Filter local developer runtimes
  const matchedRuntimes = qLower
    ? runtimes.filter(
        (r) =>
          r.id.toLowerCase().includes(qLower) ||
          r.name.toLowerCase().includes(qLower) ||
          r.version.toLowerCase().includes(qLower)
      )
    : runtimes

  for (const rt of matchedRuntimes) {
    items.push({
      label: `${rt.icon} ${rt.name}: ${rt.version}`,
      sublabel: `${rt.path} · ↵ Copy Path · Tab for Details & Explorer`,
      value: rt.path,
      completion: `/pkg @${rt.id}`,
      executeOnEnter: true
    })
  }

  // If the user typed a package query, offer direct WinGet search / install / upgrade actions
  if (raw && !raw.startsWith('@')) {
    const cleanPkg = raw.replace(/^(search|install|upgrade|update)\s+/i, '').trim()
    if (cleanPkg) {
      items.push({
        label: `🔍 WinGet Search: "${cleanPkg}"`,
        sublabel: `Run "winget search ${cleanPkg}" in SudoLaunch Terminal`,
        value: `__term::winget search "${cleanPkg.replace(/"/g, '')}"`
      })
      items.push({
        label: `📥 WinGet Install: "${cleanPkg}"`,
        sublabel: `Run "winget install ${cleanPkg}" in SudoLaunch Terminal (Ctrl+↵ Elevated)`,
        value: `__term::winget install "${cleanPkg.replace(/"/g, '')}"`
      })
      items.push({
        label: `⬆️ WinGet Upgrade: "${cleanPkg}"`,
        sublabel: `Run "winget upgrade ${cleanPkg}" in SudoLaunch Terminal (Ctrl+↵ Elevated)`,
        value: `__term::winget upgrade "${cleanPkg.replace(/"/g, '')}"`
      })
    }
  }

  if (!raw) {
    items.push({
      label: '🔄 Refresh Installed Runtime Versions',
      sublabel: 'Re-scan PATH for Node, Python, PowerShell, Git, .NET, Go, Rust, Docker, and WinGet',
      value: '__refresh'
    })
  }

  return items
}

export async function execute(item: SearchResultItem, _query?: string, elevated?: boolean): Promise<void> {
  if (!item.value) return

  if (item.value === '__refresh') {
    cachedRuntimes = null
    await getRuntimes(true)
    return
  }

  if (item.value.startsWith('__term::')) {
    const cmd = item.value.slice('__term::'.length)
    if (elevated) {
      runElevated(cmd, `WinGet / Pkg: ${cmd}`, 'pkg')
    } else {
      runInTerminal(cmd)
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

  clipboard.writeText(item.value)
}
