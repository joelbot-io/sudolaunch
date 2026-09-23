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
  ProfileItem,
  BackupArchiveItem
} from '../../shared/types'

declare global {
  interface Window {
    api: {
      search: (command: CommandName, query: string) => Promise<SearchResultItem[]>
      runCalc: (expression: string) => Promise<string | null>
      executeCommand: (command: CommandName, item: SearchResultItem, query: string, elevated?: boolean) => Promise<string | null>
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

      // Profile APIs
      executeProfileCommand: (action: string) => Promise<void>
      listProfiles: () => Promise<ProfileItem[]>
      switchProfile: (id: string) => Promise<{ success: boolean; activeProfile: string }>
      createProfile: (name: string, cloneCurrent?: boolean) => Promise<ProfileItem[]>
      deleteProfile: (id: string) => Promise<ProfileItem[]>
      listBackupArchives: () => Promise<BackupArchiveItem[]>
      restoreSpecificBackup: (filename: string) => Promise<void>
    }
  }
}

export {}
