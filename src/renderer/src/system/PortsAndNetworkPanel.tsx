import { useState, useMemo, useDeferredValue } from 'react'
import type {
  SystemPortItem,
  SystemProcessItem,
  SystemHostEntryItem,
  SystemNetworkAdapterItem
} from '../../../shared/types'

export interface PortsAndNetworkPanelProps {
  portsView: 'ports' | 'processes' | 'hosts' | 'network'
  setPortsView: (view: 'ports' | 'processes' | 'hosts' | 'network') => void
  ports: SystemPortItem[]
  processes: SystemProcessItem[]
  hostEntries: SystemHostEntryItem[]
  setHostEntries: (entries: SystemHostEntryItem[]) => void
  networkAdapters: SystemNetworkAdapterItem[]
  loadingPorts: boolean
  elevateByDefault: boolean
  flash: (msg: string) => void
  handleCopyText: (text: string, label?: string) => void
  loadPortsAndProcesses: () => Promise<void>
}

export function PortsAndNetworkPanel({
  portsView,
  setPortsView,
  ports,
  processes,
  hostEntries,
  setHostEntries,
  networkAdapters,
  loadingPorts,
  elevateByDefault,
  flash,
  handleCopyText,
  loadPortsAndProcesses
}: PortsAndNetworkPanelProps): JSX.Element {
  const [portFilterChip, setPortFilterChip] = useState<'dev' | 'all'>('dev')
  const [portSearchText, setPortSearchText] = useState('')
  const [processSortBy, setProcessSortBy] = useState<'memory' | 'cpu'>('memory')
  const [confirmKillPid, setConfirmKillPid] = useState<number | null>(null)
  const [newHostIp, setNewHostIp] = useState('127.0.0.1')
  const [newHostName, setNewHostName] = useState('')
  const [newHostComment, setNewHostComment] = useState('')
  const [hostBusy, setHostBusy] = useState(false)

  const deferredPortSearchText = useDeferredValue(portSearchText)

  const filteredPorts = useMemo(() => {
    let base = ports
    if (portFilterChip === 'dev') base = base.filter((p) => p.isCommonDevPort)
    const q = deferredPortSearchText.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (p) =>
        String(p.port).includes(q) ||
        p.processName.toLowerCase().includes(q) ||
        String(p.pid).includes(q)
    )
  }, [ports, portFilterChip, deferredPortSearchText])

  const filteredProcesses = useMemo(() => {
    const q = deferredPortSearchText.trim().toLowerCase()
    const base = q
      ? processes.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            String(p.pid).includes(q) ||
            (p.windowTitle && p.windowTitle.toLowerCase().includes(q))
        )
      : processes
    return [...base].sort((a, b) =>
      processSortBy === 'memory' ? b.memoryMb - a.memoryMb : b.cpuSec - a.cpuSec
    )
  }, [processes, deferredPortSearchText, processSortBy])

  return (
    <div className="winget-tab-body">
      <div className="winget-toolbar-row">
        <div className="profile-tabs-bar" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <button
            type="button"
            className={`profile-tab-btn ${portsView === 'ports' ? 'is-active' : ''}`}
            onClick={() => setPortsView('ports')}
          >
            <span>🔌 Listening TCP Ports</span>
            <span className="profile-tab-count">{ports.length}</span>
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${portsView === 'processes' ? 'is-active' : ''}`}
            onClick={() => setPortsView('processes')}
          >
            <span>📊 Top Processes</span>
            <span className="profile-tab-count">{processes.length}</span>
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${portsView === 'hosts' ? 'is-active' : ''}`}
            onClick={() => setPortsView('hosts')}
          >
            <span>📝 Hosts File</span>
            <span className="profile-tab-count">{hostEntries.length}</span>
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${portsView === 'network' ? 'is-active' : ''}`}
            onClick={() => setPortsView('network')}
          >
            <span>🌐 Network &amp; DNS</span>
            <span className="profile-tab-count">{networkAdapters.length}</span>
          </button>
        </div>
        {(portsView === 'ports' || portsView === 'processes') && (
          <input
            type="text"
            className="winget-filter-input"
            placeholder={
              portsView === 'ports'
                ? 'Filter port (e.g. 3000) or process...'
                : 'Filter process name or PID...'
            }
            value={portSearchText}
            onChange={(e) => setPortSearchText(e.target.value)}
          />
        )}
      </div>

      {portsView === 'ports' ? (
        <div className="winget-tab-body">
          <div className="winget-summary-bar">
            <div className="winget-chip-group">
              <button
                type="button"
                className={`winget-filter-chip ${portFilterChip === 'dev' ? 'is-active' : ''}`}
                onClick={() => setPortFilterChip('dev')}
              >
                ⚡ Dev &amp; Web Ports ({ports.filter((p) => p.isCommonDevPort).length})
              </button>
              <button
                type="button"
                className={`winget-filter-chip ${portFilterChip === 'all' ? 'is-active' : ''}`}
                onClick={() => setPortFilterChip('all')}
              >
                All Listening Ports ({ports.length})
              </button>
            </div>
            <span className="winget-summary-text">{filteredPorts.length} shown</span>
          </div>

          <div className="winget-pkg-list">
            {loadingPorts && ports.length === 0 ? (
              <div className="profile-empty-list">Scanning active TCP listening ports...</div>
            ) : filteredPorts.length === 0 ? (
              <div className="profile-empty-list">No listening ports match your filter.</div>
            ) : (
              filteredPorts.map((p) => (
                <div key={`${p.port}-${p.pid}`} className="winget-pkg-row">
                  <div className="winget-pkg-main">
                    <div className="winget-pkg-title-row">
                      <span className="winget-badge winget-badge-installed">:{p.port}</span>
                      <span className="winget-pkg-name">{p.processName}</span>
                      <button
                        type="button"
                        className="winget-pkg-id-btn"
                        onClick={() => handleCopyText(String(p.pid), 'Copied PID')}
                      >
                        PID {p.pid}
                      </button>
                      {p.memoryMb !== undefined && (
                        <span className="winget-source-tag">{p.memoryMb} MB</span>
                      )}
                      <span className="winget-source-tag">{p.localAddress}</span>
                    </div>
                  </div>
                  <div className="winget-pkg-actions">
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-sm"
                      onClick={() => window.api.openExternalUrl?.(`http://localhost:${p.port}`)}
                    >
                      🌐 localhost:{p.port}
                    </button>
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-sm"
                      onClick={async () => {
                        const res = await window.api.runSystemNetworkAction?.({
                          action: 'allow-port-firewall',
                          port: p.port
                        })
                        if (res?.message) flash(res.message)
                      }}
                      title={`Add Windows Defender Firewall inbound allow rule for TCP port ${p.port} (UAC)`}
                    >
                      🧱 Allow Firewall
                    </button>
                    <button
                      type="button"
                      className={`shelf-btn shelf-btn-sm ${
                        confirmKillPid === p.pid ? 'shelf-btn-danger' : ''
                      }`}
                      onClick={async (e) => {
                        if (confirmKillPid !== p.pid) {
                          setConfirmKillPid(p.pid)
                          setTimeout(
                            () => setConfirmKillPid((cur) => (cur === p.pid ? null : cur)),
                            4000
                          )
                          return
                        }
                        setConfirmKillPid(null)
                        const res = await window.api.killSystemProcess?.(
                          p.pid,
                          e.ctrlKey || e.metaKey || elevateByDefault
                        )
                        if (res) {
                          flash(res.message)
                          void loadPortsAndProcesses()
                        }
                      }}
                    >
                      {confirmKillPid === p.pid ? '⚠️ Confirm Kill?' : '🛑 Kill Process'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : portsView === 'processes' ? (
        <div className="winget-tab-body">
          <div className="winget-summary-bar">
            <div className="winget-chip-group">
              <button
                type="button"
                className={`winget-filter-chip ${processSortBy === 'memory' ? 'is-active' : ''}`}
                onClick={() => setProcessSortBy('memory')}
              >
                Sort by Memory (MB)
              </button>
              <button
                type="button"
                className={`winget-filter-chip ${processSortBy === 'cpu' ? 'is-active' : ''}`}
                onClick={() => setProcessSortBy('cpu')}
              >
                Sort by CPU Time (s)
              </button>
            </div>
          </div>

          <div className="winget-pkg-list">
            {filteredProcesses.map((proc) => (
              <div key={proc.pid} className="winget-pkg-row">
                <div className="winget-pkg-main">
                  <div className="winget-pkg-title-row">
                    <span className="winget-pkg-name">{proc.name}</span>
                    <button
                      type="button"
                      className="winget-pkg-id-btn"
                      onClick={() => handleCopyText(String(proc.pid), 'Copied PID')}
                    >
                      PID {proc.pid}
                    </button>
                    <span className="winget-badge winget-badge-pinned">
                      {proc.memoryMb} MB RAM
                    </span>
                    <span className="winget-source-tag">{proc.cpuSec}s CPU</span>
                  </div>
                  {proc.windowTitle && (
                    <div className="winget-pkg-meta-row">
                      <span className="winget-ver-current">{proc.windowTitle}</span>
                    </div>
                  )}
                </div>
                <div className="winget-pkg-actions">
                  {proc.path && (
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-sm"
                      onClick={() => window.api.revealPathInExplorer?.(proc.path!)}
                    >
                      📂 Reveal
                    </button>
                  )}
                  <button
                    type="button"
                    className={`shelf-btn shelf-btn-sm ${
                      confirmKillPid === proc.pid ? 'shelf-btn-danger' : ''
                    }`}
                    onClick={async (e) => {
                      if (confirmKillPid !== proc.pid) {
                        setConfirmKillPid(proc.pid)
                        setTimeout(
                          () => setConfirmKillPid((cur) => (cur === proc.pid ? null : cur)),
                          4000
                        )
                        return
                      }
                      setConfirmKillPid(null)
                      const res = await window.api.killSystemProcess?.(
                        proc.pid,
                        e.ctrlKey || e.metaKey || elevateByDefault
                      )
                      if (res) {
                        flash(res.message)
                        void loadPortsAndProcesses()
                      }
                    }}
                  >
                    {confirmKillPid === proc.pid ? '⚠️ Confirm?' : '🛑 Kill'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : portsView === 'hosts' ? (
        <div className="winget-tab-body">
          <div className="winget-search-bar-row">
            <input
              type="text"
              className="winget-filter-input"
              style={{ width: 150 }}
              placeholder="IP (127.0.0.1)"
              value={newHostIp}
              onChange={(e) => setNewHostIp(e.target.value)}
            />
            <input
              type="text"
              className="winget-search-input"
              style={{ flex: 1 }}
              placeholder="Hostname (e.g. api.local.dev or staging.internal)..."
              value={newHostName}
              onChange={(e) => setNewHostName(e.target.value)}
            />
            <input
              type="text"
              className="winget-filter-input"
              style={{ width: 180 }}
              placeholder="Optional # comment"
              value={newHostComment}
              onChange={(e) => setNewHostComment(e.target.value)}
            />
            <button
              type="button"
              className="shelf-btn shelf-btn-primary shelf-btn-sm"
              disabled={hostBusy || !newHostName.trim()}
              onClick={async () => {
                setHostBusy(true)
                const res = await window.api.saveSystemHostEntry?.({
                  action: 'add',
                  ip: newHostIp.trim() || '127.0.0.1',
                  hostname: newHostName.trim(),
                  comment: newHostComment.trim()
                })
                setHostBusy(false)
                if (res) {
                  setHostEntries(res.entries)
                  if (res.success) {
                    setNewHostName('')
                    setNewHostComment('')
                  }
                  flash(res.message)
                }
              }}
            >
              ➕ Add Mapping (UAC)
            </button>
            <button
              type="button"
              className="shelf-btn shelf-btn-sm"
              onClick={async () => {
                const res = await window.api.runSystemNetworkAction?.({
                  action: 'open-hosts-folder'
                })
                if (res?.message) flash(res.message)
              }}
            >
              📂 Open etc\hosts
            </button>
          </div>

          <div className="winget-pkg-list">
            {hostEntries.length === 0 ? (
              <div className="profile-empty-list">
                No custom host mappings found in C:\Windows\System32\drivers\etc\hosts. Add a local
                domain above!
              </div>
            ) : (
              hostEntries.map((h) => (
                <div key={`${h.lineIndex}-${h.hostname}`} className="winget-pkg-row">
                  <div className="winget-pkg-main">
                    <div className="winget-pkg-title-row">
                      <span
                        className={`winget-badge ${
                          h.enabled ? 'winget-badge-installed' : 'winget-badge-blocked'
                        }`}
                      >
                        {h.enabled ? '🟢 Active' : '⚪ Commented (#)'}
                      </span>
                      <span
                        className="winget-pkg-name"
                        style={{ fontFamily: 'Cascadia Mono, Consolas, monospace' }}
                      >
                        {h.hostname}
                      </span>
                      <span className="winget-source-tag">→ {h.ip}</span>
                      {h.comment && <span className="winget-ver-current"># {h.comment}</span>}
                    </div>
                  </div>
                  <div className="winget-pkg-actions">
                    <button
                      type="button"
                      className={`shelf-btn shelf-btn-sm ${
                        h.enabled ? 'shelf-btn-warning' : 'shelf-btn-primary'
                      }`}
                      disabled={hostBusy}
                      onClick={async () => {
                        setHostBusy(true)
                        const res = await window.api.saveSystemHostEntry?.({
                          action: 'toggle',
                          lineIndex: h.lineIndex
                        })
                        setHostBusy(false)
                        if (res) {
                          setHostEntries(res.entries)
                          flash(res.message)
                        }
                      }}
                    >
                      {h.enabled ? '⏸️ Disable' : '🟢 Enable'}
                    </button>
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-danger shelf-btn-sm"
                      disabled={hostBusy}
                      onClick={async () => {
                        setHostBusy(true)
                        const res = await window.api.saveSystemHostEntry?.({
                          action: 'delete',
                          lineIndex: h.lineIndex
                        })
                        setHostBusy(false)
                        if (res) {
                          setHostEntries(res.entries)
                          flash(res.message)
                        }
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="winget-tab-body">
          <div className="winget-summary-bar">
            <span className="winget-summary-text">
              🌐 Active Network Interfaces ({networkAdapters.length})
            </span>
            <div className="winget-summary-actions">
              <button
                type="button"
                className="shelf-btn shelf-btn-primary shelf-btn-sm"
                onClick={async () => {
                  const res = await window.api.runSystemNetworkAction?.({
                    action: 'flush-dns'
                  })
                  if (res?.message) flash(res.message)
                }}
              >
                ⚡ Flush DNS Cache (ipconfig /flushdns)
              </button>
              <button
                type="button"
                className="shelf-btn shelf-btn-warning shelf-btn-sm"
                onClick={async () => {
                  const res = await window.api.runSystemNetworkAction?.({
                    action: 'reset-winsock'
                  })
                  if (res?.message) flash(res.message)
                }}
              >
                🔄 Reset Winsock &amp; TCP Stack (UAC)
              </button>
            </div>
          </div>

          <div className="winget-pkg-list">
            {networkAdapters.length === 0 ? (
              <div className="profile-empty-list">Loading active network adapters...</div>
            ) : (
              networkAdapters.map((nic) => (
                <div key={nic.name} className="winget-pkg-row">
                  <div className="winget-pkg-main">
                    <div className="winget-pkg-title-row">
                      <span className="winget-badge winget-badge-installed">{nic.status}</span>
                      <span className="winget-pkg-name">{nic.name}</span>
                      <span className="winget-source-tag">{nic.description}</span>
                    </div>
                    <div className="winget-pkg-meta-row">
                      {nic.ipv4 && (
                        <span
                          className="winget-ver-current"
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleCopyText(nic.ipv4, 'Copied IPv4')}
                        >
                          IPv4: <strong>{nic.ipv4}</strong> 📋
                        </span>
                      )}
                      {nic.gateway && <span className="winget-source-tag">GW: {nic.gateway}</span>}
                      {nic.macAddress && (
                        <span className="winget-source-tag">MAC: {nic.macAddress}</span>
                      )}
                      <span className="winget-source-tag">
                        DNS: {nic.dnsServers.length > 0 ? nic.dnsServers.join(', ') : 'Auto'}
                      </span>
                    </div>
                  </div>
                  <div className="winget-pkg-actions">
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-sm"
                      onClick={async () => {
                        const res = await window.api.runSystemNetworkAction?.({
                          action: 'set-dns',
                          adapterName: nic.name,
                          dnsPreset: 'cloudflare'
                        })
                        if (res?.message) flash(res.message)
                        setTimeout(() => void loadPortsAndProcesses(), 1600)
                      }}
                      title="Set DNS to Cloudflare 1.1.1.1 / 1.0.0.1 (UAC)"
                    >
                      ☁️ 1.1.1.1
                    </button>
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-sm"
                      onClick={async () => {
                        const res = await window.api.runSystemNetworkAction?.({
                          action: 'set-dns',
                          adapterName: nic.name,
                          dnsPreset: 'google'
                        })
                        if (res?.message) flash(res.message)
                        setTimeout(() => void loadPortsAndProcesses(), 1600)
                      }}
                      title="Set DNS to Google 8.8.8.8 / 8.8.4.4 (UAC)"
                    >
                      🔍 8.8.8.8
                    </button>
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-sm"
                      onClick={async () => {
                        const res = await window.api.runSystemNetworkAction?.({
                          action: 'set-dns',
                          adapterName: nic.name,
                          dnsPreset: 'quad9'
                        })
                        if (res?.message) flash(res.message)
                        setTimeout(() => void loadPortsAndProcesses(), 1600)
                      }}
                      title="Set DNS to Quad9 Security 9.9.9.9 (UAC)"
                    >
                      🛡️ 9.9.9.9
                    </button>
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-sm"
                      onClick={async () => {
                        const res = await window.api.runSystemNetworkAction?.({
                          action: 'set-dns',
                          adapterName: nic.name,
                          dnsPreset: 'dhcp'
                        })
                        if (res?.message) flash(res.message)
                        setTimeout(() => void loadPortsAndProcesses(), 1600)
                      }}
                      title="Reset DNS servers to automatic DHCP (UAC)"
                    >
                      🔄 DHCP
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

