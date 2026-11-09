import { spawn, execFile, type ChildProcess } from 'child_process'
import { BrowserWindow, ipcMain, powerMonitor } from 'electron'
import { existsSync, mkdirSync, promises as fsPromises, readdirSync, readFileSync, writeFileSync } from 'fs'
import { networkInterfaces } from 'os'
import { basename, extname, isAbsolute, join, resolve } from 'path'
import { CONFIG_DIR } from './config'
import { loadCustomCommands } from './customCommands'
import { explainCronExpression, getNextCronRunDate } from './commands/cron'
import { runElevated } from './elevation'
import { addNotification } from './notifications'
import { openTerminal, runInTerminal } from './terminalWindow'
import type {
  ScheduledJobActionType,
  ScheduledJobInput,
  ScheduledJobItem,
  ScheduledJobNotifyMode,
  ScheduledJobPreset,
  ScheduledJobTriggerType
} from '../shared/types'

export const SCHEDULES_FILE = join(CONFIG_DIR, 'schedules.json')
const MAX_JOB_LOG_LINES = 150

interface PersistedScheduledJob {
  id: string
  name: string
  description?: string
  enabled: boolean
  triggerType: ScheduledJobTriggerType
  schedule: string
  actionType: ScheduledJobActionType
  command: string
  cwd?: string
  elevated?: boolean
  notifyOn: ScheduledJobNotifyMode
}

interface ActiveJobRuntime {
  childProcess: ChildProcess | null
  startedAt: number
  intentionalStop: boolean
}

const DEFAULT_SEED_JOBS: PersistedScheduledJob[] = [
  {
    id: 'seed-maint-modules',
    name: 'Update PowerShell Modules (Maintenance)',
    description: 'Run example-update-modules.ps1 from ~/.sudolaunch/maintenance',
    enabled: false,
    triggerType: 'cron',
    schedule: '0 9 * * 1',
    actionType: 'script',
    command: 'maintenance/example-update-modules.ps1',
    notifyOn: 'always'
  },
  {
    id: 'seed-sync-teams',
    name: 'Sync Teams Contact List',
    description: 'Run Sync-TeamsList.ps1 from ~/.sudolaunch/maintenance on weekday mornings',
    enabled: false,
    triggerType: 'cron',
    schedule: '30 8 * * 1-5',
    actionType: 'script',
    command: 'maintenance/Sync-TeamsList.ps1',
    notifyOn: 'error'
  },
  {
    id: 'seed-winget-check',
    name: 'Check WinGet Package Upgrades on Unlock',
    description: 'Log available WinGet package upgrades when unlocking the workstation',
    enabled: false,
    triggerType: 'unlock',
    schedule: '@unlock',
    actionType: 'powershell',
    command: 'winget upgrade --include-unknown',
    notifyOn: 'error'
  }
]

const jobsMap = new Map<string, ScheduledJobItem>()
const runtimeMap = new Map<string, ActiveJobRuntime>()
let loadedFromDisk = false
let schedulerTimer: NodeJS.Timeout | null = null
let networkPollTimer: NodeJS.Timeout | null = null
let broadcastTimer: NodeJS.Timeout | null = null
let saveDebounceTimer: NodeJS.Timeout | null = null
let lastNetworkSignature = ''
let daemonInitialized = false

function stripAnsi(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
}

function formatTimePrefix(): string {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `[${hh}:${mm}:${ss}]`
}

function getNetworkSignature(): string {
  try {
    const nets = networkInterfaces()
    const addrs: string[] = []
    for (const [name, list] of Object.entries(nets)) {
      if (!list) continue
      for (const info of list) {
        if (!info.internal && info.family === 'IPv4' && info.address) {
          addrs.push(`${name}:${info.address}`)
        }
      }
    }
    addrs.sort()
    return addrs.join('|')
  } catch {
    return ''
  }
}

export function formatScheduleSummary(
  triggerType: ScheduledJobTriggerType,
  schedule: string
): string {
  switch (triggerType) {
    case 'startup':
      return 'On SudoLaunch Startup'
    case 'unlock':
      return 'On Workstation Unlock'
    case 'resume':
      return 'On System Wake / Resume'
    case 'network-change':
      return 'On Network / IP Change'
    case 'interval': {
      const mins = Math.max(1, parseInt(schedule, 10) || 15)
      if (mins % 60 === 0 && mins >= 60) {
        const hrs = mins / 60
        return `Every ${hrs} hour${hrs > 1 ? 's' : ''}`
      }
      return `Every ${mins} minute${mins > 1 ? 's' : ''}`
    }
    case 'cron': {
      const explained = explainCronExpression(schedule)
      return explained ? `Cron (${schedule}): ${explained}` : `Cron: ${schedule}`
    }
  }
}

function computeNextRunAt(
  triggerType: ScheduledJobTriggerType,
  schedule: string,
  enabled: boolean,
  fromTimeMs = Date.now()
): number | null {
  if (!enabled) return null
  if (triggerType === 'cron') {
    const nextDate = getNextCronRunDate(schedule, new Date(fromTimeMs))
    return nextDate ? nextDate.getTime() : null
  }
  if (triggerType === 'interval') {
    const mins = Math.max(1, parseInt(schedule, 10) || 15)
    return fromTimeMs + mins * 60_000
  }
  return null
}

function parseCustomCommandTrigger(
  scheduleStr?: string,
  intervalMinutes?: number
): { triggerType: ScheduledJobTriggerType; schedule: string } | null {
  if (typeof intervalMinutes === 'number' && intervalMinutes > 0) {
    return { triggerType: 'interval', schedule: String(Math.round(intervalMinutes)) }
  }
  if (!scheduleStr) return null
  const raw = scheduleStr.trim()
  const lower = raw.toLowerCase()
  if (lower === '@startup' || lower === 'startup' || lower === '@boot') {
    return { triggerType: 'startup', schedule: '@startup' }
  }
  if (lower === '@unlock' || lower === 'unlock') {
    return { triggerType: 'unlock', schedule: '@unlock' }
  }
  if (lower === '@resume' || lower === 'resume' || lower === '@wake') {
    return { triggerType: 'resume', schedule: '@resume' }
  }
  if (lower === '@network' || lower === 'network' || lower === '@network-change') {
    return { triggerType: 'network-change', schedule: '@network' }
  }
  const intervalMatch = lower.match(/^every\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)$/)
  if (intervalMatch) {
    const val = parseInt(intervalMatch[1], 10)
    const unit = intervalMatch[2]
    const mins = unit.startsWith('h') ? val * 60 : val
    if (mins > 0) {
      return { triggerType: 'interval', schedule: String(mins) }
    }
  }
  return { triggerType: 'cron', schedule: raw }
}

function ensureLoaded(): void {
  if (loadedFromDisk) return
  loadedFromDisk = true

  let rawList: PersistedScheduledJob[] = []
  try {
    if (!existsSync(SCHEDULES_FILE)) {
      if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true })
      }
      writeFileSync(SCHEDULES_FILE, JSON.stringify(DEFAULT_SEED_JOBS, null, 2), 'utf-8')
      rawList = DEFAULT_SEED_JOBS
    } else {
      const parsed = JSON.parse(readFileSync(SCHEDULES_FILE, 'utf-8').replace(/^\uFEFF/, ''))
      if (Array.isArray(parsed)) {
        rawList = parsed
      }
    }
  } catch {
    rawList = DEFAULT_SEED_JOBS
  }

  const now = Date.now()
  for (const entry of rawList) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.name !== 'string') continue
    const triggerType: ScheduledJobTriggerType = entry.triggerType || 'cron'
    const schedule = entry.schedule || '0 * * * *'
    const enabled = Boolean(entry.enabled)
    jobsMap.set(entry.id, {
      id: entry.id,
      name: entry.name,
      description: entry.description || '',
      enabled,
      triggerType,
      schedule,
      scheduleSummary: formatScheduleSummary(triggerType, schedule),
      actionType: entry.actionType || 'powershell',
      command: entry.command || '',
      cwd: entry.cwd || '',
      elevated: Boolean(entry.elevated),
      notifyOn: entry.notifyOn || 'error',
      source: 'user',
      status: 'idle',
      runCount: 0,
      nextRunAt: computeNextRunAt(triggerType, schedule, enabled, now),
      lastRunAt: null,
      lastDurationMs: null,
      lastExitCode: null,
      logLines: []
    })
  }

  syncCustomCommandSchedules()
}

export function syncCustomCommandSchedules(): void {
  ensureLoaded()
  const customCmds = loadCustomCommands()
  const activeCustomJobIds = new Set<string>()
  const now = Date.now()

  for (const cmd of customCmds) {
    const parsedTrigger = parseCustomCommandTrigger(cmd.schedule, cmd.intervalMinutes)
    if (!parsedTrigger || !cmd.action) continue

    const jobId = `custom-cmd::${cmd.command}`
    activeCustomJobIds.add(jobId)
    const existing = jobsMap.get(jobId)

    const triggerType = parsedTrigger.triggerType
    const schedule = parsedTrigger.schedule
    const enabled = existing ? existing.enabled : true

    jobsMap.set(jobId, {
      id: jobId,
      name: cmd.label ? `${cmd.label} (/${cmd.command})` : `Custom Command /${cmd.command}`,
      description: `Synced from ~/.sudolaunch/commands/${cmd.command}.json`,
      enabled,
      triggerType,
      schedule,
      scheduleSummary: formatScheduleSummary(triggerType, schedule),
      actionType: cmd.showTerminal ? 'terminal' : 'powershell',
      command: cmd.action,
      elevated: false,
      notifyOn: existing?.notifyOn ?? 'error',
      source: 'custom-command',
      sourceCommandName: cmd.command,
      status: existing?.status ?? 'idle',
      runCount: existing?.runCount ?? 0,
      nextRunAt: computeNextRunAt(triggerType, schedule, enabled, now),
      lastRunAt: existing?.lastRunAt ?? null,
      lastDurationMs: existing?.lastDurationMs ?? null,
      lastExitCode: existing?.lastExitCode ?? null,
      lastTriggerReason: existing?.lastTriggerReason,
      logLines: existing?.logLines ?? []
    })
  }

  for (const [id, job] of jobsMap.entries()) {
    if (job.source === 'custom-command' && !activeCustomJobIds.has(id)) {
      jobsMap.delete(id)
    }
  }
}

function saveToDisk(): void {
  ensureLoaded()
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer)
  saveDebounceTimer = setTimeout(() => {
    saveDebounceTimer = null
    const persisted: PersistedScheduledJob[] = Array.from(jobsMap.values())
      .filter((j) => j.source === 'user')
      .map((j) => ({
        id: j.id,
        name: j.name,
        description: j.description,
        enabled: j.enabled,
        triggerType: j.triggerType,
        schedule: j.schedule,
        actionType: j.actionType,
        command: j.command,
        cwd: j.cwd,
        elevated: j.elevated,
        notifyOn: j.notifyOn
      }))
    fsPromises
      .writeFile(SCHEDULES_FILE, JSON.stringify(persisted, null, 2), 'utf-8')
      .catch(() => {
        // ignore async write error
      })
  }, 120)
}

function buildSnapshot(): ScheduledJobItem[] {
  ensureLoaded()
  return Array.from(jobsMap.values()).map((j) => ({
    ...j,
    logLines: [...j.logLines]
  }))
}

function sendScheduledJobsUpdate(payload: ScheduledJobItem[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (win.isDestroyed()) continue
      const url = win.webContents.getURL()
      if (url.includes('mode=term') || url.includes('mode=notify') || url.includes('mode=shortcuts')) {
        continue
      }
      win.webContents.send('scheduled-jobs-updated', payload)
    } catch {
      // window may be closing
    }
  }
}

function scheduleBroadcast(immediate = false): void {
  if (immediate) {
    if (broadcastTimer) {
      clearTimeout(broadcastTimer)
      broadcastTimer = null
    }
    sendScheduledJobsUpdate(buildSnapshot())
    return
  }
  if (broadcastTimer) return
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null
    sendScheduledJobsUpdate(buildSnapshot())
  }, 85)
}

function appendJobLog(job: ScheduledJobItem, rawText: string): void {
  const cleaned = stripAnsi(rawText).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (const line of cleaned.split('\n')) {
    const trimmed = line.trimEnd()
    if (!trimmed) continue
    job.logLines.push(trimmed)
  }
  if (job.logLines.length > MAX_JOB_LOG_LINES) {
    job.logLines.splice(0, job.logLines.length - MAX_JOB_LOG_LINES)
  }
  scheduleBroadcast(false)
}

function resolveScriptPath(rawCmd: string): string {
  const trimmed = rawCmd.trim()
  if (isAbsolute(trimmed)) return trimmed
  const inConfig = resolve(CONFIG_DIR, trimmed)
  if (existsSync(inConfig)) return inConfig
  const inMaint = resolve(CONFIG_DIR, 'maintenance', trimmed)
  if (existsSync(inMaint)) return inMaint
  return inConfig
}

function buildPowerShellCommandForJob(job: ScheduledJobItem): { exe: string; args: string[]; cwd: string } {
  const workingDir =
    job.cwd && existsSync(job.cwd) ? job.cwd : existsSync(CONFIG_DIR) ? CONFIG_DIR : process.cwd()

  if (job.actionType === 'script') {
    const scriptPath = resolveScriptPath(job.command)
    const ext = extname(scriptPath).toLowerCase()
    if (ext === '.py') {
      return {
        exe: 'python',
        args: [scriptPath],
        cwd: workingDir
      }
    }
    return {
      exe: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      cwd: workingDir
    }
  }

  return {
    exe: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', job.command],
    cwd: workingDir
  }
}

export async function executeScheduledJob(
  id: string,
  reason = 'Manual trigger'
): Promise<ScheduledJobItem[]> {
  ensureLoaded()
  const job = jobsMap.get(id)
  if (!job) return buildSnapshot()

  if (job.status === 'running') {
    appendJobLog(job, `${formatTimePrefix()} ⚠️ Skipped (${reason}) — job is already running.`)
    return buildSnapshot()
  }

  job.lastRunAt = Date.now()
  job.lastTriggerReason = reason
  job.runCount += 1

  // Update nextRunAt for interval or cron jobs
  if (job.enabled && (job.triggerType === 'cron' || job.triggerType === 'interval')) {
    job.nextRunAt = computeNextRunAt(job.triggerType, job.schedule, job.enabled, Date.now())
  }

  appendJobLog(job, `${formatTimePrefix()} ▶ Triggered (${reason}): ${job.command}`)

  // Terminal action: run visibly in SudoLaunch persistent terminal
  if (job.actionType === 'terminal') {
    const cmdText =
      job.command.endsWith('.ps1') && !job.command.includes(' ')
        ? `& "${resolveScriptPath(job.command)}"`
        : job.command
    runInTerminal(cmdText)
    job.status = 'success'
    job.lastExitCode = 0
    job.lastDurationMs = 0
    appendJobLog(job, `${formatTimePrefix()} ✓ Dispatched to SudoLaunch PowerShell Terminal.`)
    if (job.notifyOn === 'always') {
      addNotification({
        title: `Scheduled Job: ${job.name}`,
        body: `Dispatched to Terminal (${reason})`,
        type: 'info',
        commandName: 'jobs',
        commandInput: job.command,
        showNativeToast: true
      })
    }
    scheduleBroadcast(true)
    rearmSchedulerTimer()
    return buildSnapshot()
  }

  // Elevated execution via UAC
  if (job.elevated) {
    const cmdText =
      job.actionType === 'script'
        ? `& "${resolveScriptPath(job.command)}"`
        : job.command
    runElevated(cmdText, `Scheduled Job: ${job.name}`, 'jobs')
    job.status = 'success'
    job.lastExitCode = 0
    job.lastDurationMs = 0
    appendJobLog(job, `${formatTimePrefix()} 🛡️ Launched elevated via UAC.`)
    scheduleBroadcast(true)
    rearmSchedulerTimer()
    return buildSnapshot()
  }

  // Background child process with stdout/stderr capture
  const { exe, args, cwd } = buildPowerShellCommandForJob(job)
  const startedAt = Date.now()
  job.status = 'running'
  scheduleBroadcast(true)

  const rt: ActiveJobRuntime = {
    childProcess: null,
    startedAt,
    intentionalStop: false
  }
  runtimeMap.set(id, rt)

  try {
    const child = spawn(exe, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    rt.childProcess = child
    job.pid = child.pid

    let outputSummary = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      outputSummary = (outputSummary + text).slice(-600)
      appendJobLog(job, text)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      outputSummary = (outputSummary + text).slice(-600)
      appendJobLog(job, `[stderr] ${text}`)
    })

    child.on('error', (err) => {
      job.status = 'error'
      job.pid = undefined
      job.lastExitCode = -1
      job.lastDurationMs = Date.now() - startedAt
      appendJobLog(job, `${formatTimePrefix()} ✗ Process error: ${err.message}`)
      runtimeMap.delete(id)
      if (job.notifyOn !== 'never') {
        addNotification({
          title: `Scheduled Job Failed: ${job.name}`,
          body: err.message,
          type: 'error',
          commandName: 'jobs',
          commandInput: job.command,
          showNativeToast: true
        })
      }
      scheduleBroadcast(true)
    })

    child.on('close', (code) => {
      const durationMs = Date.now() - startedAt
      job.pid = undefined
      job.lastExitCode = code ?? 0
      job.lastDurationMs = durationMs
      runtimeMap.delete(id)

      if (rt.intentionalStop) {
        job.status = 'idle'
        appendJobLog(job, `${formatTimePrefix()} ⏹ Stopped by user (${durationMs}ms).`)
      } else if (code === 0) {
        job.status = 'success'
        appendJobLog(job, `${formatTimePrefix()} ✓ Completed with exit code 0 (${durationMs}ms).`)
        if (job.notifyOn === 'always') {
          addNotification({
            title: `Scheduled Job Succeeded: ${job.name}`,
            body: outputSummary.trim() || `Completed in ${durationMs}ms (${reason})`,
            type: 'success',
            commandName: 'jobs',
            commandInput: job.command,
            showNativeToast: true
          })
        }
      } else {
        job.status = 'error'
        appendJobLog(job, `${formatTimePrefix()} ✗ Exited with code ${code} (${durationMs}ms).`)
        if (job.notifyOn !== 'never') {
          addNotification({
            title: `Scheduled Job Failed (Exit ${code}): ${job.name}`,
            body: outputSummary.trim() || `Failed after ${durationMs}ms (${reason})`,
            type: 'error',
            commandName: 'jobs',
            commandInput: job.command,
            showNativeToast: true
          })
        }
      }
      scheduleBroadcast(true)
    })
  } catch (err) {
    job.status = 'error'
    job.pid = undefined
    job.lastExitCode = -1
    job.lastDurationMs = Date.now() - startedAt
    appendJobLog(job, `${formatTimePrefix()} ✗ Failed to spawn: ${(err as Error).message}`)
    runtimeMap.delete(id)
    scheduleBroadcast(true)
  }

  rearmSchedulerTimer()
  return buildSnapshot()
}

export async function stopScheduledJob(id: string): Promise<ScheduledJobItem[]> {
  ensureLoaded()
  const rt = runtimeMap.get(id)
  const job = jobsMap.get(id)
  if (rt && rt.childProcess?.pid) {
    rt.intentionalStop = true
    const pid = rt.childProcess.pid
    await new Promise<void>((res) => {
      execFile('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => res())
    })
  } else if (job && job.status === 'running') {
    job.status = 'idle'
    job.pid = undefined
  }
  scheduleBroadcast(true)
  return buildSnapshot()
}

function triggerLifecycleEventJobs(
  eventType: Extract<ScheduledJobTriggerType, 'startup' | 'unlock' | 'resume' | 'network-change'>,
  reasonLabel: string
): void {
  ensureLoaded()
  for (const job of jobsMap.values()) {
    if (job.enabled && job.triggerType === eventType) {
      void executeScheduledJob(job.id, reasonLabel)
    }
  }
}

function checkDueScheduledJobs(): void {
  ensureLoaded()
  const now = Date.now()
  for (const job of jobsMap.values()) {
    if (!job.enabled) continue
    if (job.triggerType !== 'cron' && job.triggerType !== 'interval') continue
    if (job.nextRunAt && job.nextRunAt <= now) {
      const reason =
        job.triggerType === 'cron'
          ? `Cron (${job.schedule})`
          : `Interval (${job.schedule}m)`
      job.nextRunAt = computeNextRunAt(job.triggerType, job.schedule, true, now)
      void executeScheduledJob(job.id, reason)
    }
  }
  rearmSchedulerTimer()
}

function rearmSchedulerTimer(): void {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer)
    schedulerTimer = null
  }
  ensureLoaded()
  const now = Date.now()
  let earliestNext: number | null = null

  for (const job of jobsMap.values()) {
    if (!job.enabled) continue
    if (job.triggerType !== 'cron' && job.triggerType !== 'interval') continue
    if (!job.nextRunAt || job.nextRunAt <= now) {
      job.nextRunAt = computeNextRunAt(job.triggerType, job.schedule, true, now)
    }
    if (job.nextRunAt && (earliestNext === null || job.nextRunAt < earliestNext)) {
      earliestNext = job.nextRunAt
    }
  }

  if (earliestNext !== null) {
    const delayMs = Math.min(60_000, Math.max(500, earliestNext - now + 250))
    schedulerTimer = setTimeout(() => {
      schedulerTimer = null
      checkDueScheduledJobs()
    }, delayMs)
  }
}

export function initSchedulerDaemon(): void {
  if (daemonInitialized) return
  daemonInitialized = true
  ensureLoaded()
  lastNetworkSignature = getNetworkSignature()

  rearmSchedulerTimer()

  // 1. Run 'startup' jobs 3.5s after launch so windows settle first
  setTimeout(() => {
    triggerLifecycleEventJobs('startup', 'SudoLaunch Startup')
  }, 3500)

  // 2. PowerMonitor hooks for workstation unlock & wake/resume
  try {
    powerMonitor.on('unlock-screen', () => {
      triggerLifecycleEventJobs('unlock', 'Workstation Unlocked')
    })
    powerMonitor.on('resume', () => {
      // Recalculate nextRunAt after system sleep
      const now = Date.now()
      for (const job of jobsMap.values()) {
        if (job.enabled && job.triggerType === 'cron') {
          job.nextRunAt = computeNextRunAt('cron', job.schedule, true, now)
        }
      }
      rearmSchedulerTimer()
      triggerLifecycleEventJobs('resume', 'System Wake / Resume')
    })
  } catch {
    // ignore if powerMonitor unavailable
  }

  // 3. Lightweight network signature watcher for 'network-change' jobs
  networkPollTimer = setInterval(() => {
    const hasNetJobs = Array.from(jobsMap.values()).some(
      (j) => j.enabled && j.triggerType === 'network-change'
    )
    if (!hasNetJobs) return
    const sig = getNetworkSignature()
    if (sig && sig !== lastNetworkSignature) {
      lastNetworkSignature = sig
      triggerLifecycleEventJobs('network-change', `Network Change (${sig})`)
    }
  }, 30_000)
}

export async function stopAllScheduledJobs(): Promise<void> {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer)
    schedulerTimer = null
  }
  if (networkPollTimer) {
    clearInterval(networkPollTimer)
    networkPollTimer = null
  }
  const runningIds = Array.from(runtimeMap.keys())
  for (const id of runningIds) {
    await stopScheduledJob(id)
  }
}

export function getScheduledJobs(): ScheduledJobItem[] {
  ensureLoaded()
  syncCustomCommandSchedules()
  return buildSnapshot()
}

export function getScheduledJobPresets(): ScheduledJobPreset[] {
  const presets: ScheduledJobPreset[] = []

  // 1. Scripts inside ~/.sudolaunch/maintenance
  const maintDir = join(CONFIG_DIR, 'maintenance')
  if (existsSync(maintDir)) {
    try {
      for (const entry of readdirSync(maintDir)) {
        const ext = extname(entry).toLowerCase()
        if (ext !== '.ps1' && ext !== '.py') continue
        const base = basename(entry, ext)
        presets.push({
          id: `maint-${entry}`,
          name: `Script: ${base}`,
          description: `Run ~/.sudolaunch/maintenance/${entry}`,
          actionType: 'script',
          command: `maintenance/${entry}`,
          suggestedTriggerType: 'cron',
          suggestedSchedule: '0 9 * * 1-5',
          source: 'maintenance-script',
          icon: ext === '.py' ? '🐍' : '📜'
        })
      }
    } catch {
      // ignore
    }
  }

  // 2. Custom commands from ~/.sudolaunch/commands/*.json
  for (const cmd of loadCustomCommands()) {
    if (!cmd.action) continue
    presets.push({
      id: `custom-${cmd.command}`,
      name: cmd.label ? `${cmd.label} (/${cmd.command})` : `/${cmd.command}`,
      description: `PowerShell: ${cmd.action}`,
      actionType: cmd.showTerminal ? 'terminal' : 'powershell',
      command: cmd.action,
      suggestedTriggerType: 'cron',
      suggestedSchedule: cmd.schedule || '0 9 * * *',
      source: 'custom-command',
      icon: '⚡'
    })
  }

  // 3. Built-in common automation templates
  presets.push(
    {
      id: 'builtin-git-fetch',
      name: 'Git Fetch All Remotes',
      description: 'Fetch latest remote branches in active repository every 30 minutes',
      actionType: 'powershell',
      command: 'git fetch --all --prune',
      suggestedTriggerType: 'interval',
      suggestedSchedule: '30',
      source: 'builtin',
      icon: '🌿'
    },
    {
      id: 'builtin-docker-prune',
      name: 'Prune Dangling Docker Images Weekly',
      description: 'Reclaim disk space by removing dangling Docker images every Monday at 9:00 AM',
      actionType: 'powershell',
      command: 'docker image prune -f',
      suggestedTriggerType: 'cron',
      suggestedSchedule: '0 9 * * 1',
      source: 'builtin',
      icon: '🐳'
    },
    {
      id: 'builtin-flush-dns-net',
      name: 'Flush DNS Cache on Network Change',
      description: 'Automatically flush Windows DNS resolver cache when switching Wi-Fi/VPN networks',
      actionType: 'powershell',
      command: 'ipconfig /flushdns',
      suggestedTriggerType: 'network-change',
      suggestedSchedule: '@network',
      source: 'builtin',
      icon: '🌐'
    }
  )

  return presets
}

export async function saveScheduledJob(input: ScheduledJobInput): Promise<ScheduledJobItem[]> {
  ensureLoaded()
  const id =
    input.id && jobsMap.has(input.id)
      ? input.id
      : `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const existing = jobsMap.get(id)

  const triggerType: ScheduledJobTriggerType = input.triggerType || 'cron'
  const schedule = (input.schedule || '').trim() || (triggerType === 'interval' ? '30' : '0 9 * * *')
  const enabled = input.enabled !== undefined ? input.enabled : (existing?.enabled ?? true)

  const item: ScheduledJobItem = {
    id,
    name: input.name.trim() || 'Scheduled Job',
    description: input.description?.trim() || '',
    enabled,
    triggerType,
    schedule,
    scheduleSummary: formatScheduleSummary(triggerType, schedule),
    actionType: input.actionType || 'powershell',
    command: input.command.trim(),
    cwd: input.cwd?.trim() || '',
    elevated: Boolean(input.elevated),
    notifyOn: input.notifyOn || 'error',
    source: existing?.source ?? 'user',
    sourceCommandName: existing?.sourceCommandName,
    status: existing?.status ?? 'idle',
    pid: existing?.pid,
    runCount: existing?.runCount ?? 0,
    nextRunAt: computeNextRunAt(triggerType, schedule, enabled, Date.now()),
    lastRunAt: existing?.lastRunAt ?? null,
    lastDurationMs: existing?.lastDurationMs ?? null,
    lastExitCode: existing?.lastExitCode ?? null,
    lastTriggerReason: existing?.lastTriggerReason,
    logLines: existing?.logLines ?? []
  }

  jobsMap.set(id, item)
  saveToDisk()
  rearmSchedulerTimer()
  scheduleBroadcast(true)

  if (input.runImmediately) {
    await executeScheduledJob(id, 'Run on Save')
  }

  return buildSnapshot()
}

export function toggleScheduledJob(id: string, enabled?: boolean): ScheduledJobItem[] {
  ensureLoaded()
  const job = jobsMap.get(id)
  if (!job) return buildSnapshot()

  job.enabled = enabled !== undefined ? enabled : !job.enabled
  job.nextRunAt = computeNextRunAt(job.triggerType, job.schedule, job.enabled, Date.now())
  appendJobLog(
    job,
    `${formatTimePrefix()} ${job.enabled ? '🟢 Job enabled' : '⏸️ Job paused'} (${job.scheduleSummary}).`
  )
  saveToDisk()
  rearmSchedulerTimer()
  scheduleBroadcast(true)
  return buildSnapshot()
}

export async function deleteScheduledJob(id: string): Promise<ScheduledJobItem[]> {
  ensureLoaded()
  await stopScheduledJob(id)
  jobsMap.delete(id)
  saveToDisk()
  rearmSchedulerTimer()
  scheduleBroadcast(true)
  return buildSnapshot()
}

export function clearScheduledJobLogs(id: string): ScheduledJobItem[] {
  ensureLoaded()
  const job = jobsMap.get(id)
  if (job) {
    job.logLines = []
    scheduleBroadcast(true)
  }
  return buildSnapshot()
}

export function openScheduledJobInTerminal(id: string): void {
  ensureLoaded()
  const job = jobsMap.get(id)
  if (!job) return
  openTerminal()
  const cmdText =
    job.actionType === 'script'
      ? `& "${resolveScriptPath(job.command)}"`
      : job.command
  const prefix = job.cwd && existsSync(job.cwd) ? `Set-Location "${job.cwd}"; ` : ''
  runInTerminal(`${prefix}${cmdText}`)
}

export function registerSchedulesIpc(): void {
  ipcMain.handle('schedules-get-all', () => getScheduledJobs())
  ipcMain.handle('schedules-get-presets', () => getScheduledJobPresets())
  ipcMain.handle('schedules-save', (_e, input: ScheduledJobInput) => saveScheduledJob(input))
  ipcMain.handle('schedules-delete', (_e, id: string) => deleteScheduledJob(id))
  ipcMain.handle('schedules-toggle', (_e, id: string, enabled?: boolean) =>
    toggleScheduledJob(id, enabled)
  )
  ipcMain.handle('schedules-run-now', (_e, id: string) =>
    executeScheduledJob(id, 'Manual Run')
  )
  ipcMain.handle('schedules-stop', (_e, id: string) => stopScheduledJob(id))
  ipcMain.handle('schedules-clear-logs', (_e, id: string) => clearScheduledJobLogs(id))
  ipcMain.handle('schedules-open-terminal', (_e, id: string) => {
    openScheduledJobInTerminal(id)
  })
}

