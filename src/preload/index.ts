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
  GitProjectPreset,
  GitWatcherConfigInput,
  GitWatcherItem,
  ScheduledJobItem,
  ScheduledJobInput,
  ScheduledJobPreset,
  ProfileItem,
  BackupArchiveItem,
  WingetPackageItem,
  WingetPinItem,
  WingetSearchResult,
  WingetPinOptions,
  WingetActionParams,
  WingetBatchActionParams,
  WingetOperationState,
  WingetPackageDetails,
  WingetSnapshotItem,
  EcosystemUpdateItem,
  DevRuntimeStatus,
  PathEntryHealth,
  SystemServiceItem,
  SystemStartupAppItem,
  SystemPortItem,
  SystemProcessItem,
  CleanupTargetItem,
  WindowsUpdateStatus,
  WindowsUpdateActionType,
  SystemEnvVarItem,
  SystemScheduledTaskItem,
  SystemHostEntryItem,
  SystemNetworkAdapterItem,
  SystemStorageAndPowerOverview,
  SystemSecurityPosture,
  SystemEventLogItem,
  ShortcutOverlayItem,
  ShortcutsOverlayData
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

  // Git Hot-Reload Watchers APIs
  getGitWatchers: (): Promise<GitWatcherItem[]> => ipcRenderer.invoke('git-watchers-get'),
  getGitWatcherPresets: (repoPath?: string): Promise<GitProjectPreset[]> =>
    ipcRenderer.invoke('git-watcher-presets', repoPath),
  saveGitWatcher: (input: GitWatcherConfigInput): Promise<GitWatcherItem[]> =>
    ipcRenderer.invoke('git-watcher-save', input),
  deleteGitWatcher: (id: string): Promise<GitWatcherItem[]> =>
    ipcRenderer.invoke('git-watcher-delete', id),
  startGitWatcher: (id: string): Promise<GitWatcherItem[]> =>
    ipcRenderer.invoke('git-watcher-start', id),
  stopGitWatcher: (id: string): Promise<GitWatcherItem[]> =>
    ipcRenderer.invoke('git-watcher-stop', id),
  stopAllGitWatchers: (): Promise<GitWatcherItem[]> =>
    ipcRenderer.invoke('git-watcher-stop-all'),
  triggerGitWatcherReload: (id: string): Promise<GitWatcherItem[]> =>
    ipcRenderer.invoke('git-watcher-trigger', id),
  clearGitWatcherLogs: (id: string): Promise<GitWatcherItem[]> =>
    ipcRenderer.invoke('git-watcher-clear-logs', id),
  openGitWatcherInTerminal: (id: string): Promise<void> =>
    ipcRenderer.invoke('git-watcher-open-terminal', id),
  selectWatcherProjectFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('git-watcher-select-folder'),
  onGitWatchersUpdated: (callback: (watchers: GitWatcherItem[]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, watchers: GitWatcherItem[]): void =>
      callback(watchers)
    ipcRenderer.on('git-watchers-updated', listener)
    return () => ipcRenderer.removeListener('git-watchers-updated', listener)
  },

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
    ipcRenderer.invoke('profile-archive-restore', filename),

  // WinGet / System Management APIs
  getWingetUpdates: (force?: boolean): Promise<WingetPackageItem[]> =>
    ipcRenderer.invoke('winget-get-updates', force),
  getWingetInstalled: (force?: boolean): Promise<WingetPackageItem[]> =>
    ipcRenderer.invoke('winget-get-installed', force),
  getWingetPins: (force?: boolean): Promise<WingetPinItem[]> =>
    ipcRenderer.invoke('winget-get-pins', force),
  searchWingetCatalog: (query: string): Promise<WingetSearchResult[]> =>
    ipcRenderer.invoke('winget-search', query),
  getWingetPackageDetails: (id: string): Promise<WingetPackageDetails | null> =>
    ipcRenderer.invoke('winget-get-details', id),
  addWingetPin: (
    options: WingetPinOptions
  ): Promise<{ success: boolean; message: string; pins: WingetPinItem[] }> =>
    ipcRenderer.invoke('winget-pin-add', options),
  removeWingetPin: (
    id: string,
    elevated?: boolean
  ): Promise<{ success: boolean; message: string; pins: WingetPinItem[] }> =>
    ipcRenderer.invoke('winget-pin-remove', id, elevated),
  resetWingetPins: (
    elevated?: boolean
  ): Promise<{ success: boolean; message: string; pins: WingetPinItem[] }> =>
    ipcRenderer.invoke('winget-pin-reset', elevated),
  runWingetAction: (
    params: WingetActionParams
  ): Promise<{ started: boolean; mode: 'in-panel' | 'elevated' | 'terminal'; message?: string }> =>
    ipcRenderer.invoke('winget-run-action', params),
  runWingetBatchAction: (
    params: WingetBatchActionParams
  ): Promise<{ started: boolean; message?: string }> =>
    ipcRenderer.invoke('winget-run-batch', params),
  cancelWingetOperation: (): Promise<boolean> => ipcRenderer.invoke('winget-cancel-op'),
  getWingetOperationState: (): Promise<WingetOperationState | null> =>
    ipcRenderer.invoke('winget-get-op-state'),
  listWingetSnapshots: (): Promise<WingetSnapshotItem[]> =>
    ipcRenderer.invoke('winget-list-snapshots'),
  createWingetSnapshot: (
    label?: string
  ): Promise<{ success: boolean; message: string; snapshots: WingetSnapshotItem[] }> =>
    ipcRenderer.invoke('winget-create-snapshot', label),
  restoreWingetSnapshot: (
    filename: string,
    mode: 'pins-only' | 'full-import'
  ): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('winget-restore-snapshot', filename, mode),
  deleteWingetSnapshot: (filename: string): Promise<WingetSnapshotItem[]> =>
    ipcRenderer.invoke('winget-delete-snapshot', filename),
  openWingetSnapshotsFolder: (): Promise<void> =>
    ipcRenderer.invoke('winget-open-snapshots-folder'),
  getEcosystemUpdates: (force?: boolean): Promise<EcosystemUpdateItem[]> =>
    ipcRenderer.invoke('system-get-ecosystem-updates', force),
  runEcosystemUpdate: (params: {
    manager: 'npm' | 'pip' | 'psmodule' | 'wsl'
    id?: string
    all?: boolean
    inTerminal?: boolean
  }): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('system-run-ecosystem-update', params),
  getDevRuntimesStatus: (force?: boolean): Promise<DevRuntimeStatus[]> =>
    ipcRenderer.invoke('system-get-runtimes', force),
  getPathHealth: (): Promise<PathEntryHealth[]> => ipcRenderer.invoke('system-get-path-health'),
  getSystemServices: (force?: boolean): Promise<SystemServiceItem[]> =>
    ipcRenderer.invoke('system-get-services', force),
  togglePinSystemService: (name: string): Promise<SystemServiceItem[]> =>
    ipcRenderer.invoke('system-toggle-pin-service', name),
  runSystemServiceAction: (params: {
    name: string
    action: 'start' | 'stop' | 'restart' | 'auto' | 'manual' | 'disabled'
    elevated?: boolean
  }): Promise<{ success: boolean; message: string; services: SystemServiceItem[] }> =>
    ipcRenderer.invoke('system-run-service-action', params),
  getSystemStartupApps: (): Promise<SystemStartupAppItem[]> =>
    ipcRenderer.invoke('system-get-startup-apps'),
  getSystemPorts: (): Promise<SystemPortItem[]> => ipcRenderer.invoke('system-get-ports'),
  getSystemProcesses: (): Promise<SystemProcessItem[]> =>
    ipcRenderer.invoke('system-get-processes'),
  killSystemProcess: (
    pid: number,
    elevated?: boolean
  ): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('system-kill-process', pid, elevated),
  getCleanupTargets: (): Promise<CleanupTargetItem[]> =>
    ipcRenderer.invoke('system-get-cleanup-targets'),
  cleanSystemTargets: (
    ids: string[]
  ): Promise<{ success: boolean; message: string; targets: CleanupTargetItem[] }> =>
    ipcRenderer.invoke('system-clean-targets', ids),
  getWindowsUpdateStatus: (options?: {
    force?: boolean
    scanPending?: boolean
    online?: boolean
  }): Promise<WindowsUpdateStatus> =>
    ipcRenderer.invoke('system-get-windows-update-status', options),
  runWindowsUpdateAction: (
    action: WindowsUpdateActionType,
    targetKbOrTitle?: string
  ): Promise<{ success: boolean; message: string; status?: WindowsUpdateStatus }> =>
    ipcRenderer.invoke('system-run-windows-update-action', action, targetKbOrTitle),
  getSystemEnvVars: (): Promise<SystemEnvVarItem[]> =>
    ipcRenderer.invoke('system-get-env-vars'),
  setSystemEnvVar: (params: {
    name: string
    value: string
    scope: 'User' | 'Machine'
    elevated?: boolean
  }): Promise<{ success: boolean; message: string; items: SystemEnvVarItem[] }> =>
    ipcRenderer.invoke('system-set-env-var', params),
  deleteSystemEnvVar: (params: {
    name: string
    scope: 'User' | 'Machine'
    elevated?: boolean
  }): Promise<{ success: boolean; message: string; items: SystemEnvVarItem[] }> =>
    ipcRenderer.invoke('system-delete-env-var', params),
  getSystemScheduledTasks: (force?: boolean): Promise<SystemScheduledTaskItem[]> =>
    ipcRenderer.invoke('system-get-scheduled-tasks', force),
  runSystemScheduledTaskAction: (params: {
    taskPath: string
    taskName: string
    action: 'run' | 'enable' | 'disable'
    elevated?: boolean
  }): Promise<{ success: boolean; message: string; tasks: SystemScheduledTaskItem[] }> =>
    ipcRenderer.invoke('system-run-scheduled-task-action', params),
  getSystemHostsEntries: (): Promise<SystemHostEntryItem[]> =>
    ipcRenderer.invoke('system-get-hosts-entries'),
  saveSystemHostEntry: (params: {
    action: 'toggle' | 'add' | 'delete'
    lineIndex?: number
    ip?: string
    hostname?: string
    comment?: string
  }): Promise<{ success: boolean; message: string; entries: SystemHostEntryItem[] }> =>
    ipcRenderer.invoke('system-save-host-entry', params),
  getSystemNetworkAdapters: (): Promise<SystemNetworkAdapterItem[]> =>
    ipcRenderer.invoke('system-get-network-adapters'),
  runSystemNetworkAction: (params: {
    action:
    | 'flush-dns'
    | 'reset-winsock'
    | 'set-dns'
    | 'allow-port-firewall'
    | 'open-hosts-folder'
    adapterName?: string
    dnsPreset?: 'cloudflare' | 'google' | 'quad9' | 'dhcp'
    port?: number
  }): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('system-run-network-action', params),
  getSystemStorageAndPower: (): Promise<SystemStorageAndPowerOverview> =>
    ipcRenderer.invoke('system-get-storage-and-power'),
  runSystemPowerOrRepairAction: (params: {
    action:
    | 'set-power-plan'
    | 'wsl-shutdown'
    | 'sfc-scannow'
    | 'dism-check'
    | 'dism-restore'
    | 'dism-cleanup'
    | 'wsreset'
    | 'battery-report'
    planGuid?: string
  }): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('system-run-power-or-repair-action', params),
  getSystemSecurityPosture: (force?: boolean): Promise<SystemSecurityPosture> =>
    ipcRenderer.invoke('system-get-security-posture', force),
  runSystemSecurityAction: (params: {
    action:
    | 'update-signatures'
    | 'quick-scan'
    | 'open-defender'
    | 'add-exclusion-path'
    | 'remove-exclusion-path'
    targetPath?: string
  }): Promise<{ success: boolean; message: string; posture?: SystemSecurityPosture }> =>
    ipcRenderer.invoke('system-run-security-action', params),
  getSystemEventLogs: (): Promise<SystemEventLogItem[]> =>
    ipcRenderer.invoke('system-get-event-logs'),
  openExternalUrl: (url: string): Promise<void> =>
    ipcRenderer.invoke('system-open-external', url),
  revealPathInExplorer: (targetPath: string): Promise<void> =>
    ipcRenderer.invoke('system-reveal-path', targetPath),
  onWingetOperationProgress: (
    callback: (state: WingetOperationState | null) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: WingetOperationState | null
    ): void => callback(state)
    ipcRenderer.on('winget-operation-progress', listener)
    return () => ipcRenderer.removeListener('winget-operation-progress', listener)
  },
  onWingetUpdatesCount: (callback: (count: number) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, count: number): void => callback(count)
    ipcRenderer.on('winget-updates-count', listener)
    return () => ipcRenderer.removeListener('winget-updates-count', listener)
  },
  shortcutsToggle: (initialTab?: string): void => ipcRenderer.send('shortcuts-toggle', initialTab),
  shortcutsOpen: (initialTab?: string): void => ipcRenderer.send('shortcuts-open', initialTab),
  shortcutsReady: (): void => ipcRenderer.send('shortcuts-ready'),
  getShortcutsOverlayData: (): Promise<ShortcutsOverlayData> =>
    ipcRenderer.invoke('shortcuts-get-data'),
  executeShortcutItem: (
    item: ShortcutOverlayItem,
    elevated?: boolean
  ): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('shortcuts-execute', item, elevated),
  toggleShortcutFavorite: (id: string): Promise<ShortcutsOverlayData> =>
    ipcRenderer.invoke('shortcuts-toggle-favorite', id),
  saveShortcutItem: (item: ShortcutOverlayItem): Promise<ShortcutsOverlayData> =>
    ipcRenderer.invoke('shortcuts-save-item', item),
  deleteShortcutItem: (id: string): Promise<ShortcutsOverlayData> =>
    ipcRenderer.invoke('shortcuts-delete-item', id),
  addShortcutCustomTab: (label: string, icon?: string): Promise<ShortcutsOverlayData> =>
    ipcRenderer.invoke('shortcuts-add-tab', label, icon),
  deleteShortcutCustomTab: (tabId: string): Promise<ShortcutsOverlayData> =>
    ipcRenderer.invoke('shortcuts-delete-tab', tabId),
  restoreDefaultShortcuts: (): Promise<ShortcutsOverlayData> =>
    ipcRenderer.invoke('shortcuts-restore-defaults'),
  runDockerShortcutContainerAction: (
    containerNameOrId: string,
    action: 'start' | 'stop' | 'restart' | 'shell' | 'logs' | 'inspect' | 'rm'
  ): Promise<{ ok: boolean; message: string; data: ShortcutsOverlayData }> =>
    ipcRenderer.invoke('shortcuts-docker-action', containerNameOrId, action),
  setShortcutsStayOpen: (stayOpen: boolean): Promise<ShortcutsOverlayData> =>
    ipcRenderer.invoke('shortcuts-set-stay-open', stayOpen),
  setShortcutsGrayscale: (grayscale: boolean): Promise<ShortcutsOverlayData> =>
    ipcRenderer.invoke('shortcuts-set-grayscale', grayscale),
  resizeShortcutsWindow: (width: number, height: number): Promise<ShortcutsOverlayData> =>
    ipcRenderer.invoke('shortcuts-resize', width, height),
  onShortcutsExpanded: (callback: (expanded: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, expanded: boolean): void =>
      callback(expanded)
    ipcRenderer.on('shortcuts-expanded', listener)
    return () => ipcRenderer.removeListener('shortcuts-expanded', listener)
  },
  onShortcutsGrowOrigin: (callback: (origin: GrowOrigin) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, origin: GrowOrigin): void =>
      callback(origin)
    ipcRenderer.on('shortcuts-grow-origin', listener)
    return () => ipcRenderer.removeListener('shortcuts-grow-origin', listener)
  },
  onShortcutsCollapsing: (callback: (origin: GrowOrigin) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, origin: GrowOrigin): void =>
      callback(origin)
    ipcRenderer.on('shortcuts-collapsing', listener)
    return () => ipcRenderer.removeListener('shortcuts-collapsing', listener)
  },
  onShortcutsSelectTab: (callback: (tabId: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, tabId: string): void => callback(tabId)
    ipcRenderer.on('shortcuts-select-tab', listener)
    return () => ipcRenderer.removeListener('shortcuts-select-tab', listener)
  },
  onShortcutsActive: (callback: (active: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, active: boolean): void => callback(active)
    ipcRenderer.on('shortcuts-active', listener)
    return () => ipcRenderer.removeListener('shortcuts-active', listener)
  },
  // Scheduled Jobs APIs
  getScheduledJobs: (): Promise<ScheduledJobItem[]> => ipcRenderer.invoke('schedules-get-all'),
  getScheduledJobPresets: (): Promise<ScheduledJobPreset[]> =>
    ipcRenderer.invoke('schedules-get-presets'),
  saveScheduledJob: (input: ScheduledJobInput): Promise<ScheduledJobItem[]> =>
    ipcRenderer.invoke('schedules-save', input),
  deleteScheduledJob: (id: string): Promise<ScheduledJobItem[]> =>
    ipcRenderer.invoke('schedules-delete', id),
  toggleScheduledJob: (id: string, enabled?: boolean): Promise<ScheduledJobItem[]> =>
    ipcRenderer.invoke('schedules-toggle', id, enabled),
  runScheduledJobNow: (id: string): Promise<ScheduledJobItem[]> =>
    ipcRenderer.invoke('schedules-run-now', id),
  stopScheduledJob: (id: string): Promise<ScheduledJobItem[]> =>
    ipcRenderer.invoke('schedules-stop', id),
  clearScheduledJobLogs: (id: string): Promise<ScheduledJobItem[]> =>
    ipcRenderer.invoke('schedules-clear-logs', id),
  openScheduledJobInTerminal: (id: string): Promise<void> =>
    ipcRenderer.invoke('schedules-open-terminal', id),
  onScheduledJobsUpdated: (callback: (jobs: ScheduledJobItem[]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, jobs: ScheduledJobItem[]): void =>
      callback(jobs)
    ipcRenderer.on('scheduled-jobs-updated', listener)
    return () => ipcRenderer.removeListener('scheduled-jobs-updated', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
