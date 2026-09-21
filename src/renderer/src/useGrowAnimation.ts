import { useEffect, useState } from 'react'
import type { GrowOrigin } from '../../shared/types'

export type GrowPhase = 'pending' | 'running' | 'collapsing' | null

// Shared by CommandPalette, NotificationPanel, and Terminal — each of the three dock
// windows grows out of its shelf icon on open and shrinks back into it on close, driven
// by the same origin/phase state machine main sends them (see e.g. revealPaletteWindow
// and closePaletteWindow in main/index.ts, or the equivalent notify-grow-origin /
// notify-collapsing pair for the notification window).
export function useGrowAnimation(): {
  growOrigin: GrowOrigin | null
  growPhase: GrowPhase
  setGrowOrigin: (origin: GrowOrigin | null) => void
  setGrowPhase: (phase: GrowPhase) => void
  growClassNames: string
  growStyle: React.CSSProperties | undefined
  onGrowEnd: (e: React.AnimationEvent<HTMLElement>) => void
} {
  const [growOrigin, setGrowOrigin] = useState<GrowOrigin | null>(null)
  const [growPhase, setGrowPhase] = useState<GrowPhase>(null)

  // One frame of 'pending' (opacity:0, content display:none — see .grow-pending in
  // styles.css) lets the animation below start against an already-painted, layer-promoted
  // element instead of racing the content's first paint. 80ms: allows Electron's native
  // window resize/opacity change and Chromium's paint to fully settle first, avoiding a
  // first-frame jump — see revealPaletteWindow's comment on why this is sent atomically
  // with the mode/content change rather than as a separate message.
  useEffect(() => {
    if (growPhase !== 'pending') return
    const timer = setTimeout(() => setGrowPhase('running'), 80)
    return () => clearTimeout(timer)
  }, [growPhase])

  const growClassNames = [
    growPhase === 'pending' ? 'grow-pending' : '',
    growPhase === 'running' ? 'grow-in' : '',
    growPhase === 'collapsing' ? 'grow-out' : ''
  ]
    .filter(Boolean)
    .join(' ')

  const growStyle = growOrigin
    ? ({
        '--grow-origin-x': `${growOrigin.originX}%`,
        '--grow-origin-y': `${growOrigin.originY}%`,
        '--grow-scale': growOrigin.scale
      } as React.CSSProperties)
    : undefined

  // Scoped to the animated element's own animation — animationend bubbles, so a
  // descendant's unrelated animation (e.g. a status-glow pulse) must not be able to clear
  // the grow state out from under it.
  const onGrowEnd = (e: React.AnimationEvent<HTMLElement>): void => {
    if (e.target !== e.currentTarget) return
    setGrowOrigin(null)
    setGrowPhase(null)
  }

  return { growOrigin, growPhase, setGrowOrigin, setGrowPhase, growClassNames, growStyle, onGrowEnd }
}
