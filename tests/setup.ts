import { vi } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'

let mockClipboardText = ''

const electronMock = {
  clipboard: {
    readText: vi.fn(() => mockClipboardText),
    writeText: vi.fn((text: string) => {
      mockClipboardText = text
    })
  },
  app: {
    getPath: vi.fn(() => join(tmpdir(), 'sudolaunch-test-userdata')),
    getAppPath: vi.fn(() => process.cwd()),
    isPackaged: false,
    on: vi.fn(),
    quit: vi.fn()
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  },
  dialog: {
    showOpenDialog: vi.fn()
  },
  shell: {
    openExternal: vi.fn(),
    showItemInFolder: vi.fn()
  },
  powerMonitor: {
    on: vi.fn()
  },
  screen: {
    getPrimaryDisplay: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1040 }
    })),
    getAllDisplays: vi.fn(() => [
      { workArea: { x: 0, y: 0, width: 1920, height: 1040 } }
    ])
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}

vi.mock('electron', () => ({
  ...electronMock,
  default: electronMock
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true },
  electronApp: { setAppUserModelId: vi.fn() },
  optimizer: { watchWindowShortcuts: vi.fn() }
}))
