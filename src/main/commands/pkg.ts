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
  wingetId: string
}

const TOOL_DEFS: ToolDef[] = [
  { id: 'node', name: 'Node.js', icon: '🟢', arg: '--version', wingetId: 'OpenJS.NodeJS.LTS' },
  { id: 'npm', name: 'npm', icon: '📦', arg: '--version', wingetId: 'OpenJS.NodeJS.LTS' },
  { id: 'python', name: 'Python', icon: '🐍', arg: '--version', wingetId: 'Python.Python.3.12' },
  { id: 'go', name: 'Go (Golang)', icon: '🐹', arg: 'version', wingetId: 'GoLang.Go' },
  { id: 'git', name: 'Git', icon: '🌿', arg: '--version', wingetId: 'Git.Git' },
  { id: 'rustc', name: 'Rust (rustc)', icon: '🦀', arg: '--version', wingetId: 'Rustlang.Rustup' },
  { id: 'dotnet', name: '.NET SDK', icon: '🟣', arg: '--version', wingetId: 'Microsoft.DotNet.SDK.8' },
  { id: 'pwsh', name: 'PowerShell 7', icon: '⚡', arg: '--version', wingetId: 'Microsoft.PowerShell' },
  { id: 'docker', name: 'Docker CLI', icon: '🐳', arg: '--version', wingetId: 'Docker.DockerDesktop' },
  { id: 'winget', name: 'WinGet', icon: '🪽', arg: '--version', wingetId: 'Microsoft.AppInstaller' }
]

interface RuntimeInfo {
  id: string
  name: string
  icon: string
  version: string
  path: string
  wingetId: string
  installed: boolean
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
        $mPath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
        $uPath = [Environment]::GetEnvironmentVariable('Path', 'User')
        $env:Path = "$mPath;$uPath;$env:Path"
        $tools = @(
          @{ id='node'; arg='--version'; fb=@() },
          @{ id='npm'; arg='--version'; fb=@() },
          @{ id='python'; arg='--version'; fb=@() },
          @{ id='go'; arg='version'; fb=@('C:\\Program Files\\Go\\bin\\go.exe', 'C:\\Go\\bin\\go.exe', "$env:LOCALAPPDATA\\Programs\\Go\\bin\\go.exe") },
          @{ id='git'; arg='--version'; fb=@() },
          @{ id='rustc'; arg='--version'; fb=@() },
          @{ id='dotnet'; arg='--version'; fb=@() },
          @{ id='pwsh'; arg='--version'; fb=@() },
          @{ id='docker'; arg='--version'; fb=@() },
          @{ id='winget'; arg='--version'; fb=@() }
        )
        $out = @()
        foreach ($t in $tools) {
          $src = $null
          $cmd = Get-Command $t.id -ErrorAction SilentlyContinue | Select-Object -First 1
          if ($cmd -and $cmd.Source) {
            $src = $cmd.Source
          } else {
            foreach ($cand in $t.fb) {
              if (Test-Path -LiteralPath $cand) {
                $src = $cand
                break
              }
            }
          }
          if ($src) {
            $ver = (& $src $t.arg 2>&1 | Select-Object -First 1 | Out-String).Trim()
            if ($ver -and $ver -notmatch 'was not found') {
              $out += [PSCustomObject]@{
                id = $t.id
                version = $ver
                path = $src
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
      const foundMap = new Map<string, { version: string; path: string }>()
      if (trimmed) {
        const parsed = JSON.parse(trimmed)
        const arr = Array.isArray(parsed) ? parsed : [parsed]
        for (const r of arr) {
          if (!r?.id || !r?.path) continue
          foundMap.set(String(r.id), {
            version: String(r.version || 'Installed'),
            path: String(r.path)
          })
        }
      }
      const list: RuntimeInfo[] = TOOL_DEFS.map((def) => {
        const found = foundMap.get(def.id)
        return {
          id: def.id,
          name: def.name,
          icon: def.icon,
          wingetId: def.wingetId,
          installed: Boolean(found),
          version: found ? found.version : 'Not Installed',
          path: found ? found.path : ''
        }
      })
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
    }
  ]

  if (rt.installed) {
    items.push(
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
    )

    if (existsSync(rt.path)) {
      items.push({
        label: `📂 Reveal ${rt.id} Binary in File Explorer`,
        sublabel: `${rt.path} · ↵ Open folder in Explorer`,
        value: `__explorer::${rt.path}`
      })
    }

    items.push({
      label: `⬆️ Upgrade ${rt.name} via WinGet (${rt.wingetId})`,
      sublabel: `Run "winget upgrade --id ${rt.wingetId}" in SudoLaunch Terminal`,
      value: `__term::winget upgrade --id ${rt.wingetId}`
    })
  } else {
    items.push({
      label: `📥 Install ${rt.name} via WinGet (${rt.wingetId})`,
      sublabel: `Run "winget install --id ${rt.wingetId} -e" in SudoLaunch Terminal (Ctrl+↵ Elevated)`,
      value: `__term::winget install --id ${rt.wingetId} -e`
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
  if (!raw || 'upgrade update winget pin system'.includes(qLower)) {
    items.push({
      label: '🧰 Open WinGet Package Manager (System Management)',
      sublabel: 'Interactive GUI for available updates, installed packages, pins, and search (/system)',
      value: '__open_system_winget'
    })
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
    if (rt.installed) {
      items.push({
        label: `${rt.icon} ${rt.name}: ${rt.version}`,
        sublabel: `${rt.path} · ↵ Copy Path · Tab for Details & Explorer`,
        value: rt.path,
        completion: `/pkg @${rt.id}`,
        executeOnEnter: true
      })
    } else {
      items.push({
        label: `${rt.icon} ${rt.name}: Not Installed`,
        sublabel: `↵ Install ${rt.name} via WinGet (${rt.wingetId}) · Tab for Options`,
        value: `__term::winget install --id ${rt.wingetId} -e`,
        completion: `/pkg @${rt.id}`,
        executeOnEnter: true
      })
    }
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
