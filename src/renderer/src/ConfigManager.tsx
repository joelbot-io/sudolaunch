import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Fuse from 'fuse.js'
import {
  CONFIG_TYPES,
  COMMANDS,
  SEARCHABLE_COMMAND_NAMES,
  DEFAULT_SEARCH_EXCLUDED_COMMANDS,
  DEFAULT_COMMAND_LAYOUT,
  type ConfigTypeDef,
  type ConfigEntry,
  type AppEntry,
  type CommandName,
  type CommandLayout,
  type CommandFolder,
  type CustomCommand,
  type ShelfModuleId,
  type Settings,
  DEFAULT_SHELF_ICONS,
  SHELF_MODULE_INFO
} from '../../shared/types'

interface Props {
  initialTarget?: string
  onExit: (exitVal?: string) => void
}

type Level =
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
  | { kind: 'form'; typeDef: ConfigTypeDef; index: number | null; draft: ConfigEntry; focusFieldKey?: string; returnToTeamsManager?: boolean }

function getInitialLevel(target?: string): Level {
  if (!target || target === 'types' || target === 'all') return { kind: 'types' }
  if (target === 'settings' || target === 'edit' || target === 'system') return { kind: 'settings' }
  if (target === 'teams') return { kind: 'teamsManager' }
  if (target === 'apps') return { kind: 'apps' }
  if (target === 'searchCommands') return { kind: 'searchCommands' }
  if (target === 'hiddenCommands') return { kind: 'hiddenCommands' }
  if (target === 'defaultCommand') return { kind: 'defaultCommand' }
  if (target === 'dockSlots' || target === 'dock' || target === 'shelf' || target === 'modules') return { kind: 'dockSlots' }
  if (target === 'commandLayout' || target === 'layout' || target === 'folders') return { kind: 'commandLayout' }
  const typeDef = CONFIG_TYPES.find((t) => t.type === target)
  if (typeDef) {
    if (typeDef.type === 'settings') return { kind: 'settings' }
    if (!typeDef.singleton) return { kind: 'list', typeDef }
  }
  return { kind: 'types' }
}

// The apps screen is appended after CONFIG_TYPES as one more row in the "types" list,
// rather than living in CONFIG_TYPES itself — its list isn't add/edit/delete entries,
// it's a fixed set of discovered shortcuts toggled on or off.
const APPS_ROW_LABEL = 'App Visibility'
const APPS_ROW_DESCRIPTION = 'Choose which apps appear in the app launcher'
// The apps list is preceded by two action rows: "Select all" and "Select none".
const APPS_ACTION_COUNT = 2

// Same idea as the apps row, one more fixed toggle screen appended after it.
const SEARCH_COMMANDS_ROW_LABEL = 'Search Commands'
const SEARCH_COMMANDS_ROW_DESCRIPTION = 'Choose which commands the "search" command fans out to'
const SEARCH_COMMANDS_ACTION_COUNT = 3
const SEARCH_COMMAND_DEFS = SEARCHABLE_COMMAND_NAMES.map(
  (name) => COMMANDS.find((c) => c.name === name)!
)

const HIDDEN_COMMANDS_ROW_LABEL = 'Command Visibility'
const HIDDEN_COMMANDS_ROW_DESCRIPTION = 'Choose which commands appear in the command palette UI'
const HIDDEN_COMMANDS_ACTION_COUNT = 2

const DEFAULT_COMMAND_ROW_LABEL = 'Default Command'
const DEFAULT_COMMAND_ROW_DESCRIPTION = 'Choose which command appears first in suggestions'

const DOCK_SLOTS_ROW_LABEL = 'Dock Slots & Modules'
const DOCK_SLOTS_ROW_DESCRIPTION = 'Choose which icons appear on the shelf dock and customize their order'
const DOCK_SLOTS_ACTION_COUNT = 2
const ALL_SHELF_MODULES: ShelfModuleId[] = ['term', 'bar', 'notify', 'shortcuts', 'settings', 'focus', 'git', 'profile', 'system', 'jobs']

const COMMAND_LAYOUT_ROW_LABEL = 'Command Layout'
const COMMAND_LAYOUT_ROW_DESCRIPTION = 'Rearrange commands, organize into subfolders, and configure display order'
const COMMAND_LAYOUT_ACTION_COUNT = 3

const TEAMS_MANAGER_ROW_LABEL = 'Teams Contacts & Channels'
const TEAMS_MANAGER_ACTION_COUNT = 2
const FOLDER_EDIT_ACTION_COUNT = 3

// Same fuzzy-match settings used throughout main/commands/*.ts (teams.ts, fav.ts, app.ts,
// custom.ts, etc.) — keeps "/settings" filtering feeling identical to "/" command search instead
// of introducing a second, different matching behavior.
function fuzzyFilter<T>(items: T[], keys: string[], needle: string): T[] {
  if (!needle) return items
  return new Fuse(items, { keys, threshold: 0.35 }).search(needle).map((r) => r.item)
}

function emptyDraft(typeDef: ConfigTypeDef): ConfigEntry {
  const draft: ConfigEntry = {}
  for (const field of typeDef.fields) {
    draft[field.key] = field.type === 'boolean' ? false : field.type === 'number' ? 0 : ''
  }
  return draft
}

const GLOW_COLORS = [
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

const PALETTE_HOTKEYS = ['Alt+Space', 'Control+Space', 'Alt+K', 'Control+Alt+Space', 'Win+Space']
const TERMINAL_HOTKEYS = ['Alt+`', 'Control+`', 'Alt+T', 'Control+T']
const SWAP_HOTKEYS = ['ScrollLock', 'Pause', 'Control+Alt+S']
const HISTORY_LIMITS = [25, 50, 100, 200]
const RETURN_DELAYS = [4, 8, 12, 16, 30]
const TERMINAL_WIDTHS = [600, 800, 1000, 1200]
const MONITORS = [1, 2, 3]
const DOCK_LAYOUTS: Array<'shelf' | 'horizontal' | 'circle'> = ['shelf', 'horizontal', 'circle']
const DOCK_GLOW_STYLES: Array<'breathing' | 'steady' | 'stealth'> = ['breathing', 'steady', 'stealth']
const DOCK_HOME_POSITIONS: Array<'middle' | 'right' | 'left' | 'custom'> = ['middle', 'right', 'left', 'custom']

interface SettingRow {
  key: string
  label: string
  sublabel: string
  badge: string
  badgeType: 'toggle-on' | 'toggle-off' | 'value' | 'color'
  keywords: string
  onSelect: () => void
  onCycleBackward?: () => void
}

interface Row {
  key: string
  label: string
  sublabel?: string
  keywords?: string
  onSelect: () => void
}

export default function ConfigManager({ initialTarget, onExit }: Props): JSX.Element {
  const [level, setLevel] = useState<Level>(() => getInitialLevel(initialTarget))
  const [settings, setSettings] = useState<Settings | null>(null)
  const [entries, setEntries] = useState<ConfigEntry[]>([])
  const [apps, setApps] = useState<AppEntry[]>([])
  const [disabledApps, setDisabledApps] = useState<Set<string>>(new Set())
  const [excludedSearchCommands, setExcludedSearchCommands] = useState<Set<CommandName>>(new Set())
  const [hiddenCommands, setHiddenCommands] = useState<Set<CommandName>>(new Set())
  const [defaultCommand, setDefaultCommand] = useState<string>('')
  const [disableMouseInput, setDisableMouseInput] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const [shelfIcons, setShelfIcons] = useState<ShelfModuleId[]>(DEFAULT_SHELF_ICONS)
  const [layout, setLayout] = useState<CommandLayout>(DEFAULT_COMMAND_LAYOUT)
  const [customCommands, setCustomCommands] = useState<CustomCommand[]>([])
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderIcon, setNewFolderIcon] = useState('📁')
  const [teamContacts, setTeamContacts] = useState<ConfigEntry[]>([])
  const [teamLinksList, setTeamLinksList] = useState<ConfigEntry[]>([])
  const [pendingTeamsDeleteKey, setPendingTeamsDeleteKey] = useState<string | null>(null)

  const refreshSettings = useCallback(() => {
    window.api.getConfigEntries('settings').then((list) => {
      if (list[0]) {
        const s = list[0] as unknown as Settings
        setSettings(s)
        if (Array.isArray(s.shelfIcons) && s.shelfIcons.length > 0) {
          setShelfIcons(s.shelfIcons)
        }
        if (typeof s.disableMouseInput === 'boolean') {
          setDisableMouseInput(s.disableMouseInput)
        }
        if (typeof s.defaultCommand === 'string') {
          setDefaultCommand(s.defaultCommand)
        }
      }
    })
  }, [])

  const updateSetting = useCallback(<K extends keyof Settings>(key: K, val: Settings[K]) => {
    setSettings((prev) => {
      const updated = { ...(prev ?? ({} as Settings)), [key]: val }
      window.api.saveConfigEntry('settings', { [key]: val } as any, 0)
      return updated
    })
  }, [])

  const refreshLayout = useCallback(() => {
    window.api.getCommandLayout().then(setLayout)
    window.api.listCustomCommands().then(setCustomCommands)
    refreshSettings()
  }, [refreshSettings])

  useEffect(() => {
    refreshLayout()
    const unsubLayout = window.api.onCommandLayoutChanged(refreshLayout)
    const unsubCustom = window.api.onCustomCommandsChanged(refreshLayout)
    const unsubConfig = window.api.onConfigChanged(refreshSettings)
    return () => {
      unsubLayout()
      unsubCustom()
      unsubConfig()
    }
  }, [refreshLayout, refreshSettings])

  useEffect(() => {
    if (!initialTarget || initialTarget === 'types' || initialTarget === 'all') return
    if (initialTarget === 'commandLayout' || initialTarget === 'layout' || initialTarget === 'folders') {
      setLevel({ kind: 'commandLayout' })
      return
    }
    if (initialTarget === 'settings' || initialTarget === 'edit' || initialTarget === 'system') {
      setLevel({ kind: 'settings' })
      return
    }
    if (initialTarget === 'teams') {
      setLevel({ kind: 'teamsManager' })
      return
    }
    const typeDef = CONFIG_TYPES.find((t) => t.type === initialTarget)
    if (typeDef) {
      if (typeDef.type === 'settings') {
        setLevel({ kind: 'settings' })
        return
      }
      if (typeDef.singleton) {
        window.api.getConfigEntries(typeDef.type).then((list) => {
          setLevel({ kind: 'form', typeDef, index: 0, draft: { ...list[0] } })
        })
      }
    }
  }, [initialTarget])
  // Drives live filtering of whatever list is currently shown — the same role `value` plays
  // in CommandPalette.tsx's own input. Reset on every level change (see openXxx/backOneLevel)
  // so a filter typed on one screen doesn't leak into the next.
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Delete is destructive and irreversible, so the first press only "arms" the target
  // entry (shows "Confirm delete?") — a second press within the window actually deletes.
  // Keyed by originalIndex; cleared whenever we navigate away from the list.
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null)
  const pendingDeleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const firstFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement | null>(null)
  const targetFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement | null>(null)
  const activeItemRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (level.kind === 'form') {
      const el = (level.focusFieldKey && targetFieldRef.current) ? targetFieldRef.current : firstFieldRef.current
      el?.focus()
      if (level.focusFieldKey && targetFieldRef.current) {
        targetFieldRef.current.scrollIntoView({ block: 'center' })
      }
    } else {
      filterRef.current?.focus()
    }
    // Deliberately keyed on level.kind (+ which form) rather than `level` itself —
    // every keystroke replaces `level.draft` with a new object, and re-running this
    // on that would steal focus back to the first field on every character typed.
  }, [
    level.kind,
    level.kind === 'form' ? level.typeDef.type : null,
    level.kind === 'form' ? level.index : null,
    level.kind === 'form' ? level.focusFieldKey : null
  ])

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  useEffect(() => {
    return () => {
      if (pendingDeleteTimeoutRef.current) clearTimeout(pendingDeleteTimeoutRef.current)
    }
  }, [])

  const loadEntries = useCallback((typeDef: ConfigTypeDef) => {
    window.api.getConfigEntries(typeDef.type).then((list) => {
      setEntries(list)
      setActiveIndex(0)
    })
  }, [])

  const loadTeamsManagerEntries = useCallback(() => {
    Promise.all([
      window.api.getConfigEntries('contacts'),
      window.api.getConfigEntries('teamLinks')
    ]).then(([contacts, links]) => {
      setTeamContacts(contacts)
      setTeamLinksList(links)
      setActiveIndex(0)
    })
  }, [])

  useEffect(() => {
    if (level.kind === 'list') {
      loadEntries(level.typeDef)
    } else if (level.kind === 'teamsManager') {
      loadTeamsManagerEntries()
    }
    // Deliberately keyed on `level` itself (a fresh object each time we enter list mode)
    // rather than `loadEntries`/`level.typeDef`, so re-entering the same type still refetches.
  }, [level, loadEntries, loadTeamsManagerEntries])

  useEffect(() => {
    if (level.kind !== 'apps') return
    Promise.all([window.api.listApps(), window.api.getConfigEntries('settings')]).then(([appList, settingsList]) => {
      setApps(appList)
      const saved = settingsList[0]?.disabledApps
      setDisabledApps(new Set(Array.isArray(saved) ? (saved as string[]) : []))
      setActiveIndex(0)
    })
  }, [level])

  useEffect(() => {
    if (level.kind !== 'searchCommands') return
    window.api.getConfigEntries('settings').then((settingsList) => {
      const saved = settingsList[0]?.searchExcludedCommands
      setExcludedSearchCommands(new Set(Array.isArray(saved) ? (saved as CommandName[]) : []))
      setActiveIndex(0)
    })
  }, [level])

  useEffect(() => {
    if (level.kind !== 'hiddenCommands') return
    window.api.getConfigEntries('settings').then((settingsList) => {
      const saved = settingsList[0]?.hiddenCommands
      setHiddenCommands(new Set(Array.isArray(saved) ? (saved as CommandName[]) : []))
      setActiveIndex(0)
    })
  }, [level])

  useEffect(() => {
    window.api.getConfigEntries('settings').then((settingsList) => {
      const saved = settingsList[0]?.disableMouseInput
      if (typeof saved === 'boolean') setDisableMouseInput(saved)
      const defCmd = settingsList[0]?.defaultCommand
      if (typeof defCmd === 'string') setDefaultCommand(defCmd)
    })
    if (level.kind !== 'form') {
      filterRef.current?.focus()
    }
  }, [level])

  function openTypeList(typeDef: ConfigTypeDef, focusFieldKey?: string): void {
    setError(null)
    setFilter('')
    if (typeDef.type === 'settings') {
      setLevel({ kind: 'settings' })
      return
    }
    if (typeDef.singleton) {
      window.api.getConfigEntries(typeDef.type).then((list) => {
        setLevel({ kind: 'form', typeDef, index: 0, draft: { ...list[0] }, focusFieldKey })
      })
      return
    }
    setLevel({ kind: 'list', typeDef })
  }

  function openAppsScreen(): void {
    setError(null)
    setFilter('')
    setLevel({ kind: 'apps' })
  }

  function toggleAppDisabled(path: string): void {
    setDisabledApps((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      window.api.saveConfigEntry('settings', { disabledApps: Array.from(next) }, 0)
      return next
    })
  }

  function setAllAppsDisabled(disabled: boolean): void {
    const next = disabled ? new Set(apps.map((a) => a.path)) : new Set<string>()
    setDisabledApps(next)
    window.api.saveConfigEntry('settings', { disabledApps: Array.from(next) }, 0)
  }

  function openSearchCommandsScreen(): void {
    setError(null)
    setFilter('')
    setLevel({ kind: 'searchCommands' })
  }

  function toggleSearchCommandExcluded(name: CommandName): void {
    setExcludedSearchCommands((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      window.api.saveConfigEntry('settings', { searchExcludedCommands: Array.from(next) }, 0)
      return next
    })
  }

  function resetSearchCommandsToDefault(): void {
    const next = new Set<CommandName>(DEFAULT_SEARCH_EXCLUDED_COMMANDS)
    setExcludedSearchCommands(next)
    window.api.saveConfigEntry('settings', { searchExcludedCommands: Array.from(next) }, 0)
  }

  function setAllSearchCommandsExcluded(excluded: boolean): void {
    const next = excluded ? new Set(SEARCH_COMMAND_DEFS.map((c) => c.name)) : new Set<CommandName>()
    setExcludedSearchCommands(next)
    window.api.saveConfigEntry('settings', { searchExcludedCommands: Array.from(next) }, 0)
  }

  function openHiddenCommandsScreen(): void {
    setError(null)
    setFilter('')
    setLevel({ kind: 'hiddenCommands' })
  }

  function toggleHiddenCommand(name: CommandName): void {
    setHiddenCommands((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      window.api.saveConfigEntry('settings', { hiddenCommands: Array.from(next) }, 0)
      return next
    })
  }

  function setAllHiddenCommands(hidden: boolean): void {
    const next = hidden ? new Set(COMMANDS.map((c) => c.name)) : new Set<CommandName>()
    setHiddenCommands(next)
    window.api.saveConfigEntry('settings', { hiddenCommands: Array.from(next) }, 0)
  }

  function openDefaultCommandScreen(): void {
    setError(null)
    setFilter('')
    setLevel({ kind: 'defaultCommand' })
  }

  function openCommandLayoutScreen(): void {
    setError(null)
    setFilter('')
    setLevel({ kind: 'commandLayout' })
  }

  function setDefaultCommandChoice(cmd: string): void {
    setDefaultCommand(cmd)
    window.api.saveConfigEntry('settings', { defaultCommand: cmd }, 0)
  }

  function openDockSlotsScreen(): void {
    setError(null)
    setFilter('')
    window.api.getSettings?.().then((s) => {
      if (Array.isArray(s?.shelfIcons) && s.shelfIcons.length > 0) {
        setShelfIcons(s.shelfIcons)
      }
    })
    setLevel({ kind: 'dockSlots' })
  }

  function saveShelfSlots(nextIcons: ShelfModuleId[]): void {
    setShelfIcons(nextIcons)
    window.api.saveConfigEntry('settings', { shelfIcons: nextIcons }, 0)
  }

  function toggleShelfSlot(id: ShelfModuleId): void {
    if (shelfIcons.includes(id)) {
      if (shelfIcons.length <= 1) {
        setError('At least one dock slot must remain active')
        setTimeout(() => setError(null), 3000)
        return
      }
      const next = shelfIcons.filter((m) => m !== id)
      saveShelfSlots(next)
    } else {
      const next = [...shelfIcons, id]
      saveShelfSlots(next)
    }
  }

  function moveShelfSlot(fromIdx: number, direction: -1 | 1): void {
    const toIdx = fromIdx + direction
    if (toIdx < 0 || toIdx >= shelfIcons.length) return
    const next = [...shelfIcons]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    saveShelfSlots(next)
    setActiveIndex(toIdx + DOCK_SLOTS_ACTION_COUNT)
  }

  function resetShelfSlotsToDefault(): void {
    saveShelfSlots([...DEFAULT_SHELF_ICONS])
  }

  function enableAllShelfSlots(): void {
    saveShelfSlots([...ALL_SHELF_MODULES])
  }

  function saveLayout(newLayout: CommandLayout): void {
    setLayout(newLayout)
    window.api.saveCommandLayout(newLayout)
  }

  function moveRootItem(fromIdx: number, direction: -1 | 1): void {
    if (!layout) return
    const toIdx = fromIdx + direction
    if (toIdx < 0 || toIdx >= layout.rootOrder.length) return
    const nextOrder = [...layout.rootOrder]
    const [moved] = nextOrder.splice(fromIdx, 1)
    nextOrder.splice(toIdx, 0, moved)
    saveLayout({ ...layout, rootOrder: nextOrder })
    setActiveIndex(toIdx + COMMAND_LAYOUT_ACTION_COUNT)
  }

  function moveFolderCommand(folderId: string, fromIdx: number, direction: -1 | 1): void {
    if (!layout) return
    const targetFolder = layout.folders.find((f) => f.id === folderId)
    if (!targetFolder) return
    const toIdx = fromIdx + direction
    if (toIdx < 0 || toIdx >= targetFolder.commands.length) return
    const nextCmds = [...targetFolder.commands]
    const [moved] = nextCmds.splice(fromIdx, 1)
    nextCmds.splice(toIdx, 0, moved)
    const nextFolders = layout.folders.map((f) => (f.id === folderId ? { ...f, commands: nextCmds } : f))
    saveLayout({ ...layout, folders: nextFolders })
    setActiveIndex(toIdx + FOLDER_EDIT_ACTION_COUNT)
  }

  function removeCommandFromFolder(folderId: string, cmd: string): void {
    if (!layout) return
    const nextFolders = layout.folders.map((f) =>
      f.id === folderId ? { ...f, commands: f.commands.filter((c) => c !== cmd) } : f
    )
    const nextRootOrder = [...layout.rootOrder]
    if (!nextRootOrder.includes(cmd)) {
      nextRootOrder.push(cmd)
    }
    saveLayout({ ...layout, folders: nextFolders, rootOrder: nextRootOrder })
  }

  function addCommandToFolder(folderId: string, cmd: string): void {
    if (!layout) return
    const nextFolders = layout.folders.map((f) => ({
      ...f,
      commands: f.id === folderId ? [...f.commands.filter((c) => c !== cmd), cmd] : f.commands.filter((c) => c !== cmd)
    }))
    const nextRootOrder = layout.rootOrder.filter((c) => c !== cmd)
    saveLayout({ ...layout, folders: nextFolders, rootOrder: nextRootOrder })
  }

  function deleteFolder(folderId: string): void {
    if (!layout) return
    const targetFolder = layout.folders.find((f) => f.id === folderId)
    if (!targetFolder) return
    const folderIdx = layout.rootOrder.indexOf(folderId)
    const nextRootOrder = layout.rootOrder.filter((id) => id !== folderId)
    if (folderIdx !== -1) {
      nextRootOrder.splice(folderIdx, 0, ...targetFolder.commands)
    } else {
      nextRootOrder.push(...targetFolder.commands)
    }
    const nextFolders = layout.folders.filter((f) => f.id !== folderId)
    saveLayout({ ...layout, folders: nextFolders, rootOrder: nextRootOrder })
    setLevel({ kind: 'commandLayout' })
  }

  function createNewFolder(name: string, icon: string): void {
    if (!layout || !name.trim()) return
    const cleanName = name.trim()
    const folderId = `folder:${cleanName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`
    const newFolder: CommandFolder = {
      id: folderId,
      name: cleanName,
      icon: icon.trim() || '📁',
      commands: []
    }
    const nextFolders = [...layout.folders, newFolder]
    const nextRootOrder = [folderId, ...layout.rootOrder]
    saveLayout({ ...layout, folders: nextFolders, rootOrder: nextRootOrder })
    setNewFolderName('')
    setNewFolderIcon('📁')
    setLevel({ kind: 'commandLayout' })
  }

  const builtinCommandDescriptions = useMemo(() => {
    const map = new Map<string, string>()
    COMMANDS.forEach((c) => map.set(c.name, c.description))
    return map
  }, [])

  const customCommandDescriptions = useMemo(() => {
    const map = new Map<string, string>()
    customCommands.forEach((c) =>
      map.set(
        c.command,
        c.label ? `${c.label} — ${c.action ?? c.folder ?? ''}` : (c.action ?? c.folder ?? 'Custom command')
      )
    )
    return map
  }, [customCommands])

  function getCommandDescription(cmdName: string): string {
    return builtinCommandDescriptions.get(cmdName) ?? customCommandDescriptions.get(cmdName) ?? 'Command'
  }

  const allAvailableCommands = useMemo(() => {
    const set = new Set<string>()
    COMMANDS.forEach((c) => set.add(c.name))
    customCommands.forEach((c) => set.add(c.command))
    return Array.from(set)
  }, [customCommands])

  function openNewEntry(typeDef: ConfigTypeDef): void {
    setError(null)
    setFilter('')
    setLevel({ kind: 'form', typeDef, index: null, draft: emptyDraft(typeDef) })
  }

  function openEditEntry(typeDef: ConfigTypeDef, index: number): void {
    setError(null)
    setFilter('')
    setLevel({ kind: 'form', typeDef, index, draft: { ...entries[index] } })
  }

  function openNewTeamsEntry(typeDef: ConfigTypeDef): void {
    setError(null)
    setFilter('')
    setLevel({ kind: 'form', typeDef, index: null, draft: emptyDraft(typeDef), returnToTeamsManager: true })
  }

  function openEditTeamsEntry(typeDef: ConfigTypeDef, index: number, entry: ConfigEntry): void {
    setError(null)
    setFilter('')
    setLevel({ kind: 'form', typeDef, index, draft: { ...entry }, returnToTeamsManager: true })
  }

  function backOneLevel(): void {
    setError(null)
    setFilter('')
    setActiveIndex(0)
    clearPendingDelete()
    if (level.kind === 'teamsManager') {
      if (initialTarget === 'teams') {
        onExit('/teams ')
      } else {
        setLevel({ kind: 'types' })
      }
      return
    }
    if (level.kind === 'settings') {
      if (initialTarget === 'settings' || initialTarget === 'edit' || initialTarget === 'system') {
        onExit('/')
      } else {
        setLevel({ kind: 'types' })
      }
      return
    }
    if (level.kind === 'form') {
      if (level.returnToTeamsManager) {
        setLevel({ kind: 'teamsManager' })
        return
      }
      if (level.typeDef.singleton) {
        setLevel({ kind: 'types' })
        return
      }
      setLevel({ kind: 'list', typeDef: level.typeDef })
      return
    }
    if (
      level.kind === 'list' ||
      level.kind === 'apps' ||
      level.kind === 'searchCommands' ||
      level.kind === 'hiddenCommands' ||
      level.kind === 'defaultCommand' ||
      level.kind === 'dockSlots' ||
      level.kind === 'commandLayout'
    ) {
      if (initialTarget === 'settings' || initialTarget === 'edit' || initialTarget === 'system') {
        setLevel({ kind: 'settings' })
      } else {
        setLevel({ kind: 'types' })
      }
      return
    }
    if (
      level.kind === 'folderEdit' ||
      level.kind === 'newFolder' ||
      level.kind === 'commandAssignFolder'
    ) {
      setLevel({ kind: 'commandLayout' })
      return
    }
    if (level.kind === 'folderAddCommand') {
      setLevel({ kind: 'folderEdit', folderId: level.folderId })
      return
    }
    onExit('/')
  }

  async function saveDraft(): Promise<void> {
    if (level.kind !== 'form') return
    const { typeDef, index, draft } = level
    const titleValue = draft[typeDef.titleField]
    if (typeof titleValue === 'string' && titleValue.trim() === '') {
      const fieldLabel = typeDef.fields.find((f) => f.key === typeDef.titleField)?.label ?? 'Field'
      setError(`${fieldLabel} is required`)
      return
    }
    await window.api.saveConfigEntry(typeDef.type, draft, index)
    if (level.returnToTeamsManager) {
      setLevel({ kind: 'teamsManager' })
      return
    }
    if (typeDef.singleton) {
      setLevel({ kind: 'types' })
      return
    }
    setLevel({ kind: 'list', typeDef })
  }

  function clearPendingDelete(): void {
    if (pendingDeleteTimeoutRef.current) {
      clearTimeout(pendingDeleteTimeoutRef.current)
      pendingDeleteTimeoutRef.current = null
    }
    setPendingDeleteIndex(null)
    setPendingTeamsDeleteKey(null)
  }

  async function deleteEntryAt(typeDef: ConfigTypeDef, index: number): Promise<void> {
    await window.api.deleteConfigEntry(typeDef.type, index)
    clearPendingDelete()
    loadEntries(typeDef)
  }

  async function deleteTeamsItemAt(typeDef: ConfigTypeDef, index: number): Promise<void> {
    await window.api.deleteConfigEntry(typeDef.type, index)
    clearPendingDelete()
    loadTeamsManagerEntries()
  }

  function requestTeamsItemDelete(typeDef: ConfigTypeDef, index: number, itemKey: string): void {
    if (pendingTeamsDeleteKey === itemKey) {
      deleteTeamsItemAt(typeDef, index)
      return
    }
    if (pendingDeleteTimeoutRef.current) clearTimeout(pendingDeleteTimeoutRef.current)
    setPendingTeamsDeleteKey(itemKey)
    pendingDeleteTimeoutRef.current = setTimeout(() => {
      pendingDeleteTimeoutRef.current = null
      setPendingTeamsDeleteKey(null)
    }, 3000)
  }

  // First call arms the row (and auto-disarms after 3s); the matching second call — on the
  // already-armed row — actually deletes.
  function requestDelete(typeDef: ConfigTypeDef, index: number): void {
    if (pendingDeleteIndex === index) {
      deleteEntryAt(typeDef, index)
      return
    }
    if (pendingDeleteTimeoutRef.current) clearTimeout(pendingDeleteTimeoutRef.current)
    setPendingDeleteIndex(index)
    pendingDeleteTimeoutRef.current = setTimeout(() => {
      pendingDeleteTimeoutRef.current = null
      setPendingDeleteIndex(null)
    }, 3000)
  }

  // Every filterable list below is built the same way CommandPalette.tsx builds `items`:
  // a flat array of rows with their own onSelect, fuzzy-filtered by whatever's typed into
  // the top input. Keeps "/settings" navigation (arrows/Enter over `rows`) and rendering in sync
  // by construction — no separate index bookkeeping to keep aligned with a filtered view.
  const typesRows: Row[] = useMemo(() => {
    if (level.kind !== 'types') return []
    return fuzzyFilter(
    [
      ...CONFIG_TYPES.map((t) => {
        const needle = filter.trim().toLowerCase()
        const matchedField = needle
          ? t.fields?.find(
              (f) =>
                f.label.toLowerCase().includes(needle) ||
                f.key.toLowerCase().includes(needle)
            )
          : undefined
        return {
          key: t.type,
          label: t.label,
          sublabel: matchedField ? `${t.description} · Matches: ${matchedField.label}` : t.description,
          keywords: t.fields ? t.fields.map((f) => `${f.label} ${f.key}`).join(' ') : '',
          onSelect: () => {
            if (t.type === 'settings') {
              setError(null)
              setFilter('')
              setLevel({ kind: 'settings' })
            } else {
              openTypeList(t, matchedField?.key)
            }
          }
        }
      }),
      {
        key: '__apps',
        label: APPS_ROW_LABEL,
        sublabel: APPS_ROW_DESCRIPTION,
        keywords: 'applications visibility launcher show hide filter apps',
        onSelect: openAppsScreen
      },
      {
        key: '__searchCommands',
        label: SEARCH_COMMANDS_ROW_LABEL,
        sublabel: SEARCH_COMMANDS_ROW_DESCRIPTION,
        keywords: 'search fanout commands include exclude query',
        onSelect: openSearchCommandsScreen
      },
      {
        key: '__hiddenCommands',
        label: HIDDEN_COMMANDS_ROW_LABEL,
        sublabel: HIDDEN_COMMANDS_ROW_DESCRIPTION,
        keywords: 'hide show palette commands visibility toggle ui',
        onSelect: openHiddenCommandsScreen
      },
      {
        key: '__defaultCommand',
        label: DEFAULT_COMMAND_ROW_LABEL,
        sublabel: DEFAULT_COMMAND_ROW_DESCRIPTION,
        keywords: 'default priority suggestions order initial fallback',
        onSelect: openDefaultCommandScreen
      },
      {
        key: '__dockSlots',
        label: DOCK_SLOTS_ROW_LABEL,
        sublabel: DOCK_SLOTS_ROW_DESCRIPTION,
        keywords: 'dock shelf icons slots modules tray order reorder buttons bar term notify settings focus git profile',
        onSelect: openDockSlotsScreen
      },
      {
        key: '__commandLayout',
        label: COMMAND_LAYOUT_ROW_LABEL,
        sublabel: COMMAND_LAYOUT_ROW_DESCRIPTION,
        keywords: 'command layout rearrange reorder folders subfolders categories move order commands json preferences',
        onSelect: openCommandLayoutScreen
      },
      {
        key: '__openConfigFolder',
        label: 'Open Config Folder',
        sublabel: 'Open %USERPROFILE%\\.sudolaunch in File Explorer',
        keywords: 'folder explorer directory path config json configuration files',
        onSelect: () => window.api.openConfigFolder()
      }
    ],
    ['label', 'sublabel', 'keywords'],
    filter
    )
  }, [
    level.kind,
    filter,
    openAppsScreen,
    openSearchCommandsScreen,
    openHiddenCommandsScreen,
    openDefaultCommandScreen,
    openDockSlotsScreen,
    openCommandLayoutScreen
  ])

  const settingsRows = useMemo((): SettingRow[] => {
    if (!settings) return []

    return [
      {
        key: 'dockLayout',
        label: 'Dock Layout',
        sublabel: 'Arrangement of the floating dock on screen · ↵ to cycle',
        badge: (settings.dockLayout ?? 'shelf').charAt(0).toUpperCase() + (settings.dockLayout ?? 'shelf').slice(1),
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
        badge: (settings.dockGlowStyle ?? 'breathing').charAt(0).toUpperCase() + (settings.dockGlowStyle ?? 'breathing').slice(1),
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
          const next = DOCK_GLOW_STYLES[(idx - 1 + DOCK_GLOW_STYLES.length) % DOCK_GLOW_STYLES.length]
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
        badge: settings.defaultCommand && settings.defaultCommand !== 'none' ? `/${settings.defaultCommand}` : 'None',
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
          const next = DOCK_HOME_POSITIONS[(idx - 1 + DOCK_HOME_POSITIONS.length) % DOCK_HOME_POSITIONS.length]
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
        sublabel: 'Width of the slide-up quick terminal window in pixels · ↵ to cycle',
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
          const next = TERMINAL_WIDTHS[(idx - 1 + TERMINAL_WIDTHS.length) % TERMINAL_WIDTHS.length]
          updateSetting('terminalWidth', next)
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
          const next = TERMINAL_HOTKEYS[(idx - 1 + TERMINAL_HOTKEYS.length) % TERMINAL_HOTKEYS.length]
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
        onSelect: () => {
          const peersDef = CONFIG_TYPES.find((t) => t.type === 'peers')
          if (peersDef) {
            setLevel({ kind: 'list', typeDef: peersDef })
            setFilter('')
            setActiveIndex(0)
          }
        }
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
  }, [
    settings,
    shelfIcons,
    layout,
    updateSetting,
    openDockSlotsScreen,
    openDefaultCommandScreen,
    openCommandLayoutScreen,
    openAppsScreen,
    openSearchCommandsScreen,
    openHiddenCommandsScreen
  ])

  const filteredSettingsRows = useMemo(() => {
    if (level.kind !== 'settings') return []
    if (!filter.trim()) return settingsRows
    return fuzzyFilter(settingsRows, ['label', 'sublabel', 'keywords', 'badge'], filter)
  }, [level.kind, settingsRows, filter])

  const filteredApps = useMemo(
    () => (level.kind === 'apps' ? fuzzyFilter(apps, ['name', 'path'], filter) : apps),
    [level.kind, apps, filter]
  )

  const filteredSearchCommandDefs = useMemo(
    () =>
      level.kind === 'searchCommands'
        ? fuzzyFilter(SEARCH_COMMAND_DEFS, ['name', 'description'], filter)
        : SEARCH_COMMAND_DEFS,
    [level.kind, filter]
  )

  const filteredHiddenCommandDefs = useMemo(
    () => (level.kind === 'hiddenCommands' ? fuzzyFilter(COMMANDS, ['name', 'description'], filter) : COMMANDS),
    [level.kind, filter]
  )

  const filteredDefaultCommandDefs = useMemo(
    () => (level.kind === 'defaultCommand' ? fuzzyFilter(COMMANDS, ['name', 'description'], filter) : COMMANDS),
    [level.kind, filter]
  )

  const dockModulesList = useMemo(() => {
    if (level.kind !== 'dockSlots') return []
    const enabled = shelfIcons.map((id) => ({ id, enabled: true, info: SHELF_MODULE_INFO[id] }))
    const disabled = ALL_SHELF_MODULES.filter((id) => !shelfIcons.includes(id)).map((id) => ({
      id,
      enabled: false,
      info: SHELF_MODULE_INFO[id]
    }))
    const combined = [...enabled, ...disabled]
    if (!filter.trim()) return combined
    const q = filter.trim().toLowerCase()
    return combined.filter(
      (m) =>
        m.info.name.toLowerCase().includes(q) ||
        m.info.description.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q)
    )
  }, [level.kind, shelfIcons, filter])

  const filteredRootItems = useMemo(() => {
    if (!layout || level.kind !== 'commandLayout') return []
    if (!filter.trim()) return layout.rootOrder
    const needle = filter.trim().toLowerCase()
    return layout.rootOrder.filter((item: string) => {
      const folder = layout.folders.find((f) => f.id === item)
      if (folder) {
        return (
          folder.name.toLowerCase().includes(needle) ||
          folder.commands.some((c: string) => c.toLowerCase().includes(needle))
        )
      }
      return item.toLowerCase().includes(needle)
    })
  }, [layout, level.kind, filter])

  const filteredFolderCommands = useMemo(() => {
    if (!layout || level.kind !== 'folderEdit') return []
    const folder = layout.folders.find((f) => f.id === level.folderId)
    if (!folder) return []
    if (!filter.trim()) return folder.commands
    const needle = filter.trim().toLowerCase()
    return folder.commands.filter((c: string) => c.toLowerCase().includes(needle))
  }, [layout, level, filter])

  const filteredEntries =
    level.kind === 'list'
      ? fuzzyFilter(
          entries.map((entry, originalIndex) => ({ entry, originalIndex })),
          [`entry.${level.typeDef.titleField}`, ...(level.typeDef.subtitleField ? [`entry.${level.typeDef.subtitleField}`] : [])],
          filter
        )
      : []

  const contactsTypeDef = useMemo(() => CONFIG_TYPES.find((t) => t.type === 'contacts')!, [])
  const teamLinksTypeDef = useMemo(() => CONFIG_TYPES.find((t) => t.type === 'teamLinks')!, [])

  const filteredTeamsManagerItems = useMemo(() => {
    if (level.kind !== 'teamsManager') return []
    const combined = [
      ...teamContacts.map((entry, originalIndex) => ({
        key: `contact-${originalIndex}`,
        kind: 'contact' as const,
        badge: 'Person',
        typeDef: contactsTypeDef,
        entry,
        originalIndex,
        title: String(entry.name ?? '(untitled)'),
        subtitle: String(entry.email ?? '')
      })),
      ...teamLinksList.map((entry, originalIndex) => ({
        key: `team-${originalIndex}`,
        kind: 'team' as const,
        badge: 'Team',
        typeDef: teamLinksTypeDef,
        entry,
        originalIndex,
        title: String(entry.name ?? '(untitled)'),
        subtitle: String(entry.url ?? '')
      }))
    ]
    return fuzzyFilter(combined, ['title', 'subtitle', 'badge'], filter)
  }, [level.kind, teamContacts, teamLinksList, contactsTypeDef, teamLinksTypeDef, filter])

  function handleRootKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (filter !== '' && level.kind !== 'form') {
        setFilter('')
        setActiveIndex(0)
        return
      }
      backOneLevel()
      return
    }
    // Backspace only navigates back once the filter is already empty — otherwise it just
    // deletes a character, same as any text input (and same as the form fields below).
    if (e.key === 'Backspace' && filter === '' && level.kind !== 'form') {
      e.preventDefault()
      backOneLevel()
      return
    }
    if (level.kind === 'settings') {
      const lastIndex = filteredSettingsRows.length - 1
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(lastIndex, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        filteredSettingsRows[activeIndex]?.onSelect()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        filteredSettingsRows[activeIndex]?.onSelect()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (filteredSettingsRows[activeIndex]?.onCycleBackward) {
          filteredSettingsRows[activeIndex].onCycleBackward!()
        } else {
          filteredSettingsRows[activeIndex]?.onSelect()
        }
      }
    } else if (level.kind === 'types') {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(typesRows.length - 1, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        typesRows[activeIndex]?.onSelect()
      }
    } else if (level.kind === 'apps') {
      const lastIndex = filteredApps.length + APPS_ACTION_COUNT - 1
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(lastIndex, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (activeIndex === 0) setAllAppsDisabled(false)
        else if (activeIndex === 1) setAllAppsDisabled(true)
        else {
          const entry = filteredApps[activeIndex - APPS_ACTION_COUNT]
          if (entry) toggleAppDisabled(entry.path)
        }
      }
    } else if (level.kind === 'searchCommands') {
      const lastIndex = filteredSearchCommandDefs.length + SEARCH_COMMANDS_ACTION_COUNT - 1
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(lastIndex, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (activeIndex === 0) resetSearchCommandsToDefault()
        else if (activeIndex === 1) setAllSearchCommandsExcluded(false)
        else if (activeIndex === 2) setAllSearchCommandsExcluded(true)
        else {
          const def = filteredSearchCommandDefs[activeIndex - SEARCH_COMMANDS_ACTION_COUNT]
          if (def) toggleSearchCommandExcluded(def.name)
        }
      }
    } else if (level.kind === 'hiddenCommands') {
      const lastIndex = filteredHiddenCommandDefs.length + HIDDEN_COMMANDS_ACTION_COUNT - 1
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(lastIndex, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (activeIndex === 0) setAllHiddenCommands(false)
        else if (activeIndex === 1) setAllHiddenCommands(true)
        else {
          const def = filteredHiddenCommandDefs[activeIndex - HIDDEN_COMMANDS_ACTION_COUNT]
          if (def) toggleHiddenCommand(def.name)
        }
      }
    } else if (level.kind === 'defaultCommand') {
      const lastIndex = filteredDefaultCommandDefs.length // 0 is "Clear default", 1+ are commands
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(lastIndex, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (activeIndex === 0) setDefaultCommandChoice('')
        else {
          const def = filteredDefaultCommandDefs[activeIndex - 1]
          if (def) setDefaultCommandChoice(def.name)
        }
      }
    } else if (level.kind === 'dockSlots') {
      const lastIndex = dockModulesList.length + DOCK_SLOTS_ACTION_COUNT - 1
      if (e.altKey && e.key === 'ArrowUp' && activeIndex >= DOCK_SLOTS_ACTION_COUNT) {
        e.preventDefault()
        const slotIdx = activeIndex - DOCK_SLOTS_ACTION_COUNT
        if (slotIdx < shelfIcons.length) {
          moveShelfSlot(slotIdx, -1)
        }
      } else if (e.altKey && e.key === 'ArrowDown' && activeIndex >= DOCK_SLOTS_ACTION_COUNT) {
        e.preventDefault()
        const slotIdx = activeIndex - DOCK_SLOTS_ACTION_COUNT
        if (slotIdx < shelfIcons.length) {
          moveShelfSlot(slotIdx, 1)
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(lastIndex, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (activeIndex === 0) {
          resetShelfSlotsToDefault()
        } else if (activeIndex === 1) {
          enableAllShelfSlots()
        } else {
          const item = dockModulesList[activeIndex - DOCK_SLOTS_ACTION_COUNT]
          if (item) toggleShelfSlot(item.id)
        }
      }
    } else if (level.kind === 'commandLayout') {
      const lastIndex = filteredRootItems.length + COMMAND_LAYOUT_ACTION_COUNT - 1
      if (e.altKey && e.key === 'ArrowUp' && activeIndex >= COMMAND_LAYOUT_ACTION_COUNT) {
        e.preventDefault()
        moveRootItem(activeIndex - COMMAND_LAYOUT_ACTION_COUNT, -1)
      } else if (e.altKey && e.key === 'ArrowDown' && activeIndex >= COMMAND_LAYOUT_ACTION_COUNT) {
        e.preventDefault()
        moveRootItem(activeIndex - COMMAND_LAYOUT_ACTION_COUNT, 1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(lastIndex, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (activeIndex === 0) {
          setLevel({ kind: 'newFolder' })
        } else if (activeIndex === 1) {
          window.api.openCommandLayoutFile()
        } else if (activeIndex === 2) {
          saveLayout(JSON.parse(JSON.stringify(DEFAULT_COMMAND_LAYOUT)))
        } else {
          const item = filteredRootItems[activeIndex - COMMAND_LAYOUT_ACTION_COUNT]
          if (item) {
            const folder = layout?.folders.find((f) => f.id === item)
            if (folder) {
              setLevel({ kind: 'folderEdit', folderId: folder.id })
            } else {
              setLevel({ kind: 'commandAssignFolder', commandName: item })
            }
          }
        }
      }
    } else if (level.kind === 'folderEdit') {
      const folder = layout?.folders.find((f) => f.id === level.folderId)
      const folderCmds = folder ? folder.commands : []
      const lastIndex = folderCmds.length + FOLDER_EDIT_ACTION_COUNT - 1
      if (e.altKey && e.key === 'ArrowUp' && activeIndex >= FOLDER_EDIT_ACTION_COUNT) {
        e.preventDefault()
        moveFolderCommand(level.folderId, activeIndex - FOLDER_EDIT_ACTION_COUNT, -1)
      } else if (e.altKey && e.key === 'ArrowDown' && activeIndex >= FOLDER_EDIT_ACTION_COUNT) {
        e.preventDefault()
        moveFolderCommand(level.folderId, activeIndex - FOLDER_EDIT_ACTION_COUNT, 1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(lastIndex, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (activeIndex === 0) {
          setLevel({ kind: 'commandLayout' })
        } else if (activeIndex === 1) {
          setLevel({ kind: 'folderAddCommand', folderId: level.folderId })
        } else if (activeIndex === 2) {
          deleteFolder(level.folderId)
        }
      }
    } else if (level.kind === 'folderAddCommand') {
      const currentFolder = layout.folders.find((f) => f.id === level.folderId)
      const available = allAvailableCommands.filter((cmd: string) => currentFolder && !currentFolder.commands.includes(cmd))
      const count = available.length
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(count - 1, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const cmd = available[activeIndex]
        if (cmd) {
          addCommandToFolder(level.folderId, cmd)
          setLevel({ kind: 'folderEdit', folderId: level.folderId })
        }
      }
    } else if (level.kind === 'commandAssignFolder') {
      const count = 1 + layout.folders.length
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(count - 1, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (activeIndex === 0) {
          const nextFolders = layout.folders.map((f) => ({
            ...f,
            commands: f.commands.filter((c) => c !== level.commandName)
          }))
          const nextRoot = layout.rootOrder.includes(level.commandName)
            ? layout.rootOrder
            : [...layout.rootOrder, level.commandName]
          saveLayout({ ...layout, folders: nextFolders, rootOrder: nextRoot })
        } else {
          const folder = layout.folders[activeIndex - 1]
          if (folder) {
            addCommandToFolder(folder.id, level.commandName)
          }
        }
        setLevel({ kind: 'commandLayout' })
      }
    } else if (level.kind === 'teamsManager') {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        backOneLevel()
        return
      }
      const count = TEAMS_MANAGER_ACTION_COUNT + filteredTeamsManagerItems.length
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(count - 1, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (activeIndex === 0) {
          openNewTeamsEntry(contactsTypeDef)
        } else if (activeIndex === 1) {
          openNewTeamsEntry(teamLinksTypeDef)
        } else {
          const target = filteredTeamsManagerItems[activeIndex - TEAMS_MANAGER_ACTION_COUNT]
          if (target) openEditTeamsEntry(target.typeDef, target.originalIndex, target.entry)
        }
      } else if (e.key === 'Delete' && activeIndex >= TEAMS_MANAGER_ACTION_COUNT) {
        e.preventDefault()
        const target = filteredTeamsManagerItems[activeIndex - TEAMS_MANAGER_ACTION_COUNT]
        if (target) requestTeamsItemDelete(target.typeDef, target.originalIndex, target.key)
      }
    } else if (level.kind === 'list') {
      const count = filteredEntries.length + 1 // +1 for "Add new"
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, count - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (activeIndex === filteredEntries.length) openNewEntry(level.typeDef)
        else {
          const target = filteredEntries[activeIndex]
          if (target) openEditEntry(level.typeDef, target.originalIndex)
        }
      } else if (e.key === 'Delete' && activeIndex < filteredEntries.length) {
        e.preventDefault()
        const target = filteredEntries[activeIndex]
        if (target) requestDelete(level.typeDef, target.originalIndex)
      }
    }
  }

  const breadcrumb =
    '// ' +
    (level.kind === 'settings'
      ? 'Settings'
      : level.kind === 'apps'
        ? APPS_ROW_LABEL
        : level.kind === 'searchCommands'
          ? SEARCH_COMMANDS_ROW_LABEL
          : level.kind === 'hiddenCommands'
            ? HIDDEN_COMMANDS_ROW_LABEL
            : level.kind === 'defaultCommand'
              ? DEFAULT_COMMAND_ROW_LABEL
              : level.kind === 'dockSlots'
                ? DOCK_SLOTS_ROW_LABEL
                : level.kind === 'commandLayout'
                ? COMMAND_LAYOUT_ROW_LABEL
                : level.kind === 'folderEdit'
                  ? `Command Layout / ${layout?.folders.find((f) => f.id === level.folderId)?.name ?? 'Folder'}`
                  : level.kind === 'folderAddCommand'
                    ? `Command Layout / ${layout?.folders.find((f) => f.id === level.folderId)?.name ?? 'Folder'} / Add Command`
                    : level.kind === 'commandAssignFolder'
                      ? `Command Layout / /${level.commandName} / Move to Folder`
                      : level.kind === 'newFolder'
                        ? 'Command Layout / Create Folder'
                        : level.kind === 'teamsManager'
                          ? TEAMS_MANAGER_ROW_LABEL
                          : level.kind !== 'types'
                            ? level.typeDef.label
                            : '') +
    (level.kind === 'form' ? (level.index === null ? ' / New' : ' / Edit') : '')

  return (
    <div
      className="config-manager"
      onKeyDown={handleRootKeyDown}
      onMouseDown={(e) => {
        if (
          e.target !== filterRef.current &&
          !(e.target instanceof HTMLInputElement) &&
          !(e.target instanceof HTMLTextAreaElement) &&
          !(e.target instanceof HTMLButtonElement)
        ) {
          e.preventDefault()
          filterRef.current?.focus()
        }
      }}
    >
      <input
        ref={filterRef}
        className="palette-input"
        value={filter}
        placeholder={
          level.kind === 'settings'
            ? filteredSettingsRows[activeIndex]
              ? `↵ ${filteredSettingsRows[activeIndex].label}: ${filteredSettingsRows[activeIndex].sublabel}`
              : '/settings — type to filter...'
            : level.kind === 'types'
              ? '/settings — type to filter config...'
              : level.kind === 'form'
                ? breadcrumb
                : `${breadcrumb} — type to filter...`
        }
        onChange={(e) => {
          const val = e.target.value
          if (level.kind === 'settings' || level.kind === 'types') {
            if (val.startsWith('/settings ') || val.startsWith('/config ')) {
              const spaceIdx = val.indexOf(' ')
              setFilter(val.slice(spaceIdx + 1))
              setActiveIndex(0)
            } else if (val === '/settings' || val === '/config') {
              setFilter('')
              setActiveIndex(0)
            } else if (val.startsWith('/settings') || val.startsWith('/config')) {
              const prefix = val.startsWith('/settings') ? '/settings' : '/config'
              setFilter(val.slice(prefix.length).trim())
              setActiveIndex(0)
            } else if (val.startsWith('/') && val !== '/') {
              onExit(val)
            } else if (val === '/') {
              onExit('/')
            } else {
              setFilter(val)
              setActiveIndex(0)
            }
          } else {
            setFilter(val)
            setActiveIndex(0)
          }
        }}
      />
      {error && <div className="palette-banner">{error}</div>}

      {level.kind === 'types' && (
        <ul className={disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}>
          {typesRows.length === 0 && <li className="palette-empty">No results</li>}
          {typesRows.map((row, idx) => (
            <li
              key={row.key}
              ref={idx === activeIndex ? activeItemRef : undefined}
              className={idx === activeIndex ? 'palette-item active' : 'palette-item'}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={row.onSelect}
            >
              <span className="palette-item-text">
                <span className="palette-item-label">{row.label}</span>
                <span className="palette-item-sublabel">{row.sublabel}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {level.kind === 'settings' && (
        <ul className={disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}>
          {filteredSettingsRows.length === 0 && <li className="palette-empty">No matching settings</li>}
          {filteredSettingsRows.map((row, idx) => (
            <li
              key={row.key}
              ref={idx === activeIndex ? activeItemRef : undefined}
              className={idx === activeIndex ? 'palette-item active' : 'palette-item'}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={row.onSelect}
            >
              <span className="palette-item-text">
                <span className="palette-item-label">{row.label}</span>
                <span className="palette-item-sublabel">{row.sublabel}</span>
              </span>
              {row.badge && (
                <span
                  className={
                    row.badgeType === 'toggle-on'
                      ? 'config-toggle-badge config-toggle-on'
                      : row.badgeType === 'toggle-off'
                        ? 'config-toggle-badge config-toggle-off'
                        : 'config-value-badge'
                  }
                >
                  {row.badgeType === 'color' && (
                    <span
                      className="config-color-swatch"
                      style={{ backgroundColor: row.badge, color: row.badge }}
                    />
                  )}
                  {row.badge}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {level.kind === 'searchCommands' && (
        <ul className={disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}>
          <li
            ref={activeIndex === 0 ? activeItemRef : undefined}
            className={activeIndex === 0 ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(0)}
            onClick={() => resetSearchCommandsToDefault()}
          >
            <span className="palette-item-text">
              <span className="palette-item-label">↺ Reset to recommended fast defaults</span>
              <span className="palette-item-sublabel">Exclude heavy system, process, hardware, environment, and generator commands</span>
            </span>
          </li>
          <li
            ref={activeIndex === 1 ? activeItemRef : undefined}
            className={activeIndex === 1 ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(1)}
            onClick={() => setAllSearchCommandsExcluded(false)}
          >
            <span className="palette-item-label">Select all (include all in /search)</span>
          </li>
          <li
            ref={activeIndex === 2 ? activeItemRef : undefined}
            className={activeIndex === 2 ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(2)}
            onClick={() => setAllSearchCommandsExcluded(true)}
          >
            <span className="palette-item-label">Select none (exclude all from /search)</span>
          </li>
          {filteredSearchCommandDefs.length === 0 && <li className="palette-empty">No results</li>}
          {filteredSearchCommandDefs.map((c, idx) => (
            <li
              key={c.name}
              ref={idx + SEARCH_COMMANDS_ACTION_COUNT === activeIndex ? activeItemRef : undefined}
              className={
                idx + SEARCH_COMMANDS_ACTION_COUNT === activeIndex ? 'palette-item active' : 'palette-item'
              }
              onMouseEnter={() => setActiveIndex(idx + SEARCH_COMMANDS_ACTION_COUNT)}
              onClick={() => toggleSearchCommandExcluded(c.name)}
            >
              <span className="palette-item-text">
                <span className="palette-item-label">/{c.name}</span>
                <span className="palette-item-sublabel">{c.description}{c.excludeFromSearch ? ' · Excluded by default' : ''}</span>
              </span>
              <span className={`config-toggle-badge ${!excludedSearchCommands.has(c.name) ? 'config-toggle-on' : 'config-toggle-off'}`}>
                {!excludedSearchCommands.has(c.name) ? 'Included' : 'Excluded'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {level.kind === 'hiddenCommands' && (
        <ul className={disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}>
          <li
            ref={activeIndex === 0 ? activeItemRef : undefined}
            className={activeIndex === 0 ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(0)}
            onClick={() => setAllHiddenCommands(false)}
          >
            <span className="palette-item-label">Select all (show all in UI)</span>
          </li>
          <li
            ref={activeIndex === 1 ? activeItemRef : undefined}
            className={activeIndex === 1 ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(1)}
            onClick={() => setAllHiddenCommands(true)}
          >
            <span className="palette-item-label">Select none (hide all in UI)</span>
          </li>
          {filteredHiddenCommandDefs.length === 0 && <li className="palette-empty">No results</li>}
          {filteredHiddenCommandDefs.map((c, idx) => (
            <li
              key={c.name}
              ref={idx + HIDDEN_COMMANDS_ACTION_COUNT === activeIndex ? activeItemRef : undefined}
              className={
                idx + HIDDEN_COMMANDS_ACTION_COUNT === activeIndex ? 'palette-item active' : 'palette-item'
              }
              onMouseEnter={() => setActiveIndex(idx + HIDDEN_COMMANDS_ACTION_COUNT)}
              onClick={() => toggleHiddenCommand(c.name)}
            >
              <span className="palette-item-text">
                <span className="palette-item-label">/{c.name}</span>
                <span className="palette-item-sublabel">{c.description}</span>
              </span>
              <span className={`config-toggle-badge ${!hiddenCommands.has(c.name) ? 'config-toggle-on' : 'config-toggle-off'}`}>
                {!hiddenCommands.has(c.name) ? 'Visible' : 'Hidden'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {level.kind === 'defaultCommand' && (
        <ul className={disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}>
          <li
            ref={activeIndex === 0 ? activeItemRef : undefined}
            className={activeIndex === 0 ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(0)}
            onClick={() => setDefaultCommandChoice('')}
          >
            <span className="palette-item-text">
              <span className="palette-item-label">None (default sorting)</span>
              <span className="palette-item-sublabel">Clear default command priority</span>
            </span>
            <span className={`config-toggle-badge ${!defaultCommand ? 'config-toggle-on' : 'config-toggle-off'}`}>
              {!defaultCommand ? 'Active' : ''}
            </span>
          </li>
          {filteredDefaultCommandDefs.length === 0 && <li className="palette-empty">No results</li>}
          {filteredDefaultCommandDefs.map((c, idx) => (
            <li
              key={c.name}
              ref={idx + 1 === activeIndex ? activeItemRef : undefined}
              className={idx + 1 === activeIndex ? 'palette-item active' : 'palette-item'}
              onMouseEnter={() => setActiveIndex(idx + 1)}
              onClick={() => setDefaultCommandChoice(c.name)}
            >
              <span className="palette-item-text">
                <span className="palette-item-label">/{c.name}</span>
                <span className="palette-item-sublabel">{c.description}</span>
              </span>
              <span className={`config-toggle-badge ${defaultCommand === c.name ? 'config-toggle-on' : 'config-toggle-off'}`}>
                {defaultCommand === c.name ? 'Default' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {level.kind === 'dockSlots' && (
        <ul className={disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}>
          <li
            ref={activeIndex === 0 ? activeItemRef : undefined}
            className={activeIndex === 0 ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(0)}
            onClick={resetShelfSlotsToDefault}
          >
            <span className="palette-item-text">
              <span className="palette-item-label">↺ Reset to Default Order & Slots</span>
              <span className="palette-item-sublabel">Restore standard 7 modules in default arrangement</span>
            </span>
          </li>
          <li
            ref={activeIndex === 1 ? activeItemRef : undefined}
            className={activeIndex === 1 ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(1)}
            onClick={enableAllShelfSlots}
          >
            <span className="palette-item-text">
              <span className="palette-item-label">✓ Enable All Modules</span>
              <span className="palette-item-sublabel">Turn on all 7 available dock tray modules</span>
            </span>
          </li>
          {dockModulesList.length === 0 && <li className="palette-empty">No matching dock modules found</li>}
          {dockModulesList.map((item, idx) => {
            const itemIdx = idx + DOCK_SLOTS_ACTION_COUNT
            const isActive = itemIdx === activeIndex
            const isEnabled = item.enabled
            const enabledIdx = isEnabled ? shelfIcons.indexOf(item.id) : -1
            return (
              <li
                key={item.id}
                ref={isActive ? activeItemRef : undefined}
                className={isActive ? 'palette-item active' : 'palette-item'}
                onMouseEnter={() => setActiveIndex(itemIdx)}
                onClick={() => toggleShelfSlot(item.id)}
              >
                <span className="palette-item-text">
                  <span className="palette-item-label">
                    <span style={{ display: 'inline-block', width: 28, textAlign: 'center', marginRight: 6 }}>
                      {item.info.icon}
                    </span>
                    {item.info.name}
                  </span>
                  <span className="palette-item-sublabel">{item.info.description}</span>
                </span>
                <div className="config-item-actions" onClick={(e) => e.stopPropagation()}>
                  {isEnabled && (
                    <>
                      <button
                        type="button"
                        className="config-action-btn"
                        title="Move Left / Earlier in Tray (Alt+Up)"
                        disabled={enabledIdx === 0}
                        onClick={() => moveShelfSlot(enabledIdx, -1)}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="config-action-btn"
                        title="Move Right / Later in Tray (Alt+Down)"
                        disabled={enabledIdx === shelfIcons.length - 1}
                        onClick={() => moveShelfSlot(enabledIdx, 1)}
                      >
                        ▼
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className={`config-toggle-badge config-toggle-button ${isEnabled ? 'config-toggle-on' : 'config-toggle-off'}`}
                    onClick={() => toggleShelfSlot(item.id)}
                  >
                    {isEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {level.kind === 'apps' && (
        <ul className={disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}>
          <li
            ref={activeIndex === 0 ? activeItemRef : undefined}
            className={activeIndex === 0 ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(0)}
            onClick={() => setAllAppsDisabled(false)}
          >
            <span className="palette-item-label">Select all</span>
          </li>
          <li
            ref={activeIndex === 1 ? activeItemRef : undefined}
            className={activeIndex === 1 ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(1)}
            onClick={() => setAllAppsDisabled(true)}
          >
            <span className="palette-item-label">Select none</span>
          </li>
          {filteredApps.length === 0 && <li className="palette-empty">No apps found</li>}
          {filteredApps.map((a, idx) => (
            <li
              key={a.path}
              ref={idx + APPS_ACTION_COUNT === activeIndex ? activeItemRef : undefined}
              className={idx + APPS_ACTION_COUNT === activeIndex ? 'palette-item active' : 'palette-item'}
              onMouseEnter={() => setActiveIndex(idx + APPS_ACTION_COUNT)}
              onClick={() => toggleAppDisabled(a.path)}
            >
              <span className="palette-item-text">
                <span className="palette-item-label">{a.name}</span>
                <span className="palette-item-sublabel">{a.path}</span>
              </span>
              <span className={`config-toggle-badge ${!disabledApps.has(a.path) ? 'config-toggle-on' : 'config-toggle-off'}`}>
                {!disabledApps.has(a.path) ? 'Shown' : 'Hidden'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {level.kind === 'commandLayout' && (
        <ul className={disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}>
          <li
            ref={activeIndex === 0 ? activeItemRef : undefined}
            className={activeIndex === 0 ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(0)}
            onClick={() => setLevel({ kind: 'newFolder' })}
          >
            <span className="palette-item-label">+ Create New Folder</span>
          </li>
          <li
            ref={activeIndex === 1 ? activeItemRef : undefined}
            className={activeIndex === 1 ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(1)}
            onClick={() => window.api.openCommandLayoutFile()}
          >
            <span className="palette-item-text">
              <span className="palette-item-label">📄 Open command-layout.json</span>
              <span className="palette-item-sublabel">Open raw configuration in text editor</span>
            </span>
          </li>
          <li
            ref={activeIndex === 2 ? activeItemRef : undefined}
            className={activeIndex === 2 ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(2)}
            onClick={() => saveLayout(JSON.parse(JSON.stringify(DEFAULT_COMMAND_LAYOUT)))}
          >
            <span className="palette-item-text">
              <span className="palette-item-label">↺ Reset Layout to Defaults</span>
              <span className="palette-item-sublabel">Restore default folders and order</span>
            </span>
          </li>
          {filteredRootItems.length === 0 && <li className="palette-empty">No matching commands or folders</li>}
          {filteredRootItems.map((item: string, idx: number) => {
            const folder = layout.folders.find((f) => f.id === item)
            const realIdx = layout.rootOrder.indexOf(item)
            const itemIdx = idx + COMMAND_LAYOUT_ACTION_COUNT
            const isActive = itemIdx === activeIndex
            if (folder) {
              return (
                <li
                  key={folder.id}
                  ref={isActive ? activeItemRef : undefined}
                  className={isActive ? 'palette-item active' : 'palette-item'}
                  onMouseEnter={() => setActiveIndex(itemIdx)}
                  onClick={() => setLevel({ kind: 'folderEdit', folderId: folder.id })}
                >
                  <span className="palette-item-text">
                    <span className="palette-item-label">{folder.icon ?? '📁'} {folder.name}</span>
                    <span className="palette-item-sublabel">
                      Folder ({folder.commands.length} commands) · {folder.commands.slice(0, 4).map((c) => '/' + c).join(', ')}{folder.commands.length > 4 ? '...' : ''}
                    </span>
                  </span>
                  <div className="config-item-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="config-action-btn"
                      title="Move Up (Alt+Up)"
                      disabled={realIdx === 0}
                      onClick={() => moveRootItem(realIdx, -1)}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="config-action-btn"
                      title="Move Down (Alt+Down)"
                      disabled={realIdx === layout.rootOrder.length - 1}
                      onClick={() => moveRootItem(realIdx, 1)}
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      className="config-action-btn"
                      title="Edit Folder"
                      onClick={() => setLevel({ kind: 'folderEdit', folderId: folder.id })}
                    >
                      Edit
                    </button>
                  </div>
                </li>
              )
            }
            return (
              <li
                key={item}
                ref={isActive ? activeItemRef : undefined}
                className={isActive ? 'palette-item active' : 'palette-item'}
                onMouseEnter={() => setActiveIndex(itemIdx)}
                onClick={() => setLevel({ kind: 'commandAssignFolder', commandName: item })}
              >
                <span className="palette-item-text">
                  <span className="palette-item-label">/{item}</span>
                  <span className="palette-item-sublabel">{getCommandDescription(item)}</span>
                </span>
                <div className="config-item-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="config-action-btn"
                    title="Move Up (Alt+Up)"
                    disabled={realIdx === 0}
                    onClick={() => moveRootItem(realIdx, -1)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="config-action-btn"
                    title="Move Down (Alt+Down)"
                    disabled={realIdx === layout.rootOrder.length - 1}
                    onClick={() => moveRootItem(realIdx, 1)}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="config-action-btn"
                    title="Move into Folder"
                    onClick={() => setLevel({ kind: 'commandAssignFolder', commandName: item })}
                  >
                    Move to...
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {level.kind === 'folderEdit' && (() => {
        const folder = layout.folders.find((f) => f.id === level.folderId)
        if (!folder) return <div className="palette-empty">Folder not found</div>
        return (
          <ul className={disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}>
            <li
              ref={activeIndex === 0 ? activeItemRef : undefined}
              className={activeIndex === 0 ? 'palette-item active' : 'palette-item'}
              onMouseEnter={() => setActiveIndex(0)}
              onClick={() => setLevel({ kind: 'commandLayout' })}
            >
              <span className="palette-item-label">← Back to Command Layout</span>
            </li>
            <li
              ref={activeIndex === 1 ? activeItemRef : undefined}
              className={activeIndex === 1 ? 'palette-item active' : 'palette-item'}
              onMouseEnter={() => setActiveIndex(1)}
              onClick={() => setLevel({ kind: 'folderAddCommand', folderId: level.folderId })}
            >
              <span className="palette-item-label">+ Add Command to this Folder</span>
            </li>
            <li
              ref={activeIndex === 2 ? activeItemRef : undefined}
              className={activeIndex === 2 ? 'palette-item active' : 'palette-item'}
              onMouseEnter={() => setActiveIndex(2)}
              onClick={() => deleteFolder(level.folderId)}
            >
              <span className="palette-item-label" style={{ color: '#ff6b5b' }}>✕ Dissolve Folder (Move commands to Root)</span>
            </li>
            {filteredFolderCommands.length === 0 && (
              <li className="palette-empty">This folder is empty. Click above to add commands.</li>
            )}
            {filteredFolderCommands.map((cmd: string, idx: number) => {
              const realIdx = folder.commands.indexOf(cmd)
              const itemIdx = idx + FOLDER_EDIT_ACTION_COUNT
              const isActive = itemIdx === activeIndex
              return (
                <li
                  key={cmd}
                  ref={isActive ? activeItemRef : undefined}
                  className={isActive ? 'palette-item active' : 'palette-item'}
                  onMouseEnter={() => setActiveIndex(itemIdx)}
                >
                  <span className="palette-item-text">
                    <span className="palette-item-label">/{cmd}</span>
                    <span className="palette-item-sublabel">{getCommandDescription(cmd)}</span>
                  </span>
                  <div className="config-item-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="config-action-btn"
                      title="Move Up (Alt+Up)"
                      disabled={realIdx === 0}
                      onClick={() => moveFolderCommand(level.folderId, realIdx, -1)}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="config-action-btn"
                      title="Move Down (Alt+Down)"
                      disabled={realIdx === folder.commands.length - 1}
                      onClick={() => moveFolderCommand(level.folderId, realIdx, 1)}
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      className="config-action-btn"
                      title="Remove from Folder"
                      onClick={() => removeCommandFromFolder(level.folderId, cmd)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )
      })()}

      {level.kind === 'folderAddCommand' && (
        <ul className={disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}>
          <li
            className="palette-item"
            style={{ opacity: 0.8, cursor: 'default' }}
          >
            <span className="palette-item-text">
              <span className="palette-item-label">Pick a command to add to folder:</span>
            </span>
          </li>
          {allAvailableCommands
            .filter((cmd: string) => {
              const currentFolder = layout.folders.find((f) => f.id === level.folderId)
              return currentFolder && !currentFolder.commands.includes(cmd)
            })
            .map((cmd: string, idx: number) => (
              <li
                key={cmd}
                ref={idx === activeIndex ? activeItemRef : undefined}
                className={idx === activeIndex ? 'palette-item active' : 'palette-item'}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => {
                  addCommandToFolder(level.folderId, cmd)
                  setLevel({ kind: 'folderEdit', folderId: level.folderId })
                }}
              >
                <span className="palette-item-text">
                  <span className="palette-item-label">/{cmd}</span>
                  <span className="palette-item-sublabel">{getCommandDescription(cmd)}</span>
                </span>
                <span className="config-toggle-badge config-toggle-off">+ Add</span>
              </li>
            ))}
        </ul>
      )}

      {level.kind === 'commandAssignFolder' && (
        <ul className={disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}>
          <li
            className="palette-item"
            style={{ opacity: 0.8, cursor: 'default' }}
          >
            <span className="palette-item-text">
              <span className="palette-item-label">Move /{level.commandName} into:</span>
            </span>
          </li>
          <li
            ref={activeIndex === 0 ? activeItemRef : undefined}
            className={activeIndex === 0 ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(0)}
            onClick={() => {
              const nextFolders = layout.folders.map((f) => ({
                ...f,
                commands: f.commands.filter((c) => c !== level.commandName)
              }))
              const nextRoot = layout.rootOrder.includes(level.commandName)
                ? layout.rootOrder
                : [...layout.rootOrder, level.commandName]
              saveLayout({ ...layout, folders: nextFolders, rootOrder: nextRoot })
              setLevel({ kind: 'commandLayout' })
            }}
          >
            <span className="palette-item-text">
              <span className="palette-item-label">🏠 Root Level</span>
              <span className="palette-item-sublabel">Keep command outside of any folder</span>
            </span>
          </li>
          {layout.folders.map((f, fIdx) => {
            const itemIdx = fIdx + 1
            const isInThisFolder = f.commands.includes(level.commandName)
            return (
              <li
                key={f.id}
                ref={itemIdx === activeIndex ? activeItemRef : undefined}
                className={itemIdx === activeIndex ? 'palette-item active' : 'palette-item'}
                onMouseEnter={() => setActiveIndex(itemIdx)}
                onClick={() => {
                  addCommandToFolder(f.id, level.commandName)
                  setLevel({ kind: 'commandLayout' })
                }}
              >
                <span className="palette-item-text">
                  <span className="palette-item-label">{f.icon ?? '📁'} {f.name}</span>
                  <span className="palette-item-sublabel">{f.commands.length} commands</span>
                </span>
                {isInThisFolder && (
                  <span className="config-toggle-badge config-toggle-on">Current</span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {level.kind === 'newFolder' && (
        <div className="config-form">
          <label className="config-field">
            <span className="config-field-label">Folder Name</span>
            <input
              autoFocus
              className="config-field-input"
              placeholder="e.g. Work, Dev, Personal..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  createNewFolder(newFolderName, newFolderIcon)
                }
              }}
            />
          </label>
          <label className="config-field">
            <span className="config-field-label">Icon / Emoji</span>
            <input
              className="config-field-input"
              placeholder="📁, ⚡, 💬, 🛠️, 🚀..."
              value={newFolderIcon}
              onChange={(e) => setNewFolderIcon(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  createNewFolder(newFolderName, newFolderIcon)
                }
              }}
            />
          </label>
          <div className="config-form-actions">
            <button
              type="button"
              className="config-btn config-btn-primary"
              onClick={() => createNewFolder(newFolderName, newFolderIcon)}
            >
              Create Folder
            </button>
            <button
              type="button"
              className="config-btn"
              onClick={() => setLevel({ kind: 'commandLayout' })}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {level.kind === 'teamsManager' && (
        <>
          <ul className={disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}>
            <li
              ref={activeIndex === 0 ? activeItemRef : undefined}
              className={activeIndex === 0 ? 'palette-item active' : 'palette-item'}
              onMouseEnter={() => setActiveIndex(0)}
              onClick={() => openNewTeamsEntry(contactsTypeDef)}
            >
              <span className="palette-item-text">
                <span className="palette-item-label">+ Add New Contact (Person)</span>
                <span className="palette-item-sublabel">Add a person by name and email for 1:1 Teams chat or call</span>
              </span>
              <span className="config-toggle-badge">New Person</span>
            </li>
            <li
              ref={activeIndex === 1 ? activeItemRef : undefined}
              className={activeIndex === 1 ? 'palette-item active' : 'palette-item'}
              onMouseEnter={() => setActiveIndex(1)}
              onClick={() => openNewTeamsEntry(teamLinksTypeDef)}
            >
              <span className="palette-item-text">
                <span className="palette-item-label">+ Add New Team / Channel Link</span>
                <span className="palette-item-sublabel">Add a Teams channel or group chat deep link</span>
              </span>
              <span className="config-toggle-badge">New Team</span>
            </li>
            {filteredTeamsManagerItems.map((item, idx) => {
              const rowIdx = idx + TEAMS_MANAGER_ACTION_COUNT
              const isPendingDelete = pendingTeamsDeleteKey === item.key
              return (
                <li
                  key={item.key}
                  ref={rowIdx === activeIndex ? activeItemRef : undefined}
                  className={rowIdx === activeIndex ? 'palette-item active' : 'palette-item'}
                  onMouseEnter={() => setActiveIndex(rowIdx)}
                  onClick={() => openEditTeamsEntry(item.typeDef, item.originalIndex, item.entry)}
                >
                  <span className="palette-item-text">
                    <span className="palette-item-label">{item.title}</span>
                    {item.subtitle && <span className="palette-item-sublabel">{item.subtitle}</span>}
                  </span>
                  <span className="config-toggle-badge" style={{ marginRight: 8 }}>{item.badge}</span>
                  <button
                    type="button"
                    className={
                      isPendingDelete
                        ? 'config-item-delete config-item-delete-confirm'
                        : 'config-item-delete'
                    }
                    title={isPendingDelete ? 'Click again to confirm delete' : 'Delete'}
                    onClick={(e) => {
                      e.stopPropagation()
                      requestTeamsItemDelete(item.typeDef, item.originalIndex, item.key)
                    }}
                  >
                    {isPendingDelete ? 'Confirm?' : '✕'}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="config-footer-hints">
            <span><kbd>↵</kbd> Add / Edit</span>
            <span><kbd>Del</kbd> Delete</span>
            <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
            <span><kbd>Esc</kbd> Back to /teams</span>
          </div>
        </>
      )}

      {level.kind === 'list' && (
        <ul className={disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}>
          {filteredEntries.map(({ entry, originalIndex }, idx) => (
            <li
              key={originalIndex}
              ref={idx === activeIndex ? activeItemRef : undefined}
              className={idx === activeIndex ? 'palette-item active' : 'palette-item'}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => openEditEntry(level.typeDef, originalIndex)}
            >
              <span className="palette-item-text">
                <span className="palette-item-label">{String(entry[level.typeDef.titleField] ?? '(untitled)')}</span>
                {level.typeDef.subtitleField && (
                  <span className="palette-item-sublabel">{String(entry[level.typeDef.subtitleField] ?? '')}</span>
                )}
              </span>
              <button
                type="button"
                className={
                  pendingDeleteIndex === originalIndex
                    ? 'config-item-delete config-item-delete-confirm'
                    : 'config-item-delete'
                }
                title={pendingDeleteIndex === originalIndex ? 'Click again to confirm delete' : 'Delete'}
                onClick={(e) => {
                  e.stopPropagation()
                  requestDelete(level.typeDef, originalIndex)
                }}
              >
                {pendingDeleteIndex === originalIndex ? 'Confirm?' : '✕'}
              </button>
            </li>
          ))}
          <li
            ref={activeIndex === filteredEntries.length ? activeItemRef : undefined}
            className={activeIndex === filteredEntries.length ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(filteredEntries.length)}
            onClick={() => openNewEntry(level.typeDef)}
          >
            <span className="palette-item-label">+ Add new</span>
          </li>
        </ul>
      )}

      {level.kind === 'form' && (
        <div className="config-form">
          {level.typeDef.fields.map((field, idx) => {
            const isTarget = level.focusFieldKey ? field.key === level.focusFieldKey : idx === 0
            const assignRef = (el: HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement | null) => {
              if (idx === 0) (firstFieldRef as React.MutableRefObject<any>).current = el
              if (isTarget) (targetFieldRef as React.MutableRefObject<any>).current = el
            }
            return (
              <label key={field.key} className="config-field">
                <span className="config-field-label">{field.label}</span>
                {field.type === 'textarea' ? (
                  <textarea
                    ref={assignRef}
                    className="config-field-input"
                    rows={3}
                    value={String(level.draft[field.key] ?? '')}
                    onChange={(e) => setLevel({ ...level, draft: { ...level.draft, [field.key]: e.target.value } })}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && e.currentTarget.value === '') {
                        e.preventDefault()
                        backOneLevel()
                      }
                    }}
                  />
                ) : field.type === 'boolean' ? (
                  <button
                    type="button"
                    ref={assignRef}
                    className={`config-toggle-badge config-toggle-button ${Boolean(level.draft[field.key]) ? 'config-toggle-on' : 'config-toggle-off'}`}
                    onClick={() =>
                      setLevel({
                        ...level,
                        draft: { ...level.draft, [field.key]: !Boolean(level.draft[field.key]) }
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault()
                        setLevel({
                          ...level,
                          draft: { ...level.draft, [field.key]: !Boolean(level.draft[field.key]) }
                        })
                      }
                    }}
                  >
                    {Boolean(level.draft[field.key]) ? 'Enabled' : 'Disabled'}
                  </button>
                ) : (
                  <input
                    ref={assignRef}
                    type={field.type === 'number' ? 'number' : 'text'}
                    className="config-field-input"
                    value={String(level.draft[field.key] ?? '')}
                    onChange={(e) =>
                      setLevel({
                        ...level,
                        draft: {
                          ...level.draft,
                          [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value
                        }
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && e.currentTarget.value === '') {
                        e.preventDefault()
                        backOneLevel()
                        return
                      }
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        saveDraft()
                      }
                    }}
                  />
                )}
              </label>
            )
          })}
          <div className="config-form-actions">
            <button type="button" className="config-btn config-btn-primary" onClick={saveDraft}>
              Save
            </button>
            {level.index !== null && !level.typeDef.singleton && (
              <button
                type="button"
                className={
                  pendingDeleteIndex === level.index
                    ? 'config-btn config-btn-danger config-btn-danger-confirm'
                    : 'config-btn config-btn-danger'
                }
                onClick={async () => {
                  if (pendingDeleteIndex === level.index) {
                    if (level.returnToTeamsManager) {
                      await deleteTeamsItemAt(level.typeDef, level.index as number)
                      setLevel({ kind: 'teamsManager' })
                    } else {
                      await deleteEntryAt(level.typeDef, level.index as number)
                      setLevel({ kind: 'list', typeDef: level.typeDef })
                    }
                    return
                  }
                  requestDelete(level.typeDef, level.index as number)
                }}
              >
                {pendingDeleteIndex === level.index ? 'Confirm delete?' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      )}

      {level.kind === 'settings' && (
        <div className="config-footer-hints">
          <span><kbd>↵</kbd> Change / Toggle</span>
          <span><kbd>←</kbd><kbd>→</kbd> Cycle</span>
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span><kbd>Esc</kbd> Back / Close</span>
        </div>
      )}
    </div>
  )
}
