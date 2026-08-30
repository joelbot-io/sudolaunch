import { useCallback, useEffect, useRef, useState } from 'react'
import Fuse from 'fuse.js'
import {
  CONFIG_TYPES,
  COMMANDS,
  SEARCHABLE_COMMAND_NAMES,
  type ConfigTypeDef,
  type ConfigEntry,
  type AppEntry,
  type CommandName
} from '../../shared/types'

interface Props {
  initialFilter?: string
  onExit: (exitVal?: string) => void
}

type Level =
  | { kind: 'types' }
  | { kind: 'list'; typeDef: ConfigTypeDef }
  | { kind: 'apps' }
  | { kind: 'searchCommands' }
  | { kind: 'hiddenCommands' }
  | { kind: 'defaultCommand' }
  | { kind: 'form'; typeDef: ConfigTypeDef; index: number | null; draft: ConfigEntry }

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
const SEARCH_COMMANDS_ACTION_COUNT = 2
const SEARCH_COMMAND_DEFS = SEARCHABLE_COMMAND_NAMES.map(
  (name) => COMMANDS.find((c) => c.name === name)!
)

const HIDDEN_COMMANDS_ROW_LABEL = 'Command Visibility'
const HIDDEN_COMMANDS_ROW_DESCRIPTION = 'Choose which commands appear in the command palette UI'
const HIDDEN_COMMANDS_ACTION_COUNT = 2

const DEFAULT_COMMAND_ROW_LABEL = 'Default Command'
const DEFAULT_COMMAND_ROW_DESCRIPTION = 'Choose which command appears first in suggestions'

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

interface Row {
  key: string
  label: string
  sublabel?: string
  onSelect: () => void
}

export default function ConfigManager({ initialFilter, onExit }: Props): JSX.Element {
  const [level, setLevel] = useState<Level>({ kind: 'types' })
  const [entries, setEntries] = useState<ConfigEntry[]>([])
  const [apps, setApps] = useState<AppEntry[]>([])
  const [disabledApps, setDisabledApps] = useState<Set<string>>(new Set())
  const [excludedSearchCommands, setExcludedSearchCommands] = useState<Set<CommandName>>(new Set())
  const [hiddenCommands, setHiddenCommands] = useState<Set<CommandName>>(new Set())
  const [defaultCommand, setDefaultCommand] = useState<string>('')
  const [disableMouseInput, setDisableMouseInput] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  // Drives live filtering of whatever list is currently shown — the same role `value` plays
  // in CommandPalette.tsx's own input. Reset on every level change (see openXxx/backOneLevel)
  // so a filter typed on one screen doesn't leak into the next.
  const [filter, setFilter] = useState(initialFilter ?? '')
  const [error, setError] = useState<string | null>(null)
  // Delete is destructive and irreversible, so the first press only "arms" the target
  // entry (shows "Confirm delete?") — a second press within the window actually deletes.
  // Keyed by originalIndex; cleared whenever we navigate away from the list.
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null)
  const pendingDeleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const firstFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const activeItemRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (level.kind === 'form') {
      firstFieldRef.current?.focus()
    } else {
      filterRef.current?.focus()
    }
    // Deliberately keyed on level.kind (+ which form) rather than `level` itself —
    // every keystroke replaces `level.draft` with a new object, and re-running this
    // on that would steal focus back to the first field on every character typed.
  }, [level.kind, level.kind === 'form' ? level.typeDef.type : null, level.kind === 'form' ? level.index : null])

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

  useEffect(() => {
    if (level.kind === 'list') {
      loadEntries(level.typeDef)
    }
    // Deliberately keyed on `level` itself (a fresh object each time we enter list mode)
    // rather than `loadEntries`/`level.typeDef`, so re-entering the same type still refetches.
  }, [level, loadEntries])

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

  function openTypeList(typeDef: ConfigTypeDef): void {
    setError(null)
    setFilter('')
    if (typeDef.singleton) {
      window.api.getConfigEntries(typeDef.type).then((list) => {
        setLevel({ kind: 'form', typeDef, index: 0, draft: { ...list[0] } })
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

  function setDefaultCommandChoice(cmd: string): void {
    setDefaultCommand(cmd)
    window.api.saveConfigEntry('settings', { defaultCommand: cmd }, 0)
  }

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

  function backOneLevel(): void {
    setError(null)
    setFilter('')
    setActiveIndex(0)
    clearPendingDelete()
    if (level.kind === 'form') {
      if (level.typeDef.singleton) {
        onExit('/settings')
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
      level.kind === 'defaultCommand'
    ) {
      setLevel({ kind: 'types' })
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
    if (typeDef.singleton) {
      onExit('/settings')
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
  }

  async function deleteEntryAt(typeDef: ConfigTypeDef, index: number): Promise<void> {
    await window.api.deleteConfigEntry(typeDef.type, index)
    clearPendingDelete()
    loadEntries(typeDef)
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
  const typesRows: Row[] = fuzzyFilter(
    [
      ...CONFIG_TYPES.map((t) => ({
        key: t.type,
        label: t.label,
        sublabel: t.description,
        onSelect: () => openTypeList(t)
      })),
      { key: '__apps', label: APPS_ROW_LABEL, sublabel: APPS_ROW_DESCRIPTION, onSelect: openAppsScreen },
      {
        key: '__searchCommands',
        label: SEARCH_COMMANDS_ROW_LABEL,
        sublabel: SEARCH_COMMANDS_ROW_DESCRIPTION,
        onSelect: openSearchCommandsScreen
      },
      {
        key: '__hiddenCommands',
        label: HIDDEN_COMMANDS_ROW_LABEL,
        sublabel: HIDDEN_COMMANDS_ROW_DESCRIPTION,
        onSelect: openHiddenCommandsScreen
      },
      {
        key: '__defaultCommand',
        label: DEFAULT_COMMAND_ROW_LABEL,
        sublabel: DEFAULT_COMMAND_ROW_DESCRIPTION,
        onSelect: openDefaultCommandScreen
      },
      {
        key: '__openConfigFolder',
        label: 'Open Config Folder',
        sublabel: 'Open %USERPROFILE%\\.sudolaunch in File Explorer',
        onSelect: () => window.api.openConfigFolder()
      }
    ],
    ['label', 'sublabel'],
    filter
  )

  const filteredApps =
    level.kind === 'apps' ? fuzzyFilter(apps, ['name', 'path'], filter) : apps

  const filteredSearchCommandDefs =
    level.kind === 'searchCommands' ? fuzzyFilter(SEARCH_COMMAND_DEFS, ['name', 'description'], filter) : SEARCH_COMMAND_DEFS

  const filteredHiddenCommandDefs =
    level.kind === 'hiddenCommands' ? fuzzyFilter(COMMANDS, ['name', 'description'], filter) : COMMANDS

  const filteredDefaultCommandDefs =
    level.kind === 'defaultCommand' ? fuzzyFilter(COMMANDS, ['name', 'description'], filter) : COMMANDS

  const filteredEntries =
    level.kind === 'list'
      ? fuzzyFilter(
          entries.map((entry, originalIndex) => ({ entry, originalIndex })),
          [`entry.${level.typeDef.titleField}`, ...(level.typeDef.subtitleField ? [`entry.${level.typeDef.subtitleField}`] : [])],
          filter
        )
      : []

  function handleRootKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
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
    if (level.kind === 'types') {
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
        if (activeIndex === 0) setAllSearchCommandsExcluded(false)
        else if (activeIndex === 1) setAllSearchCommandsExcluded(true)
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
    (level.kind === 'apps'
      ? APPS_ROW_LABEL
      : level.kind === 'searchCommands'
        ? SEARCH_COMMANDS_ROW_LABEL
        : level.kind === 'hiddenCommands'
          ? HIDDEN_COMMANDS_ROW_LABEL
          : level.kind === 'defaultCommand'
            ? DEFAULT_COMMAND_ROW_LABEL
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
        value={level.kind === 'types' ? (filter ? `/settings ${filter}` : '/settings') : filter}
        placeholder={
          level.kind === 'types'
            ? '/settings — type to filter config...'
            : level.kind === 'form'
              ? breadcrumb
              : `${breadcrumb} — type to filter...`
        }
        onChange={(e) => {
          const val = e.target.value
          if (level.kind === 'types') {
            if (val.startsWith('/settings ') || val.startsWith('/config ')) {
              const spaceIdx = val.indexOf(' ')
              setFilter(val.slice(spaceIdx + 1))
              setActiveIndex(0)
            } else if (val === '/settings' || val === '/config') {
              setFilter('')
              setActiveIndex(0)
            } else {
              onExit(val)
              return
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

      {level.kind === 'searchCommands' && (
        <ul className={disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}>
          <li
            ref={activeIndex === 0 ? activeItemRef : undefined}
            className={activeIndex === 0 ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(0)}
            onClick={() => setAllSearchCommandsExcluded(false)}
          >
            <span className="palette-item-label">Select all</span>
          </li>
          <li
            ref={activeIndex === 1 ? activeItemRef : undefined}
            className={activeIndex === 1 ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(1)}
            onClick={() => setAllSearchCommandsExcluded(true)}
          >
            <span className="palette-item-label">Select none</span>
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
                <span className="palette-item-sublabel">{c.description}</span>
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
          {level.typeDef.fields.map((field, idx) => (
            <label key={field.key} className="config-field">
              <span className="config-field-label">{field.label}</span>
              {field.type === 'textarea' ? (
                <textarea
                  ref={idx === 0 ? (firstFieldRef as React.RefObject<HTMLTextAreaElement>) : undefined}
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
                  ref={idx === 0 ? (firstFieldRef as React.RefObject<HTMLButtonElement>) : undefined}
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
                  ref={idx === 0 ? (firstFieldRef as React.RefObject<HTMLInputElement>) : undefined}
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
          ))}
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
                    await deleteEntryAt(level.typeDef, level.index as number)
                    setLevel({ kind: 'list', typeDef: level.typeDef })
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
    </div>
  )
}
