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
  nativeTheme,
  type Rectangle
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
import { getAppIconPath } from './icon'
import { ensureCommandsDir, loadCustomCommands, watchCustomCommands } from './customCommands'
import { ensureGifDir } from './commands/gif'
import { ensureLookupDir } from './commands/lookup'
import { createTerminalWindow, registerTerminalIpc, openTerminal, toggleTerminal } from './terminalWindow'
import { killPty } from './terminal'
import {
  createBarWindow,
  isBarWindow,
  setBarVisible,
  toggleBarActivation,
  registerBarIpc,
  repositionBarForDisplayChange,
  sendToBar
} from './barWindow'
import { initSwap, shutdownSwap, startSwapServer } from './swap/swapManager'
import type { CommandName, SearchResultItem, ConfigType, ConfigEntry } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

const appIcon = nativeImage.createFromPath(getAppIconPath())

// Required on Windows for Notification toasts (used by custom commands) to be attributed
// to this app — with the right name/icon — instead of showing as a generic Electron toast.
app.setAppUserModelId('com.sudolaunch.app')

function createBaseWindow(bounds: Rectangle): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    transparent: true,
    // Windows sometimes needs this spelled out explicitly (not just transparent:true) to
    // composite consistently — most noticeably on the bar, which is revealed via
    // showInactive() rather than show(), a path that's historically flakier about it.
    backgroundColor: '#00000000',
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js')
    }
  })
  // The plain alwaysOnTop:true constructor option puts windows in the regular "floating"
  // level, which Windows' own taskbar/Start menu still renders above — bumping to the
  // "screen-saver" level is what actually clears that band.
  win.setAlwaysOnTop(true, 'screen-saver')
  return win
}

function loadRenderer(win: BrowserWindow): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createWindow(): BrowserWindow {
  const win = createBaseWindow({ x: 0, y: 0, width: 640, height: 420 })
  win.on('blur', () => win.hide())
  loadRenderer(win)
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

// The hotkey's job is to get a query input in front of the user as fast as possible — when
// the persistent bar is around, that means activating *it* rather than spawning a second,
// separate window. The standalone popup only comes into play as a fallback for when the
// bar's been turned off (via "/view").
function togglePalette(): void {
  if (toggleBarActivation()) return
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
  tray.setToolTip('SudoLaunch')
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

// Both the palette and terminal hotkeys are user-configurable (Settings → Hotkey /
// Terminal hotkey) and follow the same register/re-register/report-failure shape, just
// against different accelerator strings, actions, and error channels — hence one factory
// instead of two near-identical copies.
function createHotkeyRegistrar(
  errorChannel: string,
  action: () => void
): { register: (hotkey: string) => void; current: () => string | null } {
  let current: string | null = null
  function register(hotkey: string): void {
    if (hotkey === current) return

    // globalShortcut.register throws synchronously for a malformed accelerator string
    // (e.g. a typo'd hand-edit to settings.json, or one made of modifiers alone with no
    // real key), and returns false if the accelerator is well-formed but already taken by
    // another app — handle both the same way.
    let ok = false
    try {
      ok = globalShortcut.register(hotkey, action)
    } catch (err) {
      console.error(`Invalid accelerator: ${hotkey}`, err)
    }

    if (!ok) {
      // Keep whatever hotkey was already working rather than leaving the user with none.
      console.error(`Failed to register global hotkey: ${hotkey}`)
      mainWindow?.webContents.send(errorChannel, hotkey)
      sendToBar(errorChannel, hotkey)
      return
    }

    if (current) globalShortcut.unregister(current)
    current = hotkey
  }
  return { register, current: () => current }
}

const paletteHotkey = createHotkeyRegistrar('hotkey-error', togglePalette)
const terminalHotkey = createHotkeyRegistrar('terminal-hotkey-error', () => toggleTerminal())

// Additional fixed (not user-configurable, not shown in tooltips) ways to pop the terminal
// open or minimize, all interchangeable with the configurable terminalHotkey above.
//
// "Control+Super+/": Ctrl+Win was the combo actually asked for, before landing on
// Ctrl+Alt+T as the registerable default — Electron's globalShortcut can't bind an
// accelerator made of modifiers alone, hence a trailing key. Control+Super+Space failed to
// register (Windows reserves Win+Space for input-language switching, apparently regardless
// of extra modifiers), so it uses "/", which isn't OS-reserved.
//
// "F1": deliberately takes over the conventional help key. Because globalShortcut is
// system-wide, this swallows F1 in *every* application, not just this one — no other app
// will see it to open its help. That's the intent, but it's the reason F1 is worth calling
// out separately from the modifier combos above.
const FIXED_TERMINAL_HOTKEYS = ['Control+Super+/', 'F1']

function registerFixedTerminalHotkeys(): void {
  for (const hotkey of FIXED_TERMINAL_HOTKEYS) {
    try {
      if (!globalShortcut.register(hotkey, () => toggleTerminal())) {
        console.error(`Failed to register fixed terminal hotkey: ${hotkey}`)
      }
    } catch (err) {
      console.error(`Invalid fixed terminal hotkey accelerator: ${hotkey}`, err)
    }
  }
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
  ipcMain.handle(
    'execute-command',
    async (event, command: CommandName, item: SearchResultItem, query: string): Promise<string | null> => {
      try {
        await execute(command, item, query)
        // Only the popup hides itself on success — the bar window handles "clear and
        // return to idle" itself (see CommandPalette's bar-mode handleExecuteResult),
        // since it's meant to stay visible.
        const win = BrowserWindow.fromWebContents(event.sender)
        if (win && !isBarWindow(win)) win.hide()
        return null
      } catch (err) {
        // Surface the failure to the renderer instead of leaving an unhandled rejection —
        // the window stays open (rather than hiding, as on success) so the user can see it.
        return err instanceof Error ? err.message : String(err)
      }
    }
  )
  ipcMain.handle('get-history', () => getHistory())
  // Sourced from the values actually registered (not a copy in the renderer) so the
  // tooltips can't drift from the real bindings — both are user-configurable (Settings).
  ipcMain.handle('get-hotkeys', () => ({
    palette: paletteHotkey.current() ?? readSettings().hotkey,
    terminal: terminalHotkey.current() ?? readSettings().terminalHotkey
  }))
  ipcMain.on('hide-palette', () => mainWindow?.hide())
  ipcMain.on('open-config-folder', () => shell.openPath(CONFIG_DIR))
  ipcMain.handle('config-get-entries', (_event, type: ConfigType) => getConfigEntries(type))
  ipcMain.handle('config-save-entry', (_event, type: ConfigType, entry: ConfigEntry, index: number | null) =>
    saveConfigEntry(type, entry, index)
  )
  ipcMain.handle('config-delete-entry', (_event, type: ConfigType, index: number) => deleteConfigEntry(type, index))
  ipcMain.handle('list-apps', () => listApps())
  ipcMain.handle('list-custom-commands', () => loadCustomCommands())
  registerTerminalIpc()
  registerBarIpc()
}

app.whenReady().then(() => {
  // Always dark, regardless of the Windows system theme setting.
  nativeTheme.themeSource = 'dark'
  ensureConfigDir()
  ensureCommandsDir()
  ensureGifDir()
  ensureLookupDir()
  registerIpcHandlers()
  mainWindow = createWindow()
  createBarWindow(appIcon)
  createTerminalWindow(appIcon)
  createTray()
  const initialSettings = readSettings()
  paletteHotkey.register(initialSettings.hotkey)
  terminalHotkey.register(initialSettings.terminalHotkey)
  registerFixedTerminalHotkeys()
  applyAutoStart(initialSettings.autoStart)
  setBarVisible(initialSettings.barEnabled)
  initSwap()

  screen.on('display-metrics-changed', () => repositionBarForDisplayChange())

  watchConfig(() => {
    mainWindow?.webContents.send('config-changed')
    sendToBar('config-changed')
  })

  watchSettings((settings) => {
    paletteHotkey.register(settings.hotkey)
    terminalHotkey.register(settings.terminalHotkey)
    applyAutoStart(settings.autoStart)
    setBarVisible(settings.barEnabled)
    if (settings.swapEnabled !== false) {
      startSwapServer(settings.swapPort)
    }
    mainWindow?.webContents.send('config-changed')
    sendToBar('config-changed')
  })

  watchCustomCommands(() => {
    mainWindow?.webContents.send('custom-commands-changed')
    sendToBar('custom-commands-changed')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
      createBarWindow(appIcon)
      createTerminalWindow(appIcon)
      setBarVisible(readSettings().barEnabled)
    }
  })
})

app.on('window-all-closed', () => {
  // Keep running in the tray; the palette window hides rather than closes.
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  killPty()
  shutdownSwap()
})
