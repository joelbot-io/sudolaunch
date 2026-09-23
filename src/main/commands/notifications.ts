import type { SearchResultItem } from '../../shared/types'
import { getNotifications } from '../notifications'
import { openNotificationWindow } from '../notifyWindow'

export function search(): SearchResultItem[] {
  const all = getNotifications()
  const unread = all.filter((n) => !n.read).length
  return [
    {
      label: 'Notification Center',
      sublabel: all.length > 0 ? `${all.length} notifications (${unread} unread) · ↵ to open` : 'No notifications · ↵ to open',
      value: '__openNotifications'
    }
  ]
}

export async function execute(): Promise<void> {
  openNotificationWindow()
}
