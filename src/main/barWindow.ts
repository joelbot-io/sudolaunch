import { BrowserWindow, ipcMain, screen, type Rectangle, type NativeImage } from 'electron'
import { join } from 'path'
import { readSettings, writeSettings } from './config'
import { toggleTermMoveMode } from './terminalWindow'
import { DockGeometry } from './dock/DockGeometry'
import { dockManager } from './dock/DockManager'
import { configureDockOverlayWindow } from './dock/dockWindowHelpers'
import { getDockDisplay } from './display'

let barWindow: BrowserWindow | null = null
// Whether the bar is currently pulled out to its "active" (full palette) bounds, as
// opposed to its docked idle icon. Tracked here (not inferred from window size) so a
// display-metrics-changed reflow knows which bounds to snap back to.
let barActive = false
// While true, the bar shows a drag handle instead of the icon/palette — see toggleMoveMode.
let moveModeActive = false

function defaultIdleBounds(): Rectangle {
  const settings = readSettings()
  const { workArea } = getDockDisplay(settings.monitor)
  return DockGeometry.calculateDefaultIdleBounds(workArea, 'bar', settings.dockLayout ?? 'shelf')
}

// Keeps a dragged-to position from ending up (partially) off-screen — e.g. after a
// resolution change or unplugging the monitor it was dragged to.
function clampToWorkArea(bounds: Rectangle): Rectangle {
  const { workArea } = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y })
  return DockGeometry.clampRect(bounds, workArea)
}

function idleBounds(): Rectangle {
  const settings = readSettings()
  const { workArea } = getDockDisplay(settings.monitor)
  if (settings.dockLayout === 'shelf') {
    const slotCount = settings.shelfIcons?.length ?? 7
    return DockGeometry.calculateShelfBarBounds(
      workArea,
      slotCount,
      settings.dockHomePosition,
      settings.dockHomeCustomCoordinates
    )
  }
  if (settings.dockLayout === 'circle') {
    return DockGeometry.calculateCircleOrbitBounds(
      workArea,
      settings.dockHomePosition,
      settings.dockHomeCustomCoordinates
    )
  }
  if (!settings.barPosition) return defaultIdleBounds()
  return clampToWorkArea({ x: settings.barPosition.x, y: settings.barPosition.y, ...DockGeometry.ICON_SIZE })
}

export function resetBarToIdle(): void {
  if (barCollapseTimeout) {
    clearTimeout(barCollapseTimeout)
    barCollapseTimeout = null
  }
  if (barActivateTimeout) {
    clearTimeout(barActivateTimeout)
    barActivateTimeout = null
  }
  const wasActive = barActive
  barActive = false
  if (!barWindow || barWindow.isDestroyed()) return
  const bounds = idleBounds()
  barWindow.setBounds(bounds)
  dockManager.repositionAttached(bounds)
  if (wasActive) {
    barWindow.webContents.send('bar-collapsed')
  }
}

export function repositionBarForShelfIcons(): void {
  if (!barWindow || barWindow.isDestroyed()) return
  const settings = readSettings()
  if (settings.dockLayout === 'shelf' || settings.dockLayout === 'circle') {
    if (barActive) {
      resetBarToIdle()
      return
    }
    const bounds = idleBounds()
    barWindow.setBounds(bounds)
    dockManager.repositionAttached(bounds)
  }
}

function barIconAnchor(): Rectangle {
  const settings = readSettings()
  const liveBar =
    barWindow && !barWindow.isDestroyed() && barWindow.isVisible()
      ? barWindow.getBounds()
      : dockManager.getLastBarBounds()

  if (settings.dockLayout === 'shelf') {
    if (liveBar) {
      return DockGeometry.calculateShelfIconBounds(liveBar, 'bar', settings.shelfIcons)
    }
    const { workArea } = getDockDisplay(settings.monitor)
    return DockGeometry.calculateShelfIconBounds(workArea, 'bar', settings.shelfIcons)
  }
  if (settings.dockLayout === 'circle') {
    if (liveBar) return liveBar
    const { workArea } = getDockDisplay(settings.monitor)
    return DockGeometry.calculateCircleOrbitBounds(
      workArea,
      settings.dockHomePosition,
      settings.dockHomeCustomCoordinates
    )
  }
  if (liveBar) {
    return liveBar
  }
  return idleBounds()
}

// The palette opens hovering above the docked icon (or below if docked near the top of the screen),
// horizontally centered over the icon.
function activeBounds(): Rectangle {
  const anchor = barIconAnchor()
  const { workArea } = screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y })
  return DockGeometry.calculateExpandedBounds(anchor, DockGeometry.BAR_ACTIVE_SIZE, workArea)
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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  configureDockOverlayWindow(barWindow, 'bar')

  dockManager.registerBar(barWindow, {
    cancelAnimations: () => {
      if (barCollapseTimeout) {
        clearTimeout(barCollapseTimeout)
        barCollapseTimeout = null
      }
      if (barActivateTimeout) {
        clearTimeout(barActivateTimeout)
        barActivateTimeout = null
      }
      barActive = false
    },
    reset: () => {
      resetBarToIdle()
    }
  })

  barWindow.on('move', () => {
    if (barWindow) {
      const bounds = barWindow.getBounds()
      dockManager.repositionAttached(bounds)
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

// Drops a message into the bar window's webContents if mounted. Used to drive the
// activate/deactivate lifecycle without having to export the BrowserWindow reference
// itself.
export function sendToBar(channel: string, ...args: unknown[]): void {
  if (barWindow && !barWindow.isDestroyed()) {
    barWindow.webContents.send(channel, ...args)
  }
}

// Shows/hides the bar entirely — driven only by the "barEnabled" setting, which is itself
// only ever flipped by the "/view" command, by design. The terminal and notification windows
// have no independent visibility of their own — they're anchored to the bar, so they show/hide
// (and collapse) right alongside it.
export function setBarVisible(visible: boolean): void {
  if (!barWindow) return
  if (visible) {
    barActive = false
    barWindow.setBounds(idleBounds())
    if (!barWindow.isVisible()) {
      barWindow.showInactive()
    }
    dockManager.showAll()
    dockManager.repositionAttached(barWindow.getBounds())
  } else {
    dockManager.hideAll()
  }
}

let barCollapseTimeout: NodeJS.Timeout | null = null
let barActivateTimeout: NodeJS.Timeout | null = null

// Pulls the bar down from its docked idle strip to full palette size/position. Main
// calls this from the hotkey handler, the tray icon, or the renderer itself on click.
export function activateBar(): void {
  if (!barWindow) return
  if (barCollapseTimeout) {
    clearTimeout(barCollapseTimeout)
    barCollapseTimeout = null
  }
  if (barActivateTimeout) {
    clearTimeout(barActivateTimeout)
    barActivateTimeout = null
  }
  barActive = true
  dockManager.notifyPanelExpanded()
  const anchor = barIconAnchor()
  const active = activeBounds()
  // The satellite icons dock next to the bar's idle position, not wherever the bar
  // window currently is — passing the just-set active bounds here would re-anchor them
  // to the expanded palette.
  dockManager.repositionAttached(idleBounds())

  barWindow.webContents.send('bar-activated', DockGeometry.calculateGrowOrigin(anchor, active))
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
  dockManager.notifyPanelCollapsed()
  const anchor = barIconAnchor()
  const active = activeBounds()
  barWindow.webContents.send('bar-collapsing', DockGeometry.calculateGrowOrigin(anchor, active))
  barCollapseTimeout = setTimeout(() => {
    barCollapseTimeout = null
    if (!barWindow) return
    barWindow.setBounds(idleBounds())
    dockManager.repositionAttached(barWindow.getBounds())
    barWindow.webContents.send('bar-collapsed')
  }, 160)
}

// Hotkey entry point — activates if idle, deactivates if already active. Returns whether
// it did anything, so main/index.ts's togglePalette() knows whether to fall back to the
// standalone popup (bar disabled) instead.
export function toggleBarActivation(): boolean {
  if (!barWindow || !barWindow.isVisible()) return false
  if (moveModeActive) return true
  const settings = readSettings()
  if (settings.dockLayout === 'shelf' || settings.dockLayout === 'circle') {
    return false
  }
  if (barActive) {
    deactivateBar()
  } else {
    activateBar()
    barWindow.focus()
    barWindow.webContents.focus()
    barWindow.webContents.send('palette-shown')
    barWindow.webContents.send('palette-focused')
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
    const bounds = barWindow.getBounds()
    dockManager.repositionAttached(bounds)
  } else {
    barActive = false
    moveModeActive = true
    barWindow.setBounds(idleBounds())
    if (!barWindow.isVisible()) barWindow.showInactive()
    barWindow.focus()
  }
  barWindow.webContents.send('move-mode-changed', moveModeActive)
}

// "/view reset" — clears persisted positions and resets to default dock.
export function resetBarPosition(): void {
  dockManager.resetPositions()
}

export function registerBarIpc(): void {
  ipcMain.on('bar-activate', (_event, mode?: string) => {
    const settings = readSettings()
    if (settings.dockLayout === 'shelf' || settings.dockLayout === 'circle') {
      dockManager.toggleShelfPalette(mode)
      return
    }
    activateBar()
    if (barWindow) {
      barWindow.focus()
      barWindow.webContents.focus()
      barWindow.webContents.send('palette-focused')
    }
  })
  ipcMain.on('bar-deactivate', () => {
    deactivateBar()
  })
  ipcMain.on('move-mode-toggle', () => toggleMoveMode())
}

// Keeps the idle dock position correct across resolution/display changes — but only while
// idle and not mid-drag; an in-progress "activated" or "move mode" bar shouldn't jump.
export function repositionBarForDisplayChange(): void {
  if (barWindow && barWindow.isVisible() && !barActive && !moveModeActive) {
    barWindow.setBounds(idleBounds())
    dockManager.repositionAttached(barWindow.getBounds())
  }
}

// Repositions the 3-button dock icon cluster to hover in a circle directly around the mouse cursor
// (called upon global Ctrl+Right Click) and persists the position.
export function summonBarTo(cursorX: number, cursorY: number): void {
  dockManager.summonTo(cursorX, cursorY)
}


