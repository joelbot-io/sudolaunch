import { clipboard } from 'electron'
import type { SearchResultItem } from '../../shared/types'

const NAMED_COLORS: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
  silver: [192, 192, 192],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  maroon: [128, 0, 0],
  olive: [128, 128, 0],
  purple: [128, 0, 128],
  teal: [0, 128, 128],
  navy: [0, 0, 128],
  orange: [255, 165, 0],
  pink: [255, 192, 203],
  gold: [255, 215, 0],
  tomato: [255, 99, 71],
  coral: [255, 127, 80],
  dodgerblue: [30, 144, 255],
  indigo: [75, 0, 130],
  violet: [238, 130, 238],
  rebeccapurple: [102, 51, 153]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360
  s /= 100
  l /= 100
  let r: number, g: number, b: number

  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

function parseColor(
  query: string
): { r: number; g: number; b: number; a?: number } | null {
  const q = query.trim().toLowerCase()

  // 1. Hex
  const hexMatch = q.match(/^#?([0-9a-f]{3,8})$/i)
  if (hexMatch) {
    const hex = hexMatch[1]
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16)
      }
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16)
      }
    }
    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: Number((parseInt(hex.slice(6, 8), 16) / 255).toFixed(2))
      }
    }
  }

  // 2. RGB / RGBA
  const rgbMatch = q.match(
    /^rgba?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9.]+))?\s*\)$/
  )
  if (rgbMatch) {
    return {
      r: Math.min(255, parseInt(rgbMatch[1], 10)),
      g: Math.min(255, parseInt(rgbMatch[2], 10)),
      b: Math.min(255, parseInt(rgbMatch[3], 10)),
      a: rgbMatch[4] ? parseFloat(rgbMatch[4]) : undefined
    }
  }

  // 3. HSL / HSLA
  const hslMatch = q.match(
    /^hsla?\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})%?\s*,\s*(\d{1,3})%?(?:\s*,\s*([0-9.]+))?\s*\)$/
  )
  if (hslMatch) {
    const h = parseInt(hslMatch[1], 10) % 360
    const s = Math.min(100, parseInt(hslMatch[2], 10))
    const l = Math.min(100, parseInt(hslMatch[3], 10))
    const [r, g, b] = hslToRgb(h, s, l)
    return {
      r,
      g,
      b,
      a: hslMatch[4] ? parseFloat(hslMatch[4]) : undefined
    }
  }

  // 4. Named colors
  if (NAMED_COLORS[q]) {
    const [r, g, b] = NAMED_COLORS[q]
    return { r, g, b }
  }

  return null
}

export function search(query: string): SearchResultItem[] {
  let q = query.trim()

  if (!q) {
    const cb = clipboard.readText().trim()
    if (cb && cb.length < 100 && parseColor(cb)) {
      q = cb
    }
  }

  if (!q) {
    return [
      {
        label: 'Enter a color to convert (or copy to clipboard)',
        sublabel: 'Examples: /color #3b82f6 · /color rgb(59, 130, 246) · /color hsl(217, 91%, 60%) · /color tomato',
        value: '',
        disabled: true
      }
    ]
  }

  const parsed = parseColor(q)
  if (!parsed) {
    return [
      {
        label: `Could not parse color "${q}"`,
        sublabel: 'Try hex (#3b82f6), rgb(59, 130, 246), hsl(217, 91%, 60%), or a color name',
        value: '',
        disabled: true
      }
    ]
  }

  const { r, g, b, a } = parsed
  const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase()
  const hexUpper = `#${toHex(r)}${toHex(g)}${toHex(b)}`
  const hexLower = hexUpper.toLowerCase()
  const rgbStr = `rgb(${r}, ${g}, ${b})`
  const rgbaStr = `rgba(${r}, ${g}, ${b}, ${a ?? 1})`
  const [h, s, l] = rgbToHsl(r, g, b)
  const hslStr = `hsl(${h}, ${s}%, ${l}%)`
  const hslaStr = `hsla(${h}, ${s}%, ${l}%, ${a ?? 1})`
  const cssVar = `--color: ${hexLower};`

  return [
    {
      label: `HEX: ${hexUpper}`,
      sublabel: `6-digit hex color format (${hexLower})`,
      value: hexUpper
    },
    {
      label: `RGB: ${rgbStr}`,
      sublabel: `Red: ${r}, Green: ${g}, Blue: ${b}`,
      value: rgbStr
    },
    {
      label: `RGBA: ${rgbaStr}`,
      sublabel: `Red, Green, Blue with Alpha channel`,
      value: rgbaStr
    },
    {
      label: `HSL: ${hslStr}`,
      sublabel: `Hue: ${h}°, Saturation: ${s}%, Lightness: ${l}%`,
      value: hslStr
    },
    {
      label: `HSLA: ${hslaStr}`,
      sublabel: `Hue, Saturation, Lightness with Alpha`,
      value: hslaStr
    },
    {
      label: `CSS Variable: ${cssVar}`,
      sublabel: `CSS custom property declaration`,
      value: cssVar
    }
  ]
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
