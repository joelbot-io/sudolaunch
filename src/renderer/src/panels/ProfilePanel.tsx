import { useState, useEffect, useCallback } from 'react'
import type { ProfileItem, BackupArchiveItem } from '../../../shared/types'

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
