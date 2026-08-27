import { BrowserWindow, ipcMain, screen, type Rectangle, type NativeImage } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { readSettings, writeSettings } from './config'
import { ensurePty, writeToPty, resizePty, onPtyData, onPtyExit } from './terminal'

let termWindow: BrowserWindow | null = null
// Whether the panel is currently pulled out (full size, above/below the icon) vs. collapsed to
// its icon. Tracked here rather than inferred from window size, same reasoning as barActive.
let termExpanded = false
let termMoveModeActive = false
let lastBarBounds: Rectangle | null = null

const ICON_SIZE = { width: 44, height: 44 }
// Fixed by design (see Settings answer #15) — the panel always resets to this size and
// position on every expand, it doesn't remember a user-resized/moved state.
const PANEL_SIZE = { width: 640, height: 360 }
const GAP = 8
const IDLE_BOTTOM_MARGIN = 8
// Rough monospace cell size used only to size the pty at first spawn, before the
// renderer's real xterm.js fit measurement arrives via 'term-resize'.
const CHAR_CELL = { width: 8, height: 17 }

function clampRect(rect: Rectangle, workArea: Rectangle): Rectangle {
  const maxX = Math.max(workArea.x, workArea.x + workArea.width - rect.width)
  const maxY = Math.max(workArea.y, workArea.y + workArea.height - rect.height)
  return {
    x: Math.min(Math.max(rect.x, workArea.x), maxX),
    y: Math.min(Math.max(rect.y, workArea.y), maxY),
    width: rect.width,
    height: rect.height
  }
}

function defaultAttachedBounds(bar: Rectangle): Rectangle {
  const { workArea } = screen.getDisplayNearestPoint({ x: bar.x, y: bar.y })
  const distLeft = bar.x - workArea.x
  const distRight = workArea.x + workArea.width - (bar.x + bar.width)
  const distTop = bar.y - workArea.y
  const distBottom = workArea.y + workArea.height - (bar.y + bar.height)

  // If docked near the left or right edge, or if horizontal spacing would cause clipping on the left
  const isLeftEdge = distLeft < 80 || bar.x - ICON_SIZE.width - GAP < workArea.x
  const isRightEdge = distRight < 80
  const isVertical = isLeftEdge || isRightEdge

  if (isVertical) {
    // Stack buttons vertically along the edge so neither button clips off-screen
    const x = bar.x
    // If near the top edge, place terminal below the bar; otherwise place above
    const y =
      distTop < distBottom && distTop < ICON_SIZE.height + GAP + 20
        ? bar.y + bar.height + GAP
        : bar.y - ICON_SIZE.height - GAP
    return clampRect({ x, y, width: ICON_SIZE.width, height: ICON_SIZE.height }, workArea)
  }

  // Default horizontal layout (terminal to the left of the command bar)
  const x = bar.x - ICON_SIZE.width - GAP
  const y = Math.round(bar.y + (bar.height - ICON_SIZE.height) / 2)
  return clampRect({ x, y, width: ICON_SIZE.width, height: ICON_SIZE.height }, workArea)
}

function idleBounds(bar?: Rectangle | null): Rectangle {
  const { termPosition } = readSettings()
  if (termPosition) {
    const { workArea } = screen.getDisplayNearestPoint({ x: termPosition.x, y: termPosition.y })
    return clampRect({ x: termPosition.x, y: termPosition.y, ...ICON_SIZE }, workArea)
  }

  const activeBar = bar ?? lastBarBounds
  if (activeBar) {
    return defaultAttachedBounds(activeBar)
  }

  const { workArea } = screen.getPrimaryDisplay()
  const { width, height } = ICON_SIZE
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2) - width - GAP,
    y: workArea.y + workArea.height - height - IDLE_BOTTOM_MARGIN,
    width,
    height
  }
}

function expandedBounds(bar?: Rectangle | null): Rectangle {
  const { termWindowPosition } = readSettings()
  if (termWindowPosition) {
    const { workArea } = screen.getDisplayNearestPoint({ x: termWindowPosition.x, y: termWindowPosition.y })
    return clampRect({ x: termWindowPosition.x, y: termWindowPosition.y, ...PANEL_SIZE }, workArea)
  }

  const icon = idleBounds(bar)
  const { workArea } = screen.getDisplayNearestPoint({ x: icon.x, y: icon.y })
  const { width, height } = PANEL_SIZE
  const screenCenterX = workArea.x + workArea.width / 2
  const screenCenterY = workArea.y + workArea.height / 2
  const iconCenterX = icon.x + icon.width / 2
  const iconCenterY = icon.y + icon.height / 2

  // Center horizontally over the icon's position, clamped to work area
  const targetX = Math.round(iconCenterX - width / 2)

  // Vertical popout:
  // If in the bottom half of the screen, open upwards above the dock.
  // If in the top half of the screen, open downwards below the dock.
  let targetY: number
  if (iconCenterY >= screenCenterY) {
    targetY = icon.y - GAP - height
  } else {
    targetY = icon.y + icon.height + GAP
  }

  return clampRect({ x: targetX, y: targetY, width, height }, workArea)
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
  // Registered once for the window's lifetime — forwards pty output regardless of
  // expand state, so scrollback is never missed while the renderer is mounted but the
  // panel happens to be visually collapsed.
  onPtyData((data) => {
    termWindow?.webContents.send('term-data', data)
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

export function isTermMoveModeActive(): boolean {
  return termMoveModeActive
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
    const icon = idleBounds(lastBarBounds)
    const panel = expandedBounds(lastBarBounds)
    // Tell the renderer to switch to the (opacity-0, grow-pending) expanded layout and
    // arm the animation *before* the OS window actually grows.
    termWindow.webContents.send('term-expanded', true)
    termWindow.webContents.send('term-grow-origin', {
      originX: ((icon.x + icon.width / 2 - panel.x) / panel.width) * 100,
      originY: ((icon.y + icon.height / 2 - panel.y) / panel.height) * 100,
      scale: icon.width / panel.width
    })
    termExpandTimeout = setTimeout(() => {
      termExpandTimeout = null
      if (!termWindow || !termExpanded) return
      termWindow.setBounds(panel)
      termWindow.focus()
      ensurePty(Math.floor(PANEL_SIZE.width / CHAR_CELL.width), Math.floor(PANEL_SIZE.height / CHAR_CELL.height))
      termWindow.webContents.send('term-respawned')
    }, 30)
  } else {
    const icon = idleBounds(lastBarBounds)
    const panel = expandedBounds(lastBarBounds)
    termWindow.webContents.send('term-collapsing', {
      originX: ((icon.x + icon.width / 2 - panel.x) / panel.width) * 100,
      originY: ((icon.y + icon.height / 2 - panel.y) / panel.height) * 100,
      scale: icon.width / panel.width
    })
    termCollapseTimeout = setTimeout(() => {
      termCollapseTimeout = null
      if (!termWindow) return
      termWindow.setBounds(idleBounds(lastBarBounds))
      termWindow.webContents.send('term-expanded', false)
    }, 160)
  }
}

// Entry point for the dedicated "pop open the terminal" hotkey (see main/index.ts) —
// unlike toggleTerminal(), this also makes sure the window is actually showing first
// (it stays hidden whenever the bar's been turned off via "/view"), so the hotkey works
// regardless of the bar's current visibility.
export function openTerminal(): void {
  if (!termWindow) return
  if (!termWindow.isVisible()) {
    termWindow.setBounds(idleBounds(lastBarBounds))
    termWindow.showInactive()
  }
  toggleTerminal()
}
