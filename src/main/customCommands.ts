import { spawn } from 'child_process'
import { Notification } from 'electron'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { watch as chokidarWatch } from 'chokidar'
import { CONFIG_DIR } from './config'
import { getAppIconPath } from './icon'
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

export function loadCustomCommands(): CustomCommand[] {
  let files: string[] = []
  try {
    files = readdirSync(COMMANDS_DIR).filter((f) => f.toLowerCase().endsWith('.json'))
  } catch {
    return []
  }

  const out: CustomCommand[] = []
  for (const file of files) {
    try {
      const content = readFileSync(join(COMMANDS_DIR, file), 'utf-8').replace(/^\uFEFF/, '')
      const raw = JSON.parse(content)
      const hasAction = typeof raw.Action === 'string' && raw.Action.trim()
      const hasFolder = typeof raw.Folder === 'string' && raw.Folder.trim()
      if (typeof raw.Command !== 'string' || hasAction === hasFolder) {
        console.warn(`Skipping invalid custom command file (needs exactly one of Action/Folder): ${file}`)
        continue
      }
      const command = raw.Command.trim().replace(/^\/+/, '')
      if (!command) {
        console.warn(`Skipping custom command file with empty command name: ${file}`)
        continue
      }
      out.push({
        command,
        action: hasAction ? raw.Action : undefined,
        folder: hasFolder ? raw.Folder : undefined,
        label: typeof raw.Label === 'string' ? raw.Label : undefined,
        parameters: normalizeParams(raw.Parameters)
      })
    } catch (err) {
      console.warn(`Failed to parse custom command file ${file}:`, err)
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

function notify(cmd: CustomCommand, success: boolean, detail?: string): void {
  new Notification({
    title: `${cmd.label ?? cmd.command} ${success ? 'succeeded' : 'failed'}`,
    body: detail ?? (success ? 'Completed successfully' : 'Command failed'),
    icon: getAppIconPath()
  }).show()
}

export function runAndNotify(cmd: CustomCommand, action: string): void {
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', action], {
    windowsHide: true
  })
  child.on('error', (err) => notify(cmd, false, err.message))
  child.on('exit', (code) => notify(cmd, code === 0, code === 0 ? undefined : `Exited with code ${code}`))
}

export function notifyMissingParams(cmd: CustomCommand, missing: string[]): void {
  notify(cmd, false, `Missing required parameter${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`)
}
