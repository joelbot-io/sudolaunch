import { BrowserWindow, screen, type Rectangle } from 'electron'
import { readSettings, writeSettings } from '../config'
import { DEFAULT_SHELF_ICONS } from '../../shared/types'
import { DockGeometry } from './DockGeometry'
import { getDockDisplay } from '../display'

export interface TerminalDockCallbacks {
  reposition: (barBounds?: Rectangle) => void
  show: () => void
  hide: () => void
  reset: () => void
}

export interface NotificationDockCallbacks {
  reposition: (barBounds?: Rectangle) => void
  show: () => void
  hide: () => void
  reset: () => void
}

export interface ShortcutsDockCallbacks {
  reposition: (barBounds?: Rectangle) => void
  show: () => void
  hide: () => void
  reset: () => void
}

export interface BarDockCallbacks {
  cancelAnimations: () => void
  reset: () => void
}

export interface SummonTheme {
  name: string
  color: string
  glow: string
}

export const SUMMON_THEMES: SummonTheme[] = [
  { name: 'Electric Cyan', color: '#00f0ff', glow: 'rgba(0, 240, 255, 0.85)' },
  { name: 'Neon Purple', color: '#bf5af2', glow: 'rgba(191, 90, 242, 0.85)' },
  { name: 'Hot Pink', color: '#ff2d55', glow: 'rgba(255, 45, 85, 0.85)' },
  { name: 'Emerald Green', color: '#30d158', glow: 'rgba(48, 209, 88, 0.85)' },
  { name: 'Radiant Amber', color: '#ffd60a', glow: 'rgba(255, 214, 10, 0.85)' },
  { name: 'Coral Flame', color: '#ff6b4a', glow: 'rgba(255, 107, 74, 0.85)' },
  { name: 'Laser Violet', color: '#a855f7', glow: 'rgba(168, 85, 247, 0.85)' },
  { name: 'Aqua Cyan', color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.85)' },
  { name: 'Crimson Rose', color: '#f43f5e', glow: 'rgba(244, 63, 94, 0.85)' },
  { name: 'Sudo Blue', color: '#5aa0ff', glow: 'rgba(90, 160, 255, 0.85)' }
]

/**
 * Central orchestrator class that coordinates the 3-window dock cluster:
 * 1. Command Palette / Bar Window (anchor)
 * 2. PowerShell Terminal Window (satellite)
 * 3. Notification Center Window (satellite)
 *
 * Eliminates circular cross-imports and unifies summoning, layout reflows, and position resets.
 */
export class DockManager {
  private static instance: DockManager | null = null

  private barWindow: BrowserWindow | null = null
  private terminalWindow: BrowserWindow | null = null
  private notifyWindow: BrowserWindow | null = null
  private shortcutsWindow: BrowserWindow | null = null

  private barCallbacks: BarDockCallbacks | null = null
  private terminalCallbacks: TerminalDockCallbacks | null = null
  private notifyCallbacks: NotificationDockCallbacks | null = null
  private shortcutsCallbacks: ShortcutsDockCallbacks | null = null

  private lastBarBounds: Rectangle | null = null
  private autoReturnTimer: NodeJS.Timeout | null = null
  private isSummonedAway = false
  private activePanelsCount = 0

  private constructor() {}

  static getInstance(): DockManager {
    if (!this.instance) {
      this.instance = new DockManager()
    }
    return this.instance
  }

  getIsSummonedAway(): boolean {
    return this.isSummonedAway
  }

  // --- Registration ---

  registerBar(win: BrowserWindow, callbacks: BarDockCallbacks): void {
    this.barWindow = win
    this.barCallbacks = callbacks
    win.on('closed', () => {
      this.barWindow = null
      this.barCallbacks = null
    })
  }

  registerTerminal(win: BrowserWindow, callbacks: TerminalDockCallbacks): void {
    this.terminalWindow = win
    this.terminalCallbacks = callbacks
    win.on('closed', () => {
      this.terminalWindow = null
      this.terminalCallbacks = null
    })
  }

  registerNotify(win: BrowserWindow, callbacks: NotificationDockCallbacks): void {
    this.notifyWindow = win
    this.notifyCallbacks = callbacks
    win.on('closed', () => {
      this.notifyWindow = null
      this.notifyCallbacks = null
    })
  }

  registerShortcuts(win: BrowserWindow, callbacks: ShortcutsDockCallbacks): void {
    this.shortcutsWindow = win
    this.shortcutsCallbacks = callbacks
    win.on('closed', () => {
      this.shortcutsWindow = null
      this.shortcutsCallbacks = null
    })
  }

  private shelfPaletteToggle: ((mode?: string) => void) | null = null

  registerShelfPaletteToggle(fn: (mode?: string) => void): void {
    this.shelfPaletteToggle = fn
  }

  toggleShelfPalette(mode?: string): void {
    this.shelfPaletteToggle?.(mode)
  }

  // --- Auto-Return Home Management ---

  scheduleAutoReturn(): void {
    if (this.autoReturnTimer) {
      clearTimeout(this.autoReturnTimer)
      this.autoReturnTimer = null
    }
    const settings = readSettings()
    if (settings.autoReturnHome === false) return

    this.isSummonedAway = true
    const delaySec = settings.autoReturnDelaySec ?? 8
    const delayMs = Math.max(1, delaySec) * 1000

    this.autoReturnTimer = setTimeout(() => {
      this.autoReturnTimer = null
      if (this.activePanelsCount === 0) {
        this.returnHome()
      }
    }, delayMs)
  }

  cancelAutoReturn(): void {
    if (this.autoReturnTimer) {
      clearTimeout(this.autoReturnTimer)
      this.autoReturnTimer = null
    }
  }

  notifyPanelExpanded(): void {
    this.activePanelsCount++
    this.cancelAutoReturn()
  }

  notifyPanelCollapsed(): void {
    this.activePanelsCount = Math.max(0, this.activePanelsCount - 1)
    if (this.activePanelsCount === 0 && this.isSummonedAway) {
      const settings = readSettings()
      if (settings.autoReturnHome !== false) {
        this.scheduleAutoReturn()
      }
    }
  }

  returnHome(): void {
    this.cancelAutoReturn()
    this.isSummonedAway = false
    this.broadcast('dock-home-state', true)
    if (!this.barWindow) return

    const settings = readSettings()
    const targetDisplay = getDockDisplay(settings.monitor)
    const slotCount = settings.shelfIcons?.length ?? DEFAULT_SHELF_ICONS.length
    const homeBounds = DockGeometry.calculateHomeBounds(
      targetDisplay.workArea,
      'bar',
      settings.dockLayout ?? 'shelf',
      slotCount,
      settings.shelfIcons,
      settings.dockHomePosition ?? 'middle',
      settings.dockHomeCustomCoordinates
    )

    // Fade windows out before teleporting, then fade back in.
    const FADE_MS = 260
    this.barWindow.webContents.send('dock-fade', 'out')
    if (settings.dockLayout !== 'shelf') {
      this.terminalWindow?.webContents.send('dock-fade', 'out')
      this.notifyWindow?.webContents.send('dock-fade', 'out')
    }

    setTimeout(() => {
      if (!this.barWindow) return
      this.lastBarBounds = homeBounds
      this.barWindow.setBounds(homeBounds)
      this.terminalCallbacks?.reposition(homeBounds)
      this.notifyCallbacks?.reposition(homeBounds)

      // Brief pause so the OS has moved the windows before we fade back in.
      setTimeout(() => {
        this.barWindow?.webContents.send('dock-fade', 'in')
        if (settings.dockLayout !== 'shelf') {
          this.terminalWindow?.webContents.send('dock-fade', 'in')
          this.notifyWindow?.webContents.send('dock-fade', 'in')
        }
      }, 40)
    }, FADE_MS)
  }

  // --- Getters ---

  getBarWindow(): BrowserWindow | null {
    return this.barWindow
  }

  getLastBarBounds(): Rectangle | null {
    return this.lastBarBounds
  }

  // --- Geometry & Window Lifecycle ---

  repositionAttached(barBounds?: Rectangle): void {
    this.repositionAll(barBounds)
  }

  repositionAll(barBounds?: Rectangle): void {
    if (barBounds) this.lastBarBounds = barBounds
    this.terminalCallbacks?.reposition(this.lastBarBounds ?? undefined)
    this.notifyCallbacks?.reposition(this.lastBarBounds ?? undefined)
    this.shortcutsCallbacks?.reposition(this.lastBarBounds ?? undefined)
  }

  /**
   * Summons the dock cluster directly to the given cursor coordinates.
   * In shelf mode: centers the dynamic pill tray at cursor.
   * In circle mode: arranges the 3 windows in an equilateral radial orbit.
   */
  summonTo(cursorX: number, cursorY: number): void {
    if (!this.barWindow) return

    this.isSummonedAway = true
    this.broadcast('dock-home-state', false)

    // Cancel any in-flight expand/collapse transitions on the bar
    this.barCallbacks?.cancelAnimations()

    const settings = readSettings()
    const { workArea } = screen.getDisplayNearestPoint({ x: cursorX, y: cursorY })
    const theme = SUMMON_THEMES[Math.floor(Math.random() * SUMMON_THEMES.length)]

    if (settings.dockLayout === 'shelf') {
      const slotCount = settings.shelfIcons?.length ?? DEFAULT_SHELF_ICONS.length
      const shelfWidth = DockGeometry.calculateShelfBarWidth(slotCount)
      const shelfHeight = DockGeometry.SHELF_WINDOW_HEIGHT
      const targetRect = DockGeometry.clampRect(
        {
          x: Math.round(cursorX - shelfWidth / 2),
          y: Math.round(cursorY - 56),
          width: shelfWidth,
          height: shelfHeight
        },
        workArea
      )

      this.lastBarBounds = targetRect
      this.barWindow.setBounds(targetRect)
      this.terminalCallbacks?.reposition(targetRect)
      this.notifyCallbacks?.reposition(targetRect)
      if (!this.barWindow.isVisible()) {
        this.barWindow.showInactive()
      }

      // In shelf mode, satellite windows stay hidden
      this.terminalCallbacks?.hide()
      this.notifyCallbacks?.hide()

      this.barWindow.webContents.send('dock-summoned', {
        x: targetRect.x,
        y: targetRect.y,
        color: theme.color,
        glow: theme.glow
      })

      this.scheduleAutoReturn()
      return
    }

    if (settings.dockLayout === 'circle') {
      const size = DockGeometry.CIRCLE_ORBIT_SIZE
      const targetRect = DockGeometry.clampRect(
        {
          x: Math.round(cursorX - size.width / 2),
          y: Math.round(cursorY - size.height / 2),
          width: size.width,
          height: size.height
        },
        workArea
      )

      this.lastBarBounds = targetRect
      this.barWindow.setBounds(targetRect)
      this.terminalCallbacks?.reposition(targetRect)
      this.notifyCallbacks?.reposition(targetRect)
      if (!this.barWindow.isVisible()) {
        this.barWindow.showInactive()
      }

      // In circle mode, satellite windows stay hidden (satellites are in the unified orbit wheel)
      this.terminalCallbacks?.hide()
      this.notifyCallbacks?.hide()

      this.barWindow.webContents.send('dock-summoned', {
        x: targetRect.x,
        y: targetRect.y,
        circle: true,
        color: theme.color,
        glow: theme.glow
      })

      this.scheduleAutoReturn()
      return
    }

    // Horizontal dock layout
    const orbit = DockGeometry.calculateCircleOrbit(cursorX, cursorY, workArea)

    this.lastBarBounds = orbit.bar
    this.barWindow.setBounds(orbit.bar)

    if (!this.barWindow.isVisible()) {
      this.barWindow.showInactive()
    }

    // Reposition satellites and show them inactive
    this.terminalCallbacks?.reposition(orbit.bar)
    this.notifyCallbacks?.reposition(orbit.bar)

    this.terminalCallbacks?.show()
    this.notifyCallbacks?.show()

    // Send synchronized summon feedback event with randomized theme to all 3 windows
    this.barWindow.webContents.send('dock-summoned', {
      x: orbit.bar.x,
      y: orbit.bar.y,
      circle: true,
      color: theme.color,
      glow: theme.glow
    })
    this.terminalWindow?.webContents.send('dock-summoned', {
      x: orbit.terminal.x,
      y: orbit.terminal.y,
      color: theme.color,
      glow: theme.glow
    })
    this.notifyWindow?.webContents.send('dock-summoned', {
      x: orbit.notify.x,
      y: orbit.notify.y,
      color: theme.color,
      glow: theme.glow
    })

    this.scheduleAutoReturn()
  }

  /**
   * Switches the dock layout between 'shelf', 'circle' (radial orbit), and 'horizontal' (linear dock).
   */
  setLayout(layout: 'circle' | 'horizontal' | 'shelf', persist = true): void {
    if (persist) {
      const settings = readSettings()
      writeSettings({ ...settings, dockLayout: layout })
    }
    this.barCallbacks?.cancelAnimations()
    this.resetPositions()
    this.broadcast('dock-layout-changed', layout)
  }

  /**
   * Resets all dock windows back to their default resting coordinates at bottom-center of the primary display.
   */
  resetPositions(): void {
    const settings = readSettings()
    writeSettings({
      ...settings,
      barPosition: null,
      termPosition: null,
      termWindowPosition: null,
      shortcutsWindowPosition: null
    })

    this.isSummonedAway = false
    this.broadcast('dock-home-state', true)

    this.barCallbacks?.reset()
    this.terminalCallbacks?.reset()
    this.notifyCallbacks?.reset()
    this.shortcutsCallbacks?.reset()
  }

  /**
   * Synchronously shows all dock windows in inactive mode (does not steal OS focus).
   */
  showAll(): void {
    if (this.barWindow && !this.barWindow.isVisible()) {
      this.barWindow.showInactive()
    }
    this.terminalCallbacks?.show()
    this.notifyCallbacks?.show()
    this.shortcutsCallbacks?.show()
  }

  /**
   * Synchronously hides all dock windows.
   */
  hideAll(): void {
    if (this.barWindow && this.barWindow.isVisible()) {
      this.barWindow.hide()
    }
    this.terminalCallbacks?.hide()
    this.notifyCallbacks?.hide()
    this.shortcutsCallbacks?.hide()
  }

  sendToBar(channel: string, ...args: unknown[]): void {
    if (this.barWindow && !this.barWindow.isDestroyed()) {
      this.barWindow.webContents.send(channel, ...args)
    }
  }

  broadcast(channel: string, ...args: unknown[]): void {
    if (this.barWindow && !this.barWindow.isDestroyed()) {
      this.barWindow.webContents.send(channel, ...args)
    }
    if (this.terminalWindow && !this.terminalWindow.isDestroyed()) {
      this.terminalWindow.webContents.send(channel, ...args)
    }
    if (this.notifyWindow && !this.notifyWindow.isDestroyed()) {
      this.notifyWindow.webContents.send(channel, ...args)
    }
    if (this.shortcutsWindow && !this.shortcutsWindow.isDestroyed()) {
      this.shortcutsWindow.webContents.send(channel, ...args)
    }
  }
}

export const dockManager = DockManager.getInstance()
