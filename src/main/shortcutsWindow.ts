import { BrowserWindow, screen, type Rectangle, type NativeImage } from 'electron'
import { join } from 'path'
import { readSettings, writeSettings } from './config'
import { DockGeometry } from './dock/DockGeometry'
import { dockManager } from './dock/DockManager'
import {
  calculateSatelliteIdleBounds,
  configureDockOverlayWindow
} from './dock/dockWindowHelpers'
import { getDockDisplay } from './display'

let shortcutsWindow: BrowserWindow | null = null
let shortcutsExpanded = false
let lastBarBounds: Rectangle | null = null
let shortcutsReadyResolver: (() => void) | null = null

function idleBounds(bar?: Rectangle | null): Rectangle {
  return calculateSatelliteIdleBounds('shortcuts', bar, lastBarBounds)
}

const MIN_SHORTCUTS_WIDTH = 520
const MIN_SHORTCUTS_HEIGHT = 320

function getConfiguredPanelSize(workArea?: Rectangle): { width: number; height: number } {
  const settings = readSettings()
  const rawW = settings.shortcutsWindowSize?.width ?? DockGeometry.SHORTCUTS_PANEL_SIZE.width
  const rawH = settings.shortcutsWindowSize?.height ?? DockGeometry.SHORTCUTS_PANEL_SIZE.height
  const maxW = workArea ? Math.max(MIN_SHORTCUTS_WIDTH, workArea.width - 24) : 1600
  const maxH = workArea ? Math.max(MIN_SHORTCUTS_HEIGHT, workArea.height - 24) : 1100
  return {
    width: Math.round(Math.max(MIN_SHORTCUTS_WIDTH, Math.min(maxW, rawW))),
    height: Math.round(Math.max(MIN_SHORTCUTS_HEIGHT, Math.min(maxH, rawH)))
  }
}

function expandedBounds(bar?: Rectangle | null): Rectangle {
  const settings = readSettings()
  const icon = idleBounds(bar)
  const { workArea } = screen.getDisplayNearestPoint({ x: icon.x, y: icon.y })
  const panelSize = getConfiguredPanelSize(workArea)
  return DockGeometry.calculateExpandedBounds(
    icon,
    panelSize,
    workArea,
    settings.shortcutsWindowPosition
  )
}

let shortcutsCollapseTimeout: NodeJS.Timeout | null = null
let shortcutsExpandTimeout: NodeJS.Timeout | null = null

export function createShortcutsWindow(icon: NativeImage): BrowserWindow {
  shortcutsWindow = new BrowserWindow({
    ...expandedBounds(),
    show: false,
    frame: false,
    resizable: true,
    minWidth: MIN_SHORTCUTS_WIDTH,
    minHeight: MIN_SHORTCUTS_HEIGHT,
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

  configureDockOverlayWindow(shortcutsWindow, 'shortcuts')

  shortcutsWindow.on('moved', () => {
    if (shortcutsExpanded && shortcutsWindow && !shortcutsCollapseTimeout && !shortcutsExpandTimeout) {
      const { x, y } = shortcutsWindow.getBounds()
      const settings = readSettings()
      if (settings.shortcutsWindowPosition?.x !== x || settings.shortcutsWindowPosition?.y !== y) {
        writeSettings({ ...settings, shortcutsWindowPosition: { x, y } })
      }
    }
  })

  shortcutsWindow.on('resized', () => {
    if (shortcutsExpanded && shortcutsWindow && !shortcutsCollapseTimeout && !shortcutsExpandTimeout) {
      const { x, y, width, height } = shortcutsWindow.getBounds()
      const settings = readSettings()
      if (
        settings.shortcutsWindowSize?.width !== width ||
        settings.shortcutsWindowSize?.height !== height ||
        settings.shortcutsWindowPosition?.x !== x ||
        settings.shortcutsWindowPosition?.y !== y
      ) {
        writeSettings({
          ...settings,
          shortcutsWindowPosition: { x, y },
          shortcutsWindowSize: { width, height }
        })
      }
    }
  })

  shortcutsWindow.on('closed', () => {
    shortcutsWindow = null
  })

  dockManager.registerShortcuts(shortcutsWindow, {
    reposition: repositionShortcuts,
    show: showShortcutsWindow,
    hide: hideShortcutsWindow,
    reset: resetShortcutsPosition
  })

  return shortcutsWindow
}

export function getShortcutsWindow(): BrowserWindow | null {
  return shortcutsWindow
}

export function isShortcutsExpanded(): boolean {
  return shortcutsExpanded
}

export function resolveShortcutsReady(): void {
  if (shortcutsReadyResolver) {
    shortcutsReadyResolver()
    shortcutsReadyResolver = null
  }
}

export function repositionShortcuts(barBounds?: Rectangle): void {
  if (barBounds) lastBarBounds = barBounds
  if (!shortcutsWindow || !shortcutsExpanded) return
  shortcutsWindow.setBounds(expandedBounds(lastBarBounds))
}

export function showShortcutsWindow(): void {
  if (!shortcutsWindow) return
  if (shortcutsExpanded) {
    shortcutsWindow.setBounds(expandedBounds(lastBarBounds))
    if (!shortcutsWindow.isVisible()) {
      shortcutsWindow.showInactive()
    }
    return
  }
  shortcutsWindow.hide()
}

export function hideShortcutsWindow(): void {
  if (!shortcutsWindow) return
  if (shortcutsExpanded) {
    shortcutsExpanded = false
    dockManager.notifyPanelCollapsed()
    dockManager.sendToBar('shortcuts-active', false)
    shortcutsWindow.webContents.send('shortcuts-expanded', false)
  }
  shortcutsWindow.hide()
}

export function blurShortcutsWindow(): void {
  if (!shortcutsWindow || shortcutsWindow.isDestroyed()) return
  shortcutsWindow.blur()
}

export function resetShortcutsPosition(): void {
  const settings = readSettings()
  writeSettings({ ...settings, shortcutsWindowPosition: null, shortcutsWindowSize: null })
  if (shortcutsWindow && shortcutsExpanded) {
    shortcutsWindow.setBounds(expandedBounds(lastBarBounds))
  }
}

export function resizeShortcutsWindow(
  width: number,
  height: number
): { width: number; height: number } {
  const settings = readSettings()
  const currentBounds = shortcutsWindow?.getBounds()
  const display = currentBounds
    ? screen.getDisplayNearestPoint({ x: currentBounds.x, y: currentBounds.y })
    : getDockDisplay(settings.monitor)
  const maxW = Math.max(MIN_SHORTCUTS_WIDTH, display.workArea.width - 24)
  const maxH = Math.max(MIN_SHORTCUTS_HEIGHT, display.workArea.height - 24)
  const nextWidth = Math.round(Math.max(MIN_SHORTCUTS_WIDTH, Math.min(maxW, width)))
  const nextHeight = Math.round(Math.max(MIN_SHORTCUTS_HEIGHT, Math.min(maxH, height)))

  if (shortcutsWindow && !shortcutsWindow.isDestroyed() && currentBounds) {
    shortcutsWindow.setBounds({
      x: currentBounds.x,
      y: currentBounds.y,
      width: nextWidth,
      height: nextHeight
    })
    writeSettings({
      ...settings,
      shortcutsWindowPosition: { x: currentBounds.x, y: currentBounds.y },
      shortcutsWindowSize: { width: nextWidth, height: nextHeight }
    })
  } else {
    writeSettings({
      ...settings,
      shortcutsWindowSize: { width: nextWidth, height: nextHeight }
    })
  }

  return { width: nextWidth, height: nextHeight }
}

export function toggleShortcutsWindow(initialTab?: string): void {
  if (!shortcutsWindow) return
  if (shortcutsCollapseTimeout) {
    clearTimeout(shortcutsCollapseTimeout)
    shortcutsCollapseTimeout = null
  }
  if (shortcutsExpandTimeout) {
    clearTimeout(shortcutsExpandTimeout)
    shortcutsExpandTimeout = null
  }

  // If already expanded and a specific tab is requested, switch to that tab and focus
  if (shortcutsExpanded && initialTab) {
    shortcutsWindow.webContents.send('shortcuts-select-tab', initialTab)
    shortcutsWindow.focus()
    shortcutsWindow.webContents.focus()
    return
  }

  shortcutsExpanded = !shortcutsExpanded

  if (shortcutsExpanded) {
    dockManager.notifyPanelExpanded()
    dockManager.sendToBar('shortcuts-active', true)
    const icon = idleBounds(lastBarBounds)
    const panel = expandedBounds(lastBarBounds)

    shortcutsReadyResolver = null
    shortcutsWindow.setOpacity(0)
    shortcutsWindow.setBounds(panel)
    if (!shortcutsWindow.isVisible()) shortcutsWindow.showInactive()

    const revealExpanded = (): void => {
      if (!shortcutsWindow || shortcutsWindow.isDestroyed() || !shortcutsExpanded) return
      shortcutsWindow.setOpacity(1)
      shortcutsWindow.focus()
      shortcutsWindow.webContents.focus()
    }

    let fallbackTimer: NodeJS.Timeout | null = null
    shortcutsReadyResolver = () => {
      if (fallbackTimer) {
        clearTimeout(fallbackTimer)
        fallbackTimer = null
      }
      revealExpanded()
    }
    fallbackTimer = setTimeout(() => {
      if (shortcutsReadyResolver) {
        shortcutsReadyResolver()
        shortcutsReadyResolver = null
      }
    }, 250)

    if (initialTab) {
      shortcutsWindow.webContents.send('shortcuts-select-tab', initialTab)
    }
    shortcutsWindow.webContents.send('shortcuts-expanded', true)
    shortcutsWindow.webContents.send(
      'shortcuts-grow-origin',
      DockGeometry.calculateGrowOrigin(icon, panel)
    )
  } else {
    dockManager.notifyPanelCollapsed()
    dockManager.sendToBar('shortcuts-active', false)
    const icon = idleBounds(lastBarBounds)
    const panel = expandedBounds(lastBarBounds)
    shortcutsWindow.webContents.send(
      'shortcuts-collapsing',
      DockGeometry.calculateGrowOrigin(icon, panel)
    )
    shortcutsCollapseTimeout = setTimeout(() => {
      shortcutsCollapseTimeout = null
      if (!shortcutsWindow) return
      shortcutsWindow.hide()
      shortcutsWindow.webContents.send('shortcuts-expanded', false)
    }, 160)
  }
}

export function openShortcutsWindow(initialTab?: string): void {
  if (!shortcutsWindow) return
  if (!shortcutsExpanded) {
    toggleShortcutsWindow(initialTab)
  } else {
    if (initialTab) {
      shortcutsWindow.webContents.send('shortcuts-select-tab', initialTab)
    }
    shortcutsWindow.focus()
    shortcutsWindow.webContents.focus()
  }
}

