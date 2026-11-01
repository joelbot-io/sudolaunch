import { spawn } from 'child_process'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { dirname, isAbsolute, join, resolve } from 'path'
import { clipboard, shell } from 'electron'
import Fuse from 'fuse.js'
import type { SearchResultItem, SshHost } from '../../shared/types'
import { readSshHosts } from '../config'
import { runInTerminal } from '../terminalWindow'
import { runElevated } from '../elevation'

interface ResolvedSshHost {
  name: string
  host: string
  user?: string
  port?: number
  identityFile?: string
  extraArgs?: string
  description?: string
  source: 'saved' | 'ssh_config'
  useConfigAlias?: boolean
}

function expandHome(p: string): string {
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return join(homedir(), p.slice(2))
  }
  return p
}

function parseSshConfigFile(filePath: string, visited = new Set<string>()): ResolvedSshHost[] {
  const absPath = resolve(filePath)
  if (visited.has(absPath) || !existsSync(absPath)) return []
  visited.add(absPath)

  let content = ''
  try {
    content = readFileSync(absPath, 'utf-8')
  } catch {
    return []
  }

  const hosts: ResolvedSshHost[] = []
  let currentAliases: string[] = []
  let currentProps: Record<string, string> = {}

  const flushCurrent = (): void => {
    for (const alias of currentAliases) {
      if (!alias || alias.includes('*') || alias.includes('?') || alias.startsWith('!')) continue
      const hostname = currentProps.hostname || alias
      const user = currentProps.user
      const portNum = currentProps.port ? parseInt(currentProps.port, 10) : undefined
      const identityFile = currentProps.identityfile
      const proxyJump = currentProps.proxyjump
      const localForward = currentProps.localforward

      const notes: string[] = []
      if (proxyJump) notes.push(`ProxyJump: ${proxyJump}`)
      if (localForward) notes.push(`Forward: ${localForward}`)

      hosts.push({
        name: alias,
        host: hostname,
        user,
        port: portNum && !isNaN(portNum) ? portNum : undefined,
        identityFile,
        description: notes.length ? notes.join(' · ') : 'From ~/.ssh/config',
        source: 'ssh_config',
        useConfigAlias: true
      })
    }
    currentAliases = []
    currentProps = {}
  }

  const sshDir = dirname(absPath)

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue

    const match = line.match(/^([A-Za-z0-9]+)(?:\s*=\s*|\s+)(.+)$/)
    if (!match) continue

    const key = match[1].toLowerCase()
    const val = match[2].trim().replace(/^"(.*)"$/, '$1')

    if (key === 'include') {
      flushCurrent()
      const pattern = expandHome(val)
      const fullPattern = isAbsolute(pattern) ? pattern : join(sshDir, pattern)
      if (fullPattern.includes('*')) {
        const dir = dirname(fullPattern)
        if (existsSync(dir)) {
          try {
            for (const entry of readdirSync(dir)) {
              if (entry.startsWith('.')) continue
              hosts.push(...parseSshConfigFile(join(dir, entry), visited))
            }
          } catch {
            // ignore
          }
        }
      } else {
        hosts.push(...parseSshConfigFile(fullPattern, visited))
      }
      continue
    }

    if (key === 'host') {
      flushCurrent()
      currentAliases = val.split(/\s+/).filter(Boolean)
      continue
    }

    if (key === 'match') {
      flushCurrent()
      continue
    }

    if (currentAliases.length > 0 && !(key in currentProps)) {
      currentProps[key] = val
    }
  }

  flushCurrent()
  return hosts
}

function getAllSshHosts(): ResolvedSshHost[] {
  const byName = new Map<string, ResolvedSshHost>()

  // 1. Read ~/.ssh/config first
  const sshConfigPath = join(homedir(), '.ssh', 'config')
  for (const h of parseSshConfigFile(sshConfigPath)) {
    byName.set(h.name.toLowerCase(), h)
  }

  // 2. Read saved hosts from ~/.sudolaunch/ssh.json (saved hosts take precedence or enrich)
  const saved: SshHost[] = readSshHosts()
  for (const s of saved) {
    const name = (s.name || s.host || '').trim()
    const host = (s.host || s.name || '').trim()
    if (!name || !host) continue
    const portNum = typeof s.port === 'number' && !isNaN(s.port) && s.port > 0 ? s.port : undefined
    byName.set(name.toLowerCase(), {
      name,
      host,
      user: s.user?.trim() || undefined,
      port: portNum,
      identityFile: s.identityFile?.trim() || undefined,
      extraArgs: s.extraArgs?.trim() || undefined,
      description: s.description?.trim() || undefined,
      source: 'saved',
      useConfigAlias: false
    })
  }

  return Array.from(byName.values()).sort((a, b) => {
    if (a.source !== b.source) return a.source === 'saved' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function buildSshCommand(h: ResolvedSshHost): string {
  if (h.useConfigAlias && h.source === 'ssh_config') {
    return `ssh ${h.name}`
  }
  const parts: string[] = ['ssh']
  if (h.port && h.port !== 22) {
    parts.push(`-p ${h.port}`)
  }
  if (h.identityFile) {
    const quotedKey = h.identityFile.includes(' ') ? `"${h.identityFile}"` : h.identityFile
    parts.push(`-i ${quotedKey}`)
  }
  if (h.extraArgs) {
    parts.push(h.extraArgs)
  }
  const target = h.user ? `${h.user}@${h.host}` : h.host
  parts.push(target)
  return parts.join(' ')
}

function buildScpTemplate(h: ResolvedSshHost): string {
  if (h.useConfigAlias && h.source === 'ssh_config') {
    return `scp ./local-file ${h.name}:~/`
  }
  const parts: string[] = ['scp']
  if (h.port && h.port !== 22) {
    parts.push(`-P ${h.port}`)
  }
  if (h.identityFile) {
    const quotedKey = h.identityFile.includes(' ') ? `"${h.identityFile}"` : h.identityFile
    parts.push(`-i ${quotedKey}`)
  }
  const target = h.user ? `${h.user}@${h.host}` : h.host
  parts.push('./local-file', `${target}:~/`)
  return parts.join(' ')
}

function formatHostTargetSummary(h: ResolvedSshHost): string {
  const userHost = h.user ? `${h.user}@${h.host}` : h.host
  const withPort = h.port && h.port !== 22 ? `${userHost}:${h.port}` : userHost
  return withPort
}

function parseAdHocSshInput(raw: string): { sshCmd: string; displayTarget: string } | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.startsWith('@')) return null

  const normalized = trimmed.replace(/^ssh\s+/i, '').trim()
  if (!normalized) return null

  // Match user@host:port or host:port when no spaces
  const hostPortMatch = normalized.match(/^([^\s:]+@[^\s:]+|(?:\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+):(\d{2,5})$/)
  if (hostPortMatch) {
    const hostPart = hostPortMatch[1]
    const portPart = hostPortMatch[2]
    return {
      sshCmd: `ssh -p ${portPart} ${hostPart}`,
      displayTarget: `${hostPart}:${portPart}`
    }
  }

  // Looks like user@host, IPv4, domain.tld, or explicit ssh flags (-p, -i, -L, -R, -D, -J)
  const looksLikeAdHoc =
    normalized.includes('@') ||
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(normalized) ||
    /^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(normalized) ||
    normalized.startsWith('-')

  if (!looksLikeAdHoc) return null

  return {
    sshCmd: `ssh ${normalized}`,
    displayTarget: normalized
  }
}

function launchExternalSsh(sshCmd: string, title = 'SSH Session'): void {
  const encoded = Buffer.from(sshCmd, 'utf16le').toString('base64')
  // Prefer Windows Terminal (wt.exe) if available, otherwise fall back to a new PowerShell window
  const psLauncher = `
    if (Get-Command wt.exe -ErrorAction SilentlyContinue) {
      Start-Process wt.exe -ArgumentList @('new-tab', '--title', '${title.replace(/'/g, "''")}', 'powershell.exe', '-NoLogo', '-NoExit', '-EncodedCommand', '${encoded}')
    } else {
      Start-Process powershell.exe -ArgumentList @('-NoLogo', '-NoExit', '-EncodedCommand', '${encoded}')
    }
  `
  spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psLauncher], {
    windowsHide: true
  })
}

function renderHostDrilldown(h: ResolvedSshHost): SearchResultItem[] {
  const sshCmd = buildSshCommand(h)
  const scpCmd = buildScpTemplate(h)
  const summary = formatHostTargetSummary(h)
  const tunnelTarget = h.useConfigAlias && h.source === 'ssh_config' ? h.name : (h.user ? `${h.user}@${h.host}` : h.host)
  const portFlag = !h.useConfigAlias && h.port && h.port !== 22 ? `-p ${h.port} ` : ''
  const tunnelCmd = `ssh ${portFlag}-L 8080:localhost:80 -N ${tunnelTarget}`

  const items: SearchResultItem[] = [
    {
      label: '← Back to All SSH Hosts',
      sublabel: 'Return to SSH connection list',
      value: '',
      completion: '/ssh '
    },
    {
      label: `🖥️ Connect to ${h.name} in SudoLaunch Terminal`,
      sublabel: `${sshCmd} · ↵ Open in persistent terminal (Ctrl+↵ elevated)`,
      value: `__term::${sshCmd}`
    },
    {
      label: `🪟 Launch ${h.name} in External Terminal`,
      sublabel: `Open "${sshCmd}" in Windows Terminal / external PowerShell console`,
      value: `__ext::${h.name}::${sshCmd}`
    },
    {
      label: `📋 Copy SSH Command: ${sshCmd}`,
      sublabel: `${summary}${h.description ? ` — ${h.description}` : ''} · ↵ Copy to clipboard`,
      value: sshCmd
    },
    {
      label: `📋 Copy Port Forward / Tunnel Template`,
      sublabel: `${tunnelCmd} · ↵ Copy local port forward command`,
      value: tunnelCmd
    },
    {
      label: `📋 Copy SCP File Transfer Template`,
      sublabel: `${scpCmd} · ↵ Copy SCP command to clipboard`,
      value: scpCmd
    }
  ]

  const sshConfigPath = join(homedir(), '.ssh', 'config')
  if (existsSync(sshConfigPath)) {
    items.push({
      label: '📂 Reveal ~/.ssh/config in File Explorer',
      sublabel: `${sshConfigPath} · ↵ Show in Explorer`,
      value: `__explorer::${sshConfigPath}`
    })
  }

  items.push({
    label: '⚙️ Manage Saved SSH Hosts',
    sublabel: 'Add, edit, or delete saved SSH hosts in SudoLaunch Settings',
    value: '__manageSshHosts'
  })

  return items
}

export function search(query: string): SearchResultItem[] {
  const raw = query.trim()
  const hosts = getAllSshHosts()

  // 1. Check for explicit host drill-down: /ssh @<alias>
  if (raw.startsWith('@')) {
    const alias = raw.slice(1).trim().toLowerCase()
    const exact = hosts.find((h) => h.name.toLowerCase() === alias)
    if (exact) {
      return renderHostDrilldown(exact)
    }
  }

  const items: SearchResultItem[] = []

  // 2. Filter known hosts
  const matchedHosts = raw
    ? new Fuse(hosts, {
        keys: ['name', 'host', 'user', 'description', 'extraArgs'],
        threshold: 0.35,
        ignoreLocation: true
      })
        .search(raw)
        .map((r) => r.item)
    : hosts

  for (const h of matchedHosts) {
    const sshCmd = buildSshCommand(h)
    const summary = formatHostTargetSummary(h)
    const sourceBadge = h.source === 'ssh_config' ? '~/.ssh/config' : 'Saved'
    const desc = h.description ? ` · ${h.description}` : ''

    items.push({
      label: `🖥️ ${h.name} (${summary})`,
      sublabel: `[${sourceBadge}] ${sshCmd}${desc} · ↵ Terminal · Tab for External/Copy`,
      value: `__term::${sshCmd}`,
      completion: `/ssh @${h.name} `,
      executeOnEnter: true
    })

    // When narrowed down to 1-2 hosts, also surface External Terminal and Copy directly
    if (raw && matchedHosts.length <= 2) {
      items.push({
        label: `🪟 Launch ${h.name} in External Terminal`,
        sublabel: `Open "${sshCmd}" in Windows Terminal / new PowerShell window`,
        value: `__ext::${h.name}::${sshCmd}`
      })
      items.push({
        label: `📋 Copy SSH Command for ${h.name}`,
        sublabel: `${sshCmd} · ↵ Copy to clipboard`,
        value: sshCmd
      })
    }
  }

  // 3. Check for ad-hoc SSH input (e.g. user@192.168.1.50, root@server:2222, -p 2222 user@host)
  const adHoc = parseAdHocSshInput(raw)
  const exactKnownMatch = hosts.some(
    (h) => h.name.toLowerCase() === raw.toLowerCase() || h.host.toLowerCase() === raw.toLowerCase()
  )
  if (adHoc && !exactKnownMatch) {
    items.push({
      label: `🖥️ Connect to "${adHoc.displayTarget}" in SudoLaunch Terminal`,
      sublabel: `Run "${adHoc.sshCmd}" in persistent terminal · ↵ Connect`,
      value: `__term::${adHoc.sshCmd}`
    })
    items.push({
      label: `🪟 Launch "${adHoc.displayTarget}" in External Terminal`,
      sublabel: `Open "${adHoc.sshCmd}" in Windows Terminal / new PowerShell window`,
      value: `__ext::${adHoc.displayTarget}::${adHoc.sshCmd}`
    })
    items.push({
      label: `📋 Copy SSH Command: ${adHoc.sshCmd}`,
      sublabel: `Copy "${adHoc.sshCmd}" to clipboard`,
      value: adHoc.sshCmd
    })
  }

  // 4. Management & ~/.ssh/config shortcuts
  if (!raw || 'manage config settings add edit hosts'.includes(raw.toLowerCase())) {
    items.push({
      label: '⚙️ Manage Saved SSH Hosts',
      sublabel: 'Add, edit, or remove saved SSH connections in SudoLaunch Settings',
      value: '__manageSshHosts'
    })
    const sshConfigPath = join(homedir(), '.ssh', 'config')
    if (existsSync(sshConfigPath)) {
      items.push({
        label: '📂 Open ~/.ssh/config in File Explorer',
        sublabel: `${sshConfigPath} · ↵ Reveal SSH config file`,
        value: `__explorer::${sshConfigPath}`
      })
    }
  }

  if (items.length === 0) {
    return [
      {
        label: ` Connect to "${raw}" via SSH`,
        sublabel: `Run "ssh ${raw}" in SudoLaunch Terminal · ↵ Connect`,
        value: `__term::ssh ${raw}`
      },
      {
        label: `🪟 Launch "ssh ${raw}" in External Terminal`,
        sublabel: 'Open in Windows Terminal or external PowerShell window',
        value: `__ext::${raw}::ssh ${raw}`
      },
      {
        label: `📋 Copy "ssh ${raw}"`,
        sublabel: 'Copy SSH command to clipboard',
        value: `ssh ${raw}`
      },
      {
        label: '⚙️ Manage Saved SSH Hosts',
        sublabel: 'Configure saved SSH hosts in SudoLaunch Settings',
        value: '__manageSshHosts'
      }
    ]
  }

  return items
}

export async function execute(item: SearchResultItem, _query?: string, elevated?: boolean): Promise<void> {
  if (!item.value || item.value === '__manageSshHosts') return

  if (item.value.startsWith('__term::')) {
    const sshCmd = item.value.slice('__term::'.length)
    if (elevated) {
      runElevated(sshCmd, `SSH: ${sshCmd}`)
    } else {
      runInTerminal(sshCmd)
    }
    return
  }

  if (item.value.startsWith('__ext::')) {
    const rest = item.value.slice('__ext::'.length)
    const sepIdx = rest.indexOf('::')
    const title = sepIdx !== -1 ? `SSH: ${rest.slice(0, sepIdx)}` : 'SSH Session'
    const sshCmd = sepIdx !== -1 ? rest.slice(sepIdx + 2) : rest
    if (elevated) {
      runElevated(sshCmd, title)
    } else {
      launchExternalSsh(sshCmd, title)
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

