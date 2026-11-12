import { BrowserWindow, ipcMain, nativeImage, screen } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { delimiter, join } from 'path'
import { is } from '@electron-toolkit/utils'
import * as pty from 'node-pty'
import type { TextualWindowInitInfo } from '../shared/types'
import { getAppIconPath } from './icon'
import type { TextualLaunchSpec } from './textualManager'

interface TextualWindowSession {
  sessionId: string
  spec: TextualLaunchSpec
  win: BrowserWindow
  ptyProcess: pty.IPty | null
  pinned: boolean
  pendingData: string
  flushTimer: NodeJS.Timeout | null
  closing: boolean
}

const sessions = new Map<string, TextualWindowSession>()
const PTY_COALESCE_MS = 8
const DEFAULT_TUI_WIDTH = 960
const DEFAULT_TUI_HEIGHT = 640
const MIN_TUI_WIDTH = 520
const MIN_TUI_HEIGHT = 340

function flushSessionOutput(session: TextualWindowSession): void {
  if (session.flushTimer) {
    clearTimeout(session.flushTimer)
    session.flushTimer = null
  }
  if (!session.pendingData) return
  const chunk = session.pendingData
  session.pendingData = ''
  if (!session.win.isDestroyed()) {
    session.win.webContents.send('textual-win-data', chunk)
  }
}

function quotePs(val: string): string {
  return `'${val.replace(/'/g, "''")}'`
}

function spawnSessionPty(session: TextualWindowSession, cols: number, rows: number): void {
  if (session.ptyProcess) {
    try {
      session.ptyProcess.kill()
    } catch {
      // ignore
    }
    session.ptyProcess = null
  }

  const safeCols = Math.max(30, Math.floor(cols || 96))
  const safeRows = Math.max(10, Math.floor(rows || 28))
  const cwd = existsSync(session.spec.cwd) ? session.spec.cwd : (process.env.USERPROFILE || process.cwd())
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'SudoLaunch',
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8'
  }
  if (session.spec.pythonPathEnv) {
    env.PYTHONPATH = env.PYTHONPATH
      ? `${session.spec.pythonPathEnv}${delimiter}${env.PYTHONPATH}`
      : session.spec.pythonPathEnv
  }

  const isDirectExe =
    session.spec.file.toLowerCase().endsWith('.exe') && existsSync(session.spec.file)

  try {
    let proc: pty.IPty
    if (isDirectExe) {
      proc = pty.spawn(session.spec.file, session.spec.args, {
        name: 'xterm-256color',
        cols: safeCols,
        rows: safeRows,
        cwd,
        env
      })
    } else {
      const psScript = `& ${quotePs(session.spec.file)} ${session.spec.args.map(quotePs).join(' ')}; exit $LASTEXITCODE`
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64')
      proc = pty.spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
        name: 'xterm-256color',
        cols: safeCols,
        rows: safeRows,
        cwd,
        env
      })
    }

    session.ptyProcess = proc

    proc.onData((data) => {
      session.pendingData += data
      if (!session.flushTimer) {
        session.flushTimer = setTimeout(() => flushSessionOutput(session), PTY_COALESCE_MS)
      }
    })

    proc.onExit(({ exitCode }) => {
      if (session.ptyProcess === proc) {
        session.ptyProcess = null
      }
      flushSessionOutput(session)
      if (session.closing || session.win.isDestroyed()) return

      // Temporary TUI window auto-closes immediately on clean exit (e.g. 'q' / Ctrl+Q in Textual).
      // On non-zero exit (crash / traceback / missing dependency), hold the window open so the
      // user can inspect the traceback, copy errors, or press R to restart.
      if (exitCode === 0) {
        session.closing = true
        session.win.close()
      } else {
        session.win.webContents.send('textual-win-exit', exitCode)
      }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const errBanner = `\r\n\x1b[1;31m[SudoLaunch] Failed to launch Textual process:\x1b[0m\r\n${msg}\r\nCommand: ${session.spec.displayCommand}\r\n`
    if (!session.win.isDestroyed()) {
      session.win.webContents.send('textual-win-data', errBanner)
      session.win.webContents.send('textual-win-exit', 1)
    }
  }
}

function loadTuiRenderer(win: BrowserWindow, sessionId: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL'])
    url.searchParams.set('mode', 'tui')
    url.searchParams.set('sessionId', sessionId)
    win.loadURL(url.toString())
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { mode: 'tui', sessionId }
    })
  }
}

export function openTextualWindow(spec: TextualLaunchSpec): BrowserWindow {
  const sessionId = randomUUID()
  const cursorPoint = screen.getCursorScreenPoint()
  const { workArea } = screen.getDisplayNearestPoint(cursorPoint)

  const width = Math.min(DEFAULT_TUI_WIDTH, Math.max(MIN_TUI_WIDTH, workArea.width - 48))
  const height = Math.min(DEFAULT_TUI_HEIGHT, Math.max(MIN_TUI_HEIGHT, workArea.height - 48))
  const cascade = (sessions.size % 5) * 26
  const x = Math.min(
    workArea.x + workArea.width - width,
    Math.max(workArea.x, Math.round(workArea.x + (workArea.width - width) / 2) + cascade)
  )
  const y = Math.min(
    workArea.y + workArea.height - height,
    Math.max(workArea.y, Math.round(workArea.y + (workArea.height - height) / 2) + cascade)
  )

  const icon = nativeImage.createFromPath(getAppIconPath())
  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    minWidth: MIN_TUI_WIDTH,
    minHeight: MIN_TUI_HEIGHT,
    show: false,
    frame: false,
    resizable: true,
    skipTaskbar: false,
    transparent: true,
    backgroundColor: '#00000000',
    title: `Textual · ${spec.title}`,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  const session: TextualWindowSession = {
    sessionId,
    spec,
    win,
    ptyProcess: null,
    pinned: false,
    pendingData: '',
    flushTimer: null,
    closing: false
  }

  sessions.set(sessionId, session)

  win.on('closed', () => {
    session.closing = true
    if (session.flushTimer) {
      clearTimeout(session.flushTimer)
      session.flushTimer = null
    }
    if (session.ptyProcess) {
      try {
        session.ptyProcess.kill()
      } catch {
        // ignore
      }
      session.ptyProcess = null
    }
    sessions.delete(sessionId)
  })

  loadTuiRenderer(win, sessionId)
  return win
}

export function registerTextualWindowIpc(): void {
  ipcMain.handle(
    'textual-win-init',
    (_event, sessionId: string, cols: number, rows: number): TextualWindowInitInfo | null => {
      const session = sessions.get(sessionId)
      if (!session || session.win.isDestroyed()) return null
      if (!session.win.isVisible()) {
        session.win.show()
      }
      session.win.focus()
      if (!session.ptyProcess) {
        spawnSessionPty(session, cols, rows)
      }
      return {
        sessionId: session.sessionId,
        title: session.spec.title,
        subtitle: session.spec.subtitle,
        commandDisplay: session.spec.displayCommand,
        cwd: session.spec.cwd,
        pinned: session.pinned
      }
    }
  )

  ipcMain.on('textual-win-input', (_event, sessionId: string, data: string) => {
    const session = sessions.get(sessionId)
    session?.ptyProcess?.write(data)
  })

  ipcMain.on('textual-win-resize', (_event, sessionId: string, cols: number, rows: number) => {
    const session = sessions.get(sessionId)
    if (session?.ptyProcess && cols > 0 && rows > 0) {
      try {
        session.ptyProcess.resize(cols, rows)
      } catch {
        // ignore ConPTY resize race on exit
      }
    }
  })

  ipcMain.handle('textual-win-restart', (_event, sessionId: string, cols: number, rows: number): boolean => {
    const session = sessions.get(sessionId)
    if (!session || session.win.isDestroyed()) return false
    spawnSessionPty(session, cols, rows)
    return true
  })

  ipcMain.handle('textual-win-toggle-pin', (_event, sessionId: string): boolean => {
    const session = sessions.get(sessionId)
    if (!session || session.win.isDestroyed()) return false
    session.pinned = !session.pinned
    if (session.pinned) {
      session.win.setAlwaysOnTop(true, 'floating')
    } else {
      session.win.setAlwaysOnTop(false)
    }
    return session.pinned
  })

  ipcMain.on('textual-win-maximize', (_event, sessionId: string) => {
    const session = sessions.get(sessionId)
    if (!session || session.win.isDestroyed()) return
    if (session.win.isMaximized()) {
      session.win.unmaximize()
    } else {
      session.win.maximize()
    }
  })

  ipcMain.on('textual-win-close', (_event, sessionId: string) => {
    const session = sessions.get(sessionId)
    if (!session || session.win.isDestroyed()) return
    session.closing = true
    session.win.close()
  })
}

export function closeAllTextualWindows(): void {
  for (const session of sessions.values()) {
    session.closing = true
    if (session.ptyProcess) {
      try {
        session.ptyProcess.kill()
      } catch {
        // ignore
      }
      session.ptyProcess = null
    }
    if (!session.win.isDestroyed()) {
      session.win.close()
    }
  }
  sessions.clear()
}

