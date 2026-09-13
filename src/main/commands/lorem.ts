import { clipboard } from 'electron'
import { randomInt } from 'crypto'
import type { SearchResultItem } from '../../shared/types'

const LOREM_PARAGRAPHS = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris.',
  'Integer in mauris eu nibh euismod gravida. Duis ac tellus et risus vulputate vehicula. Donec lobortis risus a elit. Etiam tempor. Ut ullamcorper, ligula eu tempor congue, eros est euismod turpis, id tincidunt sapien risus a quam. Maecenas fermentum consequat mi.',
  'Fusce vulputate eleifend sapien. Vestibulum purus quam, scelerisque ut, mollis sed, nonummy id, metus. Nullam accumsan lorem in dui. Cras ultricies mi eu turpis hendrerit fringilla. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae.',
  'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Proin pharetra nonummy pede. Mauris et orci. Aenean nec lorem. In porttitor. Donec laoreet nonummy augue. Suspendisse dui purus, scelerisque at, vulputate vitae, pretium mattis, nunc.'
]

const FIRST_NAMES = ['Alex', 'Sarah', 'Marcus', 'Elena', 'Jordan', 'Maya', 'David', 'Rachel', 'Liam', 'Olivia']
const LAST_NAMES = ['Vance', 'Chen', 'Miller', 'O\'Connor', 'Patel', 'Novak', 'Washington', 'Taylor', 'Dubois', 'Sterling']
const COMPANIES = ['Apex Technologies', 'Nexus Global Systems', 'Cipher Dynamics', 'Vanguard Security', 'Horizon Cloud Solutions', 'Starlight Data Labs']
const STREETS = ['742 Evergreen Terrace', '1048 Industrial Parkway', '42 Wallaby Way', '221B Baker Street', '350 Fifth Avenue', '1600 Amphitheatre Pkwy']
const CITIES = ['San Francisco, CA 94105', 'Austin, TX 78701', 'Seattle, WA 98101', 'New York, NY 10001', 'Chicago, IL 60601', 'Denver, CO 80202']
const TITLES = ['Senior Security Engineer', 'Staff Software Architect', 'Principal Incident Responder', 'Director of DevOps', 'Product Manager', 'Cloud Infrastructure Specialist']

function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length)]
}

export function search(query: string): SearchResultItem[] {
  const q = query.trim().toLowerCase()
  const count = parseInt(q, 10)

  // If query is a number of paragraphs (e.g. /lorem 3)
  if (!isNaN(count) && count > 0) {
    const paras: string[] = []
    for (let i = 0; i < Math.min(count, 10); i++) {
      paras.push(LOREM_PARAGRAPHS[i % LOREM_PARAGRAPHS.length])
    }
    const combined = paras.join('\n\n')
    return [
      {
        label: `Lorem Ipsum (${count} paragraph${count === 1 ? '' : 's'})`,
        sublabel: combined.slice(0, 80) + '...',
        value: combined
      }
    ]
  }

  const firstName = pick(FIRST_NAMES)
  const lastName = pick(LAST_NAMES)
  const fullName = `${firstName} ${lastName}`
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z]/g, '')}@example.com`
  const phone = `+1 (555) 01${randomInt(10, 99)}-${randomInt(1000, 9999)}`
  const address = `${pick(STREETS)}, ${pick(CITIES)}`
  const company = pick(COMPANIES)
  const title = pick(TITLES)
  const singleSentence = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'

  const results: SearchResultItem[] = [
    {
      label: `Paragraph: ${LOREM_PARAGRAPHS[0].slice(0, 50)}...`,
      sublabel: 'Standard single paragraph of placeholder text',
      value: LOREM_PARAGRAPHS[0]
    },
    {
      label: `3 Paragraphs (${LOREM_PARAGRAPHS.slice(0, 3).join(' ').length} chars)`,
      sublabel: 'Three formatted paragraphs separated by blank lines',
      value: LOREM_PARAGRAPHS.slice(0, 3).join('\n\n')
    },
    {
      label: `Sentence: ${singleSentence}`,
      sublabel: 'Single short placeholder sentence',
      value: singleSentence
    },
    {
      label: `Mock Name: ${fullName}`,
      sublabel: `Generated person name (${title} at ${company})`,
      value: fullName
    },
    {
      label: `Mock Email: ${email}`,
      sublabel: 'Test email address with safe @example.com domain',
      value: email
    },
    {
      label: `Mock Phone: ${phone}`,
      sublabel: 'Test US format phone number (555 area prefix)',
      value: phone
    },
    {
      label: `Mock Address: ${address}`,
      sublabel: 'Formatted physical street address and ZIP',
      value: address
    },
    {
      label: `Mock Company: ${company}`,
      sublabel: `${title}`,
      value: company
    }
  ]

  if (q) {
    const filtered = results.filter(
      (r) => r.label.toLowerCase().includes(q) || (r.sublabel && r.sublabel.toLowerCase().includes(q))
    )
    if (filtered.length > 0) return filtered
  }

  return results
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
