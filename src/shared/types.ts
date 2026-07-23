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

export interface HistoryEntry {
  command: CommandName
  query: string
  label: string
  value: string
  timestamp: string
}

export interface Settings {
  hotkey: string
  historyLimit: number
  autoStart: boolean
  // Paths (from AppEntry.path) excluded from the "app" launcher. Empty by default — show all.
  disabledApps: string[]
  // Single-character aliases: typing "/<char> ..." runs the command directly, same as
  // typing out its full name. Only teams/call/link get shortcuts (by design).
  teamsShortcut: string
  callShortcut: string
  linkShortcut: string
  // Root folder browsed/launched from by the "script" command. Empty by default — unset.
  scriptsFolder: string
}

export interface AppEntry {
  name: string
  path: string
}

export type CommandName = 'teams' | 'call' | 'mail' | 'snippet' | 'link' | 'app' | 'calc' | 'script'

export interface CommandDef {
  name: CommandName
  description: string
}

export const COMMANDS: CommandDef[] = [
  { name: 'teams', description: 'Open a Teams chat with a contact' },
  { name: 'call', description: 'Start a Teams call with a contact' },
  { name: 'mail', description: 'Compose an email to a contact' },
  { name: 'snippet', description: 'Copy a saved snippet to the clipboard' },
  { name: 'link', description: 'Open a saved link in the browser' },
  { name: 'app', description: 'Launch an installed application' },
  { name: 'calc', description: 'Evaluate a math expression' },
  { name: 'script', description: 'Launch a Python or PowerShell script' }
]

export interface SearchResultItem {
  label: string
  sublabel?: string
  value: string
  // Used only by the "script" command's folder-drill-down results.
  isDirectory?: boolean
  disabled?: boolean
}

export type ConfigType = 'contacts' | 'snippets' | 'links' | 'settings'

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
    description: 'People you message, call, or email',
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
    type: 'settings',
    label: 'Settings',
    description: 'Hotkey, history limit, auto-start, and command shortcuts',
    titleField: 'hotkey',
    singleton: true,
    fields: [
      { key: 'hotkey', label: 'Hotkey', type: 'text' },
      { key: 'historyLimit', label: 'History limit', type: 'number' },
      { key: 'autoStart', label: 'Auto-start', type: 'boolean' },
      { key: 'teamsShortcut', label: 'Teams shortcut (e.g. t)', type: 'text' },
      { key: 'callShortcut', label: 'Call shortcut (e.g. c)', type: 'text' },
      { key: 'linkShortcut', label: 'Link shortcut (e.g. l)', type: 'text' },
      { key: 'scriptsFolder', label: 'Scripts folder', type: 'text' }
    ]
  }
]
