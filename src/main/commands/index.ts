import type { CommandName, SearchResultItem } from '../../shared/types'
import { recordHistory } from '../history'
import * as teams from './teams'
import * as mail from './mail'
import * as snippet from './snippet'
import * as fav from './fav'
import * as g from './g'
import * as app from './app'
import * as calc from './calc'
import * as custom from './custom'
import * as focus from './focus'
import * as searchCmd from './search'
import * as gif from './gif'
import * as lookup from './lookup'
import * as view from './view'
import * as term from './term'
import * as tz from './tz'
import * as hash from './hash'
import * as uuid from './uuid'
import * as ip from './ip'
import * as pwd from './pwd'
import * as port from './port'
import * as unit from './unit'
import * as color from './color'
import * as caseCmd from './case'
import * as chmod from './chmod'
import * as cron from './cron'
import * as emoji from './emoji'
import * as git from './git'
import * as http from './http'
import * as json from './json'
import * as lorem from './lorem'
import * as mime from './mime'
import * as pt from './pt'
import * as qr from './qr'
import * as regex from './regex'
import * as restart from './restart'
import * as defaultCmd from './defaultCmd'
import * as settingsCmd from './settings'
import * as text from './text'
import * as url from './url'
import * as swap from './swap'
import * as release from './release'
import * as exitCmd from './exit'

const searchers: Record<Exclude<CommandName, 'calc'>, (query: string) => SearchResultItem[]> = {
  app: app.search,
  case: caseCmd.search,
  chmod: chmod.search,
  color: color.search,
  cron: cron.search,
  custom: custom.search,
  default: defaultCmd.search,
  emoji: emoji.search,
  exit: exitCmd.search,
  fav: fav.search,
  focus: focus.search,
  g: g.search,
  gif: gif.search,
  git: git.search,
  hash: hash.search,
  http: http.search,
  ip: ip.search,
  json: json.search,
  lookup: lookup.search,
  lorem: lorem.search,
  mail: mail.search,
  mime: mime.search,
  port: port.search,
  pt: pt.search,
  pwd: pwd.search,
  qr: qr.search,
  regex: regex.search,
  restart: restart.search,
  search: searchCmd.search,
  settings: settingsCmd.search,
  snippet: snippet.search,
  teams: teams.search,
  term: term.search,
  text: text.search,
  tz: tz.search,
  unit: unit.search,
  url: url.search,
  uuid: uuid.search,
  view: view.search,
  swap: swap.search,
  release: release.search
}

const executors: Record<CommandName, (item: SearchResultItem, query: string) => Promise<void>> = {
  app: app.execute,
  calc: calc.execute,
  case: caseCmd.execute,
  chmod: chmod.execute,
  color: color.execute,
  cron: cron.execute,
  custom: custom.execute,
  default: defaultCmd.execute,
  emoji: emoji.execute,
  exit: exitCmd.execute,
  fav: fav.execute,
  focus: focus.execute,
  g: g.execute,
  gif: gif.execute,
  git: git.execute,
  hash: hash.execute,
  http: http.execute,
  ip: ip.execute,
  json: json.execute,
  lookup: lookup.execute,
  lorem: lorem.execute,
  mail: mail.execute,
  mime: mime.execute,
  port: port.execute,
  pt: pt.execute,
  pwd: pwd.execute,
  qr: qr.execute,
  regex: regex.execute,
  restart: restart.execute,
  search: searchCmd.execute,
  settings: settingsCmd.execute,
  snippet: snippet.execute,
  teams: teams.execute,
  term: term.execute,
  text: text.execute,
  tz: tz.execute,
  unit: unit.execute,
  url: url.execute,
  uuid: uuid.execute,
  view: view.execute,
  swap: swap.execute,
  release: release.execute
}

export function search(command: CommandName, query: string): SearchResultItem[] {
  if (command === 'calc') return []
  const fn = searchers[command]
  return fn ? fn(query) : []
}

export async function execute(command: CommandName, item: SearchResultItem, query: string): Promise<void> {
  const fn = executors[command]
  if (fn) {
    await fn(item, query)
  }
  recordHistory(command, query, item.label, item.value)
}

export { evaluateExpression } from './calc'
export { listApps } from './app'
