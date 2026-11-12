import type { WingetPackageDetails } from '../../../shared/types'

export interface PackageInspectorPaneProps {
  inspectedPkgId: string
  inspectedDetails: WingetPackageDetails | null
  loadingInspector: boolean
  inspectorVersion: string
  setInspectorVersion: (ver: string) => void
  inspectorScope: 'default' | 'user' | 'machine'
  setInspectorScope: (scope: 'default' | 'user' | 'machine') => void
  inspectorInteractive: boolean
  setInspectorInteractive: (val: boolean) => void
  inspectorForce: boolean
  setInspectorForce: (val: boolean) => void
  isOpRunning: boolean
  onCloseInspector: () => void
  handleCopyText: (text: string, label?: string) => void
  handleRunAction: (params: {
    action: 'install' | 'upgrade' | 'upgrade-all' | 'uninstall'
    id?: string
    name?: string
    version?: string
    scope?: 'default' | 'user' | 'machine'
    interactive?: boolean
    force?: boolean
    forceElevated?: boolean
  }) => Promise<void>
  openPinEditor: (pkg: {
    id: string
    name: string
    version: string
    pinType?: string
    pinnedVersion?: string
  }) => void
  suggestVersionWildcard: (ver: string) => string
}

export function PackageInspectorPane({
  inspectedPkgId,
  inspectedDetails,
  loadingInspector,
  inspectorVersion,
  setInspectorVersion,
  inspectorScope,
  setInspectorScope,
  inspectorInteractive,
  setInspectorInteractive,
  inspectorForce,
  setInspectorForce,
  isOpRunning,
  onCloseInspector,
  handleCopyText,
  handleRunAction,
  openPinEditor,
  suggestVersionWildcard
}: PackageInspectorPaneProps): JSX.Element {
  return (
    <div className="winget-inspector-pane">
      <div className="winget-inspector-header">
        <span className="winget-inspector-title">ℹ️ Package Inspector</span>
        <button type="button" className="shelf-btn shelf-btn-sm" onClick={onCloseInspector}>
          ✕
        </button>
      </div>

      {loadingInspector ? (
        <div className="profile-empty-list">
          Querying <code>winget show {inspectedPkgId}</code>...
        </div>
      ) : !inspectedDetails ? (
        <div className="profile-empty-list">No details found for {inspectedPkgId}.</div>
      ) : (
        <div className="winget-inspector-body">
          <div className="winget-inspector-pkg-name">{inspectedDetails.name}</div>
          <div
            className="winget-inspector-pkg-id"
            onClick={() => handleCopyText(inspectedDetails.id, 'Copied ID')}
            title="Click to copy Package ID"
          >
            {inspectedDetails.id} 📋
          </div>

          <div className="winget-inspector-meta-grid">
            {inspectedDetails.publisher && (
              <div>
                <span className="inspector-label">Publisher:</span>{' '}
                <strong>{inspectedDetails.publisher}</strong>
              </div>
            )}
            {inspectedDetails.license && (
              <div>
                <span className="inspector-label">License:</span>{' '}
                <span>{inspectedDetails.license}</span>
              </div>
            )}
            {inspectedDetails.installerType && (
              <div>
                <span className="inspector-label">Installer:</span>{' '}
                <span className="winget-source-tag">{inspectedDetails.installerType}</span>
              </div>
            )}
          </div>

          {inspectedDetails.description && (
            <div className="winget-inspector-desc">{inspectedDetails.description}</div>
          )}

          <div className="winget-inspector-links">
            {inspectedDetails.homepage && (
              <button
                type="button"
                className="shelf-btn shelf-btn-sm"
                onClick={() => window.api.openExternalUrl?.(inspectedDetails.homepage!)}
              >
                🌐 Homepage
              </button>
            )}
            {inspectedDetails.releaseNotesUrl && (
              <button
                type="button"
                className="shelf-btn shelf-btn-sm"
                onClick={() => window.api.openExternalUrl?.(inspectedDetails.releaseNotesUrl!)}
              >
                📝 Release Notes
              </button>
            )}
            {inspectedDetails.publisherUrl && (
              <button
                type="button"
                className="shelf-btn shelf-btn-sm"
                onClick={() => window.api.openExternalUrl?.(inspectedDetails.publisherUrl!)}
              >
                🏢 Publisher
              </button>
            )}
          </div>

          <div className="winget-inspector-controls">
            <label className="inspector-control-row">
              <span>Target Version:</span>
              <select
                className="winget-inspector-select"
                value={inspectorVersion}
                onChange={(e) => setInspectorVersion(e.target.value)}
              >
                {inspectedDetails.availableVersions.slice(0, 40).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="inspector-control-row">
              <span>Install Scope:</span>
              <select
                className="winget-inspector-select"
                value={inspectorScope}
                onChange={(e) =>
                  setInspectorScope(e.target.value as 'default' | 'user' | 'machine')
                }
              >
                <option value="default">Default</option>
                <option value="user">User (--scope user)</option>
                <option value="machine">Machine (--scope machine)</option>
              </select>
            </label>

            <div className="inspector-checkbox-row">
              <label className="winget-checkbox-pill">
                <input
                  type="checkbox"
                  checked={inspectorInteractive}
                  onChange={(e) => setInspectorInteractive(e.target.checked)}
                />
                <span>Interactive UI</span>
              </label>
              <label className="winget-checkbox-pill">
                <input
                  type="checkbox"
                  checked={inspectorForce}
                  onChange={(e) => setInspectorForce(e.target.checked)}
                />
                <span>Force (--force)</span>
              </label>
            </div>

            <div className="inspector-action-buttons">
              <button
                type="button"
                className="shelf-btn shelf-btn-primary shelf-btn-sm"
                disabled={isOpRunning}
                onClick={(e) =>
                  void handleRunAction({
                    action: 'install',
                    id: inspectedDetails.id,
                    name: inspectedDetails.name,
                    version: inspectorVersion || undefined,
                    scope: inspectorScope,
                    interactive: inspectorInteractive,
                    force: inspectorForce,
                    forceElevated: e.ctrlKey || e.metaKey
                  })
                }
              >
                📥 Install v{inspectorVersion || inspectedDetails.version}
              </button>
              <button
                type="button"
                className="shelf-btn shelf-btn-warning shelf-btn-sm"
                onClick={() =>
                  openPinEditor({
                    id: inspectedDetails.id,
                    name: inspectedDetails.name,
                    version: inspectorVersion || inspectedDetails.version,
                    pinType: 'Gating',
                    pinnedVersion: suggestVersionWildcard(
                      inspectorVersion || inspectedDetails.version
                    )
                  })
                }
              >
                🔒 Gate-Pin Version
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

