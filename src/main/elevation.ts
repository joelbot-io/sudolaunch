import { spawn } from 'child_process'
import { addNotification } from './notifications'

export function runElevated(commandText: string, label?: string, commandName?: string): void {
  // PowerShell -EncodedCommand expects a UTF-16LE base64 encoded string
  const encoded = Buffer.from(commandText, 'utf16le').toString('base64')

  // Spawn an elevated PowerShell console via Start-Process -Verb RunAs
  const launcherScript = `Start-Process powershell.exe -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-EncodedCommand', '${encoded}')`

  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', launcherScript], {
    windowsHide: true
  })

  child.on('error', (err) => {
    addNotification({
      title: `${label ?? commandName ?? 'Command'} (Elevated Failed)`,
      body: `Failed to launch elevated process: ${err.message}`,
      type: 'error',
      commandName,
      commandInput: commandText
    })
  })

  addNotification({
    title: `${label ?? commandName ?? 'Command'} (Elevated)`,
    type: 'info',
    commandName,
    showNativeToast: false
  })
}
