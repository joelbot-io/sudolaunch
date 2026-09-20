import type { SearchResultItem } from '../../shared/types'
import { readPeers } from '../config'
import { isSwapped, getActivePeer, swapTo, swapBack } from '../swap/swapManager'

export function search(query: string): SearchResultItem[] {
  const q = query.trim().toLowerCase().replace(/^#/, '')
  const currentlySwapped = isSwapped()
  const activePeer = getActivePeer()
  const items: SearchResultItem[] = []

  // If currently sending input to another computer, provide instant toggle back option
  if (currentlySwapped && activePeer) {
    items.push({
      label: '⇄ Toggle input back to this computer',
      sublabel: `Currently sharing input with #${activePeer.id} (${activePeer.name}) · Press Enter or ScrollLock to return`,
      value: 'toggle'
    })
  }

  const peers = readPeers()

  if (peers.length === 0) {
    items.push({
      label: 'No Swap Peers Configured',
      sublabel: 'Add peers in /settings -> Swap Peers or ~/.sudolaunch/peers.json (or type an IP directly: /swap 192.168.1.x)',
      value: q || 'none',
      disabled: !q
    })
  }

  for (const peer of peers) {
    const isThisActive = activePeer && activePeer.id === peer.id
    items.push({
      label: isThisActive ? `⇄ [Active] Swapped to #${peer.id} (${peer.name})` : `⇄ Swap input to #${peer.id} (${peer.name})`,
      sublabel: `${peer.host}:${peer.port}${isThisActive ? ' · (Press Enter to toggle back)' : ''}`,
      value: `${peer.id}`
    })
  }

  // If user typed a custom IP or hostname not in peers
  if (q && (q.includes('.') || q.includes(':'))) {
    items.push({
      label: `⇄ Swap input to ${query.trim()}`,
      sublabel: `Direct TCP connection to ${query.trim()}`,
      value: query.trim()
    })
  }

  if (!q) {
    return items
  }

  return items.filter((item) => {
    if (item.value === 'toggle') return true
    return (
      item.label.toLowerCase().includes(q) ||
      item.sublabel?.toLowerCase().includes(q) ||
      item.value.toLowerCase().includes(q)
    )
  })
}

export async function execute(item: SearchResultItem, query: string): Promise<void> {
  const target = item.value || query.trim().replace(/^#/, '')

  if (target === 'toggle' || target === 'off' || target === 'back' || target === '0' || target === 'local' || target === 'release') {
    swapBack()
    return
  }

  const result = await swapTo(target)
  if (!result.success) {
    throw new Error(result.message)
  }
}
