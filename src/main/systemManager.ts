import { existsSync } from 'fs'
import { ipcMain, shell } from 'electron'
import type { WindowsUpdateActionType } from '../shared/types'
import { getEcosystemUpdates, runEcosystemUpdate } from './system/ecosystemManager'
import {
  getDevRuntimesStatus,
  getPathHealth,
  getSystemEnvVars,
  setSystemEnvVar,
  deleteSystemEnvVar
} from './system/runtimesAndEnv'
import {
  getSystemServices,
  togglePinSystemService,
  runSystemServiceAction,
  getSystemStartupApps,
  getSystemScheduledTasks,
  runSystemScheduledTaskAction
} from './system/servicesAndTasks'
import {
  getSystemPorts,
  getSystemProcesses,
  killSystemProcess,
  getSystemHostsEntries,
  saveSystemHostEntry,
  getSystemNetworkAdapters,
  runSystemNetworkAction
} from './system/networkAndPorts'
import {
  getCleanupTargets,
  cleanSystemTargets,
  getWindowsUpdateStatus,
  runWindowsUpdateAction,
  getSystemStorageAndPower,
  runSystemPowerOrRepairAction,
  getSystemSecurityPosture,
  runSystemSecurityAction,
  getSystemEventLogs
} from './system/storageAndSecurity'

export {
  getEcosystemUpdates,
  runEcosystemUpdate,
  getDevRuntimesStatus,
  getPathHealth,
  getSystemEnvVars,
  setSystemEnvVar,
  deleteSystemEnvVar,
  getSystemServices,
  togglePinSystemService,
  runSystemServiceAction,
  getSystemStartupApps,
  getSystemScheduledTasks,
  runSystemScheduledTaskAction,
  getSystemPorts,
  getSystemProcesses,
  killSystemProcess,
  getSystemHostsEntries,
  saveSystemHostEntry,
  getSystemNetworkAdapters,
  runSystemNetworkAction,
  getCleanupTargets,
  cleanSystemTargets,
  getWindowsUpdateStatus,
  runWindowsUpdateAction,
  getSystemStorageAndPower,
  runSystemPowerOrRepairAction,
  getSystemSecurityPosture,
  runSystemSecurityAction,
  getSystemEventLogs
}

// ============================================================================
// Register System Manager IPC
// ============================================================================

export function registerSystemManagerIpc(): void {
  ipcMain.handle(
    'system-get-windows-update-status',
    (
      _event,
      options?: { force?: boolean; scanPending?: boolean; online?: boolean }
    ) => getWindowsUpdateStatus(options)
  )
  ipcMain.handle(
    'system-run-windows-update-action',
    (_event, action: WindowsUpdateActionType, targetKbOrTitle?: string) =>
      runWindowsUpdateAction(action, targetKbOrTitle)
  )
  ipcMain.handle('system-get-ecosystem-updates', (_event, force?: boolean) =>
    getEcosystemUpdates(Boolean(force))
  )
  ipcMain.handle(
    'system-run-ecosystem-update',
    (
      _event,
      params: {
        manager: 'npm' | 'pip' | 'psmodule' | 'wsl'
        id?: string
        all?: boolean
        inTerminal?: boolean
      }
    ) => runEcosystemUpdate(params)
  )
  ipcMain.handle('system-get-runtimes', (_event, force?: boolean) =>
    getDevRuntimesStatus(Boolean(force))
  )
  ipcMain.handle('system-get-path-health', () => getPathHealth())
  ipcMain.handle('system-get-env-vars', () => getSystemEnvVars())
  ipcMain.handle(
    'system-set-env-var',
    (
      _event,
      params: { name: string; value: string; scope: 'User' | 'Machine'; elevated?: boolean }
    ) => setSystemEnvVar(params)
  )
  ipcMain.handle(
    'system-delete-env-var',
    (_event, params: { name: string; scope: 'User' | 'Machine'; elevated?: boolean }) =>
      deleteSystemEnvVar(params)
  )
  ipcMain.handle('system-get-services', (_event, force?: boolean) =>
    getSystemServices(Boolean(force))
  )
  ipcMain.handle('system-toggle-pin-service', (_event, name: string) =>
    togglePinSystemService(name)
  )
  ipcMain.handle(
    'system-run-service-action',
    (
      _event,
      params: {
        name: string
        action: 'start' | 'stop' | 'restart' | 'auto' | 'manual' | 'disabled'
        elevated?: boolean
      }
    ) => runSystemServiceAction(params)
  )
  ipcMain.handle('system-get-startup-apps', () => getSystemStartupApps())
  ipcMain.handle('system-get-scheduled-tasks', (_event, force?: boolean) =>
    getSystemScheduledTasks(Boolean(force))
  )
  ipcMain.handle(
    'system-run-scheduled-task-action',
    (
      _event,
      params: {
        taskPath: string
        taskName: string
        action: 'run' | 'enable' | 'disable'
        elevated?: boolean
      }
    ) => runSystemScheduledTaskAction(params)
  )
  ipcMain.handle('system-get-ports', () => getSystemPorts())
  ipcMain.handle('system-get-processes', () => getSystemProcesses())
  ipcMain.handle('system-kill-process', (_event, pid: number, elevated?: boolean) =>
    killSystemProcess(pid, elevated)
  )
  ipcMain.handle('system-get-hosts-entries', () => getSystemHostsEntries())
  ipcMain.handle(
    'system-save-host-entry',
    (
      _event,
      params: {
        action: 'toggle' | 'add' | 'delete'
        lineIndex?: number
        ip?: string
        hostname?: string
        comment?: string
      }
    ) => saveSystemHostEntry(params)
  )
  ipcMain.handle('system-get-network-adapters', () => getSystemNetworkAdapters())
  ipcMain.handle(
    'system-run-network-action',
    (
      _event,
      params: {
        action:
          | 'flush-dns'
          | 'reset-winsock'
          | 'set-dns'
          | 'allow-port-firewall'
          | 'open-hosts-folder'
        adapterName?: string
        dnsPreset?: 'cloudflare' | 'google' | 'quad9' | 'dhcp'
        port?: number
      }
    ) => runSystemNetworkAction(params)
  )
  ipcMain.handle('system-get-cleanup-targets', () => getCleanupTargets())
  ipcMain.handle('system-clean-targets', (_event, ids: string[]) => cleanSystemTargets(ids))
  ipcMain.handle('system-get-storage-and-power', () => getSystemStorageAndPower())
  ipcMain.handle(
    'system-run-power-or-repair-action',
    (
      _event,
      params: {
        action:
          | 'set-power-plan'
          | 'wsl-shutdown'
          | 'sfc-scannow'
          | 'dism-check'
          | 'dism-restore'
          | 'dism-cleanup'
          | 'wsreset'
          | 'battery-report'
        planGuid?: string
      }
    ) => runSystemPowerOrRepairAction(params)
  )
  ipcMain.handle('system-get-security-posture', (_event, force?: boolean) =>
    getSystemSecurityPosture(Boolean(force))
  )
  ipcMain.handle(
    'system-run-security-action',
    (
      _event,
      params: {
        action:
          | 'update-signatures'
          | 'quick-scan'
          | 'open-defender'
          | 'add-exclusion-path'
          | 'remove-exclusion-path'
        targetPath?: string
      }
    ) => runSystemSecurityAction(params)
  )
  ipcMain.handle('system-get-event-logs', () => getSystemEventLogs())
  ipcMain.handle('system-open-external', (_event, url: string) => {
    if (url && /^https?:\/\//i.test(url)) {
      shell.openExternal(url)
    }
  })
  ipcMain.handle('system-reveal-path', (_event, targetPath: string) => {
    if (targetPath && existsSync(targetPath)) {
      shell.showItemInFolder(targetPath)
    }
  })
}

