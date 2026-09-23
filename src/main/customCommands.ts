import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { watch as chokidarWatch } from 'chokidar'
import { CONFIG_DIR } from './config'
import { addNotification } from './notifications'
import { runInTerminal, openTerminal } from './terminalWindow'
import { runElevated } from './elevation'
import type { CustomCommand, CustomCommandParam } from '../shared/types'

export const COMMANDS_DIR = join(CONFIG_DIR, 'commands')

const EXAMPLE_COMMAND = {
  Command: '/example',
  Action: "Invoke-WebRequest 'https://www.google.com'"
}

// Demonstrates the other custom-command shape: "Folder" instead of "Action" turns /maint
// into a browser over a folder of .ps1/.py scripts (drill in, pick one, run it) — given as
// a path relative to ~/.sudolaunch (every folder-based feature defaults under
// ~/.sudolaunch/<feature-name>; see resolveFolderRoot in folderBrowse.ts). Adding another one
// is just another JSON file; no code changes needed.
const EXAMPLE_FOLDER_COMMAND = {
  Command: '/maint',
  Label: 'Maintenance',
  Folder: 'maintenance'
}

const EXAMPLE_MAINTENANCE_SCRIPT = `# Example maintenance task - update PowerShell modules used by other custom commands.
Get-Module -ListAvailable | ForEach-Object { Update-Module -Name $_.Name -Force -ErrorAction SilentlyContinue }
`

export function ensureCommandsDir(): void {
  if (!existsSync(COMMANDS_DIR)) {
    mkdirSync(COMMANDS_DIR, { recursive: true })
    writeFileSync(join(COMMANDS_DIR, 'example.json'), JSON.stringify(EXAMPLE_COMMAND, null, 2), 'utf-8')
    writeFileSync(join(COMMANDS_DIR, 'maint.json'), JSON.stringify(EXAMPLE_FOLDER_COMMAND, null, 2), 'utf-8')
  }
  const maintenanceDir = join(CONFIG_DIR, 'maintenance')
  if (!existsSync(maintenanceDir)) {
    mkdirSync(maintenanceDir, { recursive: true })
    writeFileSync(join(maintenanceDir, 'example-update-modules.ps1'), EXAMPLE_MAINTENANCE_SCRIPT, 'utf-8')
  }
}

function normalizeParams(raw: unknown): CustomCommandParam[] {
  if (!Array.isArray(raw)) return []
  const out: CustomCommandParam[] = []
  for (const p of raw) {
    if (p && typeof p.Name === 'string' && p.Name.trim()) {
      out.push({ name: p.Name.trim(), description: typeof p.Description === 'string' ? p.Description : undefined })
    }
  }
  return out
}

function findJsonFiles(dir: string): string[] {
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...findJsonFiles(full))
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        files.push(full)
      }
    }
    return files
  } catch {
    return []
  }
}

export function loadCustomCommands(): CustomCommand[] {
  const files = findJsonFiles(COMMANDS_DIR)
  const out: CustomCommand[] = []
  for (const fullPath of files) {
    try {
      const content = readFileSync(fullPath, 'utf-8').replace(/^\uFEFF/, '')
      const raw = JSON.parse(content)
      const hasAction = typeof raw.Action === 'string' && raw.Action.trim()
      const hasFolder = typeof raw.Folder === 'string' && raw.Folder.trim()
      if (typeof raw.Command !== 'string' || hasAction === hasFolder) {
        console.warn(`Skipping invalid custom command file (needs exactly one of Action/Folder): ${fullPath}`)
        continue
      }
      const command = raw.Command.trim().replace(/^\/+/, '')
      if (!command) {
        console.warn(`Skipping custom command file with empty command name: ${fullPath}`)
        continue
      }
      const showTerminal = Boolean(raw.ShowTerminal ?? raw.showTerminal ?? raw.OpenTerminal ?? raw.openTerminal)
      out.push({
        command,
        action: hasAction ? raw.Action : undefined,
        folder: hasFolder ? raw.Folder : undefined,
        label: typeof raw.Label === 'string' ? raw.Label : undefined,
        parameters: normalizeParams(raw.Parameters),
        showTerminal
      })
    } catch (err) {
      console.warn(`Failed to parse custom command file ${fullPath}:`, err)
    }
  }
  return out
}

export function watchCustomCommands(onChange: () => void): void {
  chokidarWatch(COMMANDS_DIR, {
    persistent: false,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }
  })
    .on('add', onChange)
    .on('change', onChange)
    .on('unlink', onChange)
}

function notify(cmd: CustomCommand, success: boolean, detail?: string, commandInput?: string): void {
  const title = `${cmd.label ?? cmd.command} ${success ? 'succeeded' : 'failed'}`
  const body = detail ?? (success ? 'Completed successfully' : 'Command failed')
  addNotification({
    title,
    body,
    type: success ? 'success' : 'error',
    commandName: cmd.command,
    commandInput,
    showNativeToast: true
  })
}

export function notifyMissingParams(cmd: CustomCommand, missing: string[]): void {
  notify(cmd, false, `Missing required parameter${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`, cmd.command)
}

export function executeCustomAction(cmd: CustomCommand, action: string, elevated?: boolean): void {
  if (elevated) {
    runElevated(action, cmd.label ?? cmd.command, cmd.command)
    return
  }

  if (cmd.showTerminal) {
    openTerminal()
  }

  // Default behavior: dispatch to SudoLaunch's built-in terminal (signals unread output glow)
  runInTerminal(action)
  addNotification({
    title: cmd.label ?? cmd.command,
    type: 'info',
    commandName: cmd.command,
    showNativeToast: false
  })
}
