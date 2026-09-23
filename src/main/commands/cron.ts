import { clipboard } from 'electron'
import type { SearchResultItem } from '../../shared/types'

const ALIASES: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *'
}

function parseField(field: string, min: number, max: number): number[] | null {
  const values = new Set<number>()
  const parts = field.split(',')

  for (const part of parts) {
    // */step or min-max/step
    const stepMatch = part.match(/^(\*|\d+-\d+)\/(\d+)$/)
    if (stepMatch) {
      const step = parseInt(stepMatch[2], 10)
      if (step <= 0) return null
      let start = min
      let end = max
      if (stepMatch[1] !== '*') {
        const [s, e] = stepMatch[1].split('-').map(Number)
        start = s
        end = e
      }
      for (let i = start; i <= end; i += step) {
        if (i >= min && i <= max) values.add(i)
      }
      continue
    }

    // min-max range
    const rangeMatch = part.match(/^(\d+)-(\d+)$/)
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10)
      const end = parseInt(rangeMatch[2], 10)
      if (start > end || start < min || end > max) return null
      for (let i = start; i <= end; i++) values.add(i)
      continue
    }

    // wildcard *
    if (part === '*') {
      for (let i = min; i <= max; i++) values.add(i)
      continue
    }

    // exact number
    const num = parseInt(part, 10)
    if (!isNaN(num) && num >= min && num <= max) {
      values.add(num)
      continue
    }

    return null
  }

  return Array.from(values).sort((a, b) => a - b)
}

function explainCron(fields: string[]): string {
  const [min, hour, dom, month, dow] = fields

  const minText = min === '*' ? 'every minute' : min.startsWith('*/') ? `every ${min.slice(2)} minutes` : `at minute ${min}`
  const hourText = hour === '*' ? 'of every hour' : hour.startsWith('*/') ? `every ${hour.slice(2)} hours` : `at hour ${hour}:00`
  const domText = dom === '*' ? '' : `on day-of-month ${dom}`
  const monthText = month === '*' ? '' : `in month ${month}`
  const dowText = dow === '*' ? '' : `on day-of-week ${dow}`

  const clauses = [minText, hourText, domText, monthText, dowText].filter(Boolean)
  return clauses.join(', ')
}

function getNextExecutions(fields: string[], count = 5): Date[] {
  const minVals = parseField(fields[0], 0, 59)
  const hourVals = parseField(fields[1], 0, 23)
  const domVals = parseField(fields[2], 1, 31)
  const monthVals = parseField(fields[3], 1, 12)
  const dowVals = parseField(fields[4], 0, 6) // 0=Sun..6=Sat

  if (!minVals || !hourVals || !domVals || !monthVals || !dowVals) return []

  const minSet = new Set(minVals)
  const hourSet = new Set(hourVals)
  const domSet = new Set(domVals)
  const monthSet = new Set(monthVals)
  const dowSet = new Set(dowVals)

  const dates: Date[] = []
  const current = new Date()
  current.setSeconds(0, 0)
  current.setMinutes(current.getMinutes() + 1) // Start looking at next minute

  const limitIterations = 60 * 24 * 366 // Max 1 year ahead search
  let iter = 0

  while (dates.length < count && iter < limitIterations) {
    iter++
    const m = current.getMinutes()
    const h = current.getHours()
    const d = current.getDate()
    const mon = current.getMonth() + 1
    const w = current.getDay()

    if (monthSet.has(mon) && domSet.has(d) && dowSet.has(w) && hourSet.has(h) && minSet.has(m)) {
      dates.push(new Date(current))
    }

    current.setMinutes(current.getMinutes() + 1)
  }

  return dates
}

export function search(query: string): SearchResultItem[] {
  let q = query.trim()

  if (!q) {
    const cb = clipboard.readText().trim()
    if (cb && (cb.startsWith('@') || cb.split(/\s+/).length === 5)) {
      q = cb
    }
  }

  if (ALIASES[q.toLowerCase()]) {
    q = ALIASES[q.toLowerCase()]
  }

  // Normalise text input (e.g. MON-FRI -> 1-5)
  q = q
    .replace(/\bSUN\b/gi, '0')
    .replace(/\bMON\b/gi, '1')
    .replace(/\bTUE\b/gi, '2')
    .replace(/\bWED\b/gi, '3')
    .replace(/\bTHU\b/gi, '4')
    .replace(/\bFRI\b/gi, '5')
    .replace(/\bSAT\b/gi, '6')

  const fields = q.split(/\s+/)

  if (fields.length !== 5) {
    return [
      {
        label: 'Enter a 5-part cron expression',
        sublabel: 'Examples: /cron */15 * * * * · /cron 0 9 * * 1-5 · /cron @daily · /cron 0 0 1 * *',
        value: '',
        disabled: true
      }
    ]
  }

  const nextRuns = getNextExecutions(fields, 5)
  if (nextRuns.length === 0) {
    return [
      {
        label: 'Invalid or unsatisfiable cron expression',
        sublabel: 'Format: <minute> <hour> <day-of-month> <month> <day-of-week>',
        value: '',
        disabled: true
      }
    ]
  }

  const explanation = explainCron(fields)
  const results: SearchResultItem[] = []

  // 1. Explanation
  results.push({
    label: `Schedule: ${explanation}`,
    sublabel: `Expression: "${query.trim()}"`,
    value: explanation
  })

  // 2. Next 5 Upcoming Runs
  for (let i = 0; i < nextRuns.length; i++) {
    const run = nextRuns[i]
    const dtf = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    })
    const formatted = dtf.format(run)
    const diffMs = run.getTime() - Date.now()
    const diffHrs = Math.round(diffMs / (1000 * 3600))
    const diffText = diffHrs < 1 ? `in ${Math.round(diffMs / 60000)} mins` : diffHrs < 24 ? `in ${diffHrs} hours` : `in ${Math.round(diffHrs / 24)} days`

    results.push({
      label: `Run #${i + 1}: ${formatted}`,
      sublabel: `${diffText} (${run.toISOString()})`,
      value: formatted
    })
  }

  return results
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
