// Electron accelerator strings ("CommandOrControl+Space", "Control+Super") are written for
// the API, not for people — this renders them the way Windows labels the same keys, for
// display in tooltips.
const KEY_LABELS: Record<string, string> = {
  commandorcontrol: 'Ctrl',
  cmdorctrl: 'Ctrl',
  control: 'Ctrl',
  ctrl: 'Ctrl',
  super: 'Win',
  meta: 'Win',
  alt: 'Alt',
  altgr: 'AltGr',
  shift: 'Shift',
  space: 'Space',
  plus: '+'
}

export function formatAccelerator(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => KEY_LABELS[part.trim().toLowerCase()] ?? part.trim())
    .join('+')
}
