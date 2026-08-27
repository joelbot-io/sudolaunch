import type { SearchResultItem } from '../../shared/types'
import { readSettings, writeSettings } from '../config'
import { resetBarPosition, toggleMoveMode } from '../barWindow'

export function search(query: string): SearchResultItem[] {
  const trimmed = query.trim().toLowerCase()
  const { barEnabled } = readSettings()

  const toggleItem: SearchResultItem = {
    label: barEnabled ? 'Turn command bar off' : 'Turn command bar on',
    sublabel: 'Toggle the persistent command bar',
    value: 'toggle'
  }

  const moveAllItem: SearchResultItem = {
    label: 'Move buttons',
    sublabel: 'Drag command bar and terminal icons to new spots; click or press Escape to drop',
    value: 'move'
  }

  const moveBarItem: SearchResultItem = {
    label: 'Move command bar only',
    sublabel: 'Drag the command bar icon to a new spot',
    value: 'move-bar'
  }

  const moveTermItem: SearchResultItem = {
    label: 'Move terminal button only',
    sublabel: 'Drag the terminal icon to a new spot',
    value: 'move-term'
  }

  const resetItem: SearchResultItem = {
    label: 'Reset button positions',
    sublabel: 'Move the command bar and terminal icons back to the default bottom-center dock',
    value: 'reset'
  }

  if (!trimmed) {
    return [toggleItem, moveAllItem, moveBarItem, moveTermItem, resetItem]
  }

  const items: SearchResultItem[] = []
  if ('toggle'.startsWith(trimmed) || 'off'.startsWith(trimmed) || 'on'.startsWith(trimmed)) {
    items.push(toggleItem)
  }
  if ('position'.startsWith(trimmed) || 'pos'.startsWith(trimmed) || 'move'.startsWith(trimmed)) {
    items.push(moveAllItem)
    if (trimmed.includes('bar') || trimmed === 'move' || trimmed === 'pos') items.push(moveBarItem)
    if (trimmed.includes('term') || trimmed === 'move' || trimmed === 'pos') items.push(moveTermItem)
  }
  if ('reset'.startsWith(trimmed)) {
    items.push(resetItem)
  }

  return items.length > 0 ? items : [toggleItem, moveAllItem, moveBarItem, moveTermItem, resetItem]
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value === 'reset') {
    resetBarPosition()
    return
  }
  if (item.value === 'move-bar') {
    toggleMoveMode('bar')
    return
  }
  if (item.value === 'move-term') {
    toggleMoveMode('term')
    return
  }
  if (item.value === 'position' || item.value === 'move') {
    toggleMoveMode('all')
    return
  }
  const settings = readSettings()
  writeSettings({ ...settings, barEnabled: !settings.barEnabled })
}

