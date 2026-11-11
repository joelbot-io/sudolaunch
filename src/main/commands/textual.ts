import { clipboard, shell } from 'electron'
import { existsSync } from 'fs'
import { basename } from 'path'
import Fuse from 'fuse.js'
import type { SearchResultItem, TextualLaunchMode } from '../../shared/types'
import {
  discoverTextualApps,
  ensureTextualDir,
  expandHomePath,
  getConfiguredTextualRoot,
  launchTextualSpec,
  resolveScriptTargetPath,
  resolveTextualLaunchSpec,
  type DiscoveredTextualApp
} from '../textualManager'

interface SerializedAppTarget {
  name?: string
  scriptPath: string
  args?: string
  cwd?: string
  pythonPath?: string
  defaultMode?: TextualLaunchMode
  hasPep723?: boolean
  extraArgs?: string
}

let cachedAppsRef: DiscoveredTextualApp[] | null = null
let cachedFuse: Fuse<DiscoveredTextualApp> | null = null

function getAppsAndFuse(): { apps: DiscoveredTextualApp[]; fuse: Fuse<DiscoveredTextualApp> } {
  const apps = discoverTextualApps()
  if (cachedAppsRef !== apps || !cachedFuse) {
    cachedAppsRef = apps
    cachedFuse = new Fuse(apps, {
      keys: [
        { name: 'name', weight: 0.45 },
        { name: 'id', weight: 0.25 },
        { name: 'description', weight: 0.2 },
        { name: 'scriptPath', weight: 0.1 }
      ],
      threshold: 0.35,
      ignoreLocation: true
    })
  }
  return { apps, fuse: cachedFuse }
}

function parseAdHocInput(raw: string): { scriptPath: string; extraArgs: string } | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.startsWith('@')) return null

  // Match quoted path: "C:\my path\app.py" --arg1
  const quotedMatch = trimmed.match(/^(?:"([^"]+)"|'([^']+)')(?:\s+(.*))?$/)
  if (quotedMatch) {
    const candidate = quotedMatch[1] ?? quotedMatch[2]
    if (
      candidate.toLowerCase().endsWith('.py') ||
      /^[a-zA-Z]:[\\/]/.test(candidate) ||
      /^~[\\/]/.test(candidate)
    ) {
      return {
        scriptPath: expandHomePath(candidate),
        extraArgs: (quotedMatch[3] || '').trim()
      }
    }
  }

  // Match unquoted path: C:\proj\app.py --arg1 or ~/proj/app.py or .\app.py
  const firstSpace = trimmed.indexOf(' ')
  const firstToken = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace)
  const restArgs = firstSpace === -1 ? '' : trimmed.slice(firstSpace + 1).trim()

  if (
    firstToken.toLowerCase().endsWith('.py') ||
    /^[a-zA-Z]:[\\/]/.test(firstToken) ||
    /^~[\\/]/.test(firstToken)
  ) {
    return {
      scriptPath: expandHomePath(firstToken),
      extraArgs: restArgs
    }
  }

  return null
}

function serializeTarget(app: DiscoveredTextualApp, extraArgs?: string): string {
  const payload: SerializedAppTarget = {
    name: app.name,
    scriptPath: app.scriptPath,
    args: app.args,
    cwd: app.cwd,
    pythonPath: app.pythonPath,
    defaultMode: app.defaultMode,
    hasPep723: app.hasPep723,
    extraArgs: extraArgs || undefined
  }
  return JSON.stringify(payload)
}

function modeLabel(mode: TextualLaunchMode): string {
  if (mode === 'window') return 'Separate TUI Window'
  if (mode === 'external') return 'Windows Terminal'
  return 'Embedded Terminal'
}

function renderAppDrilldown(app: DiscoveredTextualApp, extraArgs?: string): SearchResultItem[] {
  const spec = resolveTextualLaunchSpec(app, { extraArgs })
  const payload = serializeTarget(app, extraArgs)

  const items: SearchResultItem[] = [
    {
      label: '← Back to All Textual Apps',
      sublabel: 'Return to Python Textual TUI app list',
      value: '',
      completion: '/textual '
    },
    {
      label: `🖥️ Launch ${app.name} in Embedded Terminal`,
      sublabel: `${spec.displayCommand} · ↵ Open inside SudoLaunch embedded terminal`,
      value: `__launch::embedded::${payload}`
    },
    {
      label: `🪟 Launch ${app.name} in Temporary SudoLaunch TUI Window`,
      sublabel: `Dedicated xterm.js + PTY popout window (auto-closes on clean exit) · [${spec.runnerLabel}]`,
      value: `__launch::window::${payload}`
    },
    {
      label: `🚀 Launch ${app.name} in External Windows Terminal`,
      sublabel: `Open "${spec.displayCommand}" in Windows Terminal (wt.exe) or console window`,
      value: `__launch::external::${payload}`
    },
    {
      label: `🛠️ Run ${app.name} with Textual Hot-Reload (--dev)`,
      sublabel: 'Launches "textual run --dev" in a temporary TUI window for live .tcss CSS reloading',
      value: `__launch::dev-window::${payload}`
    },
    {
      label: `📂 Reveal ${basename(app.scriptPath)} in File Explorer`,
      sublabel: app.scriptPath,
      value: `__reveal::${app.scriptPath}`
    },
    {
      label: `📋 Copy Launch Command`,
      sublabel: spec.displayCommand,
      value: `__copy::${spec.displayCommand}`
    }
  ]

  return items
}

export function search(
  query: string,
  options?: { fromUniversalSearch?: boolean }
): SearchResultItem[] {
  const raw = query.trim()
  const { apps, fuse } = getAppsAndFuse()

  // 1. Drilldown mode: /textual @<id> [extraArgs]
  if (raw.startsWith('@')) {
    const rest = raw.slice(1).trim()
    const spaceIdx = rest.indexOf(' ')
    const targetId = (spaceIdx === -1 ? rest : rest.slice(0, spaceIdx)).toLowerCase()
    const extraArgs = spaceIdx === -1 ? '' : rest.slice(spaceIdx + 1).trim()
    const exact = apps.find(
      (a) => a.id.toLowerCase() === targetId || a.name.toLowerCase() === targetId
    )
    if (exact) {
      return renderAppDrilldown(exact, extraArgs)
    }
  }

  const items: SearchResultItem[] = []

  // 2. Fuzzy search discovered & saved Textual apps
  const matched = raw ? fuse.search(raw).map((r) => r.item) : apps

  for (const app of matched) {
    const payload = serializeTarget(app)
    const sourceBadge = app.source === 'saved' ? 'Saved' : 'textual/'
    const defLabel = modeLabel(app.defaultMode)
    const descPart = app.description ? `${app.description} · ` : ''

    items.push({
      label: `🐍 ${app.name}`,
      sublabel: `[${sourceBadge}] ${descPart}↵ ${defLabel} · Ctrl+↵ Separate Window · Tab for Windows Terminal / --dev`,
      value: `__app::${payload}`,
      completion: `/textual @${app.id} `,
      executeOnEnter: true
    })

    if (!options?.fromUniversalSearch && raw && matched.length <= 2) {
      items.push({
        label: `🪟 Open ${app.name} in Temporary SudoLaunch TUI Window`,
        sublabel: `${app.scriptPath} · Auto-closes when app exits`,
        value: `__launch::window::${payload}`
      })
      items.push({
        label: `🚀 Open ${app.name} in External Windows Terminal`,
        sublabel: `Launch in wt.exe / external OS console window`,
        value: `__launch::external::${payload}`
      })
    }
  }

  // 3. Ad-hoc path input (e.g. /textual C:\Projects\my_tui\app.py --flag)
  if (!options?.fromUniversalSearch) {
    const adHoc = parseAdHocInput(raw)
    if (adHoc) {
      const resolvedPath = resolveScriptTargetPath(adHoc.scriptPath) ?? adHoc.scriptPath
      const alreadyListed = matched.some(
        (a) => a.scriptPath.toLowerCase() === resolvedPath.toLowerCase() && !adHoc.extraArgs
      )
      if (!alreadyListed) {
        const displayName = basename(resolvedPath)
        const adHocPayload = JSON.stringify({
          name: displayName,
          scriptPath: resolvedPath,
          extraArgs: adHoc.extraArgs || undefined,
          defaultMode: 'embedded'
        } satisfies SerializedAppTarget)

        items.push({
          label: `🐍 Run "${displayName}" in Embedded Terminal`,
          sublabel: `${resolvedPath}${adHoc.extraArgs ? ` ${adHoc.extraArgs}` : ''} · ↵ Embedded · Ctrl+↵ Separate Window`,
          value: `__app::${adHocPayload}`
        })
        items.push({
          label: `🪟 Run "${displayName}" in Temporary SudoLaunch TUI Window`,
          sublabel: `Dedicated xterm.js + PTY popout window (auto-closes on exit)`,
          value: `__launch::window::${adHocPayload}`
        })
        items.push({
          label: `🚀 Run "${displayName}" in External Windows Terminal`,
          sublabel: `Launch in wt.exe / external OS console`,
          value: `__launch::external::${adHocPayload}`
        })
      }
    }

    // 4. Folder & Settings shortcuts
    const qLower = raw.toLowerCase()
    if (!raw || 'folder open explorer textual tui directory'.includes(qLower)) {
      const root = getConfiguredTextualRoot()
      items.push({
        label: '📂 Open ~/.sudolaunch/textual Folder in Explorer',
        sublabel: `${root ?? '~/.sudolaunch/textual'} · Drop .py Textual apps or project folders here`,
        value: '__openTextualFolder'
      })
    }
    if (!raw || 'manage settings config saved add edit apps'.includes(qLower)) {
      items.push({
        label: '⚙️ Manage Saved Textual TUI Apps',
        sublabel: 'Register external Textual project paths, args, and default window modes in Settings',
        value: '__manageTextualApps'
      })
    }
  }

  return items
}

export async function execute(
  item: SearchResultItem,
  _query?: string,
  separateWindow?: boolean
): Promise<void> {
  if (!item.value || item.disabled || item.value === '__manageTextualApps') return

  if (item.value === '__openTextualFolder') {
    ensureTextualDir()
    const root = getConfiguredTextualRoot()
    if (root) {
      await shell.openPath(root)
    }
    return
  }

  if (item.value.startsWith('__reveal::')) {
    const targetPath = item.value.slice('__reveal::'.length)
    if (existsSync(targetPath)) {
      shell.showItemInFolder(targetPath)
    }
    return
  }

  if (item.value.startsWith('__copy::')) {
    const cmd = item.value.slice('__copy::'.length)
    clipboard.writeText(cmd)
    return
  }

  if (item.value.startsWith('__app::')) {
    const payload = JSON.parse(item.value.slice('__app::'.length)) as SerializedAppTarget
    const spec = resolveTextualLaunchSpec(payload, { extraArgs: payload.extraArgs })
    // Default (Enter) uses configured defaultMode ('embedded' by default);
    // Ctrl+Enter launches in a separate temporary SudoLaunch TUI window.
    const mode: TextualLaunchMode = separateWindow
      ? 'window'
      : (payload.defaultMode ?? 'embedded')
    launchTextualSpec(spec, mode)
    return
  }

  if (item.value.startsWith('__launch::')) {
    const rest = item.value.slice('__launch::'.length)
    const sepIdx = rest.indexOf('::')
    if (sepIdx === -1) return
    const rawMode = rest.slice(0, sepIdx)
    const payload = JSON.parse(rest.slice(sepIdx + 2)) as SerializedAppTarget

    if (rawMode === 'dev-window') {
      const devSpec = resolveTextualLaunchSpec(payload, {
        extraArgs: payload.extraArgs,
        devMode: true
      })
      launchTextualSpec(devSpec, 'window')
      return
    }

    const spec = resolveTextualLaunchSpec(payload, { extraArgs: payload.extraArgs })
    const targetMode: TextualLaunchMode =
      rawMode === 'window'
        ? 'window'
        : rawMode === 'external'
          ? 'external'
          : separateWindow
            ? 'window'
            : 'embedded'
    launchTextualSpec(spec, targetMode)
  }
}

export { ensureTextualDir }

