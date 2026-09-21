import type { SearchResultItem } from '../../shared/types'
import { toggleTerminal, runInTerminal } from '../terminalWindow'
import { runElevated } from '../elevation'

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
      sublabel: 'Opens PowerShell and executes this command (Ctrl+Enter for elevated)',
      value: q
    }
  ]
}

export async function execute(item: SearchResultItem, query: string, elevated?: boolean): Promise<void> {
  const target = item.value || query.trim()
  if (!target || target === 'toggle') {
    toggleTerminal()
  } else if (elevated) {
    runElevated(target, `Terminal: ${target}`)
  } else {
    runInTerminal(target)
  }
}
