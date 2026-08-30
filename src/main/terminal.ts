import * as pty from 'node-pty'

let ptyProcess: pty.IPty | null = null
let dataListeners: Array<(data: string) => void> = []
let exitListeners: Array<(code: number) => void> = []

// Lazy — the pty is only spawned the first time the terminal is expanded, and then kept
// alive in the background (see terminalWindow.ts) so scrollback/session state survives
// collapsing the panel, not just the app staying open.
export function ensurePty(cols: number, rows: number): void {
  if (ptyProcess) return
  ptyProcess = pty.spawn('powershell.exe', ['-NoLogo'], {
    name: 'xterm-color',
    cols,
    rows,
    cwd: process.env.USERPROFILE,
    env: process.env as Record<string, string>
  })
  ptyProcess.onData((data) => {
    for (const listener of dataListeners) listener(data)
  })
  ptyProcess.onExit(({ exitCode }) => {
    // e.g. the user typed "exit" — next expand spawns a fresh session rather than
    // silently doing nothing.
    ptyProcess = null
    for (const listener of exitListeners) listener(exitCode)
  })
}

export function writeToPty(data: string): void {
  ptyProcess?.write(data)
}

export function resizePty(cols: number, rows: number): void {
  if (cols > 0 && rows > 0) ptyProcess?.resize(cols, rows)
}

export function onPtyData(listener: (data: string) => void): () => void {
  dataListeners.push(listener)
  return () => {
    dataListeners = dataListeners.filter((l) => l !== listener)
  }
}

export function onPtyExit(listener: (code: number) => void): () => void {
  exitListeners.push(listener)
  return () => {
    exitListeners = exitListeners.filter((l) => l !== listener)
  }
}

export function killPty(): void {
  ptyProcess?.kill()
  ptyProcess = null
}
