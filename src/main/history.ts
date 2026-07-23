import { readHistory, writeHistory, readSettings } from './config'
import type { HistoryEntry, CommandName } from '../shared/types'

export function recordHistory(command: CommandName, query: string, label: string, value: string): void {
  const { historyLimit } = readSettings()
  // Dedupe by the resolved target (value), not the typed query — re-running the same
  // contact/snippet/link/app via a different search string should still bump one entry.
  const entries = readHistory().filter((e) => !(e.command === command && e.value === value))

  const entry: HistoryEntry = {
    command,
    query,
    label,
    value,
    timestamp: new Date().toISOString()
  }

  entries.unshift(entry)
  writeHistory(entries.slice(0, historyLimit))
}

export function getHistory(): HistoryEntry[] {
  const { historyLimit } = readSettings()
  // Entries recorded before `value` was tracked are unusable (re-running them would target
  // an empty/wrong value) — drop them rather than surface a broken history item.
  return readHistory()
    .filter((e) => !!e.value)
    .slice(0, historyLimit)
}
