import { clipboard } from 'electron'
import { evaluate } from 'mathjs'
import type { SearchResultItem } from '../../shared/types'

function tryRadixConversion(query: string): SearchResultItem[] | null {
  const q = query.trim()
  let num: number | null = null

  if (/^0x[0-9a-fA-F]+$/i.test(q)) {
    num = parseInt(q, 16)
  } else if (/^0b[01]+$/i.test(q)) {
    num = parseInt(q.slice(2), 2)
  } else if (/^0o[0-7]+$/i.test(q)) {
    num = parseInt(q.slice(2), 8)
  } else if (/^\d+$/.test(q)) {
    num = parseInt(q, 10)
  }

  if (num !== null && !isNaN(num) && num >= 0 && num <= Number.MAX_SAFE_INTEGER) {
    const hex = '0x' + num.toString(16).toUpperCase()
    const dec = num.toLocaleString('en-US')
    const bin = '0b' + num.toString(2)
    const oct = '0o' + num.toString(8)

    return [
      {
        label: `Decimal: ${dec}`,
        sublabel: `Base 10 integer value: ${num}`,
        value: String(num)
      },
      {
        label: `Hexadecimal: ${hex}`,
        sublabel: `Base 16 representation`,
        value: hex
      },
      {
        label: `Binary: ${bin}`,
        sublabel: `Base 2 representation (${num.toString(2).length} bits)`,
        value: bin
      },
      {
        label: `Octal: ${oct}`,
        sublabel: `Base 8 representation`,
        value: oct
      }
    ]
  }

  return null
}

const DATA_UNITS: Record<string, number> = {
  b: 1,
  byte: 1,
  bytes: 1,
  kb: 1024,
  kib: 1024,
  mb: 1024 ** 2,
  mib: 1024 ** 2,
  gb: 1024 ** 3,
  gib: 1024 ** 3,
  tb: 1024 ** 4,
  tib: 1024 ** 4,
  pb: 1024 ** 5,
  pib: 1024 ** 5
}

function tryDataConversion(query: string): SearchResultItem[] | null {
  const match = query.trim().match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)(?:\s+(?:to|in)\s+([a-zA-Z]+))?$/i)
  if (!match) return null

  const amount = parseFloat(match[1])
  const fromUnit = match[2].toLowerCase()
  const toUnit = match[3]?.toLowerCase()

  if (DATA_UNITS[fromUnit] !== undefined) {
    const bytes = amount * DATA_UNITS[fromUnit]

    if (toUnit && DATA_UNITS[toUnit] !== undefined) {
      const converted = bytes / DATA_UNITS[toUnit]
      const rounded = Number(converted.toFixed(4))
      return [
        {
          label: `${rounded} ${match[3].toUpperCase()}`,
          sublabel: `${amount} ${match[2].toUpperCase()} = ${rounded} ${match[3].toUpperCase()}`,
          value: String(rounded)
        }
      ]
    }

    // Show breakdown across standard units
    const kb = Number((bytes / 1024).toFixed(3))
    const mb = Number((bytes / 1024 ** 2).toFixed(3))
    const gb = Number((bytes / 1024 ** 3).toFixed(3))
    const tb = Number((bytes / 1024 ** 4).toFixed(4))

    return [
      {
        label: `${mb.toLocaleString()} MB`,
        sublabel: `${bytes.toLocaleString()} bytes`,
        value: `${mb} MB`
      },
      {
        label: `${gb.toLocaleString()} GB`,
        sublabel: `${amount} ${match[2].toUpperCase()}`,
        value: `${gb} GB`
      },
      {
        label: `${tb.toLocaleString()} TB`,
        sublabel: `${amount} ${match[2].toUpperCase()}`,
        value: `${tb} TB`
      },
      {
        label: `${kb.toLocaleString()} KB`,
        sublabel: `${amount} ${match[2].toUpperCase()}`,
        value: `${kb} KB`
      }
    ]
  }

  return null
}

function tryMathjsUnit(query: string): SearchResultItem[] | null {
  let expr = query.trim().replace(/\s+in\s+/i, ' to ')
  // Convert temperature abbreviations (e.g. 72 F to C -> 72 degF to degC)
  expr = expr
    .replace(/\b(\d+)\s*f\s+to\s+c\b/i, '$1 degF to degC')
    .replace(/\b(\d+)\s*c\s+to\s+f\b/i, '$1 degC to degF')

  try {
    const result = evaluate(expr)
    if (result !== undefined && result !== null) {
      const formatted = typeof result.format === 'function' ? result.format() : String(result)
      return [
        {
          label: `${formatted}`,
          sublabel: `Result for: ${query}`,
          value: formatted
        }
      ]
    }
  } catch {
    // ignore
  }
  return null
}

export function search(query: string): SearchResultItem[] {
  let q = query.trim()
  if (!q) {
    const cb = clipboard.readText().trim()
    if (cb && cb.length < 100 && (tryDataConversion(cb) || tryMathjsUnit(cb) || tryRadixConversion(cb))) {
      q = cb
    }
  }

  if (!q) {
    return [
      {
        label: 'Enter unit or number to convert (or copy to clipboard)',
        sublabel: 'Examples: /unit 16GB in MB · /unit 255 in hex · /unit 72 F to C · /unit 100 km to miles',
        value: '',
        disabled: true
      }
    ]
  }

  // 1. Data Unit Conversion
  const dataRes = tryDataConversion(q)
  if (dataRes) return dataRes

  // 2. Mathjs General Unit Conversion
  const mathRes = tryMathjsUnit(q)
  if (mathRes) return mathRes

  // 3. Number Radix Conversion
  const radixRes = tryRadixConversion(q)
  if (radixRes) return radixRes

  return [
    {
      label: 'Unable to convert unit or expression',
      sublabel: 'Try: 16 GB to MB · 255 in hex · 72 degF to degC · 100 km to miles',
      value: '',
      disabled: true
    }
  ]
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
