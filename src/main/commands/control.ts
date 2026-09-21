import { clipboard } from 'electron'
import type { SearchResultItem } from '../../shared/types'
import { readPeers } from '../config'
import { isSwapped, getActivePeer, swapTo, swapBack, rotateSwapIdentityAndRestart } from '../swap/swapManager'
import { getCachedSwapIdentity } from '../swap/identity'
import { addNotification } from '../notifications'

export function search(query: string): SearchResultItem[] {
  const q = query.trim().toLowerCase().replace(/^#/, '')
  const currentlySwapped = isSwapped()
  const activePeer = getActivePeer()
  const items: SearchResultItem[] = []

  // Shown so the user can copy it into the OTHER machine's peer entry (Expected
  // Fingerprint field) — that's what actually lets this machine be trusted as a peer, the
  // same way you'd share an SSH public key. Only present once initSwap() has generated or
  // loaded this machine's identity at startup; absent (not blocking) otherwise, since
  // search() can't await the async first-generation.
  const identity = getCachedSwapIdentity()
  if (identity) {
    items.push({
      label: `🔑 This machine's fingerprint: ${identity.fingerprint}`,
      sublabel: 'Copy this into "Expected Fingerprint" on the OTHER machine’s Swap Peers entry for this one · Press Enter to copy',
      value: '__copy_fingerprint__'
    })
  }

  // Deliberately not shown on the bare "/control" idle listing (only when the user
  // actually types toward it, e.g. "/control rotate") — rotating immediately breaks trust
  // with every configured peer until they're all updated with the new fingerprint, so it
  // shouldn't be one accidental Enter-press away from the routine peer-toggle items above.
  if (q && 'rotate identity key'.includes(q)) {
    items.push({
      label: '🔄 Rotate this machine’s identity key',
      sublabel: 'Generates a new certificate — every peer will need the new fingerprint before input sharing works again',
      value: '__rotate_identity__'
    })
  }

  items.push({
    label: '⚙️ Manage peers (add / edit / remove)',
    sublabel: 'Opens Settings -> Swap Peers',
    value: '__managePeers'
  })

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
      sublabel: 'Add peers in /settings -> Swap Peers or ~/.sudolaunch/peers.json (or type an IP directly: /control 192.168.1.x)',
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

  // Normally intercepted client-side in CommandPalette.tsx before ever reaching here (see
  // its command === 'control' branch, which redirects into the Settings peers screen) —
  // this is just a safety net so selecting it some other way is a no-op instead of trying
  // to connect to a peer literally named "__managePeers".
  if (target === '__managePeers') {
    return
  }

  if (target === '__copy_fingerprint__') {
    const identity = getCachedSwapIdentity()
    if (identity) clipboard.writeText(identity.fingerprint)
    return
  }

  if (target === '__rotate_identity__') {
    const newFingerprint = await rotateSwapIdentityAndRestart()
    clipboard.writeText(newFingerprint)
    // The palette closes silently on success (see handleExecuteResult in
    // CommandPalette.tsx) — a clipboard copy alone is easy to miss for an action this
    // consequential, so also leave a persistent notification with the new fingerprint,
    // as the actual record of what to re-share with every peer.
    addNotification({
      title: 'Input-sharing identity rotated',
      body: `New fingerprint (copied to clipboard): ${newFingerprint}\nEvery peer needs this before /control will work with them again.`,
      type: 'success',
      commandName: 'control'
    })
    return
  }

  if (target === 'toggle' || target === 'off' || target === 'back' || target === '0' || target === 'local' || target === 'release') {
    swapBack()
    return
  }

  const result = await swapTo(target)
  if (!result.success) {
    throw new Error(result.message)
  }
}
