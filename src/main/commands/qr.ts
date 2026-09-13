import { clipboard } from 'electron'
import type { SearchResultItem } from '../../shared/types'

// Compact, self-contained QR Code Generator (Versions 1-10, EC Level L/M)
// Galois Field GF(256) tables with primitive polynomial 0x11d (x^8 + x^4 + x^3 + x^2 + 1)
const EXP_TABLE = new Uint8Array(512)
const LOG_TABLE = new Uint8Array(256)

;(() => {
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x
    EXP_TABLE[i + 255] = x
    LOG_TABLE[x] = i
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0)
  }
})()

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]]
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1])
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1)
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], EXP_TABLE[i])
      next[j + 1] ^= poly[j]
    }
    poly = next
  }
  return poly
}

function rsEncode(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount)
  const remainder = new Uint8Array(ecCount)
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0]
    remainder.copyWithin(0, 1)
    remainder[ecCount - 1] = 0
    if (factor !== 0) {
      for (let j = 0; j < ecCount; j++) {
        remainder[j] ^= gfMul(gen[j], factor)
      }
    }
  }
  return remainder
}

// Version table definitions (Capacity in bytes for Byte Mode with EC Level M)
// [totalCodewords, ecCodewordsPerBlock, numBlocksGroup1, dataCodewordsPerBlockG1, numBlocksGroup2, dataCodewordsPerBlockG2]
interface VersionSpec {
  version: number
  totalCodewords: number
  ecPerBlock: number
  blocks1: number
  dataPerBlock1: number
  blocks2: number
  dataPerBlock2: number
  alignment: number[]
}

const VERSION_SPECS: VersionSpec[] = [
  { version: 1, totalCodewords: 26, ecPerBlock: 10, blocks1: 1, dataPerBlock1: 16, blocks2: 0, dataPerBlock2: 0, alignment: [] },
  { version: 2, totalCodewords: 44, ecPerBlock: 16, blocks1: 1, dataPerBlock1: 28, blocks2: 0, dataPerBlock2: 0, alignment: [6, 18] },
  { version: 3, totalCodewords: 70, ecPerBlock: 26, blocks1: 1, dataPerBlock1: 44, blocks2: 0, dataPerBlock2: 0, alignment: [6, 22] },
  { version: 4, totalCodewords: 100, ecPerBlock: 18, blocks1: 2, dataPerBlock1: 32, blocks2: 0, dataPerBlock2: 0, alignment: [6, 26] },
  { version: 5, totalCodewords: 134, ecPerBlock: 24, blocks1: 2, dataPerBlock1: 43, blocks2: 0, dataPerBlock2: 0, alignment: [6, 30] },
  { version: 6, totalCodewords: 172, ecPerBlock: 16, blocks1: 4, dataPerBlock1: 27, blocks2: 0, dataPerBlock2: 0, alignment: [6, 34] },
  { version: 7, totalCodewords: 196, ecPerBlock: 18, blocks1: 4, dataPerBlock1: 31, blocks2: 0, dataPerBlock2: 0, alignment: [6, 22, 38] },
  { version: 8, totalCodewords: 242, ecPerBlock: 22, blocks1: 4, dataPerBlock1: 38, blocks2: 2, dataPerBlock2: 39, alignment: [6, 24, 42] },
  { version: 9, totalCodewords: 292, ecPerBlock: 22, blocks1: 3, dataPerBlock1: 36, blocks2: 2, dataPerBlock2: 37, alignment: [6, 26, 46] },
  { version: 10, totalCodewords: 346, ecPerBlock: 26, blocks1: 4, dataPerBlock1: 43, blocks2: 1, dataPerBlock2: 44, alignment: [6, 28, 50] }
]

function selectVersion(dataLen: number): VersionSpec | null {
  for (const spec of VERSION_SPECS) {
    const totalDataCapacity = spec.blocks1 * spec.dataPerBlock1 + spec.blocks2 * spec.dataPerBlock2
    // 4 bits mode + 8/16 bits length + 8*dataLen + 4 bits terminator
    const headerBits = spec.version < 10 ? 4 + 8 : 4 + 16
    const requiredBytes = Math.ceil((headerBits + dataLen * 8 + 4) / 8)
    if (requiredBytes <= totalDataCapacity) {
      return spec
    }
  }
  return null
}

function buildBitstream(data: Uint8Array, spec: VersionSpec): Uint8Array {
  const totalDataBytes = spec.blocks1 * spec.dataPerBlock1 + spec.blocks2 * spec.dataPerBlock2
  const bits: number[] = []

  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1)
    }
  }

  // 1. Mode indicator: Byte mode (0100)
  pushBits(0b0100, 4)

  // 2. Character count indicator
  const lenBits = spec.version < 10 ? 8 : 16
  pushBits(data.length, lenBits)

  // 3. Data bytes
  for (let i = 0; i < data.length; i++) {
    pushBits(data[i], 8)
  }

  // 4. Terminator (up to 4 zeroes)
  const maxBits = totalDataBytes * 8
  const termLen = Math.min(4, maxBits - bits.length)
  for (let i = 0; i < termLen; i++) bits.push(0)

  // 5. Pad to multiple of 8
  while (bits.length % 8 !== 0) {
    bits.push(0)
  }

  // Convert to bytes
  const bytes: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bits[i + j]
    }
    bytes.push(b)
  }

  // 6. Pad with 0xEC and 0x11 alternating until totalDataBytes
  const padPatterns = [0xec, 0x11]
  let padIdx = 0
  while (bytes.length < totalDataBytes) {
    bytes.push(padPatterns[padIdx % 2])
    padIdx++
  }

  // 7. Error Correction & Interleaving
  const blocks: { data: Uint8Array; ec: Uint8Array }[] = []
  let offset = 0

  for (let i = 0; i < spec.blocks1; i++) {
    const chunk = new Uint8Array(bytes.slice(offset, offset + spec.dataPerBlock1))
    offset += spec.dataPerBlock1
    blocks.push({ data: chunk, ec: rsEncode(chunk, spec.ecPerBlock) })
  }
  for (let i = 0; i < spec.blocks2; i++) {
    const chunk = new Uint8Array(bytes.slice(offset, offset + spec.dataPerBlock2))
    offset += spec.dataPerBlock2
    blocks.push({ data: chunk, ec: rsEncode(chunk, spec.ecPerBlock) })
  }

  // Interleave data codewords
  const finalCodewords: number[] = []
  const maxDataLen = Math.max(spec.dataPerBlock1, spec.dataPerBlock2)
  for (let col = 0; col < maxDataLen; col++) {
    for (const blk of blocks) {
      if (col < blk.data.length) {
        finalCodewords.push(blk.data[col])
      }
    }
  }

  // Interleave error correction codewords
  for (let col = 0; col < spec.ecPerBlock; col++) {
    for (const blk of blocks) {
      if (col < blk.ec.length) {
        finalCodewords.push(blk.ec[col])
      }
    }
  }

  return new Uint8Array(finalCodewords)
}

function createMatrix(spec: VersionSpec, codewords: Uint8Array): boolean[][] {
  const size = spec.version * 4 + 17
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null))
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false))

  const setModule = (r: number, c: number, val: boolean, isFunc = true) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val
      if (isFunc) isFunction[r][c] = true
    }
  }

  // 1. Finder patterns
  const placeFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r
        const nc = col + c
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          const isBlack = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)
          setModule(nr, nc, isBlack)
        } else {
          setModule(nr, nc, false) // Separator
        }
      }
    }
  }

  placeFinder(0, 0)
  placeFinder(0, size - 7)
  placeFinder(size - 7, 0)

  // 2. Alignment patterns
  if (spec.alignment.length > 0) {
    const coords = spec.alignment
    for (const r of coords) {
      for (const c of coords) {
        if (isFunction[r][c]) continue
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBlack = Math.max(Math.abs(dr), Math.abs(dc)) !== 1
            setModule(r + dr, c + dc, isBlack)
          }
        }
      }
    }
  }

  // 3. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) setModule(6, i, i % 2 === 0)
    if (matrix[i][6] === null) setModule(i, 6, i % 2 === 0)
  }

  // 4. Dark module
  setModule(4 * spec.version + 9, 8, true)

  // 5. Reserve format info area
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) { matrix[8][i] = false; isFunction[8][i] = true }
    if (matrix[i][8] === null) { matrix[i][8] = false; isFunction[i][8] = true }
  }
  for (let i = size - 8; i < size; i++) {
    if (matrix[8][i] === null) { matrix[8][i] = false; isFunction[8][i] = true }
    if (matrix[i][8] === null) { matrix[i][8] = false; isFunction[i][8] = true }
  }

  // 6. Place data bits (Mask 0: (row + col) % 2 === 0)
  const bits: number[] = []
  for (const b of codewords) {
    for (let i = 7; i >= 0; i--) {
      bits.push((b >> i) & 1)
    }
  }

  let bitIdx = 0
  let upward = true
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right-- // Skip vertical timing line
    const rows = upward ? Array.from({ length: size }, (_, i) => size - 1 - i) : Array.from({ length: size }, (_, i) => i)
    for (const r of rows) {
      for (const c of [right, right - 1]) {
        if (!isFunction[r][c]) {
          const bit = bitIdx < bits.length ? bits[bitIdx++] : 0
          // Apply standard mask pattern 0: (r + c) % 2 === 0
          const mask = (r + c) % 2 === 0
          matrix[r][c] = (bit === 1) !== mask
        }
      }
    }
    upward = !upward
  }

  // 7. Format info for EC Level M (00), Mask 0 (000) -> 0b00000 -> BCH format = 0x5412 ^ 0x4aa5 = 0x1ef7
  // Format bits for M / Mask 0 (0b101010000010010)
  const FORMAT_BITS = 0b101010000010010
  for (let i = 0; i < 15; i++) {
    const bit = ((FORMAT_BITS >> i) & 1) === 1
    // Top-left
    if (i < 6) matrix[8][i] = bit
    else if (i === 6) matrix[8][7] = bit
    else if (i === 7) matrix[8][8] = bit
    else if (i === 8) matrix[7][8] = bit
    else matrix[14 - i][8] = bit

    // Bottom-left / Top-right
    if (i < 8) matrix[size - 1 - i][8] = bit
    else matrix[8][size - 15 + i] = bit
  }

  return matrix.map((row) => row.map((cell) => cell ?? false))
}

function generateSvg(matrix: boolean[][]): string {
  const size = matrix.length
  const margin = 4
  const total = size + margin * 2
  let path = ''

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        path += `M${c + margin},${r + margin}h1v1h-1z `
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><path fill="#ffffff" d="M0 0h${total}v${total}H0z"/><path fill="#000000" d="${path.trim()}"/></svg>`
}

function generateAscii(matrix: boolean[][]): string {
  const lines: string[] = []
  const border = '  '.repeat(matrix.length + 2)
  lines.push(border)
  for (const row of matrix) {
    let line = '  '
    for (const cell of row) {
      line += cell ? '██' : '  '
    }
    line += '  '
    lines.push(line)
  }
  lines.push(border)
  return lines.join('\n')
}

export function search(query: string): SearchResultItem[] {
  let text = query.trim()

  if (!text) {
    const cb = clipboard.readText().trim()
    if (cb && cb.length < 500) {
      text = cb
    }
  }

  if (!text) {
    return [
      {
        label: 'Enter URL or text to generate QR code (or copy to clipboard)',
        sublabel: 'Examples: /qr https://github.com · /qr wifi:S:MyNetwork;T:WPA;P:Secret;; · /qr hello world',
        value: '',
        disabled: true
      }
    ]
  }

  const encodedData = Buffer.from(text, 'utf8')
  const spec = selectVersion(encodedData.length)

  if (!spec) {
    return [
      {
        label: 'Text is too long for QR Code (max ~200 characters)',
        sublabel: `Length: ${encodedData.length} bytes`,
        value: '',
        disabled: true
      }
    ]
  }

  const codewords = buildBitstream(encodedData, spec)
  const matrix = createMatrix(spec, codewords)
  const svg = generateSvg(matrix)
  const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  const ascii = generateAscii(matrix)

  return [
    {
      label: `Copy QR Data URI (${spec.version * 4 + 17}x${spec.version * 4 + 17} matrix)`,
      sublabel: `SVG Data URI for "${text.length > 35 ? text.slice(0, 32) + '...' : text}"`,
      value: dataUri
    },
    {
      label: 'Copy QR SVG XML String',
      sublabel: 'Vector SVG markup for embedding or saving to .svg file',
      value: svg
    },
    {
      label: 'Copy QR Terminal ASCII Art',
      sublabel: 'UTF-8 block characters for console and plain-text display',
      value: ascii
    },
    {
      label: `Copy Original Text: ${text.slice(0, 45)}${text.length > 45 ? '...' : ''}`,
      sublabel: `Input length: ${text.length} characters (${encodedData.length} bytes)`,
      value: text
    }
  ]
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
