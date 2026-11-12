import { useState, useMemo, useDeferredValue } from 'react'
import type {
  ScheduledJobItem,
  ScheduledJobInput,
  ScheduledJobPreset,
  ScheduledJobTriggerType,
  ScheduledJobActionType,
  ScheduledJobNotifyMode
} from '../../../shared/types'

export interface ScheduledJobsCategoryPanelProps {
  scheduledJobs: ScheduledJobItem[]
  setScheduledJobs: (jobs: ScheduledJobItem[]) => void
  jobPresets: ScheduledJobPreset[]
  loadingJobs: boolean
  flash: (msg: string) => void
}

export function ScheduledJobsCategoryPanel({
  scheduledJobs,
  setScheduledJobs,
  jobPresets,
  loadingJobs,
  flash
}: ScheduledJobsCategoryPanelProps): JSX.Element {
  const [searchText, setSearchText] = useState('')
  const deferredSearchText = useDeferredValue(searchText)

  const [jobFilterChip, setJobFilterChip] = useState<
    'all' | 'enabled' | 'cron' | 'events' | 'custom'
  >('all')
  const [jobBusyId, setJobBusyId] = useState<string | null>(null)
  const [expandedJobLogIds, setExpandedJobLogIds] = useState<Set<string>>(new Set())
  const [showJobForm, setShowJobForm] = useState(false)
  const [editingJobId, setEditingJobId] = useState<string | null>(null)
  const [jobFormName, setJobFormName] = useState('')
  const [jobFormDesc, setJobFormDesc] = useState('')
  const [jobFormTrigger, setJobFormTrigger] = useState<ScheduledJobTriggerType>('cron')
  const [jobFormSchedule, setJobFormSchedule] = useState('0 * * * *')
  const [jobFormActionType, setJobFormActionType] = useState<ScheduledJobActionType>('powershell')
  const [jobFormCommand, setJobFormCommand] = useState('')
  const [jobFormCwd, setJobFormCwd] = useState('')
  const [jobFormElevated, setJobFormElevated] = useState(false)
  const [jobFormNotify, setJobFormNotify] = useState<ScheduledJobNotifyMode>('error')
  const [jobFormEnabled, setJobFormEnabled] = useState(true)

  const filteredScheduledJobs = useMemo(() => {
    let base = scheduledJobs
    if (jobFilterChip === 'enabled') {
      base = base.filter((j) => j.enabled)
    } else if (jobFilterChip === 'cron') {
      base = base.filter((j) => j.triggerType === 'cron' || j.triggerType === 'interval')
    } else if (jobFilterChip === 'events') {
      base = base.filter(
        (j) =>
          j.triggerType === 'startup' ||
          j.triggerType === 'unlock' ||
          j.triggerType === 'resume' ||
          j.triggerType === 'network-change'
      )
    } else if (jobFilterChip === 'custom') {
      base = base.filter((j) => j.source === 'custom-command')
    }
    const q = deferredSearchText.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (j) =>
        j.name.toLowerCase().includes(q) ||
        (j.description && j.description.toLowerCase().includes(q)) ||
        j.command.toLowerCase().includes(q) ||
        j.scheduleSummary.toLowerCase().includes(q)
    )
  }, [scheduledJobs, jobFilterChip, deferredSearchText])

  function openNewJobForm(preset?: ScheduledJobPreset): void {
    setEditingJobId(null)
    if (preset) {
      setJobFormName(preset.name)
      setJobFormDesc(preset.description)
      setJobFormTrigger(preset.suggestedTriggerType)
      setJobFormSchedule(preset.suggestedSchedule)
      setJobFormActionType(preset.actionType)
      setJobFormCommand(preset.command)
      setJobFormCwd('')
      setJobFormElevated(false)
      setJobFormNotify('error')
      setJobFormEnabled(true)
    } else {
      setJobFormName('')
      setJobFormDesc('')
      setJobFormTrigger('cron')
      setJobFormSchedule('0 * * * *')
      setJobFormActionType('powershell')
      setJobFormCommand('')
      setJobFormCwd('')
      setJobFormElevated(false)
      setJobFormNotify('error')
      setJobFormEnabled(true)
    }
    setShowJobForm(true)
  }

  function openEditJobForm(job: ScheduledJobItem): void {
    setEditingJobId(job.id)
    setJobFormName(job.name)
    setJobFormDesc(job.description || '')
    setJobFormTrigger(job.triggerType)
    setJobFormSchedule(job.schedule || '0 * * * *')
    setJobFormActionType(job.actionType)
    setJobFormCommand(job.command)
    setJobFormCwd(job.cwd || '')
    setJobFormElevated(Boolean(job.elevated))
    setJobFormNotify(job.notifyOn)
    setJobFormEnabled(job.enabled)
    setShowJobForm(true)
  }

  async function handleSaveScheduledJob(runImmediately = false): Promise<void> {
    if (!jobFormName.trim() || !jobFormCommand.trim()) {
      flash('Job Name and Command / Script Path are required')
      return
    }
    const payload: ScheduledJobInput = {
      id: editingJobId || undefined,
      name: jobFormName.trim(),
      description: jobFormDesc.trim() || undefined,
      enabled: jobFormEnabled,
      triggerType: jobFormTrigger,
      schedule: jobFormSchedule.trim(),
      actionType: jobFormActionType,
      command: jobFormCommand.trim(),
      cwd: jobFormCwd.trim() || undefined,
      elevated: jobFormElevated,
      notifyOn: jobFormNotify,
      runImmediately
    }
    const updatedJobs = await window.api.saveScheduledJob?.(payload)
    if (updatedJobs) {
      setScheduledJobs(updatedJobs)
      setShowJobForm(false)
      setEditingJobId(null)
      flash(
        runImmediately
          ? `Saved and triggered "${payload.name}"`
          : `Saved scheduled job "${payload.name}"`
      )
    }
  }

  return (
    <div className="winget-tab-body">
      <div className="winget-toolbar-row">
        <div className="profile-tabs-bar" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <button type="button" className="profile-tab-btn is-active">
            <span>⏰ SudoLaunch Cron &amp; Scheduled Jobs</span>
            <span className="profile-tab-count">
              {scheduledJobs.filter((j) => j.enabled).length}/{scheduledJobs.length}
            </span>
          </button>
        </div>
        <input
          type="text"
          className="winget-filter-input"
          placeholder="Search SudoLaunch jobs..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      <div className="winget-tab-body">
        <div className="winget-summary-bar">
          <div className="winget-chip-group">
            <button
              type="button"
              className={`winget-filter-chip ${jobFilterChip === 'all' ? 'is-active' : ''}`}
              onClick={() => setJobFilterChip('all')}
            >
              All ({scheduledJobs.length})
            </button>
            <button
              type="button"
              className={`winget-filter-chip ${jobFilterChip === 'enabled' ? 'is-active' : ''}`}
              onClick={() => setJobFilterChip('enabled')}
            >
              🟢 Enabled ({scheduledJobs.filter((j) => j.enabled).length})
            </button>
            <button
              type="button"
              className={`winget-filter-chip ${jobFilterChip === 'cron' ? 'is-active' : ''}`}
              onClick={() => setJobFilterChip('cron')}
            >
              ⏱️ Cron &amp; Interval (
              {
                scheduledJobs.filter(
                  (j) => j.triggerType === 'cron' || j.triggerType === 'interval'
                ).length
              }
              )
            </button>
            <button
              type="button"
              className={`winget-filter-chip ${jobFilterChip === 'events' ? 'is-active' : ''}`}
              onClick={() => setJobFilterChip('events')}
            >
              ⚡ Lifecycle Events (
              {
                scheduledJobs.filter(
                  (j) =>
                    j.triggerType === 'startup' ||
                    j.triggerType === 'unlock' ||
                    j.triggerType === 'resume' ||
                    j.triggerType === 'network-change'
                ).length
              }
              )
            </button>
            <button
              type="button"
              className={`winget-filter-chip ${jobFilterChip === 'custom' ? 'is-active' : ''}`}
              onClick={() => setJobFilterChip('custom')}
            >
              🧩 Custom Commands ({scheduledJobs.filter((j) => j.source === 'custom-command').length})
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="winget-summary-text">{filteredScheduledJobs.length} shown</span>
            <button
              type="button"
              className="shelf-btn shelf-btn-primary shelf-btn-sm"
              onClick={() => {
                if (showJobForm && !editingJobId) {
                  setShowJobForm(false)
                } else {
                  openNewJobForm()
                }
              }}
            >
              {showJobForm && !editingJobId ? '✕ Cancel' : '＋ New Scheduled Job'}
            </button>
          </div>
        </div>

        {showJobForm && (
          <div
            className="winget-pkg-row"
            style={{
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: '10px',
              padding: '12px 14px',
              marginBottom: '8px',
              border: '1px solid rgba(99, 179, 237, 0.35)',
              background: 'rgba(20, 28, 42, 0.72)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="winget-pkg-name">
                {editingJobId ? '✏️ Edit Scheduled Job' : '⏰ Create SudoLaunch Scheduled Job'}
              </span>
              <button
                type="button"
                className="shelf-btn shelf-btn-sm"
                onClick={() => {
                  setShowJobForm(false)
                  setEditingJobId(null)
                }}
              >
                ✕ Close
              </button>
            </div>

            {!editingJobId && jobPresets.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="winget-summary-text" style={{ fontSize: '11px' }}>
                  Quick Fill from Maintenance Scripts (`~/.sudolaunch/maintenance`), Custom Commands,
                  or Templates:
                </span>
                <div className="winget-chip-group" style={{ flexWrap: 'wrap' }}>
                  {jobPresets.slice(0, 10).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="winget-filter-chip"
                      onClick={() => openNewJobForm(preset)}
                      title={preset.description}
                    >
                      {preset.icon} {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <input
                type="text"
                className="winget-filter-input"
                style={{ width: '100%' }}
                placeholder="Job Name (e.g. Daily Repo Fetch)"
                value={jobFormName}
                onChange={(e) => setJobFormName(e.target.value)}
              />
              <input
                type="text"
                className="winget-filter-input"
                style={{ width: '100%' }}
                placeholder="Optional description..."
                value={jobFormDesc}
                onChange={(e) => setJobFormDesc(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 180px', gap: '8px' }}>
              <select
                className="winget-filter-input"
                style={{ width: '100%' }}
                value={jobFormTrigger}
                onChange={(e) => {
                  const next = e.target.value as ScheduledJobTriggerType
                  setJobFormTrigger(next)
                  if (next === 'interval' && !/^\d+$/.test(jobFormSchedule)) {
                    setJobFormSchedule('30')
                  } else if (next === 'cron' && /^\d+$/.test(jobFormSchedule)) {
                    setJobFormSchedule('0 * * * *')
                  }
                }}
              >
                <option value="cron">⏱️ Cron Expression</option>
                <option value="interval">🔄 Fixed Interval (min)</option>
                <option value="startup">🚀 On SudoLaunch Startup</option>
                <option value="unlock">🔓 On Workstation Unlock</option>
                <option value="resume">⚡ On Wake from Sleep</option>
                <option value="network-change">🌐 On Network / IP Change</option>
              </select>

              {jobFormTrigger === 'cron' || jobFormTrigger === 'interval' ? (
                <input
                  type="text"
                  className="winget-filter-input"
                  style={{ width: '100%' }}
                  placeholder={
                    jobFormTrigger === 'cron'
                      ? '5-field cron (e.g. */15 * * * * or 0 9 * * 1-5 or @daily)'
                      : 'Interval in minutes (e.g. 15, 60, 240)'
                  }
                  value={jobFormSchedule}
                  onChange={(e) => setJobFormSchedule(e.target.value)}
                />
              ) : (
                <div
                  className="winget-source-tag"
                  style={{ display: 'flex', alignItems: 'center', padding: '0 10px' }}
                >
                  Triggered automatically on system event: {jobFormTrigger}
                </div>
              )}

              <select
                className="winget-filter-input"
                style={{ width: '100%' }}
                value={jobFormActionType}
                onChange={(e) => setJobFormActionType(e.target.value as ScheduledJobActionType)}
              >
                <option value="powershell">⚡ PowerShell Command</option>
                <option value="script">📜 Script File (.ps1 / .py / .bat)</option>
                <option value="terminal">&gt;_ Visible SudoLaunch Terminal</option>
              </select>
            </div>

            {jobFormTrigger === 'cron' && (
              <div className="winget-chip-group" style={{ flexWrap: 'wrap' }}>
                {[
                  { label: 'Every 5m', expr: '*/5 * * * *' },
                  { label: 'Every 15m', expr: '*/15 * * * *' },
                  { label: 'Every 30m', expr: '*/30 * * * *' },
                  { label: 'Hourly', expr: '0 * * * *' },
                  { label: 'Weekdays 9 AM', expr: '0 9 * * 1-5' },
                  { label: 'Daily Midnight', expr: '0 0 * * *' }
                ].map((p) => (
                  <button
                    key={p.expr}
                    type="button"
                    className={`winget-filter-chip ${jobFormSchedule.trim() === p.expr ? 'is-active' : ''}`}
                    onClick={() => setJobFormSchedule(p.expr)}
                  >
                    {p.label} ({p.expr})
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
              <input
                type="text"
                className="winget-filter-input"
                style={{ width: '100%', fontFamily: 'monospace' }}
                placeholder={
                  jobFormActionType === 'script'
                    ? 'Path to .ps1 / .py / .cmd script (and optional args)'
                    : 'PowerShell command or script block to execute...'
                }
                value={jobFormCommand}
                onChange={(e) => setJobFormCommand(e.target.value)}
              />
              <input
                type="text"
                className="winget-filter-input"
                style={{ width: '100%', fontFamily: 'monospace' }}
                placeholder="Working directory (optional cwd)"
                value={jobFormCwd}
                onChange={(e) => setJobFormCwd(e.target.value)}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={jobFormEnabled}
                    onChange={(e) => setJobFormEnabled(e.target.checked)}
                  />
                  <span>Enabled immediately</span>
                </label>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={jobFormElevated}
                    onChange={(e) => setJobFormElevated(e.target.checked)}
                  />
                  <span>🛡️ Run Elevated (Admin)</span>
                </label>
                <select
                  className="winget-filter-input"
                  style={{ width: '185px', padding: '4px 8px' }}
                  value={jobFormNotify}
                  onChange={(e) => setJobFormNotify(e.target.value as ScheduledJobNotifyMode)}
                >
                  <option value="error">🔔 Notify on Error Only</option>
                  <option value="always">🔔 Notify on Every Run</option>
                  <option value="never">🔕 Silent (No Toast)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="shelf-btn shelf-btn-sm"
                  onClick={() => void handleSaveScheduledJob(true)}
                >
                  💾 Save &amp; Run Now
                </button>
                <button
                  type="button"
                  className="shelf-btn shelf-btn-primary shelf-btn-sm"
                  onClick={() => void handleSaveScheduledJob(false)}
                >
                  💾 Save Job
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="winget-pkg-list">
          {loadingJobs && scheduledJobs.length === 0 ? (
            <div className="profile-empty-list">Loading SudoLaunch Scheduled Jobs...</div>
          ) : filteredScheduledJobs.length === 0 ? (
            <div className="profile-empty-list">
              No scheduled jobs match your filter. Click &ldquo;＋ New Scheduled Job&rdquo; or add a{' '}
              <code>&quot;Schedule&quot;: &quot;0 * * * *&quot;</code> field to any{' '}
              <code>~/.sudolaunch/commands/*.json</code> file.
            </div>
          ) : (
            filteredScheduledJobs.map((job) => {
              const isRunning = job.status === 'running'
              const isBusy = jobBusyId === job.id
              const logsOpen = expandedJobLogIds.has(job.id)
              return (
                <div
                  key={job.id}
                  className="winget-pkg-row"
                  style={{ flexDirection: 'column', alignItems: 'stretch', gap: '6px' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px'
                    }}
                  >
                    <div className="winget-pkg-main">
                      <div className="winget-pkg-title-row">
                        <span className="winget-pkg-name">{job.name}</span>
                        <span
                          className={`winget-badge ${
                            isRunning
                              ? 'winget-badge-installed'
                              : !job.enabled
                                ? 'winget-badge-blocked'
                                : job.status === 'error'
                                  ? 'winget-badge-blocked'
                                  : 'winget-badge-installed'
                          }`}
                        >
                          {isRunning
                            ? '🔄 Running'
                            : !job.enabled
                              ? '⏸️ Paused'
                              : job.status === 'error'
                                ? '🔴 Last Failed'
                                : '🟢 Active'}
                        </span>
                        <span className="winget-source-tag">
                          {job.triggerType === 'cron'
                            ? `⏱️ ${job.schedule}`
                            : job.triggerType === 'interval'
                              ? `🔄 Every ${job.schedule}m`
                              : `⚡ Event: ${job.triggerType}`}
                        </span>
                        <span className="winget-source-tag">{job.scheduleSummary}</span>
                        {job.sourceCommandName && (
                          <span className="winget-badge winget-badge-pinned">
                            🧩 /{job.sourceCommandName}
                          </span>
                        )}
                        {job.elevated && (
                          <span className="winget-source-tag" title="Runs with UAC Elevation">
                            🛡️ Admin
                          </span>
                        )}
                      </div>

                      <div className="winget-pkg-meta-row">
                        <span
                          className="winget-ver-current"
                          style={{
                            fontFamily: 'monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '520px'
                          }}
                          title={job.command}
                        >
                          {job.command}
                        </span>
                        {job.nextRunAt && job.enabled && (
                          <span className="winget-source-tag">
                            Next:{' '}
                            {new Date(job.nextRunAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        )}
                        {job.lastRunAt && (
                          <span className="winget-ver-current">
                            Last:{' '}
                            {new Date(job.lastRunAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            })}
                            {job.lastDurationMs != null
                              ? ` (${(job.lastDurationMs / 1000).toFixed(1)}s)`
                              : ''}
                            {job.lastExitCode !== undefined && job.lastExitCode !== null
                              ? ` [exit ${job.lastExitCode}]`
                              : ''}
                          </span>
                        )}
                        <span className="winget-source-tag">Runs: {job.runCount}</span>
                      </div>
                    </div>

                    <div className="winget-pkg-actions" style={{ flexWrap: 'wrap' }}>
                      {isRunning ? (
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-danger shelf-btn-sm"
                          disabled={isBusy}
                          onClick={async () => {
                            setJobBusyId(job.id)
                            const updated = await window.api.stopScheduledJob?.(job.id)
                            setJobBusyId(null)
                            if (updated) {
                              setScheduledJobs(updated)
                              flash(`Stopped "${job.name}"`)
                            }
                          }}
                        >
                          ⏹️ Stop
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-primary shelf-btn-sm"
                          disabled={isBusy}
                          onClick={async () => {
                            setJobBusyId(job.id)
                            const updated = await window.api.runScheduledJobNow?.(job.id)
                            setJobBusyId(null)
                            if (updated) {
                              setScheduledJobs(updated)
                              flash(`Triggered "${job.name}"`)
                            }
                          }}
                          title="Trigger this job immediately in the background"
                        >
                          ▶️ Run Now
                        </button>
                      )}

                      <button
                        type="button"
                        className={`shelf-btn shelf-btn-sm ${
                          job.enabled ? 'shelf-btn-warning' : 'shelf-btn-primary'
                        }`}
                        disabled={isBusy}
                        onClick={async () => {
                          setJobBusyId(job.id)
                          const updated = await window.api.toggleScheduledJob?.(job.id)
                          setJobBusyId(null)
                          if (updated) {
                            setScheduledJobs(updated)
                            flash(`${job.enabled ? 'Paused' : 'Enabled'} "${job.name}"`)
                          }
                        }}
                      >
                        {job.enabled ? '⏸️ Pause' : '🟢 Enable'}
                      </button>

                      <button
                        type="button"
                        className="shelf-btn shelf-btn-sm"
                        onClick={async () => {
                          await window.api.openScheduledJobInTerminal?.(job.id)
                          flash(`Sent "${job.name}" to SudoLaunch Terminal`)
                        }}
                        title="Run interactively inside SudoLaunch Terminal (>_)"
                      >
                        &gt;_
                      </button>

                      <button
                        type="button"
                        className="shelf-btn shelf-btn-sm"
                        onClick={() => {
                          setExpandedJobLogIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(job.id)) next.delete(job.id)
                            else next.add(job.id)
                            return next
                          })
                        }}
                        title="Toggle recent stdout/stderr execution logs"
                      >
                        📜 Logs ({job.logLines.length})
                      </button>

                      <button
                        type="button"
                        className="shelf-btn shelf-btn-sm"
                        onClick={() => openEditJobForm(job)}
                        title="Edit schedule or command"
                      >
                        ✏️
                      </button>

                      {job.source !== 'custom-command' && (
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-danger shelf-btn-sm"
                          disabled={isBusy}
                          onClick={async () => {
                            setJobBusyId(job.id)
                            const updated = await window.api.deleteScheduledJob?.(job.id)
                            setJobBusyId(null)
                            if (updated) {
                              setScheduledJobs(updated)
                              flash(`Deleted scheduled job "${job.name}"`)
                            }
                          }}
                          title="Delete scheduled job"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>

                  {logsOpen && (
                    <div
                      style={{
                        marginTop: '4px',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        background: 'rgba(0, 0, 0, 0.45)',
                        border: '1px solid rgba(255, 255, 255, 0.08)'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '4px'
                        }}
                      >
                        <span className="winget-summary-text" style={{ fontSize: '11px' }}>
                          Recent Execution Output ({job.logLines.length} lines)
                        </span>
                        {job.logLines.length > 0 && (
                          <button
                            type="button"
                            className="shelf-btn shelf-btn-sm"
                            onClick={async () => {
                              const res = await window.api.clearScheduledJobLogs?.(job.id)
                              if (res) setScheduledJobs(res)
                            }}
                          >
                            🧹 Clear Logs
                          </button>
                        )}
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          maxHeight: '160px',
                          overflowY: 'auto',
                          fontSize: '11px',
                          lineHeight: 1.4,
                          fontFamily: 'monospace',
                          whiteSpace: 'pre-wrap',
                          color: '#d1d5db'
                        }}
                      >
                        {job.logLines.length > 0
                          ? job.logLines.join('\n')
                          : 'No output recorded yet. Click "▶ Run Now" to execute and capture logs.'}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

