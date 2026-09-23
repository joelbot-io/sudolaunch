import { BrowserWindow, Notification } from 'electron'
import { getAppIconPath } from './icon'
import type { SudoNotification, NotificationType } from '../shared/types'

const MAX_NOTIFICATIONS = 100
let notifications: SudoNotification[] = []

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) {
        win.webContents.send('notifications-updated', notifications)
      }
    } catch {
      // window may be closing
    }
  }
}

export function getNotifications(): SudoNotification[] {
  return [...notifications]
}

export interface AddNotificationOptions {
  title: string
  body?: string
  type?: NotificationType
  commandName?: string
  commandInput?: string
  showNativeToast?: boolean
}

export function addNotification(options: AddNotificationOptions): SudoNotification {
  const item: SudoNotification = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: options.title,
    body: options.body,
    type: options.type ?? 'info',
    timestamp: Date.now(),
    commandName: options.commandName,
    commandInput: options.commandInput,
    read: false
  }

  notifications.unshift(item)
  if (notifications.length > MAX_NOTIFICATIONS) {
    notifications = notifications.slice(0, MAX_NOTIFICATIONS)
  }

  broadcast()

  // Still display native notification toast so user receives desktop alert if windows are inactive
  if (options.showNativeToast !== false) {
    try {
      const nativeBody = item.body
        ? item.body.length > 250
          ? `${item.body.slice(0, 247)}...`
          : item.body
        : item.title
      new Notification({
        title: item.title,
        body: nativeBody,
        icon: getAppIconPath()
      }).show()
    } catch (err) {
      console.warn('Failed to show native notification:', err)
    }
  }

  return item
}

export function clearNotifications(): void {
  notifications = []
  broadcast()
}

export function dismissNotification(id: string): void {
  notifications = notifications.filter((n) => n.id !== id)
  broadcast()
}

export function markNotificationsRead(): void {
  let changed = false
  for (const n of notifications) {
    if (!n.read) {
      n.read = true
      changed = true
    }
  }
  if (changed) {
    broadcast()
  }
}
