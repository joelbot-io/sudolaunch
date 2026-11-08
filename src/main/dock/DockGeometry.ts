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
  static readonly BAR_ACTIVE_SIZE = { width: 1480, height: 920 } as const
  static readonly MODULE_PANEL_SIZE = { width: 640, height: 480 } as const
  static readonly GIT_PANEL_SIZE = { width: 760, height: 580 } as const
  static readonly SYSTEM_PANEL_SIZE = { width: 1040, height: 720 } as const
  static readonly FOCUS_PANEL_SIZE = { width: 640, height: 380 } as const
  static readonly TERMINAL_PANEL_SIZE = { width: 800, height: 360 } as const
  static readonly SHORTCUTS_PANEL_SIZE = { width: 1040, height: 720 } as const
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
  /** Dimensions of the unified Circular Orbit dock window (150x150 square) */
  static readonly CIRCLE_ORBIT_SIZE = { width: 150, height: 150 } as const

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
    if (dockLayout === 'circle') {
      return this.calculateCircleSatelliteBounds(bar, target)
    }
    if (dockLayout === 'shelf') {
      return this.calculateShelfSatelliteBounds(workArea)
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
   * - 'circle': circular radial orbit hovering at the home anchor
   * - 'horizontal': linear row at the home anchor
   */
  static calculateHomeBounds(
    workArea: Rectangle,
    target: 'bar' | 'terminal' | 'notify',
    dockLayout: 'circle' | 'horizontal' | 'shelf' = 'shelf',
    slotCount: number = DEFAULT_SHELF_ICONS.length,
    shelfIcons?: ShelfModuleId[],
    homePosition: 'left' | 'middle' | 'right' | 'custom' = 'middle',
    customCoords?: { x: number; y: number }
  ): Rectangle {
    // --- Shelf layout ---
    if (dockLayout === 'shelf') {
      if (target === 'bar') return this.calculateShelfBarBounds(workArea, slotCount, homePosition, customCoords)
      return this.calculateShelfIconBounds(workArea, target, shelfIcons, homePosition, customCoords)
    }

    // --- Circle Orbit layout ---
    if (dockLayout === 'circle') {
      if (target === 'bar') {
        return this.calculateCircleOrbitBounds(workArea, homePosition, customCoords)
      }
      return this.calculateShelfSatelliteBounds(workArea, slotCount)
    }

    // Horizontal dock layout
    const totalWidth = this.ICON_SIZE.width * 3 + this.GAP * 2
    let leftX = workArea.x + workArea.width - this.SCROLLBAR_MARGIN - totalWidth
    let topY = workArea.y + workArea.height - this.IDLE_BOTTOM_MARGIN - this.ICON_SIZE.height

    if (homePosition === 'left') {
      leftX = workArea.x + this.SCROLLBAR_MARGIN
    } else if (homePosition === 'middle') {
      leftX = Math.round(workArea.x + (workArea.width - totalWidth) / 2)
    } else if (homePosition === 'custom' && customCoords) {
      leftX = Math.round(workArea.x + (workArea.width * customCoords.x) / 100 - totalWidth / 2)
      topY = Math.round(workArea.y + (workArea.height * customCoords.y) / 100 - this.ICON_SIZE.height / 2)
    }

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
   * positioned at the home anchor (left, middle, right, or custom coordinates) just above the Windows taskbar.
   * The bottom 48px is the visible pill; the top 32px is transparent headroom for slide-up animations.
   */
  static calculateShelfBarBounds(
    workArea: Rectangle,
    slotCount: number = DEFAULT_SHELF_ICONS.length,
    homePosition: 'left' | 'middle' | 'right' | 'custom' = 'middle',
    customCoords?: { x: number; y: number }
  ): Rectangle {
    const width = this.calculateShelfBarWidth(slotCount)
    let x = Math.round(workArea.x + (workArea.width - width) / 2)
    if (homePosition === 'left') {
      x = workArea.x + this.SHELF_BOTTOM_MARGIN
    } else if (homePosition === 'right') {
      x = workArea.x + workArea.width - width - this.SHELF_BOTTOM_MARGIN
    } else if (homePosition === 'custom' && customCoords) {
      x = Math.round(workArea.x + (workArea.width * customCoords.x) / 100 - width / 2)
    }
    const y =
      workArea.y +
      workArea.height -
      this.SHELF_BOTTOM_MARGIN -
      this.SHELF_PILL_HEIGHT -
      this.SHELF_HEADROOM
    return { x, y, width, height: this.SHELF_WINDOW_HEIGHT }
  }

  /**
   * Calculates bounds for the unified Circular Orbit dock window (150x150).
   * Positioned at the chosen home anchor (left, middle, right, or custom percentage coordinates).
   */
  static calculateCircleOrbitBounds(
    workArea: Rectangle,
    homePosition: 'left' | 'middle' | 'right' | 'custom' = 'middle',
    customCoords?: { x: number; y: number }
  ): Rectangle {
    const size = this.CIRCLE_ORBIT_SIZE
    let x = Math.round(workArea.x + (workArea.width - size.width) / 2)
    let y = workArea.y + workArea.height - this.SHELF_BOTTOM_MARGIN - size.height

    if (homePosition === 'left') {
      x = workArea.x + this.SHELF_BOTTOM_MARGIN
    } else if (homePosition === 'right') {
      x = workArea.x + workArea.width - size.width - this.SHELF_BOTTOM_MARGIN
    } else if (homePosition === 'custom' && customCoords) {
      x = Math.round(workArea.x + (workArea.width * customCoords.x) / 100 - size.width / 2)
      y = Math.round(workArea.y + (workArea.height * customCoords.y) / 100 - size.height / 2)
    }

    return this.clampRect({ x, y, width: size.width, height: size.height }, workArea)
  }

  /**
   * Calculates bounds for the standalone / shelf command palette window.
   * Positioned relative to the shelf dock: centered horizontally over the dock,
   * opening upwards above the dock (or downwards if the dock is in the top half of the screen).
   */
  static calculateShelfPaletteBounds(
    workArea: Rectangle,
    shelfBar?: Rectangle | null,
    slotCount: number = DEFAULT_SHELF_ICONS.length,
    moduleHeight?: number,
    moduleWidth?: number
  ): Rectangle {
    const shelf = shelfBar ?? this.calculateShelfBarBounds(workArea, slotCount)
    const maxWidth = Math.max(480, workArea.width - 32)
    const maxHeight = Math.max(360, workArea.height - 80)
    const width = Math.min(moduleWidth ?? this.BAR_ACTIVE_SIZE.width, maxWidth)
    const height = Math.min(moduleHeight ?? this.BAR_ACTIVE_SIZE.height, maxHeight)

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
    shelfIcons?: ShelfModuleId[],
    homePosition: 'left' | 'middle' | 'right' | 'custom' = 'middle',
    customCoords?: { x: number; y: number }
  ): Rectangle {
    const icons: ShelfModuleId[] =
      shelfIcons && shelfIcons.length > 0
        ? shelfIcons
        : ['term', 'bar', 'notify', 'shortcuts', 'settings', 'focus', 'git', 'profile', 'system']
    const normalizedTarget: ShelfModuleId = target === 'terminal' ? 'term' : target
    const count = icons.length
    const isAlreadyShelf =
      shelfOrWorkArea.height === this.SHELF_WINDOW_HEIGHT && shelfOrWorkArea.width >= 160
    const shelf = isAlreadyShelf
      ? shelfOrWorkArea
      : this.calculateShelfBarBounds(shelfOrWorkArea, count, homePosition, customCoords)

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
   * Computes the bounding box of an individual satellite icon rendered inside the 150×150 Circular Orbit dock window.
   */
  static calculateCircleSatelliteBounds(
    circleDockOrWorkArea: Rectangle,
    target: ShelfModuleId | 'terminal' | 'notify',
    shelfIcons?: ShelfModuleId[],
    homePosition: 'left' | 'middle' | 'right' | 'custom' = 'middle',
    customCoords?: { x: number; y: number }
  ): Rectangle {
    const isAlreadyCircle =
      circleDockOrWorkArea.width === this.CIRCLE_ORBIT_SIZE.width &&
      circleDockOrWorkArea.height === this.CIRCLE_ORBIT_SIZE.height
    const dock = isAlreadyCircle
      ? circleDockOrWorkArea
      : this.calculateCircleOrbitBounds(circleDockOrWorkArea, homePosition, customCoords)

    const icons: ShelfModuleId[] =
      shelfIcons && shelfIcons.length > 0
        ? shelfIcons
        : ['term', 'bar', 'notify', 'shortcuts', 'settings', 'focus', 'git', 'profile', 'system']
    const normalizedTarget: ShelfModuleId = target === 'terminal' ? 'term' : target

    const orbitModuleList: ShelfModuleId[] = [
      'bar',
      ...icons.filter((id) => id !== 'bar')
    ]
    const count = orbitModuleList.length
    const orbitRadius = 48
    const centerCoord = 75

    const idx = orbitModuleList.indexOf(normalizedTarget)
    const angle = idx !== -1 ? -Math.PI / 2 + (idx * 2 * Math.PI) / count : -Math.PI / 2
    const sx = Math.round(centerCoord + orbitRadius * Math.cos(angle))
    const sy = Math.round(centerCoord + orbitRadius * Math.sin(angle))
    const size = normalizedTarget === 'bar' ? 36 : 32

    return {
      x: dock.x + sx - Math.round(size / 2),
      y: dock.y + sy - Math.round(size / 2),
      width: size,
      height: size
    }
  }

  /**
   * Calculates bounds for the Notification Center panel (560×400) relative to the dock's current position.
   * Works consistently across 'shelf', 'circle', and 'horizontal' dock layouts:
   * - In shelf mode: centers horizontally over the notification bell icon and opens above/below.
   * - In circle mode: centers horizontally over the circular orbit dock / satellite and opens above/below.
   * - In horizontal mode: centers over the notification button and opens above/below.
   */
  static calculateNotificationPanelBounds(
    workArea: Rectangle,
    dockBounds?: Rectangle | null,
    dockLayout: 'circle' | 'horizontal' | 'shelf' = 'shelf',
    shelfIcons?: ShelfModuleId[],
    homePosition: 'left' | 'middle' | 'right' | 'custom' = 'middle',
    customCoords?: { x: number; y: number }
  ): Rectangle {
    const width = this.NOTIFICATION_PANEL_SIZE.width
    const height = this.NOTIFICATION_PANEL_SIZE.height

    let anchor: Rectangle
    let dockTop: number
    let dockBottom: number

    if (dockLayout === 'circle') {
      const dock = dockBounds ?? this.calculateCircleOrbitBounds(workArea, homePosition, customCoords)
      anchor = this.calculateCircleSatelliteBounds(dock, 'notify', shelfIcons, homePosition, customCoords)
      dockTop = dock.y
      dockBottom = dock.y + dock.height
    } else if (dockLayout === 'shelf') {
      const slotCount = shelfIcons?.length ?? DEFAULT_SHELF_ICONS.length
      const dock = dockBounds ?? this.calculateShelfBarBounds(workArea, slotCount, homePosition, customCoords)
      anchor = this.calculateShelfIconBounds(dock, 'notify', shelfIcons, homePosition, customCoords)
      dockTop = dock.y + this.SHELF_HEADROOM
      dockBottom = dockTop + this.SHELF_PILL_HEIGHT
    } else {
      // Horizontal layout
      const dock = dockBounds ?? this.calculateHomeBounds(workArea, 'bar', 'horizontal', undefined, undefined, homePosition, customCoords)
      anchor = this.calculateAttachedBounds(dock, 'notify', 'horizontal', workArea)
      dockTop = dock.y
      dockBottom = dock.y + dock.height
    }

    const anchorCenterX = anchor.x + anchor.width / 2
    const targetX = Math.round(anchorCenterX - width / 2)
    const screenCenterY = workArea.y + workArea.height / 2
    const targetY =
      dockTop >= screenCenterY
        ? dockTop - this.GAP - height
        : dockBottom + this.GAP

    return this.clampRect({ x: targetX, y: targetY, width, height }, workArea)
  }

  /**
   * Computes the default idle screen bounds for any dock icon when resting at home position.
   */
  static calculateDefaultIdleBounds(
    workArea: Rectangle,
    target: 'bar' | 'terminal' | 'notify',
    dockLayout: 'circle' | 'horizontal' | 'shelf' = 'shelf',
    homePosition: 'left' | 'middle' | 'right' | 'custom' = 'middle',
    customCoords?: { x: number; y: number }
  ): Rectangle {
    return this.calculateHomeBounds(workArea, target, dockLayout, undefined, undefined, homePosition, customCoords)
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
    const width = Math.min(panelSize.width, Math.max(480, workArea.width - 32))
    const height = Math.min(panelSize.height, Math.max(360, workArea.height - 80))

    if (userPosition) {
      return this.clampRect({ x: userPosition.x, y: userPosition.y, width, height }, workArea)
    }

    const screenCenterY = workArea.y + workArea.height / 2
    const iconCenterX = icon.x + icon.width / 2
    const iconCenterY = icon.y + icon.height / 2

    // Center horizontally over the icon
    const targetX = Math.round(iconCenterX - width / 2)

    // Vertical popout:
    // If in the bottom half of the screen, open upwards above the dock.
    // If in the top half of the screen, open downwards below the dock.
    const targetY =
      iconCenterY >= screenCenterY
        ? icon.y - this.GAP - height
        : icon.y + icon.height + this.GAP

    return this.clampRect({ x: targetX, y: targetY, width, height }, workArea)
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
