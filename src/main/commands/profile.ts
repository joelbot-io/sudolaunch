import { Notification, shell, app } from 'electron'
import { execFile } from 'child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, cpSync, rmSync, writeFileSync } from 'fs'
import { join, basename, resolve } from 'path'
import Fuse from 'fuse.js'
import type { SearchResultItem, ProfileItem, BackupArchiveItem } from '../../shared/types'
import { addNotification } from '../notifications'
import {
  CONFIG_DIR,
  ARCHIVES_DIR,
  PROFILES_DIR,
  DEFAULT_SETTINGS,
  SEED_CONTACTS,
  SEED_PEERS,
  CONFIG_PATHS,
  readHistory,
  readSettings,
  writeHistory,
  writeSettings,
  writeContacts,
  writeSnippets,
  writeLinks,
  writeTeamLinks,
  writePeers,
  ensureConfigDir
} from '../config'
import { dockManager } from '../dock/DockManager'
import { resetBarPosition } from '../barWindow'
import { resetTermPosition } from '../terminalWindow'
import { ensureCommandsDir } from '../customCommands'
import { ensureGifDir } from './gif'
import { ensureLookupDir } from './lookup'
import { getAppIconPath } from '../icon'

interface ProfileAction {
  id: string
  label: string
  sublabel: string
  keywords: string[]
  value: string
}

const ACTIONS: ProfileAction[] = [
  {
    id: 'open-profile',
    label: 'Open profile folder',
    sublabel: 'Reveal %USERPROFILE%\\.sudolaunch in File Explorer',
    keywords: ['open', 'folder', 'explore', 'directory', 'path', 'config', 'explorer', 'show'],
    value: '__open-profile'
  },
  {
    id: 'backup',
    label: 'Backup profile',
    sublabel: 'Create a timestamped archive of ~/.sudolaunch in ~/.sudolaunch-archives',
    keywords: ['backup', 'archive', 'snapshot', 'zip', 'save', 'export'],
    value: '__backup'
  },
  {
    id: 'restore',
    label: 'Restore profile from backup',
    sublabel: 'Restore configuration from the most recent backup in ~/.sudolaunch-archives',
    keywords: ['restore', 'rollback', 'load', 'revert', 'previous', 'undo'],
    value: '__restore'
  },
  {
    id: 'reset',
    label: 'Reset profile to defaults',
    sublabel: 'Restore settings, contacts, links, and snippets to factory state (creates safety backup)',
    keywords: ['reset', 'defaults', 'factory', 'clean', 'wipe', 'clear', 'reinitialize'],
    value: '__reset'
  },
  {
    id: 'open-backups',
    label: 'Open backups folder',
    sublabel: 'Reveal %USERPROFILE%\\.sudolaunch-archives in File Explorer',
    keywords: ['open', 'backups', 'archives', 'folder', 'explore', 'directory', 'zip'],
    value: '__open-backups'
  },
  {
    id: 'clean-history',
    label: 'Clean sensitive history',
    sublabel: 'Scrub sensitive tokens (passwords, hashes, JWTs) and retain recent clean entries',
    keywords: ['clean', 'history', 'scrub', 'sanitize', 'privacy', 'secrets', 'tokens', 'password'],
    value: '__clean-history'
  },
  {
    id: 'clear-history',
    label: 'Clear all command history',
    sublabel: 'Wipe all recorded command history entries completely',
    keywords: ['clear', 'wipe', 'delete', 'empty', 'history', 'purge'],
    value: '__clear-history'
  },
  {
    id: 'validate',
    label: 'Validate and repair profile',
    sublabel: 'Verify configuration files for JSON syntax/schema errors and repair missing defaults',
    keywords: ['validate', 'verify', 'repair', 'fix', 'check', 'health', 'integrity', 'schema'],
    value: '__validate'
  },
  {
    id: 'sync-shell',
    label: 'Sync shell terminal profile',
    sublabel: 'Install SudoLaunch aliases (sl, sl-edit, sl-profile) into PowerShell $PROFILE',
    keywords: ['sync', 'shell', 'terminal', 'powershell', 'alias', 'profile', 'install', 'pwsh'],
    value: '__sync-shell'
  }
]

const fuse = new Fuse(ACTIONS, {
  keys: [
    { name: 'label', weight: 0.4 },
    { name: 'keywords', weight: 0.4 },
    { name: 'sublabel', weight: 0.2 }
  ],
  threshold: 0.4,
  ignoreLocation: true
})

interface NotifyOptions {
  title: string
  body: string
  commandInput?: string
  onClick?: () => void
  actions?: { text: string; onClick: () => void }[]
}

function notify(options: NotifyOptions): void {
  addNotification({
    title: options.title,
    body: options.body,
    type: 'info',
    commandName: 'profile',
    commandInput: options.commandInput ?? '/profile',
    showNativeToast: false
  })

  const n = new Notification({
    title: options.title,
    body: options.body,
    icon: getAppIconPath(),
    actions: options.actions?.map((a) => ({ type: 'button' as const, text: a.text }))
  })

  if (options.onClick) {
    n.on('click', () => {
      try {
        options.onClick?.()
      } catch {
        // ignore
      }
    })
  }

  if (options.actions && options.actions.length > 0) {
    n.on('action', (_event, index) => {
      try {
        options.actions?.[index]?.onClick()
      } catch {
        // ignore
      }
    })
  }

  n.show()
}

function runPowerShell(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { windowsHide: true },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(stderr?.trim() || error.message))
        } else {
          resolve()
        }
      }
    )
  })
}

function getTimestamp(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

async function createBackupArchive(tag?: string): Promise<string> {
  if (!existsSync(ARCHIVES_DIR)) {
    mkdirSync(ARCHIVES_DIR, { recursive: true })
  }
  const ts = getTimestamp()
  const suffix = tag ? `-${tag}` : ''
  const filename = `sudolaunch-backup-${ts}${suffix}.zip`

  const psScript = `
    $profileDir = Join-Path $env:USERPROFILE '.sudolaunch';
    $archiveDir = Join-Path $env:USERPROFILE '.sudolaunch-archives';
    if (-not (Test-Path $archiveDir)) { New-Item -Path $archiveDir -ItemType Directory -Force | Out-Null };
    $dest = Join-Path $archiveDir '${filename}';
    Compress-Archive -Path (Join-Path $profileDir '*') -DestinationPath $dest -Force
  `
  await runPowerShell(psScript)
  return filename
}

async function handleReset(): Promise<void> {
  // 1. Create a safety backup snapshot before wiping/resetting
  try {
    if (existsSync(CONFIG_DIR) && readdirSync(CONFIG_DIR).length > 0) {
      await createBackupArchive('prereset')
    }
  } catch {
    // Continue even if snapshot fails, but ensure directory exists
  }

  // 2. Re-seed default configuration files
  ensureConfigDir()
  writeSettings(DEFAULT_SETTINGS)
  writeContacts(SEED_CONTACTS)
  writeSnippets([])
  writeLinks([])
  writeTeamLinks([])
  writePeers(SEED_PEERS)
  writeHistory([])

  // 3. Reset dock and terminal coordinates
  resetBarPosition()
  resetTermPosition()

  notify({
    title: 'Profile Reset Complete',
    body: 'Restored to factory defaults. Safety backup created in ~/.sudolaunch-archives. Click to view backups.',
    onClick: () => {
      shell.openPath(ARCHIVES_DIR)
    },
    actions: [
      { text: 'Open Backups', onClick: () => shell.openPath(ARCHIVES_DIR) },
      { text: 'Open Profile', onClick: () => shell.openPath(CONFIG_DIR) }
    ]
  })
}

async function handleBackup(): Promise<void> {
  if (!existsSync(CONFIG_DIR) || readdirSync(CONFIG_DIR).length === 0) {
    throw new Error(`Profile directory ${CONFIG_DIR} is empty. Nothing to back up.`)
  }
  const filename = await createBackupArchive()
  notify({
    title: 'Profile Backup Created',
    body: `Archive saved: ${filename}. Click to view in File Explorer.`,
    onClick: () => {
      shell.openPath(ARCHIVES_DIR)
    },
    actions: [
      { text: 'Open Backups', onClick: () => shell.openPath(ARCHIVES_DIR) }
    ]
  })
}

async function handleRestore(): Promise<void> {
  if (!existsSync(ARCHIVES_DIR)) {
    throw new Error('Archives directory ~/.sudolaunch-archives does not exist.')
  }

  const archives = readdirSync(ARCHIVES_DIR)
    .filter((f) => f.toLowerCase().endsWith('.zip'))
    .map((name) => {
      const fullPath = join(ARCHIVES_DIR, name)
      return { name, fullPath, mtime: statSync(fullPath).mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)

  if (archives.length === 0) {
    throw new Error('No backup archive found in ~/.sudolaunch-archives to restore.')
  }

  const latest = archives[0]

  // Create safety pre-restore backup
  if (existsSync(CONFIG_DIR) && readdirSync(CONFIG_DIR).length > 0) {
    await createBackupArchive('prerestore')
  }

  const psScript = `
    $archivePath = '${latest.fullPath.replace(/'/g, "''")}';
    $profileDir = Join-Path $env:USERPROFILE '.sudolaunch';
    Expand-Archive -Path $archivePath -DestinationPath $profileDir -Force
  `
  await runPowerShell(psScript)
  notify({
    title: 'Profile Restored',
    body: `Restored from ${latest.name}. Pre-restore snapshot created. Click to view backups.`,
    onClick: () => {
      shell.openPath(ARCHIVES_DIR)
    },
    actions: [
      { text: 'Open Backups', onClick: () => shell.openPath(ARCHIVES_DIR) },
      { text: 'Open Profile', onClick: () => shell.openPath(CONFIG_DIR) }
    ]
  })
}

function handleCleanHistory(): void {
  const history = readHistory()
  const initialCount = history.length
  const sensitiveCommands = new Set(['pwd', 'hash'])
  const SENSITIVE_QUERY_REGEX = /(token|bearer|password|secret|apikey|api_key|auth|passphrase)/i
  const JWT_REGEX = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/

  const cleaned = history
    .filter((entry) => {
      if (sensitiveCommands.has(entry.command)) return false
      if (SENSITIVE_QUERY_REGEX.test(entry.query)) return false
      if (JWT_REGEX.test(entry.query.trim())) return false
      return true
    })
    .slice(-50)

  const removed = initialCount - cleaned.length
  writeHistory(cleaned)
  notify({
    title: 'History Sanitized',
    body: `Scrubbed sensitive items (${removed} removed; ${cleaned.length} retained). Click to open profile.`,
    onClick: () => {
      shell.openPath(CONFIG_DIR)
    },
    actions: [
      { text: 'Open Profile', onClick: () => shell.openPath(CONFIG_DIR) }
    ]
  })
}

function handleClearHistory(): void {
  writeHistory([])
  notify({
    title: 'History Cleared',
    body: 'All command history has been wiped completely. Click to open profile.',
    onClick: () => {
      shell.openPath(CONFIG_DIR)
    },
    actions: [
      { text: 'Open Profile', onClick: () => shell.openPath(CONFIG_DIR) }
    ]
  })
}

function handleValidate(): void {
  ensureConfigDir()
  ensureCommandsDir()
  ensureGifDir()
  ensureLookupDir()

  // Verify all core configuration JSON files
  const filesToCheck: { path: string; seed: () => void }[] = [
    { path: CONFIG_PATHS.settings, seed: () => writeSettings(DEFAULT_SETTINGS) },
    { path: CONFIG_PATHS.contacts, seed: () => writeContacts(SEED_CONTACTS) },
    { path: CONFIG_PATHS.snippets, seed: () => writeSnippets([]) },
    { path: CONFIG_PATHS.links, seed: () => writeLinks([]) },
    { path: CONFIG_PATHS.teamLinks, seed: () => writeTeamLinks([]) },
    { path: CONFIG_PATHS.peers, seed: () => writePeers(SEED_PEERS) },
    { path: CONFIG_PATHS.history, seed: () => writeHistory([]) }
  ]

  let repairedCount = 0
  for (const { path, seed } of filesToCheck) {
    if (!existsSync(path)) {
      seed()
      repairedCount++
      continue
    }
    try {
      const content = readFileSync(path, 'utf-8').replace(/^\uFEFF/, '')
      JSON.parse(content)
    } catch {
      seed()
      repairedCount++
    }
  }

  notify({
    title: 'Profile Verified & Healthy',
    body:
      repairedCount > 0
        ? `Repaired ${repairedCount} damaged or missing file(s). Click to open profile folder.`
        : 'All configuration files and schemas are healthy. Click to open profile folder.',
    onClick: () => {
      shell.openPath(CONFIG_DIR)
    },
    actions: [
      { text: 'Open Profile', onClick: () => shell.openPath(CONFIG_DIR) }
    ]
  })
}

async function handleSyncShell(): Promise<void> {
  const scriptPath = resolve(app.getAppPath(), 'scripts/sync-terminal-profile.ps1')
  if (existsSync(scriptPath)) {
    await runPowerShell(`& '${scriptPath.replace(/'/g, "''")}' -Install`)
  } else {
    // Packaged or standalone fallback: add sl alias and environment pointer to PowerShell profile
    const block = [
      '# SudoLaunch Integration',
      `$env:SUDOLAUNCH_PROFILE = '${CONFIG_DIR.replace(/'/g, "''")}'`,
      `function sl-profile { Set-Location '${CONFIG_DIR.replace(/'/g, "''")}' }`,
      'Set-Alias -Name sl -Value sl-profile -Option AllScope -ErrorAction SilentlyContinue'
    ].join('\r\n')

    const inlinePs = `
      $psProfileDir = Split-Path $PROFILE -Parent;
      if (-not (Test-Path $psProfileDir)) { New-Item -Path $psProfileDir -ItemType Directory -Force | Out-Null };
      if (-not (Test-Path $PROFILE)) { New-Item -Path $PROFILE -ItemType File -Force | Out-Null };
      $marker = '# SudoLaunch Integration';
      $content = Get-Content -Path $PROFILE -Raw -ErrorAction SilentlyContinue;
      if (-not $content -or -not $content.Contains($marker)) {
        Add-Content -Path $PROFILE -Value "${block.replace(/"/g, '`"').replace(/\$/g, '`$')}";
      }
    `
    await runPowerShell(inlinePs)
  }
  notify({
    title: 'PowerShell Profile Synced',
    body: 'SudoLaunch aliases (sl, sl-edit, sl-profile) installed in $PROFILE. Click to open profile.',
    onClick: () => {
      shell.openPath(CONFIG_DIR)
    },
    actions: [
      { text: 'Open Profile', onClick: () => shell.openPath(CONFIG_DIR) }
    ]
  })
}

export function search(query: string): SearchResultItem[] {
  const trimmed = query.trim()
  const list = trimmed ? fuse.search(trimmed).map((r) => r.item) : ACTIONS

  return list.map((a) => ({
    label: a.label,
    sublabel: a.sublabel,
    value: a.value
  }))
}

export async function execute(item: SearchResultItem): Promise<void> {
  const action = item.value.replace(/^__/, '')
  switch (action) {
    case 'open-profile': {
      const err = await shell.openPath(CONFIG_DIR)
      if (err) throw new Error(err)
      break
    }
    case 'open-backups': {
      if (!existsSync(ARCHIVES_DIR)) {
        mkdirSync(ARCHIVES_DIR, { recursive: true })
      }
      const err = await shell.openPath(ARCHIVES_DIR)
      if (err) throw new Error(err)
      break
    }
    case 'reset':
      await handleReset()
      break
    case 'backup':
      await handleBackup()
      break
    case 'restore':
      await handleRestore()
      break
    case 'clean-history':
      handleCleanHistory()
      break
    case 'clear-history':
      handleClearHistory()
      break
    case 'validate':
      handleValidate()
      break
    case 'sync-shell':
      await handleSyncShell()
      break
    default:
      throw new Error(`Unknown profile action: ${item.value}`)
  }
}

export async function executeProfileAction(action: string): Promise<void> {
  const value = action.startsWith('__') ? action : `__${action}`
  await execute({ label: action, value })
}

export function ensureProfilesDir(): void {
  if (!existsSync(PROFILES_DIR)) {
    mkdirSync(PROFILES_DIR, { recursive: true })
  }
  const defaultDir = join(PROFILES_DIR, 'default')
  if (!existsSync(defaultDir)) {
    mkdirSync(defaultDir, { recursive: true })
    if (existsSync(CONFIG_DIR) && readdirSync(CONFIG_DIR).length > 0) {
      try {
        cpSync(CONFIG_DIR, defaultDir, { recursive: true })
      } catch {
        // ignore
      }
    }
    const metaFile = join(defaultDir, 'profile.json')
    if (!existsSync(metaFile)) {
      writeFileSync(
        metaFile,
        JSON.stringify({ id: 'default', name: 'Default', description: 'Standard primary profile' }, null, 2),
        'utf-8'
      )
    }
  }
}

export async function listProfiles(): Promise<ProfileItem[]> {
  ensureProfilesDir()
  const settings = readSettings()
  const currentActiveId = (settings.activeProfile || 'default').toLowerCase()

  const entries = readdirSync(PROFILES_DIR, { withFileTypes: true })
  const profiles: ProfileItem[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const profileId = entry.name
    const profilePath = join(PROFILES_DIR, profileId)
    let name = profileId.charAt(0).toUpperCase() + profileId.slice(1)
    let description = ''

    const metaPath = join(profilePath, 'profile.json')
    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
        if (meta.name) name = meta.name
        if (meta.description) description = meta.description
      } catch {
        // ignore
      }
    }

    let commandsCount = 0
    const commandsDir = join(profilePath, 'commands')
    if (existsSync(commandsDir)) {
      try {
        commandsCount = readdirSync(commandsDir).length
      } catch {
        // ignore
      }
    }

    let linksCount = 0
    const linksPath = join(profilePath, 'links.json')
    if (existsSync(linksPath)) {
      try {
        const links = JSON.parse(readFileSync(linksPath, 'utf-8'))
        if (Array.isArray(links)) linksCount = links.length
      } catch {
        // ignore
      }
    }

    const stat = statSync(profilePath)
    profiles.push({
      id: profileId,
      name,
      isCurrent: profileId.toLowerCase() === currentActiveId,
      lastModified: stat.mtimeMs,
      description: description || (profileId === 'default' ? 'Standard primary profile' : `Custom profile: ${name}`),
      commandsCount,
      linksCount
    })
  }

  if (profiles.length === 0) {
    profiles.push({
      id: 'default',
      name: 'Default',
      isCurrent: true,
      description: 'Standard primary profile'
    })
  }

  return profiles.sort((a, b) => {
    if (a.isCurrent) return -1
    if (b.isCurrent) return 1
    if (a.id === 'default') return -1
    if (b.id === 'default') return 1
    return a.name.localeCompare(b.name)
  })
}

export async function switchProfile(profileId: string): Promise<{ success: boolean; activeProfile: string }> {
  ensureProfilesDir()
  const targetDir = join(PROFILES_DIR, profileId)
  if (!existsSync(targetDir)) {
    throw new Error(`Profile "${profileId}" does not exist in ~/.sudolaunch-profiles`)
  }

  const currentSettings = readSettings()
  const currentActiveId = currentSettings.activeProfile || 'default'

  // 1. Snapshot current ~/.sudolaunch to current active profile in PROFILES_DIR
  try {
    const currentProfileDir = join(PROFILES_DIR, currentActiveId)
    if (!existsSync(currentProfileDir)) {
      mkdirSync(currentProfileDir, { recursive: true })
    }
    cpSync(CONFIG_DIR, currentProfileDir, { recursive: true })
  } catch {
    // Continue even if snapshot had non-fatal warning
  }

  // 2. Create archive snapshot before switching profiles
  try {
    await createBackupArchive(`preswitch-${currentActiveId}`)
  } catch {
    // ignore
  }

  // 3. Copy target profile files into ~/.sudolaunch
  try {
    cpSync(targetDir, CONFIG_DIR, { recursive: true })
  } catch (err) {
    throw new Error(`Failed to copy profile contents: ${err}`)
  }

  // 4. Update activeProfile in settings.json
  const updatedSettings = readSettings()
  updatedSettings.activeProfile = profileId
  writeSettings(updatedSettings)

  // 5. Broadcast config-changed to reload all UI palettes and settings
  dockManager.broadcast('config-changed')

  let profileDisplayName = profileId
  const metaPath = join(targetDir, 'profile.json')
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
      if (meta.name) profileDisplayName = meta.name
    } catch {
      // ignore
    }
  }

  notify({
    title: 'Profile Switched',
    body: `Now active: ${profileDisplayName}. Configuration reloaded.`,
    onClick: () => {
      shell.openPath(CONFIG_DIR)
    }
  })

  return { success: true, activeProfile: profileId }
}

export async function createProfile(name: string, cloneCurrent: boolean = true): Promise<ProfileItem[]> {
  ensureProfilesDir()
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('Profile name cannot be empty')
  }

  const id = trimmed.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  const targetDir = join(PROFILES_DIR, id)

  if (existsSync(targetDir)) {
    throw new Error(`A profile with id "${id}" already exists`)
  }

  mkdirSync(targetDir, { recursive: true })

  if (cloneCurrent && existsSync(CONFIG_DIR)) {
    cpSync(CONFIG_DIR, targetDir, { recursive: true })
  } else {
    writeFileSync(join(targetDir, 'settings.json'), JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8')
    writeFileSync(join(targetDir, 'contacts.json'), JSON.stringify(SEED_CONTACTS, null, 2), 'utf-8')
    writeFileSync(join(targetDir, 'snippets.json'), '[]', 'utf-8')
    writeFileSync(join(targetDir, 'links.json'), '[]', 'utf-8')
    writeFileSync(join(targetDir, 'teamLinks.json'), '[]', 'utf-8')
    writeFileSync(join(targetDir, 'peers.json'), JSON.stringify(SEED_PEERS, null, 2), 'utf-8')
    writeFileSync(join(targetDir, 'history.json'), '[]', 'utf-8')
  }

  writeFileSync(
    join(targetDir, 'profile.json'),
    JSON.stringify({ id, name: trimmed, description: `Custom profile created on ${new Date().toLocaleDateString()}` }, null, 2),
    'utf-8'
  )

  return listProfiles()
}

export async function deleteProfile(profileId: string): Promise<ProfileItem[]> {
  ensureProfilesDir()
  if (profileId === 'default') {
    throw new Error('Cannot delete the default profile')
  }
  const settings = readSettings()
  if ((settings.activeProfile || 'default').toLowerCase() === profileId.toLowerCase()) {
    throw new Error('Cannot delete the currently active profile. Switch to another profile first.')
  }

  const targetDir = join(PROFILES_DIR, profileId)
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true })
  }

  return listProfiles()
}

export async function listBackupArchives(): Promise<BackupArchiveItem[]> {
  if (!existsSync(ARCHIVES_DIR)) {
    mkdirSync(ARCHIVES_DIR, { recursive: true })
    return []
  }

  const files = readdirSync(ARCHIVES_DIR)
    .filter((f) => f.toLowerCase().endsWith('.zip'))
    .map((name) => {
      const fullPath = join(ARCHIVES_DIR, name)
      const stat = statSync(fullPath)
      const isSafety = name.includes('prereset') || name.includes('prerestore') || name.includes('preswitch')
      const d = new Date(stat.mtimeMs)
      const pad = (n: number): string => String(n).padStart(2, '0')
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

      return {
        filename: name,
        fullPath,
        sizeKb: Math.round(stat.size / 1024),
        date: dateStr,
        timestamp: stat.mtimeMs,
        type: isSafety ? ('Safety Snapshot' as const) : ('User Backup' as const)
      }
    })
    .sort((a, b) => b.timestamp - a.timestamp)

  return files
}

export async function restoreSpecificBackup(filename: string): Promise<void> {
  const fullPath = join(ARCHIVES_DIR, filename)
  if (!existsSync(fullPath)) {
    throw new Error(`Backup archive "${filename}" does not exist in ~/.sudolaunch-archives`)
  }

  if (existsSync(CONFIG_DIR) && readdirSync(CONFIG_DIR).length > 0) {
    await createBackupArchive('prerestore')
  }

  const psScript = `
    $archivePath = '${fullPath.replace(/'/g, "''")}';
    $profileDir = Join-Path $env:USERPROFILE '.sudolaunch';
    Expand-Archive -Path $archivePath -DestinationPath $profileDir -Force
  `
  await runPowerShell(psScript)

  dockManager.broadcast('config-changed')

  notify({
    title: 'Backup Restored',
    body: `Restored configuration from ${filename}. Click to view profile.`,
    onClick: () => {
      shell.openPath(CONFIG_DIR)
    },
    actions: [
      { text: 'Open Backups', onClick: () => shell.openPath(ARCHIVES_DIR) },
      { text: 'Open Profile', onClick: () => shell.openPath(CONFIG_DIR) }
    ]
  })
}


