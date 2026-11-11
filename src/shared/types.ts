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
  // end SwapPeer
}

export interface SshHost {
  name: string
  host: string
  user?: string
  port?: number
  identityFile?: string
  extraArgs?: string
  description?: string
  extra?: string
}

export type TextualLaunchMode = 'embedded' | 'window' | 'external'

export interface TextualAppEntry {
  name: string
  scriptPath: string
  args?: string
  cwd?: string
  pythonPath?: string
  defaultMode?: string
  description?: string
}

export interface TextualWindowInitInfo {
  sessionId: string
  title: string
  subtitle: string
  commandDisplay: string
  cwd: string
  pinned: boolean
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
  // CommandNames excluded from the "search" command's fan-out. Defaults to
  // DEFAULT_SEARCH_EXCLUDED_COMMANDS (commands marked with excludeFromSearch: true).
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
  // Folder the "textual" (/tui) command auto-discovers Python Textual apps from, relative
  // to ~/.sudolaunch. Defaults to "textual" (~/.sudolaunch/textual).
  textualFolder?: string
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
  // Top-left of the expanded shortcuts overlay window when moved via its drag handle —
  // null means "open centered relative to the dock icon".
  shortcutsWindowPosition?: { x: number; y: number } | null
  // Custom width & height of the shortcuts overlay window when resized (default 740x460)
  shortcutsWindowSize?: { width: number; height: number } | null
  // Whether the shortcuts overlay stays open after clicking a shortcut (default true)
  shortcutsStayOpen?: boolean
  // Whether the shortcuts overlay renders in monochrome grayscale mode (default false)
  shortcutsGrayscale?: boolean
  // Input sharing settings (/control #)
  swapEnabled: boolean
  swapMachineId: number
  swapPort: number
  swapToggleHotkey: string
  // Dock arrangement: 'shelf' (bottom-center pill tray, new default), 'horizontal' (linear dock),
  // or 'circle' (radial orbit hovering around cursor)
  dockLayout?: 'horizontal' | 'circle' | 'shelf'
  // Auto-return dock to home position (above clock in bottom-right)
  autoReturnHome?: boolean
  autoReturnDelaySec?: number
  // Home position anchor for resting dock: 'left', 'middle', 'right', or 'custom'
  dockHomePosition?: 'left' | 'middle' | 'right' | 'custom'
  // Custom screen percentage coordinates when dockHomePosition is 'custom'
  dockHomeCustomCoordinates?: { x: number; y: number }
  // Configurable modules displayed on the shelf dock (e.g. 'term', 'bar', 'notify', 'settings', 'focus', 'git', 'profile')
  shelfIcons?: ShelfModuleId[]
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
  | 'shortcuts'
  | 'settings'
  | 'focus'
  | 'git'
  | 'profile'
  | 'system'
  | 'jobs'

export const DEFAULT_SHELF_ICONS: ShelfModuleId[] = [
  'term',
  'notify',
  'bar',
  'shortcuts',
  'focus',
  'git',
  'system',
  'jobs'
]

export const SHELF_MODULE_INFO: Record<
  ShelfModuleId,
  { name: string; icon: string; description: string }
> = {
  term: { name: 'Persistent Terminal', icon: '>_', description: 'Slide-up terminal for quick commands' },
  bar: { name: 'Command Palette', icon: '/', description: 'Quick search, calculation, and commands' },
  notify: { name: 'Notifications', icon: '🔔', description: 'System alerts and notification center' },
  shortcuts: { name: 'Shortcuts Overlay', icon: '⌨️', description: 'Customizable shortcuts & hotkeys overlay (Favorites, PowerToys, Docker, Windows, Dev)' },
  settings: { name: 'Settings & Config', icon: '⚙️', description: 'Preferences and shortcut configuration' },
  focus: { name: 'Focus Timer', icon: '⏱️', description: 'Pomodoro focus timer with live dock badge' },
  git: { name: 'Git Status & Branch', icon: '🔀', description: 'Active git repository status and branch switcher' },
  profile: { name: 'Profile Switcher', icon: '👤', description: 'Profile switcher, backup, and restore' },
  system: { name: 'System Management', icon: '🧰', description: 'WinGet package manager, updates, pins, and system tools' },
  jobs: { name: 'Cron & Scheduled Jobs', icon: '⏰', description: 'In-app cron scheduler, intervals, lifecycle hooks, and job logs' }
}

export type ShortcutActionType =
  | 'hotkey'
  | 'terminal'
  | 'powershell'
  | 'open'
  | 'sudolaunch'
  | 'powertoys'

export interface ShortcutOverlayItem {
  id: string
  label: string
  description: string
  tab: string
  icon: string
  keys: string
  actionType: ShortcutActionType
  actionPayload: string
  elevated?: boolean
  favorite?: boolean
  isBuiltIn?: boolean
  installed?: boolean
  badge?: string
}

export interface DockerQuickContainer {
  id: string
  name: string
  image: string
  status: string
  running: boolean
  ports: string
}

export interface ShortcutsOverlayTabInfo {
  id: string
  label: string
  icon: string
  count: number
  isCustomTab?: boolean
}

export interface ShortcutsOverlayData {
  items: ShortcutOverlayItem[]
  tabs: ShortcutsOverlayTabInfo[]
  dockerContainers: DockerQuickContainer[]
  dockerAvailable: boolean
  powerToysInstalled: boolean
  stayOpen: boolean
  grayscale: boolean
  windowSize: { width: number; height: number }
}

export interface WingetPackageItem {
  name: string
  id: string
  version: string
  available?: string
  source?: string
  isPinned?: boolean
  pinType?: 'Pinning' | 'Blocking' | 'Gating' | string
  pinnedVersion?: string
}

export interface WingetPinItem {
  name: string
  id: string
  version: string
  source: string
  pinType: 'Pinning' | 'Blocking' | 'Gating' | string
  pinnedVersion?: string
}

export interface WingetSearchResult {
  name: string
  id: string
  version: string
  match?: string
  source?: string
  isInstalled?: boolean
  installedVersion?: string
}

export interface WingetPinOptions {
  id: string
  mode: 'standard' | 'blocking' | 'installed' | 'version'
  versionPattern?: string
  elevated?: boolean
}

export interface WingetActionParams {
  action: 'install' | 'upgrade' | 'upgrade-all' | 'uninstall'
  id?: string
  name?: string
  version?: string
  scope?: 'default' | 'user' | 'machine'
  interactive?: boolean
  force?: boolean
  elevated?: boolean
  includePinned?: boolean
  inTerminal?: boolean
}

export interface WingetBatchActionParams {
  action: 'upgrade' | 'uninstall' | 'install'
  packages: Array<{ id: string; name: string }>
  elevated?: boolean
  includePinned?: boolean
}

export interface WingetOperationState {
  id: string
  action: 'install' | 'upgrade' | 'upgrade-all' | 'uninstall' | 'batch'
  packageId?: string
  packageName?: string
  status: 'running' | 'success' | 'error'
  progressText: string
  logLines: string[]
  elevated?: boolean
  startedAt: number
  batchCurrent?: number
  batchTotal?: number
}

export interface WingetPackageDetails {
  id: string
  name: string
  version: string
  publisher?: string
  publisherUrl?: string
  author?: string
  moniker?: string
  description?: string
  homepage?: string
  license?: string
  licenseUrl?: string
  releaseNotes?: string
  releaseNotesUrl?: string
  tags?: string[]
  installerType?: string
  installerUrl?: string
  availableVersions: string[]
}

export interface WingetSnapshotItem {
  filename: string
  name: string
  createdAt: string
  timestamp: number
  packageCount: number
  pinCount: number
  sizeKb: number
}

export interface EcosystemUpdateItem {
  manager: 'npm' | 'pip' | 'psmodule' | 'wsl'
  id: string
  name: string
  currentVersion: string
  latestVersion: string
  location?: string
}

export interface DevRuntimeStatus {
  id: string
  name: string
  icon: string
  wingetId?: string
  installed: boolean
  version: string
  activePath: string
  allPaths: string[]
  hasShadowConflict: boolean
}

export interface PathEntryHealth {
  path: string
  scope: 'User' | 'Machine'
  exists: boolean
  isDuplicate: boolean
}

export interface SystemServiceItem {
  name: string
  displayName: string
  status: 'Running' | 'Stopped' | string
  startType: 'Automatic' | 'Manual' | 'Disabled' | string
  isPinned?: boolean
  category?: string
}

export interface SystemStartupAppItem {
  name: string
  command: string
  location: string
}

export interface SystemPortItem {
  proto: string
  localAddress: string
  port: number
  pid: number
  processName: string
  memoryMb?: number
  path?: string
  isCommonDevPort?: boolean
}

export interface SystemProcessItem {
  pid: number
  name: string
  memoryMb: number
  cpuSec: number
  windowTitle?: string
  path?: string
}

export interface CleanupTargetItem {
  id: string
  name: string
  icon: string
  category: 'Developer Cache' | 'System Temp'
  description: string
  path: string
  exists: boolean
  sizeMb: number
  fileCount?: number
}

export interface WindowsPendingUpdateItem {
  title: string
  kbs: string
  isDownloaded: boolean
  rebootRequired: boolean
  severity: string
  sizeMb: number
}

export interface WindowsHotfixItem {
  hotFixId: string
  description: string
  installedOn: string
}

export interface WindowsUpdateStatus {
  rebootPending: boolean
  rebootReasons: string[]
  osCaption: string
  osVersion: string
  osBuild: string
  lastBootTime: string
  uptimeDays: number
  uptimeHours: number
  wuaServiceStatus: string
  recentHotfixes: WindowsHotfixItem[]
  pendingUpdates: WindowsPendingUpdateItem[]
  pendingScanned: boolean
  lastCheckedAt: string
  scanNote?: string
}

export type WindowsUpdateActionType =
  | 'open-settings'
  | 'open-history'
  | 'trigger-scan'
  | 'download-updates'
  | 'install-updates'
  | 'install-in-terminal'
  | 'schedule-reboot-60s'
  | 'cancel-reboot'

export interface SystemEnvVarItem {
  name: string
  value: string
  scope: 'User' | 'Machine'
  isSecret: boolean
}

export interface SystemScheduledTaskItem {
  name: string
  path: string
  state: string
  author: string
  description: string
  lastRunTime: string
  lastResult: string
  nextRunTime: string
  isSystemTask: boolean
}

export interface SystemHostEntryItem {
  lineIndex: number
  ip: string
  hostname: string
  comment: string
  enabled: boolean
}

export interface SystemNetworkAdapterItem {
  name: string
  description: string
  status: string
  macAddress: string
  ipv4: string
  gateway: string
  dnsServers: string[]
}

export interface SystemStorageVolumeItem {
  driveLetter: string
  label: string
  fileSystem: string
  healthStatus: string
  totalGb: number
  freeGb: number
  usedGb: number
  usedPercent: number
}

export interface SystemPhysicalDiskItem {
  friendlyName: string
  mediaType: string
  busType: string
  healthStatus: string
  operationalStatus: string
  sizeGb: number
}

export interface SystemPowerPlanItem {
  guid: string
  name: string
  isActive: boolean
}

export interface SystemSleepLockItem {
  category: string
  requester: string
  details: string
}

export interface SystemStorageAndPowerOverview {
  volumes: SystemStorageVolumeItem[]
  disks: SystemPhysicalDiskItem[]
  powerPlans: SystemPowerPlanItem[]
  sleepLocks: SystemSleepLockItem[]
}

export interface SystemBitLockerVolumeItem {
  mountPoint: string
  volumeStatus: string
  protectionStatus: string
  encryptionPercent: number
}

export interface SystemSecurityPosture {
  realtimeProtectionEnabled: boolean
  antivirusEnabled: boolean
  tamperProtectionEnabled: boolean
  behaviorMonitorEnabled: boolean
  signatureVersion: string
  signatureLastUpdated: string
  quickScanAgeDays: number
  exclusionPaths: string[]
  exclusionProcesses: string[]
  bitLockerVolumes: SystemBitLockerVolumeItem[]
  localAdmins: string[]
}

export interface SystemEventLogItem {
  id: number
  recordId: number
  timeCreated: string
  logName: string
  level: 'Critical' | 'Error' | 'Warning'
  providerName: string
  message: string
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

export type GitWatcherMode = 'run-on-change' | 'restart-process'
export type GitWatcherStatus = 'stopped' | 'watching' | 'running' | 'error'

export interface GitProjectPreset {
  id: string
  label: string
  command: string
  mode: GitWatcherMode
  extensions: string
  icon: string
  description: string
}

export interface GitWatcherConfigInput {
  id?: string
  name: string
  repoPath: string
  subPath?: string
  command: string
  mode: GitWatcherMode
  extensions?: string
  ignorePatterns?: string
  debounceMs?: number
  notifyOnError?: boolean
  startImmediately?: boolean
}

export interface GitWatcherItem {
  id: string
  name: string
  repoPath: string
  repoName: string
  subPath?: string
  command: string
  mode: GitWatcherMode
  extensions: string
  ignorePatterns: string
  debounceMs: number
  notifyOnError: boolean
  enabled: boolean
  status: GitWatcherStatus
  pid?: number
  reloadCount: number
  lastTriggeredAt?: number
  lastChangedFile?: string
  lastExitCode?: number | null
  lastDurationMs?: number
  logLines: string[]
}

export type ScheduledJobTriggerType =
  | 'cron'
  | 'interval'
  | 'startup'
  | 'unlock'
  | 'resume'
  | 'network-change'

export type ScheduledJobActionType =
  | 'powershell'
  | 'script'
  | 'terminal'
  | 'custom-command'

export type ScheduledJobNotifyMode = 'always' | 'error' | 'never'

export type ScheduledJobStatus = 'idle' | 'running' | 'success' | 'error'

export interface ScheduledJobPreset {
  id: string
  name: string
  description: string
  actionType: ScheduledJobActionType
  command: string
  suggestedTriggerType: ScheduledJobTriggerType
  suggestedSchedule: string
  source: 'maintenance-script' | 'custom-command' | 'builtin'
  icon: string
}

export interface ScheduledJobInput {
  id?: string
  name: string
  description?: string
  enabled?: boolean
  triggerType: ScheduledJobTriggerType
  schedule: string
  actionType: ScheduledJobActionType
  command: string
  cwd?: string
  elevated?: boolean
  notifyOn?: ScheduledJobNotifyMode
  runImmediately?: boolean
}

export interface ScheduledJobItem {
  id: string
  name: string
  description?: string
  enabled: boolean
  triggerType: ScheduledJobTriggerType
  schedule: string
  scheduleSummary: string
  actionType: ScheduledJobActionType
  command: string
  cwd?: string
  elevated?: boolean
  notifyOn: ScheduledJobNotifyMode
  source: 'user' | 'custom-command'
  sourceCommandName?: string
  status: ScheduledJobStatus
  pid?: number
  runCount: number
  nextRunAt?: number | null
  lastRunAt?: number | null
  lastDurationMs?: number | null
  lastExitCode?: number | null
  lastTriggerReason?: string
  logLines: string[]
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
  | 'repo'
  | 'notifications'
  | 'timer'
  | 'docker'
  | 'env'
  | 'diff'
  | 'cert'
  | 'curl'
  | 'dns'
  | 'key'
  | 'expmod'
  | 'ssh'
  | 'proc'
  | 'svc'
  | 'wsl'
  | 'pkg'
  | 'clip'
  | 'show'
  | 'hide'
  | 'system'
  | 'shortcuts'
  | 'jobs'
  | 'textual'

export interface CommandDef {
  name: CommandName
  description: string
  // When true, excluded from universal "/search" fan-out by default so heavy system queries
  // (processes, ports, network/hardware IDs, env vars, module scans) and single-input
  // generators/transformers don't stutter or flood universal search results.
  excludeFromSearch?: boolean
}

export const COMMANDS: CommandDef[] = [
  { name: 'app', description: 'Launch an installed application' },
  { name: 'calc', description: 'Evaluate a math expression', excludeFromSearch: true },
  { name: 'case', description: 'Convert text case (camelCase, kebab-case, snake_case, PascalCase, etc.)', excludeFromSearch: true },
  { name: 'chmod', description: 'Convert and calculate Linux/Unix file permissions (755, rwxr-xr-x)', excludeFromSearch: true },
  { name: 'color', description: 'Convert color models (HEX, RGB, HSL) and copy formats', excludeFromSearch: true },
  { name: 'cron', description: 'Explain cron expressions in plain English and compute upcoming runs', excludeFromSearch: true },
  { name: 'custom', description: 'Run a custom command, or browse a folder of scripts' },
  { name: 'default', description: 'Set the default command that shows first in suggestions', excludeFromSearch: true },
  { name: 'emoji', description: 'Search and copy Unicode emojis by name, keyword, or shortcode' },
  { name: 'exit', description: 'Exit and close the application (alias: /quit)', excludeFromSearch: true },
  { name: 'fav', description: 'Open a saved link in the browser' },
  { name: 'focus', description: 'Switch to an open desktop window by title' },
  { name: 'g', description: 'Open a Google search in your browser (alias: /google)' },
  { name: 'gif', description: 'Copy a GIF from your GIF folder to the clipboard' },
  { name: 'git', description: 'Search common Git recipes, recovery shortcuts, and commands' },
  { name: 'hash', description: 'Generate hashes (SHA-256, MD5) and decode Base64, URL, or JWT', excludeFromSearch: true },
  { name: 'history', description: 'Browse, filter, and clear command history (/history clear)', excludeFromSearch: true },
  { name: 'http', description: 'Search HTTP status codes and standard HTTP header references', excludeFromSearch: true },
  { name: 'ip', description: 'Inspect network interfaces, local IPs, and MAC addresses', excludeFromSearch: true },
  { name: 'json', description: 'Prettify, minify, validate, or stringify JSON from text or clipboard', excludeFromSearch: true },
  { name: 'lookup', description: 'Search a local JSON data table' },
  { name: 'lorem', description: 'Generate placeholder text, mock dummy data, emails, and names', excludeFromSearch: true },
  { name: 'mail', description: 'Compose an email to a contact' },
  { name: 'mime', description: 'Search MIME content types and file extensions (e.g. .json, image/webp)', excludeFromSearch: true },
  { name: 'notifications', description: 'Open notification center and execution history alerts (alias: /notify)', excludeFromSearch: true },
  { name: 'port', description: 'Inspect listening TCP ports and kill blocking processes', excludeFromSearch: true },
  { name: 'profile', description: 'Manage, backup, restore, validate, or reset the user profile and config', excludeFromSearch: true },
  { name: 'pt', description: 'Launch Microsoft PowerToys utilities and tools (alias: /powertoys)' },
  { name: 'pwd', description: 'Generate secure passwords, passphrases, PINs, and API tokens', excludeFromSearch: true },
  { name: 'qr', description: 'Generate QR codes from URLs or text with clipboard copy', excludeFromSearch: true },
  { name: 'regex', description: 'Library of standard regex patterns and live regex tester', excludeFromSearch: true },
  { name: 'release', description: 'Release keyboard and mouse input sharing from /control', excludeFromSearch: true },
  { name: 'repo', description: 'Open active Git repository status, branch switcher, and recent repos', excludeFromSearch: true },
  { name: 'restart', description: 'Relaunch the application', excludeFromSearch: true },
  { name: 'search', description: 'Search across other commands at once', excludeFromSearch: true },
  { name: 'settings', description: 'Open settings and configuration manager', excludeFromSearch: true },
  { name: 'snippet', description: 'Copy a saved snippet to the clipboard' },
  { name: 'teams', description: 'Open a Teams chat with a contact' },
  { name: 'term', description: 'Open or run a command in the persistent terminal', excludeFromSearch: true },
  { name: 'text', description: 'Analyze text statistics, sort, deduplicate, and join lines', excludeFromSearch: true },
  { name: 'timer', description: 'Open Pomodoro and countdown focus timer panel', excludeFromSearch: true },
  { name: 'tz', description: 'Convert timestamps and timezones to local time', excludeFromSearch: true },
  { name: 'unit', description: 'Convert data units, bandwidth, physical units, and number bases', excludeFromSearch: true },
  { name: 'url', description: 'Parse URL components, extract query parameters, and build cURL snippets', excludeFromSearch: true },
  { name: 'uuid', description: 'Generate UUIDs/GUIDs in multiple formats and inspect IDs', excludeFromSearch: true },
  { name: 'view', description: 'Toggle the command bar or change its position', excludeFromSearch: true },
  { name: 'control', description: 'Toggle active keyboard and mouse input sharing with another computer (/control #)', excludeFromSearch: true },
  { name: 'cert', description: 'Inspect SSL/TLS certificates, expiry dates, SANs, and cipher suites (alias: /ssl)', excludeFromSearch: true },
  { name: 'curl', description: 'Convert cURL commands to code (fetch, Python, Go) or probe HTTP endpoints', excludeFromSearch: true },
  { name: 'diff', description: 'Compare text and JSON snippets, clipboard vs input, and inspect changes', excludeFromSearch: true },
  { name: 'dns', description: 'Lookup DNS records (A, AAAA, MX, TXT, CNAME, NS) and propagation (alias: /dig)', excludeFromSearch: true },
  { name: 'docker', description: 'Manage Docker containers, inspect status/ports, logs, and prune images', excludeFromSearch: true },
  { name: 'env', description: 'Search environment variables, inspect PATH directories, and parse .env files', excludeFromSearch: true },
  { name: 'expmod', description: 'Explore PowerShell & Python modules, cmdlets, functions, and help', excludeFromSearch: true },
  { name: 'ssh', description: 'Connect to SSH hosts from ~/.ssh/config or saved connections' },
  { name: 'proc', description: 'Inspect running processes by RAM/CPU and kill hung tasks (alias: /ps, Ctrl+Enter elevated)', excludeFromSearch: true },
  { name: 'svc', description: 'Browse, start, stop, and restart Windows Services', excludeFromSearch: true },
  { name: 'wsl', description: 'Launch WSL Linux distributions in terminal or File Explorer', excludeFromSearch: true },
  { name: 'pkg', description: 'Inspect developer runtimes (Node, Python, Go, Rust, Git, .NET, Docker) and manage WinGet packages (alias: /winget)', excludeFromSearch: true },
  { name: 'system', description: 'Open System Management panel — WinGet package manager, updates, pins, and system tools (alias: /sys)', excludeFromSearch: true },
  { name: 'clip', description: 'Browse recent clipboard history, format JSON, or transform copied text', excludeFromSearch: true },
  { name: 'key', description: 'Inspect keyboard events, key codes, Windows VK codes, and accelerators (alias: /kbd)', excludeFromSearch: true },
  { name: 'show', description: 'Show the persistent command dock on screen', excludeFromSearch: true },
  { name: 'hide', description: 'Hide the persistent command dock from the screen', excludeFromSearch: true },
  { name: 'shortcuts', description: 'Open the customizable Shortcuts Overlay window (Favorites, PowerToys, Docker, Windows, Dev; alias: /sc)', excludeFromSearch: true },
  { name: 'jobs', description: 'Manage, schedule, and trigger automated scripts, cron jobs, and lifecycle hooks (alias: /schedule)', excludeFromSearch: true },
  { name: 'textual', description: 'Launch Python Textual TUI apps in embedded terminal or temporary window (alias: /tui)' }
]

// Commands that can participate in the "search" command's fan-out. Used both to build the
// SEARCHABLE dispatch table in commands/search.ts and to drive the "Search Commands" toggle
// screen in ConfigManager.tsx.
export const SEARCHABLE_COMMAND_NAMES: Exclude<CommandName, 'calc' | 'search' | 'view' | 'term' | 'restart' | 'default' | 'settings' | 'control' | 'release' | 'exit' | 'profile' | 'history' | 'show' | 'hide' | 'system' | 'shortcuts' | 'jobs'>[] = [
  'app',
  'case',
  'chmod',
  'color',
  'cron',
  'curl',
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
  'uuid',
  'diff',
  'env',
  'expmod',
  'ssh',
  'clip',
  'key',
  'textual'
]

const SEARCHABLE_SET = new Set<CommandName>(SEARCHABLE_COMMAND_NAMES)

// Default commands excluded from "/search" fan-out based on `excludeFromSearch: true` on COMMANDS.
export const DEFAULT_SEARCH_EXCLUDED_COMMANDS: CommandName[] = COMMANDS.filter(
  (c) => c.excludeFromSearch && SEARCHABLE_SET.has(c.name)
).map((c) => c.name)

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
      description: 'Git, HTTP, JSON, RegEx, cron, scheduled jobs, Textual TUIs, Docker, DNS, and terminal',
      commands: ['git', 'repo', 'ssh', 'wsl', 'pkg', 'expmod', 'textual', 'proc', 'svc', 'http', 'json', 'regex', 'cron', 'jobs', 'term', 'custom', 'docker', 'env', 'diff', 'cert', 'curl', 'dns', 'key']
    },
    {
      id: 'folder:utils',
      name: 'Utilities',
      icon: '🛠️',
      description: 'Calculators, text, encoding, units, and generators',
      commands: [
        'calc',
        'clip',
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
        'timer',
        'ip',
        'port',
        'chmod'
      ]
    },
    {
      id: 'folder:sys',
      name: 'System',
      icon: '⚙️',
      description: 'Profile, settings, system management, shortcuts, control, history, and system controls',
      commands: ['system', 'shortcuts', 'profile', 'settings', 'notifications', 'default', 'history', 'view', 'show', 'hide', 'control', 'release', 'restart', 'exit']
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
  executeOnEnter?: boolean
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
  // Optional flag ("ExcludeFromSearch": true in JSON) to omit this custom command from "/search" fan-out.
  excludeFromSearch?: boolean
  // Optional schedule ("Schedule": "0 9 * * *" or "@startup" / "@unlock" / "@resume" / "@network")
  // or interval in minutes ("IntervalMinutes": 30) to automatically register as a scheduled job.
  schedule?: string
  intervalMinutes?: number
  // Optional Python Textual TUI app target ("Textual": "path/to/app.py" or true) and default
  // launch mode ("DefaultWindow": "embedded" | "window" | "external"). Enter opens in the
  // default mode (embedded terminal by default); Ctrl+Enter opens in a separate TUI window.
  textual?: string | boolean
  defaultWindow?: TextualLaunchMode
}

export type ConfigType =
  | 'contacts'
  | 'snippets'
  | 'links'
  | 'teamLinks'
  | 'settings'
  | 'peers'
  | 'sshHosts'
  | 'textualApps'

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
    label: 'Edit Teams Links',
    description: 'Manually add or edit deep links to actual Teams teams/channels, shown alongside contacts in /teams',
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
    type: 'sshHosts',
    label: 'SSH Hosts',
    description: 'Saved SSH connections for /ssh (alongside ~/.ssh/config)',
    titleField: 'name',
    subtitleField: 'host',
    fields: [
      { key: 'name', label: 'Name / Alias', type: 'text' },
      { key: 'host', label: 'Hostname / IP Address', type: 'text' },
      { key: 'user', label: 'Username (optional)', type: 'text' },
      { key: 'port', label: 'Port (optional, default 22)', type: 'number' },
      { key: 'identityFile', label: 'Identity Key File (optional, e.g. ~/.ssh/id_ed25519)', type: 'text' },
      { key: 'extraArgs', label: 'Extra SSH Flags (optional, e.g. -L 8080:localhost:80)', type: 'text' },
      { key: 'description', label: 'Description / Notes', type: 'text' }
    ]
  },
  {
    type: 'textualApps',
    label: 'Textual TUI Apps',
    description: 'Saved Python Textual TUI apps for /textual (/tui) alongside ~/.sudolaunch/textual/',
    titleField: 'name',
    subtitleField: 'scriptPath',
    fields: [
      { key: 'name', label: 'App Name', type: 'text' },
      { key: 'scriptPath', label: 'Script or Project Path (e.g. C:\\Projects\\my-tui\\app.py)', type: 'text' },
      { key: 'args', label: 'Arguments (optional)', type: 'text' },
      { key: 'cwd', label: 'Working Directory (optional, defaults to script folder)', type: 'text' },
      { key: 'pythonPath', label: 'Runner Override (optional: auto, uv, textual, or python.exe path)', type: 'text' },
      { key: 'defaultMode', label: 'Default Mode (embedded, window, or external — default: embedded)', type: 'text' },
      { key: 'description', label: 'Description / Notes', type: 'text' }
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
      { key: 'textualFolder', label: 'Textual apps folder (relative to ~/.sudolaunch, default "textual")', type: 'text' },
      { key: 'swapEnabled', label: 'Enable Input Sharing (/control)', type: 'boolean' },
      { key: 'swapMachineId', label: 'This Machine # (e.g. 1)', type: 'number' },
      { key: 'swapPort', label: 'Swap Port (default 41234)', type: 'number' },
      { key: 'swapToggleHotkey', label: 'Swap Toggle Hotkey (ScrollLock / Pause / Control+Alt+S)', type: 'text' },
      { key: 'autoReturnHome', label: 'Auto-return dock to home position (above clock)', type: 'boolean' },
      { key: 'dockHomePosition', label: 'Dock home position anchor (left, middle, right, custom)', type: 'text' },
      { key: 'autoReturnDelaySec', label: 'Auto-return delay in seconds', type: 'number' },
      { key: 'terminalWidth', label: 'Terminal window width (px, default 800)', type: 'number' },
      { key: 'monitor', label: 'Dock monitor (1-based, default 1)', type: 'number' },
      { key: 'dockGlowColor', label: 'Dock glow color (e.g. #5aa0ff, cyan, dark purple, black)', type: 'text' },
      { key: 'dockGlowStyle', label: 'Dock glow style (breathing, steady, stealth)', type: 'text' }
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
