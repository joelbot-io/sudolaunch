import { shell } from 'electron'
import Fuse from 'fuse.js'
import type { SearchResultItem, TeamLink } from '../../shared/types'
import { searchContacts } from './contactSearch'
import { readTeamLinks } from '../config'

function toResultItem(team: TeamLink): SearchResultItem {
  // Show the description (what the team is for) rather than the raw deep link — the URL
  // is still what gets opened (see execute() below), just not what's displayed.
  return { label: team.name, sublabel: team.description || team.url, value: team.url }
}

function searchTeamLinks(query: string): SearchResultItem[] {
  const teamLinks = readTeamLinks()
  if (!query) {
    return teamLinks.map(toResultItem)
  }
  const fuse = new Fuse(teamLinks, { keys: ['name'], threshold: 0.35 })
  return fuse.search(query).map((r) => toResultItem(r.item))
}

export function search(query: string, options?: { excludeTeamLinks?: boolean }): SearchResultItem[] {
  // Prioritize 1:1 chat contacts (people) first, followed by Team/channel deep links.
  if (options?.excludeTeamLinks) {
    return searchContacts(query)
  }
  return [...searchContacts(query), ...searchTeamLinks(query)]
}

export async function execute(item: SearchResultItem): Promise<void> {
  // Team/channel links are stored as full https://teams.microsoft.com/l/team|channel/...
  // URLs and opened as-is. Contacts only carry a teamsId (an email/UPN), so a 1:1 chat
  // deep link is built on the fly — https://teams.microsoft.com/l/chat/... is the format
  // new Teams registers as a protocol handler and routes into the desktop app;
  // msteams://l/chat/... launches the app but new Teams doesn't reliably act on the
  // deep-link payload, leaving it on the home screen.
  const url = item.value.startsWith('http')
    ? item.value
    : `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(item.value)}`
  await shell.openExternal(url)
}
