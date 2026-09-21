export interface Contact {
  name: string
  alias: string
  email: string
  teamsId: string
}

export interface Snippet {
  name: string
  text: string
}

export interface Link {
  name: string
  url: string
}

// A deep link straight into a Teams team or channel (as opposed to a 1:1 chat, which is
// built on the fly from a Contact's teamsId — see src/main/commands/teams.ts).
export interface TeamLink {
  name: string
  url: string
  description?: string
}

export interface SwapPeer {
  id: number
  name: string
  host: string
  port: number
  // SHA-256 fingerprint (colon-separated hex, e.g. "AB:12:...") of this peer's TLS
  // identity certificate — see main/swap/identity.ts. This is what's actually checked
  // before input sharing is allowed to/from this peer; host/port alone can be spoofed by
  // anything else on the LAN. Get it from the OTHER machine's /control settings (it shows
  // "This machine's fingerprint"), the same way you'd copy an SSH host key. Connections
  // to/from a peer with no fingerprint configured, or one that doesn't match, are refused.
  expectedFingerprint?: string
}

export interface HistoryEntry {
  command: CommandName
  query: string
  label: string
  value: string
  timestamp: string
}

export interface Settings {
  hotkey: string
  // Pops the terminal open/closed directly, without going through the bar first — see
  // main/index.ts's registerTerminalHotkey. Electron accelerator syntax, same as `hotkey`.
  terminalHotkey: string
  // Whether executed commands are recorded and offered back as the palette's default
  // (empty-input) list. Turning it off stops recording and hides the list, but deliberately
  // leaves history.json alone — flipping it back on restores what was already there.
  historyEnabled: boolean
  historyLimit: number
  autoStart: boolean
  // When true, mouse hover and clicks on palette list items are disabled.
  disableMouseInput: boolean
  // Default command prioritized at the top of UI suggestions (e.g. "teams", "term"). Empty by default.
  defaultCommand: string
  // Paths (from AppEntry.path) excluded from the "app" launcher. Empty by default — show all.
  disabledApps: string[]
  // Single-character aliases: typing "/<char> ..." runs the command directly, same as
  // typing out its full name. Only teams/fav/snippet get shortcuts (by design).
  teamsShortcut: string
  favShortcut: string
  snippetShortcut: string
  // CommandNames excluded from the "search" command's fan-out. Empty by default —
  // every searchable command participates.
  searchExcludedCommands: CommandName[]
  // CommandNames hidden from the command list UI suggestions. Empty by default — all visible.
  // Still executable when typed.
  hiddenCommands: CommandName[]
  // Folder the "gif" command browses/copies from, given as a path relative to ~/.sudolaunch
  // (never an absolute path). Defaults to "gif" — i.e. ~/.sudolaunch/gif, auto-created on
  // startup — following the convention that every folder-based feature defaults under
  // ~/.sudolaunch/<feature-name>.
  gifFolder: string
  // Folder the "lookup" command reads JSON tables from, given as a path relative to
  // ~/.sudolaunch. Defaults to "lookup" — i.e. ~/.sudolaunch/lookup, auto-created on
  // startup — same convention as gifFolder.
  lookupFolder: string
  // Whether the persistent, always-visible command bar (docked top-center) is shown.
  // Deliberately not exposed as a Settings form field — toggled only via the "/view"
  // command (see main/commands/view.ts), by design.
  barEnabled: boolean
  // Top-left of the bar's idle (icon) position, set by dragging it via "/move" — see
  // main/barWindow.ts. null means "use the default bottom-center dock", which is also
  // what "/view reset" restores. Not a Settings form field, same reasoning as barEnabled.
  barPosition: { x: number; y: number } | null
  // Top-left of the terminal's idle (icon) position when detached, set by dragging via "/move" —
  // null means "dock adjacent to the bar".
  termPosition: { x: number; y: number } | null
  // Top-left of the expanded terminal window when moved via its drag handle —
  // null means "open centered relative to the dock icon".
  termWindowPosition: { x: number; y: number } | null
  // Input sharing settings (/control #)
  swapEnabled: boolean
  swapMachineId: number
  swapPort: number
  swapToggleHotkey: string
  // Whether Ctrl + Right Click anywhere summons the dock icon to the cursor
  ctrlRightClickSummon: boolean
  // Dock arrangement: 'shelf' (bottom-center pill tray, new default), 'horizontal' (linear dock),
  // or 'circle' (radial orbit hovering around cursor)
  dockLayout?: 'horizontal' | 'circle' | 'shelf'
  // Auto-return dock to home position (above clock in bottom-right)
  autoReturnHome?: boolean
  autoReturnDelaySec?: number
  // Configurable modules displayed on the shelf dock (e.g. 'term', 'bar', 'notify', 'settings', 'focus', 'git', 'profile')
  shelfIcons?: ShelfModuleId[]
  theme?: string
  paletteHotkey?: string
  termHotkey?: string
  appFolder?: string
  activeProfile?: string
  gitRepoPath?: string
  recentGitRepos?: string[]
  // Width of the expanded terminal window in pixels (default 800)
  terminalWidth?: number
  // Monitor index (1-based) to assign the dock to. Defaults to monitor 1 for any error.
  monitor?: number
  // Custom glow color for the minimized dock glowing pill bar (e.g. '#5aa0ff', 'cyan', 'purple')
  dockGlowColor?: string
  // Minimized dock glow animation style ('breathing', 'steady', 'stealth')
  dockGlowStyle?: 'breathing' | 'steady' | 'stealth'
}

export interface ProfileItem {
  id: string
  name: string
  isCurrent: boolean
  lastModified?: number
  description?: string
  commandsCount?: number
  linksCount?: number
}

export interface BackupArchiveItem {
  filename: string
  fullPath: string
  sizeKb: number
  date: string
  timestamp: number
  type: 'Safety Snapshot' | 'User Backup'
}

export type ShelfModuleId =
  | 'term'
  | 'bar'
  | 'notify'
  | 'settings'
  | 'focus'
  | 'git'
  | 'profile'

export const DEFAULT_SHELF_ICONS: ShelfModuleId[] = [
  'term',
  'bar',
  'notify',
  'focus',
  'git'
]

export const SHELF_MODULE_INFO: Record<
  ShelfModuleId,
  { name: string; icon: string; description: string }
> = {
  term: { name: 'Persistent Terminal', icon: '>_', description: 'Slide-up terminal for quick commands' },
  bar: { name: 'Command Palette', icon: '/', description: 'Quick search, calculation, and commands' },
  notify: { name: 'Notifications', icon: '🔔', description: 'System alerts and notification center' },
  settings: { name: 'Settings & Config', icon: '⚙️', description: 'Preferences and shortcut configuration' },
  focus: { name: 'Focus Timer', icon: '⏱️', description: 'Pomodoro focus timer with live dock badge' },
  git: { name: 'Git Status & Branch', icon: '🔀', description: 'Active git repository status and branch switcher' },
  profile: { name: 'Profile Switcher', icon: '👤', description: 'Profile switcher, backup, and restore' }
}

export interface FocusTimerState {
  running: boolean
  paused: boolean
  durationMinutes: number
  remainingSeconds: number
  sessionCount: number
}

export interface GitRepoStatus {
  isRepo: boolean
  branch: string
  dirty: boolean
  ahead: number
  behind: number
  repoName?: string
  repoPath?: string
}

export interface KnownRepoItem {
  name: string
  path: string
  branch?: string
  isCurrent?: boolean
}

// The currently registered global accelerators, as Electron accelerator strings (e.g.
// "CommandOrControl+Space") — shown in the bar/terminal tooltips.
export interface Hotkeys {
  palette: string
  terminal: string
}

// Geometry for a grow-from-the-icon animation, used by both the bar and the terminal
// panel: where the icon sat within the new window bounds (as percentages of them), and the
// scale the content starts at so its first frame matches the icon's footprint.
export interface GrowOrigin {
  originX: number
  originY: number
  scale: number
}

export interface AppEntry {
  name: string
  path: string
}

export type CommandName =
  | 'app'
  | 'calc'
  | 'case'
  | 'chmod'
  | 'color'
  | 'cron'
  | 'custom'
  | 'default'
  | 'emoji'
  | 'fav'
  | 'focus'
  | 'g'
  | 'gif'
  | 'git'
  | 'hash'
  | 'history'
  | 'http'
  | 'ip'
  | 'json'
  | 'lookup'
  | 'lorem'
  | 'mail'
  | 'mime'
  | 'port'
  | 'pt'
  | 'pwd'
  | 'qr'
  | 'regex'
  | 'restart'
  | 'search'
  | 'snippet'
  | 'teams'
  | 'term'
  | 'text'
  | 'tz'
  | 'unit'
  | 'url'
  | 'uuid'
  | 'view'
  | 'control'
  | 'release'
  | 'exit'
  | 'settings'
  | 'profile'

export interface CommandDef {
  name: CommandName
  description: string
}

export const COMMANDS: CommandDef[] = [
  { name: 'app', description: 'Launch an installed application' },
  { name: 'calc', description: 'Evaluate a math expression' },
  { name: 'case', description: 'Convert text case (camelCase, kebab-case, snake_case, PascalCase, etc.)' },
  { name: 'chmod', description: 'Convert and calculate Linux/Unix file permissions (755, rwxr-xr-x)' },
  { name: 'color', description: 'Convert color models (HEX, RGB, HSL) and copy formats' },
  { name: 'cron', description: 'Explain cron expressions in plain English and compute upcoming runs' },
  { name: 'custom', description: 'Run a custom command, or browse a folder of scripts' },
  { name: 'default', description: 'Set the default command that shows first in suggestions' },
  { name: 'emoji', description: 'Search and copy Unicode emojis by name, keyword, or shortcode' },
  { name: 'exit', description: 'Exit and close the application (alias: /quit)' },
  { name: 'fav', description: 'Open a saved link in the browser' },
  { name: 'focus', description: 'Bring an open window to the front' },
  { name: 'g', description: 'Open a Google search in your browser (alias: /google)' },
  { name: 'gif', description: 'Copy a GIF from your GIF folder to the clipboard' },
  { name: 'git', description: 'Search common Git recipes, recovery shortcuts, and commands' },
  { name: 'hash', description: 'Generate hashes (SHA-256, MD5) and decode Base64, URL, or JWT' },
  { name: 'history', description: 'Browse, filter, and clear command history (/history clear)' },
  { name: 'http', description: 'Search HTTP status codes and standard HTTP header references' },
  { name: 'ip', description: 'Inspect network interfaces, local IPs, and MAC addresses' },
  { name: 'json', description: 'Prettify, minify, validate, or stringify JSON from text or clipboard' },
  { name: 'lookup', description: 'Search a local JSON data table' },
  { name: 'lorem', description: 'Generate placeholder text, mock dummy data, emails, and names' },
  { name: 'mail', description: 'Compose an email to a contact' },
  { name: 'mime', description: 'Search MIME content types and file extensions (e.g. .json, image/webp)' },
  { name: 'port', description: 'Inspect listening TCP ports and kill blocking processes' },
  { name: 'profile', description: 'Manage, backup, restore, validate, or reset the user profile and config' },
  { name: 'pt', description: 'Launch Microsoft PowerToys utilities and tools (alias: /powertoys)' },
  { name: 'pwd', description: 'Generate secure passwords, passphrases, PINs, and API tokens' },
  { name: 'qr', description: 'Generate QR codes from URLs or text with clipboard copy' },
  { name: 'regex', description: 'Library of standard regex patterns and live regex tester' },
  { name: 'release', description: 'Release keyboard and mouse input sharing from /control' },
  { name: 'restart', description: 'Relaunch the application' },
  { name: 'search', description: 'Search across other commands at once' },
  { name: 'settings', description: 'Open settings and configuration manager' },
  { name: 'snippet', description: 'Copy a saved snippet to the clipboard' },
  { name: 'teams', description: 'Open a Teams chat with a contact' },
  { name: 'term', description: 'Open or run a command in the persistent terminal' },
  { name: 'text', description: 'Analyze text statistics, sort, deduplicate, and join lines' },
  { name: 'tz', description: 'Convert timestamps and timezones to local time' },
  { name: 'unit', description: 'Convert data units, bandwidth, physical units, and number bases' },
  { name: 'url', description: 'Parse URL components, extract query parameters, and build cURL snippets' },
  { name: 'uuid', description: 'Generate UUIDs/GUIDs in multiple formats and inspect IDs' },
  { name: 'view', description: 'Toggle the command bar or change its position' },
  { name: 'control', description: 'Toggle active keyboard and mouse input sharing with another computer (/control #)' }
]

// Commands that participate in the "search" command's fan-out — everything except
// "calc" (not search-shaped) and "search" itself. Used both to build the SEARCHABLE
// dispatch table in commands/search.ts and to drive the "Search Commands" toggle
// screen in ConfigManager.tsx.
export const SEARCHABLE_COMMAND_NAMES: Exclude<CommandName, 'calc' | 'search' | 'view' | 'term' | 'restart' | 'default' | 'settings' | 'control' | 'release' | 'exit' | 'profile' | 'history'>[] = [
  'app',
  'case',
  'chmod',
  'color',
  'cron',
  'custom',
  'emoji',
  'fav',
  'focus',
  'g',
  'gif',
  'git',
  'hash',
  'http',
  'ip',
  'json',
  'lookup',
  'lorem',
  'mail',
  'mime',
  'port',
  'pt',
  'pwd',
  'qr',
  'regex',
  'snippet',
  'teams',
  'text',
  'tz',
  'unit',
  'url',
  'uuid'
]

export interface CommandFolder {
  id: string
  name: string
  icon?: string
  description?: string
  commands: string[]
}

export interface CommandLayout {
  rootOrder: string[]
  folders: CommandFolder[]
}

export const DEFAULT_COMMAND_LAYOUT: CommandLayout = {
  rootOrder: [
    'search',
    'app',
    'folder:comm',
    'folder:dev',
    'folder:utils',
    'folder:sys'
  ],
  folders: [
    {
      id: 'folder:comm',
      name: 'Communication',
      icon: '💬',
      description: 'Teams chat, email, and saved links',
      commands: ['teams', 'mail', 'fav']
    },
    {
      id: 'folder:dev',
      name: 'Developer',
      icon: '⚡',
      description: 'Git, HTTP, JSON, RegEx, cron, and terminal',
      commands: ['git', 'http', 'json', 'regex', 'cron', 'term', 'custom']
    },
    {
      id: 'folder:utils',
      name: 'Utilities',
      icon: '🛠️',
      description: 'Calculators, text, encoding, units, and generators',
      commands: [
        'calc',
        'snippet',
        'case',
        'color',
        'uuid',
        'hash',
        'pwd',
        'tz',
        'unit',
        'qr',
        'mime',
        'lookup',
        'lorem',
        'text',
        'url',
        'emoji',
        'gif',
        'g',
        'pt',
        'focus',
        'ip',
        'port',
        'chmod'
      ]
    },
    {
      id: 'folder:sys',
      name: 'System',
      icon: '⚙️',
      description: 'Profile, settings, control, history, and system controls',
      commands: ['profile', 'settings', 'default', 'history', 'view', 'control', 'release', 'restart', 'exit']
    }
  ]
}


export interface SearchResultItem {
  label: string
  sublabel?: string
  value: string
  // Used only by a folder-type custom command's drill-down results (see folderBrowse.ts).
  isDirectory?: boolean
  disabled?: boolean
  // When set, selecting this item fills the palette input with this text instead of
  // executing anything — used by the "custom" command's parameter tab-complete.
  completion?: string
}

export interface CustomCommandParam {
  name: string
  description?: string
}

export interface CustomCommand {
  command: string
  label?: string
  // Exactly one of these is set. "action" runs a single PowerShell command (with
  // {param} substitution from `parameters`, notified on completion). "folder" turns this
  // command into a browser over a folder of .ps1/.py scripts (given as a path relative to
  // ~/.sudolaunch, e.g. "maintenance" for ~/.sudolaunch/maintenance) — drill in, pick one, run it
  // in a visible console. See main/folderBrowse.ts.
  action?: string
  folder?: string
  parameters: CustomCommandParam[]
  showTerminal?: boolean
}

export type ConfigType = 'contacts' | 'snippets' | 'links' | 'teamLinks' | 'settings' | 'peers'

export type ConfigEntry = Record<string, string | number | boolean | string[]>

export interface ConfigFieldDef {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'boolean'
}

export interface ConfigTypeDef {
  type: ConfigType
  label: string
  description: string
  titleField: string
  subtitleField?: string
  fields: ConfigFieldDef[]
  // Settings has exactly one entry that always exists — no add/delete, just edit.
  singleton?: boolean
}

export const CONFIG_TYPES: ConfigTypeDef[] = [
  {
    type: 'contacts',
    label: 'Contacts',
    description: 'People you message or email',
    titleField: 'name',
    subtitleField: 'email',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'alias', label: 'Alias', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'teamsId', label: 'Teams ID', type: 'text' }
    ]
  },
  {
    type: 'snippets',
    label: 'Snippets',
    description: 'Saved text you copy to the clipboard',
    titleField: 'name',
    subtitleField: 'text',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'text', label: 'Text', type: 'textarea' }
    ]
  },
  {
    type: 'links',
    label: 'Links',
    description: 'Saved URLs you open in the browser',
    titleField: 'name',
    subtitleField: 'url',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'url', label: 'URL', type: 'text' }
    ]
  },
  {
    type: 'teamLinks',
    label: 'Teams links',
    description: 'Deep links to actual Teams teams/channels, shown alongside contacts in /teams',
    titleField: 'name',
    subtitleField: 'description',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'url', label: 'Teams URL', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' }
    ]
  },
  {
    type: 'peers',
    label: 'Swap Peers',
    description: 'Computers configured for input sharing via /control #',
    titleField: 'name',
    subtitleField: 'host',
    fields: [
      { key: 'id', label: 'Machine #', type: 'number' },
      { key: 'name', label: 'Computer Name', type: 'text' },
      { key: 'host', label: 'IP Address / Hostname', type: 'text' },
      { key: 'port', label: 'Port (default 41234)', type: 'number' },
      {
        key: 'expectedFingerprint',
        label: 'Expected Fingerprint (from the other machine’s Settings)',
        type: 'text'
      }
    ]
  },
  {
    type: 'settings',
    label: 'Settings',
    description: 'Hotkey, history limit, auto-start, and command shortcuts',
    titleField: 'hotkey',
    singleton: true,
    fields: [
      { key: 'hotkey', label: 'Hotkey', type: 'text' },
      { key: 'terminalHotkey', label: 'Terminal hotkey', type: 'text' },
      { key: 'historyEnabled', label: 'Remember command history', type: 'boolean' },
      { key: 'historyLimit', label: 'History limit', type: 'number' },
      { key: 'autoStart', label: 'Auto-start', type: 'boolean' },
      { key: 'disableMouseInput', label: 'Disable mouse input', type: 'boolean' },
      { key: 'defaultCommand', label: 'Default command (e.g. teams, term)', type: 'text' },
      { key: 'teamsShortcut', label: 'Teams shortcut (e.g. t)', type: 'text' },
      { key: 'favShortcut', label: 'Fav shortcut (e.g. f)', type: 'text' },
      { key: 'snippetShortcut', label: 'Snippet shortcut (e.g. s)', type: 'text' },
      { key: 'gifFolder', label: 'GIF folder (relative to ~/.sudolaunch, e.g. "gif")', type: 'text' },
      { key: 'lookupFolder', label: 'Lookup folder (relative to ~/.sudolaunch, e.g. "lookup")', type: 'text' },
      { key: 'swapEnabled', label: 'Enable Input Sharing (/control)', type: 'boolean' },
      { key: 'swapMachineId', label: 'This Machine # (e.g. 1)', type: 'number' },
      { key: 'swapPort', label: 'Swap Port (default 41234)', type: 'number' },
      { key: 'swapToggleHotkey', label: 'Swap Toggle Hotkey (ScrollLock / Pause / Control+Alt+S)', type: 'text' },
      { key: 'ctrlRightClickSummon', label: 'Summon dock on Ctrl+Right Click', type: 'boolean' },
      { key: 'autoReturnHome', label: 'Auto-return dock to home position (above clock)', type: 'boolean' },
      { key: 'autoReturnDelaySec', label: 'Auto-return delay in seconds', type: 'number' },
      { key: 'terminalWidth', label: 'Terminal window width (px, default 800)', type: 'number' },
      { key: 'monitor', label: 'Dock monitor (1-based, default 1)', type: 'number' },
      { key: 'dockGlowColor', label: 'Minimized dock glow color (e.g. #5aa0ff, cyan, purple)', type: 'text' },
      { key: 'dockGlowStyle', label: 'Minimized dock glow style (breathing, steady, stealth)', type: 'text' }
    ]
  }
]

export type NotificationType = 'success' | 'error' | 'info'

export interface SudoNotification {
  id: string
  title: string
  body?: string
  type: NotificationType
  timestamp: number
  commandName?: string
  commandInput?: string
  read?: boolean
}

