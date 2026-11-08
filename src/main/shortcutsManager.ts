import { app, ipcMain, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { CONFIG_DIR, readLinks, readSettings, writeSettings } from './config'

const execFileAsync = promisify(execFile)
import { loadCustomCommands } from './customCommands'
import { dockManager } from './dock/DockManager'
import { openTerminal, runInTerminal, toggleTerminal } from './terminalWindow'
import { toggleNotificationWindow } from './notifyWindow'
import {
  blurShortcutsWindow,
  hideShortcutsWindow,
  openShortcutsWindow,
  resizeShortcutsWindow,
  resolveShortcutsReady,
  toggleShortcutsWindow
} from './shortcutsWindow'
import type {
  DockerQuickContainer,
  ShortcutOverlayItem,
  ShortcutsOverlayData,
  ShortcutsOverlayTabInfo
} from '../shared/types'

const SHORTCUTS_CONFIG_PATH = join(CONFIG_DIR, 'shortcuts.json')

interface PersistedShortcutsConfig {
  customItems: ShortcutOverlayItem[]
  favoriteIds: string[]
  overrides: Record<string, Partial<ShortcutOverlayItem>>
  hiddenBuiltInIds: string[]
  customTabs: Array<{ id: string; label: string; icon: string }>
}

const DEFAULT_FAVORITE_IDS: string[] = [
  'pt-colorpicker',
  'pt-ocr',
  'win-snip',
  'win-clipboard',
  'pt-alwaysontop',
  'dev-sudolaunch-palette',
  'dev-sudolaunch-term',
  'dev-sudolaunch-system',
  'docker-ps'
]

function getPowerToysRoot(): string | null {
  const candidates = [
    'C:\\Program Files\\PowerToys',
    join(process.env.ProgramFiles ?? 'C:\\Program Files', 'PowerToys'),
    join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'PowerToys'),
    join(process.env.LOCALAPPDATA ?? '', 'PowerToys')
  ]
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

function resolvePowerToysExe(ptRoot: string | null, relExe: string): { fullPath: string; installed: boolean } {
  if (!ptRoot) return { fullPath: '', installed: false }
  const exeName = basename(relExe)
  const candidates = [
    join(ptRoot, relExe),
    join(ptRoot, 'WinUI3Apps', exeName),
    join(ptRoot, exeName),
    join(ptRoot, 'bin', exeName)
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return { fullPath: candidate, installed: true }
    }
  }
  // If the specific sub-exe moved in a future release, check if PowerToys.exe itself is installed
  const mainPtExe = join(ptRoot, 'PowerToys.exe')
  if (existsSync(mainPtExe)) {
    return { fullPath: join(ptRoot, relExe), installed: true }
  }
  return { fullPath: join(ptRoot, relExe), installed: false }
}

function getSendKeyPath(): string | null {
  const candidates = [
    process.resourcesPath ? join(process.resourcesPath, 'bin', 'sendkey.exe') : '',
    process.resourcesPath ? join(process.resourcesPath, 'resources', 'bin', 'sendkey.exe') : '',
    join(process.cwd(), 'resources', 'bin', 'sendkey.exe'),
    join(app ? app.getAppPath() : process.cwd(), 'resources', 'bin', 'sendkey.exe'),
    join(__dirname, '..', '..', 'resources', 'bin', 'sendkey.exe'),
    join(__dirname, '..', 'resources', 'bin', 'sendkey.exe')
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

const BUILTIN_POWERTOYS_ITEMS: Array<{
  id: string
  label: string
  icon: string
  keys: string
  relExe: string
  description: string
}> = [
  {
    id: 'pt-colorpicker',
    label: 'Color Picker',
    icon: '🎨',
    keys: 'Win+Shift+C',
    relExe: 'WinUI3Apps\\PowerToys.ColorPickerUI.exe',
    description: 'System-wide screen eyedropper with HEX, RGB, HSL, and CMYK copy'
  },
  {
    id: 'pt-ocr',
    label: 'Text Extractor (PowerOCR)',
    icon: '🔍',
    keys: 'Win+Shift+T',
    relExe: 'WinUI3Apps\\PowerToys.PowerOCR.exe',
    description: 'OCR region capture to copy unselectable text from any image or video'
  },
  {
    id: 'pt-ruler',
    label: 'Screen Ruler',
    icon: '📏',
    keys: 'Win+Shift+M',
    relExe: 'WinUI3Apps\\PowerToys.MeasureToolUI.exe',
    description: 'On-screen pixel measurement tool for bounding boxes and spacing'
  },
  {
    id: 'pt-fancyzones',
    label: 'FancyZones Layout Editor',
    icon: '🪟',
    keys: 'Win+Shift+~',
    relExe: 'PowerToys.FancyZonesEditor.exe',
    description: 'Design custom desktop snap grid layouts and multi-monitor zones'
  },
  {
    id: 'pt-advancedpaste',
    label: 'Advanced Paste',
    icon: '📋',
    keys: 'Win+Shift+V',
    relExe: 'WinUI3Apps\\PowerToys.AdvancedPaste.exe',
    description: 'Paste clipboard as plain text, JSON, Markdown, or transform formats'
  },
  {
    id: 'pt-alwaysontop',
    label: 'Always on Top',
    icon: '📌',
    keys: 'Win+Ctrl+T',
    relExe: 'PowerToys.AlwaysOnTop.exe',
    description: 'Pin or unpin the active window to stay above all other desktop windows'
  },
  {
    id: 'pt-cropandlock',
    label: 'Crop and Lock (Thumbnail)',
    icon: '✂️',
    keys: 'Win+Ctrl+Shift+T',
    relExe: 'PowerToys.CropAndLock.exe',
    description: 'Crop an application region into a live floating picture-in-picture window'
  },
  {
    id: 'pt-mousejump',
    label: 'Mouse Jump',
    icon: '🖱️',
    keys: 'Win+Shift+D',
    relExe: 'WinUI3Apps\\PowerToys.MouseJump.WinUI3.exe',
    description: 'Teleport mouse cursor across ultra-wide and multi-monitor setups'
  },
  {
    id: 'pt-workspaces',
    label: 'Workspaces Editor',
    icon: '🗂️',
    keys: 'Win+Ctrl+~',
    relExe: 'PowerToys.WorkspacesEditor.exe',
    description: 'Capture and launch multi-app desktop window arrangements with one click'
  },
  {
    id: 'pt-peek',
    label: 'Peek (Quick Look)',
    icon: '👁️',
    keys: 'Ctrl+Space',
    relExe: 'WinUI3Apps\\PowerToys.Peek.UI.exe',
    description: 'Instant file preview in File Explorer without launching full apps'
  },
  {
    id: 'pt-zoomit',
    label: 'ZoomIt (Magnify & Annotate)',
    icon: '🔎',
    keys: 'Ctrl+1',
    relExe: 'PowerToys.ZoomIt.exe',
    description: 'Screen zoom magnification, live screen drawing, and presentation timer'
  },
  {
    id: 'pt-shortcutguide',
    label: 'Windows Shortcut Guide',
    icon: '🗺️',
    keys: 'Win+Shift+/',
    relExe: 'WinUI3Apps\\PowerToys.ShortcutGuide.exe',
    description: 'Full-screen overlay displaying Windows key shortcuts for the desktop'
  },
  {
    id: 'pt-hosts',
    label: 'PowerToys Hosts File Editor',
    icon: '📝',
    keys: 'Launch UI',
    relExe: 'WinUI3Apps\\PowerToys.Hosts.exe',
    description: 'Visual Windows hosts file editor with domain filtering'
  },
  {
    id: 'pt-env',
    label: 'PowerToys Environment Variables',
    icon: '🌱',
    keys: 'Launch UI',
    relExe: 'WinUI3Apps\\PowerToys.EnvironmentVariables.exe',
    description: 'Visual manager for User and System environment variables and profiles'
  },
  {
    id: 'pt-locksmith',
    label: 'File Locksmith',
    icon: '🔓',
    keys: 'Launch UI',
    relExe: 'WinUI3Apps\\PowerToys.FileLocksmithUI.exe',
    description: 'Inspect and terminate processes locking a file or folder'
  },
  {
    id: 'pt-awake',
    label: 'Awake (Keep PC Awake)',
    icon: '☕',
    keys: 'Launch UI',
    relExe: 'PowerToys.Awake.exe',
    description: 'Keep workstation awake on demand without changing Windows power plans'
  },
  {
    id: 'pt-powerrename',
    label: 'PowerRename',
    icon: '🏷️',
    keys: 'Launch UI',
    relExe: 'WinUI3Apps\\PowerToys.PowerRename.exe',
    description: 'Bulk regex file renaming utility with live preview'
  },
  {
    id: 'pt-regpreview',
    label: 'Registry Preview',
    icon: '🧩',
    keys: 'Launch UI',
    relExe: 'WinUI3Apps\\PowerToys.RegistryPreview.exe',
    description: 'Inspect, preview, and edit Windows Registry .reg files safely'
  },
  {
    id: 'pt-kbdmanager',
    label: 'Keyboard Manager',
    icon: '⌨️',
    keys: 'Launch UI',
    relExe: 'WinUI3Apps\\PowerToys.KeyboardManagerEditorUI.exe',
    description: 'Remap individual keys and global keyboard shortcuts across Windows'
  },
  {
    id: 'pt-settings',
    label: 'PowerToys Settings Dashboard',
    icon: '⚙️',
    keys: 'Launch UI',
    relExe: 'WinUI3Apps\\PowerToys.Settings.exe',
    description: 'Open main Microsoft PowerToys configuration dashboard'
  }
]

const BUILTIN_OTHER_ITEMS: ShortcutOverlayItem[] = [
  // Docker Tab
  {
    id: 'docker-ps',
    label: 'List All Containers (docker ps -a)',
    description: 'Show all running and stopped containers with ports and status in Terminal',
    tab: 'docker',
    icon: '🐳',
    keys: 'Alt+D P',
    actionType: 'terminal',
    actionPayload: 'docker ps -a',
    isBuiltIn: true
  },
  {
    id: 'docker-stats',
    label: 'Live Resource Stream (docker stats)',
    description: 'Stream live container CPU, Memory, Network, and Block I/O metrics in Terminal',
    tab: 'docker',
    icon: '📊',
    keys: 'Alt+D S',
    actionType: 'terminal',
    actionPayload: 'docker stats',
    isBuiltIn: true
  },
  {
    id: 'docker-compose-up',
    label: 'Compose Up Detached (docker compose up -d)',
    description: 'Build and start the current directory Docker Compose stack in background',
    tab: 'docker',
    icon: '🚀',
    keys: 'Alt+D U',
    actionType: 'terminal',
    actionPayload: 'docker compose up -d',
    isBuiltIn: true
  },
  {
    id: 'docker-compose-build',
    label: 'Compose Rebuild & Up (docker compose up -d --build)',
    description: 'Force image rebuild and recreate containers for the active Compose stack',
    tab: 'docker',
    icon: '🔨',
    keys: 'Alt+D B',
    actionType: 'terminal',
    actionPayload: 'docker compose up -d --build',
    isBuiltIn: true
  },
  {
    id: 'docker-compose-down',
    label: 'Compose Down (docker compose down)',
    description: 'Stop and remove containers and networks for the active Compose stack',
    tab: 'docker',
    icon: '⏹️',
    keys: 'Alt+D N',
    actionType: 'terminal',
    actionPayload: 'docker compose down',
    isBuiltIn: true
  },
  {
    id: 'docker-compose-down-vol',
    label: 'Compose Down + Volumes (docker compose down -v)',
    description: 'Tear down the active Compose stack including named and anonymous volumes',
    tab: 'docker',
    icon: '🧨',
    keys: 'Alt+D V',
    actionType: 'terminal',
    actionPayload: 'docker compose down -v',
    isBuiltIn: true
  },
  {
    id: 'docker-compose-restart',
    label: 'Compose Restart Services (docker compose restart)',
    description: 'Restart all service containers in the current Docker Compose stack',
    tab: 'docker',
    icon: '🔄',
    keys: 'Alt+D R',
    actionType: 'terminal',
    actionPayload: 'docker compose restart',
    isBuiltIn: true
  },
  {
    id: 'docker-compose-ps',
    label: 'Compose Stack Status (docker compose ps)',
    description: 'Inspect service states and port bindings for the current Compose project',
    tab: 'docker',
    icon: '📋',
    keys: 'Alt+D C',
    actionType: 'terminal',
    actionPayload: 'docker compose ps',
    isBuiltIn: true
  },
  {
    id: 'docker-compose-logs',
    label: 'Tail Compose Logs (docker compose logs -f)',
    description: 'Follow real-time logs across all services in the active Compose stack',
    tab: 'docker',
    icon: '📜',
    keys: 'Alt+D L',
    actionType: 'terminal',
    actionPayload: 'docker compose logs -f --tail=100',
    isBuiltIn: true
  },
  {
    id: 'docker-compose-pull',
    label: 'Compose Pull Latest Images (docker compose pull)',
    description: 'Pull updated upstream service images defined in docker-compose.yml',
    tab: 'docker',
    icon: '⬇️',
    keys: 'Alt+D G',
    actionType: 'terminal',
    actionPayload: 'docker compose pull',
    isBuiltIn: true
  },
  {
    id: 'docker-images',
    label: 'List Local Images (docker images)',
    description: 'Display locally cached Docker images, tags, IDs, and disk sizes',
    tab: 'docker',
    icon: '📦',
    keys: 'Alt+D I',
    actionType: 'terminal',
    actionPayload: 'docker images',
    isBuiltIn: true
  },
  {
    id: 'docker-volumes',
    label: 'List Docker Volumes (docker volume ls)',
    description: 'Inspect persistent Docker volumes across local projects',
    tab: 'docker',
    icon: '🗄️',
    keys: 'Alt+D M',
    actionType: 'terminal',
    actionPayload: 'docker volume ls',
    isBuiltIn: true
  },
  {
    id: 'docker-networks',
    label: 'List Docker Networks (docker network ls)',
    description: 'Show bridge, host, and custom Compose overlay networks',
    tab: 'docker',
    icon: '🌐',
    keys: 'Alt+D W',
    actionType: 'terminal',
    actionPayload: 'docker network ls',
    isBuiltIn: true
  },
  {
    id: 'docker-events',
    label: 'Stream Daemon Events (docker events)',
    description: 'Watch real-time container start, die, healthcheck, and network events',
    tab: 'docker',
    icon: '📡',
    keys: 'Alt+D E',
    actionType: 'terminal',
    actionPayload: 'docker events',
    isBuiltIn: true
  },
  {
    id: 'docker-stop-all',
    label: 'Stop All Running Containers',
    description: 'Gracefully stop every currently running Docker container on the host',
    tab: 'docker',
    icon: '🛑',
    keys: 'Alt+D Q',
    actionType: 'terminal',
    actionPayload: 'docker ps -q | ForEach-Object { docker stop $_ }',
    isBuiltIn: true
  },
  {
    id: 'docker-df',
    label: 'Inspect Docker Disk Usage (docker system df)',
    description: 'Show space used by images, containers, local volumes, and build cache',
    tab: 'docker',
    icon: '💾',
    keys: 'Alt+D F',
    actionType: 'terminal',
    actionPayload: 'docker system df -v',
    isBuiltIn: true
  },
  {
    id: 'docker-builder-prune',
    label: 'Prune BuildKit Cache (docker builder prune -f)',
    description: 'Clear dangling Docker BuildKit layer cache to reclaim disk space',
    tab: 'docker',
    icon: '🧱',
    keys: 'Alt+D K',
    actionType: 'terminal',
    actionPayload: 'docker builder prune -f',
    isBuiltIn: true
  },
  {
    id: 'docker-prune',
    label: 'Prune Stopped & Dangling (docker system prune -f)',
    description: 'Reclaim disk space by removing stopped containers, unused networks, and dangling images',
    tab: 'docker',
    icon: '🧹',
    keys: 'Alt+D X',
    actionType: 'terminal',
    actionPayload: 'docker system prune -f',
    isBuiltIn: true
  },
  {
    id: 'docker-desktop',
    label: 'Launch Docker Desktop GUI',
    description: 'Open the Docker Desktop dashboard application',
    tab: 'docker',
    icon: '🖥️',
    keys: 'Ctrl+Shift+D',
    actionType: 'open',
    actionPayload: 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
    isBuiltIn: true
  },

  // Windows & Desktop Tab
  {
    id: 'win-snip',
    label: 'Screen Snipping Tool Overlay',
    description: 'Capture rectangular, freeform, window, or full-screen screenshots to clipboard',
    tab: 'windows',
    icon: '✂️',
    keys: 'Win+Shift+S',
    actionType: 'hotkey',
    actionPayload: 'Win+Shift+S',
    isBuiltIn: true
  },
  {
    id: 'win-clipboard',
    label: 'Windows Clipboard History',
    description: 'Open multi-item Windows clipboard history and pinned clips popup',
    tab: 'windows',
    icon: '📎',
    keys: 'Win+V',
    actionType: 'hotkey',
    actionPayload: 'Win+V',
    isBuiltIn: true
  },
  {
    id: 'win-emoji',
    label: 'Emoji, GIF & Symbol Picker',
    description: 'Open native Windows emoji, kaomoji, and special characters panel',
    tab: 'windows',
    icon: '😀',
    keys: 'Win+.',
    actionType: 'hotkey',
    actionPayload: 'Win+.',
    isBuiltIn: true
  },
  {
    id: 'win-taskmgr',
    label: 'Windows Task Manager',
    description: 'Open Task Manager directly to inspect processes, performance, and startup',
    tab: 'windows',
    icon: '📊',
    keys: 'Ctrl+Shift+Esc',
    actionType: 'open',
    actionPayload: 'taskmgr.exe',
    isBuiltIn: true
  },
  {
    id: 'win-vdesktop-new',
    label: 'Create New Virtual Desktop',
    description: 'Spawn a clean Windows Virtual Desktop workspace immediately',
    tab: 'windows',
    icon: '➕',
    keys: 'Win+Ctrl+D',
    actionType: 'hotkey',
    actionPayload: 'Win+Ctrl+D',
    isBuiltIn: true
  },
  {
    id: 'win-vdesktop-left',
    label: 'Switch Virtual Desktop Left',
    description: 'Move to the previous Virtual Desktop on the left',
    tab: 'windows',
    icon: '⬅️',
    keys: 'Win+Ctrl+Left',
    actionType: 'hotkey',
    actionPayload: 'Win+Ctrl+Left',
    isBuiltIn: true
  },
  {
    id: 'win-vdesktop-right',
    label: 'Switch Virtual Desktop Right',
    description: 'Move to the next Virtual Desktop on the right',
    tab: 'windows',
    icon: '➡️',
    keys: 'Win+Ctrl+Right',
    actionType: 'hotkey',
    actionPayload: 'Win+Ctrl+Right',
    isBuiltIn: true
  },
  {
    id: 'win-vdesktop-close',
    label: 'Close Current Virtual Desktop',
    description: 'Close the active Virtual Desktop and merge windows back',
    tab: 'windows',
    icon: '✖️',
    keys: 'Win+Ctrl+F4',
    actionType: 'hotkey',
    actionPayload: 'Win+Ctrl+F4',
    isBuiltIn: true
  },
  {
    id: 'win-taskview',
    label: 'Task View & Virtual Desktops Overview',
    description: 'Show all open windows and virtual desktop switcher',
    tab: 'windows',
    icon: '🪟',
    keys: 'Win+Tab',
    actionType: 'hotkey',
    actionPayload: 'Win+Tab',
    isBuiltIn: true
  },
  {
    id: 'win-snap-left',
    label: 'Snap Active Window Left',
    description: 'Dock the currently focused application window to the left half of screen',
    tab: 'windows',
    icon: '◧',
    keys: 'Win+Left',
    actionType: 'hotkey',
    actionPayload: 'Win+Left',
    isBuiltIn: true
  },
  {
    id: 'win-snap-right',
    label: 'Snap Active Window Right',
    description: 'Dock the currently focused application window to the right half of screen',
    tab: 'windows',
    icon: '◨',
    keys: 'Win+Right',
    actionType: 'hotkey',
    actionPayload: 'Win+Right',
    isBuiltIn: true
  },
  {
    id: 'win-power-menu',
    label: 'Quick Link Power User Menu',
    description: 'Open Win+X admin menu (Device Manager, Disk Management, Terminal, Event Viewer)',
    tab: 'windows',
    icon: '⚡',
    keys: 'Win+X',
    actionType: 'hotkey',
    actionPayload: 'Win+X',
    isBuiltIn: true
  },
  {
    id: 'win-settings',
    label: 'Windows System Settings',
    description: 'Open native Windows Settings (ms-settings:)',
    tab: 'windows',
    icon: '⚙️',
    keys: 'Win+I',
    actionType: 'open',
    actionPayload: 'ms-settings:',
    isBuiltIn: true
  },
  {
    id: 'win-explorer',
    label: 'Open File Explorer',
    description: 'Launch a new Windows File Explorer window',
    tab: 'windows',
    icon: '📁',
    keys: 'Win+E',
    actionType: 'open',
    actionPayload: 'explorer.exe',
    isBuiltIn: true
  },
  {
    id: 'win-gpu-reset',
    label: 'Restart Graphics Driver',
    description: 'Reload Windows display driver stack without closing open apps',
    tab: 'windows',
    icon: '🖥️',
    keys: 'Win+Ctrl+Shift+B',
    actionType: 'hotkey',
    actionPayload: 'Win+Ctrl+Shift+B',
    isBuiltIn: true
  },
  {
    id: 'win-lock',
    label: 'Lock Workstation',
    description: 'Immediately lock the Windows desktop session',
    tab: 'windows',
    icon: '🔒',
    keys: 'Win+L',
    actionType: 'powershell',
    actionPayload: 'rundll32.exe user32.dll,LockWorkStation',
    isBuiltIn: true
  },

  // Dev, Git & SudoLaunch Tab
  {
    id: 'dev-sudolaunch-palette',
    label: 'SudoLaunch Command Palette',
    description: 'Open the universal SudoLaunch command bar and search palette',
    tab: 'dev',
    icon: '⌘',
    keys: 'Ctrl+Space',
    actionType: 'sudolaunch',
    actionPayload: 'bar',
    isBuiltIn: true
  },
  {
    id: 'dev-sudolaunch-term',
    label: 'SudoLaunch PowerShell Terminal',
    description: 'Expand or collapse the persistent drop-down PowerShell 7 session',
    tab: 'dev',
    icon: '>_',
    keys: 'F1 / Ctrl+`',
    actionType: 'sudolaunch',
    actionPayload: 'term',
    isBuiltIn: true
  },
  {
    id: 'dev-sudolaunch-system',
    label: 'System Management Control Center',
    description: 'Open the 1040×720 System Management suite (WinGet, Runtimes, Services, Ports, Security)',
    tab: 'dev',
    icon: '🧰',
    keys: '/system',
    actionType: 'sudolaunch',
    actionPayload: 'system',
    isBuiltIn: true
  },
  {
    id: 'dev-sudolaunch-git',
    label: 'Git Repository & Branch Switcher',
    description: 'Open active Git repository status, dirty tree count, and branch switcher',
    tab: 'dev',
    icon: '🔀',
    keys: 'F9',
    actionType: 'sudolaunch',
    actionPayload: 'git',
    isBuiltIn: true
  },
  {
    id: 'dev-sudolaunch-focus',
    label: 'Focus & Pomodoro Timer',
    description: 'Open the Pomodoro countdown timer panel with 5m–60m presets',
    tab: 'dev',
    icon: '⏱️',
    keys: '/timer',
    actionType: 'sudolaunch',
    actionPayload: 'focus',
    isBuiltIn: true
  },
  {
    id: 'dev-vscode-palette',
    label: 'IDE: Show Command Palette',
    description: 'Send Ctrl+Shift+P to the active IDE / VS Code window',
    tab: 'dev',
    icon: '🧪',
    keys: 'Ctrl+Shift+P',
    actionType: 'hotkey',
    actionPayload: 'Ctrl+Shift+P',
    isBuiltIn: true
  },
  {
    id: 'dev-vscode-quickopen',
    label: 'IDE: Quick Open File by Name',
    description: 'Send Ctrl+P to jump to any file in the active IDE / editor',
    tab: 'dev',
    icon: '📄',
    keys: 'Ctrl+P',
    actionType: 'hotkey',
    actionPayload: 'Ctrl+P',
    isBuiltIn: true
  },
  {
    id: 'dev-vscode-term',
    label: 'IDE: Toggle Integrated Terminal',
    description: 'Send Ctrl+~ to toggle the integrated terminal in VS Code / Cursor',
    tab: 'dev',
    icon: '💻',
    keys: 'Ctrl+~',
    actionType: 'hotkey',
    actionPayload: 'Ctrl+~',
    isBuiltIn: true
  },
  {
    id: 'dev-vscode-format',
    label: 'IDE: Format Active Document',
    description: 'Send Shift+Alt+F to run the code formatter on the current editor file',
    tab: 'dev',
    icon: '✨',
    keys: 'Shift+Alt+F',
    actionType: 'hotkey',
    actionPayload: 'Shift+Alt+F',
    isBuiltIn: true
  },
  {
    id: 'dev-git-status',
    label: 'Git: Short Status & Branch (git status -sb)',
    description: 'Run git status -sb in the SudoLaunch PowerShell Terminal',
    tab: 'dev',
    icon: '🌿',
    keys: 'Alt+G S',
    actionType: 'terminal',
    actionPayload: 'git status -sb',
    isBuiltIn: true
  },
  {
    id: 'dev-git-log',
    label: 'Git: Visual Commit Graph (git log --oneline)',
    description: 'Display compact 20-commit branch graph in the PowerShell Terminal',
    tab: 'dev',
    icon: '📜',
    keys: 'Alt+G L',
    actionType: 'terminal',
    actionPayload: 'git log --oneline --graph --decorate -n 20',
    isBuiltIn: true
  },
  {
    id: 'dev-git-pull',
    label: 'Git: Pull with Rebase (git pull --rebase)',
    description: 'Fetch and rebase current branch cleanly in the PowerShell Terminal',
    tab: 'dev',
    icon: '⬇️',
    keys: 'Alt+G P',
    actionType: 'terminal',
    actionPayload: 'git pull --rebase',
    isBuiltIn: true
  },
  {
    id: 'dev-git-diff',
    label: 'Git: Working Tree Diff Stats (git diff --stat)',
    description: 'Show changed files and line insertion/deletion summary in Terminal',
    tab: 'dev',
    icon: '⇄',
    keys: 'Alt+G D',
    actionType: 'terminal',
    actionPayload: 'git diff --stat',
    isBuiltIn: true
  }
]

function readPersistedConfig(): PersistedShortcutsConfig {
  const fallback: PersistedShortcutsConfig = {
    customItems: [],
    favoriteIds: [...DEFAULT_FAVORITE_IDS],
    overrides: {},
    hiddenBuiltInIds: [],
    customTabs: []
  }

  try {
    if (!existsSync(SHORTCUTS_CONFIG_PATH)) {
      writeFileSync(SHORTCUTS_CONFIG_PATH, JSON.stringify(fallback, null, 2), 'utf-8')
      return fallback
    }
    const raw = JSON.parse(readFileSync(SHORTCUTS_CONFIG_PATH, 'utf-8').replace(/^\uFEFF/, ''))
    return {
      customItems: Array.isArray(raw.customItems) ? raw.customItems : [],
      favoriteIds: Array.isArray(raw.favoriteIds) ? raw.favoriteIds : [...DEFAULT_FAVORITE_IDS],
      overrides: raw.overrides && typeof raw.overrides === 'object' ? raw.overrides : {},
      hiddenBuiltInIds: Array.isArray(raw.hiddenBuiltInIds) ? raw.hiddenBuiltInIds : [],
      customTabs: Array.isArray(raw.customTabs) ? raw.customTabs : []
    }
  } catch {
    return fallback
  }
}

function writePersistedConfig(cfg: PersistedShortcutsConfig): void {
  try {
    writeFileSync(SHORTCUTS_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8')
  } catch {
    // ignore
  }
}

const DOCKER_CACHE_TTL_MS = 8000
let cachedDockerSnap: { available: boolean; containers: DockerQuickContainer[] } = {
  available: false,
  containers: []
}
let cachedDockerAt = 0

async function getDockerContainersSnapshot(options?: {
  force?: boolean
  skipProbe?: boolean
}): Promise<{ available: boolean; containers: DockerQuickContainer[] }> {
  if (options?.skipProbe && cachedDockerAt > 0) {
    return cachedDockerSnap
  }
  const now = Date.now()
  if (!options?.force && cachedDockerAt > 0 && now - cachedDockerAt < DOCKER_CACHE_TTL_MS) {
    return cachedDockerSnap
  }
  try {
    const { stdout: raw } = await execFileAsync(
      'docker',
      ['ps', '-a', '--format', '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'],
      {
        encoding: 'utf8',
        timeout: 2500,
        windowsHide: true
      }
    )
    const list: DockerQuickContainer[] = []
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const [id, name, image, status, ports] = trimmed.split('\t')
      if (id && name) {
        list.push({
          id,
          name,
          image: image || 'unknown',
          status: status || '',
          running: (status || '').toLowerCase().startsWith('up'),
          ports: ports || ''
        })
      }
    }
    cachedDockerSnap = { available: true, containers: list }
    cachedDockerAt = Date.now()
    return cachedDockerSnap
  } catch {
    cachedDockerSnap = { available: false, containers: [] }
    cachedDockerAt = Date.now()
    return cachedDockerSnap
  }
}

function buildShortcutsOverlayDataWithDocker(dockerSnap: {
  available: boolean
  containers: DockerQuickContainer[]
}): ShortcutsOverlayData {
  const cfg = readPersistedConfig()
  const settings = readSettings()
  const favSet = new Set(cfg.favoriteIds)
  const hiddenSet = new Set(cfg.hiddenBuiltInIds)
  const ptRoot = getPowerToysRoot()
  const powerToysInstalled = Boolean(ptRoot)

  const allItems: ShortcutOverlayItem[] = []

  // 1. PowerToys Built-in Items
  for (const pt of BUILTIN_POWERTOYS_ITEMS) {
    if (hiddenSet.has(pt.id)) continue
    const resolved = resolvePowerToysExe(ptRoot, pt.relExe)
    const fullExePath = resolved.fullPath
    const isInstalled = resolved.installed
    const cleanHotkey = pt.keys !== 'Launch UI' ? pt.keys : ''
    const baseItem: ShortcutOverlayItem = {
      id: pt.id,
      label: pt.label,
      description: pt.description,
      tab: 'powertoys',
      icon: pt.icon,
      keys: pt.keys,
      actionType: 'powertoys',
      actionPayload: `${fullExePath}::${cleanHotkey}`,
      isBuiltIn: true,
      installed: isInstalled,
      badge: isInstalled ? 'PowerToys' : 'Not Installed',
      favorite: favSet.has(pt.id)
    }
    const ov = cfg.overrides[pt.id]
    allItems.push(ov ? { ...baseItem, ...ov, favorite: favSet.has(pt.id) } : baseItem)
  }

  // 2. Other Built-in Items (Docker, Windows, Dev)
  for (const item of BUILTIN_OTHER_ITEMS) {
    if (hiddenSet.has(item.id)) continue
    const ov = cfg.overrides[item.id]
    const merged: ShortcutOverlayItem = ov
      ? { ...item, ...ov, favorite: favSet.has(item.id) }
      : { ...item, favorite: favSet.has(item.id) }
    allItems.push(merged)
  }

  // 3. User's Saved Links from /fav (shown in Favorites tab or Links)
  const savedLinks = readLinks()
  for (let i = 0; i < savedLinks.length; i++) {
    const link = savedLinks[i]
    const linkId = `fav-link-${i}-${link.name}`
    if (hiddenSet.has(linkId)) continue
    allItems.push({
      id: linkId,
      label: link.name,
      description: link.url,
      tab: 'favorites',
      icon: '🔗',
      keys: '/fav',
      actionType: 'open',
      actionPayload: link.url,
      isBuiltIn: true,
      favorite: true,
      badge: 'Saved Link'
    })
  }

  // 4. User's Custom PowerShell Commands from ~/.sudolaunch/commands/*.json
  try {
    const customCmds = loadCustomCommands()
    for (const cmd of customCmds) {
      const cmdId = `custom-cmd-${cmd.command}`
      if (hiddenSet.has(cmdId)) continue
      const ov = cfg.overrides[cmdId]
      const baseCmd: ShortcutOverlayItem = {
        id: cmdId,
        label: cmd.label || `/${cmd.command}`,
        description: cmd.action
          ? `PowerShell: ${cmd.action}`
          : `Script Folder: ~/.sudolaunch/${cmd.folder}`,
        tab: 'custom',
        icon: '⚡',
        keys: `/${cmd.command}`,
        actionType: cmd.showTerminal ? 'terminal' : 'powershell',
        actionPayload: cmd.action || `Set-Location "$HOME\\.sudolaunch\\${cmd.folder ?? ''}"`,
        isBuiltIn: true,
        favorite: favSet.has(cmdId),
        badge: 'Custom Cmd'
      }
      allItems.push(ov ? { ...baseCmd, ...ov, favorite: favSet.has(cmdId) } : baseCmd)
    }
  } catch {
    // ignore
  }

  // 5. User-Created Custom Shortcut Overlay Items
  for (const custom of cfg.customItems) {
    allItems.push({
      ...custom,
      isBuiltIn: false,
      favorite: favSet.has(custom.id) || Boolean(custom.favorite)
    })
  }

  // Build Tab Summary List
  const baseTabs: Array<{ id: string; label: string; icon: string; isCustomTab?: boolean }> = [
    { id: 'favorites', label: 'Favorites', icon: '⭐' },
    { id: 'powertoys', label: 'PowerToys', icon: '🧰' },
    { id: 'docker', label: 'Docker', icon: '🐳' },
    { id: 'windows', label: 'Windows', icon: '🪟' },
    { id: 'dev', label: 'Dev & Git', icon: '💻' },
    { id: 'custom', label: 'Custom', icon: '⚡' },
    ...cfg.customTabs.map((t) => ({ ...t, isCustomTab: true }))
  ]

  const tabs: ShortcutsOverlayTabInfo[] = baseTabs.map((t) => {
    const count =
      t.id === 'favorites'
        ? allItems.filter((i) => i.favorite || i.tab === 'favorites').length
        : allItems.filter((i) => i.tab.toLowerCase() === t.id.toLowerCase()).length
    return {
      ...t,
      count
    }
  })

  return {
    items: allItems,
    tabs,
    dockerContainers: dockerSnap.containers,
    dockerAvailable: dockerSnap.available,
    powerToysInstalled,
    stayOpen: settings.shortcutsStayOpen !== false,
    grayscale: Boolean(settings.shortcutsGrayscale),
    windowSize: settings.shortcutsWindowSize ?? { width: 1040, height: 720 }
  }
}

export function getShortcutsOverlayDataSync(): ShortcutsOverlayData {
  return buildShortcutsOverlayDataWithDocker(cachedDockerSnap)
}

export async function getShortcutsOverlayData(options?: {
  forceDocker?: boolean
  skipDockerProbe?: boolean
}): Promise<ShortcutsOverlayData> {
  const dockerSnap = await getDockerContainersSnapshot({
    force: options?.forceDocker,
    skipProbe: options?.skipDockerProbe
  })
  return buildShortcutsOverlayDataWithDocker(dockerSnap)
}

/**
 * Simulates a keyboard combination on Windows.
 * Uses native resources/bin/sendkey.exe when all tokens are supported by it,
 * or falls back to a fast P/Invoke keybd_event PowerShell call for punctuation/extended keys (e.g. Win+.).
 */
function simulateKeyCombination(rawCombo: string): void {
  const cleaned = rawCombo
    .split(/[,/]/)[0]
    .replace(/\([^)]*\)/g, '')
    .trim()
  if (!cleaned || cleaned.toLowerCase() === 'launch ui') return

  const parts = cleaned
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
  if (parts.length === 0) return

  const sendKeySupported = new Set([
    'win',
    'windows',
    'lwin',
    'rwin',
    'shift',
    'lshift',
    'rshift',
    'ctrl',
    'control',
    'lctrl',
    'rctrl',
    'alt',
    'menu',
    'space',
    'enter',
    'return',
    'esc',
    'escape',
    'tab',
    '~',
    'tilde',
    '`',
    '/',
    'slash',
    'f1',
    'f2',
    'f3',
    'f4',
    'f5',
    'f6',
    'f7',
    'f8',
    'f9',
    'f10',
    'f11',
    'f12',
    'up',
    'down',
    'left',
    'right',
    'backspace',
    'del',
    'delete'
  ])

  const allSupportedByExe = parts.every(
    (p) => sendKeySupported.has(p) || (/^[a-z0-9]$/.test(p) && p.length === 1)
  )

  const sendKeyPath = getSendKeyPath()
  if (allSupportedByExe && sendKeyPath) {
    try {
      spawn(sendKeyPath, [parts.join('+')], { detached: true, stdio: 'ignore' }).unref()
      return
    } catch {
      // fall through to P/Invoke fallback
    }
  }

  // Extended VK mapping for punctuation & navigation keys (e.g., Win+. -> 0x5B + 0xBE)
  const vkMap: Record<string, number> = {
    win: 0x5b,
    windows: 0x5b,
    lwin: 0x5b,
    rwin: 0x5c,
    ctrl: 0x11,
    control: 0x11,
    shift: 0x10,
    alt: 0x12,
    menu: 0x12,
    space: 0x20,
    enter: 0x0d,
    return: 0x0d,
    esc: 0x1b,
    escape: 0x1b,
    tab: 0x09,
    backspace: 0x08,
    del: 0x2e,
    delete: 0x2e,
    ins: 0x2d,
    insert: 0x2d,
    home: 0x24,
    end: 0x23,
    pgup: 0x21,
    pageup: 0x21,
    pgdn: 0x22,
    pagedown: 0x22,
    left: 0x25,
    up: 0x26,
    right: 0x27,
    down: 0x28,
    prtsc: 0x2c,
    printscreen: 0x2c,
    pause: 0x13,
    '.': 0xbe,
    period: 0xbe,
    ',': 0xbc,
    comma: 0xbc,
    ';': 0xba,
    semicolon: 0xba,
    '=': 0xbb,
    plus: 0xbb,
    '-': 0xbd,
    minus: 0xbd,
    '/': 0xbf,
    slash: 0xbf,
    '~': 0xc0,
    '`': 0xc0,
    '[': 0xdb,
    '\\': 0xdc,
    ']': 0xdd,
    "'": 0xde,
    f1: 0x70,
    f2: 0x71,
    f3: 0x72,
    f4: 0x73,
    f5: 0x74,
    f6: 0x75,
    f7: 0x76,
    f8: 0x77,
    f9: 0x78,
    f10: 0x79,
    f11: 0x7a,
    f12: 0x7b
  }

  const vks: number[] = []
  for (const p of parts) {
    if (vkMap[p] !== undefined) {
      vks.push(vkMap[p])
    } else if (/^[a-z0-9]$/.test(p)) {
      vks.push(p.toUpperCase().charCodeAt(0))
    }
  }
  if (vks.length === 0) return

  const downCalls = vks.map((vk) => `[K]::keybd_event(${vk},0,0,[UIntPtr]::Zero)`).join(';')
  const upCalls = [...vks]
    .reverse()
    .map((vk) => `[K]::keybd_event(${vk},0,2,[UIntPtr]::Zero)`)
    .join(';')
  const psScript = `Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);' -Name K -Namespace W; ${downCalls}; Start-Sleep -Milliseconds 15; ${upCalls}`
  const encoded = Buffer.from(psScript, 'utf16le').toString('base64')
  spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref()
}

export async function executeShortcutOverlayItem(
  item: ShortcutOverlayItem,
  elevated?: boolean
): Promise<{ ok: boolean; message: string }> {
  const settings = readSettings()
  const shouldAutoHide = settings.shortcutsStayOpen === false

  if (shouldAutoHide) {
    hideShortcutsWindow()
  }

  const useAdmin = Boolean(elevated || item.elevated)

  switch (item.actionType) {
    case 'hotkey': {
      // Yield focus from the Shortcuts Overlay window so the keystroke lands on the user's active window
      if (!shouldAutoHide) {
        blurShortcutsWindow()
      }
      setTimeout(() => {
        simulateKeyCombination(item.actionPayload || item.keys)
      }, 65)
      return { ok: true, message: `Sent shortcut ${item.keys || item.actionPayload}` }
    }

    case 'powertoys': {
      const [exePath, cleanHotkey] = (item.actionPayload || '').split('::')
      if (!shouldAutoHide) {
        blurShortcutsWindow()
      }

      // If this tool has a global hotkey AND PowerToys.exe is running, trigger its hotkey
      if (cleanHotkey && cleanHotkey !== 'Launch UI') {
        setTimeout(() => {
          simulateKeyCombination(cleanHotkey)
        }, 65)
        return { ok: true, message: `Triggered ${item.label} (${cleanHotkey})` }
      }

      if (exePath && existsSync(exePath)) {
        try {
          spawn(exePath, [], { detached: true, stdio: 'ignore' }).unref()
        } catch {
          await shell.openPath(exePath)
        }
        return { ok: true, message: `Launched ${item.label}` }
      }
      return {
        ok: false,
        message: 'PowerToys executable not found. Install via WinGet: Microsoft.PowerToys'
      }
    }

    case 'terminal': {
      openTerminal()
      setTimeout(() => {
        runInTerminal(item.actionPayload)
      }, 90)
      return { ok: true, message: `Ran in Terminal: ${item.actionPayload}` }
    }

    case 'powershell': {
      const encoded = Buffer.from(item.actionPayload, 'utf16le').toString('base64')
      if (useAdmin) {
        const elevateCmd = `Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile', '-NonInteractive', '-EncodedCommand', '${encoded}')`
        execFile(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', elevateCmd],
          { windowsHide: true }
        )
        return { ok: true, message: `Ran elevated PowerShell: ${item.label}` }
      } else {
        spawn(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
          { detached: true, stdio: 'ignore', windowsHide: true }
        ).unref()
        return { ok: true, message: `Executed: ${item.label}` }
      }
    }

    case 'open': {
      const target = item.actionPayload.trim()
      if (
        target.startsWith('http://') ||
        target.startsWith('https://') ||
        target.startsWith('ms-settings:') ||
        target.startsWith('mailto:')
      ) {
        await shell.openExternal(target)
        return { ok: true, message: `Opened ${item.label}` }
      }
      try {
        const openErr = await shell.openPath(target)
        if (openErr) {
          spawn(target, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref()
        }
      } catch {
        await shell.openPath(target)
      }
      return { ok: true, message: `Launched ${item.label}` }
    }

    case 'sudolaunch': {
      const mod = item.actionPayload.trim().toLowerCase()
      if (mod === 'term' || mod === 'terminal') {
        toggleTerminal()
      } else if (mod === 'notify' || mod === 'notifications') {
        toggleNotificationWindow()
      } else {
        dockManager.toggleShelfPalette(mod || 'bar')
      }
      return { ok: true, message: `Opened SudoLaunch: ${item.label}` }
    }

    default:
      return { ok: false, message: 'Unknown shortcut action type' }
  }
}

export async function toggleShortcutFavorite(id: string): Promise<ShortcutsOverlayData> {
  const cfg = readPersistedConfig()
  const idx = cfg.favoriteIds.indexOf(id)
  if (idx !== -1) {
    cfg.favoriteIds.splice(idx, 1)
  } else {
    cfg.favoriteIds.push(id)
  }
  writePersistedConfig(cfg)
  return getShortcutsOverlayData({ skipDockerProbe: true })
}

export async function saveShortcutOverlayItem(item: ShortcutOverlayItem): Promise<ShortcutsOverlayData> {
  const cfg = readPersistedConfig()
  const isBuiltIn =
    BUILTIN_POWERTOYS_ITEMS.some((p) => p.id === item.id) ||
    BUILTIN_OTHER_ITEMS.some((b) => b.id === item.id) ||
    item.id.startsWith('custom-cmd-')

  if (item.favorite && !cfg.favoriteIds.includes(item.id)) {
    cfg.favoriteIds.push(item.id)
  } else if (item.favorite === false) {
    cfg.favoriteIds = cfg.favoriteIds.filter((fid) => fid !== item.id)
  }

  if (isBuiltIn) {
    cfg.overrides[item.id] = {
      label: item.label,
      description: item.description,
      tab: item.tab,
      icon: item.icon,
      keys: item.keys,
      actionType: item.actionType,
      actionPayload: item.actionPayload,
      elevated: item.elevated
    }
  } else {
    const existingIdx = cfg.customItems.findIndex((c) => c.id === item.id)
    const cleanItem: ShortcutOverlayItem = {
      id: item.id || `sc-${Date.now()}`,
      label: item.label.trim(),
      description: item.description.trim(),
      tab: item.tab.trim().toLowerCase() || 'custom',
      icon: item.icon.trim() || '⚡',
      keys: item.keys.trim(),
      actionType: item.actionType,
      actionPayload: item.actionPayload.trim(),
      elevated: Boolean(item.elevated),
      favorite: Boolean(item.favorite),
      isBuiltIn: false
    }
    if (existingIdx !== -1) {
      cfg.customItems[existingIdx] = cleanItem
    } else {
      cfg.customItems.push(cleanItem)
    }

    // Ensure custom tab exists if user typed a new tab ID
    const knownTabs = new Set([
      'favorites',
      'powertoys',
      'docker',
      'windows',
      'dev',
      'custom',
      ...cfg.customTabs.map((t) => t.id.toLowerCase())
    ])
    if (!knownTabs.has(cleanItem.tab.toLowerCase())) {
      cfg.customTabs.push({
        id: cleanItem.tab.toLowerCase(),
        label: cleanItem.tab.charAt(0).toUpperCase() + cleanItem.tab.slice(1),
        icon: '🗂️'
      })
    }
  }

  writePersistedConfig(cfg)
  return getShortcutsOverlayData({ skipDockerProbe: true })
}

export async function deleteShortcutOverlayItem(id: string): Promise<ShortcutsOverlayData> {
  const cfg = readPersistedConfig()
  cfg.favoriteIds = cfg.favoriteIds.filter((fid) => fid !== id)
  const customIdx = cfg.customItems.findIndex((c) => c.id === id)
  if (customIdx !== -1) {
    cfg.customItems.splice(customIdx, 1)
  } else {
    if (!cfg.hiddenBuiltInIds.includes(id)) {
      cfg.hiddenBuiltInIds.push(id)
    }
  }
  writePersistedConfig(cfg)
  return getShortcutsOverlayData({ skipDockerProbe: true })
}

export async function addShortcutCustomTab(label: string, icon?: string): Promise<ShortcutsOverlayData> {
  const cfg = readPersistedConfig()
  const cleanLabel = label.trim()
  if (!cleanLabel) return getShortcutsOverlayData({ skipDockerProbe: true })
  const id = cleanLabel.toLowerCase().replace(/[^a-z0-9-_]/g, '-')
  if (!cfg.customTabs.some((t) => t.id === id)) {
    cfg.customTabs.push({
      id,
      label: cleanLabel,
      icon: icon?.trim() || '🗂️'
    })
    writePersistedConfig(cfg)
  }
  return getShortcutsOverlayData({ skipDockerProbe: true })
}

export async function deleteShortcutCustomTab(tabId: string): Promise<ShortcutsOverlayData> {
  const cfg = readPersistedConfig()
  cfg.customTabs = cfg.customTabs.filter((t) => t.id !== tabId)
  // Reassign any custom items in that tab to 'custom'
  for (const item of cfg.customItems) {
    if (item.tab.toLowerCase() === tabId.toLowerCase()) {
      item.tab = 'custom'
    }
  }
  writePersistedConfig(cfg)
  return getShortcutsOverlayData({ skipDockerProbe: true })
}

export async function restoreDefaultShortcuts(): Promise<ShortcutsOverlayData> {
  const cfg = readPersistedConfig()
  cfg.hiddenBuiltInIds = []
  cfg.overrides = {}
  writePersistedConfig(cfg)
  return getShortcutsOverlayData({ skipDockerProbe: true })
}

export async function runDockerQuickContainerAction(
  containerNameOrId: string,
  action: 'start' | 'stop' | 'restart' | 'shell' | 'logs' | 'inspect' | 'rm'
): Promise<{ ok: boolean; message: string; data: ShortcutsOverlayData }> {
  const safeTarget = containerNameOrId.replace(/[^a-zA-Z0-9_.-]/g, '')
  if (!safeTarget) {
    return {
      ok: false,
      message: 'Invalid container identifier',
      data: await getShortcutsOverlayData({ skipDockerProbe: true })
    }
  }

  if (action === 'shell') {
    openTerminal()
    setTimeout(() => {
      runInTerminal(`docker exec -it ${safeTarget} sh`)
    }, 90)
    return {
      ok: true,
      message: `Opened interactive shell in ${safeTarget}`,
      data: await getShortcutsOverlayData({ skipDockerProbe: true })
    }
  }

  if (action === 'logs') {
    openTerminal()
    setTimeout(() => {
      runInTerminal(`docker logs -f --tail=100 ${safeTarget}`)
    }, 90)
    return {
      ok: true,
      message: `Streaming logs for ${safeTarget} in Terminal`,
      data: await getShortcutsOverlayData({ skipDockerProbe: true })
    }
  }

  if (action === 'inspect') {
    openTerminal()
    setTimeout(() => {
      runInTerminal(`docker inspect ${safeTarget}`)
    }, 90)
    return {
      ok: true,
      message: `Inspecting container ${safeTarget} in Terminal`,
      data: await getShortcutsOverlayData({ skipDockerProbe: true })
    }
  }

  try {
    await execFileAsync('docker', [action, safeTarget], {
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true
    })
    return {
      ok: true,
      message: `Container ${safeTarget}: ${action} succeeded`,
      data: await getShortcutsOverlayData({ forceDocker: true })
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      data: await getShortcutsOverlayData({ forceDocker: true })
    }
  }
}

export function registerShortcutsIpc(): void {
  ipcMain.on('shortcuts-toggle', (_event, initialTab?: string) => toggleShortcutsWindow(initialTab))
  ipcMain.on('shortcuts-open', (_event, initialTab?: string) => openShortcutsWindow(initialTab))
  ipcMain.on('shortcuts-ready', () => resolveShortcutsReady())
  ipcMain.handle('shortcuts-get-data', () => getShortcutsOverlayData({ forceDocker: true }))
  ipcMain.handle(
    'shortcuts-execute',
    (_event, item: ShortcutOverlayItem, elevated?: boolean) =>
      executeShortcutOverlayItem(item, elevated)
  )
  ipcMain.handle('shortcuts-toggle-favorite', (_event, id: string) => toggleShortcutFavorite(id))
  ipcMain.handle('shortcuts-save-item', (_event, item: ShortcutOverlayItem) =>
    saveShortcutOverlayItem(item)
  )
  ipcMain.handle('shortcuts-delete-item', (_event, id: string) => deleteShortcutOverlayItem(id))
  ipcMain.handle('shortcuts-add-tab', (_event, label: string, icon?: string) =>
    addShortcutCustomTab(label, icon)
  )
  ipcMain.handle('shortcuts-delete-tab', (_event, tabId: string) => deleteShortcutCustomTab(tabId))
  ipcMain.handle('shortcuts-restore-defaults', () => restoreDefaultShortcuts())
  ipcMain.handle(
    'shortcuts-docker-action',
    (
      _event,
      containerNameOrId: string,
      action: 'start' | 'stop' | 'restart' | 'shell' | 'logs' | 'inspect' | 'rm'
    ) => runDockerQuickContainerAction(containerNameOrId, action)
  )
  ipcMain.handle('shortcuts-set-stay-open', (_event, stayOpen: boolean) => {
    const settings = readSettings()
    writeSettings({ ...settings, shortcutsStayOpen: stayOpen })
    return getShortcutsOverlayData({ skipDockerProbe: true })
  })
  ipcMain.handle('shortcuts-set-grayscale', (_event, grayscale: boolean) => {
    const settings = readSettings()
    writeSettings({ ...settings, shortcutsGrayscale: Boolean(grayscale) })
    return getShortcutsOverlayData({ skipDockerProbe: true })
  })
  ipcMain.handle('shortcuts-resize', (_event, width: number, height: number) => {
    resizeShortcutsWindow(width, height)
    return getShortcutsOverlayData({ skipDockerProbe: true })
  })
}

