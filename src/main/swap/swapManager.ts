import { app } from 'electron'
import * as net from 'net'
import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import { readSettings, readPeers } from '../config'
import type { SwapPeer } from '../../shared/types'
import { showSwapOverlay, hideSwapOverlay, getSwapOverlayBounds } from './swapOverlay'

interface ActiveSession {
  peer: SwapPeer
  socket: net.Socket
  hookProc: ChildProcess
}

let server: net.Server | null = null
let currentServerPort = 0
let activeSession: ActiveSession | null = null
let activeReceiverInjector: ChildProcess | null = null

function getSwapHookPath(): string | null {
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
  const candidates = [
    join(programFiles, 'SudoLaunch', 'bin', 'swaphook.exe'),
    join(programFiles, 'SudoLaunch', 'resources', 'bin', 'swaphook.exe'),
    join(programFiles, 'SudoLaunch', 'swaphook.exe'),
    process.resourcesPath ? join(process.resourcesPath, 'bin', 'swaphook.exe') : '',
    process.resourcesPath ? join(process.resourcesPath, 'resources', 'bin', 'swaphook.exe') : '',
    join(process.cwd(), 'resources', 'bin', 'swaphook.exe'),
    join(app ? app.getAppPath() : process.cwd(), 'resources', 'bin', 'swaphook.exe'),
    join(__dirname, '..', '..', 'resources', 'bin', 'swaphook.exe'),
    join(__dirname, '..', 'resources', 'bin', 'swaphook.exe')
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      if (candidate.toLowerCase().includes('program files')) {
        console.log(`[SwapManager] Using uiAccess-capable swaphook from: ${candidate}`)
      }
      return candidate
    }
  }
  return null
}

// ============================================================================
// SERVER (Target / Receiver Machine)
// ============================================================================
let activeReceiverSocket: net.Socket | null = null

export function releaseReceiver(): void {
  if (activeReceiverInjector && !activeReceiverInjector.killed) {
    try {
      activeReceiverInjector.stdin?.write('RELEASE\nSTOP\n')
      activeReceiverInjector.kill()
    } catch {
      // Ignore
    }
    activeReceiverInjector = null
  }
  if (activeReceiverSocket && !activeReceiverSocket.destroyed) {
    try {
      activeReceiverSocket.write('RELEASE\nSTOP\n')
      activeReceiverSocket.end()
      activeReceiverSocket.destroy()
    } catch {
      // Ignore
    }
    activeReceiverSocket = null
  }
}

export function isReceivingSwap(): boolean {
  return (activeReceiverInjector !== null && !activeReceiverInjector.killed) || (activeReceiverSocket !== null && !activeReceiverSocket.destroyed)
}

export function releaseAllSwap(): { outgoing: boolean; incoming: boolean } {
  const hadOutgoing = isSwapped()
  const hadIncoming = isReceivingSwap()

  swapBack()
  releaseReceiver()

  return { outgoing: hadOutgoing, incoming: hadIncoming }
}

export function startSwapServer(port?: number): void {
  const settings = readSettings()
  const listenPort = port ?? settings.swapPort ?? 41234

  if (server && currentServerPort === listenPort) {
    return
  }

  stopSwapServer()

  server = net.createServer((socket) => {
    socket.setNoDelay(true)
    activeReceiverSocket = socket
    const swapHookPath = getSwapHookPath()
    if (!swapHookPath) {
      console.error('[SwapServer] swaphook.exe not found.')
      socket.end('ERROR:NO_SWAPHOOK\n')
      return
    }

    // Kill any existing injector
    if (activeReceiverInjector && !activeReceiverInjector.killed) {
      try {
        activeReceiverInjector.stdin?.write('RELEASE\nSTOP\n')
        activeReceiverInjector.kill()
      } catch {
        // Ignore cleanup error
      }
    }

    try {
      activeReceiverInjector = spawn(swapHookPath, ['inject'], {
        stdio: ['pipe', 'ignore', 'ignore'],
        windowsHide: true
      })
    } catch (err) {
      console.error('[SwapServer] Failed to spawn swaphook inject:', err)
      socket.end('ERROR:SPAWN_FAILED\n')
      return
    }

    let serverBuffer = ''
    socket.on('data', (chunk) => {
      serverBuffer += chunk.toString()
      const lines = serverBuffer.split('\n')
      serverBuffer = lines.pop() ?? ''

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (line && activeReceiverInjector && !activeReceiverInjector.killed && activeReceiverInjector.stdin) {
          activeReceiverInjector.stdin.write(line + '\n')
        }
      }
    })

    const cleanup = (): void => {
      if (activeReceiverSocket === socket) {
        activeReceiverSocket = null
      }
      if (activeReceiverInjector && !activeReceiverInjector.killed) {
        try {
          activeReceiverInjector.stdin?.write('RELEASE\nSTOP\n')
          activeReceiverInjector.kill()
        } catch {
          // Ignore
        }
        activeReceiverInjector = null
      }
    }

    socket.on('end', cleanup)
    socket.on('close', cleanup)
    socket.on('error', (err) => {
      console.warn('[SwapServer] Socket error:', err.message)
      cleanup()
    })
  })

  server.on('error', (err) => {
    console.error(`[SwapServer] Failed to bind to port ${listenPort}:`, err.message)
  })

  server.listen(listenPort, () => {
    currentServerPort = listenPort
  })
}

export function stopSwapServer(): void {
  if (server) {
    try {
      server.close()
    } catch {
      // Ignore
    }
    server = null
    currentServerPort = 0
  }
  releaseReceiver()
}

// ============================================================================
// CLIENT (Host / Controller Machine)
// ============================================================================
export function isSwapped(): boolean {
  return activeSession !== null
}

export function getActivePeer(): SwapPeer | null {
  return activeSession ? activeSession.peer : null
}

export function resolvePeer(query: string | number): SwapPeer | null {
  const peers = readPeers()
  const q = String(query).trim().toLowerCase().replace(/^#/, '')

  // 1. Match by machine number ID
  const num = parseInt(q, 10)
  if (!isNaN(num)) {
    const matched = peers.find((p) => p.id === num)
    if (matched) return matched
  }

  // 2. Match by exact computer name
  const byName = peers.find((p) => p.name.toLowerCase() === q)
  if (byName) return byName

  // 3. Match by partial computer name
  const byPartial = peers.find((p) => p.name.toLowerCase().includes(q))
  if (byPartial) return byPartial

  // 4. Match by host/IP
  const byHost = peers.find((p) => p.host.toLowerCase() === q)
  if (byHost) return byHost

  // 5. If input looks like an IP address (e.g. 192.168.1.x) or host:port
  if (q.includes('.') || q.includes(':')) {
    let host = q
    let port = readSettings().swapPort || 41234
    if (q.includes(':')) {
      const parts = q.split(':')
      host = parts[0]
      const p = parseInt(parts[1], 10)
      if (!isNaN(p)) port = p
    }
    return {
      id: 0,
      name: host,
      host,
      port
    }
  }

  return null
}

export async function swapTo(peerTarget: SwapPeer | string | number): Promise<{ success: boolean; message: string }> {
  const peer: SwapPeer | null = typeof peerTarget === 'object' ? peerTarget : resolvePeer(peerTarget)

  if (!peer) {
    return { success: false, message: `Could not resolve computer "${peerTarget}". Check /settings -> Swap Peers.` }
  }

  // If already swapped to this exact peer, toggle back!
  if (activeSession && activeSession.peer.host === peer.host && activeSession.peer.port === peer.port) {
    swapBack()
    return { success: true, message: `Toggled input back to local computer.` }
  }

  // If swapped to another peer, disconnect previous first
  if (activeSession) {
    swapBack()
  }

  const swapHookPath = getSwapHookPath()
  if (!swapHookPath) {
    return { success: false, message: `swaphook.exe not found in resources/bin. Run scripts/repair-environment.ps1` }
  }

  return new Promise((resolve) => {
    let hasResolved = false

    const socket = net.connect({ host: peer.host, port: peer.port }, () => {
      socket.setNoDelay(true)

      // Socket connected! Now start the capture hook
      let hookProc: ChildProcess
      try {
        let captureArgs = ['capture']
        try {
          const bounds = getSwapOverlayBounds()
          if (bounds) {
            captureArgs = ['capture', String(bounds.x), String(bounds.y), String(bounds.width), String(bounds.height)]
          }
        } catch {
          // Fallback
        }

        hookProc = spawn(swapHookPath, captureArgs, {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        })
      } catch (err) {
        socket.destroy()
        if (!hasResolved) {
          hasResolved = true
          resolve({ success: false, message: `Failed to start swaphook capture: ${err}` })
        }
        return
      }

      activeSession = { peer, socket, hookProc }

      let buffer = ''
      hookProc.stdout?.on('data', (data: Buffer) => {
        const str = data.toString()
        buffer += str
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        let toSend = ''
        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (!line) continue

          if (line === 'TOGGLE') {
            swapBack()
            return
          }

          if (line.startsWith('M ') || line.startsWith('K ')) {
            toSend += line + '\n'
          }
        }

        if (toSend && socket && !socket.destroyed) {
          try {
            socket.write(toSend)
          } catch {
            // Ignore write error
          }
        }
      })

      hookProc.on('exit', () => {
        if (activeSession && activeSession.hookProc === hookProc) {
          swapBack()
        }
      })

      // Show top overlay banner
      const settings = readSettings()
      const hotkey = settings.swapToggleHotkey || 'ScrollLock'
      const targetLabel = peer.id > 0 ? `#${peer.id} (${peer.name})` : peer.name
      showSwapOverlay(targetLabel, `Press ${hotkey} to toggle back`, () => swapBack())

      if (!hasResolved) {
        hasResolved = true
        resolve({ success: true, message: `Swapped active input to ${targetLabel}` })
      }
    })

    socket.setTimeout(4000)
    socket.on('timeout', () => {
      socket.destroy()
      if (!hasResolved) {
        hasResolved = true
        resolve({ success: false, message: `Connection timed out connecting to ${peer.host}:${peer.port}` })
      }
    })

    socket.on('error', (err) => {
      if (!hasResolved) {
        hasResolved = true
        resolve({ success: false, message: `Connection failed to ${peer.host}:${peer.port} (${err.message})` })
      }
      swapBack()
    })

    socket.on('close', () => {
      swapBack()
    })
  })
}

export function swapBack(): void {
  if (!activeSession) return

  const { socket, hookProc } = activeSession
  activeSession = null

  try {
    socket.write('RELEASE\nSTOP\n')
    socket.end()
    socket.destroy()
  } catch {
    // Ignore
  }

  try {
    hookProc.stdin?.write('STOP\n')
    hookProc.kill()
  } catch {
    // Ignore
  }

  hideSwapOverlay()
}

// ============================================================================
// INITIALIZATION & LIFECYCLE
// ============================================================================
export function initSwap(): void {
  const settings = readSettings()
  if (settings.swapEnabled !== false) {
    startSwapServer(settings.swapPort)
  }
}

export function shutdownSwap(): void {
  swapBack()
  stopSwapServer()
}
