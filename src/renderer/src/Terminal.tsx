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
  const [dockLayout, setDockLayout] = useState<'horizontal' | 'circle' | 'shelf'>('shelf')
  const [dockFading, setDockFading] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [resizeBadge, setResizeBadge] = useState<string | null>(null)
  const resizeBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { growPhase, setGrowOrigin, setGrowPhase, growClassNames, growStyle, onGrowEnd } =
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
        if (s?.dockLayout) setDockLayout(s.dockLayout)
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

    let fitRafId: number | null = null
    const syncFit = (shouldFocus = false): void => {
      if (fitRafId !== null) cancelAnimationFrame(fitRafId)
      fitRafId = requestAnimationFrame(() => {
        fitRafId = null
        if (!containerRef.current || containerRef.current.clientWidth < 200 || containerRef.current.clientHeight < 100) {
          return
        }
        fitRef.current?.fit()
        if (term.cols >= 20 && term.rows >= 5) {
          window.api.termResize(term.cols, term.rows)
        }
        term.scrollToBottom()
        if (shouldFocus) {
          term.focus()
        }
      })
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width >= 200 && entry.contentRect.height >= 100) {
          syncFit(false)
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
      setTimeout(() => syncFit(true), 60)
      setTimeout(() => syncFit(true), 160)
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
    // Collapse on Escape, but only once the current line is empty and no full-screen
    // alternate-buffer TUI (e.g. Python Textual, vim, lazygit) is active — otherwise
    // Escape must reach the TUI / PSReadLine directly.
    term.attachCustomKeyEventHandler((event) => {
      if (
        event.type === 'keydown' &&
        event.key === 'Escape' &&
        pendingInputRef.current === '' &&
        term.buffer.active.type !== 'alternate'
      ) {
        window.api.termToggle()
        return false
      }
      return true
    })

    return () => {
      if (fitRafId !== null) cancelAnimationFrame(fitRafId)
      if (resizeBadgeTimerRef.current) clearTimeout(resizeBadgeTimerRef.current)
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
    if (termRef.current?.buffer.active.type !== 'alternate') {
      window.api.termInput('\x1b')
    }
    pendingInputRef.current = ''

    const doFit = (): void => {
      if (!containerRef.current || containerRef.current.clientWidth < 200 || containerRef.current.clientHeight < 100) return
      fitRef.current?.fit()
      const term = termRef.current
      if (!term || term.cols < 20 || term.rows < 5) return
      window.api.termResize(term.cols, term.rows)
      term.scrollToBottom()
      term.focus()
    }

    const timer1 = setTimeout(doFit, 95)
    const timer2 = setTimeout(doFit, 240)
    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
  }, [expanded])

  useEffect(() => {
    if (!expanded || growPhase === 'pending' || growPhase === 'collapsing') return
    const timer = setTimeout(() => {
      if (!containerRef.current || containerRef.current.clientWidth < 200 || containerRef.current.clientHeight < 100) return
      fitRef.current?.fit()
      const term = termRef.current
      if (!term || term.cols < 20 || term.rows < 5) return
      window.api.termResize(term.cols, term.rows)
      term.scrollToBottom()
      term.focus()
    }, 20)
    return () => clearTimeout(timer)
  }, [expanded, growPhase])

  useEffect(() => {
    if (expanded || dockLayout !== 'horizontal') {
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
  }, [expanded, dockLayout])

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

  function flashResizeBadge(text: string, durationMs = 1400): void {
    if (resizeBadgeTimerRef.current) clearTimeout(resizeBadgeTimerRef.current)
    setResizeBadge(text)
    if (durationMs > 0) {
      resizeBadgeTimerRef.current = setTimeout(() => {
        resizeBadgeTimerRef.current = null
        setResizeBadge(null)
      }, durationMs)
    }
  }

  function handleResetSize(): void {
    setIsMaximized(false)
    window.api.resizeTerminalWindow?.(800, 360, undefined, undefined, true).then((res) => {
      if (res) {
        flashResizeBadge(`Reset ${res.width}×${res.height}`)
      }
      termRef.current?.focus()
    })
  }

  function handleToggleMaximize(): void {
    window.api.toggleMaximizeTerminalWindow?.().then((res) => {
      if (res) {
        setIsMaximized(res.maximized)
        if (res.bounds) {
          flashResizeBadge(`${res.bounds.width}×${res.bounds.height}`)
        }
      }
      termRef.current?.focus()
    })
  }

  function startResizeDrag(
    e: React.MouseEvent,
    dir: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
  ): void {
    e.preventDefault()
    e.stopPropagation()
    setIsMaximized(false)
    const startScreenX = e.screenX
    const startScreenY = e.screenY
    const startWinX = window.screenX
    const startWinY = window.screenY
    const startW = window.innerWidth
    const startH = window.innerHeight
    const rightEdge = startWinX + startW
    const bottomEdge = startWinY + startH
    let rafId: number | null = null

    if (resizeBadgeTimerRef.current) {
      clearTimeout(resizeBadgeTimerRef.current)
      resizeBadgeTimerRef.current = null
    }
    setResizeBadge(`${startW}×${startH}`)

    function onMouseMove(ev: MouseEvent): void {
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const dx = ev.screenX - startScreenX
        const dy = ev.screenY - startScreenY
        let nextW = startW
        let nextH = startH
        let nextX = startWinX
        let nextY = startWinY

        if (dir.includes('e')) {
          nextW = Math.max(420, startW + dx)
        } else if (dir.includes('w')) {
          nextW = Math.max(420, startW - dx)
          nextX = rightEdge - nextW
        }

        if (dir.includes('s')) {
          nextH = Math.max(220, startH + dy)
        } else if (dir.includes('n')) {
          nextH = Math.max(220, startH - dy)
          nextY = bottomEdge - nextH
        }

        setResizeBadge(`${Math.round(nextW)}×${Math.round(nextH)}`)
        window.api.resizeTerminalWindow?.(nextW, nextH, nextX, nextY)
      })
    }

    function onMouseUp(): void {
      if (rafId !== null) cancelAnimationFrame(rafId)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      flashResizeBadge(`${window.innerWidth}×${window.innerHeight}`, 900)
      termRef.current?.focus()
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
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
      <div
        className="term-header"
        title="Drag to move PowerShell window · Double-click to maximize/restore"
        onDoubleClick={handleToggleMaximize}
      >
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
          {resizeBadge && <span className="term-resize-badge">{resizeBadge}</span>}
        </div>
        <div className="term-header-actions">
          <button
            className="term-header-btn"
            title={isMaximized ? 'Restore terminal size' : 'Maximize terminal (or double-click header)'}
            onClick={handleToggleMaximize}
            aria-label={isMaximized ? 'Restore terminal size' : 'Maximize terminal'}
          >
            {isMaximized ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="7" width="12" height="12" rx="1.5" />
                <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h8A1.5 1.5 0 0 1 20 5.5v8a1.5 1.5 0 0 1-1.5 1.5H17" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
            )}
          </button>
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
      </div>
      <div className="term-body">
        <div ref={containerRef} className="term-viewport-host" />
      </div>
      {expanded && (
        <>
          <div
            className="term-resize-edge term-resize-n"
            onMouseDown={(e) => startResizeDrag(e, 'n')}
            title="Drag top edge to resize height"
          />
          <div
            className="term-resize-edge term-resize-s"
            onMouseDown={(e) => startResizeDrag(e, 's')}
            title="Drag bottom edge to resize height"
          />
          <div
            className="term-resize-edge term-resize-e"
            onMouseDown={(e) => startResizeDrag(e, 'e')}
            title="Drag right edge to resize width"
          />
          <div
            className="term-resize-edge term-resize-w"
            onMouseDown={(e) => startResizeDrag(e, 'w')}
            title="Drag left edge to resize width"
          />
          <div
            className="term-resize-corner term-resize-nw"
            onMouseDown={(e) => startResizeDrag(e, 'nw')}
            title="Drag corner to resize window"
          />
          <div
            className="term-resize-corner term-resize-ne"
            onMouseDown={(e) => startResizeDrag(e, 'ne')}
            title="Drag corner to resize window"
          />
          <div
            className="term-resize-corner term-resize-sw"
            onMouseDown={(e) => startResizeDrag(e, 'sw')}
            title="Drag corner to resize window"
          />
          <div
            className="term-resize-corner term-resize-se"
            onMouseDown={(e) => startResizeDrag(e, 'se')}
            onDoubleClick={handleResetSize}
            title="Drag corner to resize · Double-click to reset to 800×360"
          >
            <span className="term-resize-grip">◢</span>
          </div>
        </>
      )}
    </div>
  )
}
