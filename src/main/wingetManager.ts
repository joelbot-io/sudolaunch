import { execFile, spawn, type ChildProcess } from 'child_process'
import { promisify } from 'util'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { basename, join } from 'path'
import { BrowserWindow, ipcMain, shell } from 'electron'
import type {
  WingetPackageItem,
  WingetPinItem,
  WingetSearchResult,
  WingetPinOptions,
  WingetActionParams,
  WingetBatchActionParams,
  WingetOperationState,
  WingetPackageDetails,
  WingetSnapshotItem
} from '../shared/types'
import { dockManager } from './dock/DockManager'
import { addNotification } from './notifications'
import { openTerminal, runInTerminal } from './terminalWindow'

const execFileAsync = promisify(execFile)

let cachedWingetPath: string | null = null

function getWingetExecutable(): string {
  if (cachedWingetPath) return cachedWingetPath
  const localAppData = process.env.LOCALAPPDATA || ''
  if (localAppData) {
    const candidate = join(localAppData, 'Microsoft', 'WindowsApps', 'winget.exe')
    if (existsSync(candidate)) {
      cachedWingetPath = candidate
      return candidate
    }
  }
  cachedWingetPath = 'winget.exe'
  return cachedWingetPath
}

interface ParsedColumn {
  name: string
  start: number
  end: number | null
}

const KNOWN_HEADERS_REGEX =
  /\b(Name|Id|Version|Available|Match|Source|Pin type|Pinned version)\b/g

function cleanConsoleLine(rawLine: string): string {
  const withoutTrailingCr = rawLine.replace(/\r+$/, '')
  if (!withoutTrailingCr.includes('\r')) {
    return withoutTrailingCr
  }
  const segments = withoutTrailingCr.split('\r')
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i]
    if (seg.trim().length > 0) {
      return seg
    }
  }
  return ''
}

function parseColumnsFromHeader(headerLine: string): ParsedColumn[] {
  const matches: Array<{ name: string; index: number }> = []
  let m: RegExpExecArray | null
  const regex = new RegExp(KNOWN_HEADERS_REGEX.source, 'g')
  while ((m = regex.exec(headerLine)) !== null) {
    matches.push({ name: m[1].toLowerCase(), index: m.index })
  }

  if (matches.length >= 2) {
    return matches.map((col, idx) => ({
      name: col.name,
      start: col.index,
      end: idx + 1 < matches.length ? matches[idx + 1].index : null
    }))
  }

  // Fallback for unexpected/localized headers: split by words separated by spaces
  const fallbackMatches: Array<{ name: string; index: number }> = []
  const wordRegex = /\S+(?:\s\S+)?/g
  while ((m = wordRegex.exec(headerLine)) !== null) {
    fallbackMatches.push({ name: m[0].trim().toLowerCase(), index: m.index })
  }
  return fallbackMatches.map((col, idx) => ({
    name: col.name,
    start: col.index,
    end: idx + 1 < fallbackMatches.length ? fallbackMatches[idx + 1].index : null
  }))
}

function isFooterOrNoiseLine(trimmed: string): boolean {
  if (!trimmed) return true
  if (/^-{5,}$/.test(trimmed)) return true
  if (trimmed.startsWith('<additional entries')) return true
  if (/^\d+\s+upgrades?\s+available/i.test(trimmed)) return true
  if (/^\d+\s+package\(s\)\s+have\s+pins/i.test(trimmed)) return true
  if (/^There are no (pins|packages|available)/i.test(trimmed)) return true
  if (/^No (installed )?package found/i.test(trimmed)) return true
  if (/^Use the 'winget/i.test(trimmed)) return true
  if (/^Using the --include-pinned/i.test(trimmed)) return true
  if (/^The following packages/i.test(trimmed)) return true
  return false
}

export function parseWingetTable(stdout: string): Array<Record<string, string>> {
  const rawLines = stdout.split('\n').map(cleanConsoleLine)
  const rows: Array<Record<string, string>> = []

  let columns: ParsedColumn[] | null = null

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]
    const trimmed = line.trim()
    if (!trimmed) continue

    if (/^-{10,}$/.test(trimmed)) {
      // Find the header line immediately above the dashed separator
      for (let j = i - 1; j >= 0; j--) {
        const prev = rawLines[j]
        if (prev.trim().length > 0) {
          columns = parseColumnsFromHeader(prev)
          break
        }
      }
      continue
    }

    if (!columns || columns.length < 2) continue
    if (isFooterOrNoiseLine(trimmed)) continue

    const record: Record<string, string> = {}
    for (const col of columns) {
      if (col.start >= line.length) {
        record[col.name] = ''
      } else {
        const slice = col.end !== null ? line.slice(col.start, col.end) : line.slice(col.start)
        record[col.name] = slice.trim()
      }
    }

    if (record['name'] && record['id']) {
      rows.push(record)
    }
  }

  return rows
}

async function runWingetCapture(args: string[], timeoutMs = 25000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const exe = getWingetExecutable()
    execFile(
      exe,
      args,
      {
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env }
      },
      (err, stdout, stderr) => {
        const code = err && typeof (err as any).code === 'number' ? (err as any).code : err ? 1 : 0
        resolve({
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          exitCode: code
        })
      }
    )
  })
}

let cachedPins: { timestamp: number; items: WingetPinItem[] } | null = null
let inflightPins: Promise<WingetPinItem[]> | null = null

let cachedUpdates: { timestamp: number; items: WingetPackageItem[] } | null = null
let inflightUpdates: Promise<WingetPackageItem[]> | null = null

let cachedInstalled: { timestamp: number; items: WingetPackageItem[] } | null = null
let inflightInstalled: Promise<WingetPackageItem[]> | null = null

let currentOperation: WingetOperationState | null = null
let activeChildProcess: ChildProcess | null = null

function broadcastToRenderers(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }
  dockManager.sendToBar(channel, ...args)
}

function broadcastOperationState(): void {
  broadcastToRenderers('winget-operation-progress', currentOperation)
}

function broadcastUpdatesCount(count: number): void {
  broadcastToRenderers('winget-updates-count', count)
}

export async function getWingetPins(force = false): Promise<WingetPinItem[]> {
  if (!force && cachedPins && Date.now() - cachedPins.timestamp < 15000) {
    return cachedPins.items
  }
  if (inflightPins) return inflightPins

  inflightPins = (async () => {
    try {
      const { stdout } = await runWingetCapture(['pin', 'list', '--disable-interactivity'], 12000)
      const records = parseWingetTable(stdout)
      const items: WingetPinItem[] = records.map((r) => ({
        name: r['name'] || r['id'],
        id: r['id'],
        version: r['version'] || '',
        source: r['source'] || 'winget',
        pinType: r['pin type'] || 'Pinning',
        pinnedVersion: r['pinned version'] || undefined
      }))
      cachedPins = { timestamp: Date.now(), items }
      return items
    } catch {
      return cachedPins?.items ?? []
    } finally {
      inflightPins = null
    }
  })()

  return inflightPins
}

export async function getWingetUpdates(force = false): Promise<WingetPackageItem[]> {
  if (!force && cachedUpdates && Date.now() - cachedUpdates.timestamp < 20000) {
    return cachedUpdates.items
  }
  if (inflightUpdates) return inflightUpdates

  inflightUpdates = (async () => {
    try {
      const [upgradeRes, pins] = await Promise.all([
        runWingetCapture(
          ['upgrade', '--include-pinned', '--accept-source-agreements', '--disable-interactivity'],
          25000
        ),
        getWingetPins(force)
      ])
      const pinMap = new Map<string, WingetPinItem>()
      for (const p of pins) {
        pinMap.set(p.id.toLowerCase(), p)
      }

      const records = parseWingetTable(upgradeRes.stdout)
      const items: WingetPackageItem[] = records
        .filter((r) => Boolean(r['available']))
        .map((r) => {
          const pin = pinMap.get(r['id'].toLowerCase())
          return {
            name: r['name'] || r['id'],
            id: r['id'],
            version: r['version'] || 'Unknown',
            available: r['available'] || undefined,
            source: r['source'] || 'winget',
            isPinned: Boolean(pin),
            pinType: pin?.pinType,
            pinnedVersion: pin?.pinnedVersion
          }
        })

      cachedUpdates = { timestamp: Date.now(), items }
      broadcastUpdatesCount(items.length)
      return items
    } catch {
      return cachedUpdates?.items ?? []
    } finally {
      inflightUpdates = null
    }
  })()

  return inflightUpdates
}

export async function getWingetInstalled(force = false): Promise<WingetPackageItem[]> {
  if (!force && cachedInstalled && Date.now() - cachedInstalled.timestamp < 30000) {
    return cachedInstalled.items
  }
  if (inflightInstalled) return inflightInstalled

  inflightInstalled = (async () => {
    try {
      const [listRes, pins] = await Promise.all([
        runWingetCapture(['list', '--accept-source-agreements', '--disable-interactivity'], 30000),
        getWingetPins(force)
      ])
      const pinMap = new Map<string, WingetPinItem>()
      for (const p of pins) {
        pinMap.set(p.id.toLowerCase(), p)
      }

      const records = parseWingetTable(listRes.stdout)
      const items: WingetPackageItem[] = records.map((r) => {
        const pin = pinMap.get(r['id'].toLowerCase())
        return {
          name: r['name'] || r['id'],
          id: r['id'],
          version: r['version'] || 'Unknown',
          available: r['available'] || undefined,
          source: r['source'] || undefined,
          isPinned: Boolean(pin),
          pinType: pin?.pinType,
          pinnedVersion: pin?.pinnedVersion
        }
      })

      items.sort((a, b) => {
        // Put winget-managed packages with updates or pins near the top, then alphabetical
        const aHasUpdate = Boolean(a.available)
        const bHasUpdate = Boolean(b.available)
        if (aHasUpdate !== bHasUpdate) return aHasUpdate ? -1 : 1
        const aWinget = a.source === 'winget'
        const bWinget = b.source === 'winget'
        if (aWinget !== bWinget) return aWinget ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      cachedInstalled = { timestamp: Date.now(), items }
      return items
    } catch {
      return cachedInstalled?.items ?? []
    } finally {
      inflightInstalled = null
    }
  })()

  return inflightInstalled
}

export async function searchWingetCatalog(query: string): Promise<WingetSearchResult[]> {
  const clean = query.trim()
  if (!clean) return []

  const { stdout } = await runWingetCapture(
    ['search', '-q', clean, '--accept-source-agreements', '--disable-interactivity', '-n', '40'],
    20000
  )
  const records = parseWingetTable(stdout)
  const installedList = cachedInstalled?.items ?? []
  const installedMap = new Map<string, string>()
  for (const pkg of installedList) {
    installedMap.set(pkg.id.toLowerCase(), pkg.version)
  }

  return records.map((r) => {
    const lowerId = r['id'].toLowerCase()
    const installedVer = installedMap.get(lowerId)
    return {
      name: r['name'] || r['id'],
      id: r['id'],
      version: r['version'] || '',
      match: r['match'] || undefined,
      source: r['source'] || 'winget',
      isInstalled: installedVer !== undefined,
      installedVersion: installedVer
    }
  })
}

function invalidateAllCaches(): void {
  cachedPins = null
  cachedUpdates = null
  cachedInstalled = null
}

function syncCachesPinnedFlag(pins: WingetPinItem[]): void {
  const pinMap = new Map<string, WingetPinItem>()
  for (const p of pins) {
    pinMap.set(p.id.toLowerCase(), p)
  }
  if (cachedUpdates) {
    cachedUpdates.items = cachedUpdates.items.map((item) => {
      const pin = pinMap.get(item.id.toLowerCase())
      return {
        ...item,
        isPinned: Boolean(pin),
        pinType: pin?.pinType,
        pinnedVersion: pin?.pinnedVersion
      }
    })
  }
  if (cachedInstalled) {
    cachedInstalled.items = cachedInstalled.items.map((item) => {
      const pin = pinMap.get(item.id.toLowerCase())
      return {
        ...item,
        isPinned: Boolean(pin),
        pinType: pin?.pinType,
        pinnedVersion: pin?.pinnedVersion
      }
    })
  }
}

async function runElevatedWingetWait(wingetArgs: string[]): Promise<{ success: boolean; message: string }> {
  const quotedArgs = wingetArgs
    .map((a) => `'${String(a).replace(/'/g, "''")}'`)
    .join(' ')
  const innerCmd = `& winget ${quotedArgs}`
  const encodedInner = Buffer.from(innerCmd, 'utf16le').toString('base64')
  const psScript = `
    $p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', '${encodedInner}')
    if ($p -and $p.ExitCode -eq 0) { exit 0 } else { exit 1 }
  `
  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
      timeout: 300000,
      windowsHide: true
    })
    return { success: true, message: `Completed elevated command: winget ${wingetArgs.join(' ')}` }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Elevated command failed or was canceled'
    }
  }
}

export async function addWingetPin(options: WingetPinOptions): Promise<{ success: boolean; message: string; pins: WingetPinItem[] }> {
  const args = ['pin', 'add', '--id', options.id, '--exact', '--force', '--disable-interactivity']
  if (options.mode === 'blocking') {
    args.push('--blocking')
  } else if (options.mode === 'version' || options.mode === 'installed') {
    if (options.versionPattern) {
      args.push('--version', options.versionPattern)
    }
  }

  if (options.elevated) {
    const res = await runElevatedWingetWait(args)
    const pins = await getWingetPins(true)
    syncCachesPinnedFlag(pins)
    return { success: res.success, message: res.message, pins }
  }

  const { stdout, stderr, exitCode } = await runWingetCapture(args, 15000)
  const combined = `${stdout}\n${stderr}`.split('\n').map(cleanConsoleLine).filter(Boolean)
  const lastLine = combined[combined.length - 1] || (exitCode === 0 ? 'Pin added successfully' : 'Failed to add pin')
  const pins = await getWingetPins(true)
  syncCachesPinnedFlag(pins)
  return {
    success: exitCode === 0,
    message: lastLine,
    pins
  }
}

export async function removeWingetPin(
  id: string,
  elevated?: boolean
): Promise<{ success: boolean; message: string; pins: WingetPinItem[] }> {
  const args = ['pin', 'remove', '--id', id, '--exact', '--disable-interactivity']

  if (elevated) {
    const res = await runElevatedWingetWait(args)
    const pins = await getWingetPins(true)
    syncCachesPinnedFlag(pins)
    return { success: res.success, message: res.message, pins }
  }

  const { stdout, stderr, exitCode } = await runWingetCapture(args, 15000)
  const combined = `${stdout}\n${stderr}`.split('\n').map(cleanConsoleLine).filter(Boolean)
  const lastLine = combined[combined.length - 1] || (exitCode === 0 ? 'Pin removed successfully' : 'Failed to remove pin')
  const pins = await getWingetPins(true)
  syncCachesPinnedFlag(pins)
  return {
    success: exitCode === 0,
    message: lastLine,
    pins
  }
}

export async function resetWingetPins(
  elevated?: boolean
): Promise<{ success: boolean; message: string; pins: WingetPinItem[] }> {
  const args = ['pin', 'reset', '--force', '--disable-interactivity']

  if (elevated) {
    const res = await runElevatedWingetWait(args)
    const pins = await getWingetPins(true)
    syncCachesPinnedFlag(pins)
    return { success: res.success, message: res.message, pins }
  }

  const { stdout, stderr, exitCode } = await runWingetCapture(args, 15000)
  const combined = `${stdout}\n${stderr}`.split('\n').map(cleanConsoleLine).filter(Boolean)
  const lastLine = combined[combined.length - 1] || (exitCode === 0 ? 'All pins reset' : 'Failed to reset pins')
  const pins = await getWingetPins(true)
  syncCachesPinnedFlag(pins)
  return {
    success: exitCode === 0,
    message: lastLine,
    pins
  }
}

let batchCancelRequested = false

export function getWingetOperationState(): WingetOperationState | null {
  return currentOperation
}

export function cancelWingetOperation(): boolean {
  batchCancelRequested = true
  if (activeChildProcess && !activeChildProcess.killed) {
    activeChildProcess.kill()
    activeChildProcess = null
    if (currentOperation && currentOperation.status === 'running') {
      currentOperation = {
        ...currentOperation,
        status: 'error',
        progressText: 'Operation canceled by user',
        logLines: [...currentOperation.logLines, 'Operation canceled by user.']
      }
      broadcastOperationState()
    }
    return true
  }
  return false
}

function buildCliArgsForAction(params: WingetActionParams): string[] {
  const args: string[] = []
  switch (params.action) {
    case 'install':
      args.push(
        'install',
        '--id',
        params.id ?? '',
        '--exact',
        '--accept-package-agreements',
        '--accept-source-agreements'
      )
      if (params.version) args.push('--version', params.version)
      if (params.scope === 'user' || params.scope === 'machine') {
        args.push('--scope', params.scope)
      }
      if (params.interactive) {
        args.push('--interactive')
      } else {
        args.push('--disable-interactivity')
      }
      if (params.force) args.push('--force')
      return args
    case 'upgrade': {
      args.push(
        'upgrade',
        '--id',
        params.id ?? '',
        '--exact',
        '--accept-package-agreements',
        '--accept-source-agreements'
      )
      if (params.version) args.push('--version', params.version)
      if (params.scope === 'user' || params.scope === 'machine') {
        args.push('--scope', params.scope)
      }
      if (params.interactive) {
        args.push('--interactive')
      } else {
        args.push('--disable-interactivity')
      }
      if (params.force) args.push('--force')
      if (params.includePinned) args.push('--include-pinned')
      return args
    }
    case 'upgrade-all': {
      args.push(
        'upgrade',
        '--all',
        '--accept-package-agreements',
        '--accept-source-agreements',
        '--disable-interactivity'
      )
      if (params.includePinned) args.push('--include-pinned')
      return args
    }
    case 'uninstall':
      args.push(
        'uninstall',
        '--id',
        params.id ?? '',
        '--exact',
        '--accept-source-agreements'
      )
      if (params.interactive) {
        args.push('--interactive')
      } else {
        args.push('--disable-interactivity')
      }
      if (params.force) args.push('--force')
      return args
  }
}

function buildTerminalCommandString(params: WingetActionParams): string {
  const safeId = (params.id ?? '').replace(/"/g, '')
  const verFlag = params.version ? ` --version "${params.version.replace(/"/g, '')}"` : ''
  const scopeFlag =
    params.scope === 'user' || params.scope === 'machine' ? ` --scope ${params.scope}` : ''
  const interactiveFlag = params.interactive ? ' --interactive' : ''
  const forceFlag = params.force ? ' --force' : ''
  switch (params.action) {
    case 'install':
      return `winget install --id "${safeId}" --exact${verFlag}${scopeFlag}${interactiveFlag}${forceFlag}`
    case 'upgrade':
      return `winget upgrade --id "${safeId}" --exact${verFlag}${scopeFlag}${interactiveFlag}${forceFlag}${params.includePinned ? ' --include-pinned' : ''}`
    case 'upgrade-all':
      return `winget upgrade --all${params.includePinned ? ' --include-pinned' : ''}`
    case 'uninstall':
      return `winget uninstall --id "${safeId}" --exact${interactiveFlag}${forceFlag}`
  }
}

export async function runWingetAction(
  params: WingetActionParams
): Promise<{ started: boolean; mode: 'in-panel' | 'elevated' | 'terminal'; message?: string }> {
  if (params.inTerminal) {
    const cmd = buildTerminalCommandString(params)
    runInTerminal(cmd)
    openTerminal()
    return { started: true, mode: 'terminal', message: `Sent "${cmd}" to SudoLaunch Terminal` }
  }

  if (currentOperation && currentOperation.status === 'running') {
    return {
      started: false,
      mode: params.elevated ? 'elevated' : 'in-panel',
      message: 'Another WinGet operation is already in progress'
    }
  }

  batchCancelRequested = false
  const args = buildCliArgsForAction(params)
  const displayTitle =
    params.action === 'upgrade-all'
      ? 'All Outdated Packages'
      : params.name || params.id || 'Package'

  const opId = `${params.action}-${Date.now()}`
  currentOperation = {
    id: opId,
    action: params.action,
    packageId: params.id,
    packageName: displayTitle,
    status: 'running',
    progressText: params.elevated
      ? `Running elevated (UAC): winget ${params.action} ${params.id ?? '--all'}...`
      : `Starting winget ${params.action} ${params.id ?? '--all'}...`,
    logLines: [`> winget ${args.join(' ')}`],
    elevated: Boolean(params.elevated),
    startedAt: Date.now()
  }
  broadcastOperationState()

  if (params.elevated) {
    ;(async () => {
      const res = await runElevatedWingetWait(args)
      if (!currentOperation || currentOperation.id !== opId) return
      currentOperation = {
        ...currentOperation,
        status: res.success ? 'success' : 'error',
        progressText: res.success
          ? `Successfully completed ${params.action} for ${displayTitle}`
          : `Failed or canceled ${params.action} for ${displayTitle}`,
        logLines: [...currentOperation.logLines, res.message]
      }
      broadcastOperationState()
      invalidateAllCaches()
      void getWingetUpdates(true)
      addNotification({
        title: `WinGet ${params.action} (${displayTitle}): ${res.success ? 'Succeeded' : 'Failed'}`,
        body: res.message,
        type: res.success ? 'success' : 'error',
        commandName: 'system',
        commandInput: `winget ${args.join(' ')}`
      })
    })()
    return { started: true, mode: 'elevated' }
  }

  // Standard streaming in-panel process
  const exe = getWingetExecutable()
  const child = spawn(exe, args, {
    windowsHide: true,
    env: { ...process.env }
  })
  activeChildProcess = child

  const handleChunk = (chunk: Buffer): void => {
    if (!currentOperation || currentOperation.id !== opId) return
    const text = chunk.toString('utf8')
    const rawParts = text.split(/\r|\n/)
    const meaningfulLines: string[] = []

    for (const part of rawParts) {
      const trimmed = part.trim()
      if (!trimmed) continue
      if (/^[-\\|/]$/.test(trimmed)) continue
      meaningfulLines.push(trimmed)
    }

    if (meaningfulLines.length === 0) return
    const latest = meaningfulLines[meaningfulLines.length - 1]
    const updatedLogs = [...currentOperation.logLines]
    for (const line of meaningfulLines) {
      if (updatedLogs[updatedLogs.length - 1] !== line) {
        updatedLogs.push(line)
      }
    }
    if (updatedLogs.length > 80) {
      updatedLogs.splice(0, updatedLogs.length - 80)
    }

    currentOperation = {
      ...currentOperation,
      progressText: latest,
      logLines: updatedLogs
    }
    broadcastOperationState()
  }

  child.stdout?.on('data', handleChunk)
  child.stderr?.on('data', handleChunk)

  child.on('error', (err) => {
    activeChildProcess = null
    if (!currentOperation || currentOperation.id !== opId) return
    currentOperation = {
      ...currentOperation,
      status: 'error',
      progressText: `Error: ${err.message}`,
      logLines: [...currentOperation.logLines, `Error: ${err.message}`]
    }
    broadcastOperationState()
  })

  child.on('close', (code) => {
    activeChildProcess = null
    if (!currentOperation || currentOperation.id !== opId) return
    const ok = code === 0
    const finalMsg = ok
      ? `Completed ${params.action} for ${displayTitle}`
      : `${params.action} exited with code ${code ?? 1} (try 🛡️ Admin toggle if installer requires elevation)`
    currentOperation = {
      ...currentOperation,
      status: ok ? 'success' : 'error',
      progressText: finalMsg,
      logLines: [...currentOperation.logLines, finalMsg]
    }
    broadcastOperationState()
    invalidateAllCaches()
    void getWingetUpdates(true)
    addNotification({
      title: `WinGet ${params.action}: ${displayTitle}`,
      body: currentOperation.logLines.slice(-6).join('\n'),
      type: ok ? 'success' : 'error',
      commandName: 'system',
      commandInput: `winget ${args.join(' ')}`
    })
  })

  return { started: true, mode: 'in-panel' }
}

function runSingleChildWait(
  opId: string,
  args: string[],
  stepPrefix: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const exe = getWingetExecutable()
    const child = spawn(exe, args, {
      windowsHide: true,
      env: { ...process.env }
    })
    activeChildProcess = child

    const handleChunk = (chunk: Buffer): void => {
      if (!currentOperation || currentOperation.id !== opId) return
      const text = chunk.toString('utf8')
      const rawParts = text.split(/\r|\n/)
      const meaningfulLines: string[] = []
      for (const part of rawParts) {
        const trimmed = part.trim()
        if (!trimmed || /^[-\\|/]$/.test(trimmed)) continue
        meaningfulLines.push(trimmed)
      }
      if (meaningfulLines.length === 0) return
      const latest = meaningfulLines[meaningfulLines.length - 1]
      const updatedLogs = [...currentOperation.logLines]
      for (const line of meaningfulLines) {
        if (updatedLogs[updatedLogs.length - 1] !== line) {
          updatedLogs.push(line)
        }
      }
      if (updatedLogs.length > 100) {
        updatedLogs.splice(0, updatedLogs.length - 100)
      }
      currentOperation = {
        ...currentOperation,
        progressText: `${stepPrefix} ${latest}`,
        logLines: updatedLogs
      }
      broadcastOperationState()
    }

    child.stdout?.on('data', handleChunk)
    child.stderr?.on('data', handleChunk)
    child.on('error', () => {
      activeChildProcess = null
      resolve(false)
    })
    child.on('close', (code) => {
      activeChildProcess = null
      resolve(code === 0)
    })
  })
}

export async function runWingetBatchAction(
  params: WingetBatchActionParams
): Promise<{ started: boolean; message?: string }> {
  if (!params.packages || params.packages.length === 0) {
    return { started: false, message: 'No packages selected' }
  }
  if (currentOperation && currentOperation.status === 'running') {
    return { started: false, message: 'Another WinGet operation is already in progress' }
  }

  batchCancelRequested = false
  const total = params.packages.length
  const opId = `batch-${params.action}-${Date.now()}`
  currentOperation = {
    id: opId,
    action: 'batch',
    packageName: `Batch ${params.action} (${total} packages)`,
    status: 'running',
    progressText: `[1/${total}] Starting batch ${params.action}...`,
    logLines: [`Starting batch ${params.action} for ${total} packages...`],
    elevated: Boolean(params.elevated),
    startedAt: Date.now(),
    batchCurrent: 1,
    batchTotal: total
  }
  broadcastOperationState()

  ;(async () => {
    let succeeded = 0
    let failed = 0
    for (let i = 0; i < total; i++) {
      if (batchCancelRequested || !currentOperation || currentOperation.id !== opId) {
        break
      }
      const pkg = params.packages[i]
      const stepPrefix = `[${i + 1}/${total}] (${pkg.name}):`
      const args = buildCliArgsForAction({
        action: params.action,
        id: pkg.id,
        name: pkg.name,
        elevated: params.elevated,
        includePinned: params.includePinned ?? true
      })

      currentOperation = {
        ...currentOperation,
        batchCurrent: i + 1,
        progressText: `${stepPrefix} Running winget ${params.action} ${pkg.id}...`,
        logLines: [...currentOperation.logLines, `\n> [${i + 1}/${total}] winget ${args.join(' ')}`]
      }
      broadcastOperationState()

      let ok = false
      if (params.elevated) {
        const res = await runElevatedWingetWait(args)
        ok = res.success
      } else {
        ok = await runSingleChildWait(opId, args, stepPrefix)
      }

      if (ok) {
        succeeded++
      } else {
        failed++
      }
    }

    if (!currentOperation || currentOperation.id !== opId) return
    const summary = batchCancelRequested
      ? `Batch canceled (${succeeded}/${total} completed)`
      : `Batch ${params.action} finished: ${succeeded} succeeded${failed > 0 ? `, ${failed} failed` : ''}`

    currentOperation = {
      ...currentOperation,
      status: failed === 0 && !batchCancelRequested ? 'success' : 'error',
      progressText: summary,
      logLines: [...currentOperation.logLines, summary]
    }
    broadcastOperationState()
    invalidateAllCaches()
    void getWingetUpdates(true)
    addNotification({
      title: `WinGet Batch ${params.action}`,
      body: summary,
      type: failed === 0 && !batchCancelRequested ? 'success' : 'info',
      commandName: 'system'
    })
  })()

  return { started: true, message: `Started batch ${params.action} for ${total} packages` }
}

// ============================================================================
// Package Inspector Details (winget show --id <id>)
// ============================================================================

const detailsCache = new Map<string, { ts: number; data: WingetPackageDetails }>()

export async function getWingetPackageDetails(id: string): Promise<WingetPackageDetails | null> {
  const cleanId = id.trim()
  if (!cleanId) return null

  const cached = detailsCache.get(cleanId.toLowerCase())
  if (cached && Date.now() - cached.ts < 120_000) {
    return cached.data
  }

  const [showRes, verRes] = await Promise.all([
    runWingetCapture(
      ['show', '--id', cleanId, '--exact', '--accept-source-agreements', '--disable-interactivity'],
      15000
    ),
    runWingetCapture(
      ['show', '--id', cleanId, '--exact', '--versions', '--accept-source-agreements', '--disable-interactivity'],
      15000
    )
  ])

  const details: WingetPackageDetails = {
    id: cleanId,
    name: cleanId,
    version: '',
    tags: [],
    availableVersions: []
  }

  const lines = showRes.stdout.split('\n').map(cleanConsoleLine)
  let currentSection: 'none' | 'description' | 'releaseNotes' | 'tags' | 'installer' = 'none'
  const descLines: string[] = []
  const notesLines: string[] = []

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue

    const foundMatch = /^Found\s+(.+?)\s+\[([^\]]+)\]/.exec(rawLine.trim())
    if (foundMatch) {
      details.name = foundMatch[1].trim()
      details.id = foundMatch[2].trim()
      continue
    }

    const isIndented = /^\s{2,}/.test(rawLine)
    const trimmed = rawLine.trim()

    if (isIndented) {
      if (currentSection === 'description') {
        descLines.push(trimmed)
      } else if (currentSection === 'releaseNotes') {
        notesLines.push(trimmed)
      } else if (currentSection === 'tags') {
        if (trimmed && !trimmed.includes(':')) {
          details.tags?.push(trimmed)
        }
      } else if (currentSection === 'installer') {
        const kv = /^([^:]+):\s*(.*)$/.exec(trimmed)
        if (kv) {
          const k = kv[1].trim().toLowerCase()
          const v = kv[2].trim()
          if (k === 'installer type') details.installerType = v
          else if (k === 'installer url') details.installerUrl = v
        }
      }
      continue
    }

    const kv = /^([^:]+):\s*(.*)$/.exec(trimmed)
    if (kv) {
      const key = kv[1].trim().toLowerCase()
      const val = kv[2].trim()
      currentSection = 'none'

      if (key === 'version') details.version = val
      else if (key === 'publisher') details.publisher = val
      else if (key === 'publisher url') details.publisherUrl = val
      else if (key === 'author') details.author = val
      else if (key === 'moniker') details.moniker = val
      else if (key === 'homepage') details.homepage = val
      else if (key === 'license') details.license = val
      else if (key === 'license url') details.licenseUrl = val
      else if (key === 'release notes url') details.releaseNotesUrl = val
      else if (key === 'description') {
        currentSection = 'description'
        if (val) descLines.push(val)
      } else if (key === 'release notes') {
        currentSection = 'releaseNotes'
        if (val) notesLines.push(val)
      } else if (key === 'tags') {
        currentSection = 'tags'
      } else if (key === 'installer') {
        currentSection = 'installer'
      }
    }
  }

  if (descLines.length > 0) details.description = descLines.join(' ')
  if (notesLines.length > 0) details.releaseNotes = notesLines.join('\n')

  // Parse available versions
  const verLines = verRes.stdout.split('\n').map(cleanConsoleLine)
  let pastSeparator = false
  for (const vLine of verLines) {
    const t = vLine.trim()
    if (!t) continue
    if (/^-{5,}$/.test(t)) {
      pastSeparator = true
      continue
    }
    if (pastSeparator && !isFooterOrNoiseLine(t)) {
      details.availableVersions.push(t)
    }
  }

  if (details.availableVersions.length === 0 && details.version) {
    details.availableVersions = [details.version]
  }

  detailsCache.set(cleanId.toLowerCase(), { ts: Date.now(), data: details })
  return details
}

// ============================================================================
// WinGet Workstation Snapshots (Export / Import Packages + Pins)
// ============================================================================

function getSnapshotsDir(): string {
  const dir = join(homedir(), '.sudolaunch', 'winget-snapshots')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function listWingetSnapshots(): WingetSnapshotItem[] {
  try {
    const dir = getSnapshotsDir()
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
    const items: WingetSnapshotItem[] = []
    for (const file of files) {
      try {
        const fullPath = join(dir, file)
        const stat = statSync(fullPath)
        const raw = JSON.parse(readFileSync(fullPath, 'utf8'))
        const pkgCount =
          raw?.sudolaunchMeta?.packages?.length ??
          raw?.Sources?.[0]?.Packages?.length ??
          0
        const pinCount = raw?.sudolaunchMeta?.pins?.length ?? 0
        items.push({
          filename: file,
          name: raw?.sudolaunchMeta?.name || file.replace(/\.json$/i, ''),
          createdAt: raw?.sudolaunchMeta?.createdAt || new Date(stat.mtimeMs).toLocaleString(),
          timestamp: raw?.sudolaunchMeta?.timestamp || stat.mtimeMs,
          packageCount: pkgCount,
          pinCount,
          sizeKb: Math.max(1, Math.round(stat.size / 1024))
        })
      } catch {
        // skip malformed file
      }
    }
    return items.sort((a, b) => b.timestamp - a.timestamp)
  } catch {
    return []
  }
}

export async function createWingetSnapshot(
  label?: string
): Promise<{ success: boolean; message: string; snapshots: WingetSnapshotItem[] }> {
  try {
    const [installedList, pinList] = await Promise.all([
      getWingetInstalled(true),
      getWingetPins(true)
    ])
    const wingetManaged = installedList.filter((p) => p.source === 'winget')
    const now = new Date()
    const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const cleanLabel = (label || 'Workstation Snapshot').trim()
    const slug = cleanLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'snapshot'
    const filename = `winget-${stamp}-${slug}.json`
    const fullPath = join(getSnapshotsDir(), filename)

    // Standard WinGet export JSON schema + SudoLaunch Pin & Metadata extension
    const payload = {
      $schema: 'https://aka.ms/winget-packages.schema.2.0.json',
      CreationDate: now.toISOString(),
      Sources: [
        {
          Packages: wingetManaged.map((p) => ({
            PackageIdentifier: p.id,
            Version: p.version
          })),
          SourceDetails: {
            Argument: 'https://cdn.winget.microsoft.com/cache',
            Identifier: 'Microsoft.Winget.Source_8wekyb3d8bbwe',
            Name: 'winget',
            Type: 'Microsoft.PreIndexed.Package'
          }
        }
      ],
      sudolaunchMeta: {
        name: cleanLabel,
        createdAt: now.toLocaleString(),
        timestamp: Date.now(),
        packages: wingetManaged,
        pins: pinList
      }
    }

    writeFileSync(fullPath, JSON.stringify(payload, null, 2), 'utf8')
    return {
      success: true,
      message: `Saved snapshot "${cleanLabel}" (${wingetManaged.length} packages, ${pinList.length} pins)`,
      snapshots: listWingetSnapshots()
    }
  } catch (err) {
    return {
      success: false,
      message: `Snapshot export failed: ${err}`,
      snapshots: listWingetSnapshots()
    }
  }
}

function sanitizeSnapshotFilename(filename: string): string | null {
  const clean = basename((filename || '').trim())
  if (!clean || !/^[a-zA-Z0-9._-]+\.json$/i.test(clean)) return null
  return clean
}

export async function restoreWingetSnapshot(
  filename: string,
  mode: 'pins-only' | 'full-import'
): Promise<{ success: boolean; message: string }> {
  try {
    const safeFilename = sanitizeSnapshotFilename(filename)
    if (!safeFilename) {
      return { success: false, message: 'Invalid snapshot filename' }
    }
    const fullPath = join(getSnapshotsDir(), safeFilename)
    if (!existsSync(fullPath)) {
      return { success: false, message: 'Snapshot file not found' }
    }
    const raw = JSON.parse(readFileSync(fullPath, 'utf8'))
    const savedPins: WingetPinItem[] = raw?.sudolaunchMeta?.pins ?? []

    let restoredPins = 0
    for (const pin of savedPins) {
      if (!pin?.id) continue
      const pinMode =
        pin.pinType === 'Blocking'
          ? 'blocking'
          : pin.pinType === 'Gating'
            ? 'version'
            : 'standard'
      const res = await addWingetPin({
        id: pin.id,
        mode: pinMode,
        versionPattern: pin.pinnedVersion
      })
      if (res.success) restoredPins++
    }

    if (mode === 'pins-only') {
      return {
        success: true,
        message: `Restored ${restoredPins}/${savedPins.length} package pins from ${safeFilename}`
      }
    }

    // For full package import, launch `winget import` in the persistent terminal so user sees full progress
    const safePath = fullPath.replace(/"/g, '')
    runInTerminal(`winget import -i "${safePath}" --accept-package-agreements --accept-source-agreements --ignore-unavailable`)
    openTerminal()
    return {
      success: true,
      message: `Restored ${restoredPins} pins & started "winget import" in Terminal`
    }
  } catch (err) {
    return { success: false, message: `Restore failed: ${err}` }
  }
}

export function deleteWingetSnapshot(filename: string): WingetSnapshotItem[] {
  try {
    const safeFilename = sanitizeSnapshotFilename(filename)
    if (safeFilename) {
      const fullPath = join(getSnapshotsDir(), safeFilename)
      if (existsSync(fullPath)) {
        unlinkSync(fullPath)
      }
    }
  } catch {
    // ignore
  }
  return listWingetSnapshots()
}

export function openWingetSnapshotsFolder(): void {
  shell.openPath(getSnapshotsDir())
}

// ============================================================================
// Background Update Polling
// ============================================================================

let pollingTimer: NodeJS.Timeout | null = null
let lastNotifiedUpdateCount = -1

export function startWingetBackgroundPolling(): void {
  if (pollingTimer) return

  const checkRoutine = async (): Promise<void> => {
    try {
      const updates = await getWingetUpdates(true)
      const unpinnedCount = updates.filter((u) => !u.isPinned).length
      if (unpinnedCount > 0 && unpinnedCount !== lastNotifiedUpdateCount) {
        lastNotifiedUpdateCount = unpinnedCount
      }
    } catch {
      // ignore background errors
    }
  }

  // Initial check 20s after startup so app boot is completely unblocked
  setTimeout(() => {
    void checkRoutine()
  }, 20_000)

  // Re-check every 4 hours
  pollingTimer = setInterval(() => {
    void checkRoutine()
  }, 4 * 60 * 60 * 1000)
}

export function registerWingetIpc(): void {
  ipcMain.handle('winget-get-updates', (_event, force?: boolean) => getWingetUpdates(Boolean(force)))
  ipcMain.handle('winget-get-installed', (_event, force?: boolean) => getWingetInstalled(Boolean(force)))
  ipcMain.handle('winget-get-pins', (_event, force?: boolean) => getWingetPins(Boolean(force)))
  ipcMain.handle('winget-search', (_event, query: string) => searchWingetCatalog(query))
  ipcMain.handle('winget-get-details', (_event, id: string) => getWingetPackageDetails(id))
  ipcMain.handle('winget-pin-add', (_event, options: WingetPinOptions) => addWingetPin(options))
  ipcMain.handle('winget-pin-remove', (_event, id: string, elevated?: boolean) => removeWingetPin(id, elevated))
  ipcMain.handle('winget-pin-reset', (_event, elevated?: boolean) => resetWingetPins(elevated))
  ipcMain.handle('winget-run-action', (_event, params: WingetActionParams) => runWingetAction(params))
  ipcMain.handle('winget-run-batch', (_event, params: WingetBatchActionParams) => runWingetBatchAction(params))
  ipcMain.handle('winget-cancel-op', () => cancelWingetOperation())
  ipcMain.handle('winget-get-op-state', () => getWingetOperationState())
  ipcMain.handle('winget-list-snapshots', () => listWingetSnapshots())
  ipcMain.handle('winget-create-snapshot', (_event, label?: string) => createWingetSnapshot(label))
  ipcMain.handle('winget-restore-snapshot', (_event, filename: string, mode: 'pins-only' | 'full-import') =>
    restoreWingetSnapshot(filename, mode)
  )
  ipcMain.handle('winget-delete-snapshot', (_event, filename: string) => deleteWingetSnapshot(filename))
  ipcMain.handle('winget-open-snapshots-folder', () => openWingetSnapshotsFolder())
  startWingetBackgroundPolling()
}
