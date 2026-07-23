import { useCallback, useEffect, useRef, useState } from 'react'
import { COMMANDS, type CommandName, type SearchResultItem, type HistoryEntry } from '../../shared/types'
import ConfigManager from './ConfigManager'

interface ListItem {
  key: string
  label: string
  sublabel?: string
  onSelect: () => void
}

// Only these three commands get a shortcut, mapped to their Settings field — by design,
// not every command (see the "//" Settings screen for the user-editable letters).
const SHORTCUT_SETTINGS_FIELD: Record<'teams' | 'call' | 'link', string> = {
  teams: 'teamsShortcut',
  call: 'callShortcut',
  link: 'linkShortcut'
}

function parseInput(
  raw: string,
  shortcuts: Record<string, CommandName>
): { command: CommandName | null; query: string } {
  if (!raw.startsWith('/')) return { command: null, query: '' }
  const spaceIdx = raw.indexOf(' ')
  if (spaceIdx === -1) return { command: null, query: raw.slice(1) }
  const name = raw.slice(1, spaceIdx)
  const command = COMMANDS.find((c) => c.name === name)?.name ?? shortcuts[name] ?? null
  return { command, query: raw.slice(spaceIdx + 1) }
}

export default function CommandPalette(): JSX.Element {
  const [value, setValue] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [calcResult, setCalcResult] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [hotkeyError, setHotkeyError] = useState<string | null>(null)
  const [shortcuts, setShortcuts] = useState<Record<string, CommandName>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const activeItemRef = useRef<HTMLLIElement>(null)

  const { command, query } = parseInput(value, shortcuts)
  const showingCommandList = value.startsWith('/') && command === null
  const filteredCommands = showingCommandList
    ? COMMANDS.filter((c) => c.name.startsWith(value.slice(1)))
    : []
  const shortcutFor = useCallback(
    (name: CommandName): string | undefined =>
      Object.entries(shortcuts).find(([, cmd]) => cmd === name)?.[0],
    [shortcuts]
  )

  const refreshHistory = useCallback(() => {
    window.api.getHistory().then(setHistory)
  }, [])

  const refreshShortcuts = useCallback(() => {
    window.api.getConfigEntries('settings').then((list) => {
      const settings = list[0]
      if (!settings) return
      const map: Record<string, CommandName> = {}
      for (const [command, field] of Object.entries(SHORTCUT_SETTINGS_FIELD) as [
        keyof typeof SHORTCUT_SETTINGS_FIELD,
        string
      ][]) {
        const key = String(settings[field] ?? '').trim()
        if (key) map[key] = command
      }
      setShortcuts(map)
    })
  }, [])

  useEffect(() => {
    refreshHistory()
    refreshShortcuts()
    window.api.onPaletteShown(() => {
      setValue('')
      setCalcResult(null)
      setActiveIndex(0)
      refreshHistory()
      inputRef.current?.focus()
    })
    window.api.onConfigChanged(() => {
      refreshHistory()
      refreshShortcuts()
    })
    window.api.onHotkeyError((hotkey) => {
      setHotkeyError(`Couldn't register hotkey "${hotkey}" — keeping the previous one.`)
      setTimeout(() => setHotkeyError(null), 5000)
    })
  }, [refreshHistory, refreshShortcuts])

  useEffect(() => {
    setActiveIndex(0)
    if (!command) {
      setResults([])
      setCalcResult(null)
      return
    }
    if (command === 'calc') {
      window.api.runCalc(query).then(setCalcResult)
      setResults([])
      return
    }
    window.api.search(command, query).then(setResults)
  }, [command, query])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        window.api.hidePalette()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const items: ListItem[] = (() => {
    if (value === '') {
      return history.map((h) => ({
        key: `${h.command}-${h.query}-${h.timestamp}`,
        label: h.label,
        sublabel: `/${h.command} ${h.query}`,
        onSelect: () => runFromHistory(h)
      }))
    }
    if (showingCommandList) {
      return filteredCommands.map((c) => {
        const shortcut = shortcutFor(c.name)
        return {
          key: c.name,
          label: `/${c.name}`,
          sublabel: shortcut ? `${c.description} · /${shortcut}` : c.description,
          onSelect: () => setValue(`/${c.name} `)
        }
      })
    }
    if (command === 'calc') {
      return []
    }
    if (command) {
      return results.map((r) => ({
        key: `${r.value}|${r.label}`,
        label: r.label,
        sublabel: r.sublabel,
        onSelect: () => {
          if (r.disabled) return
          if (command === 'script' && r.isDirectory) {
            setValue(r.value ? `/script ${r.value}/` : '/script ')
            inputRef.current?.focus()
            return
          }
          runCommand(command, r)
        }
      }))
    }
    return []
  })()

  function runCommand(cmd: CommandName, item: SearchResultItem): void {
    window.api.executeCommand(cmd, item, query).then(refreshHistory)
  }

  function runFromHistory(h: HistoryEntry): void {
    window.api.executeCommand(h.command, { label: h.label, value: h.value }, h.query).then(refreshHistory)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, Math.max(items.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (command === 'calc') {
        if (calcResult !== null) {
          navigator.clipboard.writeText(calcResult)
          window.api.hidePalette()
        }
        return
      }
      const item = items[activeIndex]
      item?.onSelect()
    }
  }

  if (value.startsWith('//')) {
    return (
      <div className="palette">
        <ConfigManager onExit={() => setValue('')} />
      </div>
    )
  }

  return (
    <div className="palette">
      <input
        ref={inputRef}
        className="palette-input"
        value={value}
        placeholder="Type / for commands, // to manage config..."
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {hotkeyError && <div className="palette-banner">{hotkeyError}</div>}
      {command === 'calc' && (
        <div className="calc-result">{calcResult ?? (query ? 'Invalid expression' : 'Enter an expression')}</div>
      )}
      {command !== 'calc' && (
        <ul className="palette-list">
          {items.length === 0 && <li className="palette-empty">No results</li>}
          {items.map((item, idx) => (
            <li
              key={item.key}
              ref={idx === activeIndex ? activeItemRef : undefined}
              className={idx === activeIndex ? 'palette-item active' : 'palette-item'}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={item.onSelect}
            >
              <span className="palette-item-label">{item.label}</span>
              {item.sublabel && <span className="palette-item-sublabel">{item.sublabel}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
