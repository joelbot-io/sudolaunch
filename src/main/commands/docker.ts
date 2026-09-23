import { execSync } from 'child_process'
import { clipboard } from 'electron'
import type { SearchResultItem } from '../../shared/types'

interface ContainerInfo {
  id: string
  name: string
  image: string
  status: string
  running: boolean
  ports: string
}

let isDockerAvailableCache: boolean | null = null

function checkDocker(): boolean {
  if (isDockerAvailableCache !== null) return isDockerAvailableCache
  try {
    execSync('where docker', { stdio: 'ignore', timeout: 1000, windowsHide: true })
    isDockerAvailableCache = true
  } catch {
    isDockerAvailableCache = false
  }
  return isDockerAvailableCache
}

function getContainers(): { containers: ContainerInfo[]; error?: string } {
  if (!checkDocker()) {
    return { containers: [], error: 'Docker CLI not found in PATH. Ensure Docker Desktop is installed and running.' }
  }

  try {
    const raw = execSync('docker ps -a --format "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"', {
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true
    })

    const list: ContainerInfo[] = []
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const [id, name, image, status, ports] = trimmed.split('\t')
      if (id && name) {
        const isUp = status.toLowerCase().startsWith('up')
        list.push({
          id,
          name,
          image: image || 'unknown',
          status: status || '',
          running: isUp,
          ports: ports || 'None'
        })
      }
    }
    return { containers: list }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('daemon is not running') || msg.includes('docker Desktop') || msg.includes('connect')) {
      return { containers: [], error: 'Docker daemon is not running. Please start Docker Desktop.' }
    }
    return { containers: [], error: `Docker error: ${msg.slice(0, 100)}` }
  }
}

export function search(query: string): SearchResultItem[] {
  const q = query.trim().toLowerCase()
  const { containers, error } = getContainers()

  if (error) {
    return [
      {
        label: 'Docker Status',
        sublabel: error,
        value: '',
        disabled: true
      }
    ]
  }

  const items: SearchResultItem[] = []

  // Check for subcommands like prune or images
  if (!q || 'prune'.includes(q)) {
    items.push({
      label: '🧹 Prune Containers & Dangling Images',
      sublabel: 'Run "docker system prune -f" to reclaim disk space · ↵ to run',
      value: '__docker_prune'
    })
  }

  // Filter containers
  const filtered = containers.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.image.toLowerCase().includes(q) ||
      c.id.toLowerCase().startsWith(q) ||
      c.ports.toLowerCase().includes(q)
  )

  if (filtered.length === 0 && containers.length > 0) {
    items.push({
      label: `No containers matching "${query}"`,
      sublabel: `${containers.length} total containers running or stopped`,
      value: '',
      disabled: true
    })
  }

  for (const c of filtered) {
    const icon = c.running ? '🟢' : '🔴'
    items.push({
      label: `${icon} ${c.name} (${c.image})`,
      sublabel: `${c.status} · Ports: ${c.ports} · ↵ Copy ID: ${c.id}`,
      value: c.id
    })
  }

  if (containers.length === 0 && !items.length) {
    items.push({
      label: 'No Docker containers found',
      sublabel: 'No active or stopped containers on this machine',
      value: '',
      disabled: true
    })
  }

  return items
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value === '__docker_prune') {
    try {
      execSync('docker system prune -f', { encoding: 'utf8', timeout: 15000, windowsHide: true })
    } catch {
      // ignore
    }
    return
  }

  if (item.value) {
    clipboard.writeText(item.value)
  }
}
