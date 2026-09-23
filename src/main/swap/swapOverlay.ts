import { BrowserWindow, screen, ipcMain, type NativeImage } from 'electron'

let overlayWindow: BrowserWindow | null = null
let onExitCallback: (() => void) | null = null
let exitListenerRegistered = false

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function getSwapOverlayBounds(): { x: number; y: number; width: number; height: number } {
  const { workArea } = screen.getPrimaryDisplay()
  const width = 640
  const height = 56
  const x = Math.round(workArea.x + (workArea.width - width) / 2)
  const y = workArea.y + 14
  return { x, y, width, height }
}

export function createSwapOverlay(appIcon?: NativeImage): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow
  }

  const { x, y, width, height } = getSwapOverlayBounds()

  overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    icon: appIcon,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  overlayWindow.setAlwaysOnTop(true, 'screen-saver')

  // Register single IPC listener for exit click
  if (!exitListenerRegistered) {
    exitListenerRegistered = true
    ipcMain.on('swap-overlay-exit', () => {
      if (onExitCallback) {
        onExitCallback()
      }
    })
  }

  return overlayWindow
}

export function showSwapOverlay(
  targetText: string,
  hotkeyText: string,
  onExit: () => void,
  appIcon?: NativeImage
): void {
  onExitCallback = onExit
  const win = createSwapOverlay(appIcon)

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    margin: 0;
    padding: 0;
    overflow: hidden;
    user-select: none;
    background: transparent;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  }
  .banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(18, 20, 26, 0.94);
    border: 1px solid rgba(255, 152, 0, 0.65);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.65), 0 0 18px rgba(255, 152, 0, 0.3);
    color: #e2e8f0;
    border-radius: 9999px;
    height: 46px;
    padding: 0 20px;
    font-size: 15px;
    font-weight: 500;
  }
  .icon {
    color: #ff9800;
    margin-right: 12px;
    font-size: 18px;
    font-weight: bold;
  }
  .text {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 15px;
  }
  .highlight {
    color: #fbd38d;
    font-weight: 600;
  }
  .hint {
    color: #a0aec0;
    font-size: 13px;
    margin-left: 8px;
  }
  .btn {
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: #fff;
    padding: 6px 16px;
    border-radius: 14px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    margin-left: 14px;
    transition: all 0.15s ease;
  }
  .btn:hover {
    background: rgba(239, 68, 68, 0.85);
    border-color: rgba(239, 68, 68, 1);
  }
</style>
</head>
<body>
  <div class="banner">
    <span class="icon">⇄</span>
    <span class="text">Input Swapped to <span class="highlight">${escapeHtml(targetText)}</span><span class="hint">(${escapeHtml(hotkeyText)})</span></span>
    <button class="btn" onclick="require('electron').ipcRenderer.send('swap-overlay-exit')">Return Input</button>
  </div>
</body>
</html>`

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  win.showInactive()
}

export function hideSwapOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide()
  }
  onExitCallback = null
}
