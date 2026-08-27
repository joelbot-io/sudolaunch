import Fuse from 'fuse.js'
import type { CustomCommand, SearchResultItem } from '../../shared/types'
import { loadCustomCommands, runAndNotify, notifyMissingParams } from '../customCommands'
import { browseFolder, resolveFolderRoot, runScript, SCRIPT_EXTENSIONS } from '../folderBrowse'

function splitNameAndArgs(query: string): { name: string; argsStr: string } {
  const idx = query.indexOf(' ')
  return idx === -1 ? { name: query, argsStr: '' } : { name: query.slice(0, idx), argsStr: query.slice(idx + 1) }
}

// Parses "key=value key2='quoted value'" into a plain map. Quotes (single or double)
// let a value contain spaces; unquoted values run until the next whitespace.
function parseArgs(argsStr: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /(\w+)=("[^"]*"|'[^']*'|\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(argsStr))) {
    let value = m[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[m[1]] = value
  }
  return out
}

function substitute(action: string, values: Record<string, string>): string {
  let result = action
  for (const [key, value] of Object.entries(values)) {
    result = result.split(`{${key}}`).join(value)
  }
  return result
}

function browseResults(commands: CustomCommand[], filter: string): SearchResultItem[] {
  const matches = filter
    ? new Fuse(commands, { keys: ['command', 'label'], threshold: 0.35 }).search(filter).map((r) => r.item)
    : commands
  return matches.map((c) => {
    const detail = c.folder !== undefined ? `Browse ${c.folder}` : (c.action ?? '')
    return {
      label: `/${c.command}`,
      sublabel: c.label ? `${c.label} — ${detail}` : detail,
      value: c.command,
      // Not a runnable result yet — just fills the input, same as the top-level "/" list's
      // command entries, so the user can supply args/params or drill into a folder next.
      completion: `/${c.command} `
    }
  })
}

export function search(query: string): SearchResultItem[] {
  const commands = loadCustomCommands()
  const { name, argsStr } = splitNameAndArgs(query)
  const exact = commands.find((c) => c.command === name)
  if (!exact) {
    return browseResults(commands, name)
  }

  if (exact.folder !== undefined) {
    const root = resolveFolderRoot(exact.folder)
    if (!root) {
      return [{ label: 'Folder must be inside ~/.sudolaunch', value: '', disabled: true }]
    }
    // Directory entries keep a bare relPath as their value — CommandPalette uses that to
    // build the next drill-down query rather than to execute anything. File entries get
    // prefixed with the command name so execute() can find this command again via
    // splitNameAndArgs, same as an action-type command's "${command} ${argsStr}" value.
    return browseFolder(root, argsStr, SCRIPT_EXTENSIONS).map((r) =>
      r.isDirectory || r.disabled ? r : { ...r, value: `${exact.command} ${r.value}`.trim() }
    )
  }

  const filled = parseArgs(argsStr)
  const missing = exact.parameters.filter((p) => !(p.name in filled))

  if (missing.length === 0) {
    return [
      {
        label: `Run ${exact.label ?? '/' + exact.command}`,
        sublabel: substitute(exact.action!, filled),
        value: `${exact.command} ${argsStr}`.trim()
      }
    ]
  }

  return missing.map((p) => ({
    label: `${p.name}=`,
    sublabel: p.description ? `${p.description} (required)` : 'required parameter',
    value: '',
    completion: `/${exact.command} ${argsStr ? argsStr + ' ' : ''}${p.name}=`
  }))
}

export async function execute(item: SearchResultItem): Promise<void> {
  const commands = loadCustomCommands()
  const { name, argsStr } = splitNameAndArgs(item.value)
  const cmd = commands.find((c) => c.command === name)
  if (!cmd) {
    throw new Error('Custom command no longer exists')
  }

  if (cmd.folder !== undefined) {
    const root = resolveFolderRoot(cmd.folder)
    if (!root) {
      throw new Error('Folder must be inside ~/.sudolaunch')
    }
    runScript(root, argsStr)
    return
  }

  const filled = parseArgs(argsStr)
  const missing = cmd.parameters.filter((p) => !(p.name in filled)).map((p) => p.name)
  if (missing.length > 0) {
    notifyMissingParams(cmd, missing)
    return
  }

  runAndNotify(cmd, substitute(cmd.action!, filled))
}
