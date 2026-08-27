import { writeFilePaths } from 'electron-clipboard-ex'

// Electron's built-in `clipboard` module has no way to put actual file references on the
// OS clipboard (only text/html/rtf/bookmark/image) — copying a GIF as an image would flatten
// it to a static frame. electron-clipboard-ex reaches past that (native addon, Windows/macOS)
// to write a real file-list clipboard entry, the same as copying a file in Explorer, so a
// paste into Teams attaches it and keeps the animation.
export function copyFileToClipboard(absPath: string): void {
  writeFilePaths([absPath])
}
