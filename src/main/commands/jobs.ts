import Fuse from 'fuse.js'
import type { SearchResultItem } from '../../shared/types'
import {
  executeScheduledJob,
  getScheduledJobs,
  openScheduledJobInTerminal,
  toggleScheduledJob
} from '../schedulesManager'

function formatRelativeTime(ts?: number | null): string {
  if (!ts) return '—'
  const diff = ts - Date.now()
  const absDiff = Math.abs(diff)
  const mins = Math.max(1, Math.round(absDiff / 60_000))

  if (diff > 0) {
    if (mins < 60) return `in ${mins}m`
    const hrs = Math.round(mins / 60)
    if (hrs < 24) return `in ${hrs}h`
    return `in ${Math.round(hrs / 24)}d`
  } else {
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.round(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.round(hrs / 24)}d ago`
  }
}

export function search(query: string): SearchResultItem[] {
  const raw = query.trim()
  const jobs = getScheduledJobs()

  // 1. Drill-down into a specific job: /jobs @<id>
  if (raw.startsWith('@')) {
    const targetId = raw.slice(1).trim()
    const exact = jobs.find((j) => j.id === targetId || j.name.toLowerCase() === targetId.toLowerCase())
    if (exact) {
      return [
        {
          label: '← Back to All Scheduled Jobs',
          sublabel: 'Return to scheduled jobs list',
          value: '',
          completion: '/jobs '
        },
        {
          label: `▶️ Run "${exact.name}" Now`,
          sublabel: `${exact.command} · ${exact.scheduleSummary}`,
          value: `__job_run::${exact.id}`
        },
        {
          label: exact.enabled
            ? `⏸️ Pause / Disable "${exact.name}"`
            : `🟢 Enable "${exact.name}"`,
          sublabel: `Current status: ${exact.enabled ? 'Enabled' : 'Paused'} · ${exact.scheduleSummary}`,
          value: `__job_toggle::${exact.id}`
        },
        {
          label: `>_ Run "${exact.name}" in Persistent Terminal`,
          sublabel: `Execute "${exact.command}" visibly in SudoLaunch PowerShell Terminal`,
          value: `__job_terminal::${exact.id}`
        },
        {
          label: '⏰ Open in Scheduled Jobs Manager (/system)',
          sublabel: 'Edit schedule, inspect live output logs, or configure triggers',
          value: '__openSystemPanel::jobs'
        }
      ]
    }
  }

  const items: SearchResultItem[] = [
    {
      label: '⏰ Open Scheduled Jobs Manager',
      sublabel: 'Create, edit, toggle, and view live output logs for cron, interval, and event jobs',
      value: '__openSystemPanel::jobs'
    }
  ]

  const matched = raw
    ? new Fuse(jobs, {
        keys: ['name', 'description', 'command', 'schedule', 'scheduleSummary'],
        threshold: 0.35,
        ignoreLocation: true
      })
        .search(raw)
        .map((r) => r.item)
    : jobs

  for (const job of matched) {
    const stateIcon =
      job.status === 'running'
        ? '🔄'
        : !job.enabled
          ? '⏸️'
          : job.status === 'error'
            ? '🔴'
            : '🟢'
    const nextStr =
      job.enabled && job.nextRunAt ? ` · Next: ${formatRelativeTime(job.nextRunAt)}` : ''
    const lastStr = job.lastRunAt ? ` · Last: ${formatRelativeTime(job.lastRunAt)}` : ''

    items.push({
      label: `${stateIcon} ${job.name}`,
      sublabel: `${job.scheduleSummary}${nextStr}${lastStr} · ↵ Run Now · Tab for Actions`,
      value: `__job_run::${job.id}`,
      completion: `/jobs @${job.id} `,
      executeOnEnter: true
    })
  }

  return items
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (!item.value || item.value.startsWith('__openSystemPanel::')) return

  if (item.value.startsWith('__job_run::')) {
    const id = item.value.slice('__job_run::'.length)
    await executeScheduledJob(id, 'Command Palette (/jobs)')
    return
  }

  if (item.value.startsWith('__job_toggle::')) {
    const id = item.value.slice('__job_toggle::'.length)
    toggleScheduledJob(id)
    return
  }

  if (item.value.startsWith('__job_terminal::')) {
    const id = item.value.slice('__job_terminal::'.length)
    openScheduledJobInTerminal(id)
    return
  }
}

