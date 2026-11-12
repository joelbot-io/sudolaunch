import type { ShortcutsOverlayData } from '../../../shared/types'

export interface DockerContainersControlCenterProps {
  containers: NonNullable<ShortcutsOverlayData['dockerContainers']>
  busyDockerAction: string | null
  handleDockerContainerAction: (
    containerName: string,
    action: 'start' | 'stop' | 'restart' | 'logs' | 'shell' | 'inspect' | 'rm'
  ) => void
}

export function DockerContainersControlCenter({
  containers,
  busyDockerAction,
  handleDockerContainerAction
}: DockerContainersControlCenterProps): JSX.Element {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        background: 'rgba(15, 23, 42, 0.65)',
        border: '1px solid rgba(56, 189, 248, 0.22)',
        marginBottom: 6
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8
        }}
      >
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#38bdf8' }}>
          🐳 Live Docker Containers ({containers.length})
        </span>
        <span style={{ fontSize: 10.5, color: '#64748b' }}>
          Click any container action to execute immediately
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {containers.map((c) => {
          const hostPortMatch = c.ports?.match(/(?:0\.0\.0\.0|127\.0\.0\.1|\[::\]):(\d+)->/)
          const hostPort = hostPortMatch ? hostPortMatch[1] : null
          return (
            <div
              key={c.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '6px 10px',
                borderRadius: 6,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                <span>{c.running ? '🟢' : '⚪'}</span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#f1f5f9',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {c.name}
                </span>
                <span
                  style={{
                    fontSize: 10.5,
                    color: '#94a3b8',
                    fontFamily: 'monospace',
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: 'rgba(255,255,255,0.04)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {c.image}
                </span>
                {c.status && (
                  <span
                    style={{
                      fontSize: 10,
                      color: c.running ? '#34d399' : '#64748b',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {c.status}
                  </span>
                )}
                {c.ports && (
                  <span
                    style={{
                      fontSize: 10,
                      color: '#38bdf8',
                      fontFamily: 'monospace',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {c.ports}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                {c.running && hostPort && (
                  <button
                    type="button"
                    onClick={() => window.api.openExternalUrl?.(`http://localhost:${hostPort}`)}
                    style={{
                      padding: '2px 7px',
                      fontSize: 10,
                      fontWeight: 600,
                      borderRadius: 4,
                      border: '1px solid rgba(96, 165, 250, 0.35)',
                      background: 'rgba(96, 165, 250, 0.14)',
                      color: '#93c5fd',
                      cursor: 'pointer'
                    }}
                    title={`Open http://localhost:${hostPort} in browser`}
                  >
                    🌐 :{hostPort}
                  </button>
                )}
                {c.running ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleDockerContainerAction(c.name, 'shell')}
                      style={{
                        padding: '2px 7px',
                        fontSize: 10,
                        fontWeight: 600,
                        borderRadius: 4,
                        border: '1px solid rgba(16, 185, 129, 0.35)',
                        background: 'rgba(16, 185, 129, 0.14)',
                        color: '#34d399',
                        cursor: 'pointer'
                      }}
                      title="Open interactive sh shell in SudoLaunch Terminal"
                    >
                      &gt;_ Shell
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDockerContainerAction(c.name, 'logs')}
                      style={{
                        padding: '2px 7px',
                        fontSize: 10,
                        fontWeight: 600,
                        borderRadius: 4,
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                        background: 'rgba(56, 189, 248, 0.14)',
                        color: '#38bdf8',
                        cursor: 'pointer'
                      }}
                      title="Tail container logs in SudoLaunch Terminal"
                    >
                      📜 Logs
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDockerContainerAction(c.name, 'inspect')}
                      style={{
                        padding: '2px 7px',
                        fontSize: 10,
                        borderRadius: 4,
                        border: '1px solid rgba(255,255,255,0.14)',
                        background: 'rgba(255,255,255,0.05)',
                        color: '#cbd5e1',
                        cursor: 'pointer'
                      }}
                      title="Inspect container metadata in SudoLaunch Terminal"
                    >
                      🔍 Inspect
                    </button>
                    <button
                      type="button"
                      disabled={busyDockerAction !== null}
                      onClick={() => handleDockerContainerAction(c.name, 'restart')}
                      style={{
                        padding: '2px 7px',
                        fontSize: 10,
                        borderRadius: 4,
                        border: '1px solid rgba(255,255,255,0.14)',
                        background: 'rgba(255,255,255,0.05)',
                        color: '#cbd5e1',
                        cursor: busyDockerAction ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                      title="Restart container"
                    >
                      {busyDockerAction === `${c.name}:restart` ? (
                        <>
                          <span className="sudo-spinner sudo-spinner-sm" /> Restarting…
                        </>
                      ) : (
                        '🔄 Restart'
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={busyDockerAction !== null}
                      onClick={() => handleDockerContainerAction(c.name, 'stop')}
                      style={{
                        padding: '2px 7px',
                        fontSize: 10,
                        borderRadius: 4,
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        background: 'rgba(239, 68, 68, 0.14)',
                        color: '#f87171',
                        cursor: busyDockerAction ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                      title="Stop container"
                    >
                      {busyDockerAction === `${c.name}:stop` ? (
                        <>
                          <span className="sudo-spinner sudo-spinner-sm" /> Stopping…
                        </>
                      ) : (
                        '⏹ Stop'
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busyDockerAction !== null}
                      onClick={() => handleDockerContainerAction(c.name, 'start')}
                      style={{
                        padding: '2px 8px',
                        fontSize: 10,
                        fontWeight: 600,
                        borderRadius: 4,
                        border: '1px solid rgba(16, 185, 129, 0.35)',
                        background: 'rgba(16, 185, 129, 0.14)',
                        color: '#34d399',
                        cursor: busyDockerAction ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                      title="Start container"
                    >
                      {busyDockerAction === `${c.name}:start` ? (
                        <>
                          <span className="sudo-spinner sudo-spinner-sm" /> Starting…
                        </>
                      ) : (
                        '▶ Start'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDockerContainerAction(c.name, 'logs')}
                      style={{
                        padding: '2px 7px',
                        fontSize: 10,
                        borderRadius: 4,
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                        background: 'rgba(56, 189, 248, 0.14)',
                        color: '#38bdf8',
                        cursor: 'pointer'
                      }}
                      title="View container logs in SudoLaunch Terminal"
                    >
                      📜 Logs
                    </button>
                    <button
                      type="button"
                      disabled={busyDockerAction !== null}
                      onClick={() => handleDockerContainerAction(c.name, 'rm')}
                      style={{
                        padding: '2px 7px',
                        fontSize: 10,
                        borderRadius: 4,
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        background: 'rgba(239, 68, 68, 0.14)',
                        color: '#f87171',
                        cursor: busyDockerAction ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                      title="Remove stopped container (docker rm)"
                    >
                      {busyDockerAction === `${c.name}:rm` ? (
                        <>
                          <span className="sudo-spinner sudo-spinner-sm" /> Removing…
                        </>
                      ) : (
                        '🗑️ Remove'
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
