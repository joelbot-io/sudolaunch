import { app } from 'electron'
import { existsSync, mkdirSync, promises as fsPromises, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { watch as chokidarWatch } from 'chokidar'
import { DEFAULT_SHELF_ICONS, DEFAULT_SEARCH_EXCLUDED_COMMANDS } from '../shared/types'
import type {
  Contact,
  Snippet,
  Link,
  TeamLink,
  HistoryEntry,
  Settings,
  ConfigType,
  ConfigEntry,
  SwapPeer,
  SshHost,
  TextualAppEntry
} from '../shared/types'

export const CONFIG_DIR = join(app.getPath('home'), '.sudolaunch')
export const ARCHIVES_DIR = join(app.getPath('home'), '.sudolaunch-archives')
export const PROFILES_DIR = join(app.getPath('home'), '.sudolaunch-profiles')

const PATHS = {
  contacts: join(CONFIG_DIR, 'contacts.json'),
  snippets: join(CONFIG_DIR, 'snippets.json'),
  links: join(CONFIG_DIR, 'links.json'),
  teamLinks: join(CONFIG_DIR, 'teamLinks.json'),
  peers: join(CONFIG_DIR, 'peers.json'),
  sshHosts: join(CONFIG_DIR, 'ssh.json'),
  textualApps: join(CONFIG_DIR, 'textualApps.json'),
  history: join(CONFIG_DIR, 'history.json'),
  settings: join(CONFIG_DIR, 'settings.json')
}

export const DEFAULT_SETTINGS: Settings = {
  hotkey: 'CommandOrControl+Space',
  terminalHotkey: 'CommandOrControl+`',
  historyEnabled: true,
  historyLimit: 100,
  autoStart: false,
  disableMouseInput: false,
  defaultCommand: '',
  disabledApps: [],
  teamsShortcut: 't',
  favShortcut: 'f',
  snippetShortcut: 's',
  searchExcludedCommands: [...DEFAULT_SEARCH_EXCLUDED_COMMANDS],
  hiddenCommands: [],
  gifFolder: '',
  lookupFolder: '',
  textualFolder: 'textual',
  dockLayout: 'shelf',
  barEnabled: true,
  barPosition: null,
  termPosition: null,
  termWindowPosition: null,
  shortcutsWindowPosition: null,
  shortcutsWindowSize: null,
  shortcutsStayOpen: true,
  shortcutsGrayscale: false,
  swapEnabled: true,
  swapMachineId: 1,
  swapPort: 41234,
  swapToggleHotkey: 'ScrollLock',
  autoReturnHome: true,
  autoReturnDelaySec: 8,
  dockHomePosition: 'middle',
  dockHomeCustomCoordinates: { x: 50, y: 80 },
  shelfIcons: DEFAULT_SHELF_ICONS,
  activeProfile: 'default',
  terminalWidth: 800,
  terminalHeight: 360,
  monitor: 1,
  dockGlowColor: '#5aa0ff',
  dockGlowStyle: 'breathing'
}

export const SEED_PEERS: SwapPeer[] = [
  { id: 2, name: 'Secondary PC', host: '192.168.1.105', port: 41234 }
]

export const SEED_CONTACTS: Contact[] = [
  { name: 'Jane Doe', alias: 'jane.doe', email: 'jane.doe@example.com', teamsId: 'jane.doe@example.com' }
]

// In-memory caches to avoid synchronous disk reads + JSON parsing on every search keystroke.
// Invalidated automatically on write* calls and Chokidar file-change notifications.
let cachedContacts: Contact[] | null = null
let cachedSnippets: Snippet[] | null = null
let cachedLinks: Link[] | null = null
let cachedTeamLinks: TeamLink[] | null = null
let cachedPeers: SwapPeer[] | null = null
let cachedSshHosts: SshHost[] | null = null
let cachedTextualApps: TextualAppEntry[] | null = null
let cachedSettings: Settings | null = null
let cachedHistory: HistoryEntry[] | null = null

export function invalidateConfigCache(): void {
  cachedContacts = null
  cachedSnippets = null
  cachedLinks = null
  cachedTeamLinks = null
  cachedPeers = null
  cachedSshHosts = null
  cachedTextualApps = null
  cachedSettings = null
  cachedHistory = null
}

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
  seedFile(PATHS.peers, SEED_PEERS)
  seedFile(PATHS.sshHosts, [] as SshHost[])
  seedFile(PATHS.textualApps, [] as TextualAppEntry[])
  seedFile(PATHS.history, [] as HistoryEntry[])
  seedFile(PATHS.settings, DEFAULT_SETTINGS)
}

function readJson<T>(path: string, fallback: T): T {
  try {
    const raw = readFileSync(path, 'utf-8').replace(/^\uFEFF/, '')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function readContacts(): Contact[] {
  if (!cachedContacts) {
    cachedContacts = readJson<Contact[]>(PATHS.contacts, [])
  }
  return cachedContacts
}

export function readSnippets(): Snippet[] {
  if (!cachedSnippets) {
    cachedSnippets = readJson<Snippet[]>(PATHS.snippets, [])
  }
  return cachedSnippets
}

export function readLinks(): Link[] {
  if (!cachedLinks) {
    cachedLinks = readJson<Link[]>(PATHS.links, [])
  }
  return cachedLinks
}

export function readTeamLinks(): TeamLink[] {
  if (!cachedTeamLinks) {
    cachedTeamLinks = readJson<TeamLink[]>(PATHS.teamLinks, [])
  }
  return cachedTeamLinks
}

export function readPeers(): SwapPeer[] {
  if (!cachedPeers) {
    cachedPeers = readJson<SwapPeer[]>(PATHS.peers, [])
  }
  return cachedPeers
}

export function readSshHosts(): SshHost[] {
  if (!cachedSshHosts) {
    cachedSshHosts = readJson<SshHost[]>(PATHS.sshHosts, [])
  }
  return cachedSshHosts
}

export function readTextualApps(): TextualAppEntry[] {
  if (!cachedTextualApps) {
    cachedTextualApps = readJson<TextualAppEntry[]>(PATHS.textualApps, [])
  }
  return cachedTextualApps
}

export function readSettings(): Settings {
  if (cachedSettings) return cachedSettings
  const rawSettings = readJson<Partial<Settings>>(PATHS.settings, {})
  const loaded: Settings = { ...DEFAULT_SETTINGS, ...rawSettings }
  if (
    Array.isArray(loaded.shelfIcons) &&
    ((loaded.shelfIcons.length === 5 &&
      loaded.shelfIcons[0] === 'term' &&
      loaded.shelfIcons[1] === 'bar' &&
      loaded.shelfIcons[2] === 'notify' &&
      loaded.shelfIcons[3] === 'focus' &&
      loaded.shelfIcons[4] === 'git') ||
      (loaded.shelfIcons.length === 6 &&
        loaded.shelfIcons[0] === 'term' &&
        loaded.shelfIcons[1] === 'notify' &&
        loaded.shelfIcons[2] === 'bar' &&
        loaded.shelfIcons[3] === 'focus' &&
        loaded.shelfIcons[4] === 'git' &&
        loaded.shelfIcons[5] === 'system') ||
      (loaded.shelfIcons.length === 7 &&
        loaded.shelfIcons[0] === 'term' &&
        loaded.shelfIcons[1] === 'notify' &&
        loaded.shelfIcons[2] === 'bar' &&
        loaded.shelfIcons[3] === 'shortcuts' &&
        loaded.shelfIcons[4] === 'focus' &&
        loaded.shelfIcons[5] === 'git' &&
        loaded.shelfIcons[6] === 'system'))
  ) {
    loaded.shelfIcons = [...DEFAULT_SHELF_ICONS]
  }
  if (!Array.isArray(loaded.searchExcludedCommands)) {
    loaded.searchExcludedCommands = [...DEFAULT_SEARCH_EXCLUDED_COMMANDS]
  }
  cachedSettings = loaded
  return loaded
}

export function readHistory(): HistoryEntry[] {
  if (!cachedHistory) {
    cachedHistory = readJson<HistoryEntry[]>(PATHS.history, [])
  }
  return cachedHistory
}

const pendingWriteTimers = new Map<string, NodeJS.Timeout>()
const pendingWriteData = new Map<string, unknown>()
const internalWriteSuppressUntil = new Map<string, number>()

function scheduleJsonWrite(path: string, data: unknown): void {
  pendingWriteData.set(path, data)
  internalWriteSuppressUntil.set(path, Date.now() + 800)

  const existing = pendingWriteTimers.get(path)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    pendingWriteTimers.delete(path)
    const latest = pendingWriteData.get(path)
    pendingWriteData.delete(path)
    if (latest === undefined) return
    internalWriteSuppressUntil.set(path, Date.now() + 800)
    const serialized = JSON.stringify(latest, null, 2)
    fsPromises.writeFile(path, serialized, 'utf-8').catch(() => {
      // Fallback if async write fails
    })
  }, 120)

  pendingWriteTimers.set(path, timer)
}

export function flushPendingConfigWrites(): void {
  for (const [path, timer] of pendingWriteTimers.entries()) {
    clearTimeout(timer)
    pendingWriteTimers.delete(path)
    const latest = pendingWriteData.get(path)
    pendingWriteData.delete(path)
    if (latest !== undefined) {
      try {
        writeFileSync(path, JSON.stringify(latest, null, 2), 'utf-8')
      } catch {
        // ignore
      }
    }
  }
}

export function writeHistory(entries: HistoryEntry[]): void {
  cachedHistory = entries
  scheduleJsonWrite(PATHS.history, entries)
}

export function writeContacts(contacts: Contact[]): void {
  cachedContacts = contacts
  scheduleJsonWrite(PATHS.contacts, contacts)
}

export function writeSnippets(snippets: Snippet[]): void {
  cachedSnippets = snippets
  scheduleJsonWrite(PATHS.snippets, snippets)
}

export function writeLinks(links: Link[]): void {
  cachedLinks = links
  scheduleJsonWrite(PATHS.links, links)
}

export function writeTeamLinks(teamLinks: TeamLink[]): void {
  cachedTeamLinks = teamLinks
  scheduleJsonWrite(PATHS.teamLinks, teamLinks)
}

export function writePeers(peers: SwapPeer[]): void {
  cachedPeers = peers
  scheduleJsonWrite(PATHS.peers, peers)
}

export function writeSshHosts(sshHosts: SshHost[]): void {
  cachedSshHosts = sshHosts
  scheduleJsonWrite(PATHS.sshHosts, sshHosts)
}

export function writeTextualApps(textualApps: TextualAppEntry[]): void {
  cachedTextualApps = textualApps
  scheduleJsonWrite(PATHS.textualApps, textualApps)
}

export function writeSettings(settings: Settings): void {
  cachedSettings = settings
  scheduleJsonWrite(PATHS.settings, settings)
}

// Generic CRUD used by the "/settings" in-app config editor. Each list-backed config type
// (contacts/snippets/links) is just an array of plain objects; settings is a single
// object treated as one "entry" that can only be edited, never added or deleted.
export function getConfigEntries(type: ConfigType): ConfigEntry[] {
  switch (type) {
    case 'contacts':
      return [...readContacts()] as unknown as ConfigEntry[]
    case 'snippets':
      return [...readSnippets()] as unknown as ConfigEntry[]
    case 'links':
      return [...readLinks()] as unknown as ConfigEntry[]
    case 'teamLinks':
      return [...readTeamLinks()] as unknown as ConfigEntry[]
    case 'peers':
      return [...readPeers()] as unknown as ConfigEntry[]
    case 'sshHosts':
      return [...readSshHosts()] as unknown as ConfigEntry[]
    case 'textualApps':
      return [...readTextualApps()] as unknown as ConfigEntry[]
    case 'settings':
      return [{ ...readSettings() } as unknown as ConfigEntry]
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
    case 'peers':
      return writePeers(list as unknown as SwapPeer[])
    case 'sshHosts':
      return writeSshHosts(list as unknown as SshHost[])
    case 'textualApps':
      return writeTextualApps(list as unknown as TextualAppEntry[])
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
  watchFiles(
    [PATHS.contacts, PATHS.snippets, PATHS.links, PATHS.teamLinks, PATHS.peers, PATHS.sshHosts, PATHS.textualApps],
    (changedPath) => {
      const suppressUntil = internalWriteSuppressUntil.get(changedPath) ?? 0
      if (Date.now() > suppressUntil) {
        cachedContacts = null
        cachedSnippets = null
        cachedLinks = null
        cachedTeamLinks = null
        cachedPeers = null
        cachedSshHosts = null
        cachedTextualApps = null
      }
      onChange()
    }
  )
}

export function watchSettings(onChange: (settings: Settings) => void): void {
  watchFiles([PATHS.settings], () => {
    const suppressUntil = internalWriteSuppressUntil.get(PATHS.settings) ?? 0
    if (Date.now() > suppressUntil && !pendingWriteTimers.has(PATHS.settings)) {
      cachedSettings = null
    }
    onChange(readSettings())
  })
}

export { PATHS as CONFIG_PATHS }
