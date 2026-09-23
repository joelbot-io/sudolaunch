import { contextBridge, ipcRenderer } from 'electron'
import type {
  CommandName,
  SearchResultItem,
  ConfigType,
  ConfigEntry,
  AppEntry,
  CustomCommand,
  Hotkeys,
  GrowOrigin,
  CommandLayout,
  SudoNotification,
  Settings,
  FocusTimerState,
  GitRepoStatus,
  KnownRepoItem,
  ProfileItem,
  BackupArchiveItem
} from '../shared/types'

const api = {
  search: (command: CommandName, query: string): Promise<SearchResultItem[]> =>
    ipcRenderer.invoke('search', command, query),
  runCalc: (expression: string): Promise<string | null> => ipcRenderer.invoke('run-calc', expression),
  // Resolves to an error message on failure, or null on success — see main/index.ts's
  // 'execute-command' handler.
  executeCommand: (command: CommandName, item: SearchResultItem, query: string, elevated?: boolean): Promise<string | null> =>
    ipcRenderer.invoke('execute-command', command, item, query, elevated),
  getHistory: () => ipcRenderer.invoke('get-history'),
  deleteHistoryEntry: (timestamp: string) => ipcRenderer.invoke('delete-history-entry', timestamp),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  showDockContextMenu: (): void => ipcRenderer.send('show-dock-context-menu'),
  getHotkeys: (): Promise<Hotkeys> => ipcRenderer.invoke('get-hotkeys'),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('get-settings'),
  hidePalette: (): void => ipcRenderer.send('hide-palette'),
  reportRendererError: (message: string): void => ipcRenderer.send('renderer-error', message),
  notifyPaletteReady: (): void => ipcRenderer.send('palette-ready'),
  notifyReady: (): void => ipcRenderer.send('notify-ready'),
  // Bar-mode only: pulls the persistent bar down from its docked idle strip to full
  // palette size/position, or returns it back — see main/index.ts's setBarBounds.
  barActivate: (mode?: string): void => ipcRenderer.send('bar-activate', mode),
  setPaletteModule: (mode?: string | null): void => ipcRenderer.send('palette-set-module', mode ?? 'bar'),
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
  onPaletteShown: (callback: (mode?: string, growOrigin?: GrowOrigin | null) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, mode?: string, growOrigin?: GrowOrigin | null): void =>
      callback(mode, growOrigin)
    ipcRenderer.on('palette-shown', listener)
    return () => ipcRenderer.removeListener('palette-shown', listener)
  },
  onPaletteFocused: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('palette-focused', listener)
    return () => ipcRenderer.removeListener('palette-focused', listener)
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
  // Sent once the shelf palette window's opacity has actually been dropped to 0 — see
  // closePaletteWindow in main/index.ts. Lets the renderer reset its state invisibly
  // instead of racing the native window blur event, which fires before opacity changes.
  onPaletteHidden: (callback: () => void): (() => void) => {
    ipcRenderer.on('palette-hidden', callback)
    return () => ipcRenderer.removeListener('palette-hidden', callback)
  },
  // Shelf mode's equivalent of onBarCollapsing — sent from closePaletteWindow in
  // main/index.ts so Focus/Git/Profile/Settings/Search shrink back into their shelf icon
  // on close, same as the notification and terminal windows. The open side of this
  // (growing out of the icon) rides along on palette-shown's growOrigin argument instead.
  onPaletteCollapsing: (callback: (origin: GrowOrigin) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, origin: GrowOrigin): void => callback(origin)
    ipcRenderer.on('palette-collapsing', listener)
    return () => ipcRenderer.removeListener('palette-collapsing', listener)
  },
  onBarCollapsing: (callback: (origin: GrowOrigin) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, origin: GrowOrigin): void => callback(origin)
    ipcRenderer.on('bar-collapsing', listener)
    return () => ipcRenderer.removeListener('bar-collapsing', listener)
  },
  onShelfPaletteActive: (callback: (active: boolean, mode?: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, active: boolean, mode?: string): void =>
      callback(active, mode)
    ipcRenderer.on('shelf-palette-active', listener)
    return () => ipcRenderer.removeListener('shelf-palette-active', listener)
  },
  onDockSummoned: (
    callback: (pos: { x: number; y: number; color?: string; glow?: string }) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      pos: { x: number; y: number; color?: string; glow?: string }
    ): void => callback(pos)
    ipcRenderer.on('dock-summoned', listener)
    return () => ipcRenderer.removeListener('dock-summoned', listener)
  },
  onDockFade: (callback: (direction: 'in' | 'out') => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, direction: 'in' | 'out'): void =>
      callback(direction)
    ipcRenderer.on('dock-fade', listener)
    return () => ipcRenderer.removeListener('dock-fade', listener)
  },
  onDockHomeState: (callback: (isHome: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, isHome: boolean): void => callback(isHome)
    ipcRenderer.on('dock-home-state', listener)
    return () => ipcRenderer.removeListener('dock-home-state', listener)
  },
  getDockIsHome: (): Promise<boolean> => ipcRenderer.invoke('dock-get-is-home'),
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
  getCommandLayout: (): Promise<CommandLayout> => ipcRenderer.invoke('get-command-layout'),
  saveCommandLayout: (layout: CommandLayout): Promise<void> => ipcRenderer.invoke('save-command-layout', layout),
  openCommandLayoutFile: (): void => ipcRenderer.send('open-command-layout-file'),
  onCommandLayoutChanged: (callback: () => void): (() => void) => {
    ipcRenderer.on('command-layout-changed', callback)
    return () => ipcRenderer.removeListener('command-layout-changed', callback)
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
  },
  onTermUnreadActivity: (callback: (hasUnread: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, hasUnread: boolean): void => callback(hasUnread)
    ipcRenderer.on('term-unread-activity', listener)
    return () => ipcRenderer.removeListener('term-unread-activity', listener)
  },
  // Notification panel methods and events
  notifyToggle: (): void => ipcRenderer.send('notify-toggle'),
  notifyOpen: (): void => ipcRenderer.send('notify-open'),
  getNotifications: (): Promise<SudoNotification[]> => ipcRenderer.invoke('notify-get-all'),
  clearNotifications: (): Promise<void> => ipcRenderer.invoke('notify-clear-all'),
  dismissNotification: (id: string): Promise<void> => ipcRenderer.invoke('notify-dismiss', id),
  markNotificationsRead: (): Promise<void> => ipcRenderer.invoke('notify-mark-read'),
  onNotificationsUpdated: (callback: (notifications: SudoNotification[]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, items: SudoNotification[]): void => callback(items)
    ipcRenderer.on('notifications-updated', listener)
    return () => ipcRenderer.removeListener('notifications-updated', listener)
  },
  onNotifyExpanded: (callback: (expanded: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, expanded: boolean): void => callback(expanded)
    ipcRenderer.on('notify-expanded', listener)
    return () => ipcRenderer.removeListener('notify-expanded', listener)
  },
  onNotifyGrowOrigin: (callback: (origin: GrowOrigin) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, origin: GrowOrigin): void => callback(origin)
    ipcRenderer.on('notify-grow-origin', listener)
    return () => ipcRenderer.removeListener('notify-grow-origin', listener)
  },
  onNotifyCollapsing: (callback: (origin: GrowOrigin) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, origin: GrowOrigin): void => callback(origin)
    ipcRenderer.on('notify-collapsing', listener)
    return () => ipcRenderer.removeListener('notify-collapsing', listener)
  },

  // Focus timer APIs
  getFocusTimerState: (): Promise<FocusTimerState> => ipcRenderer.invoke('focus-timer-get'),
  startFocusTimer: (mins?: number): Promise<FocusTimerState> => ipcRenderer.invoke('focus-timer-start', mins),
  pauseFocusTimer: (): Promise<FocusTimerState> => ipcRenderer.invoke('focus-timer-pause'),
  resetFocusTimer: (mins?: number): Promise<FocusTimerState> => ipcRenderer.invoke('focus-timer-reset', mins),
  onFocusTimerTick: (callback: (state: FocusTimerState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: FocusTimerState): void => callback(state)
    ipcRenderer.on('focus-timer-tick', listener)
    return () => ipcRenderer.removeListener('focus-timer-tick', listener)
  },
  onFocusTimerComplete: (callback: (sessionCount: number) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, count: number): void => callback(count)
    ipcRenderer.on('focus-timer-complete', listener)
    return () => ipcRenderer.removeListener('focus-timer-complete', listener)
  },

  // Git status APIs
  getGitRepoStatus: (): Promise<GitRepoStatus> => ipcRenderer.invoke('git-status-get'),
  getGitBranches: (): Promise<string[]> => ipcRenderer.invoke('git-branches-get'),
  checkoutGitBranch: (branch: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('git-checkout-branch', branch),
  selectGitRepoFolder: (): Promise<GitRepoStatus | null> => ipcRenderer.invoke('git-select-repo-folder'),
  setActiveGitRepo: (repoPath: string): Promise<GitRepoStatus> =>
    ipcRenderer.invoke('git-set-active-repo', repoPath),
  getKnownGitRepos: (): Promise<KnownRepoItem[]> => ipcRenderer.invoke('git-get-known-repos'),

  // Profile APIs
  executeProfileCommand: (action: string): Promise<void> => ipcRenderer.invoke('profile-execute', action),
  listProfiles: (): Promise<ProfileItem[]> => ipcRenderer.invoke('profile-list'),
  switchProfile: (id: string): Promise<{ success: boolean; activeProfile: string }> =>
    ipcRenderer.invoke('profile-switch', id),
  createProfile: (name: string, cloneCurrent?: boolean): Promise<ProfileItem[]> =>
    ipcRenderer.invoke('profile-create', name, cloneCurrent),
  deleteProfile: (id: string): Promise<ProfileItem[]> => ipcRenderer.invoke('profile-delete', id),
  listBackupArchives: (): Promise<BackupArchiveItem[]> => ipcRenderer.invoke('profile-archives-list'),
  restoreSpecificBackup: (filename: string): Promise<void> =>
    ipcRenderer.invoke('profile-archive-restore', filename)
}

contextBridge.exposeInMainWorld('api', api)
