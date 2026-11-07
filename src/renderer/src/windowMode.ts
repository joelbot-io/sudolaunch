// Read once per window from the "mode" query param main/index.ts's/terminalWindow.ts's
// loadRenderer() sets when creating each window — lets the renderer know synchronously
// which window it's in, before the first paint, no IPC round-trip needed.
export type WindowMode = 'popup' | 'bar' | 'term' | 'notify' | 'shortcuts'

export const windowMode: WindowMode = (() => {
  const mode = new URLSearchParams(window.location.search).get('mode')
  return mode === 'bar' || mode === 'term' || mode === 'notify' || mode === 'shortcuts'
    ? mode
    : 'popup'
})()
