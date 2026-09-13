import { app, clipboard, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import Fuse from 'fuse.js'
import type { SearchResultItem } from '../../shared/types'

interface PowerToyTool {
  id: string
  name: string
  hotkey?: string
  executableRelPath: string
  category: string
  description: string
  keywords: string[]
}

const POWER_TOYS_TOOLS: PowerToyTool[] = [
  {
    id: 'hosts',
    name: 'Hosts File Editor',
    executableRelPath: 'WinUI3Apps\\PowerToys.Hosts.exe',
    category: 'System & Network',
    description: 'Fast Windows hosts file editor with admin elevation and domain filtering',
    keywords: ['hosts', 'dns', 'domain', 'ip', 'localhost', 'network', 'redirect']
  },
  {
    id: 'env',
    name: 'Environment Variables',
    executableRelPath: 'WinUI3Apps\\PowerToys.EnvironmentVariables.exe',
    category: 'System & Config',
    description: 'Visual manager for user and system environment variables, profiles, and PATH',
    keywords: ['env', 'environment', 'path', 'variables', 'system', 'profile', 'config']
  },
  {
    id: 'reg',
    name: 'Registry Preview',
    executableRelPath: 'WinUI3Apps\\PowerToys.RegistryPreview.exe',
    category: 'System & Windows',
    description: 'Visual utility to inspect, preview, and edit complex Windows Registry .reg files',
    keywords: ['registry', 'reg', 'regedit', 'preview', 'keys', 'windows']
  },
  {
    id: 'colorpicker',
    name: 'Color Picker',
    hotkey: 'Win+Shift+C',
    executableRelPath: 'PowerToys.ColorPickerUI.exe',
    category: 'Design & Graphics',
    description: 'Quick screen eyedropper with HEX, RGB, CMYK, and HSL copy',
    keywords: ['color', 'picker', 'eyedropper', 'hex', 'rgb', 'screen', 'palette']
  },
  {
    id: 'ocr',
    name: 'Text Extractor (PowerOCR)',
    hotkey: 'Win+Shift+T',
    executableRelPath: 'PowerToys.PowerOCR.exe',
    category: 'Productivity & Text',
    description: 'Optical character recognition (OCR) tool to copy unselectable text from screen',
    keywords: ['ocr', 'text', 'extractor', 'screen', 'grab', 'copy text', 'image to text']
  },
  {
    id: 'ruler',
    name: 'Screen Ruler (Measure Tool)',
    hotkey: 'Win+Shift+M',
    executableRelPath: 'WinUI3Apps\\PowerToys.MeasureToolUI.exe',
    category: 'Design & Tools',
    description: 'Rapid on-screen pixel measurement tool for bounding boxes, edges, and distances',
    keywords: ['ruler', 'measure', 'pixels', 'dimensions', 'screen', 'box', 'spacing']
  },
  {
    id: 'fancyzones',
    name: 'FancyZones Layout Editor',
    hotkey: 'Win+Shift+~',
    executableRelPath: 'PowerToys.FancyZonesEditor.exe',
    category: 'Window Management',
    description: 'Custom desktop grid, zone, and snap layout designer for multi-tasking',
    keywords: ['zones', 'fancyzones', 'window', 'snap', 'layout', 'grid', 'screens']
  },
  {
    id: 'advancedpaste',
    name: 'Advanced Paste',
    hotkey: 'Win+Shift+V',
    executableRelPath: 'WinUI3Apps\\PowerToys.AdvancedPaste.exe',
    category: 'Clipboard & Text',
    description: 'Paste clipboard as plain text, JSON, markdown, or transform text formats',
    keywords: ['paste', 'plain text', 'advanced paste', 'format', 'json', 'markdown']
  },
  {
    id: 'locksmith',
    name: 'File Locksmith',
    executableRelPath: 'WinUI3Apps\\PowerToys.FileLocksmithUI.exe',
    category: 'System & Files',
    description: 'Identify and close processes that are locking a file or directory',
    keywords: ['locksmith', 'locked', 'file in use', 'handle', 'process', 'unlock']
  },
  {
    id: 'cropandlock',
    name: 'Crop and Lock',
    hotkey: 'Win+Ctrl+Shift+T / R',
    executableRelPath: 'PowerToys.CropAndLock.exe',
    category: 'Window Management',
    description: 'Crop another application window into a mini interactive or thumbnail window',
    keywords: ['crop', 'lock', 'mini', 'thumbnail', 'pip', 'picture in picture']
  },
  {
    id: 'mousejump',
    name: 'Mouse Jump',
    hotkey: 'Win+Shift+D',
    executableRelPath: 'WinUI3Apps\\PowerToys.MouseJump.WinUI3.exe',
    category: 'Mouse & Display',
    description: 'Instantly teleport mouse cursor across massive displays and multi-monitors',
    keywords: ['mouse', 'jump', 'teleport', 'cursor', 'screens', 'multi monitor']
  },
  {
    id: 'mousewithoutborders',
    name: 'Mouse Without Borders',
    executableRelPath: 'PowerToys.MouseWithoutBorders.exe',
    category: 'Mouse & Network',
    description: 'Control multiple PCs with a single physical keyboard and mouse',
    keywords: ['mouse without borders', 'kvm', 'share mouse', 'multi pc', 'network']
  },
  {
    id: 'workspaces',
    name: 'Workspaces Editor',
    hotkey: 'Win+Ctrl+~',
    executableRelPath: 'PowerToys.WorkspacesEditor.exe',
    category: 'Window Management',
    description: 'Capture, arrange, and launch multi-window desktop app arrangements',
    keywords: ['workspaces', 'arrangement', 'layouts', 'launch apps', 'desktop']
  },
  {
    id: 'zoomit',
    name: 'ZoomIt',
    hotkey: 'Ctrl+1 (Zoom), Ctrl+2 (Draw)',
    executableRelPath: 'PowerToys.ZoomIt.exe',
    category: 'Screen & Presentation',
    description: 'Screen magnification, live annotation drawing, and break timer',
    keywords: ['zoom', 'zoomit', 'magnify', 'draw', 'annotation', 'presentation']
  },
  {
    id: 'awake',
    name: 'Awake',
    executableRelPath: 'PowerToys.Awake.exe',
    category: 'System & Power',
    description: 'Keep computer awake on-demand without adjusting Windows sleep power plan',
    keywords: ['awake', 'sleep', 'stay awake', 'caffeine', 'power', 'screen lock']
  },
  {
    id: 'shortcutguide',
    name: 'Shortcut Guide',
    hotkey: 'Win+Shift+/',
    executableRelPath: 'WinUI3Apps\\PowerToys.ShortcutGuide.exe',
    category: 'Help & Shortcuts',
    description: 'Full-screen overlay showing active Windows key shortcuts for current window',
    keywords: ['shortcuts', 'guide', 'hotkeys', 'cheat sheet', 'windows key']
  },
  {
    id: 'powerrename',
    name: 'PowerRename',
    executableRelPath: 'WinUI3Apps\\PowerToys.PowerRename.exe',
    category: 'Files & Batch',
    description: 'Advanced batch file renaming with regular expressions and live preview',
    keywords: ['rename', 'batch', 'regex', 'files', 'bulk', 'powerrename']
  },
  {
    id: 'keyboardmanager',
    name: 'Keyboard Manager',
    executableRelPath: 'WinUI3Apps\\PowerToys.KeyboardManagerEditorUI.exe',
    category: 'Input & Keys',
    description: 'Remap individual keyboard keys and create custom global shortcut combinations',
    keywords: ['keyboard', 'remap', 'keys', 'rebind', 'shortcuts', 'manager']
  },
  {
    id: 'peek',
    name: 'Peek (File Preview)',
    hotkey: 'Ctrl+Space (Explorer)',
    executableRelPath: 'WinUI3Apps\\PowerToys.Peek.UI.exe',
    category: 'Files & Preview',
    description: 'Instant macOS-style Quick Look file preview directly in File Explorer',
    keywords: ['peek', 'preview', 'quick look', 'files', 'view', 'explorer']
  },
  {
    id: 'alwaysontop',
    name: 'Always on Top',
    hotkey: 'Win+Ctrl+T',
    executableRelPath: 'PowerToys.AlwaysOnTop.exe',
    category: 'Window Management',
    description: 'Pin any active window to stay on top of all other open windows',
    keywords: ['pin', 'top', 'always on top', 'sticky', 'stay on top', 'floating']
  },
  {
    id: 'settings',
    name: 'PowerToys Settings',
    executableRelPath: 'WinUI3Apps\\PowerToys.Settings.exe',
    category: 'Dashboard',
    description: 'Main configuration dashboard for all Microsoft PowerToys utilities',
    keywords: ['powertoys', 'settings', 'config', 'dashboard', 'preferences']
  }
]

function getPowerToysRoot(): string | null {
  const candidates = [
    'C:\\Program Files\\PowerToys',
    join(process.env.ProgramFiles ?? 'C:\\Program Files', 'PowerToys'),
    join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'PowerToys'),
    join(process.env.LOCALAPPDATA ?? '', 'PowerToys')
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
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

function extractCleanHotkey(rawHotkey?: string): string | null {
  if (!rawHotkey) return null
  // Take the primary combination before commas or slashes (e.g. "Win+Ctrl+Shift+T / R" -> "Win+Ctrl+Shift+T")
  const first = rawHotkey.split(/[,/]/)[0].trim()
  // Remove parenthesized comments (e.g. "Ctrl+1 (Zoom)" -> "Ctrl+1")
  return first.replace(/\([^)]*\)/g, '').trim().toLowerCase()
}

const fuse = new Fuse(POWER_TOYS_TOOLS, {
  keys: ['name', 'hotkey', 'description', 'category', 'keywords'],
  threshold: 0.35,
  ignoreLocation: true
})

export function search(query: string): SearchResultItem[] {
  const ptRoot = getPowerToysRoot()
  const q = query.trim()
  const tools = q ? fuse.search(q).map((r) => r.item) : POWER_TOYS_TOOLS

  if (tools.length === 0) {
    return [
      {
        label: `No PowerToys utility found matching "${q}"`,
        sublabel: 'Try: /pt hosts · /pt ruler · /pt ocr · /pt color · /pt keys · /pt zones · /pt awake',
        value: '',
        disabled: true
      }
    ]
  }

  return tools.map((tool) => {
    let fullPath = ''
    let isInstalled = false

    if (ptRoot) {
      fullPath = join(ptRoot, tool.executableRelPath)
      isInstalled = existsSync(fullPath)
    }

    const cleanHotkey = extractCleanHotkey(tool.hotkey)
    const hotkeyText = tool.hotkey ? `[${tool.hotkey}]` : '[Direct UI]'
    const sub = `${hotkeyText} · ${tool.category} · ${tool.description}`

    return {
      label: `PowerToys: ${tool.name}`,
      sublabel: isInstalled ? sub : `${sub} (Install: winget install Microsoft.PowerToys)`,
      value: `__pt_action__::${fullPath}::${cleanHotkey ?? ''}::${tool.hotkey ?? ''}`
    }
  })
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value.startsWith('__pt_action__::')) {
    const parts = item.value.slice('__pt_action__::'.length).split('::')
    const exePath = parts[0]
    const cleanHotkey = parts[1]
    const rawHotkey = parts[2]

    if (rawHotkey) {
      clipboard.writeText(rawHotkey)
    }

    const sendKeyPath = getSendKeyPath()

    // 1. If tool has a global hotkey, execute the native keypress combination!
    if (cleanHotkey && sendKeyPath) {
      try {
        spawn(sendKeyPath, [cleanHotkey], { detached: true, stdio: 'ignore' }).unref()
        return
      } catch {
        // Fall through to executable launch
      }
    }

    // 2. Launch the standalone executable
    if (exePath && existsSync(exePath)) {
      try {
        spawn(exePath, [], { detached: true, stdio: 'ignore' }).unref()
      } catch {
        await shell.openPath(exePath)
      }
    }
  }
}
