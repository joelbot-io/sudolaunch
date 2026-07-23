import type { CommandName, SearchResultItem, HistoryEntry, ConfigType, ConfigEntry, AppEntry } from '../../shared/types'

declare global {
  interface Window {
    api: {
      search: (command: CommandName, query: string) => Promise<SearchResultItem[]>
      runCalc: (expression: string) => Promise<string | null>
      executeCommand: (command: CommandName, item: SearchResultItem, query: string) => Promise<void>
      getHistory: () => Promise<HistoryEntry[]>
      hidePalette: () => void
      openConfigFolder: () => void
      onPaletteShown: (callback: () => void) => void
      onConfigChanged: (callback: () => void) => void
      onHotkeyError: (callback: (hotkey: string) => void) => void
      getConfigEntries: (type: ConfigType) => Promise<ConfigEntry[]>
      saveConfigEntry: (type: ConfigType, entry: ConfigEntry, index: number | null) => Promise<void>
      deleteConfigEntry: (type: ConfigType, index: number) => Promise<void>
      listApps: () => Promise<AppEntry[]>
    }
  }
}

export {}
