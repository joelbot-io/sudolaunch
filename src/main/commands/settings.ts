import Fuse from 'fuse.js'
import type { SearchResultItem } from '../../shared/types'

interface SettingsAction {
  label: string
  sublabel: string
  value: string
  keywords: string[]
}

const SETTINGS_ACTIONS: SettingsAction[] = [
  {
    label: 'Settings',
    sublabel: 'Hotkey, history limit, auto-start, terminal, and command shortcuts',
    value: '__settings',
    keywords: [
      'settings',
      'edit',
      'system',
      'system settings',
      'preferences',
      'hotkey',
      'hotkeys',
      'shortcuts',
      'history',
      'autostart',
      'auto-start',
      'terminal',
      'options',
      'config',
      'configuration'
    ]
  },
  {
    label: 'Contacts',
    sublabel: 'People you message or email',
    value: '__contacts',
    keywords: ['contacts', 'people', 'email', 'teams', 'message', 'alias', 'address book']
  },
  {
    label: 'Snippets',
    sublabel: 'Saved text you copy to the clipboard',
    value: '__snippets',
    keywords: ['snippets', 'text', 'clipboard', 'template', 'templates', 'canned', 'responses', 'copy']
  },
  {
    label: 'Links',
    sublabel: 'Saved URLs you open in the browser',
    value: '__links',
    keywords: ['links', 'urls', 'bookmarks', 'favorites', 'web', 'browser', 'sites']
  },
  {
    label: 'Teams Links',
    sublabel: 'Deep links to actual Teams teams/channels',
    value: '__teamLinks',
    keywords: ['teams', 'teams links', 'channels', 'deep links', 'chat', 'groups', 'microsoft teams']
  },
  {
    label: 'Swap Peers',
    sublabel: 'Computers configured for input sharing via /control',
    value: '__peers',
    keywords: ['peers', 'swap', 'control', 'swap peers', 'machines', 'computers', 'remote', 'network', 'input sharing', 'ip', 'host']
  },
  {
    label: 'App Visibility',
    sublabel: 'Choose which apps appear in the app launcher',
    value: '__apps',
    keywords: ['apps', 'app visibility', 'applications', 'launcher', 'show', 'hide', 'filter apps']
  },
  {
    label: 'Search Commands',
    sublabel: 'Choose which commands the "search" command fans out to',
    value: '__searchCommands',
    keywords: ['search', 'search commands', 'fanout', 'include', 'exclude', 'fan out', 'query']
  },
  {
    label: 'Command Visibility',
    sublabel: 'Choose which commands appear in the command palette UI',
    value: '__hiddenCommands',
    keywords: ['commands', 'command visibility', 'hidden commands', 'hide', 'show', 'palette', 'visibility']
  },
  {
    label: 'Default Command',
    sublabel: 'Choose which command appears first in suggestions',
    value: '__defaultCommand',
    keywords: ['default', 'default command', 'priority', 'order', 'first', 'fallback']
  },
  {
    label: 'Command Layout',
    sublabel: 'Rearrange commands, organize into subfolders, and configure display order',
    value: '__commandLayout',
    keywords: [
      'command layout',
      'rearrange',
      'reorder',
      'folders',
      'subfolders',
      'categories',
      'organization',
      'order',
      'move',
      'layout',
      'commands'
    ]
  },
  {
    label: 'All Settings',
    sublabel: 'View all configuration categories and options',
    value: '__types',
    keywords: ['all', 'all settings', 'overview', 'categories', 'types', 'menu', 'everything']
  },
  {
    label: 'Open Config Folder',
    sublabel: 'Open %USERPROFILE%\\.sudolaunch in File Explorer',
    value: '__openConfigFolder',
    keywords: ['open config folder', 'folder', 'explorer', 'directory', 'path', 'files', 'json', 'profile']
  }
]

const fuse = new Fuse(SETTINGS_ACTIONS, {
  keys: [
    { name: 'label', weight: 0.4 },
    { name: 'keywords', weight: 0.4 },
    { name: 'sublabel', weight: 0.2 }
  ],
  threshold: 0.35,
  ignoreLocation: true
})

export function search(query: string = ''): SearchResultItem[] {
  const trimmed = query.trim()
  const list = trimmed ? fuse.search(trimmed).map((r) => r.item) : SETTINGS_ACTIONS
  return list.map((a) => ({
    label: a.label,
    sublabel: a.sublabel,
    value: a.value
  }))
}

export async function execute(): Promise<void> {
  // Executed directly in renderer (opens ConfigManager view)
}

