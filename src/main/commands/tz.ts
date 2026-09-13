import { clipboard } from 'electron'
import Fuse from 'fuse.js'
import type { SearchResultItem } from '../../shared/types'

export interface LocationEntry {
  country: string
  city?: string
  name: string
  iana: string
  aliases?: string[]
}

export const SUPPORTED_LOCATIONS: LocationEntry[] = [
  // Oceania / Australia / NZ
  { country: 'Australia', city: 'Sydney', name: 'Australia (Sydney)', iana: 'Australia/Sydney', aliases: ['austrailia', 'aus', 'nsw', 'canberra'] },
  { country: 'Australia', city: 'Melbourne', name: 'Australia (Melbourne)', iana: 'Australia/Melbourne', aliases: ['austrailia', 'aus', 'vic', 'victoria'] },
  { country: 'Australia', city: 'Brisbane', name: 'Australia (Brisbane)', iana: 'Australia/Brisbane', aliases: ['austrailia', 'aus', 'qld', 'queensland'] },
  { country: 'Australia', city: 'Adelaide', name: 'Australia (Adelaide)', iana: 'Australia/Adelaide', aliases: ['austrailia', 'aus', 'sa', 'south australia'] },
  { country: 'Australia', city: 'Perth', name: 'Australia (Perth)', iana: 'Australia/Perth', aliases: ['austrailia', 'aus', 'wa', 'western australia'] },
  { country: 'Australia', city: 'Darwin', name: 'Australia (Darwin)', iana: 'Australia/Darwin', aliases: ['austrailia', 'aus', 'nt', 'northern territory'] },
  { country: 'Australia', city: 'Hobart', name: 'Australia (Hobart)', iana: 'Australia/Hobart', aliases: ['austrailia', 'aus', 'tasmania'] },
  { country: 'New Zealand', city: 'Auckland', name: 'New Zealand (Auckland)', iana: 'Pacific/Auckland', aliases: ['nz', 'wellington', 'christchurch', 'nzst', 'nzdt'] },
  { country: 'Fiji', city: 'Suva', name: 'Fiji (Suva)', iana: 'Pacific/Fiji', aliases: ['fiji'] },

  // North America
  { country: 'United States', city: 'New York', name: 'US Eastern (New York)', iana: 'America/New_York', aliases: ['us', 'usa', 'united states', 'est', 'edt', 'et', 'eastern', 'boston', 'miami', 'atlanta', 'washington dc', 'dc'] },
  { country: 'United States', city: 'Chicago', name: 'US Central (Chicago)', iana: 'America/Chicago', aliases: ['us', 'usa', 'united states', 'cst', 'cdt', 'ct', 'central', 'texas', 'dallas', 'houston', 'austin', 'illinois'] },
  { country: 'United States', city: 'Denver', name: 'US Mountain (Denver)', iana: 'America/Denver', aliases: ['us', 'usa', 'united states', 'mst', 'mdt', 'mt', 'mountain', 'colorado', 'salt lake city', 'utah'] },
  { country: 'United States', city: 'Los Angeles', name: 'US Pacific (Los Angeles)', iana: 'America/Los_Angeles', aliases: ['us', 'usa', 'united states', 'pst', 'pdt', 'pt', 'pacific', 'california', 'sf', 'san francisco', 'seattle', 'las vegas'] },
  { country: 'United States', city: 'Phoenix', name: 'US Arizona (Phoenix)', iana: 'America/Phoenix', aliases: ['arizona', 'phoenix', 'mst'] },
  { country: 'United States', city: 'Anchorage', name: 'US Alaska (Anchorage)', iana: 'America/Anchorage', aliases: ['alaska', 'anchorage', 'akst', 'akdt'] },
  { country: 'United States', city: 'Honolulu', name: 'US Hawaii (Honolulu)', iana: 'Pacific/Honolulu', aliases: ['hawaii', 'honolulu', 'hst'] },
  { country: 'Canada', city: 'Toronto', name: 'Canada (Toronto)', iana: 'America/Toronto', aliases: ['canada', 'ontario', 'montreal', 'quebec', 'ottawa', 'est', 'edt'] },
  { country: 'Canada', city: 'Vancouver', name: 'Canada (Vancouver)', iana: 'America/Vancouver', aliases: ['canada', 'bc', 'british columbia', 'pst', 'pdt'] },
  { country: 'Canada', city: 'Calgary', name: 'Canada (Calgary)', iana: 'America/Edmonton', aliases: ['canada', 'alberta', 'edmonton', 'mst', 'mdt'] },
  { country: 'Canada', city: 'Halifax', name: 'Canada (Halifax)', iana: 'America/Halifax', aliases: ['canada', 'nova scotia', 'atlantic'] },
  { country: 'Mexico', city: 'Mexico City', name: 'Mexico (Mexico City)', iana: 'America/Mexico_City', aliases: ['mexico', 'cdmx', 'guadalajara', 'monterrey'] },

  // Europe & UK
  { country: 'United Kingdom', city: 'London', name: 'United Kingdom (London)', iana: 'Europe/London', aliases: ['uk', 'england', 'britain', 'great britain', 'scotland', 'edinburgh', 'wales', 'gmt', 'bst'] },
  { country: 'Ireland', city: 'Dublin', name: 'Ireland (Dublin)', iana: 'Europe/Dublin', aliases: ['ireland', 'eire'] },
  { country: 'France', city: 'Paris', name: 'France (Paris)', iana: 'Europe/Paris', aliases: ['france', 'lyon', 'marseille', 'cet', 'cest'] },
  { country: 'Germany', city: 'Berlin', name: 'Germany (Berlin)', iana: 'Europe/Berlin', aliases: ['germany', 'deutschland', 'frankfurt', 'munich', 'hamburg', 'cet', 'cest'] },
  { country: 'Spain', city: 'Madrid', name: 'Spain (Madrid)', iana: 'Europe/Madrid', aliases: ['spain', 'espana', 'barcelona', 'valencia', 'cet', 'cest'] },
  { country: 'Italy', city: 'Rome', name: 'Italy (Rome)', iana: 'Europe/Rome', aliases: ['italy', 'italia', 'milan', 'naples', 'cet', 'cest'] },
  { country: 'Netherlands', city: 'Amsterdam', name: 'Netherlands (Amsterdam)', iana: 'Europe/Amsterdam', aliases: ['holland', 'netherlands', 'dutch', 'rotterdam', 'cet', 'cest'] },
  { country: 'Belgium', city: 'Brussels', name: 'Belgium (Brussels)', iana: 'Europe/Brussels', aliases: ['belgium', 'belgique', 'antwerp', 'cet', 'cest'] },
  { country: 'Switzerland', city: 'Zurich', name: 'Switzerland (Zurich)', iana: 'Europe/Zurich', aliases: ['swiss', 'switzerland', 'geneva', 'basel', 'cet', 'cest'] },
  { country: 'Austria', city: 'Vienna', name: 'Austria (Vienna)', iana: 'Europe/Vienna', aliases: ['austria', 'wien', 'cet', 'cest'] },
  { country: 'Sweden', city: 'Stockholm', name: 'Sweden (Stockholm)', iana: 'Europe/Stockholm', aliases: ['sweden', 'sverige', 'gothenburg', 'cet', 'cest'] },
  { country: 'Norway', city: 'Oslo', name: 'Norway (Oslo)', iana: 'Europe/Oslo', aliases: ['norway', 'norge', 'bergen', 'cet', 'cest'] },
  { country: 'Denmark', city: 'Copenhagen', name: 'Denmark (Copenhagen)', iana: 'Europe/Copenhagen', aliases: ['denmark', 'danmark', 'cet', 'cest'] },
  { country: 'Finland', city: 'Helsinki', name: 'Finland (Helsinki)', iana: 'Europe/Helsinki', aliases: ['finland', 'suomi', 'eet', 'eest'] },
  { country: 'Poland', city: 'Warsaw', name: 'Poland (Warsaw)', iana: 'Europe/Warsaw', aliases: ['poland', 'polska', 'krakow', 'cet', 'cest'] },
  { country: 'Czech Republic', city: 'Prague', name: 'Czech Republic (Prague)', iana: 'Europe/Prague', aliases: ['czech', 'czechia', 'praha', 'cet', 'cest'] },
  { country: 'Hungary', city: 'Budapest', name: 'Hungary (Budapest)', iana: 'Europe/Budapest', aliases: ['hungary', 'magyar', 'cet', 'cest'] },
  { country: 'Portugal', city: 'Lisbon', name: 'Portugal (Lisbon)', iana: 'Europe/Lisbon', aliases: ['portugal', 'porto', 'wet', 'west'] },
  { country: 'Greece', city: 'Athens', name: 'Greece (Athens)', iana: 'Europe/Athens', aliases: ['greece', 'hellas', 'thessaloniki', 'eet', 'eest'] },
  { country: 'Turkey', city: 'Istanbul', name: 'Turkey (Istanbul)', iana: 'Europe/Istanbul', aliases: ['turkey', 'turkiye', 'ankara'] },
  { country: 'Ukraine', city: 'Kyiv', name: 'Ukraine (Kyiv)', iana: 'Europe/Kyiv', aliases: ['ukraine', 'kiev', 'eet', 'eest'] },
  { country: 'Russia', city: 'Moscow', name: 'Russia (Moscow)', iana: 'Europe/Moscow', aliases: ['russia', 'moscow', 'msk', 'st petersburg'] },

  // Asia & Middle East
  { country: 'Japan', city: 'Tokyo', name: 'Japan (Tokyo)', iana: 'Asia/Tokyo', aliases: ['japan', 'nippon', 'osaka', 'kyoto', 'jst'] },
  { country: 'China', city: 'Shanghai', name: 'China (Beijing/Shanghai)', iana: 'Asia/Shanghai', aliases: ['china', 'beijing', 'shanghai', 'guangzhou', 'shenzhen', 'cst'] },
  { country: 'Hong Kong', city: 'Hong Kong', name: 'Hong Kong', iana: 'Asia/Hong_Kong', aliases: ['hk', 'hongkong', 'hkt'] },
  { country: 'Taiwan', city: 'Taipei', name: 'Taiwan (Taipei)', iana: 'Asia/Taipei', aliases: ['taiwan', 'taipei'] },
  { country: 'South Korea', city: 'Seoul', name: 'South Korea (Seoul)', iana: 'Asia/Seoul', aliases: ['korea', 'south korea', 'seoul', 'busan', 'kst'] },
  { country: 'Singapore', city: 'Singapore', name: 'Singapore', iana: 'Asia/Singapore', aliases: ['sg', 'singapore', 'sgt'] },
  { country: 'India', city: 'Kolkata', name: 'India (IST)', iana: 'Asia/Kolkata', aliases: ['india', 'mumbai', 'delhi', 'bangalore', 'bengaluru', 'chennai', 'hyderabad', 'ist'] },
  { country: 'Pakistan', city: 'Karachi', name: 'Pakistan (Karachi)', iana: 'Asia/Karachi', aliases: ['pakistan', 'lahore', 'islamabad', 'pkt'] },
  { country: 'Bangladesh', city: 'Dhaka', name: 'Bangladesh (Dhaka)', iana: 'Asia/Dhaka', aliases: ['bangladesh', 'dhaka', 'bst'] },
  { country: 'Thailand', city: 'Bangkok', name: 'Thailand (Bangkok)', iana: 'Asia/Bangkok', aliases: ['thailand', 'bangkok', 'bkk', 'ict'] },
  { country: 'Malaysia', city: 'Kuala Lumpur', name: 'Malaysia (Kuala Lumpur)', iana: 'Asia/Kuala_Lumpur', aliases: ['malaysia', 'kuala lumpur', 'kl', 'myt'] },
  { country: 'Indonesia', city: 'Jakarta', name: 'Indonesia (Jakarta)', iana: 'Asia/Jakarta', aliases: ['indonesia', 'jakarta', 'java', 'wib'] },
  { country: 'Indonesia', city: 'Bali', name: 'Indonesia (Bali)', iana: 'Asia/Makassar', aliases: ['indonesia', 'bali', 'denpasar', 'wita'] },
  { country: 'Philippines', city: 'Manila', name: 'Philippines (Manila)', iana: 'Asia/Manila', aliases: ['philippines', 'philippenes', 'manila', 'pht'] },
  { country: 'Vietnam', city: 'Ho Chi Minh City', name: 'Vietnam (Ho Chi Minh)', iana: 'Asia/Ho_Chi_Minh', aliases: ['vietnam', 'hanoi', 'saigon', 'ho chi minh', 'ict'] },
  { country: 'United Arab Emirates', city: 'Dubai', name: 'UAE (Dubai)', iana: 'Asia/Dubai', aliases: ['uae', 'united arab emirates', 'dubai', 'abu dhabi', 'gst'] },
  { country: 'Qatar', city: 'Doha', name: 'Qatar (Doha)', iana: 'Asia/Qatar', aliases: ['qatar', 'doha'] },
  { country: 'Saudi Arabia', city: 'Riyadh', name: 'Saudi Arabia (Riyadh)', iana: 'Asia/Riyadh', aliases: ['saudi arabia', 'saudi', 'riyadh', 'jeddah', 'ast'] },
  { country: 'Israel', city: 'Jerusalem', name: 'Israel (Jerusalem)', iana: 'Asia/Jerusalem', aliases: ['israel', 'jerusalem', 'tel aviv', 'telaviv', 'ist', 'idt'] },

  // Africa
  { country: 'South Africa', city: 'Johannesburg', name: 'South Africa (Johannesburg)', iana: 'Africa/Johannesburg', aliases: ['south africa', 'johannesburg', 'joburg', 'cape town', 'durban', 'sast'] },
  { country: 'Egypt', city: 'Cairo', name: 'Egypt (Cairo)', iana: 'Africa/Cairo', aliases: ['egypt', 'cairo', 'alexandria', 'eet', 'eest'] },
  { country: 'Nigeria', city: 'Lagos', name: 'Nigeria (Lagos)', iana: 'Africa/Lagos', aliases: ['nigeria', 'lagos', 'abuja', 'wat'] },
  { country: 'Kenya', city: 'Nairobi', name: 'Kenya (Nairobi)', iana: 'Africa/Nairobi', aliases: ['kenya', 'nairobi', 'eat'] },
  { country: 'Morocco', city: 'Casablanca', name: 'Morocco (Casablanca)', iana: 'Africa/Casablanca', aliases: ['morocco', 'casablanca', 'rabat', 'wet'] },

  // Latin America
  { country: 'Brazil', city: 'Sao Paulo', name: 'Brazil (Sao Paulo)', iana: 'America/Sao_Paulo', aliases: ['brazil', 'brasil', 'sao paulo', 'rio', 'rio de janeiro', 'brasilia', 'brt'] },
  { country: 'Argentina', city: 'Buenos Aires', name: 'Argentina (Buenos Aires)', iana: 'America/Argentina/Buenos_Aires', aliases: ['argentina', 'buenos aires', 'art'] },
  { country: 'Colombia', city: 'Bogota', name: 'Colombia (Bogota)', iana: 'America/Bogota', aliases: ['colombia', 'bogota', 'medellin', 'cot'] },
  { country: 'Chile', city: 'Santiago', name: 'Chile (Santiago)', iana: 'America/Santiago', aliases: ['chile', 'santiago', 'clt', 'clst'] },
  { country: 'Peru', city: 'Lima', name: 'Peru (Lima)', iana: 'America/Lima', aliases: ['peru', 'lima', 'pet'] }
]

const locationFuse = new Fuse(SUPPORTED_LOCATIONS, {
  keys: [
    { name: 'country', weight: 0.4 },
    { name: 'name', weight: 0.35 },
    { name: 'city', weight: 0.25 },
    { name: 'aliases', weight: 0.3 }
  ],
  threshold: 0.4,
  ignoreLocation: true
})

function resolveIana(zoneName: string): string | null {
  const normalized = zoneName.trim().toLowerCase().replace(/_/g, ' ')
  // Check exact matches or alias matches first
  for (const loc of SUPPORTED_LOCATIONS) {
    if (
      loc.country.toLowerCase() === normalized ||
      loc.city?.toLowerCase() === normalized ||
      loc.name.toLowerCase() === normalized ||
      loc.iana.toLowerCase() === normalized ||
      loc.aliases?.some((a) => a.toLowerCase() === normalized)
    ) {
      return loc.iana
    }
  }

  // Check if it's already a valid IANA zone string
  try {
    Intl.DateTimeFormat(undefined, { timeZone: zoneName.trim() })
    return zoneName.trim()
  } catch {
    return null
  }
}

/**
 * Searches the location list with fuzzy matching and returns formatted live times.
 */
function searchLocations(query: string, now: Date): SearchResultItem[] {
  const q = query.trim()
  let matches: LocationEntry[] = []

  if (!q) {
    // Return a curated list of top global cities/countries
    matches = SUPPORTED_LOCATIONS.slice(0, 15)
  } else {
    // 1. Direct prefix / substring filter
    const lower = q.toLowerCase()
    const directMatches = SUPPORTED_LOCATIONS.filter(
      (loc) =>
        loc.country.toLowerCase().startsWith(lower) ||
        loc.city?.toLowerCase().startsWith(lower) ||
        loc.name.toLowerCase().includes(lower) ||
        loc.aliases?.some((a) => a.toLowerCase().startsWith(lower) || a.toLowerCase().includes(lower))
    )

    if (directMatches.length > 0) {
      matches = directMatches
    } else {
      // 2. Fuzzy search with Fuse
      matches = locationFuse.search(q).map((r) => r.item)
    }
  }

  if (matches.length === 0) {
    return []
  }

  const results: SearchResultItem[] = []
  for (const loc of matches) {
    const zInfo = formatZoneTime(now, loc.iana)
    results.push({
      label: `${loc.name}: ${zInfo.timeStr}`,
      sublabel: `${zInfo.dateStr} · ${zInfo.tzName} (${zInfo.offsetStr})`,
      value: `${zInfo.dateStr} ${zInfo.timeStr} ${zInfo.tzName}`
    })
  }

  return results
}

/**
 * Calculates the UTC Date from a local time representation in a specific IANA timezone.
 */
function dateFromZonedTime(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  seconds: number,
  timeZone: string
): Date {
  const naiveUtc = Date.UTC(year, month - 1, day, hours, minutes, seconds)
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  })

  const parts = dtf.formatToParts(new Date(naiveUtc))
  const partMap: Record<string, number> = {}
  for (const p of parts) {
    if (p.type !== 'literal') {
      partMap[p.type] = parseInt(p.value, 10)
    }
  }

  const zonedYear = partMap.year ?? year
  const zonedMonth = partMap.month ?? month
  const zonedDay = partMap.day ?? day
  let zonedHour = partMap.hour ?? hours
  if (zonedHour === 24) zonedHour = 0
  const zonedMin = partMap.minute ?? minutes
  const zonedSec = partMap.second ?? seconds

  const zonedTimeAsUtc = Date.UTC(zonedYear, zonedMonth - 1, zonedDay, zonedHour, zonedMin, zonedSec)
  const offsetMs = zonedTimeAsUtc - naiveUtc
  return new Date(naiveUtc - offsetMs)
}

function parseRelativeExpression(query: string, now: Date): Date | null {
  const q = query.trim().toLowerCase()
  if (q === 'now' || q === '') return new Date(now)
  if (q === 'today') return new Date(now)
  if (q === 'yesterday') {
    const d = new Date(now)
    d.setDate(d.getDate() - 1)
    return d
  }
  if (q === 'tomorrow') {
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    return d
  }

  const shorthandMatch = q.match(/^([+-])\s*(\d+(?:\.\d+)?)\s*([smhdw])$/)
  if (shorthandMatch) {
    const sign = shorthandMatch[1] === '-' ? -1 : 1
    const amount = parseFloat(shorthandMatch[2]) * sign
    const unit = shorthandMatch[3]
    const d = new Date(now)
    if (unit === 's') d.setSeconds(d.getSeconds() + amount)
    else if (unit === 'm') d.setMinutes(d.getMinutes() + amount)
    else if (unit === 'h') d.setHours(d.getHours() + amount)
    else if (unit === 'd') d.setDate(d.getDate() + amount)
    else if (unit === 'w') d.setDate(d.getDate() + amount * 7)
    return d
  }

  const inMatch = q.match(/^in\s+(\d+(?:\.\d+)?)\s+(second|sec|minute|min|hour|hr|day|week|month|year)s?$/)
  if (inMatch) {
    const amount = parseFloat(inMatch[1])
    const unit = inMatch[2]
    const d = new Date(now)
    if (unit.startsWith('sec')) d.setSeconds(d.getSeconds() + amount)
    else if (unit.startsWith('min')) d.setMinutes(d.getMinutes() + amount)
    else if (unit.startsWith('hour') || unit.startsWith('hr')) d.setHours(d.getHours() + amount)
    else if (unit.startsWith('day')) d.setDate(d.getDate() + amount)
    else if (unit.startsWith('week')) d.setDate(d.getDate() + amount * 7)
    else if (unit.startsWith('month')) d.setMonth(d.getMonth() + amount)
    else if (unit.startsWith('year')) d.setFullYear(d.getFullYear() + amount)
    return d
  }

  const agoMatch = q.match(/^(\d+(?:\.\d+)?)\s+(second|sec|minute|min|hour|hr|day|week|month|year)s?\s+ago$/)
  if (agoMatch) {
    const amount = -parseFloat(agoMatch[1])
    const unit = agoMatch[2]
    const d = new Date(now)
    if (unit.startsWith('sec')) d.setSeconds(d.getSeconds() + amount)
    else if (unit.startsWith('min')) d.setMinutes(d.getMinutes() + amount)
    else if (unit.startsWith('hour') || unit.startsWith('hr')) d.setHours(d.getHours() + amount)
    else if (unit.startsWith('day')) d.setDate(d.getDate() + amount)
    else if (unit.startsWith('week')) d.setDate(d.getDate() + amount * 7)
    else if (unit.startsWith('month')) d.setMonth(d.getMonth() + amount)
    else if (unit.startsWith('year')) d.setFullYear(d.getFullYear() + amount)
    return d
  }

  return null
}

function parseNumericTimestamp(query: string): Date | null {
  const q = query.trim()
  if (/^0x[0-9a-fA-F]+$/.test(q)) {
    const val = parseInt(q, 16)
    if (val > 0 && val < 1e12) return new Date(val * 1000)
    if (val >= 1e12 && val < 1e15) return new Date(val)
  }

  if (/^\d{9,20}$/.test(q)) {
    const len = q.length
    const num = Number(q)
    if (isNaN(num)) return null

    if (len >= 9 && len <= 11) return new Date(num * 1000)
    if (len >= 12 && len <= 14) return new Date(num)
    if (len >= 15 && len <= 17) return new Date(Math.floor(num / 1000))
    if (len >= 18 && len <= 20) return new Date(Math.floor(num / 1000000))
  }

  return null
}

function parseTimeWithZone(query: string, now: Date): Date | null {
  const q = query.trim()
  const timeRegex =
    /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?(?:\s+([a-zA-Z/_+\-\s]+))?$/i
  const match = q.match(timeRegex)
  if (!match) return null

  let hour = parseInt(match[1], 10)
  const minute = match[2] ? parseInt(match[2], 10) : 0
  const second = match[3] ? parseInt(match[3], 10) : 0
  const meridiem = match[4]?.toLowerCase()
  const rawZone = match[5]?.trim()

  if (hour > 23 || minute > 59 || second > 59) return null

  if (meridiem === 'pm' && hour < 12) hour += 12
  if (meridiem === 'am' && hour === 12) hour = 0

  if (rawZone) {
    const iana = resolveIana(rawZone)
    if (iana) {
      return dateFromZonedTime(
        now.getFullYear(),
        now.getMonth() + 1,
        now.getDate(),
        hour,
        minute,
        second,
        iana
      )
    }
  }

  const localDate = new Date(now)
  localDate.setHours(hour, minute, second, 0)
  return localDate
}

function formatRelativeDelta(date: Date, now: Date): string {
  const diffSec = Math.round((date.getTime() - now.getTime()) / 1000)
  if (Math.abs(diffSec) < 30) return 'Just now'

  const absSec = Math.abs(diffSec)
  const isFuture = diffSec > 0
  const suffix = isFuture ? 'from now' : 'ago'
  const prefix = isFuture ? 'in ' : ''

  if (absSec < 60) {
    return isFuture ? `in ${absSec}s` : `${absSec}s ago`
  }
  const absMin = Math.round(absSec / 60)
  if (absMin < 60) {
    return isFuture ? `in ${absMin}m` : `${absMin}m ago`
  }
  const absHours = Math.floor(absSec / 3600)
  const remMin = Math.round((absSec % 3600) / 60)
  if (absHours < 24) {
    const hourStr = remMin > 0 ? `${absHours}h ${remMin}m` : `${absHours}h`
    return `${prefix}${hourStr} ${suffix}`.trim()
  }
  const absDays = Math.round(absSec / 86400)
  if (absDays < 30) {
    return isFuture ? `in ${absDays}d` : `${absDays}d ago`
  }
  const absMonths = Math.round(absDays / 30)
  return isFuture ? `in ${absMonths}mo` : `${absMonths}mo ago`
}

function formatZoneTime(
  date: Date,
  timeZone?: string
): {
  formattedFull: string
  timeStr: string
  dateStr: string
  tzName: string
  offsetStr: string
} {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
    ...(timeZone ? { timeZone } : {})
  }

  const dtf = new Intl.DateTimeFormat('en-US', options)
  const parts = dtf.formatToParts(date)
  const partMap: Record<string, string> = {}
  for (const p of parts) {
    partMap[p.type] = p.value
  }

  const weekday = partMap.weekday ?? ''
  const month = partMap.month ?? ''
  const day = partMap.day ?? ''
  const year = partMap.year ?? ''
  const hour = partMap.hour ?? ''
  const minute = partMap.minute ?? ''
  const second = partMap.second ?? ''
  const dayPeriod = partMap.dayPeriod ?? ''
  const tzName = partMap.timeZoneName ?? (timeZone || 'Local')

  const timeStr = `${hour}:${minute}:${second} ${dayPeriod}`
  const dateStr = `${weekday}, ${month} ${day}, ${year}`
  const formattedFull = `${dateStr} · ${timeStr} (${tzName})`

  const offsetDtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset'
  })
  const offsetParts = offsetDtf.formatToParts(date)
  const offsetPart = offsetParts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  const offsetStr = offsetPart.replace('GMT', 'UTC')

  return { formattedFull, timeStr, dateStr, tzName, offsetStr }
}

export function search(query: string): SearchResultItem[] {
  const now = new Date()
  const q = query.trim()

  // 1. Explicit country / location search when query starts with "time" or "time in ..."
  const timeQueryMatch = q.match(/^(?:current\s+)?time(?:\s+in|\s+at|\s+for|\s+of)?(?:\s+(.*))?$/i)
  if (timeQueryMatch) {
    const locSearch = (timeQueryMatch[1] || '').trim()
    const locResults = searchLocations(locSearch, now)
    if (locResults.length > 0) {
      return locResults
    }
  }

  // 2. Query ending in " time" (e.g. "/tz austrai time", "/tz tokyo time")
  const suffixTimeMatch = q.match(/^(.*?)\s+(?:current\s+)?time$/i)
  if (suffixTimeMatch) {
    const locSearch = suffixTimeMatch[1].trim()
    const locResults = searchLocations(locSearch, now)
    if (locResults.length > 0) {
      return locResults
    }
  }

  // 3. Conversion with connector: "3pm UTC to Tokyo", "10am in London", "now to Sydney"
  const targetMatch = q.match(/^(.*?)\s+(?:to|in|->)\s+([a-zA-Z/_+\-\s]+)$/i)
  let targetZone: string | null = null
  let parseInput = q

  if (targetMatch) {
    const candidateZone = resolveIana(targetMatch[2])
    if (candidateZone) {
      targetZone = candidateZone
      parseInput = targetMatch[1].trim()
    }
  }

  // 4. If query is pure text (no numbers/symbols) and not empty/now, check location search first!
  if (/^[a-zA-Z\s]+$/.test(q) && q.toLowerCase() !== 'now' && !targetMatch) {
    const locResults = searchLocations(q, now)
    if (locResults.length > 0) {
      return locResults
    }
  }

  // 5. General datetime parsing
  let date: Date | null = null

  if (!parseInput || parseInput.toLowerCase() === 'now') {
    date = new Date(now)
  } else {
    date =
      parseRelativeExpression(parseInput, now) ||
      parseNumericTimestamp(parseInput) ||
      parseTimeWithZone(parseInput, now)

    if (!date) {
      const parsedMs = Date.parse(parseInput)
      if (!isNaN(parsedMs)) {
        date = new Date(parsedMs)
      }
    }
  }

  if (!date) {
    // If still unparsed, try fuzzy location search as a final fallback
    const locFallback = searchLocations(q, now)
    if (locFallback.length > 0) {
      return locFallback
    }

    return [
      {
        label: 'Unable to parse timestamp or location',
        sublabel:
          'Examples: /tz time australia · /tz 1726243965 · /tz 2026-09-13T15:30:00Z · /tz in 2 hours · /tz 10am PST to Tokyo',
        value: '',
        disabled: true
      }
    ]
  }

  const results: SearchResultItem[] = []
  const relativeText = formatRelativeDelta(date, now)
  const local = formatZoneTime(date)

  // Target Zone (if specified in query)
  if (targetZone) {
    const target = formatZoneTime(date, targetZone)
    results.push({
      label: `Target (${targetZone}): ${target.timeStr}`,
      sublabel: `${target.dateStr} · ${target.tzName} (${target.offsetStr})`,
      value: `${target.dateStr} ${target.timeStr} ${target.tzName}`
    })
  }

  // Local Time
  results.push({
    label: `Local: ${local.timeStr}`,
    sublabel: `${local.dateStr} · ${local.tzName} (${local.offsetStr}) · ${relativeText}`,
    value: `${local.dateStr} ${local.timeStr} ${local.tzName}`
  })

  // UTC / ISO 8601
  const isoUtc = date.toISOString()
  const utc = formatZoneTime(date, 'UTC')
  results.push({
    label: `UTC: ${utc.timeStr}`,
    sublabel: `${utc.dateStr} · ISO: ${isoUtc}`,
    value: isoUtc
  })

  // Unix Epoch Timestamps
  const epochSec = Math.floor(date.getTime() / 1000)
  const epochMs = date.getTime()
  results.push({
    label: `Unix Epoch (s): ${epochSec}`,
    sublabel: 'Seconds since Jan 1, 1970 UTC',
    value: String(epochSec)
  })

  results.push({
    label: `Unix Epoch (ms): ${epochMs}`,
    sublabel: 'Milliseconds since epoch',
    value: String(epochMs)
  })

  // Major World Timezones
  const sampleZones = [
    { name: 'US Pacific', iana: 'America/Los_Angeles' },
    { name: 'US Mountain', iana: 'America/Denver' },
    { name: 'US Central', iana: 'America/Chicago' },
    { name: 'US Eastern', iana: 'America/New_York' },
    { name: 'London (UK)', iana: 'Europe/London' },
    { name: 'Central Europe', iana: 'Europe/Paris' },
    { name: 'India (IST)', iana: 'Asia/Kolkata' },
    { name: 'Singapore', iana: 'Asia/Singapore' },
    { name: 'Tokyo (JST)', iana: 'Asia/Tokyo' },
    { name: 'Sydney (AEST)', iana: 'Australia/Sydney' },
    { name: 'Auckland (NZST)', iana: 'Pacific/Auckland' }
  ]

  for (const wz of sampleZones) {
    if (targetZone && wz.iana.toLowerCase() === targetZone.toLowerCase()) continue
    const zInfo = formatZoneTime(date, wz.iana)
    results.push({
      label: `${wz.name}: ${zInfo.timeStr}`,
      sublabel: `${zInfo.dateStr} · ${zInfo.tzName} (${zInfo.offsetStr})`,
      value: `${zInfo.dateStr} ${zInfo.timeStr} ${zInfo.tzName}`
    })
  }

  return results
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
