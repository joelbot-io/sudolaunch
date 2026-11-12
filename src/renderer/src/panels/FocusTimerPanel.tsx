import { useState, useEffect, useRef } from 'react'
import type { FocusTimerState } from '../../../shared/types'

const FOCUS_PRESETS = [5, 10, 15, 30, 45, 60] as const

interface FocusPanelProps {
  focusState: FocusTimerState | null
  onClose: () => void
  onBackToPalette: () => void
}

export function FocusTimerPanel({ focusState, onClose, onBackToPalette }: FocusPanelProps): JSX.Element {
  const [customMinutes, setCustomMinutes] = useState('30')
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const isRunning = focusState?.running ?? false
  const isPaused = focusState?.paused ?? false
  const isSessionActive = isRunning || isPaused

  // Highlighted keyboard selector:
  // When idle: 0..5 are presets (5, 10, 15, 30, 45, 60), 6 is custom-input, 7 is custom-start
  // When active: 0 is pause/resume, 1 is +5m, 2 is reset, 3 is custom-input, 4 is custom-start
  const [selectedIndex, setSelectedIndex] = useState<number>(() => (isSessionActive ? 0 : 3))
  const customInputRef = useRef<HTMLInputElement>(null)

  const remaining = focusState?.remainingSeconds ?? (focusState?.durationMinutes ? focusState.durationMinutes * 60 : 1500)

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`

  function flashStatus(msg: string): void {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(null), 3500)
  }

  function handleStartPreset(mins: number): void {
    window.api.startFocusTimer?.(mins)
    flashStatus(`Started ${mins} min focus session`)
  }

  function handleStartCustom(): void {
    const mins = parseInt(customMinutes, 10)
    if (isNaN(mins) || mins <= 0 || mins > 480) {
      flashStatus('Enter 1-480 minutes')
      return
    }
    window.api.startFocusTimer?.(mins)
    flashStatus(`Started ${mins} min focus session`)
  }

  function handlePause(): void {
    window.api.pauseFocusTimer?.()
    flashStatus('Session paused')
  }

  function handleResume(): void {
    window.api.startFocusTimer?.()
    flashStatus('Session resumed')
  }

  function handleReset(): void {
    window.api.resetFocusTimer?.()
    flashStatus('Session reset')
  }

  function handleAddFive(): void {
    const nextMins = Math.ceil(remaining / 60) + 5
    window.api.startFocusTimer?.(nextMins)
    flashStatus(`Added 5 minutes (+${nextMins}m)`)
  }

  // Reset selected selector index when session status transitions
  useEffect(() => {
    if (isRunning) {
      setSelectedIndex(0) // Pause button
    } else if (isPaused) {
      setSelectedIndex(0) // Resume button
    } else {
      setSelectedIndex(3) // Default to 30m preset
    }
  }, [isRunning, isPaused])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      const isInputFocused = tag === 'input' || tag === 'textarea'

      if (e.key === 'Escape') {
        e.preventDefault()
        if (isInputFocused) {
          ;(e.target as HTMLElement).blur()
          return
        }
        onClose()
        return
      }

      if (isInputFocused) {
        if (e.key === 'Enter') {
          e.preventDefault()
          handleStartCustom()
          ;(e.target as HTMLElement).blur()
        }
        return
      }

      const row0Count = isSessionActive ? 3 : FOCUS_PRESETS.length // 3 or 6
      const customInputIdx = row0Count
      const customStartIdx = row0Count + 1
      const totalCount = row0Count + 2

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setSelectedIndex((cur) => {
          if (cur < row0Count) {
            return (cur + 1) % row0Count
          }
          if (cur === customInputIdx) return customStartIdx
          return customInputIdx
        })
        return
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setSelectedIndex((cur) => {
          if (cur < row0Count) {
            return (cur - 1 + row0Count) % row0Count
          }
          if (cur === customStartIdx) return customInputIdx
          return customStartIdx
        })
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((cur) => {
          if (cur < row0Count) {
            return customInputIdx
          }
          return 0
        })
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((cur) => {
          if (cur >= row0Count) {
            return isSessionActive ? 0 : 3
          }
          return customInputIdx
        })
        return
      }

      if (e.key === 'Tab') {
        e.preventDefault()
        setSelectedIndex((cur) => {
          if (e.shiftKey) {
            return (cur - 1 + totalCount) % totalCount
          }
          return (cur + 1) % totalCount
        })
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        if (isSessionActive) {
          if (selectedIndex === 0) {
            if (isRunning) handlePause()
            else handleResume()
          } else if (selectedIndex === 1) {
            handleAddFive()
          } else if (selectedIndex === 2) {
            handleReset()
          } else if (selectedIndex === customInputIdx) {
            customInputRef.current?.focus()
            customInputRef.current?.select()
          } else if (selectedIndex === customStartIdx) {
            handleStartCustom()
          }
        } else {
          if (selectedIndex < FOCUS_PRESETS.length) {
            handleStartPreset(FOCUS_PRESETS[selectedIndex])
          } else if (selectedIndex === customInputIdx) {
            customInputRef.current?.focus()
            customInputRef.current?.select()
          } else if (selectedIndex === customStartIdx) {
            handleStartCustom()
          }
        }
        return
      }

      if (e.key === ' ') {
        e.preventDefault()
        if (isRunning) {
          handlePause()
        } else if (isPaused) {
          handleResume()
        } else {
          if (selectedIndex < FOCUS_PRESETS.length) {
            handleStartPreset(FOCUS_PRESETS[selectedIndex])
          } else {
            handleStartPreset(30)
          }
        }
        return
      }

      if (e.key === '/') {
        e.preventDefault()
        onBackToPalette()
        return
      }

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        handleReset()
        return
      }

      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        handleAddFive()
        return
      }

      // Quick number triggers (1=5m, 2=10m, 3=15m, 4=30m, 5=45m, 6=60m)
      if (!isSessionActive) {
        const num = parseInt(e.key, 10)
        if (num >= 1 && num <= FOCUS_PRESETS.length) {
          e.preventDefault()
          const mins = FOCUS_PRESETS[num - 1]
          setSelectedIndex(num - 1)
          handleStartPreset(mins)
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSessionActive, isRunning, isPaused, remaining, selectedIndex, onClose, onBackToPalette, customMinutes])

  const customInputIdx = isSessionActive ? 3 : FOCUS_PRESETS.length
  const customStartIdx = customInputIdx + 1

  return (
    <div className="shelf-module-panel focus-panel">
      <div className="shelf-panel-header">
        <div className="shelf-panel-title-group">
          <span className="shelf-panel-icon">⏱️</span>
          <div>
            <h2 className="shelf-panel-title">Focus & Pomodoro Timer</h2>
            <span className="shelf-panel-subtitle">
              {isRunning ? 'Session Active' : isPaused ? 'Session Paused' : 'Ready to Focus'}
            </span>
          </div>
        </div>
        <div className="shelf-panel-header-actions">
          <button type="button" className="shelf-panel-back-btn" onClick={onBackToPalette} title="Back to Command Palette (/)">
            /
          </button>
          <button type="button" className="shelf-panel-close-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>
      </div>

      {statusMsg && <div className="shelf-panel-status-banner">{statusMsg}</div>}

      <div className="focus-timer-display-card">
        <div className="focus-timer-clock-container">
          <div className="focus-timer-clock-ring">
            <span className="focus-timer-digits">{formattedTime}</span>
            <span className="focus-timer-mode-label">
              {isRunning ? 'FOCUSING' : isPaused ? 'PAUSED' : 'POMODORO'}
            </span>
          </div>
        </div>

        <div className="focus-timer-primary-controls">
          {isRunning ? (
            <>
              <button
                type="button"
                className={`shelf-btn shelf-btn-warning ${selectedIndex === 0 ? 'is-kbd-selected' : ''}`}
                onClick={() => {
                  setSelectedIndex(0)
                  handlePause()
                }}
                onMouseEnter={() => setSelectedIndex(0)}
                title="Pause session (Space or Enter)"
              >
                ⏸ Pause
              </button>
              <button
                type="button"
                className={`shelf-btn shelf-btn-secondary ${selectedIndex === 1 ? 'is-kbd-selected' : ''}`}
                onClick={() => {
                  setSelectedIndex(1)
                  handleAddFive()
                }}
                onMouseEnter={() => setSelectedIndex(1)}
                title="Add 5 minutes (+)"
              >
                +5m
              </button>
              <button
                type="button"
                className={`shelf-btn shelf-btn-danger ${selectedIndex === 2 ? 'is-kbd-selected' : ''}`}
                onClick={() => {
                  setSelectedIndex(2)
                  handleReset()
                }}
                onMouseEnter={() => setSelectedIndex(2)}
                title="Reset session (R)"
              >
                ⏹ Reset
              </button>
            </>
          ) : isPaused ? (
            <>
              <button
                type="button"
                className={`shelf-btn shelf-btn-primary ${selectedIndex === 0 ? 'is-kbd-selected' : ''}`}
                onClick={() => {
                  setSelectedIndex(0)
                  handleResume()
                }}
                onMouseEnter={() => setSelectedIndex(0)}
                title="Resume session (Space or Enter)"
              >
                ▶ Resume
              </button>
              <button
                type="button"
                className={`shelf-btn shelf-btn-secondary ${selectedIndex === 1 ? 'is-kbd-selected' : ''}`}
                onClick={() => {
                  setSelectedIndex(1)
                  handleAddFive()
                }}
                onMouseEnter={() => setSelectedIndex(1)}
                title="Add 5 minutes (+)"
              >
                +5m
              </button>
              <button
                type="button"
                className={`shelf-btn shelf-btn-danger ${selectedIndex === 2 ? 'is-kbd-selected' : ''}`}
                onClick={() => {
                  setSelectedIndex(2)
                  handleReset()
                }}
                onMouseEnter={() => setSelectedIndex(2)}
                title="Reset session (R)"
              >
                ⏹ Reset
              </button>
            </>
          ) : (
            <div className="focus-presets-row">
              {FOCUS_PRESETS.map((mins, idx) => (
                <button
                  key={mins}
                  type="button"
                  className={`shelf-preset-btn ${mins === 30 ? 'shelf-preset-primary' : ''} ${selectedIndex === idx ? 'is-kbd-selected' : ''}`}
                  onClick={() => {
                    setSelectedIndex(idx)
                    handleStartPreset(mins)
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  title={`${mins} minutes focus (${idx + 1})`}
                >
                  {mins}m
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="focus-custom-row">
        <span className="focus-custom-label">Custom duration:</span>
        <input
          ref={customInputRef}
          type="number"
          min="1"
          max="480"
          className={`focus-custom-input ${selectedIndex === customInputIdx ? 'is-kbd-selected' : ''}`}
          value={customMinutes}
          onChange={(e) => setCustomMinutes(e.target.value)}
          onFocus={() => setSelectedIndex(customInputIdx)}
          placeholder="mins"
        />
        <button
          type="button"
          className={`shelf-btn shelf-btn-sm ${selectedIndex === customStartIdx ? 'is-kbd-selected' : ''}`}
          onClick={() => {
            setSelectedIndex(customStartIdx)
            handleStartCustom()
          }}
          onMouseEnter={() => setSelectedIndex(customStartIdx)}
          title="Start custom timer"
        >
          Start
        </button>
        <span className="focus-session-counter">
          Completed today: <strong>{focusState?.sessionCount ?? 0}</strong>
        </span>
      </div>

      <div className="focus-keyboard-hints">
        <span className="focus-keyboard-hint">
          <kbd className="palette-kbd">←/→</kbd> Navigate
        </span>
        <span className="focus-keyboard-hint">
          <kbd className="palette-kbd">↵</kbd> Select
        </span>
        <span className="focus-keyboard-hint">
          <kbd className="palette-kbd">Space</kbd> {isRunning ? 'Pause' : isPaused ? 'Resume' : 'Start'}
        </span>
        {!isSessionActive && (
          <span className="focus-keyboard-hint">
            <kbd className="palette-kbd">1-6</kbd> Presets
          </span>
        )}
        <span className="focus-keyboard-hint">
          <kbd className="palette-kbd">+</kbd> +5m
        </span>
        <span className="focus-keyboard-hint">
          <kbd className="palette-kbd">R</kbd> Reset
        </span>
        <span className="focus-keyboard-hint">
          <kbd className="palette-kbd">/</kbd> Commands
        </span>
        <span className="focus-keyboard-hint">
          <kbd className="palette-kbd">Esc</kbd> Close
        </span>
      </div>
    </div>
  )
}
