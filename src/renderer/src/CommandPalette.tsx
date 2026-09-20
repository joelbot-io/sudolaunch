import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import {
  COMMANDS,
  type CommandName,
  type SearchResultItem,
  type HistoryEntry,
  type CustomCommand,
  type GrowOrigin
} from '../../shared/types'
import ConfigManager from './ConfigManager'
import { windowMode } from './windowMode'
import { formatAccelerator } from './accelerator'

interface ListItem {
  key: string
  label: string
  sublabel?: string
  // Set when this item fills the input rather than running anything — lets Tab accept it
  // without also triggering Enter's "run" behavior for regular result items.
  completion?: string
  onSelect: () => void
}

// Only these three commands get a shortcut, mapped to their Settings field — by design,
// not every command (see the "/settings" Settings screen for the user-editable letters).
const SHORTCUT_SETTINGS_FIELD: Record<'teams' | 'fav' | 'snippet', string> = {
  teams: 'teamsShortcut',
  fav: 'favShortcut',
  snippet: 'snippetShortcut'
}

function parseInput(
  raw: string,
  shortcuts: Record<string, CommandName>,
  customNames: Set<string>,
  defaultCommand: string
): { command: CommandName | null; query: string } {
  // If user typed without a leading slash:
  if (!raw.startsWith('/')) {
    const trimmed = raw.trim()
    if (!trimmed) return { command: null, query: '' }
    if (defaultCommand && defaultCommand !== 'none') {
      const defCmd = COMMANDS.find((c) => c.name === defaultCommand)?.name
      if (defCmd) return { command: defCmd, query: trimmed }
    }
    return { command: 'search', query: trimmed }
  }

  const spaceIdx = raw.indexOf(' ')
  if (spaceIdx === -1) {
    const name = raw.slice(1)
    if (name === 'settings' || name === 'config') {
      return { command: 'settings', query: '' }
    }
    if (name === 'g' || name === 'google') {
      return { command: 'g', query: '' }
    }
    if (name === 'powertoys' || name === 'pt') {
      return { command: 'pt', query: '' }
    }
    if (name === 'exit' || name === 'quit') {
      return { command: 'exit', query: '' }
    }
    if (customNames.has(name)) {
      return { command: 'custom', query: name }
    }
    const matchedCmd = COMMANDS.find((c) => c.name === name)?.name
    const nonZeroArg = new Set<CommandName>(['calc', 'search', 'restart', 'default', 'view', 'term', 'swap', 'release', 'exit', 'settings'])
    if (matchedCmd && !nonZeroArg.has(matchedCmd)) {
      return { command: matchedCmd, query: '' }
    }
    return { command: null, query: name }
  }
  const name = raw.slice(1, spaceIdx)
  const rest = raw.slice(spaceIdx + 1)
  if (name === 'settings' || name === 'config') return { command: 'settings', query: rest }
  if (name === 'google') return { command: 'g', query: rest }
  if (name === 'powertoys') return { command: 'pt', query: rest }
  if (name === 'exit' || name === 'quit') return { command: 'exit', query: rest }
  if (customNames.has(name)) return { command: 'custom', query: `${name} ${rest}`.trim() }
  const command = COMMANDS.find((c) => c.name === name)?.name ?? shortcuts[name] ?? null
  return { command, query: rest }
}

export default function CommandPalette(): JSX.Element {
  const [value, setValue] = useState('')
  // Bar-mode only: whether the bar is pulled out to full palette size (icon otherwise) —
  // driven by explicit user/hotkey actions rather than DOM focus, since the idle state is
  // now just an icon button with nothing to focus. Authoritative state lives in main (see
  // barWindow.ts); this mirrors it via 'palette-shown' (activate) and 'bar-collapsed'
  // (deactivate).
  const [barActive, setBarActive] = useState(false)
  // Bar-mode only: whether "/move" mode is showing the drag handle instead of the
  // icon/palette — mirrors main's moveModeActive via 'move-mode-changed'.
  const [moveMode, setMoveMode] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [results, setResults] = useState<SearchResultItem[]>([])
  // True while a search/calc request is in flight — lets the empty-list render distinguish
  // "still waiting on main" from "main answered and there's genuinely nothing", so a fast
  // typist doesn't see a flash of "No results" before every real result set lands.
  const [isSearching, setIsSearching] = useState(false)
  const [calcResult, setCalcResult] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [hotkeyError, setHotkeyError] = useState<string | null>(null)
  const [commandError, setCommandError] = useState<string | null>(null)
  const [historyEnabled, setHistoryEnabled] = useState(true)
  const [disableMouseInput, setDisableMouseInput] = useState(false)
  const [defaultCommand, setDefaultCommand] = useState<string>('')
  const [shortcuts, setShortcuts] = useState<Record<string, CommandName>>({})
  const [hiddenCommands, setHiddenCommands] = useState<Set<CommandName>>(new Set())
  const [customCommands, setCustomCommands] = useState<CustomCommand[]>([])
  const [paletteHotkey, setPaletteHotkey] = useState('')
  const [shimmerInfo, setShimmerInfo] = useState<{
    corner: 'tl' | 'tr' | 'br' | 'bl'
    color: string
    gradient: string
    flickerType: number | null
  } | null>(null)
  // Where the icon sat inside the now-full-size window, so the palette can grow out of it
  // (see barWindow.ts's activateBar). Cleared once the animation has played, so a re-render
  // mid-session — typing, results arriving — doesn't restart it.
  const [growOrigin, setGrowOrigin] = useState<GrowOrigin | null>(null)
  // 'pending' holds the palette mounted but invisible for one frame before 'running' starts
  // the animation. Activation is the first time this window ever builds the palette subtree
  // (idle is just the icon), so without the delay the very first grow competes with mounting
  // the input/list, laying out fonts, and rasterizing the backdrop-filter — which is exactly
  // why the first one looked jumpy while later ones were fine.
  const [growPhase, setGrowPhase] = useState<'pending' | 'running' | 'collapsing' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeItemRef = useRef<HTMLLIElement>(null)
  // The palette opens wherever the cursor already happens to be resting, which fires a
  // phantom mouseenter (and even the browser's native CSS :hover) on whatever list item
  // ends up underneath it — stealing activeIndex from keyboard navigation, and visually
  // highlighting a row the user never touched. Chromium also synthesizes a mousemove at
  // the cursor's existing position when new content appears underneath it (to recompute
  // hover state), so a plain "has mousemove fired yet" check isn't enough — track the last
  // seen position and only stop ignoring once it actually changes. This needs to be state
  // (not a ref) because disabling :hover via pointer-events requires a re-render.
  const [ignoreMouse, setIgnoreMouse] = useState(true)
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null)
  // Guards against out-of-order IPC responses: every search/calc request bumps this, and a
  // response is only applied if it's still the most recent one requested — otherwise a slow
  // response for an older query could resolve after a newer one and overwrite its results.
  const requestIdRef = useRef(0)
  // Escape's keydown listener below is subscribed once (empty deps) so it doesn't get
  // re-added on every keystroke — this ref lets it read the current input text without
  // that stale-closure trap.
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])
  // Same stale-closure guard as valueRef, for the same reason (blur/Escape are subscribed
  // once with empty deps).
  const moveModeRef = useRef(moveMode)
  useEffect(() => {
    moveModeRef.current = moveMode
  }, [moveMode])

  const historyEnabledRef = useRef(historyEnabled)
  useEffect(() => {
    historyEnabledRef.current = historyEnabled
  }, [historyEnabled])

  const getDefaultValue = useCallback(() => (historyEnabledRef.current ? '' : '/'), [])

  const customNames = new Set(customCommands.map((c) => c.command))
  const { command, query } = parseInput(value, shortcuts, customNames, defaultCommand)
  const isSettingsMode =
    value === '/settings' ||
    value.startsWith('/settings') ||
    value === '/config' ||
    value.startsWith('/config') ||
    command === 'settings'

  const showingCommandList = value.startsWith('/') && command === null && !isSettingsMode
  const visibleCommands = COMMANDS.filter((c) => !hiddenCommands.has(c.name))
  const filteredCommands = showingCommandList
    ? visibleCommands.filter((c) => c.name.startsWith(value.slice(1)))
    : []
  const filteredCustomCommands = showingCommandList
    ? customCommands.filter((c) => c.command.startsWith(value.slice(1)))
    : []
  const shortcutFor = useCallback(
    (name: CommandName): string | undefined =>
      Object.entries(shortcuts).find(([, cmd]) => cmd === name)?.[0],
    [shortcuts]
  )

  const refreshHistory = useCallback(() => {
    window.api.getHistory().then(setHistory)
  }, [])

  const refreshSettings = useCallback(() => {
    window.api.getConfigEntries('settings').then((list) => {
      const settings = list[0]
      if (!settings) return
      if (typeof settings.historyEnabled === 'boolean') {
        const enabled = settings.historyEnabled
        setHistoryEnabled(enabled)
        historyEnabledRef.current = enabled
      }
      if (typeof settings.disableMouseInput === 'boolean') {
        setDisableMouseInput(settings.disableMouseInput)
      }
      if (typeof settings.defaultCommand === 'string') {
        setDefaultCommand(settings.defaultCommand)
      }
      if (Array.isArray(settings.hiddenCommands)) {
        setHiddenCommands(new Set(settings.hiddenCommands as CommandName[]))
      }
      const map: Record<string, CommandName> = {}
      for (const [cmdName, field] of Object.entries(SHORTCUT_SETTINGS_FIELD) as [
        keyof typeof SHORTCUT_SETTINGS_FIELD,
        string
      ][]) {
        const key = String(settings[field] ?? '').trim()
        if (key) map[key] = cmdName
      }
      setShortcuts(map)
    })
  }, [])

  // The palette hotkey is editable from Settings, so this re-runs on config-changed too.
  const refreshHotkeys = useCallback(() => {
    window.api.getHotkeys().then((hotkeys) => setPaletteHotkey(formatAccelerator(hotkeys.palette)))
  }, [])

  const refreshCustomCommands = useCallback(() => {
    window.api.listCustomCommands().then(setCustomCommands)
  }, [])

  useEffect(() => {
    refreshHistory()
    refreshSettings()
    refreshHotkeys()
    refreshCustomCommands()
    // Each onX call below subscribes an ipcRenderer listener that outlives this component
    // unless explicitly removed — without unsubscribing here, every remount (React effect
    // re-run in StrictMode, Vite HMR in dev) would pile on another listener on top of the
    // old ones instead of replacing them.
    const unsubscribers = [
      window.api.onPaletteShown(() => {
        refreshHistory()
        refreshSettings()
        setValue((val) => (val === '' || val === '/' ? getDefaultValue() : val))
        if (windowMode === 'bar') setBarActive(true)
        inputRef.current?.focus()
      }),
      // Fires for both activation paths (icon click and hotkey), so it's the one place
      // that needs to arm the grow animation.
      window.api.onBarActivated((origin) => {
        setBarActive(true)
        setGrowOrigin(origin)
        setGrowPhase('pending')
        setValue((val) => (val === '' || val === '/' ? getDefaultValue() : val))
      }),
      window.api.onBarCollapsing((origin) => {
        setGrowOrigin(origin)
        setGrowPhase('collapsing')
      }),
      window.api.onBarCollapsed(() => {
        setBarActive(false)
        setGrowOrigin(null)
        setGrowPhase(null)
        setValue(getDefaultValue())
        inputRef.current?.blur()
      }),
      window.api.onMoveModeChanged((active) => {
        setMoveMode(active)
        if (!active) {
          // Dropped — the handle hands back to the idle icon at wherever it landed.
          setBarActive(false)
          setValue(getDefaultValue())
        }
      }),
      window.api.onConfigChanged(() => {
        refreshHistory()
        refreshSettings()
        refreshHotkeys()
      }),
      window.api.onCustomCommandsChanged(() => {
        refreshCustomCommands()
      }),
      window.api.onHotkeyError((hotkey) => {
        setHotkeyError(`Couldn't register hotkey "${hotkey}" — keeping the previous one.`)
        setTimeout(() => setHotkeyError(null), 5000)
      }),
      window.api.onTerminalHotkeyError((hotkey) => {
        setHotkeyError(`Couldn't register terminal hotkey "${hotkey}" — keeping the previous one.`)
        setTimeout(() => setHotkeyError(null), 5000)
      })
    ]
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [refreshHistory, refreshSettings, refreshHotkeys, refreshCustomCommands, getDefaultValue])

  useEffect(() => {
    setActiveIndex(0)
    if (!command || command === 'settings') {
      setResults([])
      setCalcResult(null)
      setIsSearching(false)
      return
    }
    const requestId = ++requestIdRef.current
    if (command === 'calc') {
      const expr = query.trim()
      if (!expr) {
        setCalcResult(null)
        setIsSearching(false)
        return
      }
      window.api.runCalc(expr).then((res: string | null) => {
        if (requestId === requestIdRef.current) setCalcResult(res)
      })
      return
    }
    setIsSearching(true)
    window.api.search(command, query).then((res: SearchResultItem[]) => {
      if (requestId === requestIdRef.current) {
        setResults(res)
        setIsSearching(false)
      }
    })
  }, [command, query])

  useEffect(() => {
    // main hides the window right after it loses focus (see win.on('blur', ...) in
    // src/main/index.ts), so this fires reliably just before every hide, for both
    // click-away and Escape/executing a command. Clearing state here — instead of on the
    // next 'palette-shown' — means the window is already blank while offscreen, so the
    // *next* show paints clean instead of flashing this session's stale query/results for
    // a frame before the reset IPC round-trip lands.
    const handleBlur = (): void => {
      setValue(getDefaultValue())
      setCalcResult(null)
      setCommandError(null)
      setIsSearching(false)
      setActiveIndex(0)
      setIgnoreMouse(true)
      lastMousePosRef.current = null
      // The bar never hides on blur (that's the point of it being "persistent") — but it
      // should still collapse back to its idle icon once you click away, or drop the drag
      // handle if a "/move" was left in progress.
      if (windowMode === 'bar') {
        if (moveModeRef.current) {
          window.api.moveModeToggle()
        } else {
          window.api.barDeactivate()
        }
      }
    }
    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [getDefaultValue])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const defVal = getDefaultValue()
      if (valueRef.current.startsWith('/custom ') && valueRef.current.length > '/custom '.length) {
        setValue('/custom ')
        return
      }
      if (valueRef.current.startsWith('/gif ') && valueRef.current.length > '/gif '.length) {
        setValue('/gif ')
        return
      }
      if (valueRef.current.startsWith('/g ') && valueRef.current.length > '/g '.length) {
        setValue('/g ')
        return
      }
      if (valueRef.current.startsWith('/google ') && valueRef.current.length > '/google '.length) {
        setValue('/google ')
        return
      }
      if (valueRef.current.startsWith('/lookup ') && valueRef.current.length > '/lookup '.length) {
        setValue('/lookup ')
        return
      }
      if (valueRef.current.startsWith('/tz ') && valueRef.current.length > '/tz '.length) {
        setValue('/tz ')
        return
      }
      if (valueRef.current.startsWith('/case ') && valueRef.current.length > '/case '.length) {
        setValue('/case ')
        return
      }
      if (valueRef.current.startsWith('/chmod ') && valueRef.current.length > '/chmod '.length) {
        setValue('/chmod ')
        return
      }
      if (valueRef.current.startsWith('/color ') && valueRef.current.length > '/color '.length) {
        setValue('/color ')
        return
      }
      if (valueRef.current.startsWith('/cron ') && valueRef.current.length > '/cron '.length) {
        setValue('/cron ')
        return
      }
      if (valueRef.current.startsWith('/emoji ') && valueRef.current.length > '/emoji '.length) {
        setValue('/emoji ')
        return
      }
      if (valueRef.current.startsWith('/git ') && valueRef.current.length > '/git '.length) {
        setValue('/git ')
        return
      }
      if (valueRef.current.startsWith('/hash ') && valueRef.current.length > '/hash '.length) {
        setValue('/hash ')
        return
      }
      if (valueRef.current.startsWith('/http ') && valueRef.current.length > '/http '.length) {
        setValue('/http ')
        return
      }
      if (valueRef.current.startsWith('/ip ') && valueRef.current.length > '/ip '.length) {
        setValue('/ip ')
        return
      }
      if (valueRef.current.startsWith('/json ') && valueRef.current.length > '/json '.length) {
        setValue('/json ')
        return
      }
      if (valueRef.current.startsWith('/lorem ') && valueRef.current.length > '/lorem '.length) {
        setValue('/lorem ')
        return
      }
      if (valueRef.current.startsWith('/mime ') && valueRef.current.length > '/mime '.length) {
        setValue('/mime ')
        return
      }
      if (valueRef.current.startsWith('/port ') && valueRef.current.length > '/port '.length) {
        setValue('/port ')
        return
      }
      if (valueRef.current.startsWith('/pt ') && valueRef.current.length > '/pt '.length) {
        setValue('/pt ')
        return
      }
      if (valueRef.current.startsWith('/powertoys ') && valueRef.current.length > '/powertoys '.length) {
        setValue('/powertoys ')
        return
      }
      if (valueRef.current.startsWith('/pwd ') && valueRef.current.length > '/pwd '.length) {
        setValue('/pwd ')
        return
      }
      if (valueRef.current.startsWith('/qr ') && valueRef.current.length > '/qr '.length) {
        setValue('/qr ')
        return
      }
      if (valueRef.current.startsWith('/regex ') && valueRef.current.length > '/regex '.length) {
        setValue('/regex ')
        return
      }
      if (valueRef.current.startsWith('/text ') && valueRef.current.length > '/text '.length) {
        setValue('/text ')
        return
      }
      if (valueRef.current.startsWith('/unit ') && valueRef.current.length > '/unit '.length) {
        setValue('/unit ')
        return
      }
      if (valueRef.current.startsWith('/url ') && valueRef.current.length > '/url '.length) {
        setValue('/url ')
        return
      }
      if (valueRef.current.startsWith('/uuid ') && valueRef.current.length > '/uuid '.length) {
        setValue('/uuid ')
        return
      }
      if (valueRef.current.startsWith('/swap ') && valueRef.current.length > '/swap '.length) {
        setValue('/swap ')
        return
      }
      if (valueRef.current !== '' && valueRef.current !== defVal) {
        setValue(defVal)
      } else if (windowMode === 'bar') {
        if (moveModeRef.current) {
          window.api.moveModeToggle()
        } else {
          window.api.barDeactivate()
        }
      } else {
        window.api.hidePalette()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [getDefaultValue])

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  // Two frames: the first lets React commit the palette subtree and Chromium paint it (as
  // an invisible, layer-promoted element); the second starts the animation against that
  // already-warm layer. One frame isn't enough — the commit's paint hasn't necessarily
  // flushed by the next rAF callback.
  // 80ms delay: allows Electron's native window resize and Chromium paint to completely settle
  // as an invisible layer before starting the scale-up animation, avoiding first-frame jumps.
  useEffect(() => {
    if (growPhase !== 'pending') return
    const timer = setTimeout(() => {
      setGrowPhase('running')
    }, 80)
    return () => clearTimeout(timer)
  }, [growPhase])

  // Focus the input whenever the main palette input is mounted (e.g. upon bar activation
  // or when backing out of the /settings config manager view).
  useEffect(() => {
    if (!isSettingsMode) {
      inputRef.current?.focus()
    }
  }, [isSettingsMode, barActive, windowMode])

  useEffect(() => {
    if (windowMode !== 'bar' || barActive) {
      setShimmerInfo(null)
      return
    }

    let timerId: NodeJS.Timeout
    let resetId: NodeJS.Timeout

    const SHIMMER_PALETTES = [
      { color: '#5aa0ff', gradient: 'linear-gradient(135deg, #5aa0ff, #50e3c2)' },
      { color: '#bd10e0', gradient: 'linear-gradient(135deg, #bd10e0, #5aa0ff)' },
      { color: '#ff6bb4', gradient: 'linear-gradient(135deg, #ff6bb4, #ffb45a)' },
      { color: '#50e3c2', gradient: 'linear-gradient(135deg, #50e3c2, #b8e986)' },
      { color: '#ffb45a', gradient: 'linear-gradient(135deg, #ffb45a, #ff6b6b)' },
      { color: '#a855f7', gradient: 'linear-gradient(135deg, #a855f7, #ec4899)' },
      { color: '#38bdf8', gradient: 'linear-gradient(135deg, #38bdf8, #818cf8)' },
      { color: '#34d399', gradient: 'linear-gradient(135deg, #34d399, #0ea5e9)' },
      { color: '#f472b6', gradient: 'linear-gradient(135deg, #f472b6, #fb7185)' },
      { color: '#fbbf24', gradient: 'linear-gradient(135deg, #fbbf24, #f59e0b)' },
      { color: '#c084fc', gradient: 'linear-gradient(135deg, #c084fc, #38bdf8)' },
      { color: '#4ade80', gradient: 'linear-gradient(135deg, #4ade80, #2dd4bf)' }
    ]

    const scheduleShimmer = (): void => {
      const randomDelay = Math.floor(Math.random() * 5000) + 5000
      timerId = setTimeout(() => {
        const corners: Array<'tl' | 'tr' | 'br' | 'bl'> = ['tl', 'tr', 'br', 'bl']
        const randomCorner = corners[Math.floor(Math.random() * corners.length)]
        const randomTheme = SHIMMER_PALETTES[Math.floor(Math.random() * SHIMMER_PALETTES.length)]
        const randomFlicker = Math.random() < 0.4
        const flickerType = randomFlicker ? Math.floor(Math.random() * 3) + 1 : null
        setShimmerInfo({
          corner: randomCorner,
          color: randomTheme.color,
          gradient: randomTheme.gradient,
          flickerType
        })
        resetId = setTimeout(() => {
          setShimmerInfo(null)
          scheduleShimmer()
        }, 1200)
      }, randomDelay)
    }

    scheduleShimmer()

    return () => {
      clearTimeout(timerId)
      clearTimeout(resetId)
    }
  }, [windowMode, barActive])

  const formatCommandList = useCallback((
    builtinCmds: typeof COMMANDS,
    customCmds: CustomCommand[]
  ): ListItem[] => {
    let visible = builtinCmds.filter((c) => !hiddenCommands.has(c.name))
    if (defaultCommand) {
      visible = [...visible].sort((a, b) => {
        if (a.name === defaultCommand) return -1
        if (b.name === defaultCommand) return 1
        return 0
      })
    }
    const builtins = visible.map((c) => {
      const shortcut = shortcutFor(c.name)
      return {
        key: c.name,
        label: `/${c.name}`,
        sublabel: shortcut ? `${c.description} · /${shortcut}` : c.description,
        onSelect: () => setValue(c.name === 'settings' ? '/settings' : `/${c.name} `)
      }
    })
    const custom = customCmds.map((c) => {
      const detail = c.folder !== undefined ? `Browse ${c.folder}` : (c.action ?? '')
      return {
        key: `custom-${c.command}`,
        label: `/${c.command}`,
        sublabel: c.label ? `${c.label} — ${detail}` : detail,
        onSelect: () => setValue(`/${c.command} `)
      }
    })
    return [...builtins, ...custom]
  }, [shortcutFor, hiddenCommands, defaultCommand])

  const runCommand = useCallback((cmd: CommandName, item: SearchResultItem): void => {
    if (item.value && !item.value.startsWith('__')) {
      navigator.clipboard?.writeText(item.value).catch(() => {})
    }
    window.api.executeCommand(cmd, item, query).then(handleExecuteResult)
  }, [query])

  const runFromHistory = useCallback((h: HistoryEntry): void => {
    window.api.executeCommand(h.command, { label: h.label, value: h.value }, h.query).then(handleExecuteResult)
  }, [])

  const items: ListItem[] = useMemo(() => {
    if (value === '') {
      if (historyEnabled) {
        return history.map((h) => ({
          key: `${h.command}-${h.query}-${h.timestamp}`,
          label: h.label,
          sublabel: `/${h.command} ${h.query}`,
          onSelect: () => runFromHistory(h)
        }))
      }
      return formatCommandList(COMMANDS, customCommands)
    }
    if (showingCommandList) {
      return formatCommandList(filteredCommands, filteredCustomCommands)
    }
    if (command === 'calc') {
      return []
    }
    if (command) {
      return results.map((r) => ({
        key: `${r.value}|${r.label}`,
        label: r.label,
        sublabel: r.sublabel,
        completion: r.completion,
        onSelect: () => {
          if (r.disabled) return
          if (r.completion !== undefined) {
            setValue(r.completion)
            inputRef.current?.focus()
            return
          }
          if (command === 'custom' && r.isDirectory) {
            // A folder-type custom command's drill-down result — r.value is a bare relPath
            // (see main/commands/custom.ts), so rebuild "/<name> <relPath>/" using whichever
            // name the user actually typed (query is "<name> <rest>" for custom commands).
            const cmdName = query.split(' ')[0]
            setValue(r.value ? `/${cmdName} ${r.value}/` : `/${cmdName} `)
            inputRef.current?.focus()
            return
          }
          if (command === 'gif' && r.isDirectory) {
            // /gif's query is just the raw text after "/gif " (no compound "<name> <rest>"
            // encoding like "custom"), so the drill-down rebuild is simpler.
            setValue(r.value ? `/gif ${r.value}/` : '/gif ')
            inputRef.current?.focus()
            return
          }
          runCommand(command, r)
        }
      }))
    }
    return []
  }, [
    value,
    historyEnabled,
    history,
    runFromHistory,
    formatCommandList,
    customCommands,
    showingCommandList,
    filteredCommands,
    filteredCustomCommands,
    command,
    results,
    query,
    runCommand
  ])

  // Tab only ever does one of two things — fill in a result's completion, or drill into a
  // command from the "/" list — so the footer hint should only appear when the active item
  // actually supports one of those, instead of always claiming "Tab Complete".
  const activeItem = items[activeIndex]
  const tabHintLabel =
    activeItem?.completion !== undefined ? 'Complete' : showingCommandList && activeItem ? 'Select' : null

  function handleExecuteResult(error: string | null): void {
    if (error) {
      setCommandError(error)
      setTimeout(() => setCommandError((current) => (current === error ? null : current)), 5000)
    } else {
      setCommandError(null)
      if (windowMode === 'bar') {
        window.api.barDeactivate()
      } else {
        window.api.hidePalette()
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (items.length > 0 ? (i + 1) % items.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (items.length > 0 ? (i - 1 + items.length) % items.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (command === 'calc') {
        if (calcResult !== null) {
          navigator.clipboard.writeText(calcResult)
          if (windowMode === 'bar') {
            window.api.barDeactivate()
          } else {
            window.api.hidePalette()
          }
        }
        return
      }
      const item = items[activeIndex]
      item?.onSelect()
    } else if (e.key === 'Tab') {
      const item = items[activeIndex]
      if (item?.completion !== undefined) {
        e.preventDefault()
        setValue(item.completion)
      } else if (showingCommandList && item) {
        e.preventDefault()
        item.onSelect()
      }
    }
  }

  if (windowMode === 'bar' && moveMode) {
    return (
      <div
        className="palette palette-bar-move"
        title="Drag to move — click here or press Escape to drop it"
        onClick={() => window.api.moveModeToggle()}
      >
        <span className="move-handle-icon">✥</span>
      </div>
    )
  }

  if (windowMode === 'bar' && !barActive) {
    return (
      <div
        className={`palette palette-bar-icon ${shimmerInfo ? `icon-shimmer shimmer-${shimmerInfo.corner}${shimmerInfo.flickerType ? ` has-flicker-${shimmerInfo.flickerType}` : ''}` : ''}`}
        style={
          shimmerInfo
            ? ({
                '--shimmer-color': shimmerInfo.color,
                '--shimmer-gradient': shimmerInfo.gradient
              } as React.CSSProperties)
            : undefined
        }
      >
        <button
          className="bar-icon-button"
          title={paletteHotkey ? `Open command bar (${paletteHotkey})` : 'Open command bar'}
          // Deliberately doesn't flip barActive itself — main's 'bar-activated' does that,
          // arriving with the geometry the grow animation needs. Setting it here too would
          // paint the palette at full size for a frame before that geometry lands.
          onClick={() => window.api.barActivate()}
        >
          {'/'}
        </button>
      </div>
    )
  }

  // The grow animation is armed only for the frame right after activation (growOrigin is
  // cleared on animationend), so ordinary re-renders don't replay it. The origin/scale come
  // from main because only it knows where the icon was relative to the new window bounds.
  const paletteClassName = [
    'palette',
    windowMode === 'bar' ? 'palette-bar' : '',
    disableMouseInput ? 'disable-mouse-input' : '',
    growPhase === 'pending' ? 'grow-pending' : '',
    growPhase === 'running' ? 'grow-in' : '',
    growPhase === 'collapsing' ? 'grow-out' : ''
  ]
    .filter(Boolean)
    .join(' ')
  // Scoped to the palette's own animation — animationend bubbles, so a descendant's
  // animation must not be able to clear the grow state out from under it.
  const onGrowEnd = (e: React.AnimationEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget) return
    setGrowOrigin(null)
    setGrowPhase(null)
  }
  const growStyle = growOrigin
    ? ({
        '--grow-origin-x': `${growOrigin.originX}%`,
        '--grow-origin-y': `${growOrigin.originY}%`,
        '--grow-scale': growOrigin.scale
      } as React.CSSProperties)
    : undefined

  if (isSettingsMode) {
    const filterText = value.startsWith('/settings ')
      ? value.slice(10)
      : value.startsWith('/config ')
        ? value.slice(8)
        : ''
    return (
      <div className={paletteClassName} style={growStyle} onAnimationEnd={onGrowEnd}>
        <ConfigManager
          initialFilter={filterText}
          onExit={(exitVal) => {
            if (windowMode === 'bar' && exitVal === undefined) {
              window.api.barDeactivate()
            } else {
              setValue(exitVal !== undefined ? exitVal : getDefaultValue())
            }
          }}
        />
      </div>
    )
  }

  return (
    <div
      className={paletteClassName}
      style={growStyle}
      onAnimationEnd={onGrowEnd}
      onMouseDown={(e) => {
        if (
          e.target !== inputRef.current &&
          !(e.target instanceof HTMLInputElement) &&
          !(e.target instanceof HTMLTextAreaElement)
        ) {
          e.preventDefault()
          inputRef.current?.focus()
        }
      }}
    >
      <input
        ref={inputRef}
        className="palette-input"
        value={value}
        placeholder="Type to search, / for commands, /settings for config..."
        autoFocus={windowMode === 'popup'}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {hotkeyError && <div className="palette-banner">{hotkeyError}</div>}
      {commandError && <div className="palette-banner">{commandError}</div>}
      {command === 'calc' && (
        <div className="calc-result">{calcResult ?? (query ? 'Invalid expression' : 'Enter an expression')}</div>
      )}
      {command !== 'calc' && (
        <ul
          className={ignoreMouse || disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}
          onMouseMove={(e) => {
            if (disableMouseInput) return
            const last = lastMousePosRef.current
            if (last && (last.x !== e.clientX || last.y !== e.clientY)) {
              if (ignoreMouse) setIgnoreMouse(false)
            }
            lastMousePosRef.current = { x: e.clientX, y: e.clientY }
          }}
        >
          {items.length === 0 && (
            <li className="palette-empty">
              {isSearching && !showingCommandList ? 'Searching…' : 'No results'}
            </li>
          )}
          {items.map((item, idx) => (
            <li
              key={item.key}
              ref={idx === activeIndex ? activeItemRef : undefined}
              className={idx === activeIndex ? 'palette-item active' : 'palette-item'}
              onMouseEnter={() => {
                if (!ignoreMouse) setActiveIndex(idx)
              }}
              onClick={item.onSelect}
            >
              <span className="palette-item-label">{item.label}</span>
              {item.sublabel && <span className="palette-item-sublabel">{item.sublabel}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="palette-footer">
        <span className="palette-footer-hint">
          <kbd className="palette-kbd">↵</kbd> {command === 'calc' ? 'Copy' : 'Select'}
        </span>
        {tabHintLabel && (
          <span className="palette-footer-hint">
            <kbd className="palette-kbd">Tab</kbd> {tabHintLabel}
          </span>
        )}
        <span className="palette-footer-hint">
          <kbd className="palette-kbd">Esc</kbd> Close
        </span>
        {value === '' && (
          <span className="palette-footer-hint">
            <kbd className="palette-kbd">/</kbd> Commands
          </span>
        )}
      </div>
    </div>
  )
}
