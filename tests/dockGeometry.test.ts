import { describe, it, expect } from 'vitest'
import { DockGeometry } from '../src/main/dock/DockGeometry'

describe('Stateless Window & Multi-Monitor Dock Geometry (DockGeometry.ts)', () => {
  const primaryWorkArea = { x: 0, y: 0, width: 1920, height: 1040 }
  const leftMonitorWorkArea = { x: -1920, y: -200, width: 1920, height: 1080 }

  it('clamps rectangles inside both standard and negative-coordinate multi-monitor workAreas', () => {
    // Off-screen right and bottom on primary monitor
    const clampedPrimary = DockGeometry.clampRect(
      { x: 1800, y: 950, width: 300, height: 200 },
      primaryWorkArea
    )
    expect(clampedPrimary).toEqual({ x: 1620, y: 840, width: 300, height: 200 })

    // Off-screen top-left on secondary negative-coordinate monitor
    const clampedLeft = DockGeometry.clampRect(
      { x: -2100, y: -350, width: 400, height: 300 },
      leftMonitorWorkArea
    )
    expect(clampedLeft).toEqual({ x: -1920, y: -200, width: 400, height: 300 })
  })

  it('computes shelf bar width and bounds accurately across left, middle, right, and custom anchors', () => {
    expect(DockGeometry.calculateShelfBarWidth(7)).toBe(7 * 48 + 20)
    expect(DockGeometry.calculateShelfBarWidth(1)).toBe(172) // min width clamp

    const midShelf = DockGeometry.calculateShelfBarBounds(primaryWorkArea, 7, 'middle')
    expect(midShelf.x).toBe(Math.round((1920 - midShelf.width) / 2))
    expect(midShelf.y + midShelf.height).toBe(primaryWorkArea.height)

    const leftShelf = DockGeometry.calculateShelfBarBounds(primaryWorkArea, 7, 'left')
    expect(leftShelf.x).toBe(DockGeometry.SHELF_BOTTOM_MARGIN)

    const rightShelf = DockGeometry.calculateShelfBarBounds(primaryWorkArea, 7, 'right')
    expect(rightShelf.x).toBe(1920 - rightShelf.width - DockGeometry.SHELF_BOTTOM_MARGIN)
  })

  it('switches horizontal attached satellite icons to vertical layout near screen edges', () => {
    // Near left screen edge (x = 10) -> should stack vertically instead of clipping off left edge
    const leftEdgeBar = { x: 10, y: 500, width: 50, height: 50 }
    const termBounds = DockGeometry.calculateAttachedBounds(
      leftEdgeBar,
      'terminal',
      'horizontal',
      primaryWorkArea
    )
    expect(termBounds.x).toBe(leftEdgeBar.x)
    expect(termBounds.y).toBe(leftEdgeBar.y - DockGeometry.ICON_SIZE.height - DockGeometry.GAP)
  })

  it('opens expanded panels upwards when dock is in bottom half and downwards when in top half', () => {
    const bottomIcon = { x: 935, y: 980, width: 50, height: 50 }
    const panelUp = DockGeometry.calculateExpandedBounds(
      bottomIcon,
      { width: 640, height: 480 },
      primaryWorkArea
    )
    expect(panelUp.y).toBe(bottomIcon.y - DockGeometry.GAP - 480)

    const topIcon = { x: 935, y: 20, width: 50, height: 50 }
    const panelDown = DockGeometry.calculateExpandedBounds(
      topIcon,
      { width: 640, height: 480 },
      primaryWorkArea
    )
    expect(panelDown.y).toBe(topIcon.y + topIcon.height + DockGeometry.GAP)
  })

  it('computes grow transform-origin percentages relative to the panel', () => {
    const icon = { x: 475, y: 900, width: 50, height: 50 }
    const panel = { x: 0, y: 400, width: 1000, height: 500 }
    const origin = DockGeometry.calculateGrowOrigin(icon, panel)
    expect(origin.originX).toBeCloseTo(50, 5)
    expect(origin.originY).toBeCloseTo(105, 5)
    expect(origin.scale).toBeCloseTo(0.05, 5)
  })
})
