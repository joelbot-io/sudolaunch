import { useState, useMemo, useDeferredValue } from 'react'
import type { DevRuntimeStatus, PathEntryHealth, SystemEnvVarItem } from '../../../shared/types'

export interface RuntimesAndEnvPanelProps {
  runtimesView: 'runtimes' | 'path' | 'envvars'
  setRuntimesView: (view: 'runtimes' | 'path' | 'envvars') => void
  devRuntimes: DevRuntimeStatus[]
  pathEntries: PathEntryHealth[]
  envVars: SystemEnvVarItem[]
  setEnvVars: (items: SystemEnvVarItem[]) => void
  loadingRuntimes: boolean
  brokenPathCount: number
  duplicatePathCount: number
  elevateByDefault: boolean
  flash: (msg: string) => void
  handleCopyText: (text: string, label?: string) => void
  onUpgradeOrInstallRuntime: (params: {
    action: 'install' | 'upgrade'
    id: string
    name: string
    forceElevated: boolean
  }) => void
}

export function RuntimesAndEnvPanel({
  runtimesView,
  setRuntimesView,
  devRuntimes,
  pathEntries,
  envVars,
  setEnvVars,
  loadingRuntimes,
  brokenPathCount,
  duplicatePathCount,
  elevateByDefault,
  flash,
  handleCopyText,
  onUpgradeOrInstallRuntime
}: RuntimesAndEnvPanelProps): JSX.Element {
  const [pathFilterChip, setPathFilterChip] = useState<
    'all' | 'broken' | 'duplicate' | 'user' | 'machine'
  >('all')
  const [pathSearchText, setPathSearchText] = useState('')
  const [envFilterChip, setEnvFilterChip] = useState<'all' | 'User' | 'Machine' | 'secrets'>('all')
  const [revealedEnvKeys, setRevealedEnvKeys] = useState<Set<string>>(new Set())
  const [newEnvName, setNewEnvName] = useState('')
  const [newEnvValue, setNewEnvValue] = useState('')
  const [newEnvScope, setNewEnvScope] = useState<'User' | 'Machine'>('User')
  const [envBusy, setEnvBusy] = useState(false)

  const deferredPathSearchText = useDeferredValue(pathSearchText)

  const filteredPathEntries = useMemo(() => {
    let base = pathEntries
    if (pathFilterChip === 'broken') base = base.filter((p) => !p.exists)
    else if (pathFilterChip === 'duplicate') base = base.filter((p) => p.isDuplicate)
    else if (pathFilterChip === 'user') base = base.filter((p) => p.scope === 'User')
    else if (pathFilterChip === 'machine') base = base.filter((p) => p.scope === 'Machine')
    const q = deferredPathSearchText.trim().toLowerCase()
    if (!q) return base
    return base.filter((p) => p.path.toLowerCase().includes(q))
  }, [pathEntries, pathFilterChip, deferredPathSearchText])

  const filteredEnvVars = useMemo(() => {
    let base = envVars
    if (envFilterChip === 'User' || envFilterChip === 'Machine') {
      base = base.filter((e) => e.scope === envFilterChip)
    } else if (envFilterChip === 'secrets') {
      base = base.filter((e) => e.isSecret)
    }
    const q = deferredPathSearchText.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (e) => e.name.toLowerCase().includes(q) || e.value.toLowerCase().includes(q)
    )
  }, [envVars, envFilterChip, deferredPathSearchText])

  return (
    <div className="winget-tab-body">
      <div className="winget-toolbar-row">
        <div className="profile-tabs-bar" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <button
            type="button"
            className={`profile-tab-btn ${runtimesView === 'runtimes' ? 'is-active' : ''}`}
            onClick={() => setRuntimesView('runtimes')}
          >
            <span>🛠️ Developer Runtimes</span>
            <span className="profile-tab-count">
              {devRuntimes.filter((r) => r.installed).length}/{devRuntimes.length}
            </span>
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${runtimesView === 'path' ? 'is-active' : ''}`}
            onClick={() => setRuntimesView('path')}
          >
            <span>🩺 PATH Doctor</span>
            {(brokenPathCount > 0 || duplicatePathCount > 0) && (
              <span className="profile-tab-count">
                {brokenPathCount + duplicatePathCount} issues
              </span>
            )}
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${runtimesView === 'envvars' ? 'is-active' : ''}`}
            onClick={() => setRuntimesView('envvars')}
          >
            <span>🔑 Env Variables</span>
            <span className="profile-tab-count">{envVars.length}</span>
          </button>
        </div>
        {(runtimesView === 'path' || runtimesView === 'envvars') && (
          <input
            type="text"
            className="winget-filter-input"
            placeholder={
              runtimesView === 'path'
                ? 'Search PATH directories...'
                : 'Search variable name or value...'
            }
            value={pathSearchText}
            onChange={(e) => setPathSearchText(e.target.value)}
          />
        )}
      </div>

      {runtimesView === 'runtimes' ? (
        <div className="winget-pkg-list">
          {loadingRuntimes && devRuntimes.length === 0 ? (
            <div className="profile-empty-list">
              Scanning installed developer runtimes and PATH...
            </div>
          ) : (
            <div className="system-runtimes-grid">
              {devRuntimes.map((rt) => (
                <div
                  key={rt.id}
                  className={`system-runtime-card ${!rt.installed ? 'is-missing' : ''} ${
                    rt.hasShadowConflict ? 'has-conflict' : ''
                  }`}
                >
                  <div className="system-runtime-top">
                    <div className="system-runtime-title-group">
                      <span className="system-runtime-icon">{rt.icon}</span>
                      <div>
                        <div className="system-runtime-name">{rt.name}</div>
                        <div className="system-runtime-ver">{rt.version}</div>
                      </div>
                    </div>
                    {rt.hasShadowConflict ? (
                      <span
                        className="winget-badge winget-badge-pinned"
                        title={`Multiple binaries on PATH:\n${rt.allPaths.join('\n')}`}
                      >
                        ⚠️ {rt.allPaths.length} in PATH
                      </span>
                    ) : rt.installed ? (
                      <span className="winget-badge winget-badge-installed">✓ Ready</span>
                    ) : (
                      <span className="winget-badge winget-badge-blocked">Missing</span>
                    )}
                  </div>

                  {rt.activePath && (
                    <div
                      className="system-runtime-path"
                      title={rt.allPaths.join('\n')}
                      onClick={() => handleCopyText(rt.activePath, 'Copied Binary Path')}
                    >
                      {rt.activePath}
                    </div>
                  )}

                  {rt.hasShadowConflict && rt.allPaths.length > 1 && (
                    <div className="system-runtime-shadow-box">
                      Shadowed: <code>{rt.allPaths.slice(1).join(' • ')}</code>
                    </div>
                  )}

                  <div className="system-runtime-actions">
                    {rt.activePath && (
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-sm"
                        onClick={() => window.api.revealPathInExplorer?.(rt.activePath)}
                      >
                        📂 Reveal
                      </button>
                    )}
                    {rt.wingetId && (
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-primary shelf-btn-sm"
                        onClick={(e) =>
                          onUpgradeOrInstallRuntime({
                            action: rt.installed ? 'upgrade' : 'install',
                            id: rt.wingetId!,
                            name: rt.name,
                            forceElevated: e.ctrlKey || e.metaKey
                          })
                        }
                      >
                        {rt.installed ? '⬆️ Upgrade' : '📥 Install via WinGet'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : runtimesView === 'path' ? (
        <div className="winget-tab-body">
          <div className="winget-summary-bar">
            <div className="winget-chip-group">
              <button
                type="button"
                className={`winget-filter-chip ${pathFilterChip === 'all' ? 'is-active' : ''}`}
                onClick={() => setPathFilterChip('all')}
              >
                All Entries ({pathEntries.length})
              </button>
              <button
                type="button"
                className={`winget-filter-chip ${pathFilterChip === 'broken' ? 'is-active' : ''}`}
                onClick={() => setPathFilterChip('broken')}
              >
                ⚠️ Missing Folders ({brokenPathCount})
              </button>
              <button
                type="button"
                className={`winget-filter-chip ${pathFilterChip === 'duplicate' ? 'is-active' : ''}`}
                onClick={() => setPathFilterChip('duplicate')}
              >
                🔁 Duplicates ({duplicatePathCount})
              </button>
              <button
                type="button"
                className={`winget-filter-chip ${pathFilterChip === 'user' ? 'is-active' : ''}`}
                onClick={() => setPathFilterChip('user')}
              >
                User PATH ({pathEntries.filter((p) => p.scope === 'User').length})
              </button>
              <button
                type="button"
                className={`winget-filter-chip ${pathFilterChip === 'machine' ? 'is-active' : ''}`}
                onClick={() => setPathFilterChip('machine')}
              >
                Machine PATH ({pathEntries.filter((p) => p.scope === 'Machine').length})
              </button>
            </div>
          </div>

          <div className="winget-pkg-list">
            {filteredPathEntries.map((entry, idx) => (
              <div
                key={`${entry.scope}-${entry.path}-${idx}`}
                className={`winget-pkg-row ${!entry.exists ? 'is-pinned' : ''}`}
              >
                <div className="winget-pkg-main">
                  <div className="winget-pkg-title-row">
                    <span className="winget-source-tag">{entry.scope}</span>
                    <span
                      className="winget-pkg-name"
                      style={{
                        maxWidth: '580px',
                        fontFamily: 'Cascadia Mono, Consolas, monospace',
                        fontSize: '11.5px'
                      }}
                    >
                      {entry.path}
                    </span>
                    {!entry.exists && (
                      <span className="winget-badge winget-badge-blocked">
                        ⚠️ Folder Not Found
                      </span>
                    )}
                    {entry.isDuplicate && (
                      <span className="winget-badge winget-badge-pinned">🔁 Duplicate</span>
                    )}
                  </div>
                </div>
                <div className="winget-pkg-actions">
                  <button
                    type="button"
                    className="shelf-btn shelf-btn-sm"
                    onClick={() => handleCopyText(entry.path, 'Copied PATH entry')}
                  >
                    📋 Copy
                  </button>
                  {entry.exists && (
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-sm"
                      onClick={() => window.api.revealPathInExplorer?.(entry.path)}
                    >
                      📂 Open
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="winget-tab-body">
          <div className="winget-search-bar-row">
            <input
              type="text"
              className="winget-filter-input"
              style={{ width: 210 }}
              placeholder="Variable Name (e.g. GOPATH)"
              value={newEnvName}
              onChange={(e) => setNewEnvName(e.target.value)}
            />
            <input
              type="text"
              className="winget-search-input"
              style={{ flex: 1 }}
              placeholder="Variable Value..."
              value={newEnvValue}
              onChange={(e) => setNewEnvValue(e.target.value)}
            />
            <select
              className="winget-inspector-select"
              style={{ width: 115 }}
              value={newEnvScope}
              onChange={(e) => setNewEnvScope(e.target.value as 'User' | 'Machine')}
            >
              <option value="User">User Scope</option>
              <option value="Machine">Machine (UAC)</option>
            </select>
            <button
              type="button"
              className="shelf-btn shelf-btn-primary shelf-btn-sm"
              disabled={envBusy || !newEnvName.trim()}
              onClick={async (e) => {
                setEnvBusy(true)
                const res = await window.api.setSystemEnvVar?.({
                  name: newEnvName.trim(),
                  value: newEnvValue,
                  scope: newEnvScope,
                  elevated: e.ctrlKey || e.metaKey || elevateByDefault
                })
                setEnvBusy(false)
                if (res) {
                  setEnvVars(res.items)
                  if (res.success) {
                    setNewEnvName('')
                    setNewEnvValue('')
                  }
                  flash(res.message)
                }
              }}
            >
              {envBusy ? 'Saving...' : '💾 Save Variable'}
            </button>
          </div>

          <div className="winget-summary-bar">
            <div className="winget-chip-group">
              <button
                type="button"
                className={`winget-filter-chip ${envFilterChip === 'all' ? 'is-active' : ''}`}
                onClick={() => setEnvFilterChip('all')}
              >
                All ({envVars.length})
              </button>
              <button
                type="button"
                className={`winget-filter-chip ${envFilterChip === 'User' ? 'is-active' : ''}`}
                onClick={() => setEnvFilterChip('User')}
              >
                👤 User ({envVars.filter((v) => v.scope === 'User').length})
              </button>
              <button
                type="button"
                className={`winget-filter-chip ${envFilterChip === 'Machine' ? 'is-active' : ''}`}
                onClick={() => setEnvFilterChip('Machine')}
              >
                🖥️ Machine ({envVars.filter((v) => v.scope === 'Machine').length})
              </button>
              <button
                type="button"
                className={`winget-filter-chip ${envFilterChip === 'secrets' ? 'is-active' : ''}`}
                onClick={() => setEnvFilterChip('secrets')}
              >
                🔒 Secrets / Keys ({envVars.filter((v) => v.isSecret).length})
              </button>
            </div>
            <span className="winget-summary-text">{filteredEnvVars.length} shown</span>
          </div>

          <div className="winget-pkg-list">
            {filteredEnvVars.length === 0 ? (
              <div className="profile-empty-list">
                No environment variables match your filter.
              </div>
            ) : (
              filteredEnvVars.map((ev) => {
                const keyId = `${ev.scope}:${ev.name}`
                const isRevealed = !ev.isSecret || revealedEnvKeys.has(keyId)
                return (
                  <div key={keyId} className="winget-pkg-row">
                    <div className="winget-pkg-main">
                      <div className="winget-pkg-title-row">
                        <span className="winget-source-tag">{ev.scope}</span>
                        <span
                          className="winget-pkg-name"
                          style={{ fontFamily: 'Cascadia Mono, Consolas, monospace' }}
                        >
                          {ev.name}
                        </span>
                        {ev.isSecret && (
                          <span className="winget-badge winget-badge-pinned">🔒 Secret</span>
                        )}
                      </div>
                      <div className="winget-pkg-meta-row">
                        <span
                          className="winget-ver-current"
                          style={{
                            fontFamily: 'Cascadia Mono, Consolas, monospace',
                            maxWidth: '680px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {isRevealed ? ev.value : '••••••••••••••••••••••••'}
                        </span>
                      </div>
                    </div>
                    <div className="winget-pkg-actions">
                      {ev.isSecret && (
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-sm"
                          onClick={() => {
                            setRevealedEnvKeys((prev) => {
                              const next = new Set(prev)
                              if (next.has(keyId)) next.delete(keyId)
                              else next.add(keyId)
                              return next
                            })
                          }}
                        >
                          {isRevealed ? '🙈 Hide' : '👁️ Reveal'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-sm"
                        onClick={() => {
                          setNewEnvName(ev.name)
                          setNewEnvValue(ev.value)
                          setNewEnvScope(ev.scope)
                        }}
                        title="Load into editor bar above"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-sm"
                        onClick={() => handleCopyText(ev.value, `Copied ${ev.name}`)}
                      >
                        📋 Copy
                      </button>
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-danger shelf-btn-sm"
                        disabled={envBusy}
                        onClick={async (e) => {
                          setEnvBusy(true)
                          const res = await window.api.deleteSystemEnvVar?.({
                            name: ev.name,
                            scope: ev.scope,
                            elevated: e.ctrlKey || e.metaKey || elevateByDefault
                          })
                          setEnvBusy(false)
                          if (res) {
                            setEnvVars(res.items)
                            flash(res.message)
                          }
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
