import { useState, useMemo, useEffect, useCallback, useRef, useDeferredValue } from 'react'
import type {
  GitRepoStatus,
  KnownRepoItem,
  GitProjectPreset,
  GitWatcherItem,
  GitWatcherMode
} from '../../../shared/types'

const DEFAULT_WATCHER_IGNORES =
  'node_modules,.git,dist,out,build,.next,.turbo,coverage,__pycache__,target,.venv,venv,.cache'

interface GitPanelProps {
  gitStatus: GitRepoStatus | null
  branches: string[]
  initialTab?: 'branches' | 'watchers'
  onRefresh: () => void
  onClose: () => void
  onBackToPalette: () => void
}

export function GitStatusPanel({
  gitStatus,
  branches,
  initialTab = 'branches',
  onRefresh,
  onClose,
  onBackToPalette
}: GitPanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<'branches' | 'watchers'>(initialTab)
  const [filter, setFilter] = useState('')
  const deferredBranchFilter = useDeferredValue(filter)
  const [switching, setSwitching] = useState<string | null>(null)
  const [statusBanner, setStatusBanner] = useState<string | null>(null)
  const [showRepoPicker, setShowRepoPicker] = useState(false)
  const [knownRepos, setKnownRepos] = useState<KnownRepoItem[]>([])
  const [repoFilter, setRepoFilter] = useState('')
  const deferredRepoFilter = useDeferredValue(repoFilter)
  const [isSwitchingRepo, setIsSwitchingRepo] = useState(false)

  // Hot-Reload Watchers State
  const [watchers, setWatchers] = useState<GitWatcherItem[]>([])
  const [watcherSearch, setWatcherSearch] = useState('')
  const deferredWatcherSearch = useDeferredValue(watcherSearch)
  const [watcherScope, setWatcherScope] = useState<'all' | 'current'>('all')
  const [expandedLogsId, setExpandedLogsId] = useState<string | null>(null)
  const [busyWatcherId, setBusyWatcherId] = useState<string | null>(null)

  // Watcher Creator / Editor Form State
  const [isEditingWatcher, setIsEditingWatcher] = useState(false)
  const [editingWatcherId, setEditingWatcherId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formRepoPath, setFormRepoPath] = useState('')
  const [formSubPath, setFormSubPath] = useState('')
  const [formCommand, setFormCommand] = useState('')
  const [formMode, setFormMode] = useState<GitWatcherMode>('restart-process')
  const [formExtensions, setFormExtensions] = useState('.ts,.tsx,.js,.jsx,.css,.json')
  const [formIgnorePatterns, setFormIgnorePatterns] = useState(DEFAULT_WATCHER_IGNORES)
  const [formDebounceMs, setFormDebounceMs] = useState('350')
  const [formNotifyOnError, setFormNotifyOnError] = useState(true)
  const [presets, setPresets] = useState<GitProjectPreset[]>([])

  const isRepo = gitStatus?.isRepo ?? false
  const currentBranch = gitStatus?.branch ?? 'unknown'
  const isDirty = gitStatus?.dirty ?? false
  const ahead = gitStatus?.ahead ?? 0
  const behind = gitStatus?.behind ?? 0
  const currentRepoPath = gitStatus?.repoPath ?? ''

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  const flashBanner = useCallback((msg: string) => {
    setStatusBanner(msg)
    setTimeout(() => setStatusBanner((prev) => (prev === msg ? null : prev)), 4000)
  }, [])

  const loadKnownRepos = useCallback(async () => {
    try {
      const list = await window.api.getKnownGitRepos?.()
      if (Array.isArray(list)) setKnownRepos(list)
    } catch {
      // ignore
    }
  }, [])

  const loadWatchers = useCallback(async () => {
    try {
      const list = await window.api.getGitWatchers?.()
      if (Array.isArray(list)) setWatchers(list)
    } catch {
      // ignore
    }
  }, [])

  const loadPresetsForPath = useCallback(async (targetPath: string) => {
    if (!targetPath) {
      setPresets([])
      return
    }
    try {
      const list = await window.api.getGitWatcherPresets?.(targetPath)
      if (Array.isArray(list)) setPresets(list)
    } catch {
      setPresets([])
    }
  }, [])

  useEffect(() => {
    loadKnownRepos()
    loadWatchers()
    const unsub = window.api.onGitWatchersUpdated?.((updated) => {
      setWatchers(updated)
    })
    return () => {
      unsub?.()
    }
  }, [loadKnownRepos, loadWatchers])

  useEffect(() => {
    if (currentRepoPath) {
      loadPresetsForPath(currentRepoPath)
    }
  }, [currentRepoPath, loadPresetsForPath])

  const filteredBranches = useMemo(() => {
    if (!deferredBranchFilter) return branches
    const lower = deferredBranchFilter.toLowerCase()
    return branches.filter((b) => b.toLowerCase().includes(lower))
  }, [branches, deferredBranchFilter])

  const filteredKnownRepos = useMemo(() => {
    if (!deferredRepoFilter) return knownRepos
    const lower = deferredRepoFilter.toLowerCase()
    return knownRepos.filter((r) => r.name.toLowerCase().includes(lower) || r.path.toLowerCase().includes(lower))
  }, [knownRepos, deferredRepoFilter])

  const activeWatchersCount = useMemo(
    () => watchers.filter((w) => w.enabled).length,
    [watchers]
  )

  const anyWatcherRunningProcess = useMemo(
    () => watchers.some((w) => w.enabled && w.status === 'running'),
    [watchers]
  )

  const currentRepoWatchers = useMemo(() => {
    if (!currentRepoPath) return []
    const norm = currentRepoPath.toLowerCase()
    return watchers.filter((w) => w.repoPath.toLowerCase() === norm)
  }, [watchers, currentRepoPath])

  const filteredWatchers = useMemo(() => {
    let list = watchers
    if (watcherScope === 'current' && currentRepoPath) {
      const norm = currentRepoPath.toLowerCase()
      list = list.filter((w) => w.repoPath.toLowerCase() === norm)
    }
    const q = deferredWatcherSearch.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          w.repoName.toLowerCase().includes(q) ||
          w.repoPath.toLowerCase().includes(q) ||
          w.command.toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [watchers, watcherScope, currentRepoPath, deferredWatcherSearch])

  async function handleCheckout(branch: string): Promise<void> {
    if (branch === currentBranch) return
    setSwitching(branch)
    try {
      const res = await window.api.checkoutGitBranch?.(branch)
      if (res && res.success) {
        flashBanner(`Switched to branch "${branch}"`)
        onRefresh()
      } else {
        flashBanner(res?.message ?? 'Failed to checkout branch')
      }
    } catch (err) {
      flashBanner(String(err))
    } finally {
      setSwitching(null)
    }
  }

  async function handleBrowseFolder(): Promise<void> {
    setIsSwitchingRepo(true)
    try {
      const res = await window.api.selectGitRepoFolder?.()
      if (res && res.isRepo) {
        flashBanner(`Active repo switched to "${res.repoName}" (${res.branch})`)
        setShowRepoPicker(false)
        onRefresh()
        await loadKnownRepos()
      } else if (res && !res.isRepo) {
        flashBanner(`Selected folder is not a valid git repository: ${res.repoPath}`)
      }
    } catch (err) {
      flashBanner(`Failed to switch repo: ${err}`)
    } finally {
      setIsSwitchingRepo(false)
    }
  }

  async function handleSelectRepo(path: string): Promise<void> {
    setIsSwitchingRepo(true)
    try {
      const res = await window.api.setActiveGitRepo?.(path)
      if (res && res.isRepo) {
        flashBanner(`Active repo switched to "${res.repoName}" (${res.branch})`)
        setShowRepoPicker(false)
        onRefresh()
        await loadKnownRepos()
      } else {
        flashBanner(`Selected folder is not a valid git repository`)
      }
    } catch (err) {
      flashBanner(`Failed to switch repo: ${err}`)
    } finally {
      setIsSwitchingRepo(false)
    }
  }

  function handleOpenTerminal(): void {
    onClose()
    window.api.termToggle?.()
  }

  function openNewWatcherForm(preset?: GitProjectPreset, targetRepo?: string): void {
    const repoToUse = targetRepo || currentRepoPath || (knownRepos[0]?.path ?? '')
    const repoLabel = repoToUse.split(/[\\/]/).filter(Boolean).pop() || 'Project'
    setEditingWatcherId(null)
    setFormRepoPath(repoToUse)
    setFormSubPath('')
    if (preset) {
      setFormName(`${repoLabel} — ${preset.label.split(' (')[0]}`)
      setFormCommand(preset.command)
      setFormMode(preset.mode)
      setFormExtensions(preset.extensions || '*')
    } else {
      const firstPreset = presets[0]
      setFormName(`${repoLabel} Hot Reload`)
      setFormCommand(firstPreset ? firstPreset.command : 'npm run dev')
      setFormMode(firstPreset ? firstPreset.mode : 'restart-process')
      setFormExtensions(firstPreset ? firstPreset.extensions : '.ts,.tsx,.js,.jsx,.css,.json')
    }
    setFormIgnorePatterns(DEFAULT_WATCHER_IGNORES)
    setFormDebounceMs('350')
    setFormNotifyOnError(true)
    setIsEditingWatcher(true)
    setActiveTab('watchers')
    if (repoToUse) loadPresetsForPath(repoToUse)
  }

  function openEditWatcherForm(w: GitWatcherItem): void {
    setEditingWatcherId(w.id)
    setFormName(w.name)
    setFormRepoPath(w.repoPath)
    setFormSubPath(w.subPath || '')
    setFormCommand(w.command)
    setFormMode(w.mode)
    setFormExtensions(w.extensions || '*')
    setFormIgnorePatterns(w.ignorePatterns || DEFAULT_WATCHER_IGNORES)
    setFormDebounceMs(String(w.debounceMs || 350))
    setFormNotifyOnError(w.notifyOnError !== false)
    setIsEditingWatcher(true)
    setActiveTab('watchers')
    loadPresetsForPath(w.repoPath)
  }

  function applyPresetToForm(p: GitProjectPreset): void {
    const repoLabel = formRepoPath.split(/[\\/]/).filter(Boolean).pop() || 'Project'
    setFormName(`${repoLabel} — ${p.label.split(' (')[0]}`)
    setFormCommand(p.command)
    setFormMode(p.mode)
    setFormExtensions(p.extensions || '*')
  }

  async function handleBrowseWatcherRepo(): Promise<void> {
    const picked = await window.api.selectWatcherProjectFolder?.()
    if (picked) {
      setFormRepoPath(picked)
      const folderName = picked.split(/[\\/]/).filter(Boolean).pop() || 'Project'
      if (!formName || formName.endsWith('Hot Reload')) {
        setFormName(`${folderName} Hot Reload`)
      }
      await loadPresetsForPath(picked)
    }
  }

  async function handleSaveWatcher(startImmediately: boolean): Promise<void> {
    if (!formRepoPath.trim() || !formCommand.trim()) {
      flashBanner('Please specify both a target repository path and a command to run.')
      return
    }
    setBusyWatcherId('saving')
    try {
      const updated = await window.api.saveGitWatcher?.({
        id: editingWatcherId ?? undefined,
        name: formName.trim() || 'Dev Watcher',
        repoPath: formRepoPath.trim(),
        subPath: formSubPath.trim(),
        command: formCommand.trim(),
        mode: formMode,
        extensions: formExtensions.trim() || '*',
        ignorePatterns: formIgnorePatterns.trim() || DEFAULT_WATCHER_IGNORES,
        debounceMs: parseInt(formDebounceMs, 10) || 350,
        notifyOnError: formNotifyOnError,
        startImmediately
      })
      if (updated) setWatchers(updated)
      setIsEditingWatcher(false)
      setEditingWatcherId(null)
      flashBanner(
        startImmediately
          ? `Started watcher "${formName.trim() || 'Dev Watcher'}"`
          : `Saved watcher "${formName.trim() || 'Dev Watcher'}"`
      )
    } catch (err) {
      flashBanner(`Failed to save watcher: ${err}`)
    } finally {
      setBusyWatcherId(null)
    }
  }

  async function handleQuickStartPreset(p: GitProjectPreset): Promise<void> {
    if (!currentRepoPath) return
    const repoLabel = gitStatus?.repoName || currentRepoPath.split(/[\\/]/).filter(Boolean).pop() || 'Project'
    setBusyWatcherId(`preset-${p.id}`)
    try {
      const updated = await window.api.saveGitWatcher?.({
        name: `${repoLabel} — ${p.label.split(' (')[0]}`,
        repoPath: currentRepoPath,
        command: p.command,
        mode: p.mode,
        extensions: p.extensions || '*',
        ignorePatterns: DEFAULT_WATCHER_IGNORES,
        debounceMs: 350,
        notifyOnError: true,
        startImmediately: true
      })
      if (updated) setWatchers(updated)
      flashBanner(`Started hot-reload watcher: ${p.command}`)
    } catch (err) {
      flashBanner(`Failed to start watcher: ${err}`)
    } finally {
      setBusyWatcherId(null)
    }
  }

  async function handleToggleWatcher(w: GitWatcherItem): Promise<void> {
    setBusyWatcherId(w.id)
    try {
      const updated = w.enabled
        ? await window.api.stopGitWatcher?.(w.id)
        : await window.api.startGitWatcher?.(w.id)
      if (updated) setWatchers(updated)
      flashBanner(w.enabled ? `Stopped watcher "${w.name}"` : `Started watcher "${w.name}"`)
    } catch (err) {
      flashBanner(`Watcher error: ${err}`)
    } finally {
      setBusyWatcherId(null)
    }
  }

  async function handleTriggerReload(w: GitWatcherItem): Promise<void> {
    setBusyWatcherId(w.id)
    try {
      const updated = await window.api.triggerGitWatcherReload?.(w.id)
      if (updated) setWatchers(updated)
      flashBanner(`Triggered hot reload for "${w.name}"`)
    } catch (err) {
      flashBanner(`Reload error: ${err}`)
    } finally {
      setBusyWatcherId(null)
    }
  }

  async function handleDeleteWatcher(w: GitWatcherItem): Promise<void> {
    setBusyWatcherId(w.id)
    try {
      const updated = await window.api.deleteGitWatcher?.(w.id)
      if (updated) setWatchers(updated)
      if (expandedLogsId === w.id) setExpandedLogsId(null)
      flashBanner(`Deleted watcher "${w.name}"`)
    } finally {
      setBusyWatcherId(null)
    }
  }

  async function handleStopAllWatchers(): Promise<void> {
    setBusyWatcherId('stop-all')
    try {
      const updated = await window.api.stopAllGitWatchers?.()
      if (updated) setWatchers(updated)
      flashBanner('Stopped all running filesystem watchers')
    } finally {
      setBusyWatcherId(null)
    }
  }

  return (
    <div className="shelf-module-panel git-panel">
      <div className="shelf-panel-header">
        <div className="shelf-panel-title-group">
          <span className="shelf-panel-icon">🔀</span>
          <div>
            <h2 className="shelf-panel-title">Git Repository & Dev Watchers</h2>
            <span className="shelf-panel-subtitle">
              {isRepo ? (gitStatus?.repoName ? `Repo: ${gitStatus.repoName}` : 'Git Active') : 'Not a Git Repository'}
              {activeWatchersCount > 0 ? ` · 🔥 ${activeWatchersCount} Watcher${activeWatchersCount === 1 ? '' : 's'} Active` : ''}
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

      {/* Sub-navigation Tabs */}
      <div className="profile-tabs-bar" style={{ marginBottom: '2px' }}>
        <button
          type="button"
          className={`profile-tab-btn ${activeTab === 'branches' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('branches')}
        >
          <span>🔀 Repo & Branches</span>
          <span className="profile-tab-count">{branches.length}</span>
        </button>
        <button
          type="button"
          className={`profile-tab-btn ${activeTab === 'watchers' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('watchers')}
        >
          {anyWatcherRunningProcess ? (
            <span className="sudo-spinner sudo-spinner-sm" style={{ marginRight: 2 }} />
          ) : (
            <span>🔥</span>
          )}
          <span>Hot-Reload Watchers</span>
          <span
            className="profile-tab-count"
            style={
              activeWatchersCount > 0
                ? { background: 'rgba(16, 185, 129, 0.25)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)' }
                : undefined
            }
          >
            {activeWatchersCount > 0 ? `${activeWatchersCount} active` : watchers.length}
          </span>
        </button>
      </div>

      {statusBanner && <div className="shelf-panel-status-banner">{statusBanner}</div>}

      {activeTab === 'branches' && (
        <>
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

            <div className="git-quick-actions" style={{ flexWrap: 'wrap' }}>
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
              <button
                type="button"
                className="shelf-btn shelf-btn-primary shelf-btn-sm"
                onClick={() => openNewWatcherForm(presets[0], currentRepoPath)}
                title="Create a filesystem watcher to hot-reload this project on file changes"
              >
                🔥 + Watch Project
              </button>
              <button type="button" className="shelf-btn shelf-btn-sm" onClick={handleOpenTerminal}>
                💻 Open Terminal
              </button>
              <button type="button" className="shelf-btn shelf-btn-sm" onClick={onRefresh}>
                🔄 Refresh Status
              </button>
            </div>

            {/* Quick Summary Strip for Current Repo Watchers or Active Watchers */}
            {(currentRepoWatchers.length > 0 || activeWatchersCount > 0) && (
              <div className="git-watcher-quick-strip">
                <div className="git-watcher-quick-strip-left">
                  <span className="git-watcher-quick-dot" data-active={activeWatchersCount > 0 ? 'true' : 'false'} />
                  <span className="git-watcher-quick-text">
                    {currentRepoWatchers.length > 0
                      ? `${currentRepoWatchers.filter((w) => w.enabled).length}/${currentRepoWatchers.length} watcher${currentRepoWatchers.length === 1 ? '' : 's'} on this repo`
                      : `${activeWatchersCount} active watcher${activeWatchersCount === 1 ? '' : 's'} running`}
                  </span>
                </div>
                <div className="git-watcher-quick-strip-actions">
                  {currentRepoWatchers.slice(0, 2).map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      className={`shelf-btn shelf-btn-sm ${w.enabled ? 'shelf-btn-warning' : 'shelf-btn-secondary'}`}
                      style={{ padding: '2px 8px', fontSize: '11px' }}
                      onClick={() => handleToggleWatcher(w)}
                      disabled={busyWatcherId === w.id}
                      title={`${w.enabled ? 'Stop' : 'Start'} "${w.name}" (${w.command})`}
                    >
                      {busyWatcherId === w.id ? (
                        <span className="sudo-spinner sudo-spinner-sm" />
                      ) : w.enabled ? (
                        `⏹ ${w.name}`
                      ) : (
                        `▶ ${w.name}`
                      )}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="shelf-btn shelf-btn-sm"
                    style={{ padding: '2px 8px', fontSize: '11px' }}
                    onClick={() => setActiveTab('watchers')}
                  >
                    Manage ({watchers.length}) →
                  </button>
                </div>
              </div>
            )}
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
                style={{ width: '100%' }}
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
                      <div className="git-known-repo-action" style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-sm"
                          title="Add a hot-reload watcher for this repository"
                          onClick={(e) => {
                            e.stopPropagation()
                            openNewWatcherForm(undefined, r.path)
                          }}
                        >
                          🔥 Watch
                        </button>
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
        </>
      )}

      {activeTab === 'watchers' && (
        <div className="git-watchers-container">
          {/* Toolbar */}
          <div className="git-watchers-toolbar">
            <div className="git-watchers-toolbar-left">
              <input
                type="text"
                className="git-branch-filter"
                style={{ width: '175px' }}
                placeholder="Filter watchers..."
                value={watcherSearch}
                onChange={(e) => setWatcherSearch(e.target.value)}
              />
              <button
                type="button"
                className={`shelf-btn shelf-btn-sm ${watcherScope === 'all' ? 'shelf-btn-primary' : ''}`}
                onClick={() => setWatcherScope('all')}
              >
                All ({watchers.length})
              </button>
              {currentRepoPath && (
                <button
                  type="button"
                  className={`shelf-btn shelf-btn-sm ${watcherScope === 'current' ? 'shelf-btn-primary' : ''}`}
                  onClick={() => setWatcherScope('current')}
                  title={`Filter to ${gitStatus?.repoName || currentRepoPath}`}
                >
                  This Repo ({currentRepoWatchers.length})
                </button>
              )}
            </div>
            <div className="git-watchers-toolbar-right">
              {activeWatchersCount > 0 && (
                <button
                  type="button"
                  className="shelf-btn shelf-btn-danger shelf-btn-sm"
                  onClick={handleStopAllWatchers}
                  disabled={busyWatcherId === 'stop-all'}
                  title="Stop all running filesystem watchers"
                >
                  {busyWatcherId === 'stop-all' ? (
                    <span className="sudo-spinner sudo-spinner-sm" />
                  ) : (
                    `⏹ Stop All (${activeWatchersCount})`
                  )}
                </button>
              )}
              <button
                type="button"
                className="shelf-btn shelf-btn-primary shelf-btn-sm"
                onClick={() => {
                  if (isEditingWatcher) {
                    setIsEditingWatcher(false)
                  } else {
                    openNewWatcherForm(presets[0], currentRepoPath)
                  }
                }}
              >
                {isEditingWatcher ? '✕ Close Form' : '+ New Watcher'}
              </button>
            </div>
          </div>

          {/* Add / Edit Watcher Form */}
          {isEditingWatcher && (
            <div className="git-watcher-form-card">
              <div className="git-watcher-form-header">
                <span className="git-watcher-form-title">
                  {editingWatcherId ? '✎ Edit Filesystem Watcher' : '🔥 Configure New Hot-Reload Watcher'}
                </span>
                <span className="git-watcher-form-subtitle">
                  Run multiple watchers simultaneously across any repositories
                </span>
              </div>

              {/* Target Repository Selector */}
              <div className="git-watcher-form-row">
                <div className="git-watcher-field" style={{ flex: 1 }}>
                  <label className="git-watcher-label">Target Project / Repository Folder</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      className="git-watcher-input"
                      style={{ flex: 1 }}
                      value={formRepoPath}
                      onChange={(e) => {
                        setFormRepoPath(e.target.value)
                        loadPresetsForPath(e.target.value)
                      }}
                      placeholder="C:\Projects\my-app"
                    />
                    {knownRepos.length > 0 && (
                      <select
                        className="git-watcher-select"
                        style={{ maxWidth: '150px' }}
                        value={
                          knownRepos.some((r) => r.path.toLowerCase() === formRepoPath.toLowerCase())
                            ? knownRepos.find((r) => r.path.toLowerCase() === formRepoPath.toLowerCase())?.path
                            : ''
                        }
                        onChange={(e) => {
                          if (e.target.value) {
                            setFormRepoPath(e.target.value)
                            loadPresetsForPath(e.target.value)
                          }
                        }}
                        title="Pick from known repositories"
                      >
                        <option value="">Known Repos...</option>
                        {knownRepos.map((r) => (
                          <option key={r.path} value={r.path}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-sm"
                      onClick={handleBrowseWatcherRepo}
                      title="Browse folder on disk"
                    >
                      📂 Browse
                    </button>
                  </div>
                </div>
              </div>

              {/* Auto-Detected Project Presets */}
              {presets.length > 0 && (
                <div className="git-watcher-presets-box">
                  <span className="git-watcher-label">Auto-Detected Presets (click to fill):</span>
                  <div className="git-watcher-preset-chips">
                    {presets.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`git-watcher-preset-chip ${formCommand === p.command && formMode === p.mode ? 'is-selected' : ''}`}
                        onClick={() => applyPresetToForm(p)}
                        title={p.description}
                      >
                        <span>{p.icon}</span>
                        <span>{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Name & Mode */}
              <div className="git-watcher-form-row">
                <div className="git-watcher-field" style={{ flex: 1 }}>
                  <label className="git-watcher-label">Watcher Label</label>
                  <input
                    type="text"
                    className="git-watcher-input"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. SudoLaunch Dev Server"
                  />
                </div>
                <div className="git-watcher-field" style={{ width: '245px' }}>
                  <label className="git-watcher-label">Hot-Reload Mode</label>
                  <select
                    className="git-watcher-select"
                    value={formMode}
                    onChange={(e) => setFormMode(e.target.value as GitWatcherMode)}
                  >
                    <option value="restart-process">🚀 Restart Process on Change (Dev Server)</option>
                    <option value="run-on-change">🔄 Run Command on Change (Build / Test)</option>
                  </select>
                </div>
              </div>

              {/* Command */}
              <div className="git-watcher-form-row">
                <div className="git-watcher-field" style={{ flex: 1 }}>
                  <label className="git-watcher-label">
                    Command to Execute (runs in repository root via PowerShell)
                  </label>
                  <input
                    type="text"
                    className="git-watcher-input git-watcher-mono-input"
                    value={formCommand}
                    onChange={(e) => setFormCommand(e.target.value)}
                    placeholder="e.g. npm run dev, npm run build, go run ., docker compose restart"
                  />
                </div>
              </div>

              {/* Extensions, Subfolder, Debounce */}
              <div className="git-watcher-form-row">
                <div className="git-watcher-field" style={{ flex: 1 }}>
                  <label className="git-watcher-label">Watched Extensions (* or comma-separated)</label>
                  <input
                    type="text"
                    className="git-watcher-input git-watcher-mono-input"
                    value={formExtensions}
                    onChange={(e) => setFormExtensions(e.target.value)}
                    placeholder=".ts,.tsx,.js,.css,.json or *"
                  />
                </div>
                <div className="git-watcher-field" style={{ width: '130px' }}>
                  <label className="git-watcher-label">Subfolder (opt.)</label>
                  <input
                    type="text"
                    className="git-watcher-input git-watcher-mono-input"
                    value={formSubPath}
                    onChange={(e) => setFormSubPath(e.target.value)}
                    placeholder="e.g. src"
                  />
                </div>
                <div className="git-watcher-field" style={{ width: '105px' }}>
                  <label className="git-watcher-label">Debounce (ms)</label>
                  <input
                    type="number"
                    min="50"
                    max="10000"
                    className="git-watcher-input"
                    value={formDebounceMs}
                    onChange={(e) => setFormDebounceMs(e.target.value)}
                  />
                </div>
              </div>

              {/* Ignore Patterns & Notify */}
              <div className="git-watcher-form-row" style={{ alignItems: 'flex-end' }}>
                <div className="git-watcher-field" style={{ flex: 1 }}>
                  <label className="git-watcher-label">Ignored Directories / Patterns</label>
                  <input
                    type="text"
                    className="git-watcher-input git-watcher-mono-input"
                    value={formIgnorePatterns}
                    onChange={(e) => setFormIgnorePatterns(e.target.value)}
                  />
                </div>
                <label className="profile-create-checkbox-label" style={{ paddingBottom: '6px' }}>
                  <input
                    type="checkbox"
                    checked={formNotifyOnError}
                    onChange={(e) => setFormNotifyOnError(e.target.checked)}
                  />
                  <span>Toast on error</span>
                </label>
              </div>

              <div className="git-watcher-form-actions">
                <button
                  type="button"
                  className="shelf-btn shelf-btn-primary shelf-btn-sm"
                  onClick={() => handleSaveWatcher(true)}
                  disabled={busyWatcherId === 'saving'}
                >
                  {busyWatcherId === 'saving' ? (
                    <span className="sudo-spinner sudo-spinner-sm" />
                  ) : (
                    '🔥 Save & Start Watcher'
                  )}
                </button>
                <button
                  type="button"
                  className="shelf-btn shelf-btn-secondary shelf-btn-sm"
                  onClick={() => handleSaveWatcher(false)}
                  disabled={busyWatcherId === 'saving'}
                >
                  💾 Save (Stopped)
                </button>
                <button
                  type="button"
                  className="shelf-btn shelf-btn-sm"
                  onClick={() => {
                    setIsEditingWatcher(false)
                    setEditingWatcherId(null)
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Quick-Start Presets Banner when no watchers exist yet */}
          {!isEditingWatcher && watchers.length === 0 && (
            <div className="git-watcher-empty-card">
              <div className="git-watcher-empty-title">
                🔥 No Hot-Reload Watchers Configured Yet
              </div>
              <div className="git-watcher-empty-desc">
                Start one or more filesystem watchers to automatically rebuild or hot-restart your dev projects whenever files are saved.
              </div>
              {currentRepoPath && presets.length > 0 && (
                <div className="git-watcher-quick-presets">
                  <span className="git-watcher-label">
                    1-Click Start for <strong>{gitStatus?.repoName || currentRepoPath}</strong>:
                  </span>
                  <div className="git-watcher-preset-chips">
                    {presets.slice(0, 4).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="git-watcher-preset-chip"
                        onClick={() => handleQuickStartPreset(p)}
                        disabled={busyWatcherId === `preset-${p.id}`}
                        title={`Immediately create and start watcher: ${p.command}`}
                      >
                        {busyWatcherId === `preset-${p.id}` ? (
                          <span className="sudo-spinner sudo-spinner-sm" />
                        ) : (
                          <span>{p.icon}</span>
                        )}
                        <span>▶ {p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  className="shelf-btn shelf-btn-primary shelf-btn-sm"
                  onClick={() => openNewWatcherForm(presets[0], currentRepoPath)}
                >
                  + Configure Custom Watcher
                </button>
              </div>
            </div>
          )}

          {/* Multi-Watcher Cards List */}
          <div className="git-watchers-list">
            {filteredWatchers.map((w) => {
              const isBusy = busyWatcherId === w.id
              const logsOpen = expandedLogsId === w.id
              const isCurrentRepo =
                Boolean(currentRepoPath) && w.repoPath.toLowerCase() === currentRepoPath.toLowerCase()

              return (
                <div
                  key={w.id}
                  className={`git-watcher-card ${w.enabled ? 'is-enabled' : ''} ${w.status === 'error' ? 'is-error' : ''}`}
                >
                  <div className="git-watcher-card-top">
                    <div className="git-watcher-card-title-group">
                      {w.status === 'running' ? (
                        <span className="git-watcher-status-badge status-running" title="Process actively running">
                          <span className="sudo-spinner sudo-spinner-sm" />
                          <span>RUNNING{w.pid ? ` (${w.pid})` : ''}</span>
                        </span>
                      ) : w.status === 'watching' ? (
                        <span className="git-watcher-status-badge status-watching" title="Watching filesystem for changes">
                          <span className="git-watcher-pulse-dot" />
                          <span>WATCHING</span>
                        </span>
                      ) : w.status === 'error' ? (
                        <span className="git-watcher-status-badge status-error" title={`Last run exited with code ${w.lastExitCode}`}>
                          ⚠️ EXIT {w.lastExitCode ?? 1}
                        </span>
                      ) : (
                        <span className="git-watcher-status-badge status-stopped">
                          ⏸ STOPPED
                        </span>
                      )}

                      <span className="git-watcher-name">{w.name}</span>

                      <span
                        className={`git-watcher-repo-badge ${isCurrentRepo ? 'is-current-repo' : ''}`}
                        title={w.repoPath}
                      >
                        📁 {w.repoName}
                        {w.subPath ? `/${w.subPath}` : ''}
                      </span>

                      <span className="git-watcher-mode-badge">
                        {w.mode === 'restart-process' ? '🚀 Managed Server' : '🔄 On Change'}
                      </span>
                    </div>

                    <div className="git-watcher-card-actions">
                      <button
                        type="button"
                        className={`shelf-btn shelf-btn-sm ${w.enabled ? 'shelf-btn-warning' : 'shelf-btn-primary'}`}
                        onClick={() => handleToggleWatcher(w)}
                        disabled={isBusy}
                        title={w.enabled ? 'Stop filesystem watcher and terminate process' : 'Start filesystem watcher'}
                      >
                        {isBusy ? (
                          <span className="sudo-spinner sudo-spinner-sm" />
                        ) : w.enabled ? (
                          '⏹ Stop'
                        ) : (
                          '▶ Start'
                        )}
                      </button>
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-secondary shelf-btn-sm"
                        onClick={() => handleTriggerReload(w)}
                        disabled={isBusy}
                        title="Trigger immediate hot-reload / restart now"
                      >
                        ⚡ Reload
                      </button>
                      <button
                        type="button"
                        className={`shelf-btn shelf-btn-sm ${logsOpen ? 'shelf-btn-primary' : ''}`}
                        onClick={() => setExpandedLogsId(logsOpen ? null : w.id)}
                        title="Toggle live console output logs"
                      >
                        📜 Logs ({w.logLines.length})
                      </button>
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-sm"
                        onClick={() => window.api.openGitWatcherInTerminal?.(w.id)}
                        title="Run command in interactive SudoLaunch Terminal (>_)"
                      >
                        &gt;_
                      </button>
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-sm"
                        onClick={() => openEditWatcherForm(w)}
                        title="Edit watcher configuration"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-danger shelf-btn-sm"
                        onClick={() => handleDeleteWatcher(w)}
                        disabled={isBusy}
                        title="Delete watcher"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="git-watcher-card-meta">
                    <code className="git-watcher-cmd-pill" title={w.command}>
                      $ {w.command}
                    </code>
                    <span className="git-watcher-meta-item" title={`Watched extensions: ${w.extensions}`}>
                      Ext: <strong>{w.extensions}</strong>
                    </span>
                    <span className="git-watcher-meta-item">
                      Debounce: <strong>{w.debounceMs}ms</strong>
                    </span>
                    <span className="git-watcher-meta-item git-watcher-reload-counter">
                      🔥 <strong>{w.reloadCount}</strong> reload{w.reloadCount === 1 ? '' : 's'}
                    </span>
                    {w.lastChangedFile && (
                      <span className="git-watcher-meta-item git-watcher-last-file" title={w.lastChangedFile}>
                        Last: <code>{w.lastChangedFile}</code>
                      </span>
                    )}
                    {typeof w.lastDurationMs === 'number' && w.mode === 'run-on-change' && (
                      <span className="git-watcher-meta-item">
                        {(w.lastDurationMs / 1000).toFixed(2)}s
                      </span>
                    )}
                  </div>

                  {logsOpen && (
                    <div className="git-watcher-logs-drawer">
                      <div className="git-watcher-logs-header">
                        <span>Live Console Output — {w.repoPath}</span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="shelf-btn shelf-btn-sm"
                            style={{ padding: '1px 7px', fontSize: '10.5px' }}
                            onClick={() => {
                              navigator.clipboard?.writeText(w.logLines.join('\n')).catch(() => {})
                              flashBanner('Copied watcher logs to clipboard')
                            }}
                          >
                            Copy
                          </button>
                          <button
                            type="button"
                            className="shelf-btn shelf-btn-sm"
                            style={{ padding: '1px 7px', fontSize: '10.5px' }}
                            onClick={async () => {
                              const updated = await window.api.clearGitWatcherLogs?.(w.id)
                              if (updated) setWatchers(updated)
                            }}
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <pre className="git-watcher-logs-pre">
                        {w.logLines.length > 0
                          ? w.logLines.join('\n')
                          : 'No output yet. Start the watcher or click "⚡ Reload" to run.'}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
