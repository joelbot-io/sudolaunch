import { app } from 'electron'
import type { SearchResultItem } from '../../shared/types'

export function search(): SearchResultItem[] {
  return [
    {
      label: 'Restart application',
      sublabel: 'Relaunch the application',
      value: 'restart'
    }
  ]
}

export async function execute(): Promise<void> {
  app.relaunch()
  app.exit(0)
}
