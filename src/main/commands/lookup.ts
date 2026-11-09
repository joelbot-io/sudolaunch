import { clipboard, shell } from 'electron'
import Fuse from 'fuse.js'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import { basename, extname, join } from 'path'
import type { SearchResultItem } from '../../shared/types'
import { readSettings } from '../config'
import { resolveFolderRoot } from '../folderBrowse'

// Backs the "lookup" command — searches flat JSON-array "tables" dropped into the
// configured lookup folder (~/.sudolaunch/lookup by default). Fields are auto-detected
// rather than configured: label/sublabel come from the first two non-empty string
// fields on each record (by key order). Three drill-down levels, same "completion" +
// exact-match mechanic custom.ts uses for its folder/arg browsing:
//   /lookup                    -> list tables
//   /lookup <table>            -> fuzzy-search records, label/sublabel from the record
//   /lookup <table> #<i>       -> fields of record #i, label=field name, sublabel=value
// Selecting a field (not a record) copies just that field's value to the clipboard —
// which field is "the useful one" (a URL, an ID, ...) varies per table, so the user
// picks it instead of copying a fixed field or the whole record.

// Re-reads the setting (rather than hardcoding "lookup") so changing it in /settings
// gets the new folder auto-created too — same reasoning as gif.ts's ensureGifDir.
export function ensureLookupDir(): void {
  const { lookupFolder } = readSettings()
  const dir = resolveFolderRoot(lookupFolder)
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

type Record_ = Record<string, unknown>

const LOOKUP_CACHE_TTL_MS = 4000
let cachedTablesRoot = ''
let cachedTablesList: string[] = []
let cachedTablesFuse: Fuse<string> | null = null
let cachedTablesAt = 0
const cachedTableData = new Map<
  string,
  { at: number; records: Record_[]; fuse: Fuse<{ index: number; text: string }> }
>()

function listTables(root: string): string[] {
  const now = Date.now()
  if (root === cachedTablesRoot && now - cachedTablesAt < LOOKUP_CACHE_TTL_MS) {
    return cachedTablesList
  }
  let names: string[] = []
  try {
    names = readdirSync(root)
  } catch {
    return []
  }
  cachedTablesRoot = root
  cachedTablesAt = now
  cachedTablesList = names
    .filter((n) => extname(n).toLowerCase() === '.json')
    .map((n) => basename(n, extname(n)))
  cachedTablesFuse = new Fuse(cachedTablesList, { threshold: 0.35 })
  return cachedTablesList
}

function loadTableEntry(
  root: string,
  table: string
): { records: Record_[]; fuse: Fuse<{ index: number; text: string }> } {
  const key = `${root}::${table}`
  const now = Date.now()
  const hit = cachedTableData.get(key)
  if (hit && now - hit.at < LOOKUP_CACHE_TTL_MS) {
    return hit
  }
  try {
    const raw = readFileSync(join(root, `${table}.json`), 'utf-8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw)
    const records: Record_[] = Array.isArray(parsed) ? parsed : []
    const haystack = records.map((r, i) => ({
      index: i,
      text: stringFieldsOf(r)
        .map(([, v]) => v)
        .join(' ')
    }))
    const fuse = new Fuse(haystack, { keys: ['text'], threshold: 0.35 })
    const entry = { at: now, records, fuse }
    cachedTableData.set(key, entry)
    return entry
  } catch {
    const emptyFuse = new Fuse<{ index: number; text: string }>([], { keys: ['text'], threshold: 0.35 })
    return { records: [], fuse: emptyFuse }
  }
}

function stringFieldsOf(record: Record_): [string, string][] {
  return Object.entries(record).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''
  )
}

function toRecordItem(record: Record_, index: number, table: string): SearchResultItem {
  const stringFields = stringFieldsOf(record)
  return {
    label: stringFields[0]?.[1] ?? '(untitled)',
    sublabel: stringFields[1]?.[1],
    value: '',
    // Fills the input to drill into this record's fields rather than executing anything —
    // same completion-not-execute mechanic custom.ts uses for its own browsing levels.
    // "#<index>" is an opaque token into the already-loaded table, not user-editable text.
    completion: `/lookup ${table} #${index}`
  }
}

function toFieldItem(key: string, value: string): SearchResultItem {
  return { label: key, sublabel: value.length > 80 ? `${value.slice(0, 80)}…` : value, value }
}

function splitTableAndQuery(query: string): { table: string; rest: string } {
  const idx = query.indexOf(' ')
  return idx === -1 ? { table: query, rest: '' } : { table: query.slice(0, idx), rest: query.slice(idx + 1) }
}

export function search(query: string): SearchResultItem[] {
  const { lookupFolder } = readSettings()
  if (!lookupFolder) {
    return [{ label: 'Set a lookup folder in /settings first', value: '', disabled: true }]
  }
  const root = resolveFolderRoot(lookupFolder)
  if (!root) {
    return [{ label: 'Folder must be inside ~/.sudolaunch', value: '', disabled: true }]
  }

  const tables = listTables(root)
  if (tables.length === 0 && !query.trim()) {
    return [
      {
        label: 'No JSON tables found in folder',
        sublabel: `Drop .json data tables into ${root} · Press Enter to open folder`,
        value: 'open-folder'
      }
    ]
  }

  const { table, rest } = splitTableAndQuery(query)

  if (!tables.includes(table)) {
    const fuse = cachedTablesFuse ?? new Fuse(tables, { threshold: 0.35 })
    const matches = table ? fuse.search(table).map((r) => r.item) : tables
    return matches.map((t) => ({ label: t, value: '', completion: `/lookup ${t} ` }))
  }

  const { records, fuse: recordFuse } = loadTableEntry(root, table)

  // "#<index>" (from a record's completion, see toRecordItem) drills into that record's
  // fields instead of continuing to search records.
  const fieldMatch = /^#(\d+)$/.exec(rest)
  if (fieldMatch) {
    const record = records[Number(fieldMatch[1])]
    if (!record) {
      return [{ label: 'Record no longer exists', value: '', disabled: true }]
    }
    return stringFieldsOf(record).map(([key, value]) => toFieldItem(key, value))
  }

  if (!rest) return records.map((r, i) => toRecordItem(r, i, table))

  // Search the flattened string-field values (Fuse has no "every key of an arbitrary
  // object" pattern), then map matches back to their record's toRecordItem.
  const matched = recordFuse.search(rest).map((r) => r.item.index)
  return matched.map((i) => toRecordItem(records[i], i, table))
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.disabled || !item.value) return
  if (item.value === 'open-folder') {
    const { lookupFolder } = readSettings()
    const root = resolveFolderRoot(lookupFolder)
    if (root) await shell.openPath(root)
    return
  }
  clipboard.writeText(item.value)
}
