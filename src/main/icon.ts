import { app } from 'electron'
import { join } from 'path'

export function getAppIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'tray-icon@2x.png')
    : join(__dirname, '../../resources/tray-icon@2x.png')
}
