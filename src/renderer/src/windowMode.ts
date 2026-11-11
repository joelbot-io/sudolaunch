// Read once per window from the "mode" query param main/index.ts's/terminalWindow.ts's
// loadRenderer() sets when creating each window — lets the renderer know synchronously
// which window it's in, before the first paint, no IPC round-trip needed.
export type WindowMode = 'popup' | 'bar' | 'term' | 'notify' | 'shortcuts' | 'tui'

const searchParams = new URLSearchParams(window.location.search)

export const windowMode: WindowMode = (() => {
  const mode = searchParams.get('mode')
  return mode === 'bar' ||
    mode === 'term' ||
    mode === 'notify' ||
    mode === 'shortcuts' ||
    mode === 'tui'
    ? mode
    : 'popup'
})()

export const windowSessionId: string = searchParams.get('sessionId') ?? ''
