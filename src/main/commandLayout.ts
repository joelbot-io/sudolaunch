import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { watch as chokidarWatch } from 'chokidar'
import { CONFIG_DIR } from './config'
import {
  COMMANDS,
  DEFAULT_COMMAND_LAYOUT,
  type CommandLayout,
  type CommandFolder
} from '../shared/types'
import { loadCustomCommands } from './customCommands'

export const COMMAND_LAYOUT_PATH = join(CONFIG_DIR, 'command-layout.json')

export function ensureCommandLayout(): void {
  if (!existsSync(COMMAND_LAYOUT_PATH)) {
    writeFileSync(COMMAND_LAYOUT_PATH, JSON.stringify(DEFAULT_COMMAND_LAYOUT, null, 2), 'utf-8')
  }
}

export function readCommandLayout(): CommandLayout {
  let layout: CommandLayout
  try {
    if (!existsSync(COMMAND_LAYOUT_PATH)) {
      ensureCommandLayout()
    }
    const raw = readFileSync(COMMAND_LAYOUT_PATH, 'utf-8').replace(/^\uFEFF/, '')
    layout = JSON.parse(raw) as CommandLayout
  } catch {
    layout = JSON.parse(JSON.stringify(DEFAULT_COMMAND_LAYOUT))
  }

  if (!layout || !Array.isArray(layout.rootOrder) || !Array.isArray(layout.folders)) {
    layout = JSON.parse(JSON.stringify(DEFAULT_COMMAND_LAYOUT))
  }

  // Sanitize folders
  const sanitizedFolders: CommandFolder[] = []
  const assignedCommands = new Set<string>()

  for (const f of layout.folders) {
    if (f && typeof f.id === 'string' && typeof f.name === 'string' && Array.isArray(f.commands)) {
      const cmds = f.commands.filter((c) => typeof c === 'string' && c.trim())
      cmds.forEach((c) => assignedCommands.add(c))
      sanitizedFolders.push({
        id: f.id,
        name: f.name,
        icon: typeof f.icon === 'string' ? f.icon : '📁',
        description: typeof f.description === 'string' ? f.description : undefined,
        commands: cmds
      })
    }
  }

  // Sanitize rootOrder
  const validFolderIds = new Set(sanitizedFolders.map((f) => f.id))
  const sanitizedRootOrder: string[] = []
  const seenRoot = new Set<string>()

  for (const item of layout.rootOrder) {
    if (typeof item === 'string' && item.trim() && !seenRoot.has(item)) {
      if (validFolderIds.has(item) || !assignedCommands.has(item)) {
        sanitizedRootOrder.push(item)
        seenRoot.add(item)
      }
    }
  }

  // Ensure all existing folders are in rootOrder
  for (const f of sanitizedFolders) {
    if (!seenRoot.has(f.id)) {
      sanitizedRootOrder.push(f.id)
      seenRoot.add(f.id)
    }
  }

  // Reconcile with all available commands: built-ins and custom commands
  const allKnownCmds = new Set<string>([
    ...COMMANDS.map((c) => c.name),
    ...loadCustomCommands().map((c) => c.command)
  ])

  for (const cmd of allKnownCmds) {
    if (!assignedCommands.has(cmd) && !seenRoot.has(cmd)) {
      sanitizedRootOrder.push(cmd)
      seenRoot.add(cmd)
    }
  }

  return {
    rootOrder: sanitizedRootOrder,
    folders: sanitizedFolders
  }
}

export function writeCommandLayout(layout: CommandLayout): void {
  writeFileSync(COMMAND_LAYOUT_PATH, JSON.stringify(layout, null, 2), 'utf-8')
}

export function watchCommandLayout(onChange: (layout: CommandLayout) => void): void {
  chokidarWatch(COMMAND_LAYOUT_PATH, {
    persistent: false,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }
  })
    .on('change', () => onChange(readCommandLayout()))
    .on('add', () => onChange(readCommandLayout()))
}
