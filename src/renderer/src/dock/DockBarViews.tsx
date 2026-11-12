import React from 'react'
import type { FocusTimerState, GitRepoStatus, ShelfModuleId } from '../../../shared/types'
import type { CornerShimmerInfo } from '../useCornerShimmer'
import { windowMode } from '../windowMode'

export interface DockIdleViewProps {
  dockLayout: 'horizontal' | 'circle' | 'shelf'
  shelfIcons: ShelfModuleId[]
  shelfCollapsed: boolean
  setShelfCollapsed: React.Dispatch<React.SetStateAction<boolean>>
  setShelfInteractionTick: React.Dispatch<React.SetStateAction<number>>
  shelfPaletteActive: boolean
  activeShelfModule: string | null
  termUnread: boolean
  notifyCount: number
  focusState: FocusTimerState | null
  setFocusState: React.Dispatch<React.SetStateAction<FocusTimerState | null>>
  gitStatus: GitRepoStatus | null
  gitWatchersCount: number
  wingetUpdatesCount: number
  scheduledJobsCount: number
  shortcutsActive: boolean
  summonPulse: boolean
  summonColor: string | null
  summonGlow: string | null
  dockFading: boolean
  dockGlowColor: string
  dockGlowStyle: 'breathing' | 'steady' | 'stealth'
  paletteHotkey: string
  isDockAtHome: boolean
  isOrbitIdle: boolean
  barActive: boolean
  shimmerInfo: CornerShimmerInfo | null
}

function renderModuleSvgGlyph(moduleId: ShelfModuleId, size: number): JSX.Element | null {
  switch (moduleId) {
    case 'notify':
      return (
        <svg
          width={size}
          height={size}
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
      )
    case 'settings':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      )
    case 'focus':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="14" r="8" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="14" x2="15" y2="11" />
        </svg>
      )
    case 'git':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
      )
    case 'profile':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )
    case 'system':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      )
    case 'jobs':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <polyline points="12 14 12 16.5 14 18" />
        </svg>
      )
    case 'shortcuts':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
          <path d="M6 8h.001" />
          <path d="M10 8h.001" />
          <path d="M14 8h.001" />
          <path d="M18 8h.001" />
          <path d="M8 12h.001" />
          <path d="M12 12h.001" />
          <path d="M16 12h.001" />
          <path d="M7 16h10" />
        </svg>
      )
    default:
      return null
  }
}

function formatFocusClock(focusState: FocusTimerState | null): {
  formattedFocusClock: string
  isTimerActive: boolean
} {
  const focusRemaining = focusState?.remainingSeconds ?? 0
  const focusMinutes = Math.floor(focusRemaining / 60)
  const focusSeconds = focusRemaining % 60
  return {
    formattedFocusClock: `${focusMinutes}:${focusSeconds.toString().padStart(2, '0')}`,
    isTimerActive: Boolean(focusState && (focusState.running || focusState.paused))
  }
}

export function DockIdleView(props: DockIdleViewProps): JSX.Element {
  const {
    dockLayout,
    shelfIcons,
    shelfCollapsed,
    setShelfCollapsed,
    setShelfInteractionTick,
    shelfPaletteActive,
    activeShelfModule,
    termUnread,
    notifyCount,
    focusState,
    setFocusState,
    gitStatus,
    gitWatchersCount,
    wingetUpdatesCount,
    scheduledJobsCount,
    shortcutsActive,
    summonPulse,
    summonColor,
    summonGlow,
    dockFading,
    dockGlowColor,
    dockGlowStyle,
    paletteHotkey,
    isDockAtHome,
    isOrbitIdle,
    barActive,
    shimmerInfo
  } = props

  const { formattedFocusClock, isTimerActive } = formatFocusClock(focusState)

  if (dockLayout === 'shelf') {
    const renderShelfIcon = (iconId: ShelfModuleId): JSX.Element | null => {
      switch (iconId) {
        case 'term':
          return (
            <button
              key="term"
              type="button"
              className={`shelf-icon shelf-icon-term ${termUnread ? 'has-unread' : ''}`}
              onClick={() => window.api.termToggle()}
            >
              <span className="shelf-icon-glyph">{'>_'}</span>
            </button>
          )
        case 'bar':
          return (
            <button
              key="bar"
              type="button"
              className={`shelf-icon shelf-icon-bar ${shelfPaletteActive && activeShelfModule === 'bar' ? 'is-active' : ''}`}
              onClick={() => window.api.barActivate('bar')}
            >
              <span className="shelf-icon-glyph">{'/'}</span>
            </button>
          )
        case 'notify':
          return (
            <button
              key="notify"
              type="button"
              className={`shelf-icon shelf-icon-notify ${notifyCount > 0 ? 'has-unread' : ''}`}
              onClick={() => window.api.notifyToggle()}
            >
              <span className="shelf-icon-glyph">{renderModuleSvgGlyph('notify', 18)}</span>
              {notifyCount > 0 && (
                <span className="shelf-badge-indicator">
                  {notifyCount > 9 ? '9+' : notifyCount}
                </span>
              )}
            </button>
          )
        case 'settings':
          return (
            <button
              key="settings"
              type="button"
              className={`shelf-icon shelf-icon-settings ${shelfPaletteActive && activeShelfModule === 'settings' ? 'is-active' : ''}`}
              onClick={() => window.api.barActivate('settings')}
            >
              <span className="shelf-icon-glyph">{renderModuleSvgGlyph('settings', 18)}</span>
            </button>
          )
        case 'focus':
          return (
            <button
              key="focus"
              type="button"
              className={`shelf-icon shelf-icon-focus ${focusState?.running ? 'is-running' : ''} ${focusState?.paused ? 'is-paused' : ''} ${shelfPaletteActive && activeShelfModule === 'focus' ? 'is-active' : ''}`}
              onClick={() => window.api.barActivate('focus')}
            >
              {isTimerActive && (
                <div
                  className={`shelf-focus-countdown-clock ${focusState?.paused ? 'is-paused' : ''}`}
                  title={`Focus timer: ${formattedFocusClock} (${focusState?.paused ? 'Paused' : 'Running'})`}
                >
                  <span className="countdown-pulse-dot" />
                  <span className="countdown-time-digits">{formattedFocusClock}</span>
                </div>
              )}
              <span className="shelf-icon-glyph">{renderModuleSvgGlyph('focus', 18)}</span>
            </button>
          )
        case 'git':
          return (
            <button
              key="git"
              type="button"
              className={`shelf-icon shelf-icon-git ${gitStatus?.dirty ? 'is-dirty' : ''} ${shelfPaletteActive && activeShelfModule === 'git' ? 'is-active' : ''}`}
              onClick={() => window.api.barActivate('git')}
            >
              <span className="shelf-icon-glyph">{renderModuleSvgGlyph('git', 18)}</span>
              {(gitStatus?.isRepo && gitStatus.branch) || gitWatchersCount > 0 ? (
                <span
                  className={`shelf-badge-indicator shelf-git-badge ${gitStatus?.dirty ? 'is-dirty' : ''}`}
                >
                  {gitStatus?.isRepo && gitStatus.branch
                    ? gitStatus.branch.length > 7
                      ? gitStatus.branch.slice(0, 6) + '…'
                      : gitStatus.branch
                    : ''}
                  {gitStatus?.dirty ? ' •' : ''}
                  {gitWatchersCount > 0 ? ` 🔥${gitWatchersCount}` : ''}
                </span>
              ) : null}
            </button>
          )
        case 'profile':
          return (
            <button
              key="profile"
              type="button"
              className={`shelf-icon shelf-icon-profile ${shelfPaletteActive && activeShelfModule === 'profile' ? 'is-active' : ''}`}
              onClick={() => window.api.barActivate('profile')}
            >
              <span className="shelf-icon-glyph">{renderModuleSvgGlyph('profile', 18)}</span>
            </button>
          )
        case 'system':
          return (
            <button
              key="system"
              type="button"
              className={`shelf-icon shelf-icon-system ${shelfPaletteActive && activeShelfModule === 'system' ? 'is-active' : ''}`}
              title={
                wingetUpdatesCount > 0
                  ? `System Updates & Management [🧰] (${wingetUpdatesCount} package updates)`
                  : 'System Updates & Management [🧰] (/system)'
              }
              onClick={() => window.api.barActivate('system')}
            >
              <span className="shelf-icon-glyph">{renderModuleSvgGlyph('system', 18)}</span>
              {wingetUpdatesCount > 0 && (
                <span className="shelf-badge-indicator" style={{ background: '#3b82f6' }}>
                  {wingetUpdatesCount > 99 ? '99+' : wingetUpdatesCount}
                </span>
              )}
            </button>
          )
        case 'jobs':
          return (
            <button
              key="jobs"
              type="button"
              className={`shelf-icon shelf-icon-jobs ${shelfPaletteActive && activeShelfModule === 'jobs' ? 'is-active' : ''}`}
              title={
                scheduledJobsCount > 0
                  ? `Cron & Scheduled Jobs [⏰] (${scheduledJobsCount} active)`
                  : 'Cron & Scheduled Jobs [⏰] (/jobs)'
              }
              onClick={() => window.api.barActivate('jobs')}
            >
              <span className="shelf-icon-glyph">{renderModuleSvgGlyph('jobs', 18)}</span>
              {scheduledJobsCount > 0 && (
                <span className="shelf-badge-indicator" style={{ background: '#10b981' }}>
                  {scheduledJobsCount > 99 ? '99+' : scheduledJobsCount}
                </span>
              )}
            </button>
          )
        case 'shortcuts':
          return (
            <button
              key="shortcuts"
              type="button"
              className={`shelf-icon shelf-icon-shortcuts ${shortcutsActive ? 'is-active' : ''}`}
              title="Shortcuts Overlay [⌨️] (/shortcuts)"
              onClick={() => window.api.shortcutsToggle?.()}
            >
              <span className="shelf-icon-glyph">{renderModuleSvgGlyph('shortcuts', 18)}</span>
            </button>
          )
        default:
          return null
      }
    }

    if (shelfCollapsed) {
      return (
        <div
          className={`dock-shelf-container ${summonPulse ? 'summon-pulse' : ''} ${dockFading ? 'dock-fading' : ''}`}
          style={
            {
              ...(summonColor ? { '--summon-color': summonColor } : {}),
              ...(summonGlow ? { '--summon-glow-color': summonGlow } : {}),
              ...(dockGlowColor ? { '--dock-glow-color': dockGlowColor } : {})
            } as React.CSSProperties
          }
        >
          <div className="dock-shelf-collapsed-wrap">
            {isTimerActive && (
              <button
                type="button"
                className={`shelf-focus-countdown-clock is-collapsed-pill ${focusState?.paused ? 'is-paused' : ''}`}
                title={`Focus timer: ${formattedFocusClock} (${focusState?.paused ? 'Paused' : 'Running'}) — Click to expand`}
                onClick={() => setShelfCollapsed(false)}
              >
                <span className="countdown-pulse-dot" />
                <span className="countdown-time-digits">{formattedFocusClock}</span>
              </button>
            )}
            <button
              type="button"
              className={`dock-shelf-glow-bar glow-${dockGlowStyle}`}
              title="Click to expand · Double-click to search · Right-click for menu"
              onClick={() => setShelfCollapsed(false)}
              onDoubleClick={(e) => {
                e.stopPropagation()
                setShelfCollapsed(false)
                if (windowMode === 'bar') {
                  window.api.barActivate()
                } else {
                  window.api.hidePalette()
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                window.api.showDockContextMenu?.()
              }}
            />
          </div>
        </div>
      )
    }

    return (
      <div
        className={`dock-shelf-container ${summonPulse ? 'summon-pulse' : ''} ${dockFading ? 'dock-fading' : ''}`}
        style={
          {
            ...(dockGlowColor ? { '--dock-glow-color': dockGlowColor } : {}),
            ...(summonColor ? { '--summon-color': summonColor } : {}),
            ...(summonGlow ? { '--summon-glow-color': summonGlow } : {})
          } as React.CSSProperties
        }
      >
        <div
          className="dock-shelf"
          onClickCapture={() => setShelfInteractionTick((t) => t + 1)}
          onContextMenu={(e) => {
            if (
              e.target === e.currentTarget ||
              (e.target as HTMLElement).classList.contains('dock-shelf')
            ) {
              e.preventDefault()
              window.api.showDockContextMenu?.()
            }
          }}
        >
          {shelfIcons.map((id) => renderShelfIcon(id))}
        </div>
      </div>
    )
  }

  if (dockLayout === 'circle') {
    const orbitModuleList: ShelfModuleId[] = ['bar', ...shelfIcons.filter((id) => id !== 'bar')]
    const count = orbitModuleList.length
    const orbitRadius = 48
    const centerCoord = 75
    const isOrbiting = isDockAtHome && isOrbitIdle && !shelfPaletteActive && !barActive

    const renderOrbitSatellite = (moduleId: ShelfModuleId, idx: number): JSX.Element | null => {
      const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / count
      const sx = Math.round(centerCoord + orbitRadius * Math.cos(angle))
      const sy = Math.round(centerCoord + orbitRadius * Math.sin(angle))
      const isBar = moduleId === 'bar'
      const btnSize = isBar ? 36 : 32

      let iconContent: JSX.Element | null
      let title: string
      let isModuleActive = false
      let hasUnread = false
      let badgeContent: React.ReactNode = null
      let onClick: () => void

      switch (moduleId) {
        case 'bar':
          title = paletteHotkey ? `Command Palette [/] (${paletteHotkey})` : 'Command Palette [/]'
          isModuleActive = shelfPaletteActive && activeShelfModule === 'bar'
          iconContent = (
            <span
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: !isModuleActive ? dockGlowColor || undefined : undefined
              }}
            >
              /
            </span>
          )
          onClick = () => window.api.barActivate('bar')
          break
        case 'term':
          title = 'PowerShell Terminal [>_]'
          hasUnread = termUnread
          if (termUnread) {
            badgeContent = (
              <span className="circle-orbit-badge" style={{ background: '#38bdf8' }}>
                •
              </span>
            )
          }
          iconContent = (
            <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'monospace' }}>&gt;_</span>
          )
          onClick = () => window.api.termToggle()
          break
        case 'notify':
          title =
            notifyCount > 0
              ? `Notification Center [🔔] (${notifyCount} unread)`
              : 'Notification Center [🔔]'
          if (notifyCount > 0) {
            badgeContent = (
              <span className="circle-orbit-badge">{notifyCount > 9 ? '9+' : notifyCount}</span>
            )
          }
          iconContent = renderModuleSvgGlyph('notify', 15)
          onClick = () => window.api.notifyToggle()
          break
        case 'git':
          title =
            gitStatus?.isRepo && gitStatus.branch
              ? `Git [🔀] (${gitStatus.branch}${gitStatus.dirty ? ' *' : ''}${gitWatchersCount > 0 ? ` · 🔥 ${gitWatchersCount} watcher(s)` : ''})`
              : 'Git Repository & Watchers [🔀]'
          isModuleActive = shelfPaletteActive && activeShelfModule === 'git'
          if (gitWatchersCount > 0) {
            badgeContent = (
              <span className="circle-orbit-badge" style={{ background: '#10b981' }}>
                {gitWatchersCount}
              </span>
            )
          } else if (gitStatus?.dirty) {
            badgeContent = (
              <span className="circle-orbit-badge" style={{ background: '#f59e0b' }}>
                •
              </span>
            )
          }
          iconContent = renderModuleSvgGlyph('git', 15)
          onClick = () => window.api.barActivate('git')
          break
        case 'focus':
          title = isTimerActive
            ? `Focus Timer [⏱️] (${Math.floor((focusState?.remainingSeconds ?? 0) / 60)}m left)`
            : 'Focus & Pomodoro Timer [⏱️]'
          isModuleActive = shelfPaletteActive && activeShelfModule === 'focus'
          if (focusState?.running) {
            badgeContent = (
              <span className="circle-orbit-badge" style={{ background: '#10b981' }}>
                ⏱
              </span>
            )
          }
          iconContent = renderModuleSvgGlyph('focus', 15)
          onClick = () => window.api.barActivate('focus')
          break
        case 'settings':
          title = 'Settings [⚙️] (/config)'
          isModuleActive = shelfPaletteActive && activeShelfModule === 'settings'
          iconContent = renderModuleSvgGlyph('settings', 15)
          onClick = () => window.api.barActivate('settings')
          break
        case 'profile':
          title = 'Profiles [👤] (/profile)'
          isModuleActive = shelfPaletteActive && activeShelfModule === 'profile'
          iconContent = renderModuleSvgGlyph('profile', 15)
          onClick = () => window.api.barActivate('profile')
          break
        case 'system':
          title =
            wingetUpdatesCount > 0
              ? `System Management [🧰] (${wingetUpdatesCount} package updates)`
              : 'System Management [🧰] (/system)'
          isModuleActive = shelfPaletteActive && activeShelfModule === 'system'
          if (wingetUpdatesCount > 0) {
            badgeContent = (
              <span className="circle-orbit-badge" style={{ background: '#3b82f6' }}>
                {wingetUpdatesCount > 9 ? '9+' : wingetUpdatesCount}
              </span>
            )
          }
          iconContent = renderModuleSvgGlyph('system', 15)
          onClick = () => window.api.barActivate('system')
          break
        case 'jobs':
          title =
            scheduledJobsCount > 0
              ? `Cron & Scheduled Jobs [⏰] (${scheduledJobsCount} active)`
              : 'Cron & Scheduled Jobs [⏰] (/jobs)'
          isModuleActive = shelfPaletteActive && activeShelfModule === 'jobs'
          if (scheduledJobsCount > 0) {
            badgeContent = (
              <span className="circle-orbit-badge" style={{ background: '#10b981' }}>
                {scheduledJobsCount > 9 ? '9+' : scheduledJobsCount}
              </span>
            )
          }
          iconContent = renderModuleSvgGlyph('jobs', 15)
          onClick = () => window.api.barActivate('jobs')
          break
        case 'shortcuts':
          title = 'Shortcuts Overlay [⌨️] (/shortcuts)'
          isModuleActive = shortcutsActive
          iconContent = renderModuleSvgGlyph('shortcuts', 15)
          onClick = () => window.api.shortcutsToggle?.()
          break
        default:
          return null
      }

      return (
        <button
          key={moduleId}
          type="button"
          className={`circle-orbit-satellite-btn ${isModuleActive ? 'is-active' : ''} ${hasUnread ? 'has-unread' : ''} ${summonPulse ? 'summon-pulse' : ''}`}
          style={{
            left: sx,
            top: sy,
            transform: 'translate(-50%, -50%)',
            width: btnSize,
            height: btnSize,
            color: isBar && !isModuleActive ? '#38bdf8' : undefined
          }}
          title={title}
          onClick={onClick}
        >
          <div className="circle-orbit-glyph-wrapper">
            {iconContent}
            {badgeContent}
          </div>
        </button>
      )
    }

    return (
      <div
        className={`circle-orbit-container ${summonPulse ? 'summon-pulse' : ''} ${dockFading ? 'dock-fading' : ''}`}
        style={
          {
            ...(dockGlowColor ? { '--dock-glow-color': dockGlowColor } : {}),
            ...(summonColor ? { '--summon-color': summonColor } : {}),
            ...(summonGlow ? { '--summon-glow-color': summonGlow } : {})
          } as React.CSSProperties
        }
        onContextMenu={(e) => {
          e.preventDefault()
          window.api.showDockContextMenu?.()
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 27,
            borderRadius: '50%',
            border: '1.5px dashed var(--dock-glow-color, rgba(56, 189, 248, 0.45))',
            pointerEvents: 'none',
            animation: 'orbit-track-pulse 4s ease-in-out infinite'
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 51,
            borderRadius: '50%',
            border: '1px dotted var(--dock-glow-color, rgba(56, 189, 248, 0.22))',
            pointerEvents: 'none'
          }}
        />
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: 150,
            height: 150,
            pointerEvents: 'none'
          }}
        >
          {orbitModuleList.map((_, idx) => {
            const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / count
            return (
              <line
                key={idx}
                x1={centerCoord}
                y1={centerCoord}
                x2={Math.round(centerCoord + orbitRadius * Math.cos(angle))}
                y2={Math.round(centerCoord + orbitRadius * Math.sin(angle))}
                stroke="var(--dock-glow-color, rgba(56, 189, 248, 0.22))"
                strokeWidth="1"
                strokeDasharray="2 3"
              />
            )
          })}
        </svg>

        {isTimerActive ? (
          <button
            type="button"
            className={`circle-orbit-center-timer ${focusState?.paused ? 'is-paused' : ''}`}
            title={focusState?.paused ? 'Paused — click to resume timer' : 'Timer running — click to pause'}
            onClick={(e) => {
              e.stopPropagation()
              window.api.pauseFocusTimer?.().then(setFocusState)
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="center-timer-icon">
              {focusState?.paused ? (
                <span style={{ fontSize: '8px', color: '#f59e0b', lineHeight: 1, marginLeft: '1px' }}>
                  ▶
                </span>
              ) : (
                <span className="center-timer-dot" />
              )}
            </div>
            <span className="center-timer-digits">{formattedFocusClock}</span>
          </button>
        ) : (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: dockGlowColor || '#38bdf8',
              boxShadow: dockGlowColor
                ? `0 0 7px ${dockGlowColor}, 0 0 15px ${dockGlowColor}`
                : '0 0 7px #38bdf8, 0 0 15px rgba(56, 189, 248, 0.55)',
              pointerEvents: 'none',
              zIndex: 15,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: 'translate(-50%, -50%)',
              animation: 'orbit-center-beacon 3s ease-in-out infinite'
            }}
            title="Mouse Cursor anchor (Ctrl+Right Click location)"
          >
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#ffffff' }} />
          </div>
        )}

        <div className={`circle-orbit-wheel ${isOrbiting ? 'is-revolving' : ''}`}>
          {orbitModuleList.map((id, idx) => renderOrbitSatellite(id, idx))}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`palette palette-bar-icon ${summonPulse ? 'summon-pulse' : ''} ${dockFading ? 'dock-fading' : ''} ${shimmerInfo ? `icon-shimmer shimmer-${shimmerInfo.corner}${shimmerInfo.flickerType ? ` has-flicker-${shimmerInfo.flickerType}` : ''}` : ''}`}
      style={
        {
          ...(dockGlowColor ? { '--dock-glow-color': dockGlowColor } : {}),
          ...(shimmerInfo
            ? {
                '--shimmer-color': shimmerInfo.color,
                '--shimmer-gradient': shimmerInfo.gradient
              }
            : {}),
          ...(summonColor ? { '--summon-color': summonColor } : {}),
          ...(summonGlow ? { '--summon-glow-color': summonGlow } : {})
        } as React.CSSProperties
      }
    >
      <button
        className="bar-icon-button"
        title={paletteHotkey ? `Open command bar (${paletteHotkey})` : 'Open command bar'}
        onClick={() => window.api.barActivate()}
      >
        {'/'}
      </button>
    </div>
  )
}

