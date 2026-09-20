import { app } from 'electron'
import type { SearchResultItem } from '../../shared/types'

export function search(): SearchResultItem[] {
  return [
    {
      label: 'Exit SudoLaunch',
      sublabel: 'Close and exit the application',
      value: 'exit'
    }
  ]
}

export async function execute(): Promise<void> {
  app.quit()
}
