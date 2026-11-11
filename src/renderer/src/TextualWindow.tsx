import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { TextualWindowInitInfo } from '../../shared/types'
import { windowSessionId } from './windowMode'

export default function TextualWindow(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const exitCodeRef = useRef<number | null>(null)

  const [info, setInfo] = useState<TextualWindowInitInfo | null>(null)
  const [pinned, setPinned] = useState(false)
  const [exitCode, setExitCode] = useState<number | null>(null)

  const updateExitCode = useCallback((code: number | null) => {
    exitCodeRef.current = code
    setExitCode(code)
  }, [])

  const handleRestart = useCallback(async () => {
    const term = termRef.current
    if (!term || !windowSessionId) return
    updateExitCode(null)
    term.reset()
    fitRef.current?.fit()
    await window.api.textualWinRestart?.(windowSessionId, term.cols, term.rows)
    term.focus()
  }, [updateExitCode])

  const handleTogglePin = useCallback(async () => {
    if (!windowSessionId || !window.api.textualWinTogglePin) return
    const next = await window.api.textualWinTogglePin(windowSessionId)
    setPinned(next)
    termRef.current?.focus()
  }, [])

  const handleMaximize = useCallback(() => {
    if (!windowSessionId) return
    window.api.textualWinMaximize?.(windowSessionId)
    termRef.current?.focus()
  }, [])

  const handleClose = useCallback(() => {
    if (!windowSessionId) return
    window.api.textualWinClose?.(windowSessionId)
  }, [])

  useEffect(() => {
    const term = new XTerm({
      convertEol: false,
      fontSize: 13,
      fontFamily: '"Cascadia Mono", Consolas, monospace',
      theme: {
        background: '#00000000',
        foreground: '#f2f2f2',
        cursor: '#5aa0ff',
        selectionBackground: 'rgba(90, 160, 255, 0.32)'
      },
      allowTransparency: true,
      scrollback: 5000,
      cols: 96,
      rows: 28
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    if (containerRef.current) {
      term.open(containerRef.current)
    }
    termRef.current = term
    fitRef.current = fit

    let fitRafId: number | null = null
    const syncFit = (shouldFocus = false): void => {
      if (fitRafId !== null) cancelAnimationFrame(fitRafId)
      fitRafId = requestAnimationFrame(() => {
        fitRafId = null
        if (
          !containerRef.current ||
          containerRef.current.clientWidth < 160 ||
          containerRef.current.clientHeight < 100
        ) {
          return
        }
        fit.fit()
        if (windowSessionId && term.cols >= 20 && term.rows >= 5) {
          window.api.textualWinResize?.(windowSessionId, term.cols, term.rows)
        }
        if (shouldFocus) {
          term.focus()
        }
      })
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width >= 160 && entry.contentRect.height >= 100) {
          syncFit(false)
        }
      }
    })
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true

      // Copy selection with Ctrl+Shift+C
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'c') {
        const selection = term.getSelection()
        if (selection) {
          navigator.clipboard.writeText(selection).catch(() => {})
        }
        return false
      }

      // When the TUI process has exited with an error, allow quick keyboard restart/close
      if (exitCodeRef.current !== null) {
        if (event.key === 'r' || event.key === 'R') {
          event.preventDefault()
          void handleRestart()
          return false
        }
        if (event.key === 'Escape' || event.key === 'Enter') {
          event.preventDefault()
          window.api.textualWinClose?.(windowSessionId)
          return false
        }
      }

      return true
    })

    const dataDisposable = term.onData((data) => {
      if (exitCodeRef.current === null && windowSessionId) {
        window.api.textualWinInput?.(windowSessionId, data)
      }
    })

    const unsubData = window.api.onTextualWinData?.((data) => {
      term.write(data)
    })

    const unsubExit = window.api.onTextualWinExit?.((code) => {
      updateExitCode(code)
    })

    // Measure initial dimensions before spawning the PTY so Textual starts at the exact window size
    if (
      containerRef.current &&
      containerRef.current.clientWidth >= 160 &&
      containerRef.current.clientHeight >= 100
    ) {
      fit.fit()
    }

    if (windowSessionId && window.api.textualWinInit) {
      window.api
        .textualWinInit(windowSessionId, term.cols, term.rows)
        .then((initInfo) => {
          if (initInfo) {
            setInfo(initInfo)
            setPinned(initInfo.pinned)
          }
          syncFit(true)
        })
        .catch(() => {})
    }

    return () => {
      if (fitRafId !== null) cancelAnimationFrame(fitRafId)
      resizeObserver.disconnect()
      dataDisposable.dispose()
      unsubData?.()
      unsubExit?.()
      term.dispose()
    }
  }, [handleRestart, updateExitCode])

  return (
    <div className="term-shell tui-window-shell">
      <div className="term-header tui-window-header" title={info?.commandDisplay ?? 'Drag to move Textual TUI window'}>
        <div className="term-header-left tui-header-left">
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
          <span className="tui-header-title">🐍 {info?.title ?? 'Python Textual'}</span>
          {info?.subtitle && <span className="tui-subtitle-badge">{info.subtitle}</span>}
        </div>
        <div className="tui-header-actions">
          <button
            type="button"
            className={`term-collapse tui-header-btn ${pinned ? 'active' : ''}`}
            title={pinned ? 'Unpin Always-on-Top' : 'Pin Always-on-Top'}
            onClick={handleTogglePin}
            aria-label="Toggle Always on Top"
          >
            📌
          </button>
          <button
            type="button"
            className="term-collapse tui-header-btn"
            title="Restart Textual app"
            onClick={() => void handleRestart()}
            aria-label="Restart Textual app"
          >
            ↻
          </button>
          <button
            type="button"
            className="term-collapse tui-header-btn"
            title="Maximize / Restore window"
            onClick={handleMaximize}
            aria-label="Maximize or restore window"
          >
            ▢
          </button>
          <button
            type="button"
            className="term-collapse tui-header-btn tui-close-btn"
            title="Close Textual window"
            onClick={handleClose}
            aria-label="Close window"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="term-body tui-window-body">
        <div ref={containerRef} className="term-viewport-host" />
      </div>
      {exitCode !== null && (
        <div className="tui-exit-banner">
          <span className="tui-exit-text">
            Process exited with code <code>{exitCode}</code>
          </span>
          <div className="tui-exit-actions">
            <button type="button" className="tui-exit-btn" onClick={() => void handleRestart()}>
              Restart (R)
            </button>
            <button type="button" className="tui-exit-btn tui-exit-btn-close" onClick={handleClose}>
              Close (Esc)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

