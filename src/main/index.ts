import {
  app,
  BrowserWindow,
  globalShortcut,
  Tray,
  Menu,
  ipcMain,
  shell,
  screen,
  nativeImage,
  nativeTheme
} from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import {
  ensureConfigDir,
  readSettings,
  CONFIG_DIR,
  watchConfig,
  watchSettings,
  getConfigEntries,
  saveConfigEntry,
  deleteConfigEntry
} from './config'
import { getHistory } from './history'
import { search, execute, evaluateExpression, listApps } from './commands'
import type { CommandName, SearchResultItem, ConfigType, ConfigEntry } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

const trayIconPath = app.isPackaged
  ? join(process.resourcesPath, 'tray-icon@2x.png')
  : join(__dirname, '../../resources/tray-icon@2x.png')
const appIcon = nativeImage.createFromPath(trayIconPath)

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 640,
    height: 420,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('blur', () => {
    win.hide()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function centerOnActiveDisplay(win: BrowserWindow): void {
  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  const { width, height } = win.getBounds()
  const x = Math.round(display.bounds.x + (display.bounds.width - width) / 2)
  const y = Math.round(display.bounds.y + (display.bounds.height - height) / 3)
  win.setPosition(x, y)
}

function togglePalette(): void {
  if (!mainWindow) return
  if (mainWindow.isVisible()) {
    mainWindow.hide()
    return
  }
  centerOnActiveDisplay(mainWindow)
  mainWindow.show()
  mainWindow.focus()
  mainWindow.webContents.send('palette-shown')
}

function createTray(): void {
  tray = new Tray(appIcon.resize({ width: 32, height: 32 }))
  tray.setToolTip('sudolaunch')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show', click: () => togglePalette() },
      { label: 'Open config folder', click: () => shell.openPath(CONFIG_DIR) },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
  tray.on('click', () => togglePalette())
}

let currentHotkey: string | null = null

function registerHotkey(hotkey: string): void {
  if (hotkey === currentHotkey) return

  // globalShortcut.register throws synchronously for a malformed accelerator string
  // (e.g. a typo'd hand-edit to settings.json), and returns false if the accelerator
  // is well-formed but already taken by another app — handle both the same way.
  let ok = false
  try {
    ok = globalShortcut.register(hotkey, togglePalette)
  } catch (err) {
    console.error(`Invalid hotkey accelerator: ${hotkey}`, err)
  }

  if (!ok) {
    // Keep whatever hotkey was already working rather than leaving the user with none.
    console.error(`Failed to register global hotkey: ${hotkey}`)
    mainWindow?.webContents.send('hotkey-error', hotkey)
    return
  }

  if (currentHotkey) {
    globalShortcut.unregister(currentHotkey)
  }
  currentHotkey = hotkey
}

function applyAutoStart(autoStart: boolean): void {
  // Only touch the Windows startup registration for packaged builds — in dev, process.execPath
  // points at the Electron binary itself, which would register a throwaway dev build to auto-launch.
  if (!app.isPackaged) return
  app.setLoginItemSettings({
    openAtLogin: autoStart,
    path: process.execPath
  })
}

function registerIpcHandlers(): void {
  ipcMain.handle('search', (_event, command: CommandName, query: string) => search(command, query))
  ipcMain.handle('run-calc', (_event, expression: string) => evaluateExpression(expression))
  ipcMain.handle('execute-command', async (_event, command: CommandName, item: SearchResultItem, query: string) => {
    await execute(command, item, query)
    mainWindow?.hide()
  })
  ipcMain.handle('get-history', () => getHistory())
  ipcMain.on('hide-palette', () => mainWindow?.hide())
  ipcMain.on('open-config-folder', () => shell.openPath(CONFIG_DIR))
  ipcMain.handle('config-get-entries', (_event, type: ConfigType) => getConfigEntries(type))
  ipcMain.handle('config-save-entry', (_event, type: ConfigType, entry: ConfigEntry, index: number | null) =>
    saveConfigEntry(type, entry, index)
  )
  ipcMain.handle('config-delete-entry', (_event, type: ConfigType, index: number) => deleteConfigEntry(type, index))
  ipcMain.handle('list-apps', () => listApps())
}

app.whenReady().then(() => {
  // Always dark, regardless of the Windows system theme setting.
  nativeTheme.themeSource = 'dark'
  ensureConfigDir()
  registerIpcHandlers()
  mainWindow = createWindow()
  createTray()
  const initialSettings = readSettings()
  registerHotkey(initialSettings.hotkey)
  applyAutoStart(initialSettings.autoStart)

  watchConfig(() => {
    mainWindow?.webContents.send('config-changed')
  })

  watchSettings((settings) => {
    registerHotkey(settings.hotkey)
    applyAutoStart(settings.autoStart)
    mainWindow?.webContents.send('config-changed')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // Keep running in the tray; the palette window hides rather than closes.
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
