import { useState, useMemo, useDeferredValue } from 'react'
import type {
  SystemServiceItem,
  SystemStartupAppItem,
  SystemScheduledTaskItem
} from '../../../shared/types'

export interface ServicesAndTasksPanelProps {
  servicesView: 'services' | 'startup' | 'tasks'
  setServicesView: (view: 'services' | 'startup' | 'tasks') => void
  services: SystemServiceItem[]
  setServices: (services: SystemServiceItem[]) => void
  startupApps: SystemStartupAppItem[]
  scheduledTasks: SystemScheduledTaskItem[]
  setScheduledTasks: (tasks: SystemScheduledTaskItem[]) => void
  loadingServices: boolean
  loadingTasks: boolean
  tasksLoadedOnce: boolean
  elevateByDefault: boolean
  flash: (msg: string) => void
  handleCopyText: (text: string, label?: string) => void
}

export function ServicesAndTasksPanel({
  servicesView,
  setServicesView,
  services,
  setServices,
  startupApps,
  scheduledTasks,
  setScheduledTasks,
  loadingServices,
  loadingTasks,
  tasksLoadedOnce,
  elevateByDefault,
  flash,
  handleCopyText
}: ServicesAndTasksPanelProps): JSX.Element {
  const [serviceFilterChip, setServiceFilterChip] = useState<
    'pinned' | 'running' | 'stopped' | 'all'
  >('pinned')
  const [taskFilterChip, setTaskFilterChip] = useState<
    'custom' | 'ready' | 'disabled' | 'all'
  >('custom')
  const [serviceSearchText, setServiceSearchText] = useState('')
  const [serviceBusyName, setServiceBusyName] = useState<string | null>(null)
  const [taskBusyKey, setTaskBusyKey] = useState<string | null>(null)

  const deferredServiceSearchText = useDeferredValue(serviceSearchText)

  const filteredServices = useMemo(() => {
    let base = services
    if (serviceFilterChip === 'pinned') base = base.filter((s) => s.isPinned)
    else if (serviceFilterChip === 'running') base = base.filter((s) => s.status === 'Running')
    else if (serviceFilterChip === 'stopped') base = base.filter((s) => s.status !== 'Running')
    const q = deferredServiceSearchText.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (s) => s.name.toLowerCase().includes(q) || s.displayName.toLowerCase().includes(q)
    )
  }, [services, serviceFilterChip, deferredServiceSearchText])

  const filteredScheduledTasks = useMemo(() => {
    let base = scheduledTasks
    if (taskFilterChip === 'custom') base = base.filter((t) => !t.isSystemTask)
    else if (taskFilterChip === 'ready')
      base = base.filter((t) => t.state === 'Ready' || t.state === 'Running')
    else if (taskFilterChip === 'disabled') base = base.filter((t) => t.state === 'Disabled')
    const q = deferredServiceSearchText.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.path.toLowerCase().includes(q) ||
        t.author.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    )
  }, [scheduledTasks, taskFilterChip, deferredServiceSearchText])

  return (
    <div className="winget-tab-body">
      <div className="winget-toolbar-row">
        <div className="profile-tabs-bar" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <button
            type="button"
            className={`profile-tab-btn ${servicesView === 'services' ? 'is-active' : ''}`}
            onClick={() => setServicesView('services')}
          >
            <span>⚙️ Windows Services</span>
            <span className="profile-tab-count">{services.length}</span>
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${servicesView === 'startup' ? 'is-active' : ''}`}
            onClick={() => setServicesView('startup')}
          >
            <span>🚀 Startup Apps</span>
            <span className="profile-tab-count">{startupApps.length}</span>
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${servicesView === 'tasks' ? 'is-active' : ''}`}
            onClick={() => setServicesView('tasks')}
          >
            <span>📅 OS Task Scheduler</span>
            {tasksLoadedOnce && (
              <span className="profile-tab-count">{scheduledTasks.length}</span>
            )}
          </button>
        </div>
        {(servicesView === 'services' || servicesView === 'tasks') && (
          <input
            type="text"
            className="winget-filter-input"
            placeholder={
              servicesView === 'services' ? 'Search services...' : 'Search OS scheduled tasks...'
            }
            value={serviceSearchText}
            onChange={(e) => setServiceSearchText(e.target.value)}
          />
        )}
      </div>

      {servicesView === 'services' ? (
        <div className="winget-tab-body">
          <div className="winget-summary-bar">
            <div className="winget-chip-group">
              <button
                type="button"
                className={`winget-filter-chip ${serviceFilterChip === 'pinned' ? 'is-active' : ''}`}
                onClick={() => setServiceFilterChip('pinned')}
              >
                ⭐ Pinned Services ({services.filter((s) => s.isPinned).length})
              </button>
              <button
                type="button"
                className={`winget-filter-chip ${serviceFilterChip === 'running' ? 'is-active' : ''}`}
                onClick={() => setServiceFilterChip('running')}
              >
                🟢 Running ({services.filter((s) => s.status === 'Running').length})
              </button>
              <button
                type="button"
                className={`winget-filter-chip ${serviceFilterChip === 'stopped' ? 'is-active' : ''}`}
                onClick={() => setServiceFilterChip('stopped')}
              >
                🔴 Stopped ({services.filter((s) => s.status !== 'Running').length})
              </button>
              <button
                type="button"
                className={`winget-filter-chip ${serviceFilterChip === 'all' ? 'is-active' : ''}`}
                onClick={() => setServiceFilterChip('all')}
              >
                All ({services.length})
              </button>
            </div>
            <span className="winget-summary-text">{filteredServices.length} shown</span>
          </div>

          <div className="winget-pkg-list">
            {loadingServices && services.length === 0 ? (
              <div className="profile-empty-list">Loading Windows Services...</div>
            ) : filteredServices.length === 0 ? (
              <div className="profile-empty-list">No services match your filter.</div>
            ) : (
              filteredServices.slice(0, 120).map((svc) => {
                const isRunning = svc.status === 'Running'
                const isBusy = serviceBusyName === svc.name
                return (
                  <div key={svc.name} className="winget-pkg-row">
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-sm"
                      style={{ padding: '3px 7px' }}
                      onClick={async () => {
                        const updated = await window.api.togglePinSystemService?.(svc.name)
                        if (updated) setServices(updated)
                      }}
                      title={svc.isPinned ? 'Unpin service' : 'Pin service to Favorites'}
                    >
                      {svc.isPinned ? '⭐' : '☆'}
                    </button>
                    <div className="winget-pkg-main">
                      <div className="winget-pkg-title-row">
                        <span className="winget-pkg-name">{svc.displayName}</span>
                        <button
                          type="button"
                          className="winget-pkg-id-btn"
                          onClick={() => handleCopyText(svc.name, 'Copied Service Name')}
                        >
                          {svc.name}
                        </button>
                        <span
                          className={`winget-badge ${
                            isRunning ? 'winget-badge-installed' : 'winget-badge-blocked'
                          }`}
                        >
                          {isRunning ? '🟢 Running' : '🔴 Stopped'}
                        </span>
                        <span className="winget-source-tag">Startup: {svc.startType}</span>
                      </div>
                    </div>

                    <div className="winget-pkg-actions">
                      {isRunning ? (
                        <>
                          <button
                            type="button"
                            className="shelf-btn shelf-btn-primary shelf-btn-sm"
                            disabled={isBusy}
                            onClick={async (e) => {
                              setServiceBusyName(svc.name)
                              const res = await window.api.runSystemServiceAction?.({
                                name: svc.name,
                                action: 'restart',
                                elevated: e.ctrlKey || e.metaKey || elevateByDefault
                              })
                              setServiceBusyName(null)
                              if (res) {
                                setServices(res.services)
                                flash(res.message)
                              }
                            }}
                          >
                            🔄 Restart
                          </button>
                          <button
                            type="button"
                            className="shelf-btn shelf-btn-danger shelf-btn-sm"
                            disabled={isBusy}
                            onClick={async (e) => {
                              setServiceBusyName(svc.name)
                              const res = await window.api.runSystemServiceAction?.({
                                name: svc.name,
                                action: 'stop',
                                elevated: e.ctrlKey || e.metaKey || elevateByDefault
                              })
                              setServiceBusyName(null)
                              if (res) {
                                setServices(res.services)
                                flash(res.message)
                              }
                            }}
                          >
                            ⏹️ Stop
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-primary shelf-btn-sm"
                          disabled={isBusy}
                          onClick={async (e) => {
                            setServiceBusyName(svc.name)
                            const res = await window.api.runSystemServiceAction?.({
                              name: svc.name,
                              action: 'start',
                              elevated: e.ctrlKey || e.metaKey || elevateByDefault
                            })
                            setServiceBusyName(null)
                            if (res) {
                              setServices(res.services)
                              flash(res.message)
                            }
                          }}
                        >
                          ▶️ Start
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      ) : servicesView === 'startup' ? (
        <div className="winget-pkg-list">
          {startupApps.length === 0 ? (
            <div className="profile-empty-list">No startup entries found.</div>
          ) : (
            startupApps.map((app, idx) => (
              <div key={`${app.location}-${app.name}-${idx}`} className="winget-pkg-row">
                <div className="winget-pkg-main">
                  <div className="winget-pkg-title-row">
                    <span className="winget-pkg-name">{app.name}</span>
                    <span className="winget-source-tag">{app.location}</span>
                  </div>
                  <div className="winget-pkg-meta-row">
                    <span
                      className="winget-ver-current"
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '720px'
                      }}
                    >
                      {app.command}
                    </span>
                  </div>
                </div>
                <div className="winget-pkg-actions">
                  <button
                    type="button"
                    className="shelf-btn shelf-btn-sm"
                    onClick={() => handleCopyText(app.command, 'Copied Startup Command')}
                  >
                    📋 Copy Cmd
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="winget-tab-body">
          <div className="winget-summary-bar">
            <div className="winget-chip-group">
              <button
                type="button"
                className={`winget-filter-chip ${taskFilterChip === 'custom' ? 'is-active' : ''}`}
                onClick={() => setTaskFilterChip('custom')}
              >
                ⚡ User &amp; 3rd-Party ({scheduledTasks.filter((t) => !t.isSystemTask).length})
              </button>
              <button
                type="button"
                className={`winget-filter-chip ${taskFilterChip === 'ready' ? 'is-active' : ''}`}
                onClick={() => setTaskFilterChip('ready')}
              >
                🟢 Ready / Running (
                {
                  scheduledTasks.filter((t) => t.state === 'Ready' || t.state === 'Running').length
                }
                )
              </button>
              <button
                type="button"
                className={`winget-filter-chip ${taskFilterChip === 'disabled' ? 'is-active' : ''}`}
                onClick={() => setTaskFilterChip('disabled')}
              >
                ⏸️ Disabled ({scheduledTasks.filter((t) => t.state === 'Disabled').length})
              </button>
              <button
                type="button"
                className={`winget-filter-chip ${taskFilterChip === 'all' ? 'is-active' : ''}`}
                onClick={() => setTaskFilterChip('all')}
              >
                All ({scheduledTasks.length})
              </button>
            </div>
            <span className="winget-summary-text">{filteredScheduledTasks.length} shown</span>
          </div>

          <div className="winget-pkg-list">
            {loadingTasks && scheduledTasks.length === 0 ? (
              <div className="profile-empty-list">
                Querying Windows Task Scheduler (Get-ScheduledTask)...
              </div>
            ) : filteredScheduledTasks.length === 0 ? (
              <div className="profile-empty-list">No scheduled tasks match your filter.</div>
            ) : (
              filteredScheduledTasks.map((task) => {
                const key = `${task.path}${task.name}`
                const isBusy = taskBusyKey === key
                const isDisabled = task.state === 'Disabled'
                return (
                  <div key={key} className="winget-pkg-row">
                    <div className="winget-pkg-main">
                      <div className="winget-pkg-title-row">
                        <span className="winget-pkg-name">{task.name}</span>
                        <span
                          className={`winget-badge ${
                            task.state === 'Running'
                              ? 'winget-badge-installed'
                              : isDisabled
                                ? 'winget-badge-blocked'
                                : 'winget-badge-pinned'
                          }`}
                        >
                          {task.state}
                        </span>
                        <span className="winget-source-tag">{task.path}</span>
                      </div>
                      <div className="winget-pkg-meta-row">
                        {task.lastRunTime && (
                          <span className="winget-ver-current">Last Run: {task.lastRunTime}</span>
                        )}
                        {task.lastResult && (
                          <span className="winget-source-tag">Result: {task.lastResult}</span>
                        )}
                        {task.nextRunTime && (
                          <span className="winget-ver-current">Next: {task.nextRunTime}</span>
                        )}
                        {task.author && (
                          <span className="winget-source-tag">By: {task.author}</span>
                        )}
                      </div>
                    </div>
                    <div className="winget-pkg-actions">
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-primary shelf-btn-sm"
                        disabled={isBusy || isDisabled}
                        onClick={async (e) => {
                          setTaskBusyKey(key)
                          const res = await window.api.runSystemScheduledTaskAction?.({
                            taskPath: task.path,
                            taskName: task.name,
                            action: 'run',
                            elevated: e.ctrlKey || e.metaKey || elevateByDefault
                          })
                          setTaskBusyKey(null)
                          if (res) {
                            setScheduledTasks(res.tasks)
                            flash(res.message)
                          }
                        }}
                      >
                        ▶️ Run Now
                      </button>
                      <button
                        type="button"
                        className={`shelf-btn shelf-btn-sm ${
                          isDisabled ? 'shelf-btn-primary' : 'shelf-btn-warning'
                        }`}
                        disabled={isBusy}
                        onClick={async (e) => {
                          setTaskBusyKey(key)
                          const res = await window.api.runSystemScheduledTaskAction?.({
                            taskPath: task.path,
                            taskName: task.name,
                            action: isDisabled ? 'enable' : 'disable',
                            elevated: e.ctrlKey || e.metaKey || elevateByDefault
                          })
                          setTaskBusyKey(null)
                          if (res) {
                            setScheduledTasks(res.tasks)
                            flash(res.message)
                          }
                        }}
                      >
                        {isDisabled ? '🟢 Enable' : '⏸️ Disable'}
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

