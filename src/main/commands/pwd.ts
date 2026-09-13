import { clipboard } from 'electron'
import { randomBytes, randomInt } from 'crypto'
import type { SearchResultItem } from '../../shared/types'

const CHARS_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // omitting I, O to prevent confusion
const CHARS_LOWER = 'abcdefghijkmnpqrstuvwxyz' // omitting l, o
const CHARS_DIGITS = '23456789' // omitting 0, 1
const CHARS_SYMBOLS = '!@#$%^&*()-_=+[]{}<>~?'

const WORDLIST = [
  'apple', 'anchor', 'arrow', 'beacon', 'breeze', 'bridge', 'button', 'cabin',
  'cactus', 'candle', 'carpet', 'castle', 'cherry', 'circle', 'cliff', 'cloud',
  'clover', 'comet', 'copper', 'coral', 'crater', 'crystal', 'dancer', 'dawn',
  'desert', 'diamond', 'dolphin', 'dragon', 'eagle', 'ember', 'falcon', 'feather',
  'flame', 'forest', 'fossil', 'galaxy', 'garden', 'glacier', 'golden', 'granite',
  'harbor', 'hawk', 'horizon', 'island', 'jasper', 'jungle', 'knight', 'lagoon',
  'lantern', 'legend', 'lemon', 'leopard', 'lizard', 'lotus', 'lunar', 'magnet',
  'maple', 'marble', 'meadow', 'meteor', 'mineral', 'mirror', 'monarch', 'moon',
  'mountain', 'nebula', 'oasis', 'ocean', 'orchid', 'owl', 'panther', 'pebble',
  'phoenix', 'pillar', 'planet', 'portal', 'prism', 'pulse', 'pyramid', 'quartz',
  'radar', 'rainbow', 'raven', 'reef', 'river', 'rocket', 'ruby', 'sailor',
  'sapphire', 'satellite', 'shadow', 'shield', 'signal', 'silver', 'solar', 'spark',
  'sphinx', 'spiral', 'spring', 'star', 'summit', 'sunset', 'swift', 'temple',
  'thunder', 'tiger', 'timber', 'topaz', 'tornado', 'tower', 'tulip', 'valley',
  'vector', 'velvet', 'vortex', 'voyage', 'walnut', 'wave', 'whisper', 'willow',
  'winter', 'wizard', 'wolf', 'zenith', 'zephyr'
]

function generateRandomString(len: number, pool: string): string {
  let res = ''
  for (let i = 0; i < len; i++) {
    res += pool[randomInt(0, pool.length)]
  }
  return res
}

function generatePassphrase(wordCount = 4): string {
  const words: string[] = []
  for (let i = 0; i < wordCount; i++) {
    words.push(WORDLIST[randomInt(0, WORDLIST.length)])
  }
  return words.join('-')
}

export function search(query: string): SearchResultItem[] {
  const q = query.trim().toLowerCase()
  let customLen = 20

  const numMatch = q.match(/^\d+$/)
  if (numMatch) {
    customLen = Math.max(4, Math.min(128, parseInt(numMatch[0], 10)))
  }

  const allPool = CHARS_UPPER + CHARS_LOWER + CHARS_DIGITS + CHARS_SYMBOLS
  const alphaNumPool = CHARS_UPPER + CHARS_LOWER + CHARS_DIGITS

  const strongPass = generateRandomString(customLen, allPool)
  const alphaNumPass = generateRandomString(customLen, alphaNumPool)
  const passphrase = generatePassphrase(4)
  const pin6 = generateRandomString(6, '0123456789')
  const pin8 = generateRandomString(8, '0123456789')
  const hex32 = randomBytes(32).toString('hex')
  const b64Secret = randomBytes(32).toString('base64')

  const results: SearchResultItem[] = [
    {
      label: `Strong (${customLen} chars): ${strongPass}`,
      sublabel: 'Letters, numbers, and special symbols (high entropy)',
      value: strongPass
    },
    {
      label: `Alphanumeric (${customLen} chars): ${alphaNumPass}`,
      sublabel: 'Letters and numbers only (no special symbols)',
      value: alphaNumPass
    },
    {
      label: `Passphrase: ${passphrase}`,
      sublabel: '4-word Diceware-style memorable passphrase',
      value: passphrase
    },
    {
      label: `PIN (6-digit): ${pin6}`,
      sublabel: 'Numeric-only passcode',
      value: pin6
    },
    {
      label: `PIN (8-digit): ${pin8}`,
      sublabel: '8-digit numeric passcode',
      value: pin8
    },
    {
      label: `Hex Secret (256-bit): ${hex32}`,
      sublabel: '32-byte hexadecimal secret key (API tokens, HMAC)',
      value: hex32
    },
    {
      label: `Base64 Secret: ${b64Secret}`,
      sublabel: '32-byte Base64-encoded secret token',
      value: b64Secret
    }
  ]

  return results
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
