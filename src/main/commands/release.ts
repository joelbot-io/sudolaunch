import type { SearchResultItem } from '../../shared/types'
import { isSwapped, getActivePeer, isReceivingSwap, releaseAllSwap } from '../swap/swapManager'

export function search(_query: string): SearchResultItem[] {
  const swapped = isSwapped()
  const activePeer = getActivePeer()
  const receiving = isReceivingSwap()

  let label = '⇄ Release input connection'
  let sublabel = 'Disconnect active swap sessions and release keyboard/mouse · Press Enter'

  if (swapped && activePeer) {
    label = `⇄ Release input from #${activePeer.id} (${activePeer.name})`
    sublabel = `Currently controlling ${activePeer.host}:${activePeer.port} · Press Enter to release`
  } else if (swapped) {
    label = '⇄ Release outgoing input'
    sublabel = 'Restore keyboard and mouse control to this computer · Press Enter'
  } else if (receiving) {
    label = '⇄ Release remote connection'
    sublabel = 'Disconnect incoming remote controller and restore local input · Press Enter'
  } else {
    sublabel = 'Reset and release any active input hooks or swap sessions · Press Enter'
  }

  return [
    {
      label,
      sublabel,
      value: 'release'
    }
  ]
}

export async function execute(_item: SearchResultItem, _query: string): Promise<void> {
  releaseAllSwap()
}

