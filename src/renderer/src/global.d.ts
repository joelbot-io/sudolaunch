import type {
  CommandName,
  SearchResultItem,
  HistoryEntry,
  ConfigType,
  ConfigEntry,
  AppEntry,
  CustomCommand,
  Hotkeys,
  GrowOrigin
} from '../../shared/types'

declare global {
  interface Window {
    api: {
      search: (command: CommandName, query: string) => Promise<SearchResultItem[]>
      runCalc: (expression: string) => Promise<string | null>
      executeCommand: (command: CommandName, item: SearchResultItem, query: string) => Promise<string | null>
      getHistory: () => Promise<HistoryEntry[]>
      getHotkeys: () => Promise<Hotkeys>
      hidePalette: () => void
      barActivate: () => void
      barDeactivate: () => void
      moveModeToggle: () => void
      onMoveModeChanged: (callback: (active: boolean) => void) => () => void
      openConfigFolder: () => void
      onPaletteShown: (callback: () => void) => () => void
      onBarActivated: (callback: (origin: GrowOrigin) => void) => () => void
      onBarCollapsed: (callback: () => void) => () => void
      onBarCollapsing: (callback: (origin: GrowOrigin) => void) => () => void
      onConfigChanged: (callback: () => void) => () => void
      onHotkeyError: (callback: (hotkey: string) => void) => () => void
      onTerminalHotkeyError: (callback: (hotkey: string) => void) => () => void
      getConfigEntries: (type: ConfigType) => Promise<ConfigEntry[]>
      saveConfigEntry: (type: ConfigType, entry: ConfigEntry, index: number | null) => Promise<void>
      deleteConfigEntry: (type: ConfigType, index: number) => Promise<void>
      listApps: () => Promise<AppEntry[]>
      listCustomCommands: () => Promise<CustomCommand[]>
      onCustomCommandsChanged: (callback: () => void) => () => void
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
    }
  }
}

export {}
