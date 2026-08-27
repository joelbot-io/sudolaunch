import type { SearchResultItem } from '../../shared/types'
import { toggleTerminal } from '../terminalWindow'

// Not query-shaped — always offers the single toggle action, same pattern as /view.
export function search(): SearchResultItem[] {
  return [
    {
      label: 'Toggle terminal',
      sublabel: 'Expand/collapse the persistent terminal',
      value: 'toggle'
    }
  ]
}

export async function execute(): Promise<void> {
  toggleTerminal()
}
