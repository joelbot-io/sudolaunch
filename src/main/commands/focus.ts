import { windowManager, Window } from 'node-window-manager'
import { BrowserWindow } from 'electron'
import { basename } from 'path'
import Fuse from 'fuse.js'
import type { SearchResultItem } from '../../shared/types'

// node-window-manager's Window#id is the raw HWND as a JS number. Electron's
// getNativeWindowHandle() returns the same HWND as a Buffer (padded to pointer width on
// 64-bit Windows, with the actual handle value fitting in the low 32 bits) — read it once
// so we can exclude the palette's own window from the list below.
function ownWindowId(): number | null {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return null
  const handle = win.getNativeWindowHandle()
  return handle.readUInt32LE(0)
}

// Windows hosts several full-screen "ghost" windows for shell chrome (touch keyboard,
// Start, Search, etc.) that report isVisible()=true and a real title/size despite never
// being something a user would actually switch to — exclude by their known host process.
const NON_INTERACTIVE_PROCESSES = new Set([
  'textinputhost.exe',
  'shellexperiencehost.exe',
  'startmenuexperiencehost.exe',
  'searchhost.exe'
])

// Below this, a window is almost always a taskbar/tab-preview proxy rather than something
// with real content (real app windows are always much larger than this in practice).
const MIN_INTERACTIVE_SIZE = 60

// node-window-manager types every IRectangle field as optional even though the native
// GetWindowRect call always fills all four in — so normalize once here rather than
// second-guessing each field at the call site. The fallbacks are chosen to be inert: an
// absent position reads as on-screen (not minimized), and an absent size passes the
// size filter rather than silently dropping the window.
function windowBounds(win: Window): { x: number; y: number; width: number; height: number } {
  const { x, y, width, height } = win.getBounds()
  return {
    x: x ?? 0,
    y: y ?? 0,
    width: width ?? MIN_INTERACTIVE_SIZE,
    height: height ?? MIN_INTERACTIVE_SIZE
  }
}

// GetWindowRect reports minimized windows at an off-screen sentinel position (~-32000,
// -32000) rather than a zero/degenerate size, so bounds size alone can't detect it.
function isMinimized(bounds: { x: number; y: number }): boolean {
  return bounds.x <= -30000 || bounds.y <= -30000
}

function monitorLabel(win: Window): string {
  const monitors = windowManager.getMonitors()
  // getMonitor() falls back to an EmptyMonitor (no id at all) when the window doesn't
  // resolve to a real display — the package doesn't export Monitor for an instanceof
  // check, so narrow on the property that distinguishes them.
  const monitor = win.getMonitor()
  if (!('id' in monitor)) return 'Unknown monitor'
  const index = monitors.findIndex((m) => m.id === monitor.id)
  return index === -1 ? 'Unknown monitor' : `Monitor ${index + 1}`
}

interface Candidate {
  id: number
  label: string
  sublabel: string
}

function listCandidates(): Candidate[] {
  const excludeId = ownWindowId()
  const out: Candidate[] = []
  for (const win of windowManager.getWindows()) {
    if (win.id === excludeId) continue
    let title: string
    let minimized: boolean
    try {
      title = win.getTitle().trim()
      if (!title || !win.isVisible()) continue
      if (NON_INTERACTIVE_PROCESSES.has(basename(win.path || '').toLowerCase())) continue
      const bounds = windowBounds(win)
      minimized = isMinimized(bounds)
      if (!minimized && (bounds.width < MIN_INTERACTIVE_SIZE || bounds.height < MIN_INTERACTIVE_SIZE)) continue
    } catch {
      continue
    }
    let sublabel: string
    try {
      sublabel = minimized ? `${monitorLabel(win)} · minimized` : monitorLabel(win)
    } catch {
      sublabel = minimized ? 'minimized' : ''
    }
    out.push({ id: win.id, label: title, sublabel })
  }
  return out
}

export function search(query: string): SearchResultItem[] {
  const candidates = listCandidates()
  const matches = query
    ? new Fuse(candidates, { keys: ['label'], threshold: 0.35 }).search(query).map((r) => r.item)
    : candidates.slice(0, 25)
  return matches.map((c) => ({ label: c.label, sublabel: c.sublabel, value: String(c.id) }))
}

export async function execute(item: SearchResultItem): Promise<void> {
  const id = Number(item.value)
  const win = windowManager.getWindows().find((w) => w.id === id)
  if (!win) {
    throw new Error('Window no longer exists')
  }
  win.restore()
  win.bringToTop()
}
