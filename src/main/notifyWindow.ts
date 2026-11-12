import { BrowserWindow, ipcMain, screen, type Rectangle, type NativeImage } from 'electron'
import { join } from 'path'
import {
  getNotifications,
  clearNotifications,
  dismissNotification,
  markNotificationsRead
} from './notifications'
import { readSettings } from './config'
import { DockGeometry } from './dock/DockGeometry'
import { dockManager } from './dock/DockManager'
import {
  calculateSatelliteIdleBounds,
  configureDockOverlayWindow,
  getLiveBarBounds
} from './dock/dockWindowHelpers'
import { getDockDisplay } from './display'

let notifyWindow: BrowserWindow | null = null
let notifyExpanded = false
let lastBarBounds: Rectangle | null = null

function idleBounds(bar?: Rectangle | null): Rectangle {
  return calculateSatelliteIdleBounds('notify', bar, lastBarBounds)
}

function expandedBounds(bar?: Rectangle | null): Rectangle {
  const settings = readSettings()
  const activeBar = getLiveBarBounds(bar, lastBarBounds)
  const display = activeBar
    ? screen.getDisplayNearestPoint({
        x: activeBar.x + activeBar.width / 2,
        y: activeBar.y + activeBar.height / 2
      })
    : getDockDisplay(settings.monitor)

  return DockGeometry.calculateNotificationPanelBounds(
    display.workArea,
    activeBar,
    settings.dockLayout ?? 'shelf',
    settings.shelfIcons,
    settings.dockHomePosition,
    settings.dockHomeCustomCoordinates
  )
}

export function createNotificationWindow(icon: NativeImage): BrowserWindow {
  notifyWindow = new BrowserWindow({
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

  configureDockOverlayWindow(notifyWindow, 'notify')

  notifyWindow.on('closed', () => {
    notifyWindow = null
  })

  dockManager.registerNotify(notifyWindow, {
    reposition: repositionNotification,
    show: showNotificationWindow,
    hide: hideNotificationWindow,
    reset: resetNotificationPosition
  })

  return notifyWindow
}

export function resetNotificationPosition(): void {
  if (notifyWindow && !notifyExpanded) {
    notifyWindow.setBounds(idleBounds(lastBarBounds))
  }
}

let notifyReadyResolver: (() => void) | null = null

export function registerNotificationIpc(): void {
  ipcMain.on('notify-toggle', () => toggleNotificationWindow())
  ipcMain.on('notify-open', () => openNotificationWindow())
  ipcMain.on('notify-ready', () => {
    if (notifyReadyResolver) {
      notifyReadyResolver()
      notifyReadyResolver = null
    }
  })
  ipcMain.handle('notify-get-all', () => getNotifications())
  ipcMain.handle('notify-clear-all', () => clearNotifications())
  ipcMain.handle('notify-dismiss', (_event, id: string) => dismissNotification(id))
  ipcMain.handle('notify-mark-read', () => markNotificationsRead())
}

export function repositionNotification(barBounds?: Rectangle): void {
  if (barBounds) lastBarBounds = barBounds
  if (!notifyWindow) return
  notifyWindow.setBounds(notifyExpanded ? expandedBounds(lastBarBounds) : idleBounds(lastBarBounds))
}

export function showNotificationWindow(): void {
  if (!notifyWindow) return
  if (notifyExpanded) {
    notifyWindow.setBounds(expandedBounds(lastBarBounds))
    if (!notifyWindow.isVisible()) {
      notifyWindow.showInactive()
    }
    return
  }
  const settings = readSettings()
  if (settings.dockLayout === 'shelf' || settings.dockLayout === 'circle') {
    notifyExpanded = false
    notifyWindow.webContents.send('notify-expanded', false)
    notifyWindow.hide()
    return
  }
  notifyExpanded = false
  notifyWindow.setBounds(idleBounds(lastBarBounds))
  notifyWindow.webContents.send('notify-expanded', false)
  notifyWindow.showInactive()
}

export function hideNotificationWindow(): void {
  if (!notifyWindow) return
  if (notifyExpanded) {
    notifyExpanded = false
    notifyWindow.webContents.send('notify-expanded', false)
  }
  notifyWindow.hide()
}

let notifyCollapseTimeout: NodeJS.Timeout | null = null
let notifyExpandTimeout: NodeJS.Timeout | null = null

export function toggleNotificationWindow(): void {
  if (!notifyWindow) return
  if (notifyCollapseTimeout) {
    clearTimeout(notifyCollapseTimeout)
    notifyCollapseTimeout = null
  }
  if (notifyExpandTimeout) {
    clearTimeout(notifyExpandTimeout)
    notifyExpandTimeout = null
  }

  notifyExpanded = !notifyExpanded
  const settings = readSettings()

  if (notifyExpanded) {
    dockManager.notifyPanelExpanded()
    const icon = idleBounds(lastBarBounds)
    const panel = expandedBounds(lastBarBounds)

    if (settings.dockLayout === 'shelf' || settings.dockLayout === 'circle') {
      // Same opacity + always-mapped handshake as the shelf palette window (see
      // revealPaletteWindow in main/index.ts): calling show() here directly used to
      // reveal whatever the renderer last painted (its collapsed/closed state) for a
      // frame before the grow-in animation and content caught up, which looked like a
      // double flash. Dropping opacity, sending the state first, and only flipping
      // opacity back to 1 once the renderer acks avoids that.
      notifyReadyResolver = null
      notifyWindow.setOpacity(0)
      notifyWindow.setBounds(panel)
      if (!notifyWindow.isVisible()) notifyWindow.showInactive()
      notifyWindow.webContents.send('notify-expanded', true)
      notifyWindow.webContents.send('notify-grow-origin', DockGeometry.calculateGrowOrigin(icon, panel))
      markNotificationsRead()

      const doShow = (): void => {
        if (!notifyWindow || notifyWindow.isDestroyed()) return
        notifyWindow.setIgnoreMouseEvents(false)
        notifyWindow.setOpacity(1)
        notifyWindow.focus()
      }
      let timer: NodeJS.Timeout | null = setTimeout(() => {
        timer = null
        notifyReadyResolver = null
        doShow()
      }, 300)
      notifyReadyResolver = () => {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
        doShow()
      }
    } else {
      if (!notifyWindow.isVisible()) {
        notifyWindow.setBounds(icon)
        notifyWindow.showInactive()
      }
      notifyWindow.webContents.send('notify-expanded', true)
      notifyWindow.webContents.send('notify-grow-origin', DockGeometry.calculateGrowOrigin(icon, panel))
      notifyExpandTimeout = setTimeout(() => {
        notifyExpandTimeout = null
        if (!notifyWindow || !notifyExpanded) return
        notifyWindow.setBounds(panel)
        notifyWindow.focus()
        markNotificationsRead()
      }, 30)
    }
  } else {
    // Cancel any in-flight OPEN handshake — a rapid double-click can toggle open then
    // closed again before the open's notify-ready ack (or its 300ms fallback) has fired.
    // Without this, that stale ack still ran doShow() (opacity -> 1, focus) moments after
    // this collapse had already started, leaving the window stuck open with the icon
    // click only ever replaying the open animation from then on — the collapse toggle
    // itself was actually firing and flipping notifyExpanded, it just kept losing the
    // opacity race to the leftover open handshake.
    notifyReadyResolver = null
    dockManager.notifyPanelCollapsed()
    const icon = idleBounds(lastBarBounds)
    const panel = expandedBounds(lastBarBounds)
    notifyWindow.webContents.send('notify-collapsing', DockGeometry.calculateGrowOrigin(icon, panel))
    notifyCollapseTimeout = setTimeout(() => {
      notifyCollapseTimeout = null
      if (!notifyWindow) return
      if (settings.dockLayout === 'shelf' || settings.dockLayout === 'circle') {
        notifyWindow.setOpacity(0)
        notifyWindow.setIgnoreMouseEvents(true, { forward: true })
      } else {
        notifyWindow.setBounds(idleBounds(lastBarBounds))
      }
      notifyWindow.webContents.send('notify-expanded', false)
    }, 160)
  }
}

export function openNotificationWindow(): void {
  if (!notifyWindow) return
  if (!notifyExpanded) {
    toggleNotificationWindow()
  } else {
    notifyWindow.focus()
  }
}

