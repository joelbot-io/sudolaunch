import { existsSync, mkdirSync } from 'fs'
import type { SearchResultItem } from '../../shared/types'
import { readSettings } from '../config'
import { browseFolder, resolveFolderRoot, resolveFileWithin } from '../folderBrowse'
import { copyFileToClipboard } from '../clipboardFiles'

const GIF_EXTENSIONS = ['.gif']

// Settings.gifFolder defaults to "gif" (~/.sudolaunch/gif) — create whatever folder is
// currently configured on startup so the command works out of the box, same as the
// "commands"/"maintenance" scaffold folders. Re-reads the setting (rather than hardcoding
// "gif") so changing it in // Settings gets the new folder auto-created too.
export function ensureGifDir(): void {
  const { gifFolder } = readSettings()
  const dir = resolveFolderRoot(gifFolder)
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function search(query: string): SearchResultItem[] {
  const { gifFolder } = readSettings()
  if (!gifFolder) {
    return [{ label: 'Set a GIF folder in // Settings first', value: '', disabled: true }]
  }

  const root = resolveFolderRoot(gifFolder)
  if (!root) {
    return [{ label: 'Folder must be inside ~/.sudolaunch', value: '', disabled: true }]
  }

  return browseFolder(root, query, GIF_EXTENSIONS)
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.disabled || item.isDirectory) return

  const { gifFolder } = readSettings()
  const root = resolveFolderRoot(gifFolder)
  if (!root) {
    throw new Error('Folder must be inside ~/.sudolaunch')
  }

  const absPath = resolveFileWithin(root, item.value)
  if (!absPath) {
    throw new Error('GIF no longer exists or is outside the configured folder')
  }

  copyFileToClipboard(absPath)
}
