import type { CommandName, SearchResultItem } from '../../shared/types'
import { recordHistory } from '../history'
import * as teams from './teams'
import * as call from './call'
import * as mail from './mail'
import * as snippet from './snippet'
import * as link from './link'
import * as app from './app'
import * as calc from './calc'
import * as script from './script'

const searchers: Record<Exclude<CommandName, 'calc'>, (query: string) => SearchResultItem[]> = {
  teams: teams.search,
  call: call.search,
  mail: mail.search,
  snippet: snippet.search,
  link: link.search,
  app: app.search,
  script: script.search
}

const executors: Record<CommandName, (item: SearchResultItem) => Promise<void>> = {
  teams: teams.execute,
  call: call.execute,
  mail: mail.execute,
  snippet: snippet.execute,
  link: link.execute,
  app: app.execute,
  calc: calc.execute,
  script: script.execute
}

export function search(command: CommandName, query: string): SearchResultItem[] {
  if (command === 'calc') return []
  return searchers[command](query)
}

export async function execute(command: CommandName, item: SearchResultItem, query: string): Promise<void> {
  await executors[command](item)
  recordHistory(command, query, item.label, item.value)
}

export { evaluateExpression } from './calc'
export { listApps } from './app'
