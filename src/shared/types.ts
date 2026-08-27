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
  | 'custom'
  | 'default'
  | 'fav'
  | 'focus'
  | 'gif'
  | 'lookup'
  | 'mail'
  | 'restart'
  | 'search'
  | 'snippet'
  | 'teams'
  | 'term'
  | 'view'

export interface CommandDef {
  name: CommandName
  description: string
}

export const COMMANDS: CommandDef[] = [
  { name: 'app', description: 'Launch an installed application' },
  { name: 'calc', description: 'Evaluate a math expression' },
  { name: 'custom', description: 'Run a custom command, or browse a folder of scripts' },
  { name: 'default', description: 'Set the default command that shows first in suggestions' },
  { name: 'fav', description: 'Open a saved link in the browser' },
  { name: 'focus', description: 'Bring an open window to the front' },
  { name: 'gif', description: 'Copy a GIF from your GIF folder to the clipboard' },
  { name: 'lookup', description: 'Search a local JSON data table' },
  { name: 'mail', description: 'Compose an email to a contact' },
  { name: 'restart', description: 'Relaunch the application' },
  { name: 'search', description: 'Search across other commands at once' },
  { name: 'snippet', description: 'Copy a saved snippet to the clipboard' },
  { name: 'teams', description: 'Open a Teams chat with a contact' },
  { name: 'term', description: 'Expand/collapse the persistent terminal' },
  { name: 'view', description: 'Toggle the command bar or change its position' }
]

// Commands that participate in the "search" command's fan-out — everything except
// "calc" (not search-shaped) and "search" itself. Used both to build the SEARCHABLE
// dispatch table in commands/search.ts and to drive the "Search Commands" toggle
// screen in ConfigManager.tsx.
export const SEARCHABLE_COMMAND_NAMES: Exclude<CommandName, 'calc' | 'search' | 'view' | 'term' | 'restart' | 'default'>[] = [
  'app',
  'custom',
  'fav',
  'focus',
  'gif',
  'lookup',
  'mail',
  'snippet',
  'teams'
]

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
}

export type ConfigType = 'contacts' | 'snippets' | 'links' | 'teamLinks' | 'settings'

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
      { key: 'lookupFolder', label: 'Lookup folder (relative to ~/.sudolaunch, e.g. "lookup")', type: 'text' }
    ]
  }
]
