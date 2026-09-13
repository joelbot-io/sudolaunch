import { clipboard } from 'electron'
import type { SearchResultItem } from '../../shared/types'

function splitIntoWords(input: string): string[] {
  return input
    // Handle camelCase / PascalCase word boundaries
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z0-9])/g, '$1 $2')
    // Replace punctuation with spaces
    .replace(/[-_./\\]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
}

export function search(query: string): SearchResultItem[] {
  let text = query.trim()

  if (!text) {
    const cb = clipboard.readText().trim()
    if (cb && cb.length < 300) {
      text = cb
    }
  }

  if (!text) {
    return [
      {
        label: 'Enter text to convert case (or copy to clipboard)',
        sublabel: 'Examples: /case user incident response · /case myVariableName · /case user_profile_id',
        value: '',
        disabled: true
      }
    ]
  }

  const words = splitIntoWords(text)
  if (words.length === 0) return []

  const lowerWords = words.map((w) => w.toLowerCase())

  const camelCase = lowerWords.map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join('')
  const pascalCase = lowerWords.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
  const kebabCase = lowerWords.join('-')
  const snakeCase = lowerWords.join('_')
  const constantCase = lowerWords.map((w) => w.toUpperCase()).join('_')
  const titleCase = lowerWords.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  const sentenceCase = lowerWords.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ')
  const dotCase = lowerWords.join('.')
  const pathCase = lowerWords.join('/')
  const trainCase = lowerWords.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('-')

  return [
    {
      label: `camelCase: ${camelCase}`,
      sublabel: `Converted from "${text.length > 40 ? text.slice(0, 37) + '...' : text}"`,
      value: camelCase
    },
    {
      label: `kebab-case: ${kebabCase}`,
      sublabel: 'Hyphen-separated lowercase (URLs, branch names, CSS classes)',
      value: kebabCase
    },
    {
      label: `snake_case: ${snakeCase}`,
      sublabel: 'Underscore-separated lowercase (database columns, Python)',
      value: snakeCase
    },
    {
      label: `CONSTANT_CASE: ${constantCase}`,
      sublabel: 'Screaming snake case for constants and environment variables',
      value: constantCase
    },
    {
      label: `PascalCase: ${pascalCase}`,
      sublabel: 'Capitalized words with no spaces (classes, types, React components)',
      value: pascalCase
    },
    {
      label: `Title Case: ${titleCase}`,
      sublabel: 'Capitalized words separated by spaces (headings, titles)',
      value: titleCase
    },
    {
      label: `Sentence case: ${sentenceCase}`,
      sublabel: 'Initial word capitalized, standard prose format',
      value: sentenceCase
    },
    {
      label: `dot.case: ${dotCase}`,
      sublabel: 'Period-separated lowercase (config keys, metrics, loggers)',
      value: dotCase
    },
    {
      label: `path/case: ${pathCase}`,
      sublabel: 'Slash-separated path format',
      value: pathCase
    },
    {
      label: `Train-Case: ${trainCase}`,
      sublabel: 'Hyphen-separated capitalized words (HTTP headers)',
      value: trainCase
    }
  ]
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
