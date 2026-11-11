import { spawn } from 'child_process'
import { existsSync, mkdirSync, openSync, readSync, closeSync, readdirSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { basename, delimiter, dirname, extname, isAbsolute, join, resolve } from 'path'
import type { TextualAppEntry, TextualLaunchMode } from '../shared/types'
import { CONFIG_DIR, readSettings, readTextualApps } from './config'
import { resolveFolderRoot } from './folderBrowse'
import { launchInEmbeddedTerminal } from './terminalWindow'
import { openTextualWindow } from './textualWindow'

export interface ParsedPythonMetadata {
  title: string
  description?: string
  args?: string
  defaultMode?: TextualLaunchMode
  runner?: string
  hasPep723: boolean
  importsTextual: boolean
}

export interface DiscoveredTextualApp {
  id: string
  name: string
  scriptPath: string
  args?: string
  cwd?: string
  pythonPath?: string
  defaultMode: TextualLaunchMode
  description?: string
  source: 'saved' | 'folder'
  hasPep723?: boolean
  importsTextual?: boolean
}

export interface TextualLaunchSpec {
  title: string
  subtitle: string
  file: string
  args: string[]
  cwd: string
  psCommand: string
  displayCommand: string
  runnerLabel: string
  scriptPath: string
}

const EXAMPLE_TEXTUAL_SCRIPT = `# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "textual>=0.80.0",
# ]
# ///
# Title: System Pulse TUI (Sample)
# Description: Sample Python Textual dashboard — press q to quit, r to refresh, d for theme

import os
import platform
import sys
from datetime import datetime
from textual.app import App, ComposeResult
from textual.containers import Container, Horizontal
from textual.widgets import Button, Footer, Header, Static


class MetricCard(Static):
    """Displays a single workstation metric card."""


class SystemPulseApp(App):
    CSS = """
    Screen {
        background: #0b0f19;
    }
    #main {
        padding: 1 2;
    }
    .banner {
        background: #111827;
        border: round #06b6d4;
        padding: 1 2;
        margin-bottom: 1;
        color: #e2e8f0;
    }
    #cards {
        height: auto;
        margin-bottom: 1;
    }
    MetricCard {
        width: 1fr;
        background: #111827;
        border: tall #38bdf8;
        padding: 1 2;
        margin-right: 1;
    }
    #actions {
        height: auto;
        margin-top: 1;
    }
    Button {
        margin-right: 2;
    }
    """

    BINDINGS = [
        ("q", "quit", "Quit"),
        ("r", "refresh_metrics", "Refresh"),
        ("d", "toggle_dark", "Toggle Theme"),
    ]

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with Container(id="main"):
            yield Static(
                "[bold cyan]SudoLaunch × Python Textual[/bold cyan]\\n"
                "Drop [bold].py[/bold] files or project folders into [cyan]~/.sudolaunch/textual/[/cyan] "
                "or add external paths via [cyan]/settings textual[/cyan].",
                classes="banner",
            )
            with Horizontal(id="cards"):
                yield MetricCard(id="card-host")
                yield MetricCard(id="card-runtime")
                yield MetricCard(id="card-time")
            with Horizontal(id="actions"):
                yield Button("Refresh Metrics (R)", id="btn-refresh", variant="primary")
                yield Button("Quit App (Q)", id="btn-quit", variant="error")
        yield Footer()

    def on_mount(self) -> None:
        self.title = "SudoLaunch · System Pulse TUI"
        self.action_refresh_metrics()

    def action_refresh_metrics(self) -> None:
        self.query_one("#card-host", MetricCard).update(
            f"[bold #38bdf8]Host & OS[/]\\n"
            f"Node: {platform.node()}\\n"
            f"OS: {platform.system()} {platform.release()}"
        )
        self.query_one("#card-runtime", MetricCard).update(
            f"[bold #10b981]Python Runtime[/]\\n"
            f"Version: {sys.version.split()[0]}\\n"
            f"CPUs: {os.cpu_count() or 1} logical cores"
        )
        self.query_one("#card-time", MetricCard).update(
            f"[bold #a855f7]Last Refreshed[/]\\n"
            f"Local: {datetime.now().strftime('%H:%M:%S')}\\n"
            f"PID: {os.getpid()}"
        )

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "btn-refresh":
            self.action_refresh_metrics()
        elif event.button.id == "btn-quit":
            self.exit()


if __name__ == "__main__":
    SystemPulseApp().run()
`

const SKIP_DIRS = new Set(['.venv', 'venv', 'env', '__pycache__', '.git', 'node_modules', '.mypy_cache', '.pytest_cache', '.ruff_cache', 'build', 'dist'])

export function expandHomePath(rawPath: string): string {
  const trimmed = rawPath.trim()
  if (trimmed === '~') return homedir()
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return join(homedir(), trimmed.slice(2))
  }
  return trimmed
}

export function normalizeLaunchMode(raw?: string): TextualLaunchMode {
  const val = (raw || '').trim().toLowerCase()
  if (val === 'window' || val === 'temp' || val === 'temporary' || val === 'popup' || val === 'separate') {
    return 'window'
  }
  if (val === 'external' || val === 'wt' || val === 'os') {
    return 'external'
  }
  return 'embedded'
}

export function humanizeScriptName(filenameOrDir: string): string {
  const base = basename(filenameOrDir, extname(filenameOrDir))
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim() || base
}

export function tokenizeCliArgs(argsStr?: string): string[] {
  if (!argsStr || !argsStr.trim()) return []
  const tokens: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(argsStr))) {
    tokens.push(m[1] ?? m[2] ?? m[3])
  }
  return tokens
}

export function parsePythonScriptMetadata(content: string, fallbackName: string): ParsedPythonMetadata {
  const lines = content.split(/\r?\n/).slice(0, 65)
  let title = ''
  let description = ''
  let args: string | undefined
  let defaultMode: TextualLaunchMode | undefined
  let runner: string | undefined
  let hasPep723 = false
  let inPep723 = false
  let pep723MentionsTextual = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === '# /// script') {
      hasPep723 = true
      inPep723 = true
      continue
    }
    if (inPep723 && line === '# ///') {
      inPep723 = false
      continue
    }
    if (inPep723 && /textual/i.test(line)) {
      pep723MentionsTextual = true
    }

    const metaMatch = line.match(/^#\s*(title|name|description|summary|args|window|mode|runner)\s*:\s*(.+)$/i)
    if (metaMatch) {
      const key = metaMatch[1].toLowerCase()
      const val = metaMatch[2].trim()
      if ((key === 'title' || key === 'name') && !title) title = val
      else if ((key === 'description' || key === 'summary') && !description) description = val
      else if (key === 'args' && !args) args = val
      else if ((key === 'window' || key === 'mode') && !defaultMode) defaultMode = normalizeLaunchMode(val)
      else if (key === 'runner' && !runner) runner = val
    }
  }

  if (!description) {
    const docMatch = content.match(/(?:^|\r?\n)\s*(?:"""|''')([\s\S]*?)(?:"""|''')/)
    if (docMatch) {
      const firstDocLine = docMatch[1]
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find(Boolean)
      if (firstDocLine) {
        description = firstDocLine
      }
    }
  }

  const importsTextual =
    pep723MentionsTextual || /\b(?:from|import)\s+textual\b/.test(content)

  return {
    title: title || humanizeScriptName(fallbackName),
    description: description || undefined,
    args,
    defaultMode,
    runner,
    hasPep723,
    importsTextual
  }
}

function readFileHeader(filePath: string, maxBytes = 6144): string {
  try {
    const fd = openSync(filePath, 'r')
    try {
      const buf = Buffer.alloc(maxBytes)
      const bytesRead = readSync(fd, buf, 0, maxBytes, 0)
      return buf.subarray(0, bytesRead).toString('utf-8')
    } finally {
      closeSync(fd)
    }
  } catch {
    return ''
  }
}

export function isPythonTextualFile(filePath: string): boolean {
  if (extname(filePath).toLowerCase() !== '.py') return false
  const header = readFileHeader(filePath)
  if (!header) return false
  return parsePythonScriptMetadata(header, basename(filePath)).importsTextual
}

export function getConfiguredTextualRoot(): string | null {
  const folder = (readSettings().textualFolder || 'textual').trim() || 'textual'
  return resolveFolderRoot(folder)
}

export function ensureTextualDir(): void {
  const dir = getConfiguredTextualRoot()
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    try {
      writeFileSync(join(dir, 'example_pulse_tui.py'), EXAMPLE_TEXTUAL_SCRIPT, 'utf-8')
    } catch {
      // ignore seed write errors
    }
  }
}

function findEntryScriptInDir(dirPath: string): string | null {
  const preferred = ['app.py', 'main.py', 'tui.py', '__main__.py']
  for (const candidate of preferred) {
    const full = join(dirPath, candidate)
    if (existsSync(full)) return full
  }
  try {
    const pyFiles = readdirSync(dirPath)
      .filter((f) => f.toLowerCase().endsWith('.py') && !f.startsWith('_'))
      .sort((a, b) => a.localeCompare(b))
    if (pyFiles.length > 0) {
      return join(dirPath, pyFiles[0])
    }
  } catch {
    // ignore
  }
  return null
}

export function resolveScriptTargetPath(rawTarget: string, baseDir = CONFIG_DIR): string | null {
  const expanded = expandHomePath(rawTarget)
  const abs = isAbsolute(expanded) ? resolve(expanded) : resolve(baseDir, expanded)
  if (!existsSync(abs)) return null
  try {
    const st = statSync(abs)
    if (st.isFile()) return abs
    if (st.isDirectory()) return findEntryScriptInDir(abs)
  } catch {
    // ignore
  }
  return null
}

const DISCOVERY_CACHE_TTL_MS = 5000
let cachedDiscoveryAt = 0
let cachedDiscoveryRoot = ''
let cachedSavedAppsRef: TextualAppEntry[] | null = null
let cachedApps: DiscoveredTextualApp[] = []

export function invalidateTextualDiscoveryCache(): void {
  cachedDiscoveryAt = 0
}

export function discoverTextualApps(force = false): DiscoveredTextualApp[] {
  const now = Date.now()
  const root = getConfiguredTextualRoot() ?? ''
  const savedEntries = readTextualApps()

  if (
    !force &&
    now - cachedDiscoveryAt < DISCOVERY_CACHE_TTL_MS &&
    cachedDiscoveryRoot === root &&
    cachedSavedAppsRef === savedEntries
  ) {
    return cachedApps
  }

  const byPath = new Map<string, DiscoveredTextualApp>()

  // 1. Scan ~/.sudolaunch/textual (or configured textualFolder)
  if (root && existsSync(root)) {
    try {
      const entries = readdirSync(root, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const fullPath = join(root, entry.name)
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.py')) {
          const header = readFileHeader(fullPath)
          const meta = parsePythonScriptMetadata(header, entry.name)
          const normKey = fullPath.toLowerCase()
          byPath.set(normKey, {
            id: basename(entry.name, '.py'),
            name: meta.title,
            scriptPath: fullPath,
            args: meta.args,
            cwd: dirname(fullPath),
            pythonPath: meta.runner,
            defaultMode: meta.defaultMode ?? 'embedded',
            description: meta.description,
            source: 'folder',
            hasPep723: meta.hasPep723,
            importsTextual: meta.importsTextual
          })
        } else if (entry.isDirectory() && !SKIP_DIRS.has(entry.name.toLowerCase())) {
          const entryScript = findEntryScriptInDir(fullPath)
          if (entryScript) {
            const header = readFileHeader(entryScript)
            const meta = parsePythonScriptMetadata(header, entry.name)
            const normKey = entryScript.toLowerCase()
            byPath.set(normKey, {
              id: entry.name,
              name: meta.title,
              scriptPath: entryScript,
              args: meta.args,
              cwd: fullPath,
              pythonPath: meta.runner,
              defaultMode: meta.defaultMode ?? 'embedded',
              description: meta.description,
              source: 'folder',
              hasPep723: meta.hasPep723,
              importsTextual: meta.importsTextual
            })
          }
        }
      }
    } catch {
      // ignore folder scan errors
    }
  }

  // 2. Merge saved apps from textualApps.json (saved entries take precedence & support external paths)
  for (const saved of savedEntries) {
    const rawScript = (saved.scriptPath || '').trim()
    if (!rawScript) continue
    const resolvedScript = resolveScriptTargetPath(rawScript, root || CONFIG_DIR) ?? expandHomePath(rawScript)
    const header = existsSync(resolvedScript) ? readFileHeader(resolvedScript) : ''
    const meta = parsePythonScriptMetadata(header, saved.name || basename(resolvedScript))
    const normKey = resolvedScript.toLowerCase()
    const cleanName = (saved.name || '').trim() || meta.title
    const slug = cleanName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || basename(resolvedScript, '.py')

    byPath.set(normKey, {
      id: slug,
      name: cleanName,
      scriptPath: resolvedScript,
      args: saved.args?.trim() || meta.args,
      cwd: saved.cwd?.trim() ? expandHomePath(saved.cwd.trim()) : dirname(resolvedScript),
      pythonPath: saved.pythonPath?.trim() || meta.runner,
      defaultMode: saved.defaultMode?.trim() ? normalizeLaunchMode(saved.defaultMode) : (meta.defaultMode ?? 'embedded'),
      description: saved.description?.trim() || meta.description,
      source: 'saved',
      hasPep723: meta.hasPep723,
      importsTextual: meta.importsTextual
    })
  }

  cachedApps = Array.from(byPath.values()).sort((a, b) => {
    if (a.source !== b.source) return a.source === 'saved' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  cachedDiscoveryAt = now
  cachedDiscoveryRoot = root
  cachedSavedAppsRef = savedEntries
  return cachedApps
}

const executablePathCache = new Map<string, { at: number; resolved: string | null }>()
const EXE_CACHE_TTL_MS = 30000

export function findExecutableOnPath(binaryName: string): string | null {
  const now = Date.now()
  const key = binaryName.toLowerCase()
  const cached = executablePathCache.get(key)
  if (cached && now - cached.at < EXE_CACHE_TTL_MS) {
    return cached.resolved
  }

  const exeName = binaryName.toLowerCase().endsWith('.exe') ? binaryName : `${binaryName}.exe`
  const pathDirs = (process.env.PATH || '').split(delimiter).filter(Boolean)
  for (const dir of pathDirs) {
    const candidate = join(dir.replace(/^"+|"+$/g, ''), exeName)
    if (existsSync(candidate)) {
      try {
        // Windows Store zero-byte App Execution Alias stubs report size 0 on statSync sometimes,
        // so verify non-WindowsApps or real executable when checking optional tools like uv.exe
        if (key === 'uv' || !candidate.toLowerCase().includes('windowsapps')) {
          executablePathCache.set(key, { at: now, resolved: candidate })
          return candidate
        }
      } catch {
        // ignore
      }
    }
  }

  // Second pass allowing WindowsApps alias for python.exe if no standard install was found
  for (const dir of pathDirs) {
    const candidate = join(dir.replace(/^"+|"+$/g, ''), exeName)
    if (existsSync(candidate)) {
      executablePathCache.set(key, { at: now, resolved: candidate })
      return candidate
    }
  }

  executablePathCache.set(key, { at: now, resolved: null })
  return null
}

function findNearestVenvExe(startDir: string, exeBase: 'python.exe' | 'textual.exe'): string | null {
  const venvFolders = ['.venv', 'venv']
  let current = resolve(startDir)

  for (let depth = 0; depth < 4; depth++) {
    for (const vf of venvFolders) {
      const winCandidate = join(current, vf, 'Scripts', exeBase)
      if (existsSync(winCandidate)) return winCandidate
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  // Also check shared ~/.sudolaunch/textual/.venv if not already covered
  const textualRoot = getConfiguredTextualRoot()
  if (textualRoot) {
    for (const vf of venvFolders) {
      const sharedCandidate = join(textualRoot, vf, 'Scripts', exeBase)
      if (existsSync(sharedCandidate)) return sharedCandidate
    }
  }

  return null
}

function hasUvProjectLock(startDir: string): boolean {
  let current = resolve(startDir)
  for (let depth = 0; depth < 3; depth++) {
    if (existsSync(join(current, 'uv.lock'))) return true
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return false
}

function quotePsArg(val: string): string {
  return `'${val.replace(/'/g, "''")}'`
}

function formatDisplayArg(val: string): string {
  return /\s/.test(val) ? `"${val}"` : val
}

export function resolveTextualLaunchSpec(
  app: {
    name?: string
    scriptPath: string
    args?: string
    cwd?: string
    pythonPath?: string
    hasPep723?: boolean
  },
  options?: {
    extraArgs?: string
    devMode?: boolean
  }
): TextualLaunchSpec {
  const resolvedScript = resolveScriptTargetPath(app.scriptPath) ?? resolve(expandHomePath(app.scriptPath))
  const cwd = app.cwd ? resolve(expandHomePath(app.cwd)) : dirname(resolvedScript)
  const baseArgs = tokenizeCliArgs(app.args)
  const extra = tokenizeCliArgs(options?.extraArgs)
  const scriptArgs = [...baseArgs, ...extra]

  const header = existsSync(resolvedScript) ? readFileHeader(resolvedScript) : ''
  const meta = parsePythonScriptMetadata(header, app.name || basename(resolvedScript))
  const hasPep723 = app.hasPep723 ?? meta.hasPep723
  const title = (app.name || '').trim() || meta.title

  let file = 'python'
  let args: string[] = [resolvedScript, ...scriptArgs]
  let runnerLabel = 'python'

  const override = (app.pythonPath || '').trim()
  const overrideLower = override.toLowerCase()

  if (options?.devMode) {
    const venvTextual = findNearestVenvExe(cwd, 'textual.exe')
    const uvExe = findExecutableOnPath('uv')
    const globalTextual = findExecutableOnPath('textual')
    if (venvTextual) {
      file = venvTextual
      args = ['run', '--dev', resolvedScript, ...scriptArgs]
      runnerLabel = '.venv textual --dev'
    } else if (uvExe && (hasPep723 || hasUvProjectLock(cwd) || !globalTextual)) {
      file = uvExe
      args = ['run', '--with', 'textual-dev', 'textual', 'run', '--dev', resolvedScript, ...scriptArgs]
      runnerLabel = 'uv textual --dev'
    } else {
      file = globalTextual ?? 'textual'
      args = ['run', '--dev', resolvedScript, ...scriptArgs]
      runnerLabel = 'textual --dev'
    }
  } else if (override && overrideLower !== 'auto') {
    if (overrideLower === 'uv') {
      file = findExecutableOnPath('uv') ?? 'uv'
      args = ['run', resolvedScript, ...scriptArgs]
      runnerLabel = 'uv run'
    } else if (overrideLower === 'textual') {
      file = findExecutableOnPath('textual') ?? 'textual'
      args = ['run', resolvedScript, ...scriptArgs]
      runnerLabel = 'textual run'
    } else {
      const expandedOverride = expandHomePath(override)
      file = existsSync(expandedOverride) ? resolve(expandedOverride) : (findExecutableOnPath(expandedOverride) ?? expandedOverride)
      args = [resolvedScript, ...scriptArgs]
      runnerLabel = basename(file)
    }
  } else {
    // Auto-detection priority:
    // 1. Project or shared ~/.sudolaunch/textual .venv/Scripts/python.exe
    // 2. uv run (when PEP 723 "# /// script" inline metadata or uv.lock is present and uv is installed)
    // 3. python.exe (or py.exe fallback on Windows)
    const venvPython = findNearestVenvExe(cwd, 'python.exe')
    const uvExe = findExecutableOnPath('uv')
    if (venvPython) {
      file = venvPython
      args = [resolvedScript, ...scriptArgs]
      runnerLabel = '.venv'
    } else if (uvExe && (hasPep723 || hasUvProjectLock(cwd))) {
      file = uvExe
      args = ['run', resolvedScript, ...scriptArgs]
      runnerLabel = 'uv run'
    } else {
      const pythonExe = findExecutableOnPath('python') ?? findExecutableOnPath('py') ?? 'python'
      file = pythonExe
      args = [resolvedScript, ...scriptArgs]
      runnerLabel = basename(pythonExe, '.exe')
    }
  }

  const displayCommand = [formatDisplayArg(file), ...args.map(formatDisplayArg)].join(' ')
  const psInvoke = `& ${quotePsArg(file)} ${args.map(quotePsArg).join(' ')}`
  const psCommand = `Push-Location -LiteralPath ${quotePsArg(cwd)}; try { $env:PYTHONUTF8='1'; $env:COLORTERM='truecolor'; ${psInvoke} } finally { Pop-Location }`

  return {
    title,
    subtitle: `${runnerLabel} · ${basename(resolvedScript)}`,
    file,
    args,
    cwd,
    psCommand,
    displayCommand,
    runnerLabel,
    scriptPath: resolvedScript
  }
}

export function launchExternalTextualWindow(spec: TextualLaunchSpec): void {
  const runnerScript = `
    $Host.UI.RawUI.WindowTitle = ${quotePsArg(`Textual · ${spec.title}`)}
    Set-Location -LiteralPath ${quotePsArg(spec.cwd)}
    $env:PYTHONUTF8 = '1'
    $env:PYTHONIOENCODING = 'utf-8'
    $env:COLORTERM = 'truecolor'
    & ${quotePsArg(spec.file)} ${spec.args.map(quotePsArg).join(' ')}
    $code = $LASTEXITCODE
    if ($code -ne 0) {
      Write-Host ""
      Write-Host " [!] Textual app exited with code $code." -ForegroundColor Yellow
      Read-Host " Press Enter to close this window"
    }
  `
  const encoded = Buffer.from(runnerScript, 'utf16le').toString('base64')
  const safeTitle = `Textual: ${spec.title}`.replace(/'/g, "''")
  const psLauncher = `
    if (Get-Command wt.exe -ErrorAction SilentlyContinue) {
      Start-Process wt.exe -ArgumentList @('new-tab', '--title', '${safeTitle}', 'powershell.exe', '-NoLogo', '-NoProfile', '-EncodedCommand', '${encoded}')
    } else {
      Start-Process powershell.exe -ArgumentList @('-NoLogo', '-NoProfile', '-EncodedCommand', '${encoded}')
    }
  `
  spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psLauncher], {
    windowsHide: true
  })
}

export function launchTextualSpec(spec: TextualLaunchSpec, mode: TextualLaunchMode): void {
  if (mode === 'window') {
    openTextualWindow(spec)
    return
  }
  if (mode === 'external') {
    launchExternalTextualWindow(spec)
    return
  }
  launchInEmbeddedTerminal(spec.psCommand)
}

