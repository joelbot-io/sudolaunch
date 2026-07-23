import { contextBridge, ipcRenderer } from 'electron'
import type { CommandName, SearchResultItem, ConfigType, ConfigEntry, AppEntry } from '../shared/types'

const api = {
  search: (command: CommandName, query: string): Promise<SearchResultItem[]> =>
    ipcRenderer.invoke('search', command, query),
  runCalc: (expression: string): Promise<string | null> => ipcRenderer.invoke('run-calc', expression),
  executeCommand: (command: CommandName, item: SearchResultItem, query: string): Promise<void> =>
    ipcRenderer.invoke('execute-command', command, item, query),
  getHistory: () => ipcRenderer.invoke('get-history'),
  hidePalette: (): void => ipcRenderer.send('hide-palette'),
  openConfigFolder: (): void => ipcRenderer.send('open-config-folder'),
  onPaletteShown: (callback: () => void): void => {
    ipcRenderer.on('palette-shown', callback)
  },
  onConfigChanged: (callback: () => void): void => {
    ipcRenderer.on('config-changed', callback)
  },
  onHotkeyError: (callback: (hotkey: string) => void): void => {
    ipcRenderer.on('hotkey-error', (_event, hotkey: string) => callback(hotkey))
  },
  getConfigEntries: (type: ConfigType): Promise<ConfigEntry[]> => ipcRenderer.invoke('config-get-entries', type),
  saveConfigEntry: (type: ConfigType, entry: ConfigEntry, index: number | null): Promise<void> =>
    ipcRenderer.invoke('config-save-entry', type, entry, index),
  deleteConfigEntry: (type: ConfigType, index: number): Promise<void> =>
    ipcRenderer.invoke('config-delete-entry', type, index),
  listApps: (): Promise<AppEntry[]> => ipcRenderer.invoke('list-apps')
}

contextBridge.exposeInMainWorld('api', api)

export type PreloadApi = typeof api
