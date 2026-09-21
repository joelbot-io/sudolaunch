import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { SudoNotification } from '../../shared/types'
import { useGrowAnimation } from './useGrowAnimation'

function formatDateTime(ts: number): string {
  const d = new Date(ts)
  const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const diff = Date.now() - ts
  let rel = 'Just now'
  if (diff >= 60000 && diff < 3600000) {
    rel = `${Math.floor(diff / 60000)}m ago`
  } else if (diff >= 3600000 && diff < 86400000) {
    rel = `${Math.floor(diff / 3600000)}h ago`
  } else if (diff >= 86400000) {
    rel = `${Math.floor(diff / 86400000)}d ago`
  }
  return `${dateStr}, ${timeStr} (${rel})`
}

export default function NotificationPanel(): JSX.Element {
  const [dockLayout, setDockLayout] = useState<'horizontal' | 'circle' | 'shelf'>('shelf')
  const [expanded, setExpanded] = useState(false)
  const [notifications, setNotifications] = useState<SudoNotification[]>([])
  const { growOrigin, growPhase, setGrowOrigin, setGrowPhase, growClassNames, growStyle, onGrowEnd } =
    useGrowAnimation()
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [copiedTarget, setCopiedTarget] = useState<{ id: string; field: 'input' | 'output' } | null>(null)
  const [summonPulse, setSummonPulse] = useState(false)
  const [summonColor, setSummonColor] = useState<string | null>(null)
  const [summonGlow, setSummonGlow] = useState<string | null>(null)
  const [dockFading, setDockFading] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.getSettings?.().then((s) => {
      if (s?.dockLayout) setDockLayout(s.dockLayout)
    })
    window.api.getNotifications().then(setNotifications)

    const unregUpdated = window.api.onNotificationsUpdated((items) => {
      setNotifications(items)
    })

    // Set together (not two independent handlers) so the shelf-mode open handshake below
    // acks only once both the expanded state and grow origin have actually painted — main
    // sends 'notify-expanded' then 'notify-grow-origin' back to back from the same
    // synchronous burst in toggleNotificationWindow.
    let pendingExpanded: boolean | null = null
    const unregExpanded = window.api.onNotifyExpanded((isExp) => {
      pendingExpanded = isExp
      flushSync(() => setExpanded(isExp))
    })

    const unregGrow = window.api.onNotifyGrowOrigin((origin) => {
      flushSync(() => {
        if (pendingExpanded !== null) setExpanded(pendingExpanded)
        setGrowOrigin(origin)
        setGrowPhase('pending')
      })
      // Two rAFs (not one) — the first only guarantees this commit painted, the second
      // gives Chromium a frame to have actually rasterized it before main flips the
      // window's opacity back to 1, avoiding the not-quite-painted flash this mirrors
      // from the shelf palette window's identical handshake.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.api.notifyReady?.()
        })
      })
    })

    const unregCollapsing = window.api.onNotifyCollapsing((origin) => {
      setGrowOrigin(origin)
      setGrowPhase('collapsing')
    })

    const unregSummoned = window.api.onDockSummoned?.((data) => {
      if (data?.color) setSummonColor(data.color)
      if (data?.glow) setSummonGlow(data.glow)
      setSummonPulse(true)
      setTimeout(() => setSummonPulse(false), 900)
    })

    const unregFade = window.api.onDockFade?.((dir) => setDockFading(dir === 'out'))

    return () => {
      unregUpdated()
      unregExpanded()
      unregGrow()
      unregCollapsing()
      unregSummoned?.()
      unregFade?.()
    }
  }, [])

  // Safety net: useGrowAnimation only clears phase/origin via onAnimationEnd, so if the
  // grow-in animation gets interrupted (e.g. a rapid re-toggle) without that event firing,
  // this fallback still resets state after the animation's nominal 150ms duration.
  useEffect(() => {
    if (growPhase !== 'running') return
    const timer = setTimeout(() => {
      setGrowPhase(null)
      setGrowOrigin(null)
    }, 250)
    return () => clearTimeout(timer)
  }, [growPhase])

  // Keyboard shortcut: Escape collapses the panel
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape' && expanded) {
        e.preventDefault()
        window.api.notifyToggle()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [expanded])

  // Collapse on blur when clicked away (only active once fully expanded and idle)
  useEffect(() => {
    if (!expanded || growPhase !== null) return

    let blurTimer: NodeJS.Timeout | null = null
    function handleBlur(): void {
      blurTimer = setTimeout(() => {
        if (expanded) {
          window.api.notifyToggle()
        }
      }, 120)
    }

    function handleFocus(): void {
      if (blurTimer) {
        clearTimeout(blurTimer)
        blurTimer = null
      }
    }

    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)
    return () => {
      if (blurTimer) clearTimeout(blurTimer)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
    }
  }, [expanded, growPhase])

  function handleCopy(id: string, field: 'input' | 'output', text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedTarget({ id, field })
      setTimeout(() => {
        setCopiedTarget((curr) => (curr?.id === id && curr?.field === field ? null : curr))
      }, 2000)
    })
  }

  function toggleCard(id: string): void {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const areAllCollapsed =
    notifications.length > 0 && notifications.every((n) => collapsedIds.has(n.id))

  function handleToggleAll(): void {
    if (areAllCollapsed) {
      setCollapsedIds(new Set())
    } else {
      setCollapsedIds(new Set(notifications.map((n) => n.id)))
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div
      className={[
        'notify-shell',
        expanded ? 'notify-expanded' : 'notify-collapsed',
        summonPulse ? 'summon-pulse' : '',
        !expanded && dockFading ? 'dock-fading' : '',
        growClassNames
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        ...growStyle,
        ...(summonColor ? { '--summon-color': summonColor } : {}),
        ...(summonGlow ? { '--summon-glow-color': summonGlow } : {})
      } as React.CSSProperties}
      onAnimationEnd={onGrowEnd}
    >
      {/* Collapsed Idle Icon (only rendered in circle/horizontal modes; in shelf mode, the icon is in the shelf) */}
      {dockLayout !== 'shelf' && (
        <button
          type="button"
          className="notify-icon-btn"
          title={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
          onClick={() => window.api.notifyToggle()}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unreadCount > 0 && (
            <span className="notify-badge-indicator" title={`${unreadCount} unread`}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Expanded Notification Panel */}
      <div className="notify-panel">
        <div className="notify-header">
          <div className="notify-header-left">
            <span className="notify-drag-handle" title="Notifications">
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
            <span className="notify-header-title">Notifications</span>
            {notifications.length > 0 && (
              <span className="notify-header-count">{notifications.length}</span>
            )}
          </div>
          <div className="notify-header-actions">
            {notifications.length > 0 && (
              <>
                <button
                  type="button"
                  className="notify-header-btn"
                  title={areAllCollapsed ? 'Expand all entries' : 'Collapse all entries'}
                  onClick={handleToggleAll}
                >
                  {areAllCollapsed ? 'Expand All' : 'Collapse All'}
                </button>
                <button
                  type="button"
                  className="notify-header-btn"
                  title="Clear all notifications"
                  onClick={() => window.api.clearNotifications()}
                >
                  Clear All
                </button>
              </>
            )}
            <button
              type="button"
              className="notify-header-collapse"
              title="Collapse (Esc)"
              onClick={() => window.api.notifyToggle()}
              aria-label="Collapse notifications"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        </div>

        <div ref={listRef} className="notify-body">
          {notifications.length === 0 ? (
            <div className="notify-empty">
              <div className="notify-empty-icon">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <div className="notify-empty-title">No notifications yet</div>
              <div className="notify-empty-sub">
                Command execution output and system alerts will appear here.
              </div>
            </div>
          ) : (
            notifications.map((item) => {
              const isSuccess = item.type === 'success'
              const isError = item.type === 'error'
              const badgeClass = isSuccess
                ? 'notify-type-success'
                : isError
                  ? 'notify-type-error'
                  : 'notify-type-info'

              // Suppress duplicate input/output boxes
              const isInputDuplicate = Boolean(
                item.commandInput &&
                  item.body &&
                  (item.body.trim() === item.commandInput.trim() ||
                    item.body.trim() === `Running in terminal:\n${item.commandInput.trim()}` ||
                    item.body.trim() === `Running in terminal: ${item.commandInput.trim()}`)
              )
              const displayInput = isInputDuplicate ? undefined : item.commandInput
              const displayBody = item.body
              const hasDetail = Boolean(
                (displayInput && displayInput.trim().length > 0) ||
                  (displayBody && displayBody.trim().length > 0)
              )

              const isCollapsed = hasDetail ? collapsedIds.has(item.id) : false

              return (
                <div
                  key={item.id}
                  className={`notify-card ${badgeClass} ${!hasDetail ? 'notify-card-single' : isCollapsed ? 'notify-card-collapsed' : 'notify-card-expanded'}`}
                >
                  {/* Accordion Toggle or Static Header */}
                  <div
                    className={`notify-card-header ${!hasDetail ? 'notify-card-header-static' : ''}`}
                    onClick={hasDetail ? () => toggleCard(item.id) : undefined}
                    role={hasDetail ? 'button' : undefined}
                    tabIndex={hasDetail ? 0 : undefined}
                    onKeyDown={
                      hasDetail
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              toggleCard(item.id)
                            }
                          }
                        : undefined
                    }
                    title={hasDetail ? (isCollapsed ? 'Click to expand' : 'Click to collapse') : undefined}
                  >
                    <div className="notify-card-title-row">
                      {hasDetail && (
                        <span className={`notify-accordion-chevron ${isCollapsed ? 'collapsed' : 'expanded'}`}>
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </span>
                      )}
                      <span className={`notify-status-dot ${badgeClass}`} />
                      <span className="notify-card-title">{item.title}</span>
                    </div>
                    <div className="notify-card-meta">
                      {item.commandName && (
                        <span className="notify-command-tag">/{item.commandName}</span>
                      )}
                      <span className="notify-card-time" title={new Date(item.timestamp).toLocaleString()}>
                        {formatDateTime(item.timestamp)}
                      </span>
                      <button
                        type="button"
                        className="notify-card-dismiss"
                        title="Dismiss notification"
                        onClick={(e) => {
                          e.stopPropagation()
                          window.api.dismissNotification(item.id)
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Compact Preview when collapsed */}
                  {hasDetail && isCollapsed && (displayInput || displayBody) && (
                    <div
                      className="notify-card-preview"
                      onClick={() => toggleCard(item.id)}
                      title="Click to expand full content"
                    >
                      <span className="notify-preview-prefix">
                        {displayInput ? '$' : '›'}
                      </span>
                      <span className="notify-preview-text">
                        {displayInput || displayBody}
                      </span>
                    </div>
                  )}

                  {/* Accordion Content Body when expanded */}
                  {hasDetail && !isCollapsed && (
                    <div className="notify-card-body">
                      {/* Command Input Section */}
                      {displayInput && (
                        <div className="notify-accordion-section notify-section-input">
                          <div className="notify-section-header">
                            <div className="notify-section-label">
                              <svg
                                width="11"
                                height="11"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="4 17 10 11 4 5" />
                                <line x1="12" y1="19" x2="20" y2="19" />
                              </svg>
                              <span>Command Input</span>
                            </div>
                            <button
                              type="button"
                              className="notify-copy-btn"
                              title="Copy command input"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCopy(item.id, 'input', displayInput)
                              }}
                            >
                              {copiedTarget?.id === item.id && copiedTarget.field === 'input' ? (
                                <>
                                  <svg
                                    width="11"
                                    height="11"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <svg
                                    width="11"
                                    height="11"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                  </svg>
                                  <span>Copy Input</span>
                                </>
                              )}
                            </button>
                          </div>
                          <pre className="notify-code-box notify-input-box">
                            {displayInput}
                          </pre>
                        </div>
                      )}

                      {/* Command Output Section */}
                      {displayBody && (
                        <div className="notify-accordion-section notify-section-output">
                          <div className="notify-section-header">
                            <div className="notify-section-label">
                              <svg
                                width="11"
                                height="11"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                              </svg>
                              <span>Command Output</span>
                            </div>
                            <button
                              type="button"
                              className="notify-copy-btn"
                              title="Copy command output"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCopy(item.id, 'output', displayBody)
                              }}
                            >
                              {copiedTarget?.id === item.id && copiedTarget.field === 'output' ? (
                                <>
                                  <svg
                                    width="11"
                                    height="11"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <svg
                                    width="11"
                                    height="11"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                  </svg>
                                  <span>Copy Output</span>
                                </>
                              )}
                            </button>
                          </div>
                          <pre className="notify-code-box notify-output-box">
                            {displayBody}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
