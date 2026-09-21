import type { SearchResultItem } from '../../shared/types'
import { readSettings, writeSettings } from '../config'
import { toggleMoveMode } from '../barWindow'
import { dockManager } from '../dock/DockManager'

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

  const circleLayoutItem: SearchResultItem = {
    label: 'Dock layout: Circle / Radial mode',
    sublabel: 'Arrange the 3 dock icons in a circle hovering around cursor / anchor',
    value: 'layout-circle'
  }

  const horizontalLayoutItem: SearchResultItem = {
    label: 'Dock layout: Horizontal line mode',
    sublabel: 'Arrange the 3 dock icons side-by-side in a horizontal bar',
    value: 'layout-horizontal'
  }

  if (!trimmed) {
    return [toggleItem, circleLayoutItem, horizontalLayoutItem, moveAllItem, moveBarItem, moveTermItem, resetItem]
  }

  const items: SearchResultItem[] = []
  if ('toggle'.startsWith(trimmed) || 'off'.startsWith(trimmed) || 'on'.startsWith(trimmed)) {
    items.push(toggleItem)
  }
  if ('circle'.startsWith(trimmed) || 'radial'.startsWith(trimmed) || 'orbit'.startsWith(trimmed)) {
    items.push(circleLayoutItem)
  }
  if ('horizontal'.startsWith(trimmed) || 'line'.startsWith(trimmed) || 'bar'.startsWith(trimmed)) {
    items.push(horizontalLayoutItem)
  }
  if ('position'.startsWith(trimmed) || 'pos'.startsWith(trimmed) || 'move'.startsWith(trimmed)) {
    items.push(moveAllItem)
    if (trimmed.includes('bar') || trimmed === 'move' || trimmed === 'pos') items.push(moveBarItem)
    if (trimmed.includes('term') || trimmed === 'move' || trimmed === 'pos') items.push(moveTermItem)
  }
  if ('reset'.startsWith(trimmed)) {
    items.push(resetItem)
  }

  return items.length > 0 ? items : [toggleItem, circleLayoutItem, horizontalLayoutItem, moveAllItem, moveBarItem, moveTermItem, resetItem]
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value === 'reset') {
    dockManager.resetPositions()
    return
  }
  if (item.value === 'layout-circle') {
    dockManager.setLayout('circle')
    return
  }
  if (item.value === 'layout-horizontal') {
    dockManager.setLayout('horizontal')
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

