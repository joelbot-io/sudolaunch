import type {
  CommandName,
  SearchResultItem,
  HistoryEntry,
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
  ShortcutsOverlayData,
  TextualWindowInitInfo
} from './types'

export interface SudoLaunchApi {
  search: (command: CommandName, query: string) => Promise<SearchResultItem[]>
  runCalc: (expression: string) => Promise<string | null>
  executeCommand: (
    command: CommandName,
    item: SearchResultItem,
    query: string,
    elevated?: boolean
  ) => Promise<string | null>
  getHistory: () => Promise<HistoryEntry[]>
  deleteHistoryEntry?: (timestamp: string) => Promise<HistoryEntry[]>
  clearHistory?: () => Promise<void>
  showDockContextMenu?: () => void
  getHotkeys: () => Promise<Hotkeys>
  getSettings: () => Promise<Settings>
  hidePalette: () => void
  reportRendererError?: (message: string) => void
  notifyPaletteReady?: () => void
  notifyReady?: () => void
  barActivate: (mode?: string) => void
  setPaletteModule?: (mode?: string | null) => void
  barDeactivate: () => void
  moveModeToggle: () => void
  onMoveModeChanged: (callback: (active: boolean) => void) => () => void
  openConfigFolder: () => void
  onPaletteShown: (callback: (mode?: string, growOrigin?: GrowOrigin | null) => void) => () => void
  onPaletteFocused?: (callback: () => void) => () => void
  onBarActivated: (callback: (origin: GrowOrigin) => void) => () => void
  onBarCollapsed: (callback: () => void) => () => void
  onBarCollapsing: (callback: (origin: GrowOrigin) => void) => () => void
  onPaletteHidden: (callback: () => void) => () => void
  onPaletteCollapsing: (callback: (origin: GrowOrigin) => void) => () => void
  onShelfPaletteActive: (callback: (active: boolean, mode?: string) => void) => () => void
  onDockSummoned: (
    callback: (pos: { x: number; y: number; color?: string; glow?: string }) => void
  ) => () => void
  onDockFade: (callback: (direction: 'in' | 'out') => void) => () => void
  onDockHomeState: (callback: (isHome: boolean) => void) => () => void
  getDockIsHome: () => Promise<boolean>
  onConfigChanged: (callback: () => void) => () => void
  onHotkeyError: (callback: (hotkey: string) => void) => () => void
  onTerminalHotkeyError: (callback: (hotkey: string) => void) => () => void
  getConfigEntries: (type: ConfigType) => Promise<ConfigEntry[]>
  saveConfigEntry: (type: ConfigType, entry: ConfigEntry, index: number | null) => Promise<void>
  deleteConfigEntry: (type: ConfigType, index: number) => Promise<void>
  listApps: () => Promise<AppEntry[]>
  listCustomCommands: () => Promise<CustomCommand[]>
  onCustomCommandsChanged: (callback: () => void) => () => void
  getCommandLayout: () => Promise<CommandLayout>
  saveCommandLayout: (layout: CommandLayout) => Promise<void>
  openCommandLayoutFile: () => void
  onCommandLayoutChanged: (callback: () => void) => () => void
  termToggle: () => void
  termMoveModeToggle: () => void
  onTermMoveModeChanged: (callback: (active: boolean) => void) => () => void
  termInput: (data: string) => void
  termResize: (cols: number, rows: number) => void
  resizeTerminalWindow?: (
    width: number,
    height: number,
    x?: number,
    y?: number,
    resetToDefault?: boolean
  ) => Promise<{ x: number; y: number; width: number; height: number }>
  toggleMaximizeTerminalWindow?: () => Promise<{
    maximized: boolean
    bounds: { x: number; y: number; width: number; height: number } | null
  }>
  onTermData: (callback: (data: string) => void) => () => void
  onTermExpanded: (callback: (expanded: boolean) => void) => () => void
  onTermGrowOrigin: (callback: (origin: GrowOrigin) => void) => () => void
  onTermCollapsing: (callback: (origin: GrowOrigin) => void) => () => void
  onTermExited: (callback: () => void) => () => void
  onTermRespawned: (callback: () => void) => () => void
  onTermUnreadActivity: (callback: (hasUnread: boolean) => void) => () => void
  notifyToggle: () => void
  notifyOpen?: () => void
  getNotifications: () => Promise<SudoNotification[]>
  clearNotifications: () => Promise<void>
  dismissNotification: (id: string) => Promise<void>
  markNotificationsRead: () => Promise<void>
  onNotificationsUpdated: (callback: (notifications: SudoNotification[]) => void) => () => void
  onNotifyExpanded: (callback: (expanded: boolean) => void) => () => void
  onNotifyGrowOrigin: (callback: (origin: GrowOrigin) => void) => () => void
  onNotifyCollapsing: (callback: (origin: GrowOrigin) => void) => () => void

  // Focus timer APIs
  getFocusTimerState: () => Promise<FocusTimerState>
  startFocusTimer: (mins?: number) => Promise<FocusTimerState>
  pauseFocusTimer: () => Promise<FocusTimerState>
  resetFocusTimer: (mins?: number) => Promise<FocusTimerState>
  onFocusTimerTick: (callback: (state: FocusTimerState) => void) => () => void
  onFocusTimerComplete: (callback: (sessionCount: number) => void) => () => void

  // Git status APIs
  getGitRepoStatus: () => Promise<GitRepoStatus>
  getGitBranches: () => Promise<string[]>
  checkoutGitBranch: (branch: string) => Promise<{ success: boolean; message?: string }>
  selectGitRepoFolder: () => Promise<GitRepoStatus | null>
  setActiveGitRepo: (repoPath: string) => Promise<GitRepoStatus>
  getKnownGitRepos: () => Promise<KnownRepoItem[]>

  // Git Hot-Reload Watchers APIs
  getGitWatchers?: () => Promise<GitWatcherItem[]>
  getGitWatcherPresets?: (repoPath?: string) => Promise<GitProjectPreset[]>
  saveGitWatcher?: (input: GitWatcherConfigInput) => Promise<GitWatcherItem[]>
  deleteGitWatcher?: (id: string) => Promise<GitWatcherItem[]>
  startGitWatcher?: (id: string) => Promise<GitWatcherItem[]>
  stopGitWatcher?: (id: string) => Promise<GitWatcherItem[]>
  stopAllGitWatchers?: () => Promise<GitWatcherItem[]>
  triggerGitWatcherReload?: (id: string) => Promise<GitWatcherItem[]>
  clearGitWatcherLogs?: (id: string) => Promise<GitWatcherItem[]>
  openGitWatcherInTerminal?: (id: string) => Promise<void>
  selectWatcherProjectFolder?: () => Promise<string | null>
  onGitWatchersUpdated?: (callback: (watchers: GitWatcherItem[]) => void) => () => void

  // Profile APIs
  executeProfileCommand: (action: string) => Promise<void>
  listProfiles: () => Promise<ProfileItem[]>
  switchProfile: (id: string) => Promise<{ success: boolean; activeProfile: string }>
  createProfile: (name: string, cloneCurrent?: boolean) => Promise<ProfileItem[]>
  deleteProfile: (id: string) => Promise<ProfileItem[]>
  listBackupArchives: () => Promise<BackupArchiveItem[]>
  restoreSpecificBackup: (filename: string) => Promise<void>

  // WinGet / System Management APIs
  getWingetUpdates?: (force?: boolean) => Promise<WingetPackageItem[]>
  getWingetInstalled?: (force?: boolean) => Promise<WingetPackageItem[]>
  getWingetPins?: (force?: boolean) => Promise<WingetPinItem[]>
  searchWingetCatalog?: (query: string) => Promise<WingetSearchResult[]>
  getWingetPackageDetails?: (id: string) => Promise<WingetPackageDetails | null>
  addWingetPin?: (
    options: WingetPinOptions
  ) => Promise<{ success: boolean; message: string; pins: WingetPinItem[] }>
  removeWingetPin?: (
    id: string,
    elevated?: boolean
  ) => Promise<{ success: boolean; message: string; pins: WingetPinItem[] }>
  resetWingetPins?: (
    elevated?: boolean
  ) => Promise<{ success: boolean; message: string; pins: WingetPinItem[] }>
  runWingetAction?: (
    params: WingetActionParams
  ) => Promise<{ started: boolean; mode: 'in-panel' | 'elevated' | 'terminal'; message?: string }>
  runWingetBatchAction?: (
    params: WingetBatchActionParams
  ) => Promise<{ started: boolean; message?: string }>
  cancelWingetOperation?: () => Promise<boolean>
  getWingetOperationState?: () => Promise<WingetOperationState | null>
  listWingetSnapshots?: () => Promise<WingetSnapshotItem[]>
  createWingetSnapshot?: (
    label?: string
  ) => Promise<{ success: boolean; message: string; snapshots: WingetSnapshotItem[] }>
  restoreWingetSnapshot?: (
    filename: string,
    mode: 'pins-only' | 'full-import'
  ) => Promise<{ success: boolean; message: string }>
  deleteWingetSnapshot?: (filename: string) => Promise<WingetSnapshotItem[]>
  openWingetSnapshotsFolder?: () => Promise<void>
  getEcosystemUpdates?: (force?: boolean) => Promise<EcosystemUpdateItem[]>
  runEcosystemUpdate?: (params: {
    manager: 'npm' | 'pip' | 'psmodule' | 'wsl'
    id?: string
    all?: boolean
    inTerminal?: boolean
  }) => Promise<{ success: boolean; message: string }>
  getDevRuntimesStatus?: (force?: boolean) => Promise<DevRuntimeStatus[]>
  getPathHealth?: () => Promise<PathEntryHealth[]>
  getSystemServices?: (force?: boolean) => Promise<SystemServiceItem[]>
  togglePinSystemService?: (name: string) => Promise<SystemServiceItem[]>
  runSystemServiceAction?: (params: {
    name: string
    action: 'start' | 'stop' | 'restart' | 'auto' | 'manual' | 'disabled'
    elevated?: boolean
  }) => Promise<{ success: boolean; message: string; services: SystemServiceItem[] }>
  getSystemStartupApps?: () => Promise<SystemStartupAppItem[]>
  getSystemPorts?: () => Promise<SystemPortItem[]>
  getSystemProcesses?: () => Promise<SystemProcessItem[]>
  killSystemProcess?: (
    pid: number,
    elevated?: boolean
  ) => Promise<{ success: boolean; message: string }>
  getCleanupTargets?: () => Promise<CleanupTargetItem[]>
  cleanSystemTargets?: (
    ids: string[]
  ) => Promise<{ success: boolean; message: string; targets: CleanupTargetItem[] }>
  getWindowsUpdateStatus?: (options?: {
    force?: boolean
    scanPending?: boolean
    online?: boolean
  }) => Promise<WindowsUpdateStatus>
  runWindowsUpdateAction?: (
    action: WindowsUpdateActionType,
    targetKbOrTitle?: string
  ) => Promise<{ success: boolean; message: string; status?: WindowsUpdateStatus }>
  getSystemEnvVars?: () => Promise<SystemEnvVarItem[]>
  setSystemEnvVar?: (params: {
    name: string
    value: string
    scope: 'User' | 'Machine'
    elevated?: boolean
  }) => Promise<{ success: boolean; message: string; items: SystemEnvVarItem[] }>
  deleteSystemEnvVar?: (params: {
    name: string
    scope: 'User' | 'Machine'
    elevated?: boolean
  }) => Promise<{ success: boolean; message: string; items: SystemEnvVarItem[] }>
  getSystemScheduledTasks?: (force?: boolean) => Promise<SystemScheduledTaskItem[]>
  runSystemScheduledTaskAction?: (params: {
    taskPath: string
    taskName: string
    action: 'run' | 'enable' | 'disable'
    elevated?: boolean
  }) => Promise<{ success: boolean; message: string; tasks: SystemScheduledTaskItem[] }>
  getSystemHostsEntries?: () => Promise<SystemHostEntryItem[]>
  saveSystemHostEntry?: (params: {
    action: 'toggle' | 'add' | 'delete'
    lineIndex?: number
    ip?: string
    hostname?: string
    comment?: string
  }) => Promise<{ success: boolean; message: string; entries: SystemHostEntryItem[] }>
  getSystemNetworkAdapters?: () => Promise<SystemNetworkAdapterItem[]>
  runSystemNetworkAction?: (params: {
    action:
      | 'flush-dns'
      | 'reset-winsock'
      | 'set-dns'
      | 'allow-port-firewall'
      | 'open-hosts-folder'
    adapterName?: string
    dnsPreset?: 'cloudflare' | 'google' | 'quad9' | 'dhcp'
    port?: number
  }) => Promise<{ success: boolean; message: string }>
  getSystemStorageAndPower?: () => Promise<SystemStorageAndPowerOverview>
  runSystemPowerOrRepairAction?: (params: {
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
  }) => Promise<{ success: boolean; message: string }>
  getSystemSecurityPosture?: (force?: boolean) => Promise<SystemSecurityPosture>
  runSystemSecurityAction?: (params: {
    action:
      | 'update-signatures'
      | 'quick-scan'
      | 'open-defender'
      | 'add-exclusion-path'
      | 'remove-exclusion-path'
    targetPath?: string
  }) => Promise<{ success: boolean; message: string; posture?: SystemSecurityPosture }>
  getSystemEventLogs?: () => Promise<SystemEventLogItem[]>
  openExternalUrl?: (url: string) => Promise<void>
  revealPathInExplorer?: (targetPath: string) => Promise<void>
  onWingetOperationProgress?: (
    callback: (state: WingetOperationState | null) => void
  ) => () => void
  onWingetUpdatesCount?: (callback: (count: number) => void) => () => void
  shortcutsToggle?: (initialTab?: string) => void
  shortcutsOpen?: (initialTab?: string) => void
  shortcutsReady?: () => void
  getShortcutsOverlayData?: () => Promise<ShortcutsOverlayData>
  executeShortcutItem?: (
    item: ShortcutOverlayItem,
    elevated?: boolean
  ) => Promise<{ ok: boolean; message: string }>
  toggleShortcutFavorite?: (id: string) => Promise<ShortcutsOverlayData>
  saveShortcutItem?: (item: ShortcutOverlayItem) => Promise<ShortcutsOverlayData>
  deleteShortcutItem?: (id: string) => Promise<ShortcutsOverlayData>
  addShortcutCustomTab?: (label: string, icon?: string) => Promise<ShortcutsOverlayData>
  deleteShortcutCustomTab?: (tabId: string) => Promise<ShortcutsOverlayData>
  restoreDefaultShortcuts?: () => Promise<ShortcutsOverlayData>
  runDockerShortcutContainerAction?: (
    containerNameOrId: string,
    action: 'start' | 'stop' | 'restart' | 'shell' | 'logs' | 'inspect' | 'rm'
  ) => Promise<{ ok: boolean; message: string; data: ShortcutsOverlayData }>
  setShortcutsStayOpen?: (stayOpen: boolean) => Promise<ShortcutsOverlayData>
  setShortcutsGrayscale?: (grayscale: boolean) => Promise<ShortcutsOverlayData>
  resizeShortcutsWindow?: (width: number, height: number) => Promise<ShortcutsOverlayData>
  onShortcutsExpanded?: (callback: (expanded: boolean) => void) => () => void
  onShortcutsGrowOrigin?: (callback: (origin: GrowOrigin) => void) => () => void
  onShortcutsCollapsing?: (callback: (origin: GrowOrigin) => void) => () => void
  onShortcutsSelectTab?: (callback: (tabId: string) => void) => () => void
  onShortcutsActive?: (callback: (active: boolean) => void) => () => void
  // Scheduled Jobs APIs
  getScheduledJobs?: () => Promise<ScheduledJobItem[]>
  getScheduledJobPresets?: () => Promise<ScheduledJobPreset[]>
  saveScheduledJob?: (input: ScheduledJobInput) => Promise<ScheduledJobItem[]>
  deleteScheduledJob?: (id: string) => Promise<ScheduledJobItem[]>
  toggleScheduledJob?: (id: string, enabled?: boolean) => Promise<ScheduledJobItem[]>
  runScheduledJobNow?: (id: string) => Promise<ScheduledJobItem[]>
  stopScheduledJob?: (id: string) => Promise<ScheduledJobItem[]>
  clearScheduledJobLogs?: (id: string) => Promise<ScheduledJobItem[]>
  openScheduledJobInTerminal?: (id: string) => Promise<void>
  onScheduledJobsUpdated?: (callback: (jobs: ScheduledJobItem[]) => void) => () => void
  // Floating Textual TUI window APIs
  textualWinInit?: (
    sessionId: string,
    cols: number,
    rows: number
  ) => Promise<TextualWindowInitInfo | null>
  textualWinInput?: (sessionId: string, data: string) => void
  textualWinResize?: (sessionId: string, cols: number, rows: number) => void
  textualWinRestart?: (sessionId: string, cols: number, rows: number) => Promise<boolean>
  textualWinTogglePin?: (sessionId: string) => Promise<boolean>
  textualWinMaximize?: (sessionId: string) => void
  textualWinClose?: (sessionId: string) => void
  onTextualWinData?: (callback: (data: string) => void) => () => void
  onTextualWinExit?: (callback: (exitCode: number) => void) => () => void
}

