import { BrowserWindow, ipcMain, screen, type Rectangle, type NativeImage } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { readSettings, writeSettings } from './config'
import {
  repositionTerminal,
  showTerminalWindow,
  hideTerminalWindow,
  toggleTermMoveMode,
  resetTermPosition
} from './terminalWindow'

let barWindow: BrowserWindow | null = null
// Whether the bar is currently pulled out to its "active" (full palette) bounds, as
// opposed to its docked idle icon. Tracked here (not inferred from window size) so a
// display-metrics-changed reflow knows which bounds to snap back to.
let barActive = false
// While true, the bar shows a drag handle instead of the icon/palette — see toggleMoveMode.
let moveModeActive = false

// Same size as the terminal's collapsed icon (see terminalWindow.ts's ICON_SIZE) so the
// two read as a matched pair sitting side by side.
const ICON_SIZE = { width: 44, height: 44 }
const ACTIVE_SIZE = { width: 640, height: 420 }
const IDLE_BOTTOM_MARGIN = 8
const GAP = 8

function defaultIdleBounds(): Rectangle {
  const { workArea } = screen.getPrimaryDisplay()
  const { width, height } = ICON_SIZE
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: workArea.y + workArea.height - height - IDLE_BOTTOM_MARGIN,
    width,
    height
  }
}

// Keeps a dragged-to position from ending up (partially) off-screen — e.g. after a
// resolution change or unplugging the monitor it was dragged to.
function clampToWorkArea(bounds: Rectangle): Rectangle {
  const { workArea } = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y })
  const maxX = Math.max(workArea.x, workArea.x + workArea.width - bounds.width)
  const maxY = Math.max(workArea.y, workArea.y + workArea.height - bounds.height)
  return {
    x: Math.min(Math.max(bounds.x, workArea.x), maxX),
    y: Math.min(Math.max(bounds.y, workArea.y), maxY),
    width: bounds.width,
    height: bounds.height
  }
}

function idleBounds(): Rectangle {
  const { barPosition } = readSettings()
  if (!barPosition) return defaultIdleBounds()
  return clampToWorkArea({ x: barPosition.x, y: barPosition.y, ...ICON_SIZE })
}

// The palette opens hovering above the docked icon (or below if docked near the top of the screen),
// horizontally centered over the icon.
function activeBounds(): Rectangle {
  const idle = idleBounds()
  const { workArea } = screen.getDisplayNearestPoint({ x: idle.x, y: idle.y })
  const { width, height } = ACTIVE_SIZE
  const centerX = idle.x + idle.width / 2
  const centerY = idle.y + idle.height / 2
  const screenCenterY = workArea.y + workArea.height / 2

  const targetX = Math.round(centerX - width / 2)
  const targetY = centerY >= screenCenterY ? idle.y - GAP - height : idle.y + idle.height + GAP

  return clampToWorkArea({
    x: targetX,
    y: targetY,
    width,
    height
  })
}

function loadRenderer(win: BrowserWindow): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL'])
    url.searchParams.set('mode', 'bar')
    win.loadURL(url.toString())
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { query: { mode: 'bar' } })
  }
}

export function createBarWindow(icon: NativeImage): BrowserWindow {
  barWindow = new BrowserWindow({
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
  // menu still renders above — "screen-saver" is what actually clears that band.
  barWindow.setAlwaysOnTop(true, 'screen-saver')
  loadRenderer(barWindow)
  barWindow.on('move', () => {
    if (moveModeActive && barWindow) {
      repositionTerminal(barWindow.getBounds())
    }
  })
  barWindow.on('closed', () => {
    barWindow = null
  })
  return barWindow
}

export function isBarWindow(win: BrowserWindow | null): boolean {
  return !!win && win === barWindow
}

export function isBarVisible(): boolean {
  return !!barWindow && barWindow.isVisible()
}

export function sendToBar(channel: string, ...args: unknown[]): void {
  barWindow?.webContents.send(channel, ...args)
}

// Shows/hides the bar entirely — driven only by the "barEnabled" setting, which is itself
// only ever flipped by the "/view" command, by design. The terminal window has no
// independent visibility of its own — it's anchored to the bar, so it shows/hides (and
// collapses) right alongside it.
export function setBarVisible(visible: boolean): void {
  if (!barWindow) return
  if (visible && !barWindow.isVisible()) {
    barActive = false
    barWindow.setBounds(idleBounds())
    barWindow.showInactive()
    repositionTerminal(barWindow.getBounds())
    showTerminalWindow()
  } else if (!visible && barWindow.isVisible()) {
    barWindow.hide()
    hideTerminalWindow()
  }
}

let barCollapseTimeout: NodeJS.Timeout | null = null
let barActivateTimeout: NodeJS.Timeout | null = null

export function activateBar(): void {
  if (!barWindow || moveModeActive) return
  if (barCollapseTimeout) {
    clearTimeout(barCollapseTimeout)
    barCollapseTimeout = null
  }
  if (barActivateTimeout) {
    clearTimeout(barActivateTimeout)
    barActivateTimeout = null
  }
  barActive = true
  const idle = idleBounds()
  const active = activeBounds()
  // The terminal icon docks next to the bar's idle position, not wherever the bar
  // window currently is — passing the just-set active bounds here would re-anchor it
  // to the expanded palette (wrong x, and vertically centered on the palette's taller
  // height), producing a visible jump, worst when clamping has pulled the palette away
  // from an edge-docked idle position.
  repositionTerminal(idle)
  // The renderer animates the palette growing out of where the icon just was (see
  // .palette-grow in styles.css). That anchor is usually the palette's own center, but
  // not when activeBounds() had to clamp away from a screen edge — so hand over the
  // icon's center as a percentage of the new bounds rather than letting the renderer
  // assume.
  barWindow.webContents.send('bar-activated', {
    originX: ((idle.x + idle.width / 2 - active.x) / active.width) * 100,
    originY: ((idle.y + idle.height / 2 - active.y) / active.height) * 100,
    // Starting scale, so the first frame matches the icon's actual footprint.
    scale: idle.width / active.width
  })
  // Give the renderer a moment to switch to the (opacity-0, grow-pending) full palette
  // before the OS window actually grows to full size. Resizing first would leave the
  // still-mounted idle icon — a flex:1 button that fills whatever size the window
  // happens to be — visibly stretched to the new, much bigger bounds for a frame: it
  // flashes and "jumps" to fill the expanding window before React catches up.
  barActivateTimeout = setTimeout(() => {
    barActivateTimeout = null
    if (!barWindow || !barActive) return
    barWindow.setBounds(active)
  }, 30)
}

export function deactivateBar(): void {
  if (!barWindow || !barActive) return
  if (barCollapseTimeout) {
    clearTimeout(barCollapseTimeout)
    barCollapseTimeout = null
  }
  if (barActivateTimeout) {
    clearTimeout(barActivateTimeout)
    barActivateTimeout = null
  }
  barActive = false
  const idle = idleBounds()
  const active = activeBounds()
  barWindow.webContents.send('bar-collapsing', {
    originX: ((idle.x + idle.width / 2 - active.x) / active.width) * 100,
    originY: ((idle.y + idle.height / 2 - active.y) / active.height) * 100,
    scale: idle.width / active.width
  })
  barCollapseTimeout = setTimeout(() => {
    barCollapseTimeout = null
    if (!barWindow) return
    barWindow.setBounds(idleBounds())
    repositionTerminal(barWindow.getBounds())
    barWindow.webContents.send('bar-collapsed')
  }, 160)
}

// Hotkey entry point — activates if idle, deactivates if already active. Returns whether
// it did anything, so main/index.ts's togglePalette() knows whether to fall back to the
// standalone popup (bar disabled) instead.
export function toggleBarActivation(): boolean {
  if (!barWindow || !barWindow.isVisible()) return false
  if (moveModeActive) return true
  if (barActive) {
    deactivateBar()
  } else {
    activateBar()
    barWindow.focus()
    barWindow.webContents.send('palette-shown')
  }
  return true
}

// Entered via the "/move" command: collapses to the idle icon (small and easy to drag
// precisely) and shows a grab handle instead of the icon — see .palette-bar-move in
// styles.css. Exited the same way (toggled again, from the renderer's handle click or
// Escape), at which point the window's current position is persisted as barPosition.
export function toggleMoveMode(target: 'all' | 'bar' | 'term' = 'all'): void {
  if (target === 'term') {
    toggleTermMoveMode()
    return
  }

  if (target === 'all') {
    toggleTermMoveMode()
  }

  if (!barWindow) return
  if (moveModeActive) {
    moveModeActive = false
    const { x, y } = barWindow.getBounds()
    const settings = readSettings()
    writeSettings({ ...settings, barPosition: { x, y } })
    repositionTerminal(barWindow.getBounds())
  } else {
    barActive = false
    moveModeActive = true
    barWindow.setBounds(idleBounds())
    if (!barWindow.isVisible()) barWindow.showInactive()
    barWindow.focus()
  }
  barWindow.webContents.send('move-mode-changed', moveModeActive)
}

// "/view reset" — clears both persisted positions and resets to default dock.
export function resetBarPosition(): void {
  const settings = readSettings()
  writeSettings({ ...settings, barPosition: null, termPosition: null })
  resetTermPosition()
}

export function registerBarIpc(): void {
  ipcMain.on('bar-activate', () => activateBar())
  ipcMain.on('bar-deactivate', () => deactivateBar())
  ipcMain.on('move-mode-toggle', () => toggleMoveMode())
}

// Keeps the idle dock position correct across resolution/display changes — but only while
// idle and not mid-drag; an in-progress "activated" or "move mode" bar shouldn't jump.
export function repositionBarForDisplayChange(): void {
  if (barWindow && barWindow.isVisible() && !barActive && !moveModeActive) {
    barWindow.setBounds(idleBounds())
    repositionTerminal(barWindow.getBounds())
  }
}
