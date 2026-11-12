import { useState, useMemo } from 'react'
import type { CleanupTargetItem, SystemStorageAndPowerOverview } from '../../../shared/types'

export interface CleanupAndStoragePanelProps {
  cleanupView: 'caches' | 'storage' | 'power'
  setCleanupView: (view: 'caches' | 'storage' | 'power') => void
  cleanupTargets: CleanupTargetItem[]
  setCleanupTargets: (targets: CleanupTargetItem[]) => void
  storageAndPower: SystemStorageAndPowerOverview | null
  loadingCleanup: boolean
  cleaningBusy: boolean
  setCleaningBusy: (busy: boolean) => void
  flash: (msg: string) => void
  loadCleanup: () => Promise<void>
}

export function CleanupAndStoragePanel({
  cleanupView,
  setCleanupView,
  cleanupTargets,
  setCleanupTargets,
  storageAndPower,
  loadingCleanup,
  cleaningBusy,
  setCleaningBusy,
  flash,
  loadCleanup
}: CleanupAndStoragePanelProps): JSX.Element {
  const [selectedCleanupIds, setSelectedCleanupIds] = useState<Set<string>>(
    new Set(['winget-temp', 'user-temp', 'crash-dumps'])
  )

  const totalCleanupMb = useMemo(
    () =>
      cleanupTargets
        .filter((t) => selectedCleanupIds.has(t.id))
        .reduce((acc, t) => acc + t.sizeMb, 0)
        .toFixed(1),
    [cleanupTargets, selectedCleanupIds]
  )

  return (
    <div className="winget-tab-body">
      <div className="winget-toolbar-row">
        <div className="profile-tabs-bar" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <button
            type="button"
            className={`profile-tab-btn ${cleanupView === 'caches' ? 'is-active' : ''}`}
            onClick={() => setCleanupView('caches')}
          >
            <span>🧹 Dev &amp; System Caches</span>
            <span className="profile-tab-count">{totalCleanupMb} MB</span>
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${cleanupView === 'storage' ? 'is-active' : ''}`}
            onClick={() => setCleanupView('storage')}
          >
            <span>💾 Storage &amp; SMART Health</span>
            {storageAndPower && (
              <span className="profile-tab-count">{storageAndPower.volumes.length} drives</span>
            )}
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${cleanupView === 'power' ? 'is-active' : ''}`}
            onClick={() => setCleanupView('power')}
          >
            <span>🔋 Power Plans &amp; OS Repair</span>
          </button>
        </div>
      </div>

      {cleanupView === 'caches' ? (
        <div className="winget-tab-body">
          <div className="winget-summary-bar">
            <span className="winget-summary-text">
              {loadingCleanup
                ? 'Calculating developer & system cache sizes...'
                : `Selected reclaimable space: ~${totalCleanupMb} MB`}
            </span>
            <div className="winget-summary-actions">
              <button
                type="button"
                className="shelf-btn shelf-btn-primary shelf-btn-sm"
                disabled={cleaningBusy || selectedCleanupIds.size === 0}
                onClick={async () => {
                  setCleaningBusy(true)
                  const res = await window.api.cleanSystemTargets?.([...selectedCleanupIds])
                  setCleaningBusy(false)
                  if (res) {
                    setCleanupTargets(res.targets)
                    flash(res.message)
                  }
                }}
              >
                {cleaningBusy ? (
                  <>
                    <span className="sudo-spinner sudo-spinner-sm" /> Cleaning…
                  </>
                ) : (
                  `🧹 Clean Selected (${totalCleanupMb} MB)`
                )}
              </button>
            </div>
          </div>

          <div className="winget-pkg-list">
            {loadingCleanup && cleanupTargets.length === 0 ? (
              <div className="profile-empty-list">Scanning cache directories...</div>
            ) : (
              cleanupTargets.map((target) => (
                <div key={target.id} className="winget-pkg-row">
                  <input
                    type="checkbox"
                    className="winget-row-checkbox"
                    checked={selectedCleanupIds.has(target.id)}
                    onChange={() => {
                      setSelectedCleanupIds((prev) => {
                        const next = new Set(prev)
                        if (next.has(target.id)) next.delete(target.id)
                        else next.add(target.id)
                        return next
                      })
                    }}
                  />
                  <div className="winget-pkg-main">
                    <div className="winget-pkg-title-row">
                      <span>{target.icon}</span>
                      <span className="winget-pkg-name">{target.name}</span>
                      <span className="winget-badge winget-badge-pinned">{target.sizeMb} MB</span>
                      {target.fileCount !== undefined && target.fileCount > 0 && (
                        <span className="winget-source-tag">{target.fileCount} files</span>
                      )}
                      <span className="winget-source-tag">{target.category}</span>
                    </div>
                    <div className="winget-pkg-meta-row">
                      <span className="winget-ver-current">{target.description}</span>
                    </div>
                  </div>
                  <div className="winget-pkg-actions">
                    {target.exists && (
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-sm"
                        onClick={() => window.api.revealPathInExplorer?.(target.path)}
                      >
                        📂 Folder
                      </button>
                    )}
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-primary shelf-btn-sm"
                      disabled={cleaningBusy || target.sizeMb === 0}
                      onClick={async () => {
                        setCleaningBusy(true)
                        const res = await window.api.cleanSystemTargets?.([target.id])
                        setCleaningBusy(false)
                        if (res) {
                          setCleanupTargets(res.targets)
                          flash(res.message)
                        }
                      }}
                    >
                      Clean Now
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : cleanupView === 'storage' ? (
        <div className="winget-tab-body">
          <div className="winget-summary-bar">
            <span className="winget-summary-text">
              💾 Logical Drive Volumes ({storageAndPower?.volumes.length ?? 0}) &amp; Physical Disks
              ({storageAndPower?.disks.length ?? 0})
            </span>
          </div>

          <div className="winget-pkg-list">
            {!storageAndPower ? (
              <div className="profile-empty-list">
                Scanning volumes and physical SMART status...
              </div>
            ) : (
              <>
                {storageAndPower.volumes.map((vol) => (
                  <div key={vol.driveLetter} className="winget-pkg-row">
                    <div className="winget-pkg-main">
                      <div className="winget-pkg-title-row">
                        <span className="winget-badge winget-badge-installed">
                          {vol.driveLetter}:
                        </span>
                        <span className="winget-pkg-name">
                          {vol.label || 'Local Volume'} ({vol.driveLetter}:)
                        </span>
                        <span className="winget-source-tag">{vol.fileSystem}</span>
                        <span
                          className={`winget-badge ${
                            vol.healthStatus === 'Healthy'
                              ? 'winget-badge-installed'
                              : 'winget-badge-blocked'
                          }`}
                        >
                          {vol.healthStatus}
                        </span>
                      </div>
                      <div className="winget-pkg-meta-row" style={{ marginTop: 4 }}>
                        <div
                          style={{
                            width: 220,
                            height: 7,
                            background: 'rgba(255,255,255,0.1)',
                            borderRadius: 4,
                            overflow: 'hidden'
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, vol.usedPercent)}%`,
                              height: '100%',
                              background:
                                vol.usedPercent > 88
                                  ? '#ef4444'
                                  : vol.usedPercent > 75
                                    ? '#f59e0b'
                                    : '#06b6d4'
                            }}
                          />
                        </div>
                        <span className="winget-ver-current">
                          {vol.usedGb} GB used of {vol.totalGb} GB ({vol.freeGb} GB free •{' '}
                          {vol.usedPercent}%)
                        </span>
                      </div>
                    </div>
                    <div className="winget-pkg-actions">
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-sm"
                        onClick={() => window.api.revealPathInExplorer?.(`${vol.driveLetter}:\\`)}
                      >
                        📂 Open {vol.driveLetter}:
                      </button>
                    </div>
                  </div>
                ))}

                {storageAndPower.disks.map((d, idx) => (
                  <div key={`${d.friendlyName}-${idx}`} className="winget-pkg-row">
                    <div className="winget-pkg-main">
                      <div className="winget-pkg-title-row">
                        <span className="winget-badge winget-badge-pinned">
                          💽 {d.mediaType} ({d.busType})
                        </span>
                        <span className="winget-pkg-name">{d.friendlyName}</span>
                        <span className="winget-source-tag">{d.sizeGb} GB</span>
                        <span
                          className={`winget-badge ${
                            d.healthStatus === 'Healthy'
                              ? 'winget-badge-installed'
                              : 'winget-badge-blocked'
                          }`}
                        >
                          SMART: {d.healthStatus} ({d.operationalStatus})
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="winget-tab-body">
          <div className="winget-summary-bar">
            <span className="winget-summary-text">⚡ Windows Power Schemes (powercfg /list)</span>
            <div className="winget-summary-actions">
              <button
                type="button"
                className="shelf-btn shelf-btn-sm"
                onClick={async () => {
                  const res = await window.api.runSystemPowerOrRepairAction?.({
                    action: 'battery-report'
                  })
                  if (res?.message) flash(res.message)
                }}
              >
                🔋 Generate Battery Health Report
              </button>
            </div>
          </div>

          <div className="winget-pkg-list" style={{ maxHeight: 155, flexShrink: 0 }}>
            {storageAndPower?.powerPlans.map((plan) => (
              <div key={plan.guid} className="winget-pkg-row">
                <div className="winget-pkg-main">
                  <div className="winget-pkg-title-row">
                    <span className="winget-pkg-name">{plan.name}</span>
                    <span className="winget-source-tag">{plan.guid}</span>
                    {plan.isActive && (
                      <span className="winget-badge winget-badge-installed">⚡ Active Plan</span>
                    )}
                  </div>
                </div>
                <div className="winget-pkg-actions">
                  {!plan.isActive && (
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-primary shelf-btn-sm"
                      onClick={async () => {
                        const res = await window.api.runSystemPowerOrRepairAction?.({
                          action: 'set-power-plan',
                          planGuid: plan.guid
                        })
                        if (res?.message) flash(res.message)
                        void loadCleanup()
                      }}
                    >
                      ⚡ Activate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="winget-summary-bar">
            <span className="winget-summary-text">
              🔧 Windows System Maintenance, WSL Memory Reclaim &amp; DISM / SFC Repair Toolkit
            </span>
          </div>

          <div className="system-runtimes-grid" style={{ padding: '4px 0' }}>
            <div className="system-runtime-card">
              <div className="system-runtime-top">
                <div className="system-runtime-title-group">
                  <span className="system-runtime-icon">🐧</span>
                  <div>
                    <div className="system-runtime-name">Shutdown WSL 2 VM</div>
                    <div className="system-runtime-ver">wsl --shutdown (Reclaim vmmemWSL RAM)</div>
                  </div>
                </div>
              </div>
              <div className="system-runtime-actions">
                <button
                  type="button"
                  className="shelf-btn shelf-btn-primary shelf-btn-sm"
                  onClick={async () => {
                    const res = await window.api.runSystemPowerOrRepairAction?.({
                      action: 'wsl-shutdown'
                    })
                    if (res?.message) flash(res.message)
                  }}
                >
                  🐧 Shutdown WSL Now
                </button>
              </div>
            </div>

            <div className="system-runtime-card">
              <div className="system-runtime-top">
                <div className="system-runtime-title-group">
                  <span className="system-runtime-icon">🔍</span>
                  <div>
                    <div className="system-runtime-name">System File Checker (SFC)</div>
                    <div className="system-runtime-ver">sfc /scannow (Verify OS Integrity)</div>
                  </div>
                </div>
              </div>
              <div className="system-runtime-actions">
                <button
                  type="button"
                  className="shelf-btn shelf-btn-primary shelf-btn-sm"
                  onClick={async () => {
                    const res = await window.api.runSystemPowerOrRepairAction?.({
                      action: 'sfc-scannow'
                    })
                    if (res?.message) flash(res.message)
                  }}
                >
                  🛡️ Run sfc /scannow (UAC)
                </button>
              </div>
            </div>

            <div className="system-runtime-card">
              <div className="system-runtime-top">
                <div className="system-runtime-title-group">
                  <span className="system-runtime-icon">🛠️</span>
                  <div>
                    <div className="system-runtime-name">DISM Image Health &amp; Repair</div>
                    <div className="system-runtime-ver">DISM /CheckHealth &amp; /RestoreHealth</div>
                  </div>
                </div>
              </div>
              <div className="system-runtime-actions">
                <button
                  type="button"
                  className="shelf-btn shelf-btn-sm"
                  onClick={async () => {
                    const res = await window.api.runSystemPowerOrRepairAction?.({
                      action: 'dism-check'
                    })
                    if (res?.message) flash(res.message)
                  }}
                >
                  &gt;_ CheckHealth
                </button>
                <button
                  type="button"
                  className="shelf-btn shelf-btn-primary shelf-btn-sm"
                  onClick={async () => {
                    const res = await window.api.runSystemPowerOrRepairAction?.({
                      action: 'dism-restore'
                    })
                    if (res?.message) flash(res.message)
                  }}
                >
                  🛡️ RestoreHealth (UAC)
                </button>
              </div>
            </div>

            <div className="system-runtime-card">
              <div className="system-runtime-top">
                <div className="system-runtime-title-group">
                  <span className="system-runtime-icon">🧹</span>
                  <div>
                    <div className="system-runtime-name">WinSxS &amp; Store Cache Reset</div>
                    <div className="system-runtime-ver">
                      DISM /StartComponentCleanup &amp; wsreset
                    </div>
                  </div>
                </div>
              </div>
              <div className="system-runtime-actions">
                <button
                  type="button"
                  className="shelf-btn shelf-btn-primary shelf-btn-sm"
                  onClick={async () => {
                    const res = await window.api.runSystemPowerOrRepairAction?.({
                      action: 'dism-cleanup'
                    })
                    if (res?.message) flash(res.message)
                  }}
                >
                  🧹 Clean WinSxS (UAC)
                </button>
                <button
                  type="button"
                  className="shelf-btn shelf-btn-sm"
                  onClick={async () => {
                    const res = await window.api.runSystemPowerOrRepairAction?.({
                      action: 'wsreset'
                    })
                    if (res?.message) flash(res.message)
                  }}
                >
                  🛍️ wsreset
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

