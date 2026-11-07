import type { SearchResultItem } from '../../shared/types'
import { openShortcutsWindow } from '../shortcutsWindow'
import { executeShortcutOverlayItem, getShortcutsOverlayData } from '../shortcutsManager'

export function search(query: string): SearchResultItem[] {
  const q = query.trim().toLowerCase()
  const data = getShortcutsOverlayData()

  const tabEntries: SearchResultItem[] = [
    {
      label: '⌨️ Open Shortcuts Overlay Window',
      sublabel: 'Open the draggable, PowerShell-style Shortcuts & Hotkeys Overlay window',
      value: '__open_shortcuts__::favorites',
      executeOnEnter: true
    },
    ...data.tabs.map((t) => ({
      label: `${t.icon} Shortcuts Tab: ${t.label} (${t.count})`,
      sublabel: `Open Shortcuts Overlay to the ${t.label} tab`,
      value: `__open_shortcuts__::${t.id}`,
      executeOnEnter: true
    }))
  ]

  const matchingShortcuts: SearchResultItem[] = data.items
    .filter((item) => {
      if (!q) return Boolean(item.favorite)
      return (
        item.label.toLowerCase().includes(q) ||
        item.keys.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.tab.toLowerCase().includes(q)
      )
    })
    .slice(0, 24)
    .map((item) => ({
      label: `${item.icon} ${item.label}  [${item.keys || 'Direct'}]`,
      sublabel: `${item.tab.toUpperCase()} · ${item.description}`,
      value: `__exec_shortcut__::${item.id}`,
      executeOnEnter: true
    }))

  if (!q) {
    return [...tabEntries, ...matchingShortcuts]
  }

  const filteredTabs = tabEntries.filter(
    (t) => t.label.toLowerCase().includes(q) || (t.sublabel ?? '').toLowerCase().includes(q)
  )

  return [...filteredTabs, ...matchingShortcuts]
}

export async function execute(
  item: SearchResultItem,
  _query: string,
  elevated?: boolean
): Promise<void> {
  if (item.value.startsWith('__open_shortcuts__::')) {
    const tab = item.value.slice('__open_shortcuts__::'.length) || 'favorites'
    openShortcutsWindow(tab)
    return
  }

  if (item.value.startsWith('__exec_shortcut__::')) {
    const id = item.value.slice('__exec_shortcut__::'.length)
    const data = getShortcutsOverlayData()
    const target = data.items.find((i) => i.id === id)
    if (target) {
      await executeShortcutOverlayItem(target, elevated)
    }
    return
  }

  openShortcutsWindow('favorites')
}

