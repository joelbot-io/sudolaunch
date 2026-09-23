import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { formatAccelerator } from './accelerator'
import { useGrowAnimation } from './useGrowAnimation'

export default function Terminal(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  // Authoritative state lives in main (see terminalWindow.ts's termExpanded) — this just
  // mirrors it via 'term-expanded', so window bounds and this UI can never disagree.
  const [expanded, setExpanded] = useState(false)
  const [moveMode, setMoveMode] = useState(false)
  const [termHotkey, setTermHotkey] = useState('')
  const [sessionEnded, setSessionEnded] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const [summonPulse, setSummonPulse] = useState(false)
  const [summonColor, setSummonColor] = useState<string | null>(null)
  const [summonGlow, setSummonGlow] = useState<string | null>(null)
  const [dockGlowColor, setDockGlowColor] = useState<string>('')
  const [dockFading, setDockFading] = useState(false)
  const { setGrowOrigin, setGrowPhase, growClassNames, growStyle, onGrowEnd } =
    useGrowAnimation()
  const [shimmerInfo, setShimmerInfo] = useState<{
    corner: 'tl' | 'tr' | 'br' | 'bl'
    color: string
    gradient: string
    flickerType: number | null
  } | null>(null)
  const pendingInputRef = useRef('')

  useEffect(() => {
    const loadSettings = (): void => {
      window.api.getSettings?.().then((s) => {
        if (s?.terminalHotkey) setTermHotkey(formatAccelerator(s.terminalHotkey))
        if (typeof s?.dockGlowColor === 'string') setDockGlowColor(s.dockGlowColor.trim())
      })
    }
    loadSettings()
    const unsub = window.api.onConfigChanged?.(() => {
      loadSettings()
    })
    const term = new XTerm({
      convertEol: true,
      fontSize: 13,
      fontFamily: '"Cascadia Mono", Consolas, monospace',
      theme: {
        background: '#00000000',
        foreground: '#f2f2f2',
        cursor: '#5aa0ff'
      },
      allowTransparency: true,
      cols: 75,
      rows: 18
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    if (containerRef.current) term.open(containerRef.current)
    termRef.current = term
    fitRef.current = fit

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width >= 200 && entry.contentRect.height >= 100) {
          fitRef.current?.fit()
          if (term.cols >= 20 && term.rows >= 5) {
            window.api.termResize(term.cols, term.rows)
          }
        }
      }
    })
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    let isUserKeypress = false
    const keyDisposable = term.onKey(() => {
      isUserKeypress = true
    })

    const dataDisposable = term.onData((data) => {
      window.api.termInput(data)
      const userKey = isUserKeypress
      isUserKeypress = false

      if (data === '\r' || data === '\x03' || data === '\x1b') {
        // Enter submits the line; Ctrl+C cancels it; Escape clears it (PSReadLine).
        // In all these cases, the prompt is redrawn and starts empty.
        pendingInputRef.current = ''
      } else if (data === '\x7f') {
        // Backspace.
        pendingInputRef.current = pendingInputRef.current.slice(0, -1)
      } else {
        // If data starts with ESC (\x1b) and did NOT originate from a physical user keypress (term.onKey),
        // it is an automatic terminal response (CPR, DA, DA2, DSR, Focus, OSC, etc.) sent back to the shell.
        // We must ignore these so they don't pollute pendingInputRef and break Escape-to-close.
        if (data.startsWith('\x1b') && !userKey) {
          return
        }
        pendingInputRef.current += data
      }
    })
    const unsubData = window.api.onTermData((data) => term.write(data))
    const unsubExpanded = window.api.onTermExpanded((next) => {
      setExpanded(next)
      // Collapsing drops any grow state, so the icon can never be left wearing a
      // half-finished animation's transform.
      if (!next) {
        setGrowOrigin(null)
        setGrowPhase(null)
      }
    })
    const unsubGrow = window.api.onTermGrowOrigin((origin) => {
      setGrowOrigin(origin)
      setGrowPhase('pending')
    })
    const unsubCollapsing = window.api.onTermCollapsing((origin) => {
      setGrowOrigin(origin)
      setGrowPhase('collapsing')
    })
    const unsubExited = window.api.onTermExited(() => setSessionEnded(true))
    const unsubRespawned = window.api.onTermRespawned(() => {
      setSessionEnded(false)
      setTimeout(() => {
        if (containerRef.current && containerRef.current.clientWidth >= 200) {
          fitRef.current?.fit()
          if (term.cols >= 20 && term.rows >= 5) {
            window.api.termResize(term.cols, term.rows)
            term.focus()
          }
        }
      }, 50)
    })
    const unsubMoveMode = window.api.onTermMoveModeChanged((active) => setMoveMode(active))
    const unsubUnread = window.api.onTermUnreadActivity?.((unread) => {
      setHasUnread(unread)
    })
    const unsubSummoned = window.api.onDockSummoned?.((data) => {
      if (data?.color) setSummonColor(data.color)
      if (data?.glow) setSummonGlow(data.glow)
      setSummonPulse(true)
      setTimeout(() => setSummonPulse(false), 900)
    })
    const unsubFade = window.api.onDockFade?.((dir) => setDockFading(dir === 'out'))
    // Collapse on Escape, but only once the current line is empty — otherwise Escape
    // should reach the shell like any other key (e.g. PSReadLine uses it too).
    term.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown' && event.key === 'Escape' && pendingInputRef.current === '') {
        window.api.termToggle()
        return false
      }
      return true
    })

    return () => {
      resizeObserver.disconnect()
      keyDisposable.dispose()
      dataDisposable.dispose()
      unsubData()
      unsubExpanded()
      unsubGrow()
      unsubCollapsing()
      unsubExited()
      unsubRespawned()
      unsubMoveMode()
      unsubUnread?.()
      unsubSummoned?.()
      unsubFade?.()
      unsub?.()
      term.dispose()
    }
  }, [])

  useEffect(() => {
    window.api.getHotkeys().then((hotkeys) => setTermHotkey(formatAccelerator(hotkeys.terminal)))
  }, [])

  useEffect(() => {
    if (!expanded) return
    setHasUnread(false)
    window.api.termInput('\x1b')
    pendingInputRef.current = ''

    const doFit = (): void => {
      if (!containerRef.current || containerRef.current.clientWidth < 200) return
      fitRef.current?.fit()
      const term = termRef.current
      if (!term || term.cols < 20 || term.rows < 5) return
      window.api.termResize(term.cols, term.rows)
      term.focus()
    }

    const timer1 = setTimeout(doFit, 50)
    const timer2 = setTimeout(doFit, 200)
    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
  }, [expanded])

  useEffect(() => {
    if (expanded) {
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
  }, [expanded])

  useEffect(() => {
    if (!moveMode) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        window.api.termMoveModeToggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [moveMode])

  function toggle(): void {
    window.api.termToggle()
  }

  if (!expanded && moveMode) {
    return (
      <div
        className="palette palette-bar-move"
        title="Drag to move terminal button — click here or press Escape to drop it"
        onClick={() => window.api.termMoveModeToggle()}
      >
        <span className="move-handle-icon">✥</span>
      </div>
    )
  }

  return (
    <div
      className={[
        'term-shell',
        expanded ? 'term-expanded' : 'term-collapsed',
        hasUnread ? 'term-unread' : '',
        summonPulse ? 'summon-pulse' : '',
        !expanded && dockFading ? 'dock-fading' : '',
        !expanded && shimmerInfo ? `icon-shimmer shimmer-${shimmerInfo.corner}${shimmerInfo.flickerType ? ` has-flicker-${shimmerInfo.flickerType}` : ''}` : '',
        growClassNames
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        ...growStyle,
        ...(!expanded && shimmerInfo
          ? { '--shimmer-color': shimmerInfo.color, '--shimmer-gradient': shimmerInfo.gradient }
          : {}),
        ...(dockGlowColor ? { '--dock-glow-color': dockGlowColor } : {}),
        ...(summonColor ? { '--summon-color': summonColor } : {}),
        ...(summonGlow ? { '--summon-glow-color': summonGlow } : {})
      } as React.CSSProperties}
      // Scoped to this element's own animation — animationend bubbles, and the icon's
      // "session ended" glow is a descendant animation that must not clear the grow state.
      onAnimationEnd={onGrowEnd}
    >
      {!expanded && (
        <button
          className={[
            'term-icon',
            sessionEnded ? 'term-icon-ended' : '',
            hasUnread && !expanded ? 'term-icon-unread' : ''
          ]
            .filter(Boolean)
            .join(' ')}
          title={
            sessionEnded
              ? `Shell session ended — opens a new one${termHotkey ? ` (${termHotkey})` : ''}`
              : hasUnread
                ? `Unread terminal output${termHotkey ? ` (${termHotkey})` : ''}`
                : termHotkey
                  ? `Open terminal (${termHotkey})`
                  : 'Open terminal'
          }
          onClick={toggle}
        >
          {'>_'}
        </button>
      )}
      <div className="term-header" title="Drag to move PowerShell window">
        <div className="term-header-left">
          <span className="term-drag-handle" title="Drag to move window">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="6" r="2" />
              <circle cx="12" cy="6" r="2" />
              <circle cx="19" cy="6" r="2" />
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
              <circle cx="5" cy="18" r="2" />
              <circle cx="12" cy="18" r="2" />
              <circle cx="19" cy="18" r="2" />
            </svg>
          </span>
          <span className="term-header-label">PowerShell</span>
        </div>
        <button
          className="term-collapse"
          title={termHotkey ? `Collapse terminal (${termHotkey} or Esc)` : 'Collapse terminal'}
          onClick={toggle}
          aria-label="Collapse terminal"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>
      <div ref={containerRef} className="term-body" />
    </div>
  )
}
