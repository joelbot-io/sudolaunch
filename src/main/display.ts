import { screen, type Display } from 'electron'

/**
 * Returns the target Display assigned for the dock based on the 1-based monitor configuration index.
 * If monitor is not configured, out of range, or any error occurs, it safely defaults to monitor 1 (displays[0]),
 * falling back to screen.getPrimaryDisplay() if needed.
 */
export function getDockDisplay(monitorIndex?: number): Display {
  try {
    const displays = screen.getAllDisplays()
    if (!displays || displays.length === 0) {
      return screen.getPrimaryDisplay()
    }

    if (typeof monitorIndex === 'number' && Number.isInteger(monitorIndex) && monitorIndex >= 1) {
      const idx = monitorIndex - 1
      if (idx >= 0 && idx < displays.length) {
        return displays[idx]
      }
    }

    // Default to monitor 1 (index 0) for any error, out of range, or missing value
    return displays[0] ?? screen.getPrimaryDisplay()
  } catch {
    try {
      const all = screen.getAllDisplays()
      return all[0] ?? screen.getPrimaryDisplay()
    } catch {
      return screen.getPrimaryDisplay()
    }
  }
}
