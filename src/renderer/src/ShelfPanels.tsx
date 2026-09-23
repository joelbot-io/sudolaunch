import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import type { FocusTimerState, GitRepoStatus, KnownRepoItem, ProfileItem, BackupArchiveItem } from '../../shared/types'

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
          (e.target as HTMLElement).blur()
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

interface GitPanelProps {
  gitStatus: GitRepoStatus | null
  branches: string[]
  onRefresh: () => void
  onClose: () => void
  onBackToPalette: () => void
}

export function GitStatusPanel({
  gitStatus,
  branches,
  onRefresh,
  onClose,
  onBackToPalette
}: GitPanelProps): JSX.Element {
  const [filter, setFilter] = useState('')
  const [switching, setSwitching] = useState<string | null>(null)
  const [statusBanner, setStatusBanner] = useState<string | null>(null)
  const [showRepoPicker, setShowRepoPicker] = useState(false)
  const [knownRepos, setKnownRepos] = useState<KnownRepoItem[]>([])
  const [repoFilter, setRepoFilter] = useState('')
  const [isSwitchingRepo, setIsSwitchingRepo] = useState(false)

  const isRepo = gitStatus?.isRepo ?? false
  const currentBranch = gitStatus?.branch ?? 'unknown'
  const isDirty = gitStatus?.dirty ?? false
  const ahead = gitStatus?.ahead ?? 0
  const behind = gitStatus?.behind ?? 0

  const loadKnownRepos = useCallback(async () => {
    try {
      const list = await window.api.getKnownGitRepos?.()
      if (Array.isArray(list)) setKnownRepos(list)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadKnownRepos()
  }, [loadKnownRepos])

  const filteredBranches = useMemo(() => {
    if (!filter) return branches
    return branches.filter((b) => b.toLowerCase().includes(filter.toLowerCase()))
  }, [branches, filter])

  const filteredKnownRepos = useMemo(() => {
    if (!repoFilter) return knownRepos
    const lower = repoFilter.toLowerCase()
    return knownRepos.filter((r) => r.name.toLowerCase().includes(lower) || r.path.toLowerCase().includes(lower))
  }, [knownRepos, repoFilter])

  async function handleCheckout(branch: string): Promise<void> {
    if (branch === currentBranch) return
    setSwitching(branch)
    try {
      const res = await window.api.checkoutGitBranch?.(branch)
      if (res && res.success) {
        setStatusBanner(`Switched to branch "${branch}"`)
        onRefresh()
      } else {
        setStatusBanner(res?.message ?? 'Failed to checkout branch')
      }
    } catch (err) {
      setStatusBanner(String(err))
    } finally {
      setSwitching(null)
      setTimeout(() => setStatusBanner(null), 4000)
    }
  }

  async function handleBrowseFolder(): Promise<void> {
    setIsSwitchingRepo(true)
    try {
      const res = await window.api.selectGitRepoFolder?.()
      if (res && res.isRepo) {
        setStatusBanner(`Active repo switched to "${res.repoName}" (${res.branch})`)
        setShowRepoPicker(false)
        onRefresh()
        await loadKnownRepos()
      } else if (res && !res.isRepo) {
        setStatusBanner(`Selected folder is not a valid git repository: ${res.repoPath}`)
      }
    } catch (err) {
      setStatusBanner(`Failed to switch repo: ${err}`)
    } finally {
      setIsSwitchingRepo(false)
      setTimeout(() => setStatusBanner(null), 4000)
    }
  }

  async function handleSelectRepo(path: string): Promise<void> {
    setIsSwitchingRepo(true)
    try {
      const res = await window.api.setActiveGitRepo?.(path)
      if (res && res.isRepo) {
        setStatusBanner(`Active repo switched to "${res.repoName}" (${res.branch})`)
        setShowRepoPicker(false)
        onRefresh()
        await loadKnownRepos()
      } else {
        setStatusBanner(`Selected folder is not a valid git repository`)
      }
    } catch (err) {
      setStatusBanner(`Failed to switch repo: ${err}`)
    } finally {
      setIsSwitchingRepo(false)
      setTimeout(() => setStatusBanner(null), 4000)
    }
  }

  function handleOpenTerminal(): void {
    onClose()
    window.api.termToggle?.()
  }

  return (
    <div className="shelf-module-panel git-panel">
      <div className="shelf-panel-header">
        <div className="shelf-panel-title-group">
          <span className="shelf-panel-icon">🔀</span>
          <div>
            <h2 className="shelf-panel-title">Git Repository & Branch</h2>
            <span className="shelf-panel-subtitle">
              {isRepo ? (gitStatus?.repoName ? `Repo: ${gitStatus.repoName}` : 'Git Active') : 'Not a Git Repository'}
            </span>
          </div>
        </div>
        <div className="shelf-panel-header-actions">
          <button type="button" className="shelf-panel-back-btn" onClick={onBackToPalette} title="Back to Command Palette">
            /
          </button>
          <button type="button" className="shelf-panel-close-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
      </div>

      {statusBanner && <div className="shelf-panel-status-banner">{statusBanner}</div>}

      <div className="git-overview-card">
        <div className="git-branch-hero">
          <div className="git-branch-info">
            <span className="git-branch-label">Current Branch:</span>
            <span className="git-branch-name">{currentBranch}</span>
          </div>
          <div className="git-status-pills">
            {isDirty ? (
              <span className="git-pill git-pill-dirty" title="Uncommitted changes in working tree">
                ● Modified
              </span>
            ) : (
              <span className="git-pill git-pill-clean" title="Working tree clean">
                ✓ Clean
              </span>
            )}
            {ahead > 0 && <span className="git-pill git-pill-sync">↑ {ahead} ahead</span>}
            {behind > 0 && <span className="git-pill git-pill-sync">↓ {behind} behind</span>}
          </div>
        </div>

        {gitStatus?.repoPath && (
          <div className="git-repo-location-row" title={gitStatus.repoPath}>
            <span className="git-repo-folder-icon">📂</span>
            <span className="git-repo-path-text">{gitStatus.repoPath}</span>
          </div>
        )}

        <div className="git-quick-actions">
          <button
            type="button"
            className={`shelf-btn shelf-btn-sm ${showRepoPicker ? 'shelf-btn-primary' : ''}`}
            onClick={() => {
              setShowRepoPicker(!showRepoPicker)
              if (!showRepoPicker) loadKnownRepos()
            }}
          >
            📁 Switch Repo
          </button>
          <button type="button" className="shelf-btn shelf-btn-sm" onClick={handleOpenTerminal}>
            💻 Open Terminal
          </button>
          <button type="button" className="shelf-btn shelf-btn-sm" onClick={onRefresh}>
            🔄 Refresh Status
          </button>
        </div>
      </div>

      {showRepoPicker && (
        <div className="git-repo-picker-card">
          <div className="git-repo-picker-header">
            <div>
              <div className="git-repo-picker-title">Switch Active Repository</div>
              <div className="git-repo-picker-subtitle">Select a known repository or browse your filesystem:</div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="shelf-btn shelf-btn-primary shelf-btn-sm"
                onClick={handleBrowseFolder}
                disabled={isSwitchingRepo}
              >
                📂 Browse Folder...
              </button>
              <button
                type="button"
                className="shelf-btn shelf-btn-sm"
                onClick={() => setShowRepoPicker(false)}
              >
                ✕ Close
              </button>
            </div>
          </div>

          <input
            type="text"
            className="git-branch-filter"
            placeholder="Search known repositories..."
            value={repoFilter}
            onChange={(e) => setRepoFilter(e.target.value)}
          />

          <div className="git-known-repos-list">
            {filteredKnownRepos.map((r) => {
              const isCurrent =
                r.isCurrent || (gitStatus?.repoPath && r.path.toLowerCase() === gitStatus.repoPath.toLowerCase())
              return (
                <div
                  key={r.path}
                  className={`git-known-repo-item ${isCurrent ? 'is-current' : ''}`}
                  onClick={() => !isCurrent && handleSelectRepo(r.path)}
                >
                  <div className="git-known-repo-icon">
                    {isCurrent ? '⭐' : '📁'}
                  </div>
                  <div className="git-known-repo-info">
                    <div className="git-known-repo-name-row">
                      <span className="git-known-repo-name">{r.name}</span>
                      {r.branch && (
                        <span className="git-pill git-pill-sync" style={{ fontSize: '9.5px', padding: '1px 5px' }}>
                          {r.branch}
                        </span>
                      )}
                      {isCurrent && <span className="profile-badge-current">Active</span>}
                    </div>
                    <span className="git-known-repo-path" title={r.path}>
                      {r.path}
                    </span>
                  </div>
                  <div className="git-known-repo-action">
                    {isCurrent ? (
                      <span className="profile-current-indicator">Current</span>
                    ) : (
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-primary shelf-btn-sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelectRepo(r.path)
                        }}
                        disabled={isSwitchingRepo}
                      >
                        Select
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {filteredKnownRepos.length === 0 && (
              <div className="profile-empty-list" style={{ padding: '14px' }}>
                No matching repositories found. Click "Browse Folder..." to select a repository directory.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="git-branches-section">
        <div className="git-branches-header">
          <span className="git-branches-label">Branches ({branches.length})</span>
          <input
            type="text"
            className="git-branch-filter"
            placeholder="Filter branches..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        <ul className="git-branches-list">
          {filteredBranches.map((branch) => {
            const isCurrent = branch === currentBranch
            const isPending = switching === branch
            return (
              <li
                key={branch}
                className={`git-branch-item ${isCurrent ? 'is-current' : ''}`}
                onClick={() => !isCurrent && handleCheckout(branch)}
              >
                <span className="git-branch-item-name">
                  {isCurrent ? '● ' : '  '}
                  {branch}
                </span>
                {isCurrent ? (
                  <span className="git-branch-badge current">Current</span>
                ) : isPending ? (
                  <span className="git-branch-badge switching">Switching...</span>
                ) : (
                  <span className="git-branch-action-hint">Checkout</span>
                )}
              </li>
            )
          })}
          {filteredBranches.length === 0 && (
            <li className="git-branches-empty">No matching branches found</li>
          )}
        </ul>
      </div>
    </div>
  )
}

interface ProfilePanelProps {
  onOpenSettings: () => void
  onClose: () => void
  onBackToPalette: () => void
}

export function ProfilePanel({ onOpenSettings, onClose, onBackToPalette }: ProfilePanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<'profiles' | 'backups' | 'actions'>('profiles')
  const [profiles, setProfiles] = useState<ProfileItem[]>([])
  const [archives, setArchives] = useState<BackupArchiveItem[]>([])
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [cloneCurrent, setCloneCurrent] = useState(true)
  const [confirmRestoreArchive, setConfirmRestoreArchive] = useState<string | null>(null)
  const [confirmDeleteProfile, setConfirmDeleteProfile] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const flash = useCallback((msg: string): void => {
    setFeedback(msg)
    setTimeout(() => setFeedback(null), 4000)
  }, [])

  const loadData = useCallback(async () => {
    try {
      const [pList, aList] = await Promise.all([
        window.api.listProfiles?.() ?? [],
        window.api.listBackupArchives?.() ?? []
      ])
      setProfiles(pList)
      setArchives(aList)
    } catch (err) {
      flash(`Failed to load data: ${err}`)
    }
  }, [flash])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleSwitchProfile(profileId: string): Promise<void> {
    try {
      await window.api.switchProfile?.(profileId)
      flash(`Switched to profile: ${profileId}`)
      await loadData()
    } catch (err) {
      flash(`Switch failed: ${err}`)
    }
  }

  async function handleCreateProfile(): Promise<void> {
    const trimmed = newProfileName.trim()
    if (!trimmed) return
    try {
      await window.api.createProfile?.(trimmed, cloneCurrent)
      setNewProfileName('')
      setIsCreating(false)
      flash(`Created profile: "${trimmed}"`)
      await loadData()
    } catch (err) {
      flash(`Create failed: ${err}`)
    }
  }

  async function handleDeleteProfile(profileId: string): Promise<void> {
    if (confirmDeleteProfile !== profileId) {
      setConfirmDeleteProfile(profileId)
      setTimeout(() => setConfirmDeleteProfile(null), 4000)
      return
    }
    try {
      await window.api.deleteProfile?.(profileId)
      setConfirmDeleteProfile(null)
      flash(`Deleted profile: ${profileId}`)
      await loadData()
    } catch (err) {
      flash(`Delete failed: ${err}`)
    }
  }

  async function handleRestoreArchive(filename: string): Promise<void> {
    if (confirmRestoreArchive !== filename) {
      setConfirmRestoreArchive(filename)
      setTimeout(() => setConfirmRestoreArchive(null), 4000)
      return
    }
    try {
      await window.api.restoreSpecificBackup?.(filename)
      setConfirmRestoreArchive(null)
      flash(`Restored settings from ${filename}`)
      await loadData()
    } catch (err) {
      flash(`Restore failed: ${err}`)
    }
  }

  async function handleBackup(): Promise<void> {
    try {
      await window.api.executeProfileCommand?.('backup')
      flash('Settings backed up to ~/.sudolaunch-archives/')
      await loadData()
    } catch (err) {
      flash(`Backup failed: ${err}`)
    }
  }

  async function handleReset(): Promise<void> {
    if (!confirmReset) {
      setConfirmReset(true)
      setTimeout(() => setConfirmReset(false), 4000)
      return
    }
    try {
      await window.api.executeProfileCommand?.('reset')
      flash('Configuration reset to factory defaults')
      setConfirmReset(false)
      await loadData()
    } catch (err) {
      flash(`Reset failed: ${err}`)
    }
  }

  function handleOpenFolder(): void {
    window.api.openConfigFolder?.()
    flash('Opened ~/.sudolaunch in File Explorer')
  }

  function handleOpenArchives(): void {
    window.api.executeProfileCommand?.('open-backups')
    flash('Opened ~/.sudolaunch-archives in File Explorer')
  }

  const currentProfile = profiles.find((p) => p.isCurrent)

  return (
    <div className="shelf-module-panel profile-panel">
      <div className="shelf-panel-header">
        <div className="shelf-panel-title-group">
          <span className="shelf-panel-icon">👤</span>
          <div>
            <h2 className="shelf-panel-title">Profile & Configuration</h2>
            <span className="shelf-panel-subtitle">
              Active: <strong style={{ color: 'var(--fg)', letterSpacing: '0.2px' }}>{currentProfile?.name || 'Default'}</strong>
            </span>
          </div>
        </div>
        <div className="shelf-panel-header-actions">
          <button type="button" className="shelf-panel-back-btn" onClick={onBackToPalette} title="Back to Command Palette">
            /
          </button>
          <button type="button" className="shelf-panel-close-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
      </div>

      {feedback && <div className="shelf-panel-status-banner">{feedback}</div>}

      {/* Navigation tabs */}
      <div className="profile-tabs-bar">
        <button
          type="button"
          className={`profile-tab-btn ${activeTab === 'profiles' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('profiles')}
        >
          <span>👤 Profiles</span>
          <span className="profile-tab-count">{profiles.length}</span>
        </button>
        <button
          type="button"
          className={`profile-tab-btn ${activeTab === 'backups' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('backups')}
        >
          <span>💾 Backups</span>
          <span className="profile-tab-count">{archives.length}</span>
        </button>
        <button
          type="button"
          className={`profile-tab-btn ${activeTab === 'actions' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('actions')}
        >
          <span>⚙️ Tools</span>
        </button>
      </div>

      {/* Tab 1: Profiles List */}
      {activeTab === 'profiles' && (
        <div className="profile-tab-content">
          <div className="profile-tab-header">
            <span className="profile-tab-title">Choose from available profiles:</span>
            {!isCreating && (
              <button
                type="button"
                className="shelf-btn shelf-btn-primary shelf-btn-sm"
                onClick={() => setIsCreating(true)}
              >
                + New Profile
              </button>
            )}
          </div>

          {isCreating && (
            <div className="profile-create-box">
              <div className="profile-create-title">Create New Profile</div>
              <input
                type="text"
                className="profile-create-input"
                placeholder="Profile Name (e.g. Work, Gaming, Dev)..."
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateProfile()
                  if (e.key === 'Escape') setIsCreating(false)
                }}
                autoFocus
              />
              <label className="profile-create-checkbox-label">
                <input
                  type="checkbox"
                  checked={cloneCurrent}
                  onChange={(e) => setCloneCurrent(e.target.checked)}
                />
                <span>Clone current settings, shortcuts, and layout</span>
              </label>
              <div className="profile-create-actions">
                <button
                  type="button"
                  className="shelf-btn shelf-btn-primary shelf-btn-sm"
                  onClick={handleCreateProfile}
                  disabled={!newProfileName.trim()}
                >
                  Save Profile
                </button>
                <button
                  type="button"
                  className="shelf-btn shelf-btn-sm"
                  onClick={() => {
                    setIsCreating(false)
                    setNewProfileName('')
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="profile-items-list">
            {profiles.map((p) => (
              <div key={p.id} className={`profile-item-card ${p.isCurrent ? 'is-current' : ''}`}>
                <div className="profile-item-avatar">
                  {p.isCurrent ? '⭐' : '👤'}
                </div>
                <div className="profile-item-info">
                  <div className="profile-item-name-row">
                    <span className="profile-item-name">{p.name}</span>
                    {p.isCurrent && <span className="profile-badge-current">Active</span>}
                  </div>
                  <span className="profile-item-desc">{p.description}</span>
                  <div className="profile-item-stats">
                    <span>{p.commandsCount ?? 0} commands</span>
                    <span>•</span>
                    <span>{p.linksCount ?? 0} links</span>
                    {p.lastModified && (
                      <>
                        <span>•</span>
                        <span>{new Date(p.lastModified).toLocaleDateString()}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="profile-item-actions">
                  {p.isCurrent ? (
                    <span className="profile-current-indicator">Current</span>
                  ) : (
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-primary shelf-btn-sm"
                      onClick={() => handleSwitchProfile(p.id)}
                    >
                      Switch
                    </button>
                  )}
                  {!p.isCurrent && p.id !== 'default' && (
                    <button
                      type="button"
                      className={`shelf-btn shelf-btn-sm ${confirmDeleteProfile === p.id ? 'shelf-btn-danger' : ''}`}
                      onClick={() => handleDeleteProfile(p.id)}
                      title={confirmDeleteProfile === p.id ? 'Click again to confirm delete' : 'Delete profile'}
                    >
                      {confirmDeleteProfile === p.id ? 'Confirm?' : '✕'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Backups & Archives */}
      {activeTab === 'backups' && (
        <div className="profile-tab-content">
          <div className="profile-tab-header">
            <span className="profile-tab-title">Choose an archive snapshot to restore:</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="shelf-btn shelf-btn-primary shelf-btn-sm"
                onClick={handleBackup}
              >
                + Backup Now
              </button>
              <button
                type="button"
                className="shelf-btn shelf-btn-sm"
                onClick={handleOpenArchives}
              >
                Open Folder
              </button>
            </div>
          </div>

          {archives.length === 0 ? (
            <div className="profile-empty-list">No backup archives found in ~/.sudolaunch-archives</div>
          ) : (
            <div className="profile-items-list">
              {archives.map((a) => (
                <div key={a.filename} className="profile-item-card">
                  <div className="profile-item-avatar">📦</div>
                  <div className="profile-item-info">
                    <div className="profile-item-name-row">
                      <span className="profile-item-name" style={{ fontSize: '12px', fontFamily: 'Cascadia Mono, Consolas, monospace' }}>
                        {a.filename}
                      </span>
                    </div>
                    <div className="profile-item-stats">
                      <span className={`archive-badge ${a.type === 'Safety Snapshot' ? 'badge-safety' : 'badge-user'}`}>
                        {a.type}
                      </span>
                      <span>{a.date}</span>
                      <span>•</span>
                      <span>{a.sizeKb} KB</span>
                    </div>
                  </div>
                  <div className="profile-item-actions">
                    <button
                      type="button"
                      className={`shelf-btn shelf-btn-sm ${confirmRestoreArchive === a.filename ? 'shelf-btn-danger' : 'shelf-btn-primary'}`}
                      onClick={() => handleRestoreArchive(a.filename)}
                      title="Restore configuration from this archive"
                    >
                      {confirmRestoreArchive === a.filename ? '⚠️ Confirm?' : 'Restore'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Maintenance & Tools */}
      {activeTab === 'actions' && (
        <div className="profile-actions-grid">
          <div className="profile-card" onClick={handleOpenFolder}>
            <div className="profile-card-icon">📁</div>
            <div className="profile-card-info">
              <span className="profile-card-title">Open Config Folder</span>
              <span className="profile-card-desc">Inspect configuration JSON files in File Explorer</span>
            </div>
          </div>

          <div className="profile-card" onClick={onOpenSettings}>
            <div className="profile-card-icon">⚙️</div>
            <div className="profile-card-info">
              <span className="profile-card-title">Settings & Preferences</span>
              <span className="profile-card-desc">Configure hotkeys, shortcuts, dock slots, and layout</span>
            </div>
          </div>

          <div
            className="profile-card"
            onClick={async () => {
              try {
                await window.api.executeProfileCommand?.('validate')
                flash('Profile validated and missing directories/files repaired')
              } catch (err) {
                flash(`Validation failed: ${err}`)
              }
            }}
          >
            <div className="profile-card-icon">🩺</div>
            <div className="profile-card-info">
              <span className="profile-card-title">Validate & Repair Profile</span>
              <span className="profile-card-desc">Verify JSON schema integrity and regenerate missing files</span>
            </div>
          </div>

          <div
            className="profile-card"
            onClick={async () => {
              try {
                await window.api.executeProfileCommand?.('clean-history')
                flash('Sanitized sensitive entries from command history')
              } catch (err) {
                flash(`Sanitization failed: ${err}`)
              }
            }}
          >
            <div className="profile-card-icon">🧹</div>
            <div className="profile-card-info">
              <span className="profile-card-title">Sanitize History</span>
              <span className="profile-card-desc">Remove passwords, tokens, and sensitive inputs from history</span>
            </div>
          </div>

          <div className={`profile-card profile-card-danger ${confirmReset ? 'confirming' : ''}`} onClick={handleReset}>
            <div className="profile-card-icon">⚠️</div>
            <div className="profile-card-info">
              <span className="profile-card-title">
                {confirmReset ? 'Click Again to Confirm Reset' : 'Reset to Defaults'}
              </span>
              <span className="profile-card-desc">
                {confirmReset ? 'WARNING: This resets all custom settings to factory defaults!' : 'Restore default settings and layout'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
