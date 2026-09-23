import { BrowserWindow, ipcMain, screen, type Rectangle, type NativeImage } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { readSettings, writeSettings } from './config'
import { ensurePty, writeToPty, resizePty, onPtyData, onPtyExit } from './terminal'
import { DockGeometry } from './dock/DockGeometry'
import { dockManager } from './dock/DockManager'
import { getDockDisplay } from './display'

let termWindow: BrowserWindow | null = null
// Whether the panel is currently pulled out (full size, above/below the icon) vs. collapsed to
// its icon. Tracked here rather than inferred from window size, same reasoning as barActive.
let termExpanded = false
let termMoveModeActive = false
let lastBarBounds: Rectangle | null = null

// Rough monospace cell size used only to size the pty at first spawn, before the
// renderer's real xterm.js fit measurement arrives via 'term-resize'.
const CHAR_CELL = { width: 8, height: 17 }

function getLiveBarBounds(bar?: Rectangle | null): Rectangle | null {
  if (bar) return bar
  const barWin = dockManager.getBarWindow()
  if (barWin && !barWin.isDestroyed() && barWin.isVisible()) {
    return barWin.getBounds()
  }
  const last = dockManager.getLastBarBounds()
  if (last) return last
  if (lastBarBounds) return lastBarBounds
  return null
}

function idleBounds(bar?: Rectangle | null): Rectangle {
  const settings = readSettings()
  const activeBar = getLiveBarBounds(bar)
  const display = activeBar
    ? screen.getDisplayNearestPoint({
        x: activeBar.x + activeBar.width / 2,
        y: activeBar.y + activeBar.height / 2
      })
    : getDockDisplay(settings.monitor)

  if (settings.dockLayout === 'circle') {
    const dock =
      activeBar ??
      DockGeometry.calculateCircleOrbitBounds(
        display.workArea,
        settings.dockHomePosition,
        settings.dockHomeCustomCoordinates
      )
    return DockGeometry.calculateCircleSatelliteBounds(
      dock,
      'terminal',
      settings.shelfIcons,
      settings.dockHomePosition,
      settings.dockHomeCustomCoordinates
    )
  }

  if (settings.dockLayout === 'shelf') {
    const slotCount = settings.shelfIcons?.length ?? 7
    const shelfBar =
      activeBar ??
      DockGeometry.calculateShelfBarBounds(
        display.workArea,
        slotCount,
        settings.dockHomePosition,
        settings.dockHomeCustomCoordinates
      )
    return DockGeometry.calculateShelfIconBounds(
      shelfBar,
      'terminal',
      settings.shelfIcons,
      settings.dockHomePosition,
      settings.dockHomeCustomCoordinates
    )
  }

  if (settings.termPosition) {
    const { workArea: ptArea } = screen.getDisplayNearestPoint({
      x: settings.termPosition.x,
      y: settings.termPosition.y
    })
    return DockGeometry.clampRect(
      { x: settings.termPosition.x, y: settings.termPosition.y, ...DockGeometry.ICON_SIZE },
      ptArea
    )
  }

  if (activeBar) {
    return DockGeometry.calculateAttachedBounds(
      activeBar,
      'terminal',
      settings.dockLayout ?? 'horizontal',
      display.workArea
    )
  }

  return DockGeometry.calculateDefaultIdleBounds(
    display.workArea,
    'terminal',
    settings.dockLayout ?? 'horizontal',
    settings.dockHomePosition,
    settings.dockHomeCustomCoordinates
  )
}

function expandedBounds(bar?: Rectangle | null): Rectangle {
  const settings = readSettings()
  const icon = idleBounds(bar)
  const { workArea } = screen.getDisplayNearestPoint({ x: icon.x, y: icon.y })
  const width = Math.max(
    480,
    Math.min(settings.terminalWidth ?? DockGeometry.TERMINAL_PANEL_SIZE.width, workArea.width - 32)
  )
  const panelSize = {
    width,
    height: DockGeometry.TERMINAL_PANEL_SIZE.height
  }
  return DockGeometry.calculateExpandedBounds(
    icon,
    panelSize,
    workArea,
    settings.termWindowPosition
  )
}

function loadRenderer(win: BrowserWindow): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL'])
    url.searchParams.set('mode', 'term')
    win.loadURL(url.toString())
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { query: { mode: 'term' } })
  }
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
      sandbox: false
    }
  })
  // Plain alwaysOnTop:true only reaches the "floating" level, which the taskbar/Start
  // menu still renders above — "screen-saver" is what actually clears that band (see
  // the same fix on the bar/popup windows in main/index.ts's createBaseWindow).
  termWindow.setAlwaysOnTop(true, 'screen-saver')
  loadRenderer(termWindow)
  termWindow.on('moved', () => {
    if (termExpanded && termWindow) {
      const { x, y } = termWindow.getBounds()
      const settings = readSettings()
      writeSettings({ ...settings, termWindowPosition: { x, y } })
    }
  })
  termWindow.on('closed', () => {
    termWindow = null
  })
  termWindow.on('focus', () => {
    termWindow?.webContents.send('term-unread-activity', false)
    dockManager.sendToBar('term-unread-activity', false)
  })
  // Registered once for the window's lifetime — forwards pty output regardless of
  // expand state, so scrollback is never missed while the renderer is mounted but the
  // panel happens to be visually collapsed.
  onPtyData((data) => {
    termWindow?.webContents.send('term-data', data)
    if (!termExpanded && termWindow) {
      termWindow.webContents.send('term-unread-activity', true)
      dockManager.sendToBar('term-unread-activity', true)
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

export function registerTerminalIpc(): void {
  ipcMain.on('term-toggle', () => toggleTerminal())
  ipcMain.on('term-move-mode-toggle', () => toggleTermMoveMode())
  ipcMain.on('term-input', (_event, data: string) => writeToPty(data))
  ipcMain.on('term-resize', (_event, cols: number, rows: number) => resizePty(cols, rows))
}

export function repositionTerminal(barBounds?: Rectangle): void {
  if (barBounds) lastBarBounds = barBounds
  if (!termWindow) return
  termWindow.setBounds(termExpanded ? expandedBounds(lastBarBounds) : idleBounds(lastBarBounds))
}

export function showTerminalWindow(): void {
  if (!termWindow) return
  const settings = readSettings()
  if (settings.dockLayout === 'shelf' || settings.dockLayout === 'circle') {
    termExpanded = false
    termWindow.webContents.send('term-expanded', false)
    termWindow.hide()
    return
  }
  termExpanded = false
  termWindow.setBounds(idleBounds(lastBarBounds))
  termWindow.webContents.send('term-expanded', false)
  termWindow.showInactive()
}

export function hideTerminalWindow(): void {
  if (!termWindow) return
  if (termExpanded) {
    termExpanded = false
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
    termWindow.setBounds(idleBounds(lastBarBounds))
    if (!termWindow.isVisible()) termWindow.showInactive()
    termWindow.focus()
  }
  termWindow.webContents.send('term-move-mode-changed', termMoveModeActive)
}

export function resetTermPosition(): void {
  const settings = readSettings()
  writeSettings({ ...settings, termPosition: null, termWindowPosition: null })
  if (termWindow && !termExpanded) {
    termWindow.setBounds(idleBounds(lastBarBounds))
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
    termWindow.webContents.send('term-unread-activity', false)
    dockManager.sendToBar('term-unread-activity', false)
    if (!termWindow.isVisible()) {
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
      termWindow.focus()
      ensurePty(
        Math.floor(panel.width / CHAR_CELL.width),
        Math.floor(panel.height / CHAR_CELL.height)
      )
      termWindow.webContents.send('term-respawned')
    }, 30)
  } else {
    dockManager.notifyPanelCollapsed()
    const icon = idleBounds(lastBarBounds)
    const panel = expandedBounds(lastBarBounds)
    termWindow.webContents.send('term-collapsing', DockGeometry.calculateGrowOrigin(icon, panel))
    termCollapseTimeout = setTimeout(() => {
      termCollapseTimeout = null
      if (!termWindow) return
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
    Math.floor(panel.width / CHAR_CELL.width),
    Math.floor(panel.height / CHAR_CELL.height)
  )

  // Write command directly to PTY session
  writeToPty(commandText + '\r')

  // If the terminal is not expanded, signal unread activity for the glowing indicator
  if (!termExpanded) {
    termWindow.webContents.send('term-unread-activity', true)
    dockManager.sendToBar('term-unread-activity', true)
  }
}
