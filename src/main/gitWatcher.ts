import { spawn, execFile, type ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { basename, extname, join, relative, resolve } from 'path'
import { watch as chokidarWatch, type FSWatcher } from 'chokidar'
import { CONFIG_DIR } from './config'
import { addNotification } from './notifications'
import { openTerminal, runInTerminal } from './terminalWindow'
import type {
  GitProjectPreset,
  GitWatcherConfigInput,
  GitWatcherItem,
  GitWatcherMode,
  GitWatcherStatus
} from '../shared/types'

const WATCHERS_FILE = join(CONFIG_DIR, 'git-watchers.json')
const MAX_LOG_LINES = 120

export const DEFAULT_IGNORE_PATTERNS =
  'node_modules,.git,dist,out,build,.next,.turbo,coverage,__pycache__,target,.venv,venv,.cache'

interface PersistedGitWatcher {
  id: string
  name: string
  repoPath: string
  subPath?: string
  command: string
  mode: GitWatcherMode
  extensions: string
  ignorePatterns: string
  debounceMs: number
  notifyOnError: boolean
}

interface ActiveWatcherRuntime {
  fsWatcher: FSWatcher | null
  childProcess: ChildProcess | null
  debounceTimer: NodeJS.Timeout | null
  pendingChangedFile: string | null
  intentionalKillPids: Set<number>
  runStartedAt: number
}

const watchersMap = new Map<string, GitWatcherItem>()
const runtimeMap = new Map<string, ActiveWatcherRuntime>()
let loadedFromDisk = false
let broadcastTimer: NodeJS.Timeout | null = null

// Strip ANSI color/cursor escape sequences so logs render cleanly in the panel
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

function appendWatcherLog(item: GitWatcherItem, rawText: string): void {
  const cleaned = stripAnsi(rawText).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = cleaned.split('\n')
  for (const line of lines) {
    const trimmedRight = line.trimEnd()
    if (!trimmedRight) continue
    item.logLines.push(trimmedRight)
  }
  if (item.logLines.length > MAX_LOG_LINES) {
    item.logLines.splice(0, item.logLines.length - MAX_LOG_LINES)
  }
  scheduleBroadcast(false)
}

function buildSnapshot(): GitWatcherItem[] {
  return Array.from(watchersMap.values()).map((w) => ({
    ...w,
    logLines: [...w.logLines]
  }))
}

function sendWatcherUpdateToRelevantWindows(payload: GitWatcherItem[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (win.isDestroyed()) continue
      const url = win.webContents.getURL()
      // Only mainWindow (mode=popup / default) and barWindow (mode=bar) consume git-watchers-updated;
      // skip terminalWindow, notifyWindow, and shortcutsWindow.
      if (url.includes('mode=term') || url.includes('mode=notify') || url.includes('mode=shortcuts')) {
        continue
      }
      win.webContents.send('git-watchers-updated', payload)
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
    sendWatcherUpdateToRelevantWindows(buildSnapshot())
    return
  }

  if (broadcastTimer) return
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null
    sendWatcherUpdateToRelevantWindows(buildSnapshot())
  }, 85)
}

function ensureLoaded(): void {
  if (loadedFromDisk) return
  loadedFromDisk = true
  try {
    if (!existsSync(WATCHERS_FILE)) return
    const raw = JSON.parse(readFileSync(WATCHERS_FILE, 'utf-8'))
    if (!Array.isArray(raw)) return
    for (const entry of raw as PersistedGitWatcher[]) {
      if (!entry || typeof entry.id !== 'string' || typeof entry.repoPath !== 'string') continue
      const resolvedRepo = resolve(entry.repoPath)
      watchersMap.set(entry.id, {
        id: entry.id,
        name: entry.name || basename(resolvedRepo),
        repoPath: resolvedRepo,
        repoName: basename(resolvedRepo),
        subPath: entry.subPath || '',
        command: entry.command || 'npm run build',
        mode: entry.mode === 'restart-process' ? 'restart-process' : 'run-on-change',
        extensions: entry.extensions || '*',
        ignorePatterns: entry.ignorePatterns || DEFAULT_IGNORE_PATTERNS,
        debounceMs:
          typeof entry.debounceMs === 'number'
            ? Math.min(10000, Math.max(50, entry.debounceMs))
            : 350,
        notifyOnError: entry.notifyOnError !== false,
        enabled: false,
        status: 'stopped',
        reloadCount: 0,
        logLines: []
      })
    }
  } catch {
    // ignore corrupt watchers config
  }
}

function saveToDisk(): void {
  ensureLoaded()
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true })
    }
    const persisted: PersistedGitWatcher[] = Array.from(watchersMap.values()).map((w) => ({
      id: w.id,
      name: w.name,
      repoPath: w.repoPath,
      subPath: w.subPath || '',
      command: w.command,
      mode: w.mode,
      extensions: w.extensions,
      ignorePatterns: w.ignorePatterns,
      debounceMs: w.debounceMs,
      notifyOnError: w.notifyOnError
    }))
    writeFileSync(WATCHERS_FILE, JSON.stringify(persisted, null, 2), 'utf-8')
  } catch {
    // ignore write errors
  }
}

function killProcessTree(pid: number): Promise<void> {
  return new Promise((res) => {
    if (!pid || pid <= 0) {
      res()
      return
    }
    execFile(
      'taskkill.exe',
      ['/PID', String(pid), '/T', '/F'],
      { windowsHide: true, timeout: 4000 },
      () => res()
    )
  })
}

function getOrCreateRuntime(id: string): ActiveWatcherRuntime {
  let rt = runtimeMap.get(id)
  if (!rt) {
    rt = {
      fsWatcher: null,
      childProcess: null,
      debounceTimer: null,
      pendingChangedFile: null,
      intentionalKillPids: new Set<number>(),
      runStartedAt: 0
    }
    runtimeMap.set(id, rt)
  }
  return rt
}

async function stopChildProcess(id: string): Promise<void> {
  const rt = runtimeMap.get(id)
  const item = watchersMap.get(id)
  if (!rt || !rt.childProcess) return

  const proc = rt.childProcess
  const pid = proc.pid
  rt.childProcess = null
  if (item) {
    item.pid = undefined
  }
  if (pid) {
    rt.intentionalKillPids.add(pid)
    await killProcessTree(pid)
    setTimeout(() => rt.intentionalKillPids.delete(pid), 2000)
  } else {
    try {
      proc.kill()
    } catch {
      // ignore
    }
  }
}

async function executeWatcherProcess(id: string, reasonLabel: string): Promise<void> {
  const item = watchersMap.get(id)
  if (!item || !item.enabled) return
  const rt = getOrCreateRuntime(id)

  // If a process is already running for this watcher, terminate its process tree first
  if (rt.childProcess) {
    await stopChildProcess(id)
  }

  // Re-check enabled after async process tree termination
  if (!item.enabled) return

  if (!existsSync(item.repoPath)) {
    item.status = 'error'
    appendWatcherLog(item, `${formatTimePrefix()} ❌ Repo path does not exist: ${item.repoPath}`)
    scheduleBroadcast(true)
    return
  }

  appendWatcherLog(item, `${formatTimePrefix()} ⚡ ${reasonLabel} → ${item.command}`)

  const psScript = `$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Set-Location -LiteralPath '${item.repoPath.replace(/'/g, "''")}'; ${item.command}`
  const encoded = Buffer.from(psScript, 'utf16le').toString('base64')

  try {
    const child = spawn(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      {
        cwd: item.repoPath,
        windowsHide: true
      }
    )

    rt.childProcess = child
    rt.runStartedAt = Date.now()
    item.pid = child.pid
    item.status = 'running'
    scheduleBroadcast(true)

    child.stdout?.on('data', (chunk: Buffer) => {
      appendWatcherLog(item, chunk.toString('utf-8'))
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      appendWatcherLog(item, chunk.toString('utf-8'))
    })

    child.on('error', (err) => {
      appendWatcherLog(item, `${formatTimePrefix()} ❌ Process error: ${err.message}`)
    })

    child.on('close', (code) => {
      const pid = child.pid
      const wasIntentional = pid ? rt.intentionalKillPids.has(pid) : false
      if (pid) rt.intentionalKillPids.delete(pid)

      if (rt.childProcess === child) {
        rt.childProcess = null
        item.pid = undefined
      }

      if (wasIntentional || !item.enabled) {
        return
      }

      const durationMs = rt.runStartedAt ? Date.now() - rt.runStartedAt : 0
      item.lastDurationMs = durationMs
      item.lastExitCode = code ?? 0

      if (code === 0) {
        appendWatcherLog(
          item,
          `${formatTimePrefix()} ✓ Completed (exit 0 in ${(durationMs / 1000).toFixed(2)}s) — watching for changes...`
        )
        item.status = 'watching'
      } else {
        appendWatcherLog(
          item,
          `${formatTimePrefix()} ⚠️ Exited with code ${code ?? 'unknown'} (${(durationMs / 1000).toFixed(2)}s)`
        )
        item.status = 'error'
        if (item.notifyOnError) {
          addNotification({
            title: `Watcher Failed: ${item.name}`,
            body: `"${item.command}" in ${item.repoName} exited with code ${code}`,
            type: 'error',
            commandName: 'repo',
            showNativeToast: true
          })
        }
      }
      scheduleBroadcast(true)
    })
  } catch (err) {
    item.status = 'error'
    appendWatcherLog(item, `${formatTimePrefix()} ❌ Failed to spawn command: ${(err as Error).message}`)
    scheduleBroadcast(true)
  }
}

function buildIgnoreMatcher(repoPath: string, rawPatterns: string): (targetPath: string) => boolean {
  const segmentsToIgnore = new Set<string>(['.git'])
  const substringsToIgnore: string[] = []

  for (const part of rawPatterns.split(',')) {
    const cleaned = part.trim().replace(/^[\\/]+|[\\/]+$/g, '')
    if (!cleaned) continue
    if (cleaned.includes('/') || cleaned.includes('\\') || cleaned.includes('*')) {
      substringsToIgnore.push(cleaned.replace(/\\/g, '/').replace(/\*/g, '').toLowerCase())
    } else {
      segmentsToIgnore.add(cleaned.toLowerCase())
    }
  }

  return (targetPath: string): boolean => {
    const rel = relative(repoPath, targetPath).replace(/\\/g, '/')
    if (!rel || rel.startsWith('..')) return false
    const parts = rel.toLowerCase().split('/')
    for (const seg of parts) {
      if (segmentsToIgnore.has(seg)) return true
    }
    const relLower = rel.toLowerCase()
    for (const sub of substringsToIgnore) {
      if (sub && relLower.includes(sub)) return true
    }
    return false
  }
}

function matchesExtensionFilter(filePath: string, extensionsSpec: string): boolean {
  const spec = (extensionsSpec || '*').trim()
  if (!spec || spec === '*' || spec === '*.*') return true

  const allowed = spec
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => (s.startsWith('*.') ? s.slice(1) : s.startsWith('.') ? s : `.${s}`))

  if (allowed.length === 0 || allowed.includes('.*')) return true
  const ext = extname(filePath).toLowerCase()
  const base = basename(filePath).toLowerCase()
  return allowed.some((a) => ext === a || base.endsWith(a))
}

export async function startGitWatcher(id: string): Promise<GitWatcherItem[]> {
  ensureLoaded()
  const item = watchersMap.get(id)
  if (!item) return getGitWatchers()

  // Stop any existing watcher for this id first
  await stopGitWatcher(id, true)

  const watchDir = item.subPath ? resolve(item.repoPath, item.subPath) : item.repoPath
  if (!existsSync(watchDir)) {
    item.enabled = false
    item.status = 'error'
    appendWatcherLog(item, `${formatTimePrefix()} ❌ Watch folder not found: ${watchDir}`)
    scheduleBroadcast(true)
    return getGitWatchers()
  }

  const rt = getOrCreateRuntime(id)
  const isIgnored = buildIgnoreMatcher(item.repoPath, item.ignorePatterns)

  item.enabled = true
  item.status = item.mode === 'restart-process' ? 'running' : 'watching'
  item.lastExitCode = null

  appendWatcherLog(
    item,
    `${formatTimePrefix()} 👁️ Started watcher "${item.name}" on ${watchDir} (${item.mode === 'restart-process' ? 'Managed Process' : 'Run on Change'}, debounce ${item.debounceMs}ms)`
  )

  const fsWatcher = chokidarWatch(watchDir, {
    ignoreInitial: true,
    persistent: true,
    ignored: isIgnored,
    awaitWriteFinish: {
      stabilityThreshold: Math.min(180, Math.max(40, Math.floor(item.debounceMs / 2))),
      pollInterval: 40
    }
  })

  const onFsEvent = (eventType: string, changedPath: string): void => {
    if (!item.enabled) return
    if (isIgnored(changedPath)) return
    if (!matchesExtensionFilter(changedPath, item.extensions)) return

    const relFile = relative(item.repoPath, changedPath).replace(/\\/g, '/')
    rt.pendingChangedFile = `${relFile} (${eventType})`

    if (rt.debounceTimer) {
      clearTimeout(rt.debounceTimer)
    }

    rt.debounceTimer = setTimeout(() => {
      rt.debounceTimer = null
      if (!item.enabled) return
      const fileDesc = rt.pendingChangedFile || relFile
      rt.pendingChangedFile = null
      item.reloadCount += 1
      item.lastTriggeredAt = Date.now()
      item.lastChangedFile = relFile
      const actionVerb = item.mode === 'restart-process' ? 'Hot-restarting process' : 'Running reload command'
      executeWatcherProcess(id, `🔥 Reload #${item.reloadCount} [${fileDesc}] — ${actionVerb}`)
    }, item.debounceMs)
  }

  fsWatcher
    .on('add', (p) => onFsEvent('added', p))
    .on('change', (p) => onFsEvent('modified', p))
    .on('unlink', (p) => onFsEvent('deleted', p))
    .on('error', (err) => {
      appendWatcherLog(item, `${formatTimePrefix()} ⚠️ Watcher error: ${(err as Error).message}`)
    })

  rt.fsWatcher = fsWatcher
  scheduleBroadcast(true)

  // If mode is 'restart-process', immediately launch the managed dev server
  if (item.mode === 'restart-process') {
    await executeWatcherProcess(id, '🚀 Starting managed dev process')
  }

  return getGitWatchers()
}

export async function stopGitWatcher(id: string, silent = false): Promise<GitWatcherItem[]> {
  ensureLoaded()
  const item = watchersMap.get(id)
  const rt = runtimeMap.get(id)

  if (rt) {
    if (rt.debounceTimer) {
      clearTimeout(rt.debounceTimer)
      rt.debounceTimer = null
    }
    if (rt.fsWatcher) {
      try {
        await rt.fsWatcher.close()
      } catch {
        // ignore
      }
      rt.fsWatcher = null
    }
    await stopChildProcess(id)
  }

  if (item) {
    const wasEnabled = item.enabled
    item.enabled = false
    item.status = 'stopped'
    item.pid = undefined
    if (wasEnabled && !silent) {
      appendWatcherLog(item, `${formatTimePrefix()} ⏹ Watcher "${item.name}" stopped.`)
    }
  }

  if (!silent) {
    scheduleBroadcast(true)
  }
  return getGitWatchers()
}

export async function triggerGitWatcherReload(id: string): Promise<GitWatcherItem[]> {
  ensureLoaded()
  const item = watchersMap.get(id)
  if (!item) return getGitWatchers()

  if (!item.enabled) {
    await startGitWatcher(id)
    if (item.mode === 'run-on-change') {
      item.reloadCount += 1
      item.lastTriggeredAt = Date.now()
      item.lastChangedFile = 'Manual trigger'
      await executeWatcherProcess(id, `⚡ Manual reload #${item.reloadCount}`)
    }
    return getGitWatchers()
  }

  item.reloadCount += 1
  item.lastTriggeredAt = Date.now()
  item.lastChangedFile = 'Manual trigger'
  await executeWatcherProcess(id, `⚡ Manual reload #${item.reloadCount}`)
  return getGitWatchers()
}

export async function saveGitWatcher(input: GitWatcherConfigInput): Promise<GitWatcherItem[]> {
  ensureLoaded()
  const resolvedRepo = resolve(input.repoPath.trim())
  const repoName = basename(resolvedRepo)
  const id = input.id && watchersMap.has(input.id) ? input.id : `watcher-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const existing = watchersMap.get(id)
  const wasEnabled = existing?.enabled ?? false

  if (wasEnabled) {
    await stopGitWatcher(id, true)
  }

  const item: GitWatcherItem = {
    id,
    name: input.name.trim() || `${repoName} Watcher`,
    repoPath: resolvedRepo,
    repoName,
    subPath: (input.subPath ?? '').trim(),
    command: input.command.trim() || 'npm run build',
    mode: input.mode === 'restart-process' ? 'restart-process' : 'run-on-change',
    extensions: (input.extensions ?? '*').trim() || '*',
    ignorePatterns: (input.ignorePatterns ?? DEFAULT_IGNORE_PATTERNS).trim() || DEFAULT_IGNORE_PATTERNS,
    debounceMs:
      typeof input.debounceMs === 'number' && !isNaN(input.debounceMs)
        ? Math.min(10000, Math.max(50, Math.round(input.debounceMs)))
        : 350,
    notifyOnError: input.notifyOnError !== false,
    enabled: false,
    status: 'stopped',
    reloadCount: existing?.reloadCount ?? 0,
    lastTriggeredAt: existing?.lastTriggeredAt,
    lastChangedFile: existing?.lastChangedFile,
    lastExitCode: existing?.lastExitCode ?? null,
    lastDurationMs: existing?.lastDurationMs,
    logLines: existing?.logLines ?? []
  }

  watchersMap.set(id, item)
  saveToDisk()

  if (input.startImmediately || wasEnabled) {
    await startGitWatcher(id)
  } else {
    scheduleBroadcast(true)
  }

  return getGitWatchers()
}

export async function deleteGitWatcher(id: string): Promise<GitWatcherItem[]> {
  ensureLoaded()
  await stopGitWatcher(id, true)
  watchersMap.delete(id)
  runtimeMap.delete(id)
  saveToDisk()
  scheduleBroadcast(true)
  return getGitWatchers()
}

export function clearGitWatcherLogs(id: string): GitWatcherItem[] {
  ensureLoaded()
  const item = watchersMap.get(id)
  if (item) {
    item.logLines = []
    scheduleBroadcast(true)
  }
  return getGitWatchers()
}

export function openGitWatcherInTerminal(id: string): void {
  ensureLoaded()
  const item = watchersMap.get(id)
  if (!item) return
  openTerminal()
  const safePath = item.repoPath.replace(/'/g, "''")
  runInTerminal(`Set-Location -LiteralPath '${safePath}'; ${item.command}`)
}

export async function stopAllGitWatchers(): Promise<GitWatcherItem[]> {
  ensureLoaded()
  const activeIds = Array.from(watchersMap.values())
    .filter((w) => w.enabled)
    .map((w) => w.id)

  for (const id of activeIds) {
    await stopGitWatcher(id, true)
  }
  scheduleBroadcast(true)
  return getGitWatchers()
}

export function getGitWatchers(): GitWatcherItem[] {
  ensureLoaded()
  return buildSnapshot()
}

export function detectRepoWatcherPresets(repoPath: string): GitProjectPreset[] {
  const presets: GitProjectPreset[] = []
  if (!repoPath || !existsSync(repoPath)) return presets

  const resolved = resolve(repoPath)

  // 1. Node / TypeScript / Electron / Vite (package.json)
  const pkgJsonPath = join(resolved, 'package.json')
  if (existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
      const scripts = (pkg?.scripts ?? {}) as Record<string, string>
      const pm = existsSync(join(resolved, 'pnpm-lock.yaml'))
        ? 'pnpm'
        : existsSync(join(resolved, 'yarn.lock'))
          ? 'yarn'
          : existsSync(join(resolved, 'bun.lockb')) || existsSync(join(resolved, 'bun.lock'))
            ? 'bun'
            : 'npm'

      const runCmd = (scriptName: string): string =>
        pm === 'yarn' ? `yarn ${scriptName}` : `${pm} run ${scriptName}`

      const priorityScripts: Array<{
        key: string
        mode: GitWatcherMode
        icon: string
        label: string
        desc: string
        exts: string
      }> = [
        {
          key: 'dev',
          mode: 'restart-process',
          icon: '🚀',
          label: `${runCmd('dev')} (Dev Server)`,
          desc: 'Starts dev server and hot-restarts on file changes',
          exts: '.ts,.tsx,.js,.jsx,.css,.json,.html'
        },
        {
          key: 'build',
          mode: 'run-on-change',
          icon: '🔨',
          label: `${runCmd('build')} (Build on Save)`,
          desc: 'Runs production/incremental build whenever source files change',
          exts: '.ts,.tsx,.js,.jsx,.css,.json'
        },
        {
          key: 'typecheck',
          mode: 'run-on-change',
          icon: '🔍',
          label: `${runCmd('typecheck')} (Typecheck)`,
          desc: 'Verifies TypeScript types on every file save',
          exts: '.ts,.tsx,.d.ts'
        },
        {
          key: 'start',
          mode: 'restart-process',
          icon: '▶️',
          label: `${runCmd('start')} (Managed Start)`,
          desc: 'Keeps start script running and restarts on file save',
          exts: '.ts,.tsx,.js,.jsx,.json'
        },
        {
          key: 'test',
          mode: 'run-on-change',
          icon: '🧪',
          label: `${runCmd('test')} (Test Runner)`,
          desc: 'Runs test suite automatically when files change',
          exts: '.ts,.tsx,.js,.jsx'
        },
        {
          key: 'lint',
          mode: 'run-on-change',
          icon: '✨',
          label: `${runCmd('lint')} (Linter)`,
          desc: 'Runs linter on file save',
          exts: '.ts,.tsx,.js,.jsx'
        }
      ]

      const addedScripts = new Set<string>()
      for (const p of priorityScripts) {
        if (typeof scripts[p.key] === 'string') {
          addedScripts.add(p.key)
          presets.push({
            id: `node-${p.key}`,
            label: p.label,
            command: runCmd(p.key),
            mode: p.mode,
            extensions: p.exts,
            icon: p.icon,
            description: `${p.desc} (${scripts[p.key]})`
          })
        }
      }

      // Add up to 3 other custom scripts from package.json
      for (const [scriptName, scriptVal] of Object.entries(scripts)) {
        if (addedScripts.has(scriptName) || presets.length >= 7) continue
        if (scriptName === 'postinstall' || scriptName === 'prepare') continue
        const isLongRunning = /dev|watch|serve|start/i.test(scriptName)
        presets.push({
          id: `node-${scriptName}`,
          label: `${runCmd(scriptName)}`,
          command: runCmd(scriptName),
          mode: isLongRunning ? 'restart-process' : 'run-on-change',
          extensions: '.ts,.tsx,.js,.jsx,.json,.css',
          icon: isLongRunning ? '🚀' : '⚡',
          description: String(scriptVal)
        })
      }
    } catch {
      // ignore package.json parse error
    }
  }

  // 2. Go (go.mod)
  if (existsSync(join(resolved, 'go.mod'))) {
    presets.push(
      {
        id: 'go-run',
        label: 'go run . (Managed Go Server)',
        command: 'go run .',
        mode: 'restart-process',
        extensions: '.go,.mod,.sum,.json,.yaml',
        icon: '🐹',
        description: 'Runs Go package and hot-restarts on .go file changes'
      },
      {
        id: 'go-build',
        label: 'go build ./... (Compile Check)',
        command: 'go build ./...',
        mode: 'run-on-change',
        extensions: '.go,.mod,.sum',
        icon: '🔨',
        description: 'Compiles all Go packages on every save'
      },
      {
        id: 'go-test',
        label: 'go test ./... (Go Tests)',
        command: 'go test ./...',
        mode: 'run-on-change',
        extensions: '.go',
        icon: '🧪',
        description: 'Runs Go unit tests on file save'
      }
    )
  }

  // 3. Rust (Cargo.toml)
  if (existsSync(join(resolved, 'Cargo.toml'))) {
    presets.push(
      {
        id: 'cargo-run',
        label: 'cargo run (Managed Rust Binary)',
        command: 'cargo run',
        mode: 'restart-process',
        extensions: '.rs,.toml',
        icon: '🦀',
        description: 'Builds & runs Rust binary, restarting on .rs changes'
      },
      {
        id: 'cargo-check',
        label: 'cargo check (Fast Check)',
        command: 'cargo check',
        mode: 'run-on-change',
        extensions: '.rs,.toml',
        icon: '🔍',
        description: 'Runs fast Rust compiler check on file save'
      }
    )
  }

  // 4. Python (pyproject.toml / requirements.txt / manage.py / app.py / main.py)
  if (
    existsSync(join(resolved, 'pyproject.toml')) ||
    existsSync(join(resolved, 'requirements.txt')) ||
    existsSync(join(resolved, 'manage.py')) ||
    existsSync(join(resolved, 'app.py')) ||
    existsSync(join(resolved, 'main.py'))
  ) {
    if (existsSync(join(resolved, 'manage.py'))) {
      presets.push({
        id: 'py-django',
        label: 'python manage.py runserver',
        command: 'python manage.py runserver',
        mode: 'restart-process',
        extensions: '.py,.html,.css,.json',
        icon: '🐍',
        description: 'Runs Django server and restarts on Python file changes'
      })
    } else if (existsSync(join(resolved, 'main.py')) || existsSync(join(resolved, 'app.py'))) {
      const entryFile = existsSync(join(resolved, 'main.py')) ? 'main.py' : 'app.py'
      presets.push({
        id: 'py-run',
        label: `python ${entryFile} (Hot Restart)`,
        command: `python ${entryFile}`,
        mode: 'restart-process',
        extensions: '.py,.json,.yaml,.toml',
        icon: '🐍',
        description: `Runs ${entryFile} and restarts when Python files are saved`
      })
    }
    presets.push({
      id: 'py-pytest',
      label: 'pytest (Run Tests on Save)',
      command: 'pytest',
      mode: 'run-on-change',
      extensions: '.py',
      icon: '🧪',
      description: 'Executes pytest suite when .py files change'
    })
  }

  // 5. Docker Compose
  if (
    existsSync(join(resolved, 'docker-compose.yml')) ||
    existsSync(join(resolved, 'docker-compose.yaml')) ||
    existsSync(join(resolved, 'compose.yml')) ||
    existsSync(join(resolved, 'compose.yaml'))
  ) {
    presets.push(
      {
        id: 'docker-up-build',
        label: 'docker compose up --build -d',
        command: 'docker compose up --build -d',
        mode: 'run-on-change',
        extensions: '*',
        icon: '🐳',
        description: 'Rebuilds and updates Docker Compose services on change'
      },
      {
        id: 'docker-restart',
        label: 'docker compose restart',
        command: 'docker compose restart',
        mode: 'run-on-change',
        extensions: '*',
        icon: '🔄',
        description: 'Restarts Docker Compose containers on file save'
      }
    )
  }

  // Fallback generic preset if nothing specific was found
  if (presets.length === 0) {
    presets.push(
      {
        id: 'generic-git-status',
        label: 'git status -s -b (Status Check)',
        command: 'git status -s -b',
        mode: 'run-on-change',
        extensions: '*',
        icon: '🔀',
        description: 'Logs working tree changes whenever files are modified'
      },
      {
        id: 'generic-custom-ps',
        label: 'Custom PowerShell Build / Reload',
        command: 'Write-Host "Files changed in $(Get-Location)"',
        mode: 'run-on-change',
        extensions: '*',
        icon: '⚡',
        description: 'Run any custom PowerShell script or build tool on save'
      }
    )
  }

  return presets
}

