import { contextBridge, ipcRenderer } from 'electron'
import type {
  CommandName,
  SearchResultItem,
  ConfigType,
  ConfigEntry,
  AppEntry,
  CustomCommand,
  Hotkeys,
  GrowOrigin
} from '../shared/types'

const api = {
  search: (command: CommandName, query: string): Promise<SearchResultItem[]> =>
    ipcRenderer.invoke('search', command, query),
  runCalc: (expression: string): Promise<string | null> => ipcRenderer.invoke('run-calc', expression),
  // Resolves to an error message on failure, or null on success — see main/index.ts's
  // 'execute-command' handler.
  executeCommand: (command: CommandName, item: SearchResultItem, query: string): Promise<string | null> =>
    ipcRenderer.invoke('execute-command', command, item, query),
  getHistory: () => ipcRenderer.invoke('get-history'),
  getHotkeys: (): Promise<Hotkeys> => ipcRenderer.invoke('get-hotkeys'),
  hidePalette: (): void => ipcRenderer.send('hide-palette'),
  // Bar-mode only: pulls the persistent bar down from its docked idle strip to full
  // palette size/position, or returns it back — see main/index.ts's setBarBounds.
  barActivate: (): void => ipcRenderer.send('bar-activate'),
  barDeactivate: (): void => ipcRenderer.send('bar-deactivate'),
  // Bar-mode only: exits "/move" mode (see main/barWindow.ts's toggleMoveMode) from the
  // renderer's grab-handle click or Escape, persisting wherever it was dropped.
  moveModeToggle: (): void => ipcRenderer.send('move-mode-toggle'),
  onMoveModeChanged: (callback: (active: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, active: boolean): void => callback(active)
    ipcRenderer.on('move-mode-changed', listener)
    return () => ipcRenderer.removeListener('move-mode-changed', listener)
  },
  openConfigFolder: (): void => ipcRenderer.send('open-config-folder'),
  // Each of these returns an unsubscribe function — callers must invoke it (e.g. from a
  // React effect's cleanup) or every remount piles on another ipcRenderer listener
  // (surfaces as an EventEmitter "MaxListenersExceededWarning" after enough of them).
  onPaletteShown: (callback: () => void): (() => void) => {
    ipcRenderer.on('palette-shown', callback)
    return () => ipcRenderer.removeListener('palette-shown', callback)
  },
  // Carries the geometry the palette should grow from — see activateBar in barWindow.ts.
  onBarActivated: (callback: (origin: GrowOrigin) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, origin: GrowOrigin): void => callback(origin)
    ipcRenderer.on('bar-activated', listener)
    return () => ipcRenderer.removeListener('bar-activated', listener)
  },
  onBarCollapsed: (callback: () => void): (() => void) => {
    ipcRenderer.on('bar-collapsed', callback)
    return () => ipcRenderer.removeListener('bar-collapsed', callback)
  },
  onBarCollapsing: (callback: (origin: GrowOrigin) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, origin: GrowOrigin): void => callback(origin)
    ipcRenderer.on('bar-collapsing', listener)
    return () => ipcRenderer.removeListener('bar-collapsing', listener)
  },
  onConfigChanged: (callback: () => void): (() => void) => {
    ipcRenderer.on('config-changed', callback)
    return () => ipcRenderer.removeListener('config-changed', callback)
  },
  onHotkeyError: (callback: (hotkey: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, hotkey: string): void => callback(hotkey)
    ipcRenderer.on('hotkey-error', listener)
    return () => ipcRenderer.removeListener('hotkey-error', listener)
  },
  onTerminalHotkeyError: (callback: (hotkey: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, hotkey: string): void => callback(hotkey)
    ipcRenderer.on('terminal-hotkey-error', listener)
    return () => ipcRenderer.removeListener('terminal-hotkey-error', listener)
  },
  listCustomCommands: (): Promise<CustomCommand[]> => ipcRenderer.invoke('list-custom-commands'),
  onCustomCommandsChanged: (callback: () => void): (() => void) => {
    ipcRenderer.on('custom-commands-changed', callback)
    return () => ipcRenderer.removeListener('custom-commands-changed', callback)
  },
  getConfigEntries: (type: ConfigType): Promise<ConfigEntry[]> => ipcRenderer.invoke('config-get-entries', type),
  saveConfigEntry: (type: ConfigType, entry: ConfigEntry, index: number | null): Promise<void> =>
    ipcRenderer.invoke('config-save-entry', type, entry, index),
  deleteConfigEntry: (type: ConfigType, index: number): Promise<void> =>
    ipcRenderer.invoke('config-delete-entry', type, index),
  listApps: (): Promise<AppEntry[]> => ipcRenderer.invoke('list-apps'),
  // Term-mode only: bridges the renderer's xterm.js instance to the pty session owned by
  // main/terminal.ts — see main/terminalWindow.ts.
  termToggle: (): void => ipcRenderer.send('term-toggle'),
  termMoveModeToggle: (): void => ipcRenderer.send('term-move-mode-toggle'),
  onTermMoveModeChanged: (callback: (active: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, active: boolean): void => callback(active)
    ipcRenderer.on('term-move-mode-changed', listener)
    return () => ipcRenderer.removeListener('term-move-mode-changed', listener)
  },
  termInput: (data: string): void => ipcRenderer.send('term-input', data),
  termResize: (cols: number, rows: number): void => ipcRenderer.send('term-resize', cols, rows),
  onTermData: (callback: (data: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: string): void => callback(data)
    ipcRenderer.on('term-data', listener)
    return () => ipcRenderer.removeListener('term-data', listener)
  },
  onTermExpanded: (callback: (expanded: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, expanded: boolean): void => callback(expanded)
    ipcRenderer.on('term-expanded', listener)
    return () => ipcRenderer.removeListener('term-expanded', listener)
  },
  // Fires when the shell backing the panel exits (see terminal.ts's onExit) and again when
  // a fresh one is spawned — drives the icon's "session ended" state.
  onTermExited: (callback: () => void): (() => void) => {
    ipcRenderer.on('term-exited', callback)
    return () => ipcRenderer.removeListener('term-exited', callback)
  },
  // Geometry for the panel's grow-from-the-icon animation — see toggleTerminal.
  onTermGrowOrigin: (callback: (origin: GrowOrigin) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, origin: GrowOrigin): void => callback(origin)
    ipcRenderer.on('term-grow-origin', listener)
    return () => ipcRenderer.removeListener('term-grow-origin', listener)
  },
  onTermCollapsing: (callback: (origin: GrowOrigin) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, origin: GrowOrigin): void => callback(origin)
    ipcRenderer.on('term-collapsing', listener)
    return () => ipcRenderer.removeListener('term-collapsing', listener)
  },
  onTermRespawned: (callback: () => void): (() => void) => {
    ipcRenderer.on('term-respawned', callback)
    return () => ipcRenderer.removeListener('term-respawned', callback)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type PreloadApi = typeof api
