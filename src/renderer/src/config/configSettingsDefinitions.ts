import Fuse from 'fuse.js'
import {
  CONFIG_TYPES,
  COMMANDS,
  SEARCHABLE_COMMAND_NAMES,
  type ConfigTypeDef,
  type ConfigEntry,
  type CommandLayout,
  type ShelfModuleId,
  type Settings
} from '../../../shared/types'

export type Level =
  | { kind: 'types' }
  | { kind: 'settings' }
  | { kind: 'list'; typeDef: ConfigTypeDef }
  | { kind: 'apps' }
  | { kind: 'searchCommands' }
  | { kind: 'hiddenCommands' }
  | { kind: 'defaultCommand' }
  | { kind: 'dockSlots' }
  | { kind: 'commandLayout' }
  | { kind: 'folderEdit'; folderId: string }
  | { kind: 'folderAddCommand'; folderId: string }
  | { kind: 'commandAssignFolder'; commandName: string }
  | { kind: 'newFolder' }
  | { kind: 'teamsManager' }
  | {
      kind: 'form'
      typeDef: ConfigTypeDef
      index: number | null
      draft: ConfigEntry
      focusFieldKey?: string
      returnToTeamsManager?: boolean
    }

export function getInitialLevel(target?: string): Level {
  if (!target || target === 'types' || target === 'all') return { kind: 'types' }
  if (target === 'settings' || target === 'edit' || target === 'system') return { kind: 'settings' }
  if (target === 'teams') return { kind: 'teamsManager' }
  if (target === 'apps') return { kind: 'apps' }
  if (target === 'searchCommands') return { kind: 'searchCommands' }
  if (target === 'hiddenCommands') return { kind: 'hiddenCommands' }
  if (target === 'defaultCommand') return { kind: 'defaultCommand' }
  if (target === 'dockSlots' || target === 'dock' || target === 'shelf' || target === 'modules')
    return { kind: 'dockSlots' }
  if (target === 'commandLayout' || target === 'layout' || target === 'folders')
    return { kind: 'commandLayout' }
  const typeDef = CONFIG_TYPES.find((t) => t.type === target)
  if (typeDef) {
    if (typeDef.type === 'settings') return { kind: 'settings' }
    if (!typeDef.singleton) return { kind: 'list', typeDef }
  }
  return { kind: 'types' }
}

export const APPS_ROW_LABEL = 'App Visibility'
export const APPS_ROW_DESCRIPTION = 'Choose which apps appear in the app launcher'
export const APPS_ACTION_COUNT = 2

export const SEARCH_COMMANDS_ROW_LABEL = 'Search Commands'
export const SEARCH_COMMANDS_ROW_DESCRIPTION =
  'Choose which commands the "search" command fans out to'
export const SEARCH_COMMANDS_ACTION_COUNT = 3
export const SEARCH_COMMAND_DEFS = SEARCHABLE_COMMAND_NAMES.map(
  (name) => COMMANDS.find((c) => c.name === name)!
)

export const HIDDEN_COMMANDS_ROW_LABEL = 'Command Visibility'
export const HIDDEN_COMMANDS_ROW_DESCRIPTION =
  'Choose which commands appear in the command palette UI'
export const HIDDEN_COMMANDS_ACTION_COUNT = 2

export const DEFAULT_COMMAND_ROW_LABEL = 'Default Command'
export const DEFAULT_COMMAND_ROW_DESCRIPTION =
  'Choose which command appears first in suggestions'

export const DOCK_SLOTS_ROW_LABEL = 'Dock Slots & Modules'
export const DOCK_SLOTS_ROW_DESCRIPTION =
  'Choose which icons appear on the shelf dock and customize their order'
export const DOCK_SLOTS_ACTION_COUNT = 2
export const ALL_SHELF_MODULES: ShelfModuleId[] = [
  'term',
  'bar',
  'notify',
  'shortcuts',
  'settings',
  'focus',
  'git',
  'profile',
  'system',
  'jobs'
]

export const COMMAND_LAYOUT_ROW_LABEL = 'Command Layout'
export const COMMAND_LAYOUT_ROW_DESCRIPTION =
  'Rearrange commands, organize into subfolders, and configure display order'
export const COMMAND_LAYOUT_ACTION_COUNT = 3

export const TEAMS_MANAGER_ROW_LABEL = 'Teams Contacts & Channels'
export const TEAMS_MANAGER_ACTION_COUNT = 2
export const FOLDER_EDIT_ACTION_COUNT = 3

export function fuzzyFilter<T>(items: T[], keys: string[], needle: string): T[] {
  if (!needle) return items
  return new Fuse(items, { keys, threshold: 0.35 }).search(needle).map((r) => r.item)
}

export function emptyDraft(typeDef: ConfigTypeDef): ConfigEntry {
  const draft: ConfigEntry = {}
  for (const field of typeDef.fields) {
    draft[field.key] = field.type === 'boolean' ? false : field.type === 'number' ? 0 : ''
  }
  return draft
}

export const GLOW_COLORS = [
  { name: 'Sky Blue', hex: '#5aa0ff' },
  { name: 'Purple', hex: '#a855f7' },
  { name: 'Dark Purple', hex: '#6b21a8' },
  { name: 'Emerald', hex: '#34d399' },
  { name: 'Coral', hex: '#ff6b6b' },
  { name: 'Amber', hex: '#fbbf24' },
  { name: 'Teal', hex: '#50e3c2' },
  { name: 'Pink', hex: '#ff6bb4' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Black', hex: '#000000' }
]

export const PALETTE_HOTKEYS = [
  'Alt+Space',
  'Control+Space',
  'Alt+K',
  'Control+Alt+Space',
  'Win+Space'
]
export const TERMINAL_HOTKEYS = ['Alt+`', 'Control+`', 'Alt+T', 'Control+T']
export const SWAP_HOTKEYS = ['ScrollLock', 'Pause', 'Control+Alt+S']
export const HISTORY_LIMITS = [25, 50, 100, 200]
export const RETURN_DELAYS = [4, 8, 12, 16, 30]
export const TERMINAL_WIDTHS = [600, 800, 1000, 1200]
export const TERMINAL_HEIGHTS = [300, 360, 480, 640]
export const MONITORS = [1, 2, 3]
export const DOCK_LAYOUTS: Array<'shelf' | 'horizontal' | 'circle'> = [
  'shelf',
  'horizontal',
  'circle'
]
export const DOCK_GLOW_STYLES: Array<'breathing' | 'steady' | 'stealth'> = [
  'breathing',
  'steady',
  'stealth'
]
export const DOCK_HOME_POSITIONS: Array<'middle' | 'right' | 'left' | 'custom'> = [
  'middle',
  'right',
  'left',
  'custom'
]

export interface SettingRow {
  key: string
  label: string
  sublabel: string
  badge: string
  badgeType: 'toggle-on' | 'toggle-off' | 'value' | 'color'
  keywords: string
  onSelect: () => void
  onCycleBackward?: () => void
}

export interface Row {
  key: string
  label: string
  sublabel?: string
  keywords?: string
  onSelect: () => void
}

export function buildSettingsRows(params: {
  settings: Settings | null
  shelfIcons: ShelfModuleId[]
  layout: CommandLayout
  updateSetting: <K extends keyof Settings>(key: K, val: Settings[K]) => void
  openDockSlotsScreen: () => void
  openDefaultCommandScreen: () => void
  openCommandLayoutScreen: () => void
  openAppsScreen: () => void
  openSearchCommandsScreen: () => void
  openHiddenCommandsScreen: () => void
  openPeersList: () => void
}): SettingRow[] {
  const {
    settings,
    shelfIcons,
    layout,
    updateSetting,
    openDockSlotsScreen,
    openDefaultCommandScreen,
    openCommandLayoutScreen,
    openAppsScreen,
    openSearchCommandsScreen,
    openHiddenCommandsScreen,
    openPeersList
  } = params

  if (!settings) return []

  return [
    {
      key: 'dockLayout',
      label: 'Dock Layout',
      sublabel: 'Arrangement of the floating dock on screen · ↵ to cycle',
      badge:
        (settings.dockLayout ?? 'shelf').charAt(0).toUpperCase() +
        (settings.dockLayout ?? 'shelf').slice(1),
      badgeType: 'value',
      keywords: 'dock layout shelf horizontal circle arrangement mode appearance',
      onSelect: () => {
        const cur = settings.dockLayout ?? 'shelf'
        const idx = DOCK_LAYOUTS.indexOf(cur)
        const next = DOCK_LAYOUTS[(idx + 1) % DOCK_LAYOUTS.length]
        updateSetting('dockLayout', next)
      },
      onCycleBackward: () => {
        const cur = settings.dockLayout ?? 'shelf'
        const idx = DOCK_LAYOUTS.indexOf(cur)
        const next = DOCK_LAYOUTS[(idx - 1 + DOCK_LAYOUTS.length) % DOCK_LAYOUTS.length]
        updateSetting('dockLayout', next)
      }
    },
    {
      key: 'dockGlowStyle',
      label: 'Minimized Dock Glow Style',
      sublabel: 'Animation effect for the collapsed pill bar · ↵ to cycle',
      badge:
        (settings.dockGlowStyle ?? 'breathing').charAt(0).toUpperCase() +
        (settings.dockGlowStyle ?? 'breathing').slice(1),
      badgeType: 'value',
      keywords: 'glow style animation breathing steady stealth idle pill dock',
      onSelect: () => {
        const cur = settings.dockGlowStyle ?? 'breathing'
        const idx = DOCK_GLOW_STYLES.indexOf(cur)
        const next = DOCK_GLOW_STYLES[(idx + 1) % DOCK_GLOW_STYLES.length]
        updateSetting('dockGlowStyle', next)
      },
      onCycleBackward: () => {
        const cur = settings.dockGlowStyle ?? 'breathing'
        const idx = DOCK_GLOW_STYLES.indexOf(cur)
        const next =
          DOCK_GLOW_STYLES[(idx - 1 + DOCK_GLOW_STYLES.length) % DOCK_GLOW_STYLES.length]
        updateSetting('dockGlowStyle', next)
      }
    },
    {
      key: 'dockGlowColor',
      label: 'Dock Glow Color',
      sublabel: 'Ambient neon glow color of the dock across all display modes · ↵ to cycle colors',
      badge: settings.dockGlowColor ?? '#5aa0ff',
      badgeType: 'color',
      keywords: 'glow color accent pill tint dock light neon hex purple dark black',
      onSelect: () => {
        const cur = (settings.dockGlowColor ?? '#5aa0ff').toLowerCase()
        const idx = GLOW_COLORS.findIndex((c) => c.hex.toLowerCase() === cur)
        const next = GLOW_COLORS[(idx + 1) % GLOW_COLORS.length].hex
        updateSetting('dockGlowColor', next)
      },
      onCycleBackward: () => {
        const cur = (settings.dockGlowColor ?? '#5aa0ff').toLowerCase()
        const idx = GLOW_COLORS.findIndex((c) => c.hex.toLowerCase() === cur)
        const next = GLOW_COLORS[(idx - 1 + GLOW_COLORS.length) % GLOW_COLORS.length].hex
        updateSetting('dockGlowColor', next)
      }
    },
    {
      key: 'dockSlots',
      label: 'Dock Slots & Modules',
      sublabel: 'Choose icons and customize their order on the shelf dock · ↵ to open',
      badge: `${shelfIcons.length} active`,
      badgeType: 'value',
      keywords: 'dock slots modules shelf icons tray order reorder buttons',
      onSelect: openDockSlotsScreen
    },
    {
      key: 'defaultCommand',
      label: 'Default Command',
      sublabel: 'Command prioritized at the top of suggestions · ↵ to choose',
      badge:
        settings.defaultCommand && settings.defaultCommand !== 'none'
          ? `/${settings.defaultCommand}`
          : 'None',
      badgeType: 'value',
      keywords: 'default command priority initial fallback suggestion',
      onSelect: openDefaultCommandScreen
    },
    {
      key: 'commandLayout',
      label: 'Command Layout & Subfolders',
      sublabel: 'Organize commands into categories and customize display order · ↵ to open',
      badge: `${layout?.folders.length ?? 0} folders`,
      badgeType: 'value',
      keywords: 'command layout rearrange reorder folders subfolders categories move',
      onSelect: openCommandLayoutScreen
    },
    {
      key: 'historyEnabled',
      label: 'Remember Command History',
      sublabel: 'Save executed commands and offer them back on empty input · ↵ to toggle',
      badge: settings.historyEnabled ? 'Enabled' : 'Disabled',
      badgeType: settings.historyEnabled ? 'toggle-on' : 'toggle-off',
      keywords: 'history remember enabled save commands log suggestions',
      onSelect: () => updateSetting('historyEnabled', !settings.historyEnabled)
    },
    {
      key: 'historyLimit',
      label: 'History Limit',
      sublabel: 'Maximum number of history commands to retain · ↵ to cycle',
      badge: `${settings.historyLimit ?? 50} entries`,
      badgeType: 'value',
      keywords: 'history limit max entries count retained',
      onSelect: () => {
        const cur = settings.historyLimit ?? 50
        const idx = HISTORY_LIMITS.indexOf(cur)
        const next = HISTORY_LIMITS[(idx + 1) % HISTORY_LIMITS.length]
        updateSetting('historyLimit', next)
      },
      onCycleBackward: () => {
        const cur = settings.historyLimit ?? 50
        const idx = HISTORY_LIMITS.indexOf(cur)
        const next = HISTORY_LIMITS[(idx - 1 + HISTORY_LIMITS.length) % HISTORY_LIMITS.length]
        updateSetting('historyLimit', next)
      }
    },
    {
      key: 'autoStart',
      label: 'Auto-Start on Boot',
      sublabel: 'Automatically launch SudoLaunch when Windows boots · ↵ to toggle',
      badge: settings.autoStart ? 'Enabled' : 'Disabled',
      badgeType: settings.autoStart ? 'toggle-on' : 'toggle-off',
      keywords: 'autostart auto start boot login windows startup launch',
      onSelect: () => updateSetting('autoStart', !settings.autoStart)
    },
    {
      key: 'autoReturnHome',
      label: 'Auto-Return Dock to Home',
      sublabel: 'Float dock back to rest position above taskbar clock · ↵ to toggle',
      badge: settings.autoReturnHome ? 'Enabled' : 'Disabled',
      badgeType: settings.autoReturnHome ? 'toggle-on' : 'toggle-off',
      keywords: 'auto return home dock float clock timer rest position',
      onSelect: () => updateSetting('autoReturnHome', !settings.autoReturnHome)
    },
    {
      key: 'dockHomePosition',
      label: 'Dock Home Position',
      sublabel: 'Resting screen anchor (Left, Middle, Right, Custom X,Y) · ↵ to cycle',
      badge: settings.dockHomePosition
        ? settings.dockHomePosition.charAt(0).toUpperCase() + settings.dockHomePosition.slice(1)
        : 'Middle',
      badgeType: 'value',
      keywords: 'home position anchor dock left middle right custom coords coordinates',
      onSelect: () => {
        const cur = settings.dockHomePosition ?? 'middle'
        const idx = DOCK_HOME_POSITIONS.indexOf(cur)
        const next = DOCK_HOME_POSITIONS[(idx + 1) % DOCK_HOME_POSITIONS.length]
        updateSetting('dockHomePosition', next)
      },
      onCycleBackward: () => {
        const cur = settings.dockHomePosition ?? 'middle'
        const idx = DOCK_HOME_POSITIONS.indexOf(cur)
        const next =
          DOCK_HOME_POSITIONS[
            (idx - 1 + DOCK_HOME_POSITIONS.length) % DOCK_HOME_POSITIONS.length
          ]
        updateSetting('dockHomePosition', next)
      }
    },
    {
      key: 'autoReturnDelaySec',
      label: 'Auto-Return Delay',
      sublabel: 'Idle seconds before dock returns to home position · ↵ to cycle',
      badge: `${settings.autoReturnDelaySec ?? 8}s`,
      badgeType: 'value',
      keywords: 'auto return delay seconds timer wait idle float',
      onSelect: () => {
        const cur = settings.autoReturnDelaySec ?? 8
        const idx = RETURN_DELAYS.indexOf(cur)
        const next = RETURN_DELAYS[(idx + 1) % RETURN_DELAYS.length]
        updateSetting('autoReturnDelaySec', next)
      },
      onCycleBackward: () => {
        const cur = settings.autoReturnDelaySec ?? 8
        const idx = RETURN_DELAYS.indexOf(cur)
        const next = RETURN_DELAYS[(idx - 1 + RETURN_DELAYS.length) % RETURN_DELAYS.length]
        updateSetting('autoReturnDelaySec', next)
      }
    },
    {
      key: 'terminalWidth',
      label: 'Terminal Window Width',
      sublabel:
        'Width of the slide-up quick terminal window in pixels (or drag window edges) · ↵ to cycle',
      badge: `${settings.terminalWidth ?? 800}px`,
      badgeType: 'value',
      keywords: 'terminal width size window px cascadia dimension',
      onSelect: () => {
        const cur = settings.terminalWidth ?? 800
        const idx = TERMINAL_WIDTHS.indexOf(cur)
        const next = TERMINAL_WIDTHS[(idx + 1) % TERMINAL_WIDTHS.length]
        updateSetting('terminalWidth', next)
      },
      onCycleBackward: () => {
        const cur = settings.terminalWidth ?? 800
        const idx = TERMINAL_WIDTHS.indexOf(cur)
        const next =
          TERMINAL_WIDTHS[(idx - 1 + TERMINAL_WIDTHS.length) % TERMINAL_WIDTHS.length]
        updateSetting('terminalWidth', next)
      }
    },
    {
      key: 'terminalHeight',
      label: 'Terminal Window Height',
      sublabel:
        'Height of the slide-up quick terminal window in pixels (or drag window edges) · ↵ to cycle',
      badge: `${settings.terminalHeight ?? 360}px`,
      badgeType: 'value',
      keywords: 'terminal height size window px cascadia dimension',
      onSelect: () => {
        const cur = settings.terminalHeight ?? 360
        const idx = TERMINAL_HEIGHTS.indexOf(cur)
        const next = TERMINAL_HEIGHTS[(idx + 1) % TERMINAL_HEIGHTS.length]
        updateSetting('terminalHeight', next)
      },
      onCycleBackward: () => {
        const cur = settings.terminalHeight ?? 360
        const idx = TERMINAL_HEIGHTS.indexOf(cur)
        const next =
          TERMINAL_HEIGHTS[(idx - 1 + TERMINAL_HEIGHTS.length) % TERMINAL_HEIGHTS.length]
        updateSetting('terminalHeight', next)
      }
    },
    {
      key: 'monitor',
      label: 'Dock Monitor',
      sublabel: 'Display monitor index to anchor the dock to · ↵ to cycle',
      badge: `Monitor ${settings.monitor ?? 1}`,
      badgeType: 'value',
      keywords: 'monitor display screen display1 display2 multi-monitor',
      onSelect: () => {
        const cur = settings.monitor ?? 1
        const idx = MONITORS.indexOf(cur)
        const next = MONITORS[(idx + 1) % MONITORS.length]
        updateSetting('monitor', next)
      },
      onCycleBackward: () => {
        const cur = settings.monitor ?? 1
        const idx = MONITORS.indexOf(cur)
        const next = MONITORS[(idx - 1 + MONITORS.length) % MONITORS.length]
        updateSetting('monitor', next)
      }
    },
    {
      key: 'hotkey',
      label: 'Command Palette Hotkey',
      sublabel: 'Global shortcut to summon launcher · ↵ to cycle presets',
      badge: settings.hotkey || 'Alt+Space',
      badgeType: 'value',
      keywords: 'hotkey shortcut summon palette key alt space global',
      onSelect: () => {
        const cur = settings.hotkey || 'Alt+Space'
        const idx = PALETTE_HOTKEYS.indexOf(cur)
        const next = PALETTE_HOTKEYS[(idx + 1) % PALETTE_HOTKEYS.length]
        updateSetting('hotkey', next)
      },
      onCycleBackward: () => {
        const cur = settings.hotkey || 'Alt+Space'
        const idx = PALETTE_HOTKEYS.indexOf(cur)
        const next = PALETTE_HOTKEYS[(idx - 1 + PALETTE_HOTKEYS.length) % PALETTE_HOTKEYS.length]
        updateSetting('hotkey', next)
      }
    },
    {
      key: 'terminalHotkey',
      label: 'Terminal Hotkey',
      sublabel: 'Global shortcut to toggle slide-up terminal · ↵ to cycle presets',
      badge: settings.terminalHotkey || 'Alt+`',
      badgeType: 'value',
      keywords: 'terminal hotkey shortcut quick term tty',
      onSelect: () => {
        const cur = settings.terminalHotkey || 'Alt+`'
        const idx = TERMINAL_HOTKEYS.indexOf(cur)
        const next = TERMINAL_HOTKEYS[(idx + 1) % TERMINAL_HOTKEYS.length]
        updateSetting('terminalHotkey', next)
      },
      onCycleBackward: () => {
        const cur = settings.terminalHotkey || 'Alt+`'
        const idx = TERMINAL_HOTKEYS.indexOf(cur)
        const next =
          TERMINAL_HOTKEYS[(idx - 1 + TERMINAL_HOTKEYS.length) % TERMINAL_HOTKEYS.length]
        updateSetting('terminalHotkey', next)
      }
    },
    {
      key: 'swapEnabled',
      label: 'Input Sharing (/control)',
      sublabel: 'Network mouse and keyboard sharing between PCs · ↵ to toggle',
      badge: settings.swapEnabled ? 'Enabled' : 'Disabled',
      badgeType: settings.swapEnabled ? 'toggle-on' : 'toggle-off',
      keywords: 'swap control input sharing mouse keyboard network mtls',
      onSelect: () => updateSetting('swapEnabled', !settings.swapEnabled)
    },
    {
      key: 'swapToggleHotkey',
      label: 'Input Sharing Hotkey',
      sublabel: 'Hotkey to switch mouse/keyboard to another PC · ↵ to cycle',
      badge: settings.swapToggleHotkey || 'ScrollLock',
      badgeType: 'value',
      keywords: 'swap toggle hotkey control switch machine scrolllock pause',
      onSelect: () => {
        const cur = settings.swapToggleHotkey || 'ScrollLock'
        const idx = SWAP_HOTKEYS.indexOf(cur)
        const next = SWAP_HOTKEYS[(idx + 1) % SWAP_HOTKEYS.length]
        updateSetting('swapToggleHotkey', next)
      },
      onCycleBackward: () => {
        const cur = settings.swapToggleHotkey || 'ScrollLock'
        const idx = SWAP_HOTKEYS.indexOf(cur)
        const next = SWAP_HOTKEYS[(idx - 1 + SWAP_HOTKEYS.length) % SWAP_HOTKEYS.length]
        updateSetting('swapToggleHotkey', next)
      }
    },
    {
      key: 'peers',
      label: 'Swap Peers',
      sublabel: 'Computers configured for input sharing · ↵ to view',
      badge: 'View Peers',
      badgeType: 'value',
      keywords: 'peers swap control machines computers remote network',
      onSelect: openPeersList
    },
    {
      key: 'disableMouseInput',
      label: 'Disable Mouse Input',
      sublabel: 'Keyboard-only mode: ignore mouse hover & clicks in palette · ↵ to toggle',
      badge: settings.disableMouseInput ? 'Enabled' : 'Disabled',
      badgeType: settings.disableMouseInput ? 'toggle-on' : 'toggle-off',
      keywords: 'disable mouse input keyboard only pure distraction free',
      onSelect: () => updateSetting('disableMouseInput', !settings.disableMouseInput)
    },
    {
      key: 'apps',
      label: 'App Visibility',
      sublabel: 'Choose which apps appear in the app launcher · ↵ to configure',
      badge: 'Configure',
      badgeType: 'value',
      keywords: 'applications visibility launcher show hide filter apps',
      onSelect: openAppsScreen
    },
    {
      key: 'searchCommands',
      label: 'Search Commands',
      sublabel: 'Choose which commands the "search" command fans out to · ↵ to configure',
      badge: 'Configure',
      badgeType: 'value',
      keywords: 'search fanout commands include exclude query',
      onSelect: openSearchCommandsScreen
    },
    {
      key: 'hiddenCommands',
      label: 'Command Visibility',
      sublabel: 'Choose which commands appear in the command palette UI · ↵ to configure',
      badge: 'Configure',
      badgeType: 'value',
      keywords: 'hide show palette commands visibility toggle ui',
      onSelect: openHiddenCommandsScreen
    },
    {
      key: 'openConfigFolder',
      label: 'Open Config Folder',
      sublabel: 'Open %USERPROFILE%\\.sudolaunch in File Explorer · ↵ to open',
      badge: 'Explore',
      badgeType: 'value',
      keywords: 'folder explorer directory path config json configuration files',
      onSelect: () => window.api.openConfigFolder()
    }
  ]
}

