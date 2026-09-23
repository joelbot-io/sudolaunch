import { clipboard } from 'electron'
import type { SearchResultItem } from '../../shared/types'

interface KeyEntry {
  name: string
  key: string
  code: string
  keyCode: number
  vkCode: string
  electronAccelerator: string
}

const COMMON_KEYS: KeyEntry[] = [
  { name: 'Enter', key: 'Enter', code: 'Enter', keyCode: 13, vkCode: 'VK_RETURN (0x0D)', electronAccelerator: 'Return / Enter' },
  { name: 'Escape', key: 'Escape', code: 'Escape', keyCode: 27, vkCode: 'VK_ESCAPE (0x1B)', electronAccelerator: 'Esc / Escape' },
  { name: 'Space', key: ' ', code: 'Space', keyCode: 32, vkCode: 'VK_SPACE (0x20)', electronAccelerator: 'Space' },
  { name: 'Tab', key: 'Tab', code: 'Tab', keyCode: 9, vkCode: 'VK_TAB (0x09)', electronAccelerator: 'Tab' },
  { name: 'Backspace', key: 'Backspace', code: 'Backspace', keyCode: 8, vkCode: 'VK_BACK (0x08)', electronAccelerator: 'Backspace' },
  { name: 'Delete', key: 'Delete', code: 'Delete', keyCode: 46, vkCode: 'VK_DELETE (0x2E)', electronAccelerator: 'Delete' },
  { name: 'Insert', key: 'Insert', code: 'Insert', keyCode: 45, vkCode: 'VK_INSERT (0x2D)', electronAccelerator: 'Insert' },
  { name: 'Control (Ctrl)', key: 'Control', code: 'ControlLeft / ControlRight', keyCode: 17, vkCode: 'VK_CONTROL (0x11)', electronAccelerator: 'CommandOrControl / Ctrl' },
  { name: 'Shift', key: 'Shift', code: 'ShiftLeft / ShiftRight', keyCode: 16, vkCode: 'VK_SHIFT (0x10)', electronAccelerator: 'Shift' },
  { name: 'Alt', key: 'Alt', code: 'AltLeft / AltRight', keyCode: 18, vkCode: 'VK_MENU (0x12)', electronAccelerator: 'Alt' },
  { name: 'Windows / Meta / Super', key: 'Meta', code: 'MetaLeft / MetaRight', keyCode: 91, vkCode: 'VK_LWIN (0x5B)', electronAccelerator: 'Super' },
  { name: 'Arrow Up', key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, vkCode: 'VK_UP (0x26)', electronAccelerator: 'Up' },
  { name: 'Arrow Down', key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, vkCode: 'VK_DOWN (0x28)', electronAccelerator: 'Down' },
  { name: 'Arrow Left', key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37, vkCode: 'VK_LEFT (0x25)', electronAccelerator: 'Left' },
  { name: 'Arrow Right', key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, vkCode: 'VK_RIGHT (0x27)', electronAccelerator: 'Right' },
  { name: 'Home', key: 'Home', code: 'Home', keyCode: 36, vkCode: 'VK_HOME (0x24)', electronAccelerator: 'Home' },
  { name: 'End', key: 'End', code: 'End', keyCode: 35, vkCode: 'VK_END (0x23)', electronAccelerator: 'End' },
  { name: 'Page Up', key: 'PageUp', code: 'PageUp', keyCode: 33, vkCode: 'VK_PRIOR (0x21)', electronAccelerator: 'PageUp' },
  { name: 'Page Down', key: 'PageDown', code: 'PageDown', keyCode: 34, vkCode: 'VK_NEXT (0x22)', electronAccelerator: 'PageDown' },
  { name: 'F1', key: 'F1', code: 'F1', keyCode: 112, vkCode: 'VK_F1 (0x70)', electronAccelerator: 'F1' },
  { name: 'F2', key: 'F2', code: 'F2', keyCode: 113, vkCode: 'VK_F2 (0x71)', electronAccelerator: 'F2' },
  { name: 'F3', key: 'F3', code: 'F3', keyCode: 114, vkCode: 'VK_F3 (0x72)', electronAccelerator: 'F3' },
  { name: 'F4', key: 'F4', code: 'F4', keyCode: 115, vkCode: 'VK_F4 (0x73)', electronAccelerator: 'F4' },
  { name: 'F5', key: 'F5', code: 'F5', keyCode: 116, vkCode: 'VK_F5 (0x74)', electronAccelerator: 'F5' },
  { name: 'F6', key: 'F6', code: 'F6', keyCode: 117, vkCode: 'VK_F6 (0x75)', electronAccelerator: 'F6' },
  { name: 'F7', key: 'F7', code: 'F7', keyCode: 118, vkCode: 'VK_F7 (0x76)', electronAccelerator: 'F7' },
  { name: 'F8', key: 'F8', code: 'F8', keyCode: 119, vkCode: 'VK_F8 (0x77)', electronAccelerator: 'F8' },
  { name: 'F9', key: 'F9', code: 'F9', keyCode: 120, vkCode: 'VK_F9 (0x78)', electronAccelerator: 'F9' },
  { name: 'F10', key: 'F10', code: 'F10', keyCode: 121, vkCode: 'VK_F10 (0x79)', electronAccelerator: 'F10' },
  { name: 'F11', key: 'F11', code: 'F11', keyCode: 122, vkCode: 'VK_F11 (0x7A)', electronAccelerator: 'F11' },
  { name: 'F12', key: 'F12', code: 'F12', keyCode: 123, vkCode: 'VK_F12 (0x7B)', electronAccelerator: 'F12' },
  { name: 'Caps Lock', key: 'CapsLock', code: 'CapsLock', keyCode: 20, vkCode: 'VK_CAPITAL (0x14)', electronAccelerator: 'Capslock' },
  { name: 'Num Lock', key: 'NumLock', code: 'NumLock', keyCode: 144, vkCode: 'VK_NUMLOCK (0x90)', electronAccelerator: 'Numlock' },
  { name: 'Scroll Lock', key: 'ScrollLock', code: 'ScrollLock', keyCode: 145, vkCode: 'VK_SCROLL (0x91)', electronAccelerator: 'Scrolllock' },
  { name: 'Print Screen', key: 'PrintScreen', code: 'PrintScreen', keyCode: 44, vkCode: 'VK_SNAPSHOT (0x2C)', electronAccelerator: 'PrintScreen' }
]

export function search(query: string): SearchResultItem[] {
  const q = query.trim().toLowerCase()
  const items: SearchResultItem[] = []

  const list = q
    ? COMMON_KEYS.filter(
        (k) =>
          k.name.toLowerCase().includes(q) ||
          k.key.toLowerCase().includes(q) ||
          k.code.toLowerCase().includes(q) ||
          k.keyCode.toString() === q ||
          k.electronAccelerator.toLowerCase().includes(q) ||
          k.vkCode.toLowerCase().includes(q)
      )
    : COMMON_KEYS

  if (!q) {
    items.push({
      label: '⌨️ Keycode & Keyboard Event Inspector',
      sublabel: 'Type any key name (e.g. /key escape, /key enter, /key f11, /key 13) or accelerator',
      value: '',
      disabled: true
    })
  }

  for (const k of list) {
    items.push({
      label: `${k.name} · keyCode ${k.keyCode} (0x${k.keyCode.toString(16).toUpperCase()})`,
      sublabel: `e.key: "${k.key}" · e.code: "${k.code}" · VK: ${k.vkCode} · Accelerator: "${k.electronAccelerator}"`,
      value: JSON.stringify(
        {
          key: k.key,
          code: k.code,
          keyCode: k.keyCode,
          vkCode: k.vkCode,
          electronAccelerator: k.electronAccelerator
        },
        null,
        2
      )
    })
  }

  if (items.length === 0) {
    items.push({
      label: `No keys matching "${query}"`,
      sublabel: 'Try typing a key name (e.g. /key ctrl, /key enter, /key tab)',
      value: '',
      disabled: true
    })
  }

  return items
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
