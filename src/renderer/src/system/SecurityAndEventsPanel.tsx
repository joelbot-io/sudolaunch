import { useState, useMemo, useDeferredValue } from 'react'
import type { SystemSecurityPosture, SystemEventLogItem } from '../../../shared/types'

export interface SecurityAndEventsPanelProps {
  securityView: 'posture' | 'events'
  setSecurityView: (view: 'posture' | 'events') => void
  securityPosture: SystemSecurityPosture | null
  setSecurityPosture: (posture: SystemSecurityPosture) => void
  eventLogs: SystemEventLogItem[]
  loadingSecurity: boolean
  flash: (msg: string) => void
  handleCopyText: (text: string, label?: string) => void
}

export function SecurityAndEventsPanel({
  securityView,
  setSecurityView,
  securityPosture,
  setSecurityPosture,
  eventLogs,
  loadingSecurity,
  flash,
  handleCopyText
}: SecurityAndEventsPanelProps): JSX.Element {
  const [newExclusionPath, setNewExclusionPath] = useState('')
  const [eventFilterChip, setEventFilterChip] = useState<
    'all' | 'Application' | 'System' | 'Critical'
  >('all')
  const [eventSearchText, setEventSearchText] = useState('')
  const [securityActionBusy, setSecurityActionBusy] = useState<string | null>(null)

  const deferredEventSearchText = useDeferredValue(eventSearchText)

  const filteredEventLogs = useMemo(() => {
    let base = eventLogs
    if (eventFilterChip === 'Application' || eventFilterChip === 'System') {
      base = base.filter((e) => e.logName === eventFilterChip)
    } else if (eventFilterChip === 'Critical') {
      base = base.filter((e) => e.level === 'Critical')
    }
    const q = deferredEventSearchText.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (e) =>
        e.providerName.toLowerCase().includes(q) ||
        e.message.toLowerCase().includes(q) ||
        String(e.id).includes(q)
    )
  }, [eventLogs, eventFilterChip, deferredEventSearchText])

  return (
    <div className="winget-tab-body">
      <div className="winget-toolbar-row">
        <div className="profile-tabs-bar" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <button
            type="button"
            className={`profile-tab-btn ${securityView === 'posture' ? 'is-active' : ''}`}
            onClick={() => setSecurityView('posture')}
          >
            <span>🛡️ Defender, Exclusions &amp; BitLocker</span>
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${securityView === 'events' ? 'is-active' : ''}`}
            onClick={() => setSecurityView('events')}
          >
            <span>🚨 Event Log &amp; Crash Triage</span>
            <span className="profile-tab-count">{eventLogs.length}</span>
          </button>
        </div>
        {securityView === 'events' && (
          <input
            type="text"
            className="winget-filter-input"
            placeholder="Search provider, Event ID, or message..."
            value={eventSearchText}
            onChange={(e) => setEventSearchText(e.target.value)}
          />
        )}
      </div>

      {securityView === 'posture' ? (
        <div className="winget-tab-body">
          <div className="winget-pin-editor-card" style={{ margin: 0 }}>
            <div className="winget-pin-editor-header">
              <div>
                <div className="winget-pin-editor-title">
                  🛡️ Microsoft Defender Antivirus &amp; Endpoint Protection
                </div>
                <div className="winget-pin-editor-sub" style={{ marginTop: 4 }}>
                  {securityPosture ? (
                    <>
                      Real-Time:{' '}
                      <strong
                        style={{
                          color: securityPosture.realtimeProtectionEnabled ? '#4ade80' : '#f87171'
                        }}
                      >
                        {securityPosture.realtimeProtectionEnabled ? 'ON' : 'OFF'}
                      </strong>{' '}
                      • Tamper Protection:{' '}
                      <strong>
                        {securityPosture.tamperProtectionEnabled ? 'Enabled' : 'Off'}
                      </strong>{' '}
                      • Signatures: <code>{securityPosture.signatureVersion}</code>
                      {securityPosture.signatureLastUpdated
                        ? ` (Updated ${securityPosture.signatureLastUpdated})`
                        : ''}{' '}
                      • Local Admins: <strong>{securityPosture.localAdmins.length}</strong>
                    </>
                  ) : (
                    'Querying Get-MpComputerStatus, Get-MpPreference, and BitLocker status...'
                  )}
                </div>
              </div>
              <div className="winget-summary-actions">
                <button
                  type="button"
                  className="shelf-btn shelf-btn-primary shelf-btn-sm"
                  disabled={securityActionBusy !== null}
                  onClick={async () => {
                    setSecurityActionBusy('update-signatures')
                    flash('Updating Microsoft Defender signatures...')
                    try {
                      const res = await window.api.runSystemSecurityAction?.({
                        action: 'update-signatures'
                      })
                      if (res?.posture) setSecurityPosture(res.posture)
                      if (res?.message) flash(res.message)
                    } finally {
                      setSecurityActionBusy(null)
                    }
                  }}
                >
                  {securityActionBusy === 'update-signatures' ? (
                    <>
                      <span className="sudo-spinner sudo-spinner-sm" /> Updating…
                    </>
                  ) : (
                    '🔄 Update Signatures'
                  )}
                </button>
                <button
                  type="button"
                  className="shelf-btn shelf-btn-sm"
                  disabled={securityActionBusy !== null}
                  onClick={async () => {
                    setSecurityActionBusy('quick-scan')
                    try {
                      const res = await window.api.runSystemSecurityAction?.({
                        action: 'quick-scan'
                      })
                      if (res?.message) flash(res.message)
                    } finally {
                      setSecurityActionBusy(null)
                    }
                  }}
                >
                  {securityActionBusy === 'quick-scan' ? (
                    <>
                      <span className="sudo-spinner sudo-spinner-sm" /> Scanning…
                    </>
                  ) : (
                    '🔍 Quick Scan'
                  )}
                </button>
                <button
                  type="button"
                  className="shelf-btn shelf-btn-sm"
                  onClick={async () => {
                    await window.api.runSystemSecurityAction?.({
                      action: 'open-defender'
                    })
                  }}
                >
                  🛡️ Windows Security
                </button>
              </div>
            </div>

            <div className="winget-search-bar-row" style={{ marginTop: 8 }}>
              <input
                type="text"
                className="winget-search-input"
                style={{ flex: 1 }}
                placeholder="Add developer workspace folder exclusion (e.g. C:\Projects) via UAC..."
                value={newExclusionPath}
                onChange={(e) => setNewExclusionPath(e.target.value)}
              />
              <button
                type="button"
                className="shelf-btn shelf-btn-warning shelf-btn-sm"
                disabled={!newExclusionPath.trim()}
                onClick={async () => {
                  const res = await window.api.runSystemSecurityAction?.({
                    action: 'add-exclusion-path',
                    targetPath: newExclusionPath.trim()
                  })
                  if (res?.posture) setSecurityPosture(res.posture)
                  if (res?.message) flash(res.message)
                  setNewExclusionPath('')
                }}
              >
                ➕ Add Folder Exclusion (UAC)
              </button>
            </div>
          </div>

          <div className="winget-pkg-list">
            {securityPosture?.bitLockerVolumes.map((bl) => (
              <div key={bl.mountPoint} className="winget-pkg-row">
                <div className="winget-pkg-main">
                  <div className="winget-pkg-title-row">
                    <span className="winget-badge winget-badge-installed">
                      🔐 BitLocker {bl.mountPoint}
                    </span>
                    <span className="winget-pkg-name">
                      Volume {bl.mountPoint} — {bl.volumeStatus} ({bl.encryptionPercent}% Encrypted)
                    </span>
                    <span
                      className={`winget-badge ${
                        bl.protectionStatus === 'On'
                          ? 'winget-badge-installed'
                          : 'winget-badge-pinned'
                      }`}
                    >
                      Protection: {bl.protectionStatus}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {securityPosture?.exclusionPaths.map((exPath) => (
              <div key={exPath} className="winget-pkg-row">
                <div className="winget-pkg-main">
                  <div className="winget-pkg-title-row">
                    <span className="winget-badge winget-badge-pinned">📂 Defender Exclusion</span>
                    <span
                      className="winget-pkg-name"
                      style={{ fontFamily: 'Cascadia Mono, Consolas, monospace' }}
                    >
                      {exPath}
                    </span>
                  </div>
                </div>
                <div className="winget-pkg-actions">
                  <button
                    type="button"
                    className="shelf-btn shelf-btn-danger shelf-btn-sm"
                    onClick={async () => {
                      const res = await window.api.runSystemSecurityAction?.({
                        action: 'remove-exclusion-path',
                        targetPath: exPath
                      })
                      if (res?.posture) setSecurityPosture(res.posture)
                      if (res?.message) flash(res.message)
                    }}
                  >
                    🗑️ Remove (UAC)
                  </button>
                </div>
              </div>
            ))}

            {securityPosture?.localAdmins.map((adm) => (
              <div key={adm} className="winget-pkg-row">
                <div className="winget-pkg-main">
                  <div className="winget-pkg-title-row">
                    <span className="winget-source-tag">👑 Local Administrator</span>
                    <span className="winget-pkg-name">{adm}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="winget-tab-body">
          <div className="winget-summary-bar">
            <div className="winget-chip-group">
              <button
                type="button"
                className={`winget-filter-chip ${eventFilterChip === 'all' ? 'is-active' : ''}`}
                onClick={() => setEventFilterChip('all')}
              >
                All Critical &amp; Errors ({eventLogs.length})
              </button>
              <button
                type="button"
                className={`winget-filter-chip ${
                  eventFilterChip === 'Application' ? 'is-active' : ''
                }`}
                onClick={() => setEventFilterChip('Application')}
              >
                📦 Application ({eventLogs.filter((e) => e.logName === 'Application').length})
              </button>
              <button
                type="button"
                className={`winget-filter-chip ${
                  eventFilterChip === 'System' ? 'is-active' : ''
                }`}
                onClick={() => setEventFilterChip('System')}
              >
                ⚙️ System ({eventLogs.filter((e) => e.logName === 'System').length})
              </button>
              <button
                type="button"
                className={`winget-filter-chip ${
                  eventFilterChip === 'Critical' ? 'is-active' : ''
                }`}
                onClick={() => setEventFilterChip('Critical')}
              >
                🔴 Critical ({eventLogs.filter((e) => e.level === 'Critical').length})
              </button>
            </div>
            <span className="winget-summary-text">{filteredEventLogs.length} shown</span>
          </div>

          <div className="winget-pkg-list">
            {loadingSecurity && eventLogs.length === 0 ? (
              <div className="profile-empty-list">
                Querying recent Critical and Error events from Windows Event Log...
              </div>
            ) : filteredEventLogs.length === 0 ? (
              <div className="profile-empty-list">
                🎉 No recent Critical or Error events matching your filter!
              </div>
            ) : (
              filteredEventLogs.map((ev, idx) => (
                <div key={`${ev.logName}-${ev.recordId}-${idx}`} className="winget-pkg-row">
                  <div className="winget-pkg-main">
                    <div className="winget-pkg-title-row">
                      <span
                        className={`winget-badge ${
                          ev.level === 'Critical'
                            ? 'winget-badge-blocked'
                            : 'winget-badge-pinned'
                        }`}
                      >
                        {ev.level === 'Critical' ? '🔴 Critical' : '🟠 Error'}
                      </span>
                      <span className="winget-source-tag">{ev.logName}</span>
                      <span className="winget-pkg-name">{ev.providerName}</span>
                      <span className="winget-source-tag">Event ID {ev.id}</span>
                      <span className="winget-ver-current">{ev.timeCreated}</span>
                    </div>
                    <div className="winget-pkg-meta-row">
                      <span
                        className="winget-ver-current"
                        style={{
                          maxWidth: '780px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={ev.message}
                      >
                        {ev.message}
                      </span>
                    </div>
                  </div>
                  <div className="winget-pkg-actions">
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-sm"
                      onClick={() =>
                        handleCopyText(
                          `[${ev.timeCreated}] [${ev.logName}/${ev.level}] ${ev.providerName} (Event ${ev.id}): ${ev.message}`,
                          'Copied Event Log Entry'
                        )
                      }
                    >
                      📋 Copy
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

