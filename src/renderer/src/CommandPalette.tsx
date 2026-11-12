import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { flushSync } from 'react-dom'
import {
  COMMANDS,
  type CommandName,
  type SearchResultItem,
  type HistoryEntry,
  type CustomCommand,
  type CommandLayout,
  DEFAULT_COMMAND_LAYOUT,
  type ShelfModuleId,
  DEFAULT_SHELF_ICONS,
  type FocusTimerState,
  type GitRepoStatus
} from '../../shared/types'
import ConfigManager from './ConfigManager'
import { FocusTimerPanel, GitStatusPanel, ProfilePanel, SystemManagementPanel, type WingetSubTab } from './ShelfPanels'
import { windowMode } from './windowMode'
import { formatAccelerator } from './accelerator'
import { useGrowAnimation } from './useGrowAnimation'
import { useCornerShimmer } from './useCornerShimmer'
import { DockIdleView } from './dock/DockBarViews'

interface ListItem {
  key: string
  label: string
  sublabel?: string
  badge?: string
  section?: string
  sectionIcon?: string
  // Set when this item fills the input rather than running anything — lets Tab accept it
  // without also triggering Enter's "run" behavior for regular result items.
  completion?: string
  onSelect: (elevated?: boolean) => void
}

const COMMAND_ICONS: Record<string, string> = {
  search: '🔍',
  app: '🚀',
  teams: '💬',
  mail: '✉️',
  fav: '⭐',
  git: '🌿',
  repo: '🔀',
  http: '🌐',
  json: '{}',
  regex: '.*',
  cron: '⏲️',
  term: '>_',
  custom: '⚡',
  docker: '🐳',
  env: '🌱',
  expmod: '📦',
  ssh: '🖥️',
  proc: '⚙️',
  svc: '🛠️',
  wsl: '🐧',
  pkg: '📦',
  system: '🧰',
  shortcuts: '⌨️',
  clip: '📎',
  diff: '⇄',
  cert: '🔒',
  curl: '📡',
  dns: '🧭',
  key: '⌨️',
  calc: '🧮',
  snippet: '📋',
  case: 'Aa',
  color: '🎨',
  uuid: '🆔',
  hash: '#️⃣',
  pwd: '🔑',
  tz: '🌍',
  unit: '📏',
  qr: '📱',
  mime: '📄',
  lookup: '🗂️',
  lorem: '📝',
  text: '¶',
  url: '🔗',
  emoji: '😀',
  gif: '🎞️',
  g: '🔎',
  pt: '🧰',
  focus: '🪟',
  timer: '⏱️',
  jobs: '⏰',
  textual: '🐍',
  ip: '🖧',
  port: '🔌',
  chmod: '🛡️',
  profile: '👤',
  settings: '⚙️',
  notifications: '🔔',
  default: '📌',
  history: '🕒',
  view: '👁️',
  show: '🔆',
  hide: '🌙',
  control: '🖱️',
  release: '🔓',
  restart: '🔄',
  exit: '🚪'
}

function getIconForCommand(name: string): string {
  return COMMAND_ICONS[name] ?? '⚡'
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
    return { command: null, query: raw.slice(1) }
  }
  const name = raw.slice(1, spaceIdx)
  const rest = raw.slice(spaceIdx + 1)
  if (name === 'settings' || name === 'config') return { command: 'settings', query: rest }
  if (name === 'repo') return { command: 'repo', query: rest }
  if (name === 'notifications' || name === 'notify') return { command: 'notifications', query: rest }
  if (name === 'timer') return { command: 'timer', query: rest }
  if (name === 'cert' || name === 'ssl') return { command: 'cert', query: rest }
  if (name === 'dns' || name === 'dig') return { command: 'dns', query: rest }
  if (name === 'key' || name === 'kbd') return { command: 'key', query: rest }
  if (name === 'proc' || name === 'ps') return { command: 'proc', query: rest }
  if (name === 'pkg' || name === 'winget') return { command: 'pkg', query: rest }
  if (name === 'system' || name === 'sys') return { command: 'system', query: rest }
  if (name === 'shortcuts' || name === 'sc' || name === 'hotkeys') return { command: 'shortcuts', query: rest }
  if (name === 'show') return { command: 'show', query: rest }
  if (name === 'hide') return { command: 'hide', query: rest }
  if (name === 'google') return { command: 'g', query: rest }
  if (name === 'powertoys') return { command: 'pt', query: rest }
  if (name === 'textual' || name === 'tui') return { command: 'textual', query: rest }
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
  const [summonPulse, setSummonPulse] = useState(false)
  const [summonColor, setSummonColor] = useState<string | null>(null)
  const [summonGlow, setSummonGlow] = useState<string | null>(null)
  const [dockFading, setDockFading] = useState(false)
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
  const [settingsTarget, setSettingsTarget] = useState<string | null>(null)
  const [layout, setLayout] = useState<CommandLayout>(DEFAULT_COMMAND_LAYOUT)
  const [dockLayout, setDockLayout] = useState<'horizontal' | 'circle' | 'shelf'>('shelf')
  const [shelfIcons, setShelfIcons] = useState<ShelfModuleId[]>(DEFAULT_SHELF_ICONS)
  const [focusState, setFocusState] = useState<FocusTimerState | null>(null)
  const [gitStatus, setGitStatus] = useState<GitRepoStatus | null>(null)
  const [gitBranches, setGitBranches] = useState<string[]>([])
  const [gitSubTab, setGitSubTab] = useState<'branches' | 'watchers'>('branches')
  const [gitWatchersCount, setGitWatchersCount] = useState(0)
  const [activeModuleView, setActiveModuleView] = useState<'focus' | 'git' | 'profile' | 'system' | null>(null)
  const [systemSubTab, setSystemSubTab] = useState<WingetSubTab>('updates')
  const [wingetUpdatesCount, setWingetUpdatesCount] = useState(0)
  const [scheduledJobsCount, setScheduledJobsCount] = useState(0)
  const [shortcutsActive, setShortcutsActive] = useState(false)
  const [termUnread, setTermUnread] = useState(false)
  const [notifyCount, setNotifyCount] = useState(0)
  const [shelfPaletteActive, setShelfPaletteActive] = useState(false)
  // Shelf-mode only: collapses the icon row down to a thin glowing pill after the dock
  // has sat idle at rest for autoReturnDelaySec — expands back to full icons on click.
  const [shelfCollapsed, setShelfCollapsed] = useState(false)
  const [autoReturnDelaySec, setAutoReturnDelaySec] = useState(8)
  const [dockGlowColor, setDockGlowColor] = useState<string>('')
  const [dockGlowStyle, setDockGlowStyle] = useState<'breathing' | 'steady' | 'stealth'>('breathing')
  // Bumped on every shelf icon click to re-arm the idle-collapse timer below — see its effect.
  const [shelfInteractionTick, setShelfInteractionTick] = useState(0)
  const [activeShelfModule, setActiveShelfModule] = useState<string | null>(null)
  const shimmerInfo = useCornerShimmer(
    windowMode === 'bar' && !barActive && dockGlowStyle !== 'stealth' && !shelfCollapsed
  )
  // Dock home & idle tracking for circular orbit revolving
  const [isDockAtHome, setIsDockAtHome] = useState(true)
  const [isOrbitIdle, setIsOrbitIdle] = useState(false)
  const orbitIdleTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const mod =
      settingsTarget !== null
        ? 'settings'
        : activeModuleView === 'system' && systemSubTab === 'jobs'
          ? 'jobs'
          : activeModuleView
    window.api.setPaletteModule?.(mod)
  }, [activeModuleView, systemSubTab, settingsTarget])

  const markOrbitActivity = useCallback(() => {
    setIsOrbitIdle(false)
    if (orbitIdleTimeoutRef.current) {
      clearTimeout(orbitIdleTimeoutRef.current)
    }
    orbitIdleTimeoutRef.current = setTimeout(() => {
      setIsOrbitIdle(true)
    }, 15000)
  }, [])

  useEffect(() => {
    if (isDockAtHome && !shelfPaletteActive && !barActive) {
      markOrbitActivity()
    } else {
      setIsOrbitIdle(false)
      if (orbitIdleTimeoutRef.current) {
        clearTimeout(orbitIdleTimeoutRef.current)
        orbitIdleTimeoutRef.current = null
      }
    }
    return () => {
      if (orbitIdleTimeoutRef.current) {
        clearTimeout(orbitIdleTimeoutRef.current)
        orbitIdleTimeoutRef.current = null
      }
    }
  }, [isDockAtHome, shelfPaletteActive, barActive, markOrbitActivity])
  // Where the icon sat inside the now-full-size window, so the palette can grow out of it
  // (see barWindow.ts's activateBar / revealPaletteWindow in main/index.ts). Shared with
  // NotificationPanel and Terminal — see useGrowAnimation.
  const { growPhase, setGrowOrigin, setGrowPhase, growClassNames, growStyle, onGrowEnd } =
    useGrowAnimation()
  // Softens page-to-page switches while the dock is already open (e.g. Git -> Focus) with
  // a quick fade-out/fade-in instead of the instant cut that used to make switching feel
  // jerky. Separate from growPhase, which only plays on a fresh open/close — see
  // onPaletteShown below for how the two interact.
  const [pageFade, setPageFade] = useState<'out' | 'in' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeItemRef = useRef<HTMLElement>(null)
  const gridContainerRef = useRef<HTMLDivElement>(null)
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

  const activeModuleViewRef = useRef(activeModuleView)
  useEffect(() => {
    activeModuleViewRef.current = activeModuleView
  }, [activeModuleView])

  const isSettingsMode = settingsTarget !== null
  const isSettingsModeRef = useRef(isSettingsMode)
  useEffect(() => {
    isSettingsModeRef.current = isSettingsMode
  }, [isSettingsMode])

  const getDefaultValue = useCallback(() => (historyEnabledRef.current ? '' : '/'), [])

  const focusSearchInput = useCallback(() => {
    if (isSettingsModeRef.current || activeModuleViewRef.current !== null) return
    const input = inputRef.current
    if (!input) return
    input.focus()
    if (document.activeElement !== input) {
      requestAnimationFrame(() => {
        if (!isSettingsModeRef.current && activeModuleViewRef.current === null) {
          inputRef.current?.focus()
        }
      })
    }
  }, [])

  const customNames = new Set(customCommands.map((c) => c.command))
  const { command, query } = parseInput(value, shortcuts, customNames, defaultCommand)

  const folderMatch = value.match(/^\/([^/\s]+)\/(.*)$/)
  const activeFolder = folderMatch
    ? layout.folders.find(
      (f) =>
        f.name.toLowerCase() === folderMatch[1].toLowerCase() ||
        f.id.toLowerCase() === folderMatch[1].toLowerCase() ||
        f.id.toLowerCase() === `folder:${folderMatch[1].toLowerCase()}`
    )
    : null
  const folderSubQuery = folderMatch ? folderMatch[2].trim().toLowerCase() : ''

  const showingCommandList = value.startsWith('/') && command === null && !isSettingsMode
  const shortcutFor = useCallback(
    (name: CommandName): string | undefined =>
      Object.entries(shortcuts).find(([, cmd]) => cmd === name)?.[0],
    [shortcuts]
  )

  const isKnownCommandName = useCallback(
    (name: string): boolean => {
      const lower = name.toLowerCase()
      if (COMMANDS.some((c) => c.name.toLowerCase() === lower)) return true
      if (['settings', 'config', 'g', 'google', 'powertoys', 'pt', 'exit', 'quit', 'notify', 'timer', 'ssl', 'dig', 'kbd', 'sys', 'system', 'winget', 'ps', 'shortcuts', 'sc', 'hotkeys'].includes(lower)) return true
      if (Object.keys(shortcuts).some((k) => k.toLowerCase() === lower)) return true
      if (customCommands.some((c) => c.command.toLowerCase() === lower)) return true
      if (layout.folders.some((f) => f.name.toLowerCase() === lower || f.id.toLowerCase() === lower)) return true
      return false
    },
    [shortcuts, customCommands, layout.folders]
  )

  const refreshHistory = useCallback(() => {
    window.api.getHistory().then(setHistory)
  }, [])

  const refreshSettings = useCallback(() => {
    const applySettingsObj = (settings: Record<string, unknown> | undefined | null): void => {
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
      if (typeof settings.dockLayout === 'string') {
        setDockLayout(settings.dockLayout as 'horizontal' | 'circle' | 'shelf')
      }
      if (Array.isArray(settings.shelfIcons) && settings.shelfIcons.length > 0) {
        setShelfIcons(settings.shelfIcons as ShelfModuleId[])
      }
      if (typeof settings.autoReturnDelaySec === 'number') {
        setAutoReturnDelaySec(settings.autoReturnDelaySec)
      }
      if (typeof settings.dockGlowColor === 'string') {
        setDockGlowColor(settings.dockGlowColor.trim())
      }
      if (typeof settings.dockGlowStyle === 'string') {
        setDockGlowStyle(settings.dockGlowStyle as 'breathing' | 'steady' | 'stealth')
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
    }

    if (window.api.getSettings) {
      window.api.getSettings().then((s) => applySettingsObj(s as unknown as Record<string, unknown>))
    } else {
      window.api.getConfigEntries('settings').then((list) => applySettingsObj(list[0]))
    }

    window.api.getNotifications?.().then((items) => {
      setNotifyCount(items.filter((n) => !n.read).length)
    })
  }, [])

  const refreshGit = useCallback((includeBranches = windowMode !== 'bar') => {
    window.api.getGitRepoStatus?.().then(setGitStatus)
    if (includeBranches) {
      window.api.getGitBranches?.().then(setGitBranches)
    }
    window.api.getGitWatchers?.().then((list) => {
      if (Array.isArray(list)) {
        setGitWatchersCount(list.filter((w) => w.enabled).length)
      }
    })
  }, [])

  // The palette hotkey is editable from Settings, so this re-runs on config-changed too.
  const refreshHotkeys = useCallback(() => {
    window.api.getHotkeys().then((hotkeys) => setPaletteHotkey(formatAccelerator(hotkeys.palette)))
  }, [])

  const refreshCustomCommands = useCallback(() => {
    window.api.listCustomCommands().then(setCustomCommands)
  }, [])

  const refreshLayout = useCallback(() => {
    window.api.getCommandLayout().then(setLayout)
  }, [])

  useEffect(() => {
    refreshHistory()
    refreshSettings()
    refreshHotkeys()
    refreshCustomCommands()
    refreshLayout()
    refreshGit()
    window.api.getScheduledJobs?.().then((jobs) => {
      if (Array.isArray(jobs)) {
        setScheduledJobsCount(jobs.filter((j) => j.enabled).length)
      }
    })
    window.api.getFocusTimerState?.().then(setFocusState)
    window.api.getDockIsHome?.().then((isHome) => {
      setIsDockAtHome(isHome)
      if (isHome) markOrbitActivity()
    })
    const unsubTick = window.api.onFocusTimerTick?.((state) => setFocusState(state))
    const unsubDone = window.api.onFocusTimerComplete?.(() => {
      window.api.getFocusTimerState?.().then(setFocusState)
    })

    // Each onX call below subscribes an ipcRenderer listener that outlives this component
    // unless explicitly removed — without unsubscribing here, every remount (React effect
    // re-run in StrictMode, Vite HMR in dev) would pile on another listener on top of the
    // old ones instead of replacing them.
    const unsubscribers = [
      window.api.onPaletteShown((mode, growOrigin) => {
        const applyMode = (): void => {
          flushSync(() => {
            if (mode === 'settings') {
              setActiveModuleView(null)
              setSettingsTarget('settings')
            } else if (mode === 'focus') {
              setSettingsTarget(null)
              setActiveModuleView('focus')
            } else if (mode === 'git') {
              setSettingsTarget(null)
              setActiveModuleView('git')
            } else if (mode === 'profile') {
              setSettingsTarget(null)
              setActiveModuleView('profile')
            } else if (mode === 'system') {
              setSettingsTarget(null)
              setSystemSubTab('updates')
              setActiveModuleView('system')
            } else if (mode === 'jobs') {
              setSettingsTarget(null)
              setSystemSubTab('jobs')
              setActiveModuleView('system')
            } else {
              setSettingsTarget(null)
              setActiveModuleView(null)
              setValue((val) => (val === '' || val === '/' ? getDefaultValue() : val))
              if (windowMode === 'bar') setBarActive(true)
            }
            // Set in the SAME flushSync as the mode change above (not from a separate
            // palette-grow-origin listener) — growPhase:'pending' is what makes the CSS
            // paint the content invisible until the grow-in animation actually starts.
            // Setting it from a second, independently-delivered IPC message raced
            // setOpacity(1) in main: the window could turn opaque before that second
            // message arrived, showing the panel at full size for a frame before it
            // visibly reset to the animation's icon-sized start.
            if (growOrigin) {
              setGrowOrigin(growOrigin)
              setGrowPhase('pending')
            }
          })
        }

        const wasShowingAPage = isSettingsModeRef.current || activeModuleViewRef.current !== null
        if (!growOrigin && wasShowingAPage) {
          // Page-to-page switch while already open (e.g. Git -> Focus) — main keeps the
          // window visible throughout this case (see revealPaletteWindow), so a plain
          // instant swap read as a jerky cut. Fade the current view out, swap content
          // while invisible, then fade the new view in — a real crossfade rather than
          // the window-level opacity trick fresh opens/closes use.
          flushSync(() => setPageFade('out'))
          setTimeout(() => {
            // applyMode() unmounts the old branch's <div> and mounts a new one for the
            // new mode (each activeModuleView value is a separate early-return), so this
            // is a brand-new element with no prior opacity to transition from — staying
            // on 'out' for its first paint (rather than jumping straight to 'in') gives
            // the browser something to actually transition away from on the next frame.
            flushSync(() => applyMode())
            requestAnimationFrame(() => {
              setPageFade('in')
              setTimeout(() => setPageFade(null), 180)
            })
          }, 90)
        } else {
          applyMode()
        }

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.api.notifyPaletteReady?.()
          })
        })
        if (mode === 'settings') {
          refreshSettings()
        } else if (mode === 'focus') {
          window.api.getFocusTimerState?.().then(setFocusState)
        } else if (mode === 'git') {
          refreshGit(true)
        } else if (mode === 'profile') {
          // profile ready
        } else if (mode === 'system' || mode === 'jobs') {
          // system / jobs ready
        } else {
          refreshHistory()
          refreshSettings()
          focusSearchInput()
          setTimeout(focusSearchInput, 50)
          setTimeout(focusSearchInput, 100)
        }
      }),
      window.api.onPaletteFocused?.(() => {
        focusSearchInput()
        setTimeout(focusSearchInput, 50)
        setTimeout(focusSearchInput, 100)
      }),
      // Fires for both activation paths (icon click and hotkey), so it's the one place
      // that needs to arm the grow animation.
      window.api.onBarActivated((origin) => {
        setBarActive(true)
        setGrowOrigin(origin)
        setGrowPhase('pending')
        setValue((val) => (val === '' || val === '/' ? getDefaultValue() : val))
        setTimeout(focusSearchInput, 50)
        setTimeout(focusSearchInput, 100)
      }),
      window.api.onBarCollapsing((origin) => {
        setGrowOrigin(origin)
        setGrowPhase('collapsing')
      }),
      window.api.onBarCollapsed(() => {
        setBarActive(false)
        setGrowOrigin(null)
        setGrowPhase(null)
        setActiveModuleView(null)
        setValue(getDefaultValue())
        inputRef.current?.blur()
      }),
      // Shelf mode's equivalent of onBarCollapsed — main sends this only after it has
      // already dropped the window's opacity to 0 (see closePaletteWindow), so resetting
      // state here paints invisibly instead of racing the native blur event.
      window.api.onPaletteHidden?.(() => {
        setSettingsTarget(null)
        setActiveModuleView(null)
        setValue(getDefaultValue())
        setCalcResult(null)
        setCommandError(null)
        setIsSearching(false)
        setActiveIndex(0)
        setIgnoreMouse(true)
        lastMousePosRef.current = null
      }),
      // Shelf mode's equivalent of onBarCollapsing — shrinks the panel back into its
      // shelf icon on close, same as the notification and terminal windows. The open
      // side of this (growing out of the icon) is handled inline in onPaletteShown
      // above instead of a separate onPaletteGrowOrigin message — see its comment.
      window.api.onPaletteCollapsing?.((origin) => {
        setGrowOrigin(origin)
        setGrowPhase('collapsing')
      }),
      window.api.onDockSummoned?.((data) => {
        setIsDockAtHome(false)
        setIsOrbitIdle(false)
        if (orbitIdleTimeoutRef.current) {
          clearTimeout(orbitIdleTimeoutRef.current)
          orbitIdleTimeoutRef.current = null
        }
        if (data?.color) setSummonColor(data.color)
        if (data?.glow) setSummonGlow(data.glow)
        setSummonPulse(true)
        setTimeout(() => setSummonPulse(false), 900)
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
      window.api.onCommandLayoutChanged(() => {
        refreshLayout()
      }),
      window.api.onHotkeyError((hotkey) => {
        setHotkeyError(`Couldn't register hotkey "${hotkey}" — keeping the previous one.`)
        setTimeout(() => setHotkeyError(null), 5000)
      }),
      window.api.onTerminalHotkeyError((hotkey) => {
        setHotkeyError(`Couldn't register terminal hotkey "${hotkey}" — keeping the previous one.`)
        setTimeout(() => setHotkeyError(null), 5000)
      }),
      window.api.onDockFade?.((dir) => {
        setDockFading(dir === 'out')
        if (dir === 'in') {
          setIsDockAtHome(true)
          markOrbitActivity()
        }
      }),
      window.api.onDockHomeState?.((isHome) => {
        setIsDockAtHome(isHome)
        if (isHome) {
          markOrbitActivity()
        } else {
          setIsOrbitIdle(false)
          if (orbitIdleTimeoutRef.current) {
            clearTimeout(orbitIdleTimeoutRef.current)
            orbitIdleTimeoutRef.current = null
          }
        }
      }),
      window.api.onTermUnreadActivity?.((unread) => setTermUnread(unread)),
      window.api.onNotificationsUpdated?.((items) => {
        setNotifyCount(items.filter((n) => !n.read).length)
      }),
      window.api.onShelfPaletteActive?.((active, mode) => {
        setShelfPaletteActive(active)
        setActiveShelfModule(mode ?? (active ? 'bar' : null))
      }),
      window.api.onWingetUpdatesCount?.((count) => {
        setWingetUpdatesCount(count)
      }),
      window.api.onShortcutsActive?.((active) => {
        setShortcutsActive(active)
      }),
      window.api.onGitWatchersUpdated?.((list) => {
        if (Array.isArray(list)) {
          setGitWatchersCount(list.filter((w) => w.enabled).length)
        }
      }),
      window.api.onScheduledJobsUpdated?.((jobs) => {
        if (Array.isArray(jobs)) {
          setScheduledJobsCount(jobs.filter((j) => j.enabled).length)
        }
      })
    ]
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe?.()
      unsubTick?.()
      unsubDone?.()
    }
  }, [refreshHistory, refreshSettings, refreshHotkeys, refreshCustomCommands, refreshGit, getDefaultValue, markOrbitActivity])

  useEffect(() => {
    setActiveIndex(0)
    if (!command) {
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
      const timer = setTimeout(() => {
        window.api.runCalc(expr).then((res: string | null) => {
          if (requestId === requestIdRef.current) setCalcResult(res)
        })
      }, 25)
      return () => clearTimeout(timer)
    }

    const heavyCommands = new Set([
      'cert',
      'dns',
      'proc',
      'svc',
      'pkg',
      'wsl',
      'expmod',
      'port',
      'docker'
    ])
    const trimmedQuery = query.trim()
    const debounceMs =
      trimmedQuery === '' ? 0 : heavyCommands.has(command) ? 200 : 35

    setIsSearching(true)
    if (debounceMs === 0) {
      window.api.search(command, query).then((res: SearchResultItem[]) => {
        if (requestId === requestIdRef.current) {
          setResults(res)
          setIsSearching(false)
        }
      })
      return
    }

    const timer = setTimeout(() => {
      window.api.search(command, query).then((res: SearchResultItem[]) => {
        if (requestId === requestIdRef.current) {
          setResults(res)
          setIsSearching(false)
        }
      })
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [command, query])

  useEffect(() => {
    // Native window blur fires at the same instant main decides to close the palette —
    // there's no guarantee main's opacity-drop has actually happened yet by the time this
    // runs, so this must NOT touch visible state (that used to flash the reset content
    // while the window was still fully opaque). It only dispatches the bar-mode collapse
    // side effects; the actual state reset happens in the 'palette-hidden' handler below,
    // which main sends only after opacity is already 0.
    const handleBlur = (): void => {
      if (windowMode === 'bar') {
        if (moveModeRef.current) {
          window.api.moveModeToggle()
        } else if (barActive) {
          window.api.barDeactivate()
        }
      }
    }
    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [barActive, getDefaultValue])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (activeModuleViewRef.current !== null) {
        if (windowMode === 'bar') {
          window.api.barDeactivate()
        } else {
          window.api.hidePalette()
        }
        return
      }
      const defVal = getDefaultValue()
      if (valueRef.current.match(/^\/[^/\s]+\//)) {
        setValue('/')
        return
      }
      const expmodCmdMatch = valueRef.current.match(/^(\/expmod\s+(?:ps|py):[^\s/]+)\/\S+/i)
      if (expmodCmdMatch) {
        setValue(`${expmodCmdMatch[1]} `)
        return
      }
      const expmodModFilterMatch = valueRef.current.match(/^(\/expmod\s+(?:ps|py):\S+\s+)\S/i)
      if (expmodModFilterMatch) {
        setValue(expmodModFilterMatch[1])
        return
      }
      const expmodModMatch = valueRef.current.match(/^\/expmod\s+(ps|py):\S+\s*$/i)
      if (expmodModMatch) {
        setValue(`/expmod ${expmodModMatch[1].toLowerCase()} `)
        return
      }
      const expmodEcoFilterMatch = valueRef.current.match(/^(\/expmod\s+(?:ps|py)\s+)\S/i)
      if (expmodEcoFilterMatch) {
        setValue(expmodEcoFilterMatch[1])
        return
      }
      const cmdWithArgsMatch = valueRef.current.match(/^(\/[a-zA-Z0-9_-]+\s+)\S/)
      if (cmdWithArgsMatch) {
        setValue(cmdWithArgsMatch[1])
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
  }, [barActive, getDefaultValue])

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  // Focus the input whenever the main palette input is mounted (e.g. upon bar activation
  // or when backing out of the /settings config manager view).
  useEffect(() => {
    if (!isSettingsMode && activeModuleView === null) {
      focusSearchInput()
    }
  }, [isSettingsMode, activeModuleView, barActive, windowMode, focusSearchInput])

  // Focus the input once the grow animation leaves 'pending' (when display:none is lifted).
  // During growPhase === 'pending' (the initial 80ms), .palette.grow-pending sets display:none !important,
  // which makes DOM focus() a silent no-op. Once growPhase leaves 'pending', display:none is lifted,
  // so this effect reliably focuses the search input.
  useEffect(() => {
    if (!isSettingsMode && activeModuleView === null && growPhase !== 'pending' && growPhase !== 'collapsing') {
      focusSearchInput()
      const t1 = setTimeout(focusSearchInput, 30)
      const t2 = setTimeout(focusSearchInput, 80)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }
  }, [growPhase, isSettingsMode, activeModuleView, focusSearchInput])

  // Re-focus once the native window actually gains OS focus.
  useEffect(() => {
    let t1: NodeJS.Timeout | null = null
    let t2: NodeJS.Timeout | null = null
    let t3: NodeJS.Timeout | null = null

    const handleWindowFocus = (): void => {
      if (!isSettingsMode && activeModuleView === null) {
        requestAnimationFrame(() => {
          focusSearchInput()
          requestAnimationFrame(focusSearchInput)
        })
        if (t1) clearTimeout(t1)
        if (t2) clearTimeout(t2)
        if (t3) clearTimeout(t3)
        t1 = setTimeout(focusSearchInput, 50)
        t2 = setTimeout(focusSearchInput, 100)
        t3 = setTimeout(focusSearchInput, 180)
      }
    }
    window.addEventListener('focus', handleWindowFocus)
    return () => {
      if (t1) clearTimeout(t1)
      if (t2) clearTimeout(t2)
      if (t3) clearTimeout(t3)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [isSettingsMode, activeModuleView, focusSearchInput])

  // Shelf mode: collapse the icon row to a thin glowing pill after sitting idle at rest
  // for autoReturnDelaySec. Only armed while actually at rest — not while a shelf panel
  // is open, mid-summon-pulse, or mid dock-fade (those already have their own motion).
  // Re-armed on every shelf interaction (shelfInteractionTick), not just on
  // shelfPaletteActive's true/false edges — otherwise repeatedly clicking between panels
  // (which keeps shelfPaletteActive constantly true) let the very first idle timer from
  // before that session of clicking keep counting down in the background and collapse
  // the dock mid-use.
  useEffect(() => {
    if (windowMode !== 'bar' || dockLayout !== 'shelf') return
    if (shelfPaletteActive || summonPulse || dockFading) {
      setShelfCollapsed(false)
      return
    }
    const timerId = setTimeout(() => setShelfCollapsed(true), Math.max(1, autoReturnDelaySec) * 1000)
    return () => clearTimeout(timerId)
  }, [windowMode, dockLayout, shelfPaletteActive, summonPulse, dockFading, autoReturnDelaySec, shelfInteractionTick])

  // Safety guard: if dockLayout is switched to 'shelf' or 'circle' while running in bar mode with barActive = true,
  // immediately reset barActive and trigger deactivation so the palette window never gets stuck at 80px/150px height.
  useEffect(() => {
    if (windowMode === 'bar' && (dockLayout === 'shelf' || dockLayout === 'circle') && barActive) {
      setBarActive(false)
      window.api.barDeactivate?.()
    }
  }, [windowMode, dockLayout, barActive])

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

  const runCommand = useCallback((cmd: CommandName, item: SearchResultItem, elevated = false): void => {
    if (item.value && !item.value.startsWith('__')) {
      navigator.clipboard?.writeText(item.value).catch(() => { })
    }
    window.api.executeCommand(cmd, item, query, elevated).then(handleExecuteResult)
  }, [query])

  const runFromHistory = useCallback((h: HistoryEntry, elevated = false): void => {
    window.api.executeCommand(h.command, { label: h.label, value: h.value }, h.query, elevated).then(handleExecuteResult)
  }, [])

  const formatCommandList = useCallback((): ListItem[] => {
    const selectCommandWithSpace = (cmdName: string): void => {
      const nextVal = `/${cmdName} `
      setValue(nextVal)
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.setSelectionRange(nextVal.length, nextVal.length)
        }
      })
    }

    const selectBuiltin = (name: CommandName, elevated = false) => {
      if (name === 'term') {
        window.api.executeCommand('term', { label: 'term', value: 'term' }, '', elevated).then(handleExecuteResult)
      } else if (name === 'repo') {
        setActiveModuleView('git')
      } else if (name === 'settings') {
        selectCommandWithSpace('settings')
      } else if (name === 'notifications') {
        if (windowMode === 'bar') {
          window.api.barDeactivate()
        } else {
          window.api.hidePalette()
        }
        window.api.notifyOpen?.() ?? window.api.notifyToggle()
      } else if (name === 'timer') {
        setActiveModuleView('focus')
      } else if (name === 'system') {
        setSystemSubTab('updates')
        setActiveModuleView('system')
      } else if (name === 'shortcuts') {
        if (windowMode === 'bar') {
          window.api.barDeactivate()
        } else {
          window.api.hidePalette()
        }
        window.api.shortcutsOpen?.() ?? window.api.shortcutsToggle?.()
      } else if (name === 'show' || name === 'hide') {
        runCommand(name, { label: name === 'show' ? 'Show command dock' : 'Hide command dock', value: name })
      } else {
        selectCommandWithSpace(name)
      }
    }

    const buildCommandCard = (cmdName: string, sectionName: string, sectionIcon: string, isDef = false): ListItem | null => {
      if (hiddenCommands.has(cmdName as CommandName)) return null
      const builtin = COMMANDS.find((c) => c.name === cmdName)
      if (builtin) {
        const shortcut = shortcutFor(builtin.name)
        return {
          key: isDef ? `__default_${builtin.name}` : builtin.name,
          label: `/${builtin.name}`,
          sublabel: builtin.description,
          badge: isDef ? (shortcut ? `★ · /${shortcut}` : '★ Default') : shortcut ? `/${shortcut}` : undefined,
          section: sectionName,
          sectionIcon,
          onSelect: (elevated = false) => selectBuiltin(builtin.name, elevated)
        }
      }
      const custom = customCommands.find((c) => c.command === cmdName)
      if (custom) {
        const detail = custom.folder !== undefined ? `Browse ${custom.folder}` : (custom.action ?? '')
        return {
          key: isDef ? `__default_custom_${custom.command}` : `custom-${custom.command}`,
          label: `/${custom.command}`,
          sublabel: custom.label ? `${custom.label} — ${detail}` : detail,
          badge: isDef ? '★ Default' : 'Custom',
          section: sectionName,
          sectionIcon,
          onSelect: () => selectCommandWithSpace(custom.command)
        }
      }
      return null
    }

    // 1. Inside a subfolder (e.g. if user explicitly typed "/Developer/"):
    if (activeFolder) {
      const items: ListItem[] = [
        {
          key: '__back',
          label: '← All Commands',
          sublabel: 'Return to full categorized grid',
          section: activeFolder.name,
          sectionIcon: activeFolder.icon ?? '📁',
          onSelect: () => setValue('/')
        }
      ]
      for (const cmdName of activeFolder.commands) {
        if (folderSubQuery && !cmdName.toLowerCase().includes(folderSubQuery)) continue
        const card = buildCommandCard(cmdName, activeFolder.name, activeFolder.icon ?? '📁')
        if (card) items.push(card)
      }
      return items
    }

    // 2. Root level with NO search filter typed (just "/" or empty):
    // Expand all folders into categorized grid sections so every option is visible at once!
    if (value === '/' || value === '') {
      const items: ListItem[] = []
      const seen = new Set<string>()

      if (defaultCommand && defaultCommand !== 'none') {
        const defaultItem = buildCommandCard(defaultCommand, 'Pinned & Quick Launch', '✨', true)
        if (defaultItem) {
          items.push(defaultItem)
          seen.add(defaultCommand)
        }
      }

      // Collect root-level non-folder commands first under "Quick Launch"
      for (const item of layout.rootOrder) {
        const isFolder = layout.folders.some((f) => f.id === item || f.name.toLowerCase() === item.toLowerCase())
        if (isFolder || seen.has(item)) continue
        const card = buildCommandCard(item, 'Pinned & Quick Launch', '✨')
        if (card) {
          seen.add(item)
          items.push(card)
        }
      }

      // Expand each folder in rootOrder into its own categorized section
      for (const item of layout.rootOrder) {
        const folder = layout.folders.find((f) => f.id === item || f.name.toLowerCase() === item.toLowerCase())
        if (!folder || seen.has(folder.id)) continue
        seen.add(folder.id)
        for (const cmdName of folder.commands) {
          if (seen.has(cmdName)) continue
          const card = buildCommandCard(cmdName, folder.name, folder.icon ?? '📁')
          if (card) {
            seen.add(cmdName)
            items.push(card)
          }
        }
      }

      // Any remaining folders not listed in rootOrder
      for (const folder of layout.folders) {
        if (seen.has(folder.id)) continue
        seen.add(folder.id)
        for (const cmdName of folder.commands) {
          if (seen.has(cmdName)) continue
          const card = buildCommandCard(cmdName, folder.name, folder.icon ?? '📁')
          if (card) {
            seen.add(cmdName)
            items.push(card)
          }
        }
      }

      // Any remaining built-in or custom commands not in any folder:
      for (const builtin of COMMANDS) {
        if (!seen.has(builtin.name) && !hiddenCommands.has(builtin.name)) {
          const card = buildCommandCard(builtin.name, 'Other Commands', '🧩')
          if (card) {
            seen.add(builtin.name)
            items.push(card)
          }
        }
      }

      for (const custom of customCommands) {
        if (!seen.has(custom.command)) {
          const card = buildCommandCard(custom.command, 'Custom Commands', '⚡')
          if (card) {
            seen.add(custom.command)
            items.push(card)
          }
        }
      }

      return items
    }

    // 3. User typed search filter e.g. "/g" or "/git" or "/calc":
    const needle = value.slice(1).toLowerCase()
    const seen = new Set<string>()
    const scoredCards: Array<{ card: ListItem; score: number }> = []

    const ALIAS_MAP: Partial<Record<CommandName, string[]>> = {
      settings: ['config'],
      g: ['google'],
      pt: ['powertoys'],
      exit: ['quit'],
      notifications: ['notify'],
      cert: ['ssl'],
      dns: ['dig'],
      key: ['kbd'],
      proc: ['ps'],
      pkg: ['winget'],
      system: ['sys'],
      shortcuts: ['sc', 'hotkeys'],
      jobs: ['schedule', 'schedules']
    }

    const visibleBuiltins = COMMANDS.filter((c) => !hiddenCommands.has(c.name))
    for (const builtin of visibleBuiltins) {
      if (seen.has(builtin.name)) continue
      const nameLower = builtin.name.toLowerCase()
      const shortcut = shortcutFor(builtin.name)?.toLowerCase()
      const aliases = ALIAS_MAP[builtin.name] ?? []
      const parentFolder = layout.folders.find((f) => f.commands.includes(builtin.name))
      const exactMatch =
        nameLower === needle ||
        shortcut === needle ||
        aliases.some((al) => al === needle)
      const startsMatch =
        nameLower.startsWith(needle) ||
        (shortcut !== undefined && shortcut.startsWith(needle)) ||
        aliases.some((al) => al.startsWith(needle))
      const nameIncludes =
        nameLower.includes(needle) ||
        aliases.some((al) => al.includes(needle))
      const otherMatch =
        builtin.description.toLowerCase().includes(needle) ||
        Boolean(parentFolder && parentFolder.name.toLowerCase().includes(needle))

      if (!exactMatch && !startsMatch && !nameIncludes && !otherMatch) continue
      seen.add(builtin.name)
      const isDef = builtin.name === defaultCommand
      const card = buildCommandCard(
        builtin.name,
        'Matching Commands',
        '⌘',
        isDef
      )
      if (card) {
        const score = exactMatch ? 0 : startsMatch ? 1 : nameIncludes ? 2 : 3
        scoredCards.push({ card, score })
      }
    }

    for (const custom of customCommands) {
      if (seen.has(custom.command)) continue
      const cmdLower = custom.command.toLowerCase()
      const parentFolder = layout.folders.find((f) => f.commands.includes(custom.command))
      const exactMatch = cmdLower === needle
      const startsMatch = cmdLower.startsWith(needle)
      const nameIncludes = cmdLower.includes(needle)
      const otherMatch =
        Boolean(custom.label && custom.label.toLowerCase().includes(needle)) ||
        Boolean(parentFolder && parentFolder.name.toLowerCase().includes(needle))

      if (!exactMatch && !startsMatch && !nameIncludes && !otherMatch) continue
      seen.add(custom.command)
      const isDef = custom.command === defaultCommand
      const card = buildCommandCard(
        custom.command,
        'Matching Commands',
        '⌘',
        isDef
      )
      if (card) {
        const score = exactMatch ? 0 : startsMatch ? 1 : nameIncludes ? 2 : 3
        scoredCards.push({ card, score })
      }
    }

    scoredCards.sort((a, b) => a.score - b.score)
    const items = scoredCards.map((entry) => entry.card)

    return items
  }, [value, activeFolder, folderSubQuery, layout, hiddenCommands, defaultCommand, shortcutFor, customCommands, runCommand])

  const items: ListItem[] = useMemo(() => {
    if (value === '') {
      const allCommandCards = formatCommandList()
      if (historyEnabled && history.length > 0) {
        const historyItems: ListItem[] = history.map((h) => ({
          key: `history-${h.timestamp}`,
          label: h.label,
          sublabel: `/${h.command}${h.query ? ' ' + h.query : ''}`,
          badge: `/${h.command}`,
          section: 'Recent History',
          sectionIcon: '🕒',
          onSelect: (elevated = false) => runFromHistory(h, elevated)
        }))
        return [...historyItems, ...allCommandCards]
      }
      return allCommandCards
    }
    if (showingCommandList) {
      return formatCommandList()
    }
    if (command === 'calc') {
      return []
    }
    if (command) {
      const cmdDef = COMMANDS.find((c) => c.name === command)
      const sectionLabel = cmdDef ? `/${cmdDef.name} — ${cmdDef.description}` : `/${command}`
      const sectionIcon = getIconForCommand(command)
      return results.map((r) => ({
        key: `${r.value}|${r.label}`,
        label: r.label,
        sublabel: r.sublabel,
        badge: r.completion ? 'Tab' : undefined,
        section: sectionLabel,
        sectionIcon,
        completion: r.completion,
        onSelect: (elevated = false) => {
          if (r.disabled) return
          if (r.completion !== undefined && !r.executeOnEnter) {
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
          if (command === 'settings') {
            if (r.value === '__openConfigFolder') {
              window.api.openConfigFolder()
              if (windowMode === 'bar') {
                window.api.barDeactivate()
              } else {
                window.api.hidePalette()
              }
              return
            }
            const target = r.value.replace(/^__/, '')
            setSettingsTarget(target)
            return
          }
          if (command === 'timer') {
            setActiveModuleView('focus')
            return
          }
          if (command === 'notifications') {
            if (windowMode === 'bar') {
              window.api.barDeactivate()
            } else {
              window.api.hidePalette()
            }
            window.api.notifyOpen?.() ?? window.api.notifyToggle()
            return
          }
          if (command === 'repo') {
            if (r.value === '__openGitWatchers') {
              setGitSubTab('watchers')
              setActiveModuleView('git')
              return
            }
            if (r.value === '__openGitPanel') {
              setGitSubTab('branches')
              setActiveModuleView('git')
              return
            }
            if (r.value.startsWith('__toggleWatcher::')) {
              runCommand(command, r, elevated)
              return
            }
            if (r.value) {
              window.api.setActiveGitRepo?.(r.value).then(() => {
                refreshGit()
                setGitSubTab('branches')
                setActiveModuleView('git')
              })
              return
            }
            setGitSubTab('branches')
            setActiveModuleView('git')
            return
          }
          if (command === 'profile') {
            setActiveModuleView('profile')
            return
          }
          if (command === 'system' || r.value.startsWith('__openSystemPanel::')) {
            if (r.value.startsWith('__openSystemPanel::')) {
              const sub = r.value.split('::')[1] as WingetSubTab
              setSystemSubTab(sub || 'updates')
            } else {
              setSystemSubTab('updates')
            }
            setActiveModuleView('system')
            return
          }
          if (command === 'pkg' && r.value === '__open_system_winget') {
            setSystemSubTab('updates')
            setActiveModuleView('system')
            return
          }
          if (command === 'control' && r.value === '__managePeers') {
            // Jumps straight to the same Settings -> Swap Peers screen /settings would
            // open — reusing that existing peers CRUD UI rather than building a second
            // one, the same way "settings" results above redirect into settingsTarget.
            setSettingsTarget('peers')
            return
          }
          if (command === 'ssh' && r.value === '__manageSshHosts') {
            setSettingsTarget('sshHosts')
            return
          }
          if (command === 'textual' && r.value === '__manageTextualApps') {
            setSettingsTarget('textualApps')
            return
          }
          runCommand(command, r, elevated)
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
    showingCommandList,
    command,
    results,
    query,
    runCommand,
    windowMode
  ])

  // Tab only ever does one of two things — fill in a result's completion, or drill into a
  // command from the "/" list — so the footer hint should only appear when the active item
  // actually supports one of those, instead of always claiming "Tab Complete".
  const activeItem = items[activeIndex]
  const isHistoryActive = activeItem?.key.startsWith('history-')
  const isTextualLaunchActive = useMemo(() => {
    if (command === 'textual') {
      if (!activeItem) return true
      return activeItem.key.startsWith('__app::')
    }
    if (command === 'search' && activeItem?.key.startsWith('textual::__app::')) {
      return true
    }
    if (command === 'custom') {
      const cmdName = query.split(' ')[0]
      const matchedCustom = customCommands.find((c) => c.command === cmdName)
      if (matchedCustom?.textual) return true
    }
    return false
  }, [command, activeItem, query, customCommands])
  const tabHintLabel =
    activeItem?.completion !== undefined
      ? 'Complete'
      : showingCommandList && activeItem
        ? 'Select'
        : value === '' && activeItem
          ? activeItem.key.startsWith('history-') || activeItem.key.startsWith('__default_')
            ? 'Edit'
            : 'Select'
          : null

  const placeholderText = useMemo(() => {
    if (value !== '') return 'Type / for commands, // to manage config...'

    if (activeItem) {
      if (activeItem.key.startsWith('__default_')) {
        const cleanCmd = activeItem.label.replace(/^⭐\s*/, '')
        return `↵ Run ${cleanCmd} · ${activeItem.sublabel ?? 'Default command'}`
      }
      if (activeItem.key.startsWith('history-')) {
        const queryDisplay = activeItem.sublabel?.startsWith('/')
          ? activeItem.sublabel
          : `/${activeItem.sublabel || activeItem.label}`
        return `↵ Run ${queryDisplay}`
      }
      if (activeItem.key.startsWith('folder') || activeItem.label.endsWith('/')) {
        return `↵ Open ${activeItem.label} · Press Enter to browse folder`
      }
      if (activeItem.sublabel) {
        return `↵ Run ${activeItem.label} · ${activeItem.sublabel}`
      }
      return `↵ ${activeItem.label}`
    }

    if (defaultCommand && defaultCommand !== 'none') {
      const defBuiltin = COMMANDS.find((c) => c.name === defaultCommand)
      if (defBuiltin) {
        return `Run /${defBuiltin.name} (${defBuiltin.description}), or type / for commands...`
      }
      const defCustom = customCommands.find((c) => c.command === defaultCommand)
      if (defCustom) {
        return `Run /${defCustom.command}${defCustom.label ? ` (${defCustom.label})` : ''}, or type / for commands...`
      }
      return `Run /${defaultCommand}, or type / for commands...`
    }
    return 'Type to search, / for commands, // to manage config...'
  }, [value, activeItem, defaultCommand, customCommands])

  const activeActionHint = useMemo(() => {
    if (value === '' || !activeItem) return null
    if (activeItem.key.startsWith('folder') || activeItem.label.endsWith('/')) {
      return `↵ Open ${activeItem.label}`
    }
    if (activeItem.completion) {
      return `Tab ${activeItem.completion}`
    }
    if (activeItem.key.startsWith('__default_') || activeItem.label.startsWith('/')) {
      return `↵ ${activeItem.label.replace(/^⭐\s*/, '')}`
    }
    if (command === 'custom' || command === 'term') {
      return '↵ Run'
    }
    return `↵ ${activeItem.label}`
  }, [value, activeItem, command])

  const groupedSections = useMemo(() => {
    const groups: Array<{
      name: string
      icon?: string
      items: Array<{ item: ListItem; flatIndex: number }>
    }> = []
    items.forEach((item, flatIndex) => {
      const secName = item.section || 'Options'
      let group = groups.find((g) => g.name === secName)
      if (!group) {
        group = { name: secName, icon: item.sectionIcon, items: [] }
        groups.push(group)
      }
      group.items.push({ item, flatIndex })
    })
    return groups
  }, [items])

  const navigateGridVertical = useCallback(
    (dir: 1 | -1) => {
      if (items.length === 0) return
      const container = gridContainerRef.current
      if (!container) {
        setActiveIndex((i) => (i + dir + items.length) % items.length)
        return
      }
      const cardEls = Array.from(container.querySelectorAll<HTMLElement>('[data-card-index]'))
      const currentEl = cardEls.find((el) => Number(el.dataset.cardIndex) === activeIndex)
      if (!currentEl) {
        setActiveIndex((i) => (i + dir + items.length) % items.length)
        return
      }
      const curRect = currentEl.getBoundingClientRect()
      const curCenterX = curRect.left + curRect.width / 2
      const curCenterY = curRect.top + curRect.height / 2

      const candidates = cardEls
        .map((el) => {
          const r = el.getBoundingClientRect()
          const cx = r.left + r.width / 2
          const cy = r.top + r.height / 2
          const dy = cy - curCenterY
          return {
            idx: Number(el.dataset.cardIndex),
            cx,
            cy,
            dy,
            dx: Math.abs(cx - curCenterX)
          }
        })
        .filter((c) => (dir === 1 ? c.dy > 20 : c.dy < -20))

      if (candidates.length === 0) {
        // Wrap around to top/bottom row in the closest column
        const allWithRect = cardEls.map((el) => {
          const r = el.getBoundingClientRect()
          return {
            idx: Number(el.dataset.cardIndex),
            cy: r.top + r.height / 2,
            dx: Math.abs(r.left + r.width / 2 - curCenterX)
          }
        })
        if (allWithRect.length === 0) return
        const extremeY =
          dir === 1
            ? Math.min(...allWithRect.map((c) => c.cy))
            : Math.max(...allWithRect.map((c) => c.cy))
        const targetRow = allWithRect.filter((c) => Math.abs(c.cy - extremeY) < 28)
        targetRow.sort((a, b) => a.dx - b.dx)
        if (targetRow[0]) setActiveIndex(targetRow[0].idx)
        return
      }

      const nearestRowY =
        dir === 1
          ? Math.min(...candidates.map((c) => c.cy))
          : Math.max(...candidates.map((c) => c.cy))
      const rowCandidates = candidates.filter((c) => Math.abs(c.cy - nearestRowY) < 28)
      rowCandidates.sort((a, b) => a.dx - b.dx)
      if (rowCandidates[0]) {
        setActiveIndex(rowCandidates[0].idx)
      }
    },
    [items.length, activeIndex]
  )

  function handleKeyDown(e: React.KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'e' && command === 'teams') {
      e.preventDefault()
      setSettingsTarget('teams')
      return
    }
    if (
      command === 'key' &&
      !['Escape', 'Enter', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)
    ) {
      if (!(e.key === 'Backspace' && value === '/key')) {
        if (e.ctrlKey || e.altKey || e.metaKey || e.key.length > 1) {
          const mods: string[] = []
          if (e.ctrlKey) mods.push('Ctrl')
          if (e.altKey) mods.push('Alt')
          if (e.shiftKey) mods.push('Shift')
          if (e.metaKey) mods.push('Super')
          const keyName = ['Control', 'Alt', 'Shift', 'Meta'].includes(e.key) ? '' : e.key
          const combo = [...mods, keyName].filter(Boolean).join('+')
          if (combo) {
            e.preventDefault()
            setValue(`/key ${combo}`)
            return
          }
        }
      }
    }

    if ((e.key === 'Delete' && e.shiftKey) || (e.key === 'Backspace' && e.altKey)) {
      const item = items[activeIndex]
      if (item && item.key.startsWith('history-')) {
        e.preventDefault()
        const timestamp = item.key.replace(/^history-/, '')
        window.api.deleteHistoryEntry?.(timestamp).then((updated) => {
          if (updated) setHistory(updated)
        })
        return
      }
    }
    if (e.key === 'Backspace') {
      const input = inputRef.current
      const selStart = input?.selectionStart ?? value.length
      const selEnd = input?.selectionEnd ?? value.length

      // Only perform whole-word deletion if there is no text range selected
      if (selStart === selEnd) {
        const textBefore = value.slice(0, selStart)
        const textAfter = value.slice(selStart)

        // 1. Folder drilldown in command palette e.g. "/gif funny/" -> back to "/gif "
        const folderDrillMatch = textBefore.match(/^(\/.+\s+)([^/\s]+)\/$/)
        if (folderDrillMatch && (!textAfter || textAfter.length === 0)) {
          e.preventDefault()
          setValue(folderDrillMatch[1])
          return
        }
        // Root folder e.g. "/tools/" -> back to "/"
        const rootFolderMatch = textBefore.match(/^\/([^/\s]+)\/$/)
        if (rootFolderMatch && (!textAfter || textAfter.length === 0)) {
          e.preventDefault()
          setValue('/')
          return
        }

        // 2. Full command name matched (e.g. "/calc", "/calc ", "/tools/calc", "calc ", etc.)
        const cmdMatch = textBefore.match(/^((?:\/)?(?:[^/\s]+\/)*)([^\s/]+)(\s?)$/)
        if (cmdMatch) {
          const prefix = cmdMatch[1] // e.g. "/" or "/tools/" or ""
          const cmdName = cmdMatch[2]
          const space = cmdMatch[3]

          if (isKnownCommandName(cmdName)) {
            e.preventDefault()
            const nextAfter = textAfter.startsWith(' ') && space ? textAfter.slice(1) : textAfter
            const newValue = prefix + nextAfter
            setValue(newValue)
            requestAnimationFrame(() => {
              if (inputRef.current) {
                inputRef.current.setSelectionRange(prefix.length, prefix.length)
              }
            })
            return
          }
        }
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIgnoreMouse(true)
      navigateGridVertical(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIgnoreMouse(true)
      navigateGridVertical(-1)
    } else if (e.key === 'ArrowRight') {
      const input = inputRef.current
      const atEnd = !input || (input.selectionStart === value.length && input.selectionEnd === value.length)
      if (atEnd && items.length > 0) {
        e.preventDefault()
        setIgnoreMouse(true)
        setActiveIndex((i) => (i + 1) % items.length)
      }
    } else if (e.key === 'ArrowLeft') {
      const input = inputRef.current
      const atEnd = !input || (input.selectionStart === value.length && input.selectionEnd === value.length)
      if (atEnd && items.length > 0) {
        e.preventDefault()
        setIgnoreMouse(true)
        setActiveIndex((i) => (i - 1 + items.length) % items.length)
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const isElevated = e.ctrlKey || e.metaKey
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
      if (item) {
        item.onSelect(isElevated)
      } else if (command === 'settings') {
        setSettingsTarget('types')
      } else if (command === 'timer') {
        setActiveModuleView('focus')
      } else if (command === 'repo') {
        setActiveModuleView('git')
      } else if (command === 'profile') {
        setActiveModuleView('profile')
      } else if (command === 'system') {
        setSystemSubTab('updates')
        setActiveModuleView('system')
      } else if (command === 'notifications') {
        if (windowMode === 'bar') {
          window.api.barDeactivate()
        } else {
          window.api.hidePalette()
        }
        window.api.notifyOpen?.() ?? window.api.notifyToggle()
      } else if (command === 'shortcuts') {
        if (windowMode === 'bar') {
          window.api.barDeactivate()
        } else {
          window.api.hidePalette()
        }
        window.api.shortcutsOpen?.() ?? window.api.shortcutsToggle?.()
      }
    } else if (e.key === 'Tab') {
      const item = items[activeIndex]
      if (item?.completion !== undefined) {
        e.preventDefault()
        setValue(item.completion)
      } else if (showingCommandList && item) {
        e.preventDefault()
        item.onSelect()
      } else if (value === '' && item) {
        e.preventDefault()
        if (item.key.startsWith('history-') && item.sublabel?.startsWith('/')) {
          setValue(item.sublabel + ' ')
        } else if (item.key.startsWith('__default_')) {
          const cleanCmd = item.label.replace(/^⭐\s*\//, '').replace(/^\//, '')
          setValue(`/${cleanCmd} `)
        } else {
          item.onSelect()
        }
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
      <DockIdleView
        dockLayout={dockLayout}
        shelfIcons={shelfIcons}
        shelfCollapsed={shelfCollapsed}
        setShelfCollapsed={setShelfCollapsed}
        setShelfInteractionTick={setShelfInteractionTick}
        shelfPaletteActive={shelfPaletteActive}
        activeShelfModule={activeShelfModule}
        termUnread={termUnread}
        notifyCount={notifyCount}
        focusState={focusState}
        setFocusState={setFocusState}
        gitStatus={gitStatus}
        gitWatchersCount={gitWatchersCount}
        wingetUpdatesCount={wingetUpdatesCount}
        scheduledJobsCount={scheduledJobsCount}
        shortcutsActive={shortcutsActive}
        summonPulse={summonPulse}
        summonColor={summonColor}
        summonGlow={summonGlow}
        dockFading={dockFading}
        dockGlowColor={dockGlowColor}
        dockGlowStyle={dockGlowStyle}
        paletteHotkey={paletteHotkey}
        isDockAtHome={isDockAtHome}
        isOrbitIdle={isOrbitIdle}
        barActive={barActive}
        shimmerInfo={shimmerInfo}
      />
    )
  }

                // The grow animation is armed only for the frame right after activation (growOrigin is
                // cleared on animationend), so ordinary re-renders don't replay it. The origin/scale come
                // from main because only it knows where the icon was relative to the new window bounds.
                const paletteClassName = [
                'palette',
                windowMode === 'bar' ? 'palette-bar' : '',
                disableMouseInput ? 'disable-mouse-input' : '',
                growClassNames,
                pageFade === 'out' ? 'page-fade-out' : '',
                pageFade === 'in' ? 'page-fade-in' : ''
                ]
                .filter(Boolean)
                .join(' ')

                if (isSettingsMode) {
    return (
                <div className={paletteClassName} style={growStyle} onAnimationEnd={onGrowEnd}>
                  <ConfigManager
                    initialTarget={settingsTarget ?? undefined}
                    onExit={(exitVal) => {
                      setSettingsTarget(null)
                      if (windowMode === 'bar' && exitVal === undefined) {
                        window.api.barDeactivate()
                      } else if (windowMode !== 'bar' && exitVal === undefined) {
                        window.api.hidePalette()
                      } else {
                        setValue(exitVal !== undefined ? exitVal : getDefaultValue())
                      }
                    }}
                  />
                </div>
                )
  }

                if (activeModuleView === 'focus') {
    return (
                <div className={paletteClassName} style={growStyle} onAnimationEnd={onGrowEnd}>
                  <FocusTimerPanel
                    focusState={focusState}
                    onClose={() => {
                      if (windowMode === 'bar') {
                        window.api.barDeactivate()
                      } else {
                        window.api.hidePalette()
                      }
                    }}
                    onBackToPalette={() => setActiveModuleView(null)}
                  />
                </div>
                )
  }

                if (activeModuleView === 'git') {
    return (
                <div className={paletteClassName} style={growStyle} onAnimationEnd={onGrowEnd}>
                  <GitStatusPanel
                    gitStatus={gitStatus}
                    branches={gitBranches}
                    initialTab={gitSubTab}
                    onRefresh={refreshGit}
                    onClose={() => {
                      if (windowMode === 'bar') {
                        window.api.barDeactivate()
                      } else {
                        window.api.hidePalette()
                      }
                    }}
                    onBackToPalette={() => setActiveModuleView(null)}
                  />
                </div>
                )
  }

                if (activeModuleView === 'profile') {
    return (
                <div className={paletteClassName} style={growStyle} onAnimationEnd={onGrowEnd}>
                  <ProfilePanel
                    onOpenSettings={() => {
                      setActiveModuleView(null)
                      setSettingsTarget('settings')
                    }}
                    onClose={() => {
                      if (windowMode === 'bar') {
                        window.api.barDeactivate()
                      } else {
                        window.api.hidePalette()
                      }
                    }}
                    onBackToPalette={() => setActiveModuleView(null)}
                  />
                </div>
                )
  }

                if (activeModuleView === 'system') {
    return (
                <div className={paletteClassName} style={growStyle} onAnimationEnd={onGrowEnd}>
                  <SystemManagementPanel
                    initialWingetTab={systemSubTab}
                    onClose={() => {
                      if (windowMode === 'bar') {
                        window.api.barDeactivate()
                      } else {
                        window.api.hidePalette()
                      }
                    }}
                    onBackToPalette={() => setActiveModuleView(null)}
                  />
                </div>
                )
  }

                return (
                <div
                  className={`${paletteClassName} palette-launchpad`}
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
                  <div className="launchpad-search-pill">
                    <span className="launchpad-search-glyph">
                      {isSearching && !showingCommandList ? (
                        <span className="sudo-spinner sudo-spinner-sm" />
                      ) : value.startsWith('/') ? (
                        '⌘'
                      ) : (
                        '⌕'
                      )}
                    </span>
                    <input
                      ref={inputRef}
                      className="palette-input launchpad-input"
                      value={value}
                      placeholder={placeholderText}
                      autoFocus={windowMode === 'popup'}
                      onChange={(e) => setValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                    />
                    {value !== '' && (
                      <button
                        type="button"
                        className="launchpad-clear-btn"
                        title="Clear filter (Esc)"
                        onClick={() => {
                          setValue(getDefaultValue())
                          inputRef.current?.focus()
                        }}
                      >
                        ×
                      </button>
                    )}
                    {activeActionHint && <span className="palette-input-action-badge">{activeActionHint}</span>}
                  </div>
                  {hotkeyError && <div className="palette-banner launchpad-banner">{hotkeyError}</div>}
                  {commandError && <div className="palette-banner launchpad-banner">{commandError}</div>}
                  {command === 'calc' && (
                    <div className="launchpad-calc-card">
                      <div className="launchpad-calc-label">Calculator Result (Press Enter to Copy)</div>
                      <div className="calc-result">{calcResult ?? (query ? 'Invalid expression' : 'Enter a math expression...')}</div>
                    </div>
                  )}
                  {command !== 'calc' && (
                    <div
                      ref={gridContainerRef}
                      className={ignoreMouse || disableMouseInput ? 'launchpad-grid-scroll ignore-mouse' : 'launchpad-grid-scroll'}
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
                        <div className="launchpad-empty-card">
                          {isSearching && !showingCommandList ? 'Searching…' : 'No matching options found'}
                        </div>
                      )}
                      {groupedSections.map((group) => (
                        <section key={group.name} className="launchpad-section">
                          <div className="launchpad-section-header">
                            {group.icon && <span className="launchpad-section-icon">{group.icon}</span>}
                            <span className="launchpad-section-title">{group.name}</span>
                            <span className="launchpad-section-count">{group.items.length}</span>
                          </div>
                          <div className="launchpad-cards-grid">
                            {group.items.map(({ item, flatIndex }) => {
                              const isActive = flatIndex === activeIndex
                              return (
                                <div
                                  key={item.key}
                                  data-card-index={flatIndex}
                                  ref={isActive ? (activeItemRef as React.RefObject<HTMLDivElement>) : undefined}
                                  className={isActive ? 'launchpad-card active' : 'launchpad-card'}
                                  onMouseEnter={() => {
                                    if (!ignoreMouse) setActiveIndex(flatIndex)
                                  }}
                                  onClick={(e) => item.onSelect(e.ctrlKey || e.metaKey)}
                                >
                                  <div className="launchpad-card-top">
                                    <div className="launchpad-card-title-wrap">
                                      <span className="launchpad-card-label">{item.label}</span>
                                      {item.badge && <span className="launchpad-card-badge">{item.badge}</span>}
                                    </div>
                                  </div>
                                  {item.sublabel && <div className="launchpad-card-sublabel">{item.sublabel}</div>}
                                </div>
                              )
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                  <div className="launchpad-footer-pill">
                    <span className="palette-footer-hint">
                      <kbd className="palette-kbd">↑↓←→</kbd> Navigate
                    </span>
                    <span className="palette-footer-hint">
                      <kbd className="palette-kbd">↵</kbd>{' '}
                      {command === 'calc'
                        ? 'Copy'
                        : isTextualLaunchActive
                          ? 'Embedded Terminal'
                          : command === 'custom' || command === 'term'
                            ? 'Run in Terminal'
                            : 'Select'}
                    </span>
                    {isTextualLaunchActive ? (
                      <span className="palette-footer-hint">
                        <kbd className="palette-kbd">Ctrl+↵</kbd> Separate Window
                      </span>
                    ) : (
                      (command === 'custom' || command === 'term') && (
                        <span className="palette-footer-hint">
                          <kbd className="palette-kbd">Ctrl+↵</kbd> Run Elevated
                        </span>
                      )
                    )}
                    {command === 'teams' && (
                      <span className="palette-footer-hint">
                        <kbd className="palette-kbd">Ctrl+E</kbd> Add / Edit
                      </span>
                    )}
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
                        <kbd className="palette-kbd">/</kbd> All Commands
                      </span>
                    )}
                    {isHistoryActive && (
                      <span className="palette-footer-hint">
                        <kbd className="palette-kbd">Shift+Del</kbd> Remove
                      </span>
                    )}
                  </div>
                </div>
                )
}
