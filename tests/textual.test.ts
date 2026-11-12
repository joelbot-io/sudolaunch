import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: vi.fn(),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  nativeImage: { createFromPath: vi.fn() },
  screen: {
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
  },
  clipboard: { writeText: vi.fn() },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn() }
}))

import {
  humanizeScriptName,
  isPythonTextualFile,
  normalizeLaunchMode,
  parsePyprojectToml,
  parsePythonScriptMetadata,
  resolveScriptTargetPath,
  resolveTextualLaunchSpec,
  tokenizeCliArgs
} from '../src/main/textualManager'

describe('Python Textual TUI Manager (textualManager.ts)', () => {
  it('parses PEP 723 inline script metadata, header comments, and textual imports', () => {
    const sample = `# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "textual>=0.82.0",
#   "httpx",
# ]
# ///
# Title: Log Tailer TUI
# Description: Interactive log viewer with regex filter
# Args: --follow --lines 200
# Window: window

from textual.app import App

class LogApp(App):
    pass
`
    const meta = parsePythonScriptMetadata(sample, 'log_tailer.py')
    expect(meta.title).toBe('Log Tailer TUI')
    expect(meta.description).toBe('Interactive log viewer with regex filter')
    expect(meta.args).toBe('--follow --lines 200')
    expect(meta.defaultMode).toBe('window')
    expect(meta.hasPep723).toBe(true)
    expect(meta.importsTextual).toBe(true)
  })

  it('falls back to module docstring and humanized filename when header comments are absent', () => {
    const sample = `"""
 Kubernetes Pod Inspector TUI
 Second line ignored
"""
import textual

print("ok")
`
    const meta = parsePythonScriptMetadata(sample, 'k8s_pod-inspector.py')
    expect(meta.title).toBe('K8s Pod Inspector')
    expect(meta.description).toBe('Kubernetes Pod Inspector TUI')
    expect(meta.hasPep723).toBe(false)
    expect(meta.importsTextual).toBe(true)
  })

  it('tokenizes CLI arguments preserving single and double quoted strings', () => {
    expect(tokenizeCliArgs('--host 127.0.0.1 --filter "error OR warn" \'--tag=prod api\'')).toEqual([
      '--host',
      '127.0.0.1',
      '--filter',
      'error OR warn',
      '--tag=prod api'
    ])
    expect(tokenizeCliArgs('')).toEqual([])
  })

  it('normalizes launch window modes accurately', () => {
    expect(normalizeLaunchMode(undefined)).toBe('embedded')
    expect(normalizeLaunchMode('embedded')).toBe('embedded')
    expect(normalizeLaunchMode('window')).toBe('window')
    expect(normalizeLaunchMode('temporary')).toBe('window')
    expect(normalizeLaunchMode('separate')).toBe('window')
    expect(normalizeLaunchMode('external')).toBe('external')
    expect(normalizeLaunchMode('wt')).toBe('external')
  })

  it('humanizes snake_case and kebab-case script names', () => {
    expect(humanizeScriptName('system_pulse_tui.py')).toBe('System Pulse Tui')
    expect(humanizeScriptName('db-browser')).toBe('Db Browser')
  })

  it('detects nearest .venv Python executable, directory entrypoints, and generates safe PowerShell commands', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'sudolaunch-textual-test-'))
    try {
      const venvScripts = join(tempRoot, '.venv', 'Scripts')
      mkdirSync(venvScripts, { recursive: true })
      const fakePython = join(venvScripts, 'python.exe')
      writeFileSync(fakePython, '', 'utf-8')

      const appScript = join(tempRoot, 'app.py')
      writeFileSync(
        appScript,
        '# Title: Temp Dashboard\nfrom textual.app import App\n',
        'utf-8'
      )
      const plainScript = join(tempRoot, 'plain.py')
      writeFileSync(plainScript, 'import os\nprint(os.getcwd())\n', 'utf-8')

      // Directory target resolves to app.py
      expect(resolveScriptTargetPath(tempRoot)).toBe(appScript)

      // File inspection distinguishes Textual apps from plain Python scripts
      expect(isPythonTextualFile(appScript)).toBe(true)
      expect(isPythonTextualFile(plainScript)).toBe(false)

      // Launch spec picks up .venv\Scripts\python.exe automatically
      const spec = resolveTextualLaunchSpec(
        { scriptPath: appScript, args: '--port 8080' },
        { extraArgs: '--theme dark' }
      )
      expect(spec.title).toBe('Temp Dashboard')
      expect(spec.file).toBe(fakePython)
      expect(spec.runnerLabel).toBe('.venv')
      expect(spec.cwd).toBe(tempRoot)
      expect(spec.args).toEqual([appScript, '--port', '8080', '--theme', 'dark'])
      expect(spec.psCommand).toContain('Push-Location -LiteralPath')
      expect(spec.psCommand).toContain("$env:PYTHONUTF8='1'")
      expect(spec.psCommand).toContain("$env:COLORTERM='truecolor'")
      expect(spec.psCommand).toContain('Pop-Location')

      // Explicit runner override ("textual") uses textual run
      const textualOverride = resolveTextualLaunchSpec({
        scriptPath: appScript,
        pythonPath: 'textual'
      })
      expect(textualOverride.args[0]).toBe('run')
      expect(textualOverride.args[1]).toBe(appScript)
      expect(textualOverride.runnerLabel).toBe('textual run')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('discovers and resolves pyproject.toml projects with src/<package> layout and [project.scripts]', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'sudolaunch-pyproject-test-'))
    try {
      const pyprojectContent = `[project]
name = "eventbridge-tui"
version = "0.1.0"
description = "Textual TUI to view, search, modify, and execute AWS EventBridge Schedules and Rules"
dependencies = [
    "boto3>=1.35.0",
    "textual>=8.0.0",
]

[project.scripts]
eventbridge-tui = "eventbridge_tui:main"
`
      writeFileSync(join(tempRoot, 'pyproject.toml'), pyprojectContent, 'utf-8')

      const parsed = parsePyprojectToml(pyprojectContent, 'eventbridge')
      expect(parsed.name).toBe('eventbridge-tui')
      expect(parsed.title).toBe('Eventbridge Tui')
      expect(parsed.description).toContain('AWS EventBridge Schedules')
      expect(parsed.scriptName).toBe('eventbridge-tui')
      expect(parsed.moduleName).toBe('eventbridge_tui')
      expect(parsed.callableName).toBe('main')
      expect(parsed.dependsOnTextual).toBe(true)

      const pkgDir = join(tempRoot, 'src', 'eventbridge_tui')
      mkdirSync(pkgDir, { recursive: true })
      const initPy = join(pkgDir, '__init__.py')
      const mainPy = join(pkgDir, '__main__.py')
      const appPy = join(pkgDir, 'app.py')
      writeFileSync(initPy, 'from .app import EventBridgeApp\n', 'utf-8')
      writeFileSync(mainPy, 'from . import main\nif __name__ == "__main__":\n    main()\n', 'utf-8')
      writeFileSync(appPy, 'from textual.app import App\nclass EventBridgeApp(App):\n    pass\n', 'utf-8')

      const venvScripts = join(tempRoot, '.venv', 'Scripts')
      mkdirSync(venvScripts, { recursive: true })
      const fakePython = join(venvScripts, 'python.exe')
      writeFileSync(fakePython, '', 'utf-8')

      // Directory target resolves to src/eventbridge_tui/__main__.py via pyproject.toml
      expect(resolveScriptTargetPath(tempRoot)).toBe(mainPy)

      // Launch spec runs `python.exe -m eventbridge_tui` with PYTHONPATH pointing to src/
      const spec = resolveTextualLaunchSpec(
        { scriptPath: mainPy, cwd: tempRoot },
        { extraArgs: '--demo' }
      )
      expect(spec.title).toBe('Eventbridge Tui')
      expect(spec.file).toBe(fakePython)
      expect(spec.args).toEqual(['-m', 'eventbridge_tui', '--demo'])
      expect(spec.pythonPathEnv).toBe(join(tempRoot, 'src'))
      expect(spec.psCommand).toContain('$env:PYTHONPATH=')
      expect(spec.psCommand).toContain("'-m' 'eventbridge_tui' '--demo'")
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})

