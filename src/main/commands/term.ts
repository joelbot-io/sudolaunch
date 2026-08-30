import type { SearchResultItem } from '../../shared/types'
import { toggleTerminal, runInTerminal } from '../terminalWindow'

export function search(query: string): SearchResultItem[] {
  const q = query.trim()
  if (!q) {
    return [
      {
        label: 'Open Terminal',
        sublabel: 'Expand the PowerShell console',
        value: 'toggle'
      }
    ]
  }
  return [
    {
      label: `Run "${q}" in Terminal`,
      sublabel: 'Opens PowerShell and executes this command',
      value: q
    }
  ]
}

export async function execute(item: SearchResultItem, query: string): Promise<void> {
  const target = item.value || query.trim()
  if (!target || target === 'toggle') {
    toggleTerminal()
  } else {
    runInTerminal(target)
  }
}
