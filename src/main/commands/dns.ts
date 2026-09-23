import dns from 'dns/promises'
import { clipboard } from 'electron'
import type { SearchResultItem } from '../../shared/types'

function cleanDomain(input: string): { domain: string; type?: string } {
  let cleaned = input.trim().replace(/^https?:\/\//i, '').split('/')[0].trim()
  const parts = cleaned.split(/\s+/)
  if (parts.length >= 2) {
    const last = parts[parts.length - 1].toUpperCase()
    if (['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS', 'SOA'].includes(last)) {
      return {
        domain: parts.slice(0, -1).join(' '),
        type: last
      }
    }
  }
  return { domain: cleaned }
}

export async function search(query: string): Promise<SearchResultItem[]> {
  const raw = query.trim()
  if (!raw) {
    return [
      {
        label: 'DNS Record Lookup & Propagation',
        sublabel: 'Examples: /dns github.com · /dns google.com mx · /dns cloudflare.com txt (alias: /dig)',
        value: '',
        disabled: true
      }
    ]
  }

  const { domain, type } = cleanDomain(raw)
  if (!domain || !domain.includes('.')) {
    return [
      {
        label: `Enter a valid domain name (e.g. ${raw}.com)`,
        sublabel: 'Domain must contain at least one dot',
        value: '',
        disabled: true
      }
    ]
  }

  const items: SearchResultItem[] = []

  try {
    if (type) {
      // Query specific record type
      switch (type) {
        case 'A': {
          const res = await dns.resolve4(domain)
          for (const ip of res) {
            items.push({
              label: `A Record: ${ip}`,
              sublabel: `${domain} IPv4 address · ↵ Copy IP`,
              value: ip
            })
          }
          break
        }
        case 'AAAA': {
          const res = await dns.resolve6(domain)
          for (const ip of res) {
            items.push({
              label: `AAAA Record: ${ip}`,
              sublabel: `${domain} IPv6 address · ↵ Copy IP`,
              value: ip
            })
          }
          break
        }
        case 'MX': {
          const res = await dns.resolveMx(domain)
          res.sort((a, b) => a.priority - b.priority)
          for (const mx of res) {
            items.push({
              label: `MX: ${mx.exchange} (Priority: ${mx.priority})`,
              sublabel: `${domain} Mail Server · ↵ Copy Host`,
              value: mx.exchange
            })
          }
          break
        }
        case 'TXT': {
          const res = await dns.resolveTxt(domain)
          for (const chunk of res) {
            const txt = chunk.join('')
            items.push({
              label: `TXT: ${txt.slice(0, 65)}${txt.length > 65 ? '...' : ''}`,
              sublabel: `${domain} TXT Record (${txt.length} chars) · ↵ Copy`,
              value: txt
            })
          }
          break
        }
        case 'CNAME': {
          const res = await dns.resolveCname(domain)
          for (const cname of res) {
            items.push({
              label: `CNAME: ${cname}`,
              sublabel: `${domain} Canonical Alias · ↵ Copy`,
              value: cname
            })
          }
          break
        }
        case 'NS': {
          const res = await dns.resolveNs(domain)
          for (const ns of res) {
            items.push({
              label: `NS: ${ns}`,
              sublabel: `${domain} Authoritative Nameserver · ↵ Copy`,
              value: ns
            })
          }
          break
        }
      }
    } else {
      // Query multi-records in parallel
      const [aRes, aaaaRes, mxRes, nsRes, txtRes, cnameRes] = await Promise.allSettled([
        dns.resolve4(domain),
        dns.resolve6(domain),
        dns.resolveMx(domain),
        dns.resolveNs(domain),
        dns.resolveTxt(domain),
        dns.resolveCname(domain)
      ])

      if (aRes.status === 'fulfilled') {
        for (const ip of aRes.value) {
          items.push({
            label: `A Record: ${ip}`,
            sublabel: `${domain} IPv4 address · ↵ to copy`,
            value: ip
          })
        }
      }

      if (cnameRes.status === 'fulfilled') {
        for (const cname of cnameRes.value) {
          items.push({
            label: `CNAME: ${cname}`,
            sublabel: `${domain} Canonical Alias · ↵ to copy`,
            value: cname
          })
        }
      }

      if (aaaaRes.status === 'fulfilled') {
        for (const ip of aaaaRes.value) {
          items.push({
            label: `AAAA Record: ${ip}`,
            sublabel: `${domain} IPv6 address · ↵ to copy`,
            value: ip
          })
        }
      }

      if (mxRes.status === 'fulfilled') {
        const sorted = [...mxRes.value].sort((a, b) => a.priority - b.priority)
        for (const mx of sorted.slice(0, 3)) {
          items.push({
            label: `MX: ${mx.exchange} (Priority ${mx.priority})`,
            sublabel: `${domain} Mail Server · ↵ to copy`,
            value: mx.exchange
          })
        }
      }

      if (nsRes.status === 'fulfilled') {
        for (const ns of nsRes.value.slice(0, 3)) {
          items.push({
            label: `NS: ${ns}`,
            sublabel: `${domain} Nameserver · ↵ to copy`,
            value: ns
          })
        }
      }

      if (txtRes.status === 'fulfilled') {
        for (const chunk of txtRes.value.slice(0, 4)) {
          const txt = chunk.join('')
          items.push({
            label: `TXT: ${txt.slice(0, 60)}${txt.length > 60 ? '...' : ''}`,
            sublabel: `${domain} TXT/SPF · ↵ to copy full record`,
            value: txt
          })
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return [
      {
        label: `DNS lookup failed for ${domain}`,
        sublabel: msg,
        value: '',
        disabled: true
      }
    ]
  }

  if (items.length === 0) {
    return [
      {
        label: `No DNS records found for ${domain}`,
        sublabel: 'The domain may not exist or does not publish records for this query',
        value: '',
        disabled: true
      }
    ]
  }

  return items
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
