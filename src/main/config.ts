import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { watch as chokidarWatch } from 'chokidar'
import type {
  Contact,
  Snippet,
  Link,
  TeamLink,
  HistoryEntry,
  Settings,
  ConfigType,
  ConfigEntry
} from '../shared/types'

export const CONFIG_DIR = join(app.getPath('home'), '.sudolaunch')

const PATHS = {
  contacts: join(CONFIG_DIR, 'contacts.json'),
  snippets: join(CONFIG_DIR, 'snippets.json'),
  links: join(CONFIG_DIR, 'links.json'),
  teamLinks: join(CONFIG_DIR, 'teamLinks.json'),
  history: join(CONFIG_DIR, 'history.json'),
  settings: join(CONFIG_DIR, 'settings.json')
}

const DEFAULT_SETTINGS: Settings = {
  hotkey: 'CommandOrControl+Space',
  terminalHotkey: 'Control+Alt+T',
  historyEnabled: true,
  historyLimit: 25,
  autoStart: true,
  disableMouseInput: false,
  defaultCommand: '',
  disabledApps: [],
  teamsShortcut: 't',
  favShortcut: 'f',
  snippetShortcut: 's',
  searchExcludedCommands: [],
  hiddenCommands: [],
  gifFolder: 'gif',
  lookupFolder: 'lookup',
  barEnabled: true,
  barPosition: null,
  termPosition: null,
  termWindowPosition: null
}

const SEED_CONTACTS: Contact[] = [
  { name: 'Jane Doe', alias: 'jane.doe', email: 'jane.doe@example.com', teamsId: 'jane.doe@example.com' }
]

function seedFile(path: string, defaultValue: unknown): void {
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify(defaultValue, null, 2), 'utf-8')
  }
}

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
  seedFile(PATHS.contacts, SEED_CONTACTS)
  seedFile(PATHS.snippets, [] as Snippet[])
  seedFile(PATHS.links, [] as Link[])
  seedFile(PATHS.teamLinks, [] as TeamLink[])
  seedFile(PATHS.history, [] as HistoryEntry[])
  seedFile(PATHS.settings, DEFAULT_SETTINGS)
}

function readJson<T>(path: string, fallback: T): T {
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function readContacts(): Contact[] {
  return readJson<Contact[]>(PATHS.contacts, [])
}

export function readSnippets(): Snippet[] {
  return readJson<Snippet[]>(PATHS.snippets, [])
}

export function readLinks(): Link[] {
  return readJson<Link[]>(PATHS.links, [])
}

export function readTeamLinks(): TeamLink[] {
  return readJson<TeamLink[]>(PATHS.teamLinks, [])
}

export function readSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(PATHS.settings, {}) }
}

export function readHistory(): HistoryEntry[] {
  return readJson<HistoryEntry[]>(PATHS.history, [])
}

export function writeHistory(entries: HistoryEntry[]): void {
  writeFileSync(PATHS.history, JSON.stringify(entries, null, 2), 'utf-8')
}

export function writeContacts(contacts: Contact[]): void {
  writeFileSync(PATHS.contacts, JSON.stringify(contacts, null, 2), 'utf-8')
}

export function writeSnippets(snippets: Snippet[]): void {
  writeFileSync(PATHS.snippets, JSON.stringify(snippets, null, 2), 'utf-8')
}

export function writeLinks(links: Link[]): void {
  writeFileSync(PATHS.links, JSON.stringify(links, null, 2), 'utf-8')
}

export function writeTeamLinks(teamLinks: TeamLink[]): void {
  writeFileSync(PATHS.teamLinks, JSON.stringify(teamLinks, null, 2), 'utf-8')
}

export function writeSettings(settings: Settings): void {
  writeFileSync(PATHS.settings, JSON.stringify(settings, null, 2), 'utf-8')
}

// Generic CRUD used by the "/settings" in-app config editor. Each list-backed config type
// (contacts/snippets/links) is just an array of plain objects; settings is a single
// object treated as one "entry" that can only be edited, never added or deleted.
export function getConfigEntries(type: ConfigType): ConfigEntry[] {
  switch (type) {
    case 'contacts':
      return readContacts() as unknown as ConfigEntry[]
    case 'snippets':
      return readSnippets() as unknown as ConfigEntry[]
    case 'links':
      return readLinks() as unknown as ConfigEntry[]
    case 'teamLinks':
      return readTeamLinks() as unknown as ConfigEntry[]
    case 'settings':
      return [readSettings() as unknown as ConfigEntry]
  }
}

function writeConfigList(type: Exclude<ConfigType, 'settings'>, list: ConfigEntry[]): void {
  switch (type) {
    case 'contacts':
      return writeContacts(list as unknown as Contact[])
    case 'snippets':
      return writeSnippets(list as unknown as Snippet[])
    case 'links':
      return writeLinks(list as unknown as Link[])
    case 'teamLinks':
      return writeTeamLinks(list as unknown as TeamLink[])
  }
}

export function saveConfigEntry(type: ConfigType, entry: ConfigEntry, index: number | null): void {
  if (type === 'settings') {
    writeSettings({ ...readSettings(), ...entry } as unknown as Settings)
    return
  }
  const list = getConfigEntries(type)
  if (index !== null && index >= 0 && index < list.length) {
    list[index] = entry
  } else {
    list.push(entry)
  }
  writeConfigList(type, list)
}

export function deleteConfigEntry(type: ConfigType, index: number): void {
  if (type === 'settings') return
  const list = getConfigEntries(type)
  list.splice(index, 1)
  writeConfigList(type, list)
}

function watchFiles(paths: string[], onChange: (path: string) => void): void {
  chokidarWatch(paths, {
    persistent: false,
    ignoreInitial: true,
    // Wait for the file to stop changing before firing — hand-edits and some
    // editors save via truncate+write-in-chunks or temp-file+rename, and a raw
    // fs.watch 'change' event can fire mid-write (or be missed on rename).
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }
  })
    .on('change', onChange)
    .on('add', onChange)
}

export function watchConfig(onChange: () => void): void {
  watchFiles([PATHS.contacts, PATHS.snippets, PATHS.links, PATHS.teamLinks], () => onChange())
}

export function watchSettings(onChange: (settings: Settings) => void): void {
  watchFiles([PATHS.settings], () => onChange(readSettings()))
}

export { PATHS as CONFIG_PATHS }
