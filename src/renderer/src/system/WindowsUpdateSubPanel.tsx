import { useState } from 'react'
import type { WindowsUpdateStatus } from '../../../shared/types'

export interface WindowsUpdateSubPanelProps {
  winUpdateStatus: WindowsUpdateStatus | null
  setWinUpdateStatus: (status: WindowsUpdateStatus) => void
  loadingWinUpdate: boolean
  scanningWinUpdate: boolean
  winUpdateActionBusy: string | null
  setWinUpdateActionBusy: (busy: string | null) => void
  loadWindowsUpdateStatus: (options?: {
    force?: boolean
    scanPending?: boolean
    online?: boolean
  }) => Promise<void>
  flash: (msg: string) => void
  handleCopyText: (text: string, label?: string) => void
}

export function WindowsUpdateSubPanel({
  winUpdateStatus,
  setWinUpdateStatus,
  loadingWinUpdate,
  scanningWinUpdate,
  winUpdateActionBusy,
  setWinUpdateActionBusy,
  loadWindowsUpdateStatus,
  flash,
  handleCopyText
}: WindowsUpdateSubPanelProps): JSX.Element {
  const [confirmScheduleReboot, setConfirmScheduleReboot] = useState(false)
  const [rebootScheduled, setRebootScheduled] = useState(false)

  return (
    <div className="winget-tab-body">
      {(loadingWinUpdate || scanningWinUpdate || winUpdateActionBusy) && (
        <div className="sudo-job-running-banner">
          <span className="sudo-spinner sudo-spinner-lg" />
          <span>
            {winUpdateActionBusy === 'scan-online'
              ? 'Querying Microsoft Update online servers for cumulative, security, and driver updates (this may take 10–30 seconds)...'
              : winUpdateActionBusy === 'scan-local'
                ? 'Scanning locally cached Windows Update catalog via Microsoft.Update.Session...'
                : winUpdateActionBusy === 'trigger-scan'
                  ? 'Running Windows Update Orchestrator scan (UsoClient StartInteractiveScan) & refreshing pending updates...'
                  : winUpdateActionBusy === 'install-all'
                    ? 'Downloading & installing all pending Windows Updates via elevated Windows Update Agent (UAC)...'
                    : winUpdateActionBusy === 'download-all'
                      ? 'Downloading pending Windows Updates into local cache via elevated Windows Update Agent...'
                      : winUpdateActionBusy?.startsWith('install-kb:')
                        ? `Downloading & installing update (${winUpdateActionBusy.replace('install-kb:', '')}) via elevated Windows Update Agent...`
                        : 'Checking Windows Reboot & Update registry indicators and hotfix history...'}
          </span>
        </div>
      )}

      <div
        className="winget-pin-editor-card"
        style={{
          margin: 0,
          borderColor: winUpdateStatus?.rebootPending
            ? 'rgba(245, 158, 11, 0.45)'
            : 'rgba(34, 197, 94, 0.35)',
          background: winUpdateStatus?.rebootPending
            ? 'rgba(245, 158, 11, 0.08)'
            : 'rgba(34, 197, 94, 0.06)'
        }}
      >
        <div className="winget-pin-editor-header">
          <div>
            <div className="winget-pin-editor-title">
              {loadingWinUpdate && !winUpdateStatus ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span className="sudo-spinner sudo-spinner-sm" />
                  Checking Windows Reboot &amp; Update Registry Indicators...
                </span>
              ) : winUpdateStatus?.rebootPending ? (
                <span style={{ color: '#fbbf24' }}>
                  ⚠️ System Reboot Required ({winUpdateStatus.rebootReasons.length} indicator
                  {winUpdateStatus.rebootReasons.length === 1 ? '' : 's'} active)
                </span>
              ) : (
                <span style={{ color: '#4ade80' }}>✅ No Pending System Reboot Detected</span>
              )}
            </div>
            <div className="winget-pin-editor-sub" style={{ marginTop: 4 }}>
              {winUpdateStatus ? (
                <>
                  🪟 <strong>{winUpdateStatus.osCaption || 'Windows'}</strong>
                  {winUpdateStatus.osBuild
                    ? ` (Build ${winUpdateStatus.osBuild} • v${winUpdateStatus.osVersion})`
                    : ''}{' '}
                  • ⏱️ Uptime:{' '}
                  <strong>
                    {winUpdateStatus.uptimeDays}d {winUpdateStatus.uptimeHours}h
                  </strong>
                  {winUpdateStatus.lastBootTime ? ` (Booted ${winUpdateStatus.lastBootTime})` : ''}{' '}
                  • ⚙️ wuauserv: <code>{winUpdateStatus.wuaServiceStatus}</code>
                  {winUpdateStatus.lastCheckedAt ? ` • Checked ${winUpdateStatus.lastCheckedAt}` : ''}
                </>
              ) : (
                'Querying Component-Based Servicing (CBS), WindowsUpdate Auto Update, and Session Manager registry keys...'
              )}
            </div>
          </div>

          <div className="winget-summary-actions">
            <button
              type="button"
              className="shelf-btn shelf-btn-sm"
              onClick={async () => {
                const res = await window.api.runWindowsUpdateAction?.('open-settings')
                if (res?.message) flash(res.message)
              }}
              title="Open Windows Update in Windows Settings (ms-settings:windowsupdate)"
            >
              ⚙️ Windows Update Settings
            </button>
            <button
              type="button"
              className="shelf-btn shelf-btn-sm"
              onClick={async () => {
                const res = await window.api.runWindowsUpdateAction?.('open-history')
                if (res?.message) flash(res.message)
              }}
              title="Open Windows Update History (ms-settings:windowsupdate-history)"
            >
              📜 Update History
            </button>
          </div>
        </div>

        {winUpdateStatus?.rebootPending && (
          <div className="winget-chip-group" style={{ marginTop: 8, marginBottom: 4 }}>
            {winUpdateStatus.rebootReasons.map((reason) => (
              <span
                key={reason}
                className="winget-badge winget-badge-blocked"
                style={{ fontSize: '11.5px', padding: '3px 8px' }}
              >
                🔔 {reason}
              </span>
            ))}
          </div>
        )}

        <div className="winget-pin-editor-footer" style={{ marginTop: 8 }}>
          <button
            type="button"
            className={`shelf-btn shelf-btn-sm ${
              confirmScheduleReboot ? 'shelf-btn-danger' : 'shelf-btn-warning'
            }`}
            onClick={async () => {
              if (!confirmScheduleReboot) {
                setConfirmScheduleReboot(true)
                setTimeout(() => setConfirmScheduleReboot(false), 4500)
                return
              }
              setConfirmScheduleReboot(false)
              const res = await window.api.runWindowsUpdateAction?.('schedule-reboot-60s')
              if (res?.success) {
                setRebootScheduled(true)
              }
              if (res?.message) flash(res.message)
            }}
            title="Schedule a graceful Windows restart in 60 seconds (shutdown /r /t 60)"
          >
            {confirmScheduleReboot
              ? '⚠️ Click Again to Schedule Restart in 60s'
              : '🔄 Schedule Restart (60s)'}
          </button>

          {rebootScheduled && (
            <button
              type="button"
              className="shelf-btn shelf-btn-danger shelf-btn-sm"
              onClick={async () => {
                const res = await window.api.runWindowsUpdateAction?.('cancel-reboot')
                setRebootScheduled(false)
                if (res?.message) flash(res.message)
              }}
              title="Abort scheduled Windows restart (shutdown /a)"
            >
              ⏹️ Cancel Scheduled Restart (shutdown /a)
            </button>
          )}

          <button
            type="button"
            className="shelf-btn shelf-btn-sm"
            disabled={loadingWinUpdate || scanningWinUpdate || Boolean(winUpdateActionBusy)}
            onClick={() => void loadWindowsUpdateStatus({ force: true, scanPending: false })}
          >
            {loadingWinUpdate || winUpdateActionBusy === 'recheck' ? (
              <>
                <span className="sudo-spinner sudo-spinner-sm" /> Checking…
              </>
            ) : (
              '🔄 Re-check Reboot Flags'
            )}
          </button>
        </div>
      </div>

      <div className="winget-summary-bar">
        <div className="winget-summary-left">
          <span className="winget-summary-text">
            {scanningWinUpdate || winUpdateActionBusy ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span className="sudo-spinner sudo-spinner-sm" />
                <span>
                  {winUpdateActionBusy === 'install-all' ||
                  winUpdateActionBusy?.startsWith('install-kb:')
                    ? 'Installing Windows Updates...'
                    : 'Querying Windows Update Agent (Microsoft.Update.Session)...'}
                </span>
              </span>
            ) : winUpdateStatus?.pendingScanned ? (
              `${winUpdateStatus.pendingUpdates.length} pending Windows / Driver update${
                winUpdateStatus.pendingUpdates.length === 1 ? '' : 's'
              } found`
            ) : (
              'Pending Windows & Driver Updates (click Scan to query Windows Update Agent)'
            )}
          </span>
        </div>
        <div className="winget-summary-actions">
          <button
            type="button"
            className="shelf-btn shelf-btn-primary shelf-btn-sm"
            disabled={scanningWinUpdate || Boolean(winUpdateActionBusy)}
            onClick={() =>
              void loadWindowsUpdateStatus({
                force: true,
                scanPending: true,
                online: false
              })
            }
            title="Fast scan of locally cached Windows Update catalog (~3-8s)"
          >
            {winUpdateActionBusy === 'scan-local' ? (
              <>
                <span className="sudo-spinner sudo-spinner-sm" /> Scanning Cache…
              </>
            ) : (
              '🔍 Scan Pending (Local Cache)'
            )}
          </button>
          <button
            type="button"
            className="shelf-btn shelf-btn-sm"
            disabled={scanningWinUpdate || Boolean(winUpdateActionBusy)}
            onClick={() =>
              void loadWindowsUpdateStatus({
                force: true,
                scanPending: true,
                online: true
              })
            }
            title="Query Microsoft Update servers online for latest cumulative & driver updates"
          >
            {winUpdateActionBusy === 'scan-online' ? (
              <>
                <span className="sudo-spinner sudo-spinner-sm" /> Scanning Online…
              </>
            ) : (
              '🌐 Scan Online'
            )}
          </button>
          <button
            type="button"
            className="shelf-btn shelf-btn-sm"
            disabled={scanningWinUpdate || Boolean(winUpdateActionBusy)}
            onClick={async () => {
              setWinUpdateActionBusy('trigger-scan')
              try {
                const res = await window.api.runWindowsUpdateAction?.('trigger-scan')
                if (res?.status) setWinUpdateStatus(res.status)
                if (res?.message) flash(res.message)
              } finally {
                setWinUpdateActionBusy(null)
              }
            }}
            title="Trigger Windows Update Orchestrator scan (UsoClient StartInteractiveScan + StartScan) and refresh pending list"
          >
            {winUpdateActionBusy === 'trigger-scan' ? (
              <>
                <span className="sudo-spinner sudo-spinner-sm" /> Triggering Scan…
              </>
            ) : (
              '⚡ Trigger OS Scan'
            )}
          </button>
          {(winUpdateStatus?.pendingUpdates.length ?? 0) > 0 && (
            <>
              <button
                type="button"
                className="shelf-btn shelf-btn-primary shelf-btn-sm"
                disabled={scanningWinUpdate || Boolean(winUpdateActionBusy)}
                onClick={async () => {
                  setWinUpdateActionBusy('install-all')
                  try {
                    const res = await window.api.runWindowsUpdateAction?.('install-updates')
                    if (res?.status) setWinUpdateStatus(res.status)
                    if (res?.message) flash(res.message)
                  } finally {
                    setWinUpdateActionBusy(null)
                  }
                }}
                title="Download & install all pending Windows Updates via elevated Windows Update Agent (UAC)"
              >
                {winUpdateActionBusy === 'install-all' ? (
                  <>
                    <span className="sudo-spinner sudo-spinner-sm" /> Installing…
                  </>
                ) : (
                  `⬇️ Install All (${winUpdateStatus?.pendingUpdates.length})`
                )}
              </button>
              <button
                type="button"
                className="shelf-btn shelf-btn-sm"
                disabled={scanningWinUpdate || Boolean(winUpdateActionBusy)}
                onClick={async () => {
                  const res = await window.api.runWindowsUpdateAction?.('install-in-terminal')
                  if (res?.message) flash(res.message)
                }}
                title="Run Windows Update scan, download, and install stream in SudoLaunch Terminal (>_)"
              >
                &gt;_ Install in Terminal
              </button>
            </>
          )}
        </div>
      </div>

      {winUpdateStatus?.scanNote && (
        <div
          style={{
            padding: '6px 10px',
            fontSize: 11,
            borderRadius: 6,
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            color: '#fbbf24'
          }}
        >
          ℹ️ {winUpdateStatus.scanNote}
        </div>
      )}

      {winUpdateStatus?.pendingScanned && (
        <div className="winget-pkg-list" style={{ maxHeight: 165, flexShrink: 0 }}>
          {winUpdateStatus.pendingUpdates.length === 0 ? (
            <div className="profile-empty-list" style={{ padding: '14px' }}>
              🎉 No pending Windows or Driver updates detected by the Windows Update Agent!
            </div>
          ) : (
            winUpdateStatus.pendingUpdates.map((u, idx) => {
              const targetKey = u.kbs || u.title
              const isInstallingThis =
                winUpdateActionBusy === `install-kb:${targetKey}` ||
                winUpdateActionBusy === 'install-all'
              return (
                <div key={`${u.title}-${idx}`} className="winget-pkg-row">
                  <div className="winget-pkg-main">
                    <div className="winget-pkg-title-row">
                      <span className="winget-pkg-name">{u.title}</span>
                      {u.kbs && (
                        <button
                          type="button"
                          className="winget-pkg-id-btn"
                          onClick={() => handleCopyText(u.kbs, 'Copied KB ID')}
                          title="Click to copy KB ID"
                        >
                          {u.kbs}
                        </button>
                      )}
                      {u.isDownloaded && (
                        <span className="winget-badge winget-badge-installed">✓ Downloaded</span>
                      )}
                      {u.rebootRequired && (
                        <span className="winget-badge winget-badge-blocked">🔄 Needs Reboot</span>
                      )}
                    </div>
                    <div className="winget-pkg-meta-row">
                      <span className="winget-source-tag">Severity: {u.severity}</span>
                      {u.sizeMb > 0 && <span className="winget-ver-current">{u.sizeMb} MB</span>}
                    </div>
                  </div>
                  <div className="winget-pkg-actions">
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-primary shelf-btn-sm"
                      disabled={scanningWinUpdate || Boolean(winUpdateActionBusy)}
                      onClick={async () => {
                        setWinUpdateActionBusy(`install-kb:${targetKey}`)
                        try {
                          const res = await window.api.runWindowsUpdateAction?.(
                            'install-updates',
                            targetKey
                          )
                          if (res?.status) setWinUpdateStatus(res.status)
                          if (res?.message) flash(res.message)
                        } finally {
                          setWinUpdateActionBusy(null)
                        }
                      }}
                      title="Download & install this update directly via elevated Windows Update Agent (UAC)"
                    >
                      {isInstallingThis ? (
                        <>
                          <span className="sudo-spinner sudo-spinner-sm" /> Installing…
                        </>
                      ) : (
                        '⬇️ Install Update'
                      )}
                    </button>
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-sm"
                      onClick={() => void window.api.runWindowsUpdateAction?.('open-settings')}
                      title="Open Windows Update Settings (ms-settings:windowsupdate)"
                    >
                      🪟 Settings
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      <div className="winget-summary-bar">
        <span className="winget-summary-text">
          📜 Recently Installed Windows KB Hotfixes ({winUpdateStatus?.recentHotfixes.length ?? 0})
        </span>
      </div>

      <div className="winget-pkg-list">
        {!winUpdateStatus ? (
          <div className="profile-empty-list">Loading installed Windows KB hotfixes...</div>
        ) : winUpdateStatus.recentHotfixes.length === 0 ? (
          <div className="profile-empty-list">No KB hotfix entries returned by Get-HotFix.</div>
        ) : (
          winUpdateStatus.recentHotfixes.map((hf) => (
            <div key={hf.hotFixId} className="winget-pkg-row">
              <div className="winget-pkg-main">
                <div className="winget-pkg-title-row">
                  <span className="winget-pkg-name">
                    {hf.description || 'Windows Update'} — {hf.hotFixId}
                  </span>
                  <button
                    type="button"
                    className="winget-pkg-id-btn"
                    onClick={() => handleCopyText(hf.hotFixId, 'Copied HotFix ID')}
                    title="Click to copy KB ID"
                  >
                    {hf.hotFixId}
                  </button>
                </div>
                <div className="winget-pkg-meta-row">
                  {hf.installedOn && (
                    <span className="winget-ver-current">Installed: {hf.installedOn}</span>
                  )}
                </div>
              </div>
              <div className="winget-pkg-actions">
                <button
                  type="button"
                  className="shelf-btn shelf-btn-sm"
                  onClick={() => {
                    const num = hf.hotFixId.replace(/^KB/i, '')
                    void window.api.openExternalUrl?.(`https://support.microsoft.com/help/${num}`)
                  }}
                  title={`Open Microsoft Support documentation for ${hf.hotFixId}`}
                >
                  🌐 KB Info
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

