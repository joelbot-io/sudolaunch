import { clipboard } from 'electron'
import { execSync } from 'child_process'
import type { SearchResultItem } from '../../shared/types'

interface PortEntry {
  proto: string
  localAddress: string
  port: number
  pid: number
  processName?: string
}

const PORT_CACHE_TTL_MS = 6000
let cachedPorts: PortEntry[] | null = null
let cachedPortsAt = 0

function getProcessMap(): Map<number, string> {
  const map = new Map<number, string>()
  try {
    const raw = execSync('tasklist /FO CSV /NH', { encoding: 'utf8', timeout: 2000, windowsHide: true })
    for (const line of raw.split('\n')) {
      const parts = line.trim().split('","')
      if (parts.length >= 2) {
        const name = parts[0].replace(/^"/, '')
        const pid = parseInt(parts[1].replace(/"$/, ''), 10)
        if (!isNaN(pid)) {
          map.set(pid, name)
        }
      }
    }
  } catch {
    // ignore
  }
  return map
}

function getListeningPorts(): PortEntry[] {
  const now = Date.now()
  if (cachedPorts && now - cachedPortsAt < PORT_CACHE_TTL_MS) {
    return cachedPorts
  }
  const entries: PortEntry[] = []
  try {
    const raw = execSync('netstat -ano -p tcp', { encoding: 'utf8', timeout: 2500, windowsHide: true })
    const procMap = getProcessMap()
    const seen = new Set<string>()

    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('TCP') || !trimmed.includes('LISTENING')) continue

      const parts = trimmed.split(/\s+/)
      if (parts.length >= 5) {
        const localAddr = parts[1]
        const pid = parseInt(parts[4], 10)
        const lastColon = localAddr.lastIndexOf(':')
        if (lastColon !== -1 && !isNaN(pid)) {
          const port = parseInt(localAddr.slice(lastColon + 1), 10)
          const key = `${port}-${pid}`
          if (!seen.has(key) && !isNaN(port)) {
            seen.add(key)
            entries.push({
              proto: 'TCP',
              localAddress: localAddr,
              port,
              pid,
              processName: procMap.get(pid) ?? 'Unknown Process'
            })
          }
        }
      }
    }
  } catch {
    // ignore
  }
  cachedPorts = entries.sort((a, b) => a.port - b.port)
  cachedPortsAt = now
  return cachedPorts
}

export function search(query: string): SearchResultItem[] {
  const q = query.trim()
  const portNum = parseInt(q, 10)
  const allPorts = getListeningPorts()

  if (!isNaN(portNum) && portNum > 0) {
    const matches = allPorts.filter((p) => p.port === portNum)
    if (matches.length === 0) {
      return [
        {
          label: `Port ${portNum} is free (no active listener)`,
          sublabel: 'No process is currently listening on this port',
          value: `http://localhost:${portNum}`
        }
      ]
    }

    const results: SearchResultItem[] = []
    for (const m of matches) {
      results.push({
        label: `Kill Process: ${m.processName} (PID ${m.pid}) on port ${m.port}`,
        sublabel: `Press Enter to terminate process (taskkill /F /PID ${m.pid})`,
        value: `__kill__::${m.pid}::${m.processName}::${m.port}`
      })
      results.push({
        label: `Copy PID: ${m.pid} (${m.processName})`,
        sublabel: `Process ID for ${m.processName} on port ${m.port}`,
        value: String(m.pid)
      })
      results.push({
        label: `Open / Copy URL: http://localhost:${m.port}`,
        sublabel: `Localhost address for port ${m.port}`,
        value: `http://localhost:${m.port}`
      })
    }
    return results
  }

  // Filter by process name or port string
  const filtered = q
    ? allPorts.filter(
        (p) =>
          String(p.port).includes(q) ||
          (p.processName && p.processName.toLowerCase().includes(q.toLowerCase()))
      )
    : allPorts.slice(0, 30)

  if (filtered.length === 0) {
    return [
      {
        label: `No matching listening ports for "${q}"`,
        sublabel: 'Type a port number like /port 3000 or a process name like /port node',
        value: '',
        disabled: true
      }
    ]
  }

  return filtered.map((p) => ({
    label: `Port ${p.port}: ${p.processName} (PID ${p.pid})`,
    sublabel: `Select to terminate or copy PID · Listening on ${p.localAddress}`,
    value: `__kill__::${p.pid}::${p.processName}::${p.port}`
  }))
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value.startsWith('__kill__::')) {
    const parts = item.value.split('::')
    const pidNum = parseInt(parts[1], 10)
    if (!isNaN(pidNum) && pidNum > 0) {
      try {
        execSync(`taskkill /F /PID ${pidNum}`, { windowsHide: true })
      } catch {
        // ignore
      }
      cachedPorts = null
      clipboard.writeText(String(pidNum))
    }
    return
  }

  if (item.value) {
    clipboard.writeText(item.value)
  }
}
