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
  hasExplicitTitle?: boolean
  description?: string
  args?: string
  defaultMode?: TextualLaunchMode
  runner?: string
  hasPep723: boolean
  importsTextual: boolean
}

export interface ParsedPyprojectMetadata {
  name?: string
  title: string
  hasExplicitTitle?: boolean
  description?: string
  scriptName?: string
  scriptTarget?: string
  moduleName?: string
  callableName?: string
  scriptPath?: string
  cwd?: string
  args?: string
  defaultMode?: TextualLaunchMode
  runner?: string
  dependsOnTextual: boolean
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
  hasPyproject?: boolean
  moduleName?: string
  scriptName?: string
  callableName?: string
  importsTextual?: boolean
}

export interface TextualLaunchSpec {
  title: string
  subtitle: string
  file: string
  args: string[]
  cwd: string
  pythonPathEnv?: string
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
    hasExplicitTitle: Boolean(title),
    description: description || undefined,
    args,
    defaultMode,
    runner,
    hasPep723,
    importsTextual
  }
}

export function parsePyprojectToml(content: string, fallbackName: string): ParsedPyprojectMetadata {
  const lines = content.split(/\r?\n/)
  let currentSection = ''
  let projectName = ''
  let explicitTitle = ''
  let description = ''
  let scriptName: string | undefined
  let scriptTarget: string | undefined
  let moduleName: string | undefined
  let callableName: string | undefined
  let scriptPath: string | undefined
  let cwd: string | undefined
  let args: string | undefined
  let defaultMode: TextualLaunchMode | undefined
  let runner: string | undefined

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const secMatch = trimmed.match(/^\[([^\]]+)\]\s*(?:#.*)?$/)
    if (secMatch) {
      currentSection = secMatch[1].trim().toLowerCase()
      continue
    }

    const kvMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/)
    if (!kvMatch) continue

    const key = kvMatch[1].trim()
    const keyLower = key.toLowerCase()
    let rhs = kvMatch[2].trim()

    // Handle multi-line triple-quoted strings ("""...""" or '''...''')
    let val = ''
    if (rhs.startsWith('"""') || rhs.startsWith("'''")) {
      const delim = rhs.slice(0, 3)
      const afterOpen = rhs.slice(3)
      const closeIdx = afterOpen.indexOf(delim)
      if (closeIdx !== -1) {
        val = afterOpen.slice(0, closeIdx).trim()
      } else {
        const parts = [afterOpen]
        while (++i < lines.length) {
          const nextLine = lines[i]
          const cIdx = nextLine.indexOf(delim)
          if (cIdx !== -1) {
            parts.push(nextLine.slice(0, cIdx))
            break
          }
          parts.push(nextLine)
        }
        val = parts.join(' ').replace(/\s+/g, ' ').trim()
      }
    } else {
      // Strip inline comment outside quotes
      const strMatch = rhs.match(/^(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/)
      if (strMatch) {
        val = (strMatch[1] ?? strMatch[2] ?? '').trim()
      } else {
        val = rhs.replace(/\s+#.*$/, '').trim()
      }
    }

    if (!val) continue

    if (currentSection === 'project' || currentSection === 'tool.poetry' || currentSection === '') {
      if (keyLower === 'name' && !projectName) {
        projectName = val
      } else if (keyLower === 'title' && !explicitTitle) {
        explicitTitle = val
      } else if ((keyLower === 'description' || keyLower === 'summary') && !description) {
        description = val
      }
    }

    if (
      currentSection === 'project.scripts' ||
      currentSection === 'project.gui-scripts' ||
      currentSection === 'tool.poetry.scripts'
    ) {
      if (!scriptName && val.includes(':')) {
        scriptName = key
        scriptTarget = val
        const [modPart, callPart] = val.split(':')
        if (modPart?.trim()) moduleName = modPart.trim()
        if (callPart?.trim()) callableName = callPart.trim()
      } else if (!scriptName && !moduleName) {
        scriptName = key
        scriptTarget = val
        moduleName = val
      }
    }

    if (
      currentSection === 'tool.sudolaunch' ||
      currentSection === 'sudolaunch' ||
      currentSection === 'textual' ||
      currentSection === ''
    ) {
      if (keyLower === 'title') {
        explicitTitle = val
      } else if (keyLower === 'name' && currentSection !== '') {
        explicitTitle = val
      } else if (keyLower === 'description' || keyLower === 'summary') {
        description = val
      } else if (keyLower === 'args') {
        args = val
      } else if (keyLower === 'mode' || keyLower === 'window' || keyLower === 'default_mode' || keyLower === 'defaultmode') {
        defaultMode = normalizeLaunchMode(val)
      } else if (keyLower === 'runner' || keyLower === 'python' || keyLower === 'python_path' || keyLower === 'pythonpath') {
        runner = val
      } else if (keyLower === 'module') {
        moduleName = val
      } else if (keyLower === 'entrypoint' || keyLower === 'entry' || keyLower === 'target') {
        if (val.includes(':')) {
          scriptTarget = val
          const [modPart, callPart] = val.split(':')
          if (modPart?.trim()) moduleName = modPart.trim()
          if (callPart?.trim()) callableName = callPart.trim()
        } else if (val.toLowerCase().endsWith('.py')) {
          scriptPath = val
        } else {
          moduleName = val
        }
      } else if (keyLower === 'script' || keyLower === 'path' || keyLower === 'script_path' || keyLower === 'scriptpath') {
        scriptPath = val
      } else if (keyLower === 'cwd') {
        cwd = val
      }
    }
  }

  const dependsOnTextual = /\btextual\b/i.test(content)
  const resolvedTitle =
    explicitTitle || humanizeScriptName(projectName || fallbackName)

  return {
    name: projectName || undefined,
    title: resolvedTitle,
    hasExplicitTitle: Boolean(explicitTitle),
    description: description || undefined,
    scriptName,
    scriptTarget,
    moduleName,
    callableName,
    scriptPath,
    cwd,
    args,
    defaultMode,
    runner,
    dependsOnTextual
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

const NON_PACKAGE_DIRS = new Set([
  ...SKIP_DIRS,
  'src',
  'tests',
  'test',
  'docs',
  'doc',
  'scripts',
  'examples',
  'assets',
  'resources'
])

function findPackageEntryInDir(
  dirPath: string,
  preferredModule?: string
): { entryScript: string; moduleName: string; hasMainModule: boolean } | null {
  const pkgCandidates = ['__main__.py', 'app.py', 'main.py', 'tui.py', '__init__.py']

  const checkPackageDir = (
    pkgDir: string,
    modName: string
  ): { entryScript: string; moduleName: string; hasMainModule: boolean } | null => {
    if (!existsSync(pkgDir)) return null
    try {
      if (!statSync(pkgDir).isDirectory()) return null
    } catch {
      return null
    }
    const hasMain = existsSync(join(pkgDir, '__main__.py'))
    for (const cand of pkgCandidates) {
      const full = join(pkgDir, cand)
      if (existsSync(full)) {
        return { entryScript: full, moduleName: modName, hasMainModule: hasMain }
      }
    }
    try {
      const pyFiles = readdirSync(pkgDir)
        .filter((f) => f.toLowerCase().endsWith('.py') && !f.startsWith('_'))
        .sort((a, b) => a.localeCompare(b))
      if (pyFiles.length > 0) {
        return { entryScript: join(pkgDir, pyFiles[0]), moduleName: modName, hasMainModule: hasMain }
      }
    } catch {
      // ignore
    }
    return null
  }

  // 1. If a preferred module name is known (e.g. from pyproject.toml [project.scripts])
  if (preferredModule) {
    const cleanMod = preferredModule.trim()
    const modParts = cleanMod.split('.').filter(Boolean)
    if (modParts.length > 0) {
      const fromSrc = checkPackageDir(join(dirPath, 'src', ...modParts), cleanMod)
      if (fromSrc) return fromSrc
      const fromRoot = checkPackageDir(join(dirPath, ...modParts), cleanMod)
      if (fromRoot) return fromRoot

      const srcSingleFile = join(dirPath, 'src', ...modParts) + '.py'
      if (existsSync(srcSingleFile)) {
        return { entryScript: srcSingleFile, moduleName: cleanMod, hasMainModule: true }
      }
      const rootSingleFile = join(dirPath, ...modParts) + '.py'
      if (existsSync(rootSingleFile)) {
        return { entryScript: rootSingleFile, moduleName: cleanMod, hasMainModule: true }
      }
    }
  }

  // 2. Scan src/<pkg>/ layout
  const srcDir = join(dirPath, 'src')
  if (existsSync(srcDir)) {
    try {
      if (statSync(srcDir).isDirectory()) {
        const subEntries = readdirSync(srcDir)
          .filter((name) => !name.startsWith('.') && !name.endsWith('.egg-info') && !NON_PACKAGE_DIRS.has(name.toLowerCase()))
          .sort((a, b) => a.localeCompare(b))
        for (const sub of subEntries) {
          const found = checkPackageDir(join(srcDir, sub), sub)
          if (found) return found
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Scan flat <pkg>/ layout at project root (only directories containing __init__.py or __main__.py)
  try {
    const rootEntries = readdirSync(dirPath)
      .filter((name) => !name.startsWith('.') && !name.endsWith('.egg-info') && !NON_PACKAGE_DIRS.has(name.toLowerCase()))
      .sort((a, b) => a.localeCompare(b))
    for (const sub of rootEntries) {
      const pkgDir = join(dirPath, sub)
      if (existsSync(join(pkgDir, '__init__.py')) || existsSync(join(pkgDir, '__main__.py'))) {
        const found = checkPackageDir(pkgDir, sub)
        if (found) return found
      }
    }
  } catch {
    // ignore
  }

  return null
}

function findEntryScriptInDir(dirPath: string): string | null {
  const preferred = ['app.py', 'main.py', 'tui.py', '__main__.py']
  for (const candidate of preferred) {
    const full = join(dirPath, candidate)
    if (existsSync(full)) return full
  }

  // Check pyproject.toml [project.scripts] / src/<pkg>/ before falling back to arbitrary root .py files (like scaffold.py or setup.py)
  const pyprojectPath = join(dirPath, 'pyproject.toml')
  if (existsSync(pyprojectPath)) {
    const tomlMeta = parsePyprojectToml(readFileHeader(pyprojectPath, 16384), basename(dirPath))
    if (tomlMeta.scriptPath) {
      const explicitScript = isAbsolute(tomlMeta.scriptPath)
        ? tomlMeta.scriptPath
        : join(dirPath, tomlMeta.scriptPath)
      if (existsSync(explicitScript)) return explicitScript
    }
    const pkgEntry = findPackageEntryInDir(dirPath, tomlMeta.moduleName)
    if (pkgEntry) return pkgEntry.entryScript
  }

  try {
    const pyFiles = readdirSync(dirPath)
      .filter(
        (f) =>
          f.toLowerCase().endsWith('.py') &&
          !f.startsWith('_') &&
          f.toLowerCase() !== 'setup.py' &&
          f.toLowerCase() !== 'conftest.py'
      )
      .sort((a, b) => a.localeCompare(b))
    if (pyFiles.length > 0) {
      return join(dirPath, pyFiles[0])
    }
  } catch {
    // ignore
  }

  const fallbackPkg = findPackageEntryInDir(dirPath)
  if (fallbackPkg) return fallbackPkg.entryScript

  if (existsSync(pyprojectPath)) return pyprojectPath
  return null
}

function findNearestPyprojectContext(
  scriptOrDirPath: string
): { projectRoot: string; pyprojectPath: string; meta: ParsedPyprojectMetadata } | null {
  let current = resolve(scriptOrDirPath)
  try {
    if (existsSync(current) && statSync(current).isFile()) {
      current = dirname(current)
    }
  } catch {
    current = dirname(current)
  }

  const textualRoot = getConfiguredTextualRoot()
  const normTextualRoot = textualRoot ? resolve(textualRoot).toLowerCase() : ''

  for (let depth = 0; depth < 4; depth++) {
    if (normTextualRoot && current.toLowerCase() === normTextualRoot) break
    const candidate = join(current, 'pyproject.toml')
    if (existsSync(candidate)) {
      const content = readFileHeader(candidate, 16384)
      const meta = parsePyprojectToml(content, basename(current))
      return { projectRoot: current, pyprojectPath: candidate, meta }
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

function discoverProjectFromDir(dirPath: string, folderId: string): DiscoveredTextualApp | null {
  const pyprojectPath = join(dirPath, 'pyproject.toml')
  const hasPyproject = existsSync(pyprojectPath)
  const tomlMeta = hasPyproject
    ? parsePyprojectToml(readFileHeader(pyprojectPath, 16384), folderId)
    : null

  const pkgEntry = findPackageEntryInDir(dirPath, tomlMeta?.moduleName)
  const entryScript = findEntryScriptInDir(dirPath)
  if (!entryScript && !hasPyproject) return null

  const scriptToRead =
    entryScript && entryScript.toLowerCase().endsWith('.py') ? entryScript : null
  const pyHeader = scriptToRead ? readFileHeader(scriptToRead) : ''
  const pyMeta = parsePythonScriptMetadata(pyHeader, folderId)

  // Also check app.py inside the package if entryScript was __main__.py so we pick up class/header comments
  let appPyMeta: ParsedPythonMetadata | null = null
  if (scriptToRead && basename(scriptToRead).toLowerCase() === '__main__.py') {
    const siblingAppPy = join(dirname(scriptToRead), 'app.py')
    if (existsSync(siblingAppPy)) {
      appPyMeta = parsePythonScriptMetadata(readFileHeader(siblingAppPy), folderId)
    }
  }

  const name =
    (pyMeta.hasExplicitTitle ? pyMeta.title : undefined) ||
    (appPyMeta?.hasExplicitTitle ? appPyMeta.title : undefined) ||
    tomlMeta?.title ||
    pyMeta.title

  const description =
    tomlMeta?.description ||
    pyMeta.description ||
    appPyMeta?.description

  const resolvedScriptPath = entryScript || pyprojectPath
  const moduleName = pkgEntry?.moduleName || tomlMeta?.moduleName

  return {
    id: folderId,
    name,
    scriptPath: resolvedScriptPath,
    args: tomlMeta?.args || pyMeta.args || appPyMeta?.args,
    cwd: tomlMeta?.cwd ? resolve(dirPath, expandHomePath(tomlMeta.cwd)) : dirPath,
    pythonPath: tomlMeta?.runner || pyMeta.runner || appPyMeta?.runner,
    defaultMode:
      tomlMeta?.defaultMode ??
      pyMeta.defaultMode ??
      appPyMeta?.defaultMode ??
      'embedded',
    description,
    source: 'folder',
    hasPep723: pyMeta.hasPep723 || appPyMeta?.hasPep723,
    hasPyproject,
    moduleName,
    scriptName: tomlMeta?.scriptName,
    callableName: tomlMeta?.callableName,
    importsTextual:
      Boolean(tomlMeta?.dependsOnTextual) ||
      pyMeta.importsTextual ||
      Boolean(appPyMeta?.importsTextual)
  }
}

function discoverFromTomlFile(tomlFilePath: string): DiscoveredTextualApp | null {
  const fileName = basename(tomlFilePath)
  const dirPath = dirname(tomlFilePath)
  if (fileName.toLowerCase() === 'pyproject.toml') {
    return discoverProjectFromDir(dirPath, basename(dirPath))
  }

  const stem = basename(fileName, extname(fileName))
  const tomlMeta = parsePyprojectToml(readFileHeader(tomlFilePath, 16384), stem)
  const baseCwd = tomlMeta.cwd
    ? isAbsolute(expandHomePath(tomlMeta.cwd))
      ? resolve(expandHomePath(tomlMeta.cwd))
      : resolve(dirPath, expandHomePath(tomlMeta.cwd))
    : dirPath

  let targetScript = tomlFilePath
  if (tomlMeta.scriptPath) {
    targetScript =
      resolveScriptTargetPath(tomlMeta.scriptPath, baseCwd) ??
      (isAbsolute(expandHomePath(tomlMeta.scriptPath))
        ? resolve(expandHomePath(tomlMeta.scriptPath))
        : resolve(baseCwd, expandHomePath(tomlMeta.scriptPath)))
  } else if (baseCwd !== dirPath && existsSync(baseCwd)) {
    targetScript = findEntryScriptInDir(baseCwd) ?? tomlFilePath
  } else {
    const siblingPy = join(dirPath, `${stem}.py`)
    const siblingDir = join(dirPath, stem)
    if (existsSync(siblingPy)) {
      targetScript = siblingPy
    } else if (existsSync(siblingDir)) {
      const discovered = discoverProjectFromDir(siblingDir, stem)
      if (discovered) {
        return {
          ...discovered,
          name: tomlMeta.hasExplicitTitle ? tomlMeta.title : discovered.name,
          description: tomlMeta.description || discovered.description,
          args: tomlMeta.args || discovered.args,
          pythonPath: tomlMeta.runner || discovered.pythonPath,
          defaultMode: tomlMeta.defaultMode ?? discovered.defaultMode
        }
      }
    }
  }

  return {
    id: stem,
    name: tomlMeta.title,
    scriptPath: targetScript,
    args: tomlMeta.args,
    cwd: baseCwd,
    pythonPath: tomlMeta.runner,
    defaultMode: tomlMeta.defaultMode ?? 'embedded',
    description: tomlMeta.description,
    source: 'folder',
    hasPyproject: true,
    moduleName: tomlMeta.moduleName,
    scriptName: tomlMeta.scriptName,
    callableName: tomlMeta.callableName,
    importsTextual: tomlMeta.dependsOnTextual
  }
}

export function resolveScriptTargetPath(rawTarget: string, baseDir = CONFIG_DIR): string | null {
  const expanded = expandHomePath(rawTarget)
  const abs = isAbsolute(expanded) ? resolve(expanded) : resolve(baseDir, expanded)
  if (!existsSync(abs)) return null
  try {
    const st = statSync(abs)
    if (st.isFile()) {
      if (basename(abs).toLowerCase() === 'pyproject.toml') {
        return findEntryScriptInDir(dirname(abs)) ?? abs
      }
      return abs
    }
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
        let st
        try {
          st = statSync(fullPath)
        } catch {
          continue
        }
        const lowerName = entry.name.toLowerCase()
        if (st.isFile() && lowerName.endsWith('.py')) {
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
        } else if (st.isFile() && lowerName.endsWith('.toml')) {
          const tomlApp = discoverFromTomlFile(fullPath)
          if (tomlApp) {
            const normKey = (tomlApp.cwd && tomlApp.hasPyproject ? tomlApp.cwd : tomlApp.scriptPath).toLowerCase()
            byPath.set(normKey, tomlApp)
          }
        } else if (st.isDirectory() && !SKIP_DIRS.has(lowerName)) {
          const discovered = discoverProjectFromDir(fullPath, entry.name)
          if (discovered) {
            const normKey = (discovered.hasPyproject && discovered.cwd ? discovered.cwd : discovered.scriptPath).toLowerCase()
            byPath.set(normKey, discovered)
          } else {
            // Check 1 level of child folders (e.g. ~/.sudolaunch/textual/aws/eventbridge)
            try {
              const childEntries = readdirSync(fullPath, { withFileTypes: true })
              for (const child of childEntries) {
                if (child.name.startsWith('.') || SKIP_DIRS.has(child.name.toLowerCase())) continue
                const childPath = join(fullPath, child.name)
                let childStat
                try {
                  childStat = statSync(childPath)
                } catch {
                  continue
                }
                if (childStat.isDirectory()) {
                  const childApp = discoverProjectFromDir(childPath, child.name)
                  if (childApp) {
                    const normKey = (childApp.hasPyproject && childApp.cwd ? childApp.cwd : childApp.scriptPath).toLowerCase()
                    byPath.set(normKey, childApp)
                  }
                }
              }
            } catch {
              // ignore nested scan errors
            }
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
    const pyprojectCtx = findNearestPyprojectContext(resolvedScript)
    const header = existsSync(resolvedScript) && resolvedScript.toLowerCase().endsWith('.py') ? readFileHeader(resolvedScript) : ''
    const meta = parsePythonScriptMetadata(header, saved.name || pyprojectCtx?.meta.title || basename(resolvedScript))
    const normKey = (pyprojectCtx ? pyprojectCtx.projectRoot : resolvedScript).toLowerCase()
    const cleanName = (saved.name || '').trim() || (meta.hasExplicitTitle ? meta.title : (pyprojectCtx?.meta.title || meta.title))
    const slug = cleanName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || basename(resolvedScript, '.py')
    const defaultCwd = pyprojectCtx ? pyprojectCtx.projectRoot : dirname(resolvedScript)
    const pkgEntry = pyprojectCtx ? findPackageEntryInDir(pyprojectCtx.projectRoot, pyprojectCtx.meta.moduleName) : null

    byPath.set(normKey, {
      id: slug,
      name: cleanName,
      scriptPath: resolvedScript,
      args: saved.args?.trim() || pyprojectCtx?.meta.args || meta.args,
      cwd: saved.cwd?.trim() ? expandHomePath(saved.cwd.trim()) : defaultCwd,
      pythonPath: saved.pythonPath?.trim() || pyprojectCtx?.meta.runner || meta.runner,
      defaultMode: saved.defaultMode?.trim()
        ? normalizeLaunchMode(saved.defaultMode)
        : (pyprojectCtx?.meta.defaultMode ?? meta.defaultMode ?? 'embedded'),
      description: saved.description?.trim() || pyprojectCtx?.meta.description || meta.description,
      source: 'saved',
      hasPep723: meta.hasPep723,
      hasPyproject: Boolean(pyprojectCtx),
      moduleName: pkgEntry?.moduleName || pyprojectCtx?.meta.moduleName,
      scriptName: pyprojectCtx?.meta.scriptName,
      callableName: pyprojectCtx?.meta.callableName,
      importsTextual: Boolean(pyprojectCtx?.meta.dependsOnTextual) || meta.importsTextual
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
    if (existsSync(join(current, 'uv.lock')) || existsSync(join(current, 'pyproject.toml'))) return true
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
    hasPyproject?: boolean
    moduleName?: string
    scriptName?: string
    callableName?: string
  },
  options?: {
    extraArgs?: string
    devMode?: boolean
  }
): TextualLaunchSpec {
  const resolvedScript = resolveScriptTargetPath(app.scriptPath) ?? resolve(expandHomePath(app.scriptPath))
  const pyprojectCtx = findNearestPyprojectContext(app.cwd ? expandHomePath(app.cwd) : resolvedScript)
  const cwd = app.cwd
    ? resolve(expandHomePath(app.cwd))
    : pyprojectCtx
      ? pyprojectCtx.projectRoot
      : dirname(resolvedScript)

  const pkgEntry = pyprojectCtx ? findPackageEntryInDir(cwd, app.moduleName ?? pyprojectCtx.meta.moduleName) : null
  const moduleName = app.moduleName ?? pkgEntry?.moduleName ?? pyprojectCtx?.meta.moduleName
  const scriptName = app.scriptName ?? pyprojectCtx?.meta.scriptName
  const callableName = app.callableName ?? pyprojectCtx?.meta.callableName
  const hasPyproject = app.hasPyproject ?? Boolean(pyprojectCtx)

  const baseArgs = tokenizeCliArgs(app.args ?? pyprojectCtx?.meta.args)
  const extra = tokenizeCliArgs(options?.extraArgs)
  const scriptArgs = [...baseArgs, ...extra]

  const header =
    existsSync(resolvedScript) && resolvedScript.toLowerCase().endsWith('.py')
      ? readFileHeader(resolvedScript)
      : ''
  const meta = parsePythonScriptMetadata(header, app.name || pyprojectCtx?.meta.title || basename(resolvedScript))
  const hasPep723 = app.hasPep723 ?? meta.hasPep723
  const title =
    (app.name || '').trim() ||
    (meta.hasExplicitTitle ? meta.title : undefined) ||
    pyprojectCtx?.meta.title ||
    meta.title

  const srcDirCandidate = join(cwd, 'src')
  const pythonPathEnv = existsSync(srcDirCandidate) ? srcDirCandidate : undefined

  const buildPythonInvocationArgs = (): string[] => {
    if (moduleName) {
      const hasMain =
        pkgEntry?.hasMainModule ||
        basename(resolvedScript).toLowerCase() === '__main__.py' ||
        existsSync(join(cwd, 'src', ...moduleName.split('.'), '__main__.py')) ||
        existsSync(join(cwd, ...moduleName.split('.'), '__main__.py'))
      if (hasMain || !callableName) {
        return ['-m', moduleName, ...scriptArgs]
      }
      return [
        '-c',
        `import sys; from ${moduleName} import ${callableName}; sys.exit(${callableName}())`,
        ...scriptArgs
      ]
    }
    return [resolvedScript, ...scriptArgs]
  }

  let file = 'python'
  let args: string[] = buildPythonInvocationArgs()
  let runnerLabel = 'python'

  const override = (app.pythonPath || pyprojectCtx?.meta.runner || '').trim()
  const overrideLower = override.toLowerCase()

  if (options?.devMode) {
    const venvTextual = findNearestVenvExe(cwd, 'textual.exe')
    const uvExe = findExecutableOnPath('uv')
    const globalTextual = findExecutableOnPath('textual')
    if (venvTextual) {
      file = venvTextual
      args = ['run', '--dev', resolvedScript, ...scriptArgs]
      runnerLabel = '.venv textual --dev'
    } else if (uvExe && (hasPep723 || hasPyproject || hasUvProjectLock(cwd) || !globalTextual)) {
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
      if (moduleName && scriptName) {
        args = ['run', scriptName, ...scriptArgs]
      } else if (moduleName) {
        args = ['run', 'python', ...buildPythonInvocationArgs()]
      } else {
        args = ['run', resolvedScript, ...scriptArgs]
      }
      runnerLabel = 'uv run'
    } else if (overrideLower === 'textual') {
      file = findExecutableOnPath('textual') ?? 'textual'
      args = ['run', resolvedScript, ...scriptArgs]
      runnerLabel = 'textual run'
    } else {
      const expandedOverride = expandHomePath(override)
      file = existsSync(expandedOverride) ? resolve(expandedOverride) : (findExecutableOnPath(expandedOverride) ?? expandedOverride)
      args = buildPythonInvocationArgs()
      runnerLabel = basename(file)
    }
  } else {
    // Auto-detection priority:
    // 1. Project or shared ~/.sudolaunch/textual .venv/Scripts/python.exe
    // 2. uv run (when PEP 723 "# /// script" inline metadata, pyproject.toml, or uv.lock is present and uv is installed)
    // 3. python.exe (or py.exe fallback on Windows)
    const venvPython = findNearestVenvExe(cwd, 'python.exe')
    const uvExe = findExecutableOnPath('uv')
    if (venvPython) {
      file = venvPython
      args = buildPythonInvocationArgs()
      runnerLabel = '.venv'
    } else if (uvExe && (hasPep723 || hasPyproject || hasUvProjectLock(cwd))) {
      file = uvExe
      if (moduleName && scriptName) {
        args = ['run', scriptName, ...scriptArgs]
      } else if (moduleName) {
        args = ['run', 'python', ...buildPythonInvocationArgs()]
      } else {
        args = ['run', resolvedScript, ...scriptArgs]
      }
      runnerLabel = 'uv run'
    } else {
      const pythonExe = findExecutableOnPath('python') ?? findExecutableOnPath('py') ?? 'python'
      file = pythonExe
      args = buildPythonInvocationArgs()
      runnerLabel = basename(pythonExe, '.exe')
    }
  }

  const displayCommand = [formatDisplayArg(file), ...args.map(formatDisplayArg)].join(' ')
  const psInvoke = `& ${quotePsArg(file)} ${args.map(quotePsArg).join(' ')}`
  const pyPathEnvCmd = pythonPathEnv ? `$env:PYTHONPATH=${quotePsArg(pythonPathEnv)}; ` : ''
  const psCommand = `Push-Location -LiteralPath ${quotePsArg(cwd)}; try { ${pyPathEnvCmd}$env:PYTHONUTF8='1'; $env:COLORTERM='truecolor'; ${psInvoke} } finally { Pop-Location }`
  const subtitleTarget = moduleName || basename(resolvedScript)

  return {
    title,
    subtitle: `${runnerLabel} · ${subtitleTarget}`,
    file,
    args,
    cwd,
    pythonPathEnv,
    psCommand,
    displayCommand,
    runnerLabel,
    scriptPath: resolvedScript
  }
}

export function launchExternalTextualWindow(spec: TextualLaunchSpec): void {
  const pyPathLine = spec.pythonPathEnv
    ? `$env:PYTHONPATH = ${quotePsArg(spec.pythonPathEnv)}`
    : ''
  const runnerScript = `
    $Host.UI.RawUI.WindowTitle = ${quotePsArg(`Textual · ${spec.title}`)}
    Set-Location -LiteralPath ${quotePsArg(spec.cwd)}
    ${pyPathLine}
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

