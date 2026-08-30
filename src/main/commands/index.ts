import type { CommandName, SearchResultItem } from '../../shared/types'
import { recordHistory } from '../history'
import * as teams from './teams'
import * as mail from './mail'
import * as snippet from './snippet'
import * as fav from './fav'
import * as app from './app'
import * as calc from './calc'
import * as custom from './custom'
import * as focus from './focus'
import * as searchCmd from './search'
import * as gif from './gif'
import * as lookup from './lookup'
import * as view from './view'
import * as term from './term'
import * as restart from './restart'
import * as defaultCmd from './defaultCmd'
import * as settingsCmd from './settings'

const searchers: Record<Exclude<CommandName, 'calc'>, (query: string) => SearchResultItem[]> = {
  app: app.search,
  custom: custom.search,
  default: defaultCmd.search,
  fav: fav.search,
  focus: focus.search,
  gif: gif.search,
  lookup: lookup.search,
  mail: mail.search,
  restart: restart.search,
  search: searchCmd.search,
  settings: settingsCmd.search,
  snippet: snippet.search,
  teams: teams.search,
  term: term.search,
  view: view.search
}

const executors: Record<CommandName, (item: SearchResultItem, query: string) => Promise<void>> = {
  app: app.execute,
  calc: calc.execute,
  custom: custom.execute,
  default: defaultCmd.execute,
  fav: fav.execute,
  focus: focus.execute,
  gif: gif.execute,
  lookup: lookup.execute,
  mail: mail.execute,
  restart: restart.execute,
  search: searchCmd.execute,
  settings: settingsCmd.execute,
  snippet: snippet.execute,
  teams: teams.execute,
  term: term.execute,
  view: view.execute
}

export function search(command: CommandName, query: string): SearchResultItem[] {
  if (command === 'calc') return []
  return searchers[command](query)
}

export async function execute(command: CommandName, item: SearchResultItem, query: string): Promise<void> {
  await executors[command](item, query)
  recordHistory(command, query, item.label, item.value)
}

export { evaluateExpression } from './calc'
export { listApps } from './app'
