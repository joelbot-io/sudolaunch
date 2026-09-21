import type { Rectangle } from 'electron'
import { DEFAULT_SHELF_ICONS, type GrowOrigin, type ShelfModuleId } from '../../shared/types'

/**
 * Pure, stateless geometric calculations and dimension constants for the SudoLaunch dock.
 * Consolidates all screen-boundary clamping, radial orbit calculations, attached icon placement,
 * and transform-origin percentages.
 */
export class DockGeometry {
  static readonly ICON_SIZE = { width: 50, height: 50 } as const
  static readonly BUTTON_SIZE = { width: 40, height: 40 } as const
  static readonly BAR_ACTIVE_SIZE = { width: 640, height: 420 } as const
  static readonly TERMINAL_PANEL_SIZE = { width: 800, height: 360 } as const
  static readonly NOTIFICATION_PANEL_SIZE = { width: 560, height: 400 } as const

  static readonly GAP = 8 as const
  static readonly IDLE_BOTTOM_MARGIN = 12 as const
  static readonly SCROLLBAR_MARGIN = 32 as const
  static readonly ORBIT_RADIUS = 36 as const

  // Shelf-dock constants
  /** Total OS window width for the default shelf BrowserWindow (7 icons + padding) */
  static readonly SHELF_WINDOW_WIDTH = 356 as const
  /** Height of the visible pill portion of the shelf */
  static readonly SHELF_PILL_HEIGHT = 48 as const
  /** Transparent headroom above the pill so CSS translateY slide-up is never clipped */
  static readonly SHELF_HEADROOM = 32 as const
  /** Gap between the bottom of the shelf pill and the top of the Windows taskbar */
  static readonly SHELF_BOTTOM_MARGIN = 8 as const
  /** Full OS window height = headroom + pill + bottom margin */
  static readonly SHELF_WINDOW_HEIGHT =
    DockGeometry.SHELF_HEADROOM + DockGeometry.SHELF_PILL_HEIGHT + DockGeometry.SHELF_BOTTOM_MARGIN

  /**
   * Clamps a rectangle completely inside the given display work area so no edge clips off-screen.
   */
  static clampRect(rect: Rectangle, workArea: Rectangle): Rectangle {
    const maxX = Math.max(workArea.x, workArea.x + workArea.width - rect.width)
    const maxY = Math.max(workArea.y, workArea.y + workArea.height - rect.height)
    return {
      x: Math.min(Math.max(rect.x, workArea.x), maxX),
      y: Math.min(Math.max(rect.y, workArea.y), maxY),
      width: rect.width,
      height: rect.height
    }
  }

  /**
   * Calculates equilateral radial orbit positions centered on (cursorX, cursorY) within display bounds.
   * Top (270°): Command Bar
   * Bottom-Left (150°): Terminal
   * Bottom-Right (30°): Notifications
   */
  static calculateCircleOrbit(
    cursorX: number,
    cursorY: number,
    workArea: Rectangle
  ): {
    center: { x: number; y: number }
    bar: Rectangle
    terminal: Rectangle
    notify: Rectangle
  } {
    const minX = workArea.x + 60
    const maxX = workArea.x + workArea.width - 60
    const minY = workArea.y + 65
    const maxY = workArea.y + workArea.height - 48

    const cx = Math.min(Math.max(cursorX, minX), maxX)
    const cy = Math.min(Math.max(cursorY, minY), maxY)

    const bar: Rectangle = {
      x: cx - 25,
      y: cy - 60,
      width: this.ICON_SIZE.width,
      height: this.ICON_SIZE.height
    }

    const terminal: Rectangle = this.clampRect(
      {
        x: bar.x - 30,
        y: bar.y + 56,
        width: this.ICON_SIZE.width,
        height: this.ICON_SIZE.height
      },
      workArea
    )

    const notify: Rectangle = this.clampRect(
      {
        x: bar.x + 30,
        y: bar.y + 56,
        width: this.ICON_SIZE.width,
        height: this.ICON_SIZE.height
      },
      workArea
    )

    return { center: { x: cx, y: cy }, bar, terminal, notify }
  }

  /**
   * Computes the attached idle bounds for a satellite dock window (Terminal or Notifications)
   * relative to the primary command bar window.
   */
  static calculateAttachedBounds(
    bar: Rectangle,
    target: 'terminal' | 'notify',
    dockLayout: 'circle' | 'horizontal' | 'shelf',
    workArea: Rectangle
  ): Rectangle {
    if (dockLayout === 'shelf') {
      return this.calculateShelfIconBounds(bar, target)
    }

    // 1. Circle / radial orbit layout
    if (dockLayout === 'circle') {
      const offsetX = target === 'terminal' ? -30 : 30
      const offsetY = 56
      return this.clampRect(
        {
          x: bar.x + offsetX,
          y: bar.y + offsetY,
          width: this.ICON_SIZE.width,
          height: this.ICON_SIZE.height
        },
        workArea
      )
    }

    // 2. Horizontal or Edge-Aware Vertical Layout
    const distLeft = bar.x - workArea.x
    const distRight = workArea.x + workArea.width - (bar.x + bar.width)
    const distTop = bar.y - workArea.y
    const distBottom = workArea.y + workArea.height - (bar.y + bar.height)

    const isLeftEdge = distLeft < 80 || bar.x - this.ICON_SIZE.width - this.GAP < workArea.x
    const isRightEdge = distRight < 80
    const isVertical = isLeftEdge || isRightEdge

    if (isVertical) {
      const x = bar.x
      if (target === 'terminal') {
        const y =
          distTop < distBottom && distTop < this.ICON_SIZE.height + this.GAP + 20
            ? bar.y + bar.height + this.GAP
            : bar.y - this.ICON_SIZE.height - this.GAP
        return this.clampRect({ x, y, width: this.ICON_SIZE.width, height: this.ICON_SIZE.height }, workArea)
      } else {
        const y =
          distTop < distBottom && distTop < this.ICON_SIZE.height + this.GAP + 20
            ? bar.y + bar.height + this.GAP + this.ICON_SIZE.height + this.GAP
            : bar.y - (this.ICON_SIZE.height + this.GAP) * 2
        return this.clampRect({ x, y, width: this.ICON_SIZE.width, height: this.ICON_SIZE.height }, workArea)
      }
    }

    // Standard horizontal line layout
    const x =
      target === 'terminal'
        ? bar.x - this.ICON_SIZE.width - this.GAP
        : bar.x + bar.width + this.GAP
    const y = Math.round(bar.y + (bar.height - this.ICON_SIZE.height) / 2)

    return this.clampRect({ x, y, width: this.ICON_SIZE.width, height: this.ICON_SIZE.height }, workArea)
  }

  /**
   * Computes the default home position for the dock.
   * - 'shelf': bottom-center pill tray, the new default
   * - 'circle': bottom-right radial orbit, just above the Windows clock
   * - 'horizontal': bottom-right linear row, just above the Windows clock
   */
  static calculateHomeBounds(
    workArea: Rectangle,
    target: 'bar' | 'terminal' | 'notify',
    dockLayout: 'circle' | 'horizontal' | 'shelf' = 'shelf',
    slotCount: number = DEFAULT_SHELF_ICONS.length,
    shelfIcons?: ShelfModuleId[]
  ): Rectangle {
    // --- Shelf layout ---
    if (dockLayout === 'shelf') {
      if (target === 'bar') return this.calculateShelfBarBounds(workArea, slotCount)
      return this.calculateShelfIconBounds(workArea, target, shelfIcons)
    }

    if (dockLayout === 'circle') {
      const cx = workArea.x + workArea.width - this.SCROLLBAR_MARGIN - 55
      const cy = workArea.y + workArea.height - this.IDLE_BOTTOM_MARGIN - 46

      const bar: Rectangle = {
        x: cx - 25,
        y: cy - 60,
        width: this.ICON_SIZE.width,
        height: this.ICON_SIZE.height
      }

      if (target === 'bar') return bar
      return this.calculateAttachedBounds(bar, target, 'circle', workArea)
    }

    // Horizontal dock layout above the clock
    const totalWidth = this.ICON_SIZE.width * 3 + this.GAP * 2
    const leftX = workArea.x + workArea.width - this.SCROLLBAR_MARGIN - totalWidth
    const topY = workArea.y + workArea.height - this.IDLE_BOTTOM_MARGIN - this.ICON_SIZE.height

    if (target === 'terminal') {
      return { x: leftX, y: topY, width: this.ICON_SIZE.width, height: this.ICON_SIZE.height }
    }
    if (target === 'bar') {
      return { x: leftX + this.ICON_SIZE.width + this.GAP, y: topY, width: this.ICON_SIZE.width, height: this.ICON_SIZE.height }
    }
    return { x: leftX + (this.ICON_SIZE.width + this.GAP) * 2, y: topY, width: this.ICON_SIZE.width, height: this.ICON_SIZE.height }
  }

  /**
   * Calculates the shelf BrowserWindow width dynamically based on the number of icons.
   * Each icon is 40px with 8px gaps and 28px total horizontal padding.
   */
  static calculateShelfBarWidth(slotCount: number = DEFAULT_SHELF_ICONS.length): number {
    const count = Math.max(1, slotCount)
    return Math.max(172, count * 48 + 20)
  }

  /**
   * Calculates the shelf BrowserWindow bounds: a transparent window
   * horizontally centered just above the Windows taskbar on the primary display.
   * The bottom 48px is the visible pill; the top 32px is transparent headroom for slide-up animations.
   */
  static calculateShelfBarBounds(workArea: Rectangle, slotCount: number = DEFAULT_SHELF_ICONS.length): Rectangle {
    const width = this.calculateShelfBarWidth(slotCount)
    const x = Math.round(workArea.x + (workArea.width - width) / 2)
    const y =
      workArea.y +
      workArea.height -
      this.SHELF_BOTTOM_MARGIN -
      this.SHELF_PILL_HEIGHT -
      this.SHELF_HEADROOM
    return { x, y, width, height: this.SHELF_WINDOW_HEIGHT }
  }

  /**
   * Calculates bounds for the standalone / shelf command palette window (640×420).
   * Positioned relative to the shelf dock: centered horizontally over the dock,
   * opening upwards above the dock (or downwards if the dock is in the top half of the screen).
   */
  static calculateShelfPaletteBounds(
    workArea: Rectangle,
    shelfBar?: Rectangle | null,
    slotCount: number = DEFAULT_SHELF_ICONS.length
  ): Rectangle {
    const shelf = shelfBar ?? this.calculateShelfBarBounds(workArea, slotCount)
    const width = this.BAR_ACTIVE_SIZE.width
    const height = this.BAR_ACTIVE_SIZE.height

    const shelfCenterX = shelf.x + shelf.width / 2
    const targetX = Math.round(shelfCenterX - width / 2)

    const pillTop = shelf.y + this.SHELF_HEADROOM
    const pillBottom = pillTop + this.SHELF_PILL_HEIGHT
    const screenCenterY = workArea.y + workArea.height / 2

    const targetY =
      pillTop >= screenCenterY
        ? pillTop - this.GAP - height
        : pillBottom + this.GAP

    return this.clampRect({ x: targetX, y: targetY, width, height }, workArea)
  }

  /**
   * Returns a placeholder position for terminal/notify windows in shelf mode.
   * They are kept just off the bottom of the screen so they are never visible in collapsed state.
   * The terminal and notify icons are rendered inside the bar window's shelf tray instead.
   */
  static calculateShelfSatelliteBounds(
    workArea: Rectangle,
    slotCount: number = DEFAULT_SHELF_ICONS.length
  ): Rectangle {
    const shelfBar = this.calculateShelfBarBounds(workArea, slotCount)
    // Position off-screen below the taskbar so the window is invisible when collapsed
    return {
      x: shelfBar.x,
      y: workArea.y + workArea.height + 10,
      width: this.ICON_SIZE.width,
      height: this.ICON_SIZE.height
    }
  }

  /**
   * Computes the bounding box of an individual icon button rendered inside the shelf window.
   * Shelf pill sits at y + SHELF_HEADROOM (32px), height 48px.
   * Dynamically positions each button based on the active shelfIcons array.
   */
  static calculateShelfIconBounds(
    shelfOrWorkArea: Rectangle,
    target: ShelfModuleId | 'terminal',
    shelfIcons?: ShelfModuleId[]
  ): Rectangle {
    const icons: ShelfModuleId[] =
      shelfIcons && shelfIcons.length > 0
        ? shelfIcons
        : ['term', 'bar', 'notify', 'settings', 'focus', 'git', 'profile']
    const normalizedTarget: ShelfModuleId = target === 'terminal' ? 'term' : target
    const count = icons.length
    const isAlreadyShelf =
      shelfOrWorkArea.height === this.SHELF_WINDOW_HEIGHT && shelfOrWorkArea.width >= 160
    const shelf = isAlreadyShelf
      ? shelfOrWorkArea
      : this.calculateShelfBarBounds(shelfOrWorkArea, count)

    const y = shelf.y + this.SHELF_HEADROOM + 4
    const index = icons.indexOf(normalizedTarget)
    if (index === -1) {
      return { x: shelf.x + Math.round((shelf.width - 40) / 2), y, width: 40, height: 40 }
    }

    const totalIconsWidth = count * 40 + (count - 1) * 8
    const leftPad = Math.round((shelf.width - totalIconsWidth) / 2)
    const x = shelf.x + leftPad + index * 48
    return { x, y, width: 40, height: 40 }
  }

  /**
   * Computes the default idle screen bounds for any dock icon when resting at home position.
   */
  static calculateDefaultIdleBounds(
    workArea: Rectangle,
    target: 'bar' | 'terminal' | 'notify',
    dockLayout: 'circle' | 'horizontal' | 'shelf' = 'shelf'
  ): Rectangle {
    return this.calculateHomeBounds(workArea, target, dockLayout)
  }

  /**
   * Calculates the expanded window bounds (panel) positioned relative to the icon and clamped to workArea.
   */
  static calculateExpandedBounds(
    icon: Rectangle,
    panelSize: { width: number; height: number },
    workArea: Rectangle,
    userPosition?: { x: number; y: number } | null
  ): Rectangle {
    if (userPosition) {
      return this.clampRect({ x: userPosition.x, y: userPosition.y, ...panelSize }, workArea)
    }

    const screenCenterY = workArea.y + workArea.height / 2
    const iconCenterX = icon.x + icon.width / 2
    const iconCenterY = icon.y + icon.height / 2

    // Center horizontally over the icon
    const targetX = Math.round(iconCenterX - panelSize.width / 2)

    // Vertical popout:
    // If in the bottom half of the screen, open upwards above the dock.
    // If in the top half of the screen, open downwards below the dock.
    const targetY =
      iconCenterY >= screenCenterY
        ? icon.y - this.GAP - panelSize.height
        : icon.y + icon.height + this.GAP

    return this.clampRect({ x: targetX, y: targetY, width: panelSize.width, height: panelSize.height }, workArea)
  }

  /**
   * Computes CSS transform-origin percentage and scale for smooth grow/shrink animations.
   */
  static calculateGrowOrigin(icon: Rectangle, panel: Rectangle): GrowOrigin {
    return {
      originX: ((icon.x + icon.width / 2 - panel.x) / panel.width) * 100,
      originY: ((icon.y + icon.height / 2 - panel.y) / panel.height) * 100,
      scale: icon.width / panel.width
    }
  }
}
