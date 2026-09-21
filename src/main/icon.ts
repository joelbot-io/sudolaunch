import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

export function getTrayIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'tray-icon@2x.png')
    : join(__dirname, '../../resources/tray-icon@2x.png')
}

export function getAppIconPath(): string {
  const custom = app.isPackaged
    ? join(process.resourcesPath, 'app-icon.png')
    : join(__dirname, '../../resources/app-icon.png')
  if (existsSync(custom)) {
    return custom
  }
  return getTrayIconPath()
}
