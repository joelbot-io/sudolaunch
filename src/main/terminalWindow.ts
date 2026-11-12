import { BrowserWindow, ipcMain, screen, type Rectangle, type NativeImage } from 'electron'
import { join } from 'path'
import { readSettings, writeSettings } from './config'
import { ensurePty, writeToPty, resizePty, onPtyData, onPtyExit } from './terminal'
import { DockGeometry } from './dock/DockGeometry'
import { dockManager } from './dock/DockManager'
import {
  calculateSatelliteIdleBounds,
  configureDockOverlayWindow
} from './dock/dockWindowHelpers'
import { getDockDisplay } from './display'

let termWindow: BrowserWindow | null = null
// Whether the panel is currently pulled out (full size, above/below the icon) vs. collapsed to
// its icon. Tracked here rather than inferred from window size, same reasoning as barActive.
let termExpanded = false
let termMoveModeActive = false
let lastBarBounds: Rectangle | null = null
let hasUnreadActivity = false
let pendingPtyData = ''
let ptyFlushTimer: NodeJS.Timeout | null = null
const PTY_COALESCE_MS = 8

function flushPtyData(): void {
  ptyFlushTimer = null
  if (!pendingPtyData) return
  const chunk = pendingPtyData
  pendingPtyData = ''
  if (termWindow && !termWindow.isDestroyed()) {
    termWindow.webContents.send('term-data', chunk)
  }
}

function setUnreadActivity(unread: boolean): void {
  if (hasUnreadActivity === unread) return
  hasUnreadActivity = unread
  if (termWindow && !termWindow.isDestroyed()) {
    termWindow.webContents.send('term-unread-activity', unread)
  }
  dockManager.sendToBar('term-unread-activity', unread)
}

// Rough monospace cell size used only to size the pty at first spawn, before the
// renderer's real xterm.js fit measurement arrives via 'term-resize'.
const CHAR_CELL = { width: 8, height: 17 }

function idleBounds(bar?: Rectangle | null): Rectangle {
  const settings = readSettings()
  return calculateSatelliteIdleBounds('terminal', bar, lastBarBounds, settings.termPosition)
}

const MIN_TERMINAL_WIDTH = 420
const MIN_TERMINAL_HEIGHT = 220
let preMaximizeBounds: Rectangle | null = null

function setTerminalResizableState(resizable: boolean): void {
  if (!termWindow || termWindow.isDestroyed()) return
  if (resizable) {
    termWindow.setMinimumSize(MIN_TERMINAL_WIDTH, MIN_TERMINAL_HEIGHT)
    termWindow.setResizable(true)
  } else {
    termWindow.setMinimumSize(1, 1)
    termWindow.setResizable(false)
  }
}

function expandedBounds(bar?: Rectangle | null): Rectangle {
  const settings = readSettings()
  const icon = idleBounds(bar)
  const { workArea } = screen.getDisplayNearestPoint({ x: icon.x, y: icon.y })
  const width = Math.max(
    MIN_TERMINAL_WIDTH,
    Math.min(settings.terminalWidth ?? DockGeometry.TERMINAL_PANEL_SIZE.width, workArea.width - 24)
  )
  const height = Math.max(
    MIN_TERMINAL_HEIGHT,
    Math.min(
      settings.terminalHeight ?? DockGeometry.TERMINAL_PANEL_SIZE.height,
      workArea.height - 24
    )
  )
  const panelSize = {
    width,
    height
  }
  return DockGeometry.calculateExpandedBounds(
    icon,
    panelSize,
    workArea,
    settings.termWindowPosition
  )
}

// Anchored to (and only ever shown alongside) the bar window — see repositionTerminal,
// which main/index.ts calls every time the bar moves.
export function createTerminalWindow(icon: NativeImage): BrowserWindow {
  termWindow = new BrowserWindow({
    ...idleBounds(),
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    transparent: true,
    backgroundColor: '#00000000',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  configureDockOverlayWindow(termWindow, 'term')
  termWindow.on('moved', () => {
    if (termExpanded && termWindow && !termCollapseTimeout && !termExpandTimeout) {
      const { x, y } = termWindow.getBounds()
      const settings = readSettings()
      if (settings.termWindowPosition?.x !== x || settings.termWindowPosition?.y !== y) {
        writeSettings({ ...settings, termWindowPosition: { x, y } })
      }
    }
  })
  termWindow.on('resized', () => {
    if (termExpanded && termWindow && !termCollapseTimeout && !termExpandTimeout) {
      const { x, y, width, height } = termWindow.getBounds()
      if (width < MIN_TERMINAL_WIDTH || height < MIN_TERMINAL_HEIGHT) return
      preMaximizeBounds = null
      const settings = readSettings()
      if (
        settings.terminalWidth !== width ||
        settings.terminalHeight !== height ||
        settings.termWindowPosition?.x !== x ||
        settings.termWindowPosition?.y !== y
      ) {
        writeSettings({
          ...settings,
          termWindowPosition: { x, y },
          terminalWidth: width,
          terminalHeight: height
        })
      }
    }
  })
  termWindow.on('closed', () => {
    if (ptyFlushTimer) {
      clearTimeout(ptyFlushTimer)
      ptyFlushTimer = null
    }
    pendingPtyData = ''
    termWindow = null
  })
  termWindow.on('focus', () => {
    setUnreadActivity(false)
  })
  // Registered once for the window's lifetime — forwards pty output regardless of
  // expand state, so scrollback is never missed while the renderer is mounted but the
  // panel happens to be visually collapsed. Chunks are coalesced over an 8ms window to
  // avoid saturating IPC during high-throughput terminal output.
  onPtyData((data) => {
    pendingPtyData += data
    if (!ptyFlushTimer) {
      ptyFlushTimer = setTimeout(flushPtyData, PTY_COALESCE_MS)
    }
    if (!termExpanded && termWindow) {
      setUnreadActivity(true)
    }
  })
  // The shell can end on its own (the user typing "exit", or a crash) while the panel is
  // open or collapsed. Collapse back to the icon so the panel isn't left showing a dead
  // session, and flag the icon as stale — the next expand spawns a fresh shell, which is
  // what clears the flag again (see ensurePty in toggleTerminal).
  onPtyExit(() => {
    if (!termWindow) return
    if (termExpanded) {
      termExpanded = false
      setTerminalResizableState(false)
      termWindow.setBounds(idleBounds(lastBarBounds))
      termWindow.webContents.send('term-expanded', false)
    }
    termWindow.webContents.send('term-exited')
  })

  dockManager.registerTerminal(termWindow, {
    reposition: repositionTerminal,
    show: showTerminalWindow,
    hide: hideTerminalWindow,
    reset: resetTermPosition
  })

  return termWindow
}

export function resizeTerminalWindow(
  width: number,
  height: number,
  x?: number,
  y?: number,
  resetToDefault?: boolean
): { x: number; y: number; width: number; height: number } {
  const settings = readSettings()
  const currentBounds = termWindow?.getBounds()
  const display = currentBounds
    ? screen.getDisplayNearestPoint({ x: currentBounds.x, y: currentBounds.y })
    : getDockDisplay(settings.monitor)
  const { workArea } = display
  const maxW = Math.max(MIN_TERMINAL_WIDTH, workArea.width - 24)
  const maxH = Math.max(MIN_TERMINAL_HEIGHT, workArea.height - 24)
  const nextWidth = Math.round(Math.max(MIN_TERMINAL_WIDTH, Math.min(maxW, width)))
  const nextHeight = Math.round(Math.max(MIN_TERMINAL_HEIGHT, Math.min(maxH, height)))
  preMaximizeBounds = null

  if (resetToDefault) {
    const nextSettings = {
      ...settings,
      terminalWidth: nextWidth,
      terminalHeight: nextHeight,
      termWindowPosition: null
    }
    writeSettings(nextSettings)
    if (termWindow && !termWindow.isDestroyed() && termExpanded) {
      const icon = idleBounds(lastBarBounds)
      const resetBounds = DockGeometry.calculateExpandedBounds(
        icon,
        { width: nextWidth, height: nextHeight },
        workArea,
        null
      )
      termWindow.setBounds(resetBounds)
      return resetBounds
    }
    return {
      x: currentBounds?.x ?? workArea.x,
      y: currentBounds?.y ?? workArea.y,
      width: nextWidth,
      height: nextHeight
    }
  }

  const nextX = typeof x === 'number' ? Math.round(x) : (currentBounds?.x ?? workArea.x)
  const nextY = typeof y === 'number' ? Math.round(y) : (currentBounds?.y ?? workArea.y)
  const clamped = DockGeometry.clampRect(
    { x: nextX, y: nextY, width: nextWidth, height: nextHeight },
    workArea
  )

  if (termWindow && !termWindow.isDestroyed() && termExpanded) {
    termWindow.setBounds(clamped)
    writeSettings({
      ...settings,
      termWindowPosition: { x: clamped.x, y: clamped.y },
      terminalWidth: clamped.width,
      terminalHeight: clamped.height
    })
  } else {
    writeSettings({
      ...settings,
      terminalWidth: clamped.width,
      terminalHeight: clamped.height
    })
  }

  return clamped
}

export function toggleMaximizeTerminalWindow(): { maximized: boolean; bounds: Rectangle | null } {
  if (!termWindow || termWindow.isDestroyed() || !termExpanded) {
    return { maximized: false, bounds: null }
  }
  const current = termWindow.getBounds()
  const { workArea } = screen.getDisplayNearestPoint({
    x: current.x + current.width / 2,
    y: current.y + current.height / 2
  })

  if (preMaximizeBounds) {
    const restore = DockGeometry.clampRect(preMaximizeBounds, workArea)
    preMaximizeBounds = null
    termWindow.setBounds(restore)
    const settings = readSettings()
    writeSettings({
      ...settings,
      termWindowPosition: { x: restore.x, y: restore.y },
      terminalWidth: restore.width,
      terminalHeight: restore.height
    })
    return { maximized: false, bounds: restore }
  }

  preMaximizeBounds = { ...current }
  const maxBounds: Rectangle = {
    x: workArea.x + 12,
    y: workArea.y + 12,
    width: Math.max(MIN_TERMINAL_WIDTH, workArea.width - 24),
    height: Math.max(MIN_TERMINAL_HEIGHT, workArea.height - 24)
  }
  termWindow.setBounds(maxBounds)
  return { maximized: true, bounds: maxBounds }
}

export function registerTerminalIpc(): void {
  ipcMain.on('term-toggle', () => toggleTerminal())
  ipcMain.on('term-move-mode-toggle', () => toggleTermMoveMode())
  ipcMain.on('term-input', (_event, data: string) => writeToPty(data))
  ipcMain.on('term-resize', (_event, cols: number, rows: number) => resizePty(cols, rows))
  ipcMain.handle(
    'term-resize-window',
    (_event, width: number, height: number, x?: number, y?: number, resetToDefault?: boolean) =>
      resizeTerminalWindow(width, height, x, y, resetToDefault)
  )
  ipcMain.handle('term-toggle-maximize', () => toggleMaximizeTerminalWindow())
}

export function repositionTerminal(barBounds?: Rectangle): void {
  if (barBounds) lastBarBounds = barBounds
  if (!termWindow) return
  if (!termExpanded) setTerminalResizableState(false)
  termWindow.setBounds(termExpanded ? expandedBounds(lastBarBounds) : idleBounds(lastBarBounds))
  if (termExpanded) setTerminalResizableState(true)
}

export function showTerminalWindow(): void {
  if (!termWindow) return
  if (termExpanded) {
    termWindow.setBounds(expandedBounds(lastBarBounds))
    setTerminalResizableState(true)
    if (!termWindow.isVisible()) {
      termWindow.showInactive()
    }
    return
  }
  const settings = readSettings()
  if (settings.dockLayout === 'shelf' || settings.dockLayout === 'circle') {
    termExpanded = false
    setTerminalResizableState(false)
    termWindow.webContents.send('term-expanded', false)
    termWindow.hide()
    return
  }
  termExpanded = false
  setTerminalResizableState(false)
  termWindow.setBounds(idleBounds(lastBarBounds))
  termWindow.webContents.send('term-expanded', false)
  termWindow.showInactive()
}

export function hideTerminalWindow(): void {
  if (!termWindow) return
  if (termExpanded) {
    termExpanded = false
    setTerminalResizableState(false)
    dockManager.notifyPanelCollapsed()
    termWindow.webContents.send('term-expanded', false)
  }
  termWindow.hide()
}

export function toggleTermMoveMode(): void {
  if (!termWindow) return
  if (termMoveModeActive) {
    termMoveModeActive = false
    const { x, y } = termWindow.getBounds()
    const settings = readSettings()
    writeSettings({ ...settings, termPosition: { x, y } })
  } else {
    termExpanded = false
    termMoveModeActive = true
    setTerminalResizableState(false)
    termWindow.setBounds(idleBounds(lastBarBounds))
    if (!termWindow.isVisible()) termWindow.showInactive()
    termWindow.focus()
  }
  termWindow.webContents.send('term-move-mode-changed', termMoveModeActive)
}

export function resetTermPosition(): void {
  const settings = readSettings()
  preMaximizeBounds = null
  writeSettings({
    ...settings,
    termPosition: null,
    termWindowPosition: null,
    terminalWidth: DockGeometry.TERMINAL_PANEL_SIZE.width,
    terminalHeight: DockGeometry.TERMINAL_PANEL_SIZE.height
  })
  if (termWindow) {
    termWindow.setBounds(termExpanded ? expandedBounds(lastBarBounds) : idleBounds(lastBarBounds))
  }
}

let termCollapseTimeout: NodeJS.Timeout | null = null
let termExpandTimeout: NodeJS.Timeout | null = null

export function toggleTerminal(): void {
  if (!termWindow) return
  if (termCollapseTimeout) {
    clearTimeout(termCollapseTimeout)
    termCollapseTimeout = null
  }
  if (termExpandTimeout) {
    clearTimeout(termExpandTimeout)
    termExpandTimeout = null
  }

  termExpanded = !termExpanded
  if (termExpanded) {
    dockManager.notifyPanelExpanded()
    setUnreadActivity(false)
    if (!termWindow.isVisible()) {
      setTerminalResizableState(false)
      termWindow.setBounds(idleBounds(lastBarBounds))
      termWindow.showInactive()
    }
    const icon = idleBounds(lastBarBounds)
    const panel = expandedBounds(lastBarBounds)
    // Tell the renderer to switch to the (opacity-0, grow-pending) expanded layout and
    // arm the animation *before* the OS window actually grows.
    termWindow.webContents.send('term-expanded', true)
    termWindow.webContents.send('term-grow-origin', DockGeometry.calculateGrowOrigin(icon, panel))
    termExpandTimeout = setTimeout(() => {
      termExpandTimeout = null
      if (!termWindow || !termExpanded) return
      termWindow.setBounds(panel)
      setTerminalResizableState(true)
      termWindow.focus()
      ensurePty(
        Math.max(20, Math.floor((panel.width - 38) / CHAR_CELL.width)),
        Math.max(5, Math.floor((panel.height - 58) / CHAR_CELL.height))
      )
      termWindow.webContents.send('term-respawned')
    }, 30)
  } else {
    dockManager.notifyPanelCollapsed()
    const icon = idleBounds(lastBarBounds)
    const panel = termWindow.getBounds()
    termWindow.webContents.send('term-collapsing', DockGeometry.calculateGrowOrigin(icon, panel))
    termCollapseTimeout = setTimeout(() => {
      termCollapseTimeout = null
      if (!termWindow) return
      setTerminalResizableState(false)
      const settings = readSettings()
      if (settings.dockLayout === 'shelf' || settings.dockLayout === 'circle') {
        termWindow.hide()
      } else {
        termWindow.setBounds(idleBounds(lastBarBounds))
      }
      termWindow.webContents.send('term-expanded', false)
    }, 160)
  }
}

export function openTerminal(): void {
  if (!termWindow) return
  if (!termWindow.isVisible()) {
    termWindow.setBounds(idleBounds(lastBarBounds))
    termWindow.showInactive()
  }
  if (!termExpanded) {
    toggleTerminal()
  }
}

export function runInTerminal(commandText: string): void {
  if (!termWindow) return
  const settings = readSettings()
  if (settings.dockLayout !== 'shelf' && !termWindow.isVisible()) {
    termWindow.setBounds(idleBounds(lastBarBounds))
    termWindow.showInactive()
  }

  // Ensure PTY is initialized in the background
  const panel = expandedBounds(lastBarBounds)
  ensurePty(
    Math.max(20, Math.floor((panel.width - 38) / CHAR_CELL.width)),
    Math.max(5, Math.floor((panel.height - 58) / CHAR_CELL.height))
  )

  // Write command directly to PTY session
  writeToPty(commandText + '\r')

  // If the terminal is not expanded, signal unread activity for the glowing indicator
  if (!termExpanded) {
    setUnreadActivity(true)
  }
}

/**
 * Expands and focuses the embedded SudoLaunch terminal, waits for xterm.js FitAddon
 * to sync full-panel cols/rows (and for the palette blur/hide handshake to settle),
 * and dispatches an interactive TUI command (such as a Python Textual app).
 */
export function launchInEmbeddedTerminal(commandText: string): void {
  if (!termWindow) return
  const wasExpanded = termExpanded
  openTerminal()

  const delayMs = wasExpanded ? 45 : 155
  setTimeout(() => {
    if (!termWindow || termWindow.isDestroyed()) return
    const panel = expandedBounds(lastBarBounds)
    ensurePty(
      Math.max(20, Math.floor((panel.width - 38) / CHAR_CELL.width)),
      Math.max(5, Math.floor((panel.height - 58) / CHAR_CELL.height))
    )
    termWindow.focus()
    writeToPty(commandText + '\r')
  }, delayMs)
}
