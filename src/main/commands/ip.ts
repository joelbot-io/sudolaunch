import { clipboard } from 'electron'
import { networkInterfaces } from 'os'
import type { SearchResultItem } from '../../shared/types'

export function search(query: string): SearchResultItem[] {
  const q = query.trim().toLowerCase()
  const interfaces = networkInterfaces()
  const results: SearchResultItem[] = []

  const ipv4List: SearchResultItem[] = []
  const ipv6List: SearchResultItem[] = []
  const macList: SearchResultItem[] = []

  for (const [name, ifaceList] of Object.entries(interfaces)) {
    if (!ifaceList) continue
    for (const iface of ifaceList) {
      if (iface.internal) continue

      const isVpnOrVirtual =
        /wsl|tailscale|hyper-v|vEthernet|docker|virtual|tap|tun|wireguard|vpn/i.test(name)
      const adapterType = isVpnOrVirtual
        ? 'Virtual / VPN'
        : /wi-fi|wireless|wlan/i.test(name)
          ? 'Wi-Fi'
          : /ethernet|eth|en/i.test(name)
            ? 'Ethernet'
            : 'Adapter'

      if (iface.family === 'IPv4') {
        ipv4List.push({
          label: `IPv4 (${name}): ${iface.address}`,
          sublabel: `${adapterType} · Netmask: ${iface.netmask}${iface.cidr ? ` (${iface.cidr})` : ''}`,
          value: iface.address
        })
      } else if (iface.family === 'IPv6') {
        ipv6List.push({
          label: `IPv6 (${name}): ${iface.address}`,
          sublabel: `${adapterType} · Scope: ${iface.scopeid ?? 'global'}`,
          value: iface.address
        })
      }

      if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
        macList.push({
          label: `MAC (${name}): ${iface.mac}`,
          sublabel: `${adapterType} Physical Hardware Address`,
          value: iface.mac
        })
      }
    }
  }

  // Prioritize primary IPv4, then IPv6, then MAC addresses
  const allItems = [...ipv4List, ...ipv6List, ...macList]

  // Add loopback item
  allItems.push({
    label: 'Loopback (Localhost): 127.0.0.1',
    sublabel: 'IPv4 Loopback Interface',
    value: '127.0.0.1'
  })

  // Filter if user searched for specific adapter name or IP portion
  if (q) {
    const filtered = allItems.filter(
      (item) => item.label.toLowerCase().includes(q) || (item.sublabel && item.sublabel.toLowerCase().includes(q))
    )
    return filtered
  }

  return allItems.length > 0
    ? allItems
    : [
        {
          label: 'No active network interfaces detected',
          sublabel: 'Check your local network connections',
          value: '',
          disabled: true
        }
      ]
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
