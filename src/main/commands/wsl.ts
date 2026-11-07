import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { clipboard, shell } from 'electron'
import type { SearchResultItem } from '../../shared/types'
import { runInTerminal } from '../terminalWindow'
import { runElevated } from '../elevation'
import { addNotification } from '../notifications'

const execFileAsync = promisify(execFile)

interface WslDistro {
  name: string
  state: string
  version: string
  isDefault: boolean
}

let cachedDistros: { timestamp: number; list: WslDistro[]; error?: string } | null = null

async function getWslDistros(force = false): Promise<{ list: WslDistro[]; error?: string }> {
  if (!force && cachedDistros && Date.now() - cachedDistros.timestamp < 7000) {
    return cachedDistros
  }

  try {
    const { stdout } = await execFileAsync('wsl.exe', ['--list', '--verbose'], {
      encoding: 'buffer',
      timeout: 3500,
      windowsHide: true
    })
    // wsl.exe outputs UTF-16LE on Windows; strip null bytes and ANSI sequences
    const text = stdout
      .toString('utf8')
      .replace(/\0/g, '')
      .replace(/\r/g, '')

    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    const list: WslDistro[] = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (/^NAME\s+STATE/i.test(line.replace(/^\*\s*/, ''))) continue
      const isDefault = line.startsWith('*')
      const cleaned = line.replace(/^\*\s*/, '').trim()
      const parts = cleaned.split(/\s{2,}|\t+/)
      if (parts.length >= 2) {
        list.push({
          name: parts[0].trim(),
          state: parts[1].trim(),
          version: parts[2]?.trim() || '2',
          isDefault
        })
      }
    }

    cachedDistros = { timestamp: Date.now(), list }
    return cachedDistros
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      list: [],
      error: msg.includes('ENOENT')
        ? 'WSL (wsl.exe) is not installed on this machine. Run "wsl --install" in an elevated terminal.'
        : 'No WSL distributions installed or WSL is not enabled.'
    }
  }
}

function launchExternalWsl(distro: string): void {
  const safe = distro.replace(/'/g, "''")
  const psLauncher = `
    if (Get-Command wt.exe -ErrorAction SilentlyContinue) {
      Start-Process wt.exe -ArgumentList @('new-tab', '--title', 'WSL: ${safe}', 'wsl.exe', '-d', '${safe}')
    } else {
      Start-Process wsl.exe -ArgumentList @('-d', '${safe}')
    }
  `
  spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psLauncher], {
    windowsHide: true
  })
}

function renderDistroDrilldown(distroName: string, distros: WslDistro[]): SearchResultItem[] {
  const d = distros.find((x) => x.name.toLowerCase() === distroName.toLowerCase())
  const name = d?.name || distroName
  const isRunning = d?.state.toLowerCase() === 'running'

  const items: SearchResultItem[] = [
    {
      label: '← Back to All WSL Distributions',
      sublabel: 'Return to WSL distro list',
      value: '',
      completion: '/wsl '
    },
    {
      label: `🐧 Open ${name} Shell in SudoLaunch Terminal`,
      sublabel: `Run "wsl -d ${name}" in persistent terminal · ↵ Connect`,
      value: `__term::wsl -d ${name}`
    },
    {
      label: `🪟 Launch ${name} in External Windows Terminal`,
      sublabel: `Open "wsl -d ${name}" in a new Windows Terminal tab / console window`,
      value: `__ext::${name}`
    },
    {
      label: `📂 Browse ${name} Linux Filesystem in Explorer`,
      sublabel: `Open \\\\wsl.localhost\\${name} in Windows File Explorer`,
      value: `__explorer::\\\\wsl.localhost\\${name}`
    }
  ]

  if (isRunning) {
    items.push({
      label: `⏹️ Terminate ${name} Instance`,
      sublabel: `Run "wsl --terminate ${name}" to stop this distribution`,
      value: `__terminate::${name}`
    })
  }

  if (!d?.isDefault) {
    items.push({
      label: `⭐ Set ${name} as Default WSL Distribution`,
      sublabel: `Run "wsl --set-default ${name}"`,
      value: `__setdefault::${name}`
    })
  }

  items.push({
    label: `📋 Copy Command: wsl -d ${name}`,
    sublabel: 'Copy WSL launch command to clipboard',
    value: `wsl -d ${name}`
  })

  return items
}

export async function search(query: string): Promise<SearchResultItem[]> {
  const raw = query.trim()
  const { list: distros, error } = await getWslDistros()

  if (raw.startsWith('@')) {
    const distroName = raw.slice(1).trim()
    if (distroName) {
      return renderDistroDrilldown(distroName, distros)
    }
  }

  const items: SearchResultItem[] = []
  const qLower = raw.toLowerCase()

  const filtered = qLower
    ? distros.filter(
        (d) =>
          d.name.toLowerCase().includes(qLower) ||
          d.state.toLowerCase().includes(qLower)
      )
    : distros

  for (const d of filtered) {
    const isRunning = d.state.toLowerCase() === 'running'
    const statusIcon = isRunning ? '🟢' : '⚪'
    const defBadge = d.isDefault ? ' ★ Default' : ''
    items.push({
      label: `${statusIcon} 🐧 ${d.name}${defBadge} (WSL ${d.version})`,
      sublabel: `${d.state} · ↵ Open Shell in SudoLaunch Terminal · Tab for External / Explorer / Terminate`,
      value: `__term::wsl -d ${d.name}`,
      completion: `/wsl @${d.name}`,
      executeOnEnter: true
    })
  }

  if (!qLower || 'shutdown stop restart status install'.includes(qLower)) {
    items.push({
      label: '🛑 Shutdown All WSL Distributions & Virtual Machine',
      sublabel: 'Run "wsl --shutdown" to immediately stop all running distros and reclaim RAM',
      value: '__shutdown'
    })
    items.push({
      label: '📊 Inspect WSL Status & Kernel Version in Terminal',
      sublabel: 'Run "wsl --status && wsl --version" in SudoLaunch Terminal',
      value: '__term::wsl --status; wsl --version'
    })
  }

  if (error && distros.length === 0) {
    items.unshift({
      label: 'WSL Status',
      sublabel: error,
      value: '__term::wsl --install',
      disabled: false
    })
  }

  return items
}

export async function execute(item: SearchResultItem, _query?: string, elevated?: boolean): Promise<void> {
  if (!item.value) return

  if (item.value.startsWith('__term::')) {
    const cmd = item.value.slice('__term::'.length)
    if (elevated) {
      runElevated(cmd, `WSL: ${cmd}`, 'wsl')
    } else {
      runInTerminal(cmd)
    }
    return
  }

  if (item.value.startsWith('__ext::')) {
    const distro = item.value.slice('__ext::'.length)
    launchExternalWsl(distro)
    return
  }

  if (item.value.startsWith('__explorer::')) {
    const uncPath = item.value.slice('__explorer::'.length)
    await shell.openPath(uncPath)
    return
  }

  if (item.value.startsWith('__terminate::')) {
    const distro = item.value.slice('__terminate::'.length)
    try {
      await execFileAsync('wsl.exe', ['--terminate', distro], { timeout: 5000, windowsHide: true })
      cachedDistros = null
      addNotification({
        title: `Terminated WSL Distro: ${distro}`,
        type: 'success',
        commandName: 'wsl'
      })
    } catch {
      // ignore
    }
    return
  }

  if (item.value.startsWith('__setdefault::')) {
    const distro = item.value.slice('__setdefault::'.length)
    try {
      await execFileAsync('wsl.exe', ['--set-default', distro], { timeout: 4000, windowsHide: true })
      cachedDistros = null
      addNotification({
        title: `Default WSL Distro set to ${distro}`,
        type: 'success',
        commandName: 'wsl'
      })
    } catch {
      // ignore
    }
    return
  }

  if (item.value === '__shutdown') {
    try {
      await execFileAsync('wsl.exe', ['--shutdown'], { timeout: 8000, windowsHide: true })
      cachedDistros = null
      addNotification({
        title: 'WSL Shutdown Complete',
        body: 'All WSL distributions and the lightweight utility VM have been stopped.',
        type: 'info',
        commandName: 'wsl'
      })
    } catch {
      // ignore
    }
    return
  }

  clipboard.writeText(item.value)
}

