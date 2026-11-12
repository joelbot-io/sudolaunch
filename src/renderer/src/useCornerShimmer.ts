import { useEffect, useState } from 'react'

export interface CornerShimmerInfo {
  corner: 'tl' | 'tr' | 'br' | 'bl'
  color: string
  gradient: string
  flickerType: number | null
}

const SHIMMER_PALETTES = [
  { color: '#5aa0ff', gradient: 'linear-gradient(135deg, #5aa0ff, #50e3c2)' },
  { color: '#bd10e0', gradient: 'linear-gradient(135deg, #bd10e0, #5aa0ff)' },
  { color: '#ff6bb4', gradient: 'linear-gradient(135deg, #ff6bb4, #ffb45a)' },
  { color: '#50e3c2', gradient: 'linear-gradient(135deg, #50e3c2, #b8e986)' },
  { color: '#ffb45a', gradient: 'linear-gradient(135deg, #ffb45a, #ff6b6b)' },
  { color: '#a855f7', gradient: 'linear-gradient(135deg, #a855f7, #ec4899)' },
  { color: '#38bdf8', gradient: 'linear-gradient(135deg, #38bdf8, #818cf8)' },
  { color: '#34d399', gradient: 'linear-gradient(135deg, #34d399, #0ea5e9)' },
  { color: '#f472b6', gradient: 'linear-gradient(135deg, #f472b6, #fb7185)' },
  { color: '#fbbf24', gradient: 'linear-gradient(135deg, #fbbf24, #f59e0b)' },
  { color: '#c084fc', gradient: 'linear-gradient(135deg, #c084fc, #38bdf8)' },
  { color: '#4ade80', gradient: 'linear-gradient(135deg, #4ade80, #2dd4bf)' }
] as const

const CORNERS: ReadonlyArray<'tl' | 'tr' | 'br' | 'bl'> = ['tl', 'tr', 'br', 'bl']

export function useCornerShimmer(enabled: boolean): CornerShimmerInfo | null {
  const [shimmerInfo, setShimmerInfo] = useState<CornerShimmerInfo | null>(null)

  useEffect(() => {
    if (!enabled) {
      setShimmerInfo(null)
      return
    }

    let timerId: NodeJS.Timeout
    let resetId: NodeJS.Timeout

    const scheduleShimmer = (): void => {
      const randomDelay = Math.floor(Math.random() * 5000) + 5000
      timerId = setTimeout(() => {
        const randomCorner = CORNERS[Math.floor(Math.random() * CORNERS.length)]
        const randomTheme = SHIMMER_PALETTES[Math.floor(Math.random() * SHIMMER_PALETTES.length)]
        const randomFlicker = Math.random() < 0.4
        const flickerType = randomFlicker ? Math.floor(Math.random() * 3) + 1 : null
        setShimmerInfo({
          corner: randomCorner,
          color: randomTheme.color,
          gradient: randomTheme.gradient,
          flickerType
        })
        resetId = setTimeout(() => {
          setShimmerInfo(null)
          scheduleShimmer()
        }, 1200)
      }, randomDelay)
    }

    scheduleShimmer()

    return () => {
      clearTimeout(timerId)
      clearTimeout(resetId)
    }
  }, [enabled])

  return shimmerInfo
}

