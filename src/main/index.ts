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
  deleteConfigEntry,
  flushPendingConfigWrites
} from './config'
import { getHistory, deleteHistoryEntry, clearHistory } from './history'
import { search, execute, evaluateExpression, listApps } from './commands'
import { getAppIconPath } from './icon'
import { ensureCommandsDir, loadCustomCommands, watchCustomCommands } from './customCommands'
import { ensureGifDir } from './commands/gif'
import { ensureLookupDir } from './commands/lookup'
import {
  createTerminalWindow,
  registerTerminalIpc,
  toggleTerminal,
  repositionTerminal
} from './terminalWindow'
import { createNotificationWindow, registerNotificationIpc } from './notifyWindow'
import {
  createShortcutsWindow,
  repositionShortcuts,
  toggleShortcutsWindow
} from './shortcutsWindow'
import { registerShortcutsIpc } from './shortcutsManager'
import { killPty } from './terminal'
import {
  createBarWindow,
  isBarWindow,
  setBarVisible,
  toggleBarActivation,
  registerBarIpc,
  repositionBarForDisplayChange,
  repositionBarForShelfIcons,
  sendToBar
} from './barWindow'
import {
  ensureCommandLayout,
  readCommandLayout,
  writeCommandLayout,
  watchCommandLayout,
  COMMAND_LAYOUT_PATH
} from './commandLayout'
import { initSwap, shutdownSwap, startSwapServer } from './swap/swapManager'
import { DockGeometry } from './dock/DockGeometry'
import { getDockDisplay } from './display'
import { dockManager } from './dock/DockManager'
import { registerFocusTimerIpc } from './focusTimer'
import { registerGitStatusIpc } from './gitStatus'
import { stopAllGitWatchers } from './gitWatcher'
import { registerWingetIpc } from './wingetManager'
import { registerSystemManagerIpc } from './systemManager'
import {
  initSchedulerDaemon,
  registerSchedulesIpc,
  stopAllScheduledJobs,
  syncCustomCommandSchedules
} from './schedulesManager'
import {
  executeProfileAction,
  listProfiles,
  switchProfile,
  createProfile,
  deleteProfile,
  listBackupArchives,
  restoreSpecificBackup
} from './commands/profile'
import type {
  CommandName,
  SearchResultItem,
  ConfigType,
  ConfigEntry,
  CommandLayout,
  ShelfModuleId,
  GrowOrigin
} from '../shared/types'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

const appIcon = nativeImage.createFromPath(getAppIconPath())

// Required on Windows for Notification toasts (used by custom commands) to be attributed
// to this app — with the right name/icon — instead of showing as a generic Electron toast.
app.setAppUserModelId('SudoLaunch')

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
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
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

let activeShelfMode: string | null = null
// Tracks the palette window's logical open/closed state now that the window itself stays
// permanently mapped (see closePaletteWindow) — mainWindow.isVisible() can't be used for
// this any more, since the window is never actually OS-hidden.
let paletteOpen = false

let paletteCollapseTimeout: NodeJS.Timeout | null = null

function closePaletteWindow(win: BrowserWindow): void {
  // Re-entrant guard: a toggle-off click on the shelf icon calls this directly, and that
  // same click can also cause mainWindow to lose OS focus a moment later, firing the
  // 'blur' handler which calls this again. Without this guard, the second call restarted
  // the collapse animation from scratch (sending a fresh palette-collapsing, resetting
  // growPhase back to 'collapsing' after the first run had already progressed toward
  // 'grow-out' completing) — visible as the panel snapping back to full size and
  // re-playing the shrink a second time.
  if (paletteCollapseTimeout) return

  // Cancel any in-flight OPEN handshake from revealPaletteWindow — a rapid double-click
  // on the same shelf icon opens it, then (before that open's palette-ready ack has even
  // arrived) immediately closes it again. Without this, the open's paletteReadyResolver
  // was still armed and could fire doShow() (opacity -> 1, focus, grow-in) moments after
  // this function had already dropped opacity and started the close — visibly flashing
  // the panel back open right after it had started closing.
  paletteReadyResolver = null

  const finishClose = (): void => {
    // Soft-hide: drop opacity and stop taking clicks, but never unmap the window itself.
    // Real hide()/showInactive() cycling was leaving Windows' DWM compositor showing a
    // stale frame of whatever panel was open right before the remap, for one frame, when
    // the window was shown again for the next panel — a compositor-level artifact that
    // opacity/timing changes on the Electron side couldn't reach. Keeping the window
    // always mapped and only ever toggling its opacity avoids that remap entirely.
    paletteOpen = false
    win.setOpacity(0)
    // { forward: true } so mouse-move events keep reaching whatever's underneath (e.g.
    // the dock's shelf icons) even while this window is topmost and mapped over that
    // area, instead of just being swallowed — plain ignoreMouseEvents(true) was
    // occasionally still capturing hover on the shelf icons underneath, causing two
    // icons to show a hover highlight at once.
    win.setIgnoreMouseEvents(true, { forward: true })
    activeShelfMode = null
    dockManager.notifyPanelCollapsed()
    dockManager.sendToBar('shelf-palette-active', false, null)
    // Tell the renderer it's now safe to reset its own state (clear the open panel,
    // blank the search input, etc.) — opacity is already 0 by this point, so that reset
    // paints invisibly. The renderer used to do this reset straight off the native
    // window `blur` event, but blur fires at the same instant as this function rather
    // than after it, so there was no ordering guarantee that opacity had already
    // dropped — the reset could (and did) paint while the window was still fully
    // opaque, which is what looked like the wrong page flashing on every panel switch.
    win.webContents.send('palette-hidden')
  }

  // Shrink back into the shelf icon before actually closing, matching the notification
  // window's open/close symmetry (see toggleNotificationWindow's notify-collapsing).
  // Skipped outside shelf mode, since the standalone popup/bar-mode paths don't have a
  // shelf icon to shrink back into.
  const settings = readSettings()
  if (settings.dockLayout === 'shelf' && paletteOpen && activeShelfMode) {
    const dockWin = dockManager.getBarWindow()
    const shelfBar =
      dockWin && !dockWin.isDestroyed() && dockWin.isVisible() ? dockWin.getBounds() : dockManager.getLastBarBounds()
    if (shelfBar) {
      const icon = DockGeometry.calculateShelfIconBounds(shelfBar, activeShelfMode as ShelfModuleId, settings.shelfIcons)
      const panel = win.getBounds()
      win.webContents.send('palette-collapsing', DockGeometry.calculateGrowOrigin(icon, panel))
      paletteCollapseTimeout = setTimeout(() => {
        paletteCollapseTimeout = null
        finishClose()
      }, 160)
      return
    }
  }

  finishClose()
}

function createWindow(): BrowserWindow {
  const win = createBaseWindow({
    x: 0,
    y: 0,
    width: DockGeometry.BAR_ACTIVE_SIZE.width,
    height: DockGeometry.BAR_ACTIVE_SIZE.height
  })
  win.setOpacity(0)
  win.setIgnoreMouseEvents(true, { forward: true })
  win.showInactive()
  win.on('blur', () => {
    if (paletteOpen) closePaletteWindow(win)
  })
  loadRenderer(win)
  return win
}

function centerOnActiveDisplay(win: BrowserWindow): void {
  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  const width = Math.min(DockGeometry.BAR_ACTIVE_SIZE.width, Math.max(480, display.workArea.width - 32))
  const height = Math.min(DockGeometry.BAR_ACTIVE_SIZE.height, Math.max(360, display.workArea.height - 80))
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2)
  const y = Math.round(display.workArea.y + (display.workArea.height - height) / 2)
  win.setBounds({ x, y, width, height })
}

let paletteReadyResolver: (() => void) | null = null

ipcMain.on('palette-ready', () => {
  if (paletteReadyResolver) {
    paletteReadyResolver()
    paletteReadyResolver = null
  }
})

function revealPaletteWindow(targetMode?: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return

  // Discard any resolver from a reveal that's being superseded by this one — it must NOT
  // be invoked: that would run the previous call's doShow() (opacity -> 1 for the OLD
  // mode) after this call has already sent palette-shown for the NEW mode but before the
  // new mode's flushSync has landed, which is exactly what showed the wrong panel/page
  // for a frame during rapid panel switches.
  paletteReadyResolver = null
  // Cancel any in-flight close animation from closePaletteWindow — reopening mid-collapse
  // must win outright, not race the collapse's finishClose() into hiding the window again.
  if (paletteCollapseTimeout) {
    clearTimeout(paletteCollapseTimeout)
    paletteCollapseTimeout = null
  }

  const wasOpen = paletteOpen
  // On a fresh open, drop opacity first — otherwise the old (stale/default) page stays
  // painted on screen for a frame while React processes the mode switch. The window
  // itself is never hidden/remapped here (see closePaletteWindow) — only opacity and
  // mouse-event passthrough change — which is what actually fixed the original
  // panel-switch flash: hide()/showInactive() cycling let Windows' DWM compositor show a
  // stale frame of the previous panel for one frame during the remap, regardless of what
  // opacity was set beforehand.
  //
  // On a page-to-page switch while already open (wasOpen), the window instead stays
  // visible throughout — the renderer's onPaletteShown runs its own fade-out/swap/fade-in
  // crossfade (see CommandPalette.tsx's pageFade) so switching between Git/Focus/etc.
  // doesn't cut instantly. That crossfade starts by fading the CURRENT (correct) content
  // to invisible before swapping it, so there's no gap where the wrong page could show —
  // the window-level opacity trick is only needed for the open/close cases, where what's
  // on screen before the swap isn't a page the user is deliberately looking at.
  if (!wasOpen) {
    mainWindow.setOpacity(0)
  }
  paletteOpen = true

  // Grow the window out of its shelf icon on a fresh open, same as the notification and
  // terminal windows (skipped when just switching pages while already open, which has
  // its own opacity-crossfade handling instead). Computed and sent together with
  // palette-shown below — NOT from inside doShow() — so the renderer's single flushSync
  // sets activeModuleView and growPhase:'pending' (which paints the content invisible via
  // CSS) in the same commit. Sending it separately from doShow() raced setOpacity(1):
  // main->renderer IPC delivery isn't synchronous with native window calls, so the window
  // could turn opaque before the renderer had processed the grow-origin message, showing
  // the panel at full size for a frame before it visibly reset to the icon-sized start of
  // the animation — the "full, minimized, full, then the animation plays" glitch.
  let growOriginForOpen: GrowOrigin | null = null
  if (!wasOpen) {
    const settings = readSettings()
    if (settings.dockLayout === 'shelf') {
      const dockWin = dockManager.getBarWindow()
      const shelfBar =
        dockWin && !dockWin.isDestroyed() && dockWin.isVisible() ? dockWin.getBounds() : dockManager.getLastBarBounds()
      if (shelfBar) {
        const iconTarget = (targetMode ?? 'bar') as ShelfModuleId
        const icon = DockGeometry.calculateShelfIconBounds(shelfBar, iconTarget, settings.shelfIcons)
        const panel = mainWindow.getBounds()
        growOriginForOpen = DockGeometry.calculateGrowOrigin(icon, panel)
      }
    }
  }

  const doShow = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.setIgnoreMouseEvents(false)
    mainWindow.focus()
    // BrowserWindow.focus() alone brings the native window to the foreground and
    // reports isFocused()=true, but doesn't always hand the renderer's WebContents
    // actual keyboard input focus — Chromium's own document.hasFocus() can stay false,
    // meaning keystrokes never reach the DOM even though document.activeElement is
    // already the input. webContents.focus() explicitly tells Chromium's input layer
    // to take focus, which is what document.hasFocus() and real typing depend on.
    mainWindow.webContents.focus()
    if (!wasOpen) {
      dockManager.notifyPanelExpanded()
      dockManager.sendToBar('shelf-palette-active', true, targetMode ?? 'bar')
    }
    mainWindow.setOpacity(1)
    mainWindow.webContents.send('palette-focused')
  }

  // Pre-inform the renderer so React sets up and renders the view synchronously before the window is made visible
  mainWindow.webContents.send('palette-shown', targetMode, growOriginForOpen)

  let timer: NodeJS.Timeout | null = null
  paletteReadyResolver = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    doShow()
  }

  // Safety fallback if the renderer doesn't acknowledge in time — a cold render of a
  // heavier panel (Git/Profile, spawning subprocesses, laying out fonts and
  // backdrop-filter for the first time) was measured taking 130ms+ end to end, so the
  // original 100ms fallback fired before the real ack and revealed a not-quite-painted
  // frame. 300ms gives headroom over that cold-path cost without leaving a genuinely
  // stuck renderer looking unresponsive.
  timer = setTimeout(() => {
    if (paletteReadyResolver) {
      paletteReadyResolver()
      paletteReadyResolver = null
    }
  }, 300)
}

function getPaletteSizeForMode(targetMode: string): { width: number; height: number } {
  if (targetMode === 'focus') return DockGeometry.FOCUS_PANEL_SIZE
  if (targetMode === 'system') return DockGeometry.SYSTEM_PANEL_SIZE
    if (targetMode === 'git') return DockGeometry.GIT_PANEL_SIZE
    if (targetMode === 'profile' || targetMode === 'settings') {
      return DockGeometry.MODULE_PANEL_SIZE
    }
    return DockGeometry.BAR_ACTIVE_SIZE
  }

  export function toggleShelfPalette(mode?: string): void {
    if (!mainWindow) return
    const targetMode = mode || 'bar'
    const targetSize = getPaletteSizeForMode(targetMode)
    const settings = readSettings()
    const dockWin = dockManager.getBarWindow()
    const dockBounds =
      dockWin && !dockWin.isDestroyed() && dockWin.isVisible()
        ? dockWin.getBounds()
        : dockManager.getLastBarBounds()

    const display = dockBounds
      ? screen.getDisplayNearestPoint({
        x: dockBounds.x + dockBounds.width / 2,
        y: dockBounds.y + dockBounds.height / 2
      })
      : getDockDisplay(settings.monitor)

    if (paletteOpen) {
      if (activeShelfMode === targetMode) {
        closePaletteWindow(mainWindow)
        return
      }
      activeShelfMode = targetMode
      mainWindow.setBounds(
        DockGeometry.calculateShelfPaletteBounds(
          display.workArea,
          dockBounds,
          settings.shelfIcons?.length,
          targetSize.height,
          targetSize.width
        )
      )
      dockManager.sendToBar('shelf-palette-active', true, targetMode)
      revealPaletteWindow(targetMode)
      return
    }

    activeShelfMode = targetMode
    mainWindow.setBounds(
      DockGeometry.calculateShelfPaletteBounds(
        display.workArea,
        dockBounds,
        settings.shelfIcons?.length,
        targetSize.height,
        targetSize.width
      )
    )
    dockManager.sendToBar('shelf-palette-active', true, targetMode)
    revealPaletteWindow(targetMode)
  }

  ipcMain.on('palette-set-module', (_event, mode?: string) => {
    if (!mainWindow || mainWindow.isDestroyed() || !paletteOpen) return
    const targetMode = mode || 'bar'
    if (activeShelfMode === targetMode) return
    activeShelfMode = targetMode
    const targetSize = getPaletteSizeForMode(targetMode)
    const settings = readSettings()
    const dockWin = dockManager.getBarWindow()
    const dockBounds =
      dockWin && !dockWin.isDestroyed() && dockWin.isVisible()
        ? dockWin.getBounds()
        : dockManager.getLastBarBounds()

    const display = dockBounds
      ? screen.getDisplayNearestPoint({
        x: dockBounds.x + dockBounds.width / 2,
        y: dockBounds.y + dockBounds.height / 2
      })
      : getDockDisplay(settings.monitor)

    mainWindow.setBounds(
      DockGeometry.calculateShelfPaletteBounds(
        display.workArea,
        dockBounds,
        settings.shelfIcons?.length,
        targetSize.height,
        targetSize.width
      )
    )
    dockManager.sendToBar('shelf-palette-active', true, targetMode)
  })

  // The hotkey's job is to get a query input in front of the user as fast as possible — when
  // the persistent bar is around, that means activating *it* rather than spawning a second,
  // separate window. The standalone popup only comes into play as a fallback for when the
  // bar's been turned off (via "/view").
  function togglePalette(): void {
    const settings = readSettings()
    if ((settings.dockLayout === 'shelf' || settings.dockLayout === 'circle') && settings.barEnabled) {
      toggleShelfPalette('bar')
      return
    }
    if (toggleBarActivation()) return
    if (!mainWindow) return
    if (paletteOpen) {
      closePaletteWindow(mainWindow)
      return
    }
    activeShelfMode = 'bar'
    centerOnActiveDisplay(mainWindow)
    revealPaletteWindow('bar')
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
      async (event, command: CommandName, item: SearchResultItem, query: string, elevated?: boolean): Promise<string | null> => {
        try {
          await execute(command, item, query, elevated)
          // Only the popup hides itself on success — the bar window handles "clear and
          // return to idle" itself (see CommandPalette's bar-mode handleExecuteResult),
          // since it's meant to stay visible.
          const win = BrowserWindow.fromWebContents(event.sender)
          // Must go through closePaletteWindow (opacity + setIgnoreMouseEvents), not a raw
          // win.hide() — the shelf palette window is now always kept mapped (see
          // closePaletteWindow's comment for why: hide()/showInactive() cycling caused
          // Windows' DWM compositor to flash stale frames during panel switches). A raw
          // hide() here genuinely unmapped the window while paletteOpen stayed true (since
          // closePaletteWindow's bookkeeping never ran), so the next click's doShow() call
          // set opacity/mouse-passthrough on a window Windows still considered hidden —
          // opacity changes don't remap a hidden window, only show()/showInactive() do —
          // leaving it stuck invisible until the app restarted. Reproduced by running a
          // "term"-type history entry, which resolves successfully and hits this path.
          if (win && win === mainWindow) {
            closePaletteWindow(win)
          } else if (win && !isBarWindow(win)) {
            win.hide()
          }
          return null
        } catch (err) {
          // Surface the failure to the renderer instead of leaving an unhandled rejection —
          // the window stays open (rather than hiding, as on success) so the user can see it.
          return err instanceof Error ? err.message : String(err)
        }
      }
    )
    ipcMain.handle('get-history', () => getHistory())
    ipcMain.handle('delete-history-entry', (_event, timestamp: string) => deleteHistoryEntry(timestamp))
    ipcMain.handle('clear-history', () => {
      clearHistory()
      return []
    })
    ipcMain.handle('dock-get-is-home', () => !dockManager.getIsSummonedAway())
    ipcMain.on('show-dock-context-menu', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const settings = readSettings()
      const menu = Menu.buildFromTemplate([
        {
          label: 'Open Command Palette',
          click: () => revealPaletteWindow()
        },
        {
          label: 'Open Terminal',
          click: () => toggleTerminal()
        },
        {
          label: 'Open Shortcuts Overlay',
          click: () => toggleShortcutsWindow()
        },
        {
          label: 'Settings',
          click: () => revealPaletteWindow('settings')
        },
        { type: 'separator' },
        {
          label: 'Reset Dock Position',
          click: () => dockManager.resetPositions()
        },
        {
          label: 'Auto-Return Home',
          type: 'checkbox',
          checked: settings.autoReturnHome !== false,
          click: (item) => {
            saveConfigEntry('settings', { autoReturnHome: item.checked }, 0)
          }
        },
        { type: 'separator' },
        {
          label: 'Exit SudoLaunch',
          click: () => app.quit()
        }
      ])
      if (win) menu.popup({ window: win })
    })
    // Sourced from the values actually registered (not a copy in the renderer) so the
    // tooltips can't drift from the real bindings — both are user-configurable (Settings).
    ipcMain.handle('get-hotkeys', () => ({
      palette: paletteHotkey.current() ?? readSettings().hotkey,
      terminal: terminalHotkey.current() ?? readSettings().terminalHotkey
    }))
    ipcMain.handle('get-settings', () => readSettings())
    ipcMain.on('renderer-error', (_event, message: string) => {
      console.error(`[renderer-error] ${message}`)
    })
    ipcMain.on('hide-palette', () => {
      if (mainWindow) closePaletteWindow(mainWindow)
    })
    ipcMain.on('open-config-folder', () => shell.openPath(CONFIG_DIR))
    ipcMain.handle('config-get-entries', (_event, type: ConfigType) => getConfigEntries(type))
    ipcMain.handle('config-save-entry', (_event, type: ConfigType, entry: ConfigEntry, index: number | null) =>
      saveConfigEntry(type, entry, index)
    )
    ipcMain.handle('config-delete-entry', (_event, type: ConfigType, index: number) => deleteConfigEntry(type, index))
    ipcMain.handle('list-apps', () => listApps())
    ipcMain.handle('list-custom-commands', () => loadCustomCommands())
    ipcMain.handle('get-command-layout', () => readCommandLayout())
    ipcMain.handle('save-command-layout', (_event, layout: CommandLayout) => writeCommandLayout(layout))
    ipcMain.on('open-command-layout-file', () => shell.openPath(COMMAND_LAYOUT_PATH))
    registerTerminalIpc()
    registerNotificationIpc()
    registerShortcutsIpc()
    registerBarIpc()
    registerFocusTimerIpc()
    registerGitStatusIpc()
    registerWingetIpc()
    registerSystemManagerIpc()
    registerSchedulesIpc()
    ipcMain.handle('profile-execute', (_event, action: string) => executeProfileAction(action))
    ipcMain.handle('profile-list', () => listProfiles())
    ipcMain.handle('profile-switch', (_event, id: string) => switchProfile(id))
    ipcMain.handle('profile-create', (_event, name: string, cloneCurrent?: boolean) => createProfile(name, cloneCurrent))
    ipcMain.handle('profile-delete', (_event, id: string) => deleteProfile(id))
    ipcMain.handle('profile-archives-list', () => listBackupArchives())
    ipcMain.handle('profile-archive-restore', (_event, filename: string) => restoreSpecificBackup(filename))
  }

  app.whenReady().then(() => {
    // Always dark, regardless of the Windows system theme setting.
    nativeTheme.themeSource = 'dark'
    ensureConfigDir()
    ensureCommandsDir()
    ensureCommandLayout()
    ensureGifDir()
    ensureLookupDir()
    registerIpcHandlers()
    mainWindow = createWindow()
    dockManager.registerShelfPaletteToggle((mode?: string) => toggleShelfPalette(mode))
    createBarWindow(appIcon)
    createTerminalWindow(appIcon)
    createNotificationWindow(appIcon)
    createShortcutsWindow(appIcon)
    createTray()
    const initialSettings = readSettings()
    paletteHotkey.register(initialSettings.hotkey)
    terminalHotkey.register(initialSettings.terminalHotkey)
    registerFixedTerminalHotkeys()
    globalShortcut.register('F9', () => toggleShelfPalette('git'))
    globalShortcut.register('F10', () => toggleShelfPalette('bar'))
    applyAutoStart(initialSettings.autoStart)
    setBarVisible(initialSettings.barEnabled)
    initSwap()
    initSchedulerDaemon()

    screen.on('display-metrics-changed', () => repositionBarForDisplayChange())

    watchConfig(() => {
      mainWindow?.webContents.send('config-changed')
      dockManager.broadcast('config-changed')
    })

    let lastHotkey = initialSettings.hotkey
    let lastTerminalHotkey = initialSettings.terminalHotkey
    let lastAutoStart = initialSettings.autoStart
    let lastBarEnabled = initialSettings.barEnabled
    let lastSwapEnabled = initialSettings.swapEnabled !== false
    let lastSwapPort = initialSettings.swapPort
    let lastDockLayout = initialSettings.dockLayout ?? 'shelf'
    let lastHomePos = initialSettings.dockHomePosition ?? 'middle'
    let lastCustomCoords = JSON.stringify(initialSettings.dockHomeCustomCoordinates ?? { x: 50, y: 80 })
    let lastShelfIcons = JSON.stringify(initialSettings.shelfIcons ?? [])

    watchSettings((settings) => {
      if (settings.hotkey !== lastHotkey) {
        lastHotkey = settings.hotkey
        paletteHotkey.register(settings.hotkey)
      }
      if (settings.terminalHotkey !== lastTerminalHotkey) {
        lastTerminalHotkey = settings.terminalHotkey
        terminalHotkey.register(settings.terminalHotkey)
      }
      if (settings.autoStart !== lastAutoStart) {
        lastAutoStart = settings.autoStart
        applyAutoStart(settings.autoStart)
      }
      if (settings.barEnabled !== lastBarEnabled) {
        lastBarEnabled = settings.barEnabled
        setBarVisible(settings.barEnabled)
      }
      const currentSwapEnabled = settings.swapEnabled !== false
      if (
        currentSwapEnabled &&
        (currentSwapEnabled !== lastSwapEnabled || settings.swapPort !== lastSwapPort)
      ) {
        startSwapServer(settings.swapPort).catch((err) => console.error('[SwapServer] Failed to start:', err))
      }
      lastSwapEnabled = currentSwapEnabled
      lastSwapPort = settings.swapPort

      const currentLayout = settings.dockLayout ?? 'shelf'
      const currentHomePos = settings.dockHomePosition ?? 'middle'
      const currentCustomCoords = JSON.stringify(settings.dockHomeCustomCoordinates ?? { x: 50, y: 80 })
      const currentShelfIcons = JSON.stringify(settings.shelfIcons ?? [])

      const layoutChanged = currentLayout !== lastDockLayout
      const homePosChanged = currentHomePos !== lastHomePos || currentCustomCoords !== lastCustomCoords
      const shelfIconsChanged = currentShelfIcons !== lastShelfIcons

      lastDockLayout = currentLayout
      lastHomePos = currentHomePos
      lastCustomCoords = currentCustomCoords
      lastShelfIcons = currentShelfIcons

      if (layoutChanged) {
        dockManager.setLayout(currentLayout, false)
      } else if (homePosChanged) {
        dockManager.resetPositions()
      } else if (shelfIconsChanged) {
        repositionBarForShelfIcons()
        repositionBarForDisplayChange()
        repositionTerminal()
        repositionShortcuts()
      }

      mainWindow?.webContents.send('config-changed')
      dockManager.broadcast('config-changed')
    })

    watchCustomCommands(() => {
      syncCustomCommandSchedules()
      mainWindow?.webContents.send('custom-commands-changed')
      sendToBar('custom-commands-changed')
    })

    watchCommandLayout(() => {
      mainWindow?.webContents.send('command-layout-changed')
      sendToBar('command-layout-changed')
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow()
        createBarWindow(appIcon)
        createTerminalWindow(appIcon)
        createNotificationWindow(appIcon)
        createShortcutsWindow(appIcon)
        setBarVisible(readSettings().barEnabled)
      }
    })
  })

  app.on('window-all-closed', () => {
    // Keep running in the tray; the palette window hides rather than closes.
  })

  app.on('will-quit', () => {
    flushPendingConfigWrites()
    globalShortcut.unregisterAll()
    killPty()
    shutdownSwap()
    stopAllGitWatchers().catch(() => { })
    stopAllScheduledJobs().catch(() => { })
  })
