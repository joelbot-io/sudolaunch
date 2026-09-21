import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { app, screen } from 'electron'
import { readSettings } from './config'
import { summonBarTo } from './barWindow'

let hookProcess: ChildProcess | null = null
let isShuttingDown = false

function getCursorHookPath(): string | null {
  const candidates = [
    join(process.resourcesPath, 'bin', 'cursorhook.exe'),
    join(process.resourcesPath, 'resources', 'bin', 'cursorhook.exe'),
    join(process.cwd(), 'resources', 'bin', 'cursorhook.exe'),
    join(app ? app.getAppPath() : process.cwd(), 'resources', 'bin', 'cursorhook.exe'),
    join(__dirname, '../../resources/bin/cursorhook.exe'),
    join(__dirname, '../resources/bin/cursorhook.exe')
  ]

  for (const p of candidates) {
    if (p && existsSync(p)) return p
  }
  return null
}

export function startCursorHook(): void {
  if (hookProcess) return

  const settings = readSettings()
  if (settings.ctrlRightClickSummon === false) return

  const exePath = getCursorHookPath()
  if (!exePath) {
    console.warn('[CursorHook] cursorhook.exe not found. Run scripts/repair-environment.ps1')
    return
  }

  isShuttingDown = false

  try {
    hookProcess = spawn(exePath, [], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdoutBuffer = ''

    hookProcess.stdout?.on('data', (chunk: Buffer | string) => {
      stdoutBuffer += chunk.toString()
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('CTRL_RIGHT_CLICK')) {
          // Use screen.getCursorScreenPoint() which provides the true logical coordinates (DIPs)
          // matching Electron's window positioning, completely avoiding physical DPI scaling offsets
          try {
            const pt = screen.getCursorScreenPoint()
            summonBarTo(pt.x, pt.y)
          } catch {
            const parts = trimmed.split(/\s+/)
            if (parts.length >= 3) {
              const x = parseInt(parts[1], 10)
              const y = parseInt(parts[2], 10)
              if (!isNaN(x) && !isNaN(y)) {
                summonBarTo(x, y)
              }
            }
          }
        }
      }
    })

    hookProcess.stderr?.on('data', (chunk: Buffer | string) => {
      console.warn('[CursorHook stderr]:', chunk.toString().trim())
    })

    hookProcess.on('exit', () => {
      hookProcess = null
      if (!isShuttingDown) {
        // Restart after brief delay if unexpected exit
        setTimeout(() => {
          if (!isShuttingDown && readSettings().ctrlRightClickSummon !== false) {
            startCursorHook()
          }
        }, 2000)
      }
    })

    hookProcess.on('error', (err) => {
      console.warn('[CursorHook] Spawn error:', err)
      hookProcess = null
    })
  } catch (err) {
    console.warn('[CursorHook] Failed to start cursor hook:', err)
    hookProcess = null
  }
}

export function stopCursorHook(): void {
  isShuttingDown = true
  if (hookProcess) {
    try {
      hookProcess.stdin?.write('quit\n')
      setTimeout(() => {
        if (hookProcess) {
          hookProcess.kill()
          hookProcess = null
        }
      }, 300)
    } catch {
      try {
        hookProcess.kill()
      } catch {
        // ignore
      }
      hookProcess = null
    }
  }
}
