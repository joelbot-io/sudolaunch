import { BrowserWindow, screen, type Rectangle } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { readSettings } from '../config'
import { getDockDisplay } from '../display'
import { DockGeometry } from './DockGeometry'
import { dockManager } from './DockManager'

export function getLiveBarBounds(
  bar?: Rectangle | null,
  fallback?: Rectangle | null
): Rectangle | null {
  if (bar) return bar
  const barWin = dockManager.getBarWindow()
  if (barWin && !barWin.isDestroyed() && barWin.isVisible()) {
    return barWin.getBounds()
  }
  const last = dockManager.getLastBarBounds()
  if (last) return last
  if (fallback) return fallback
  return null
}

export function calculateSatelliteIdleBounds(
  role: 'terminal' | 'notify' | 'shortcuts',
  bar?: Rectangle | null,
  fallback?: Rectangle | null,
  customHorizontalPos?: { x: number; y: number } | null
): Rectangle {
  const settings = readSettings()
  const activeBar = getLiveBarBounds(bar, fallback)
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
      role,
      settings.shelfIcons,
      settings.dockHomePosition,
      settings.dockHomeCustomCoordinates
    )
  }

  if (settings.dockLayout === 'shelf' || role === 'shortcuts') {
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
      role,
      settings.shelfIcons,
      settings.dockHomePosition,
      settings.dockHomeCustomCoordinates
    )
  }

  if (customHorizontalPos) {
    const { workArea: ptArea } = screen.getDisplayNearestPoint({
      x: customHorizontalPos.x,
      y: customHorizontalPos.y
    })
    return DockGeometry.clampRect(
      { x: customHorizontalPos.x, y: customHorizontalPos.y, ...DockGeometry.ICON_SIZE },
      ptArea
    )
  }

  if (activeBar) {
    return DockGeometry.calculateAttachedBounds(
      activeBar,
      role,
      settings.dockLayout ?? 'horizontal',
      display.workArea
    )
  }

  return DockGeometry.calculateDefaultIdleBounds(
    display.workArea,
    role,
    settings.dockLayout ?? 'horizontal',
    settings.dockHomePosition,
    settings.dockHomeCustomCoordinates
  )
}

export function loadDockRenderer(
  win: BrowserWindow,
  mode: 'bar' | 'term' | 'notify' | 'shortcuts'
): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL'])
    url.searchParams.set('mode', mode)
    win.loadURL(url.toString())
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { query: { mode } })
  }
}

export function configureDockOverlayWindow(
  win: BrowserWindow,
  mode: 'bar' | 'term' | 'notify' | 'shortcuts'
): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  // Plain alwaysOnTop:true only reaches the "floating" level, which the taskbar/Start
  // menu still renders above — "screen-saver" is what actually clears that band.
  win.setAlwaysOnTop(true, 'screen-saver')
  loadDockRenderer(win, mode)
}

