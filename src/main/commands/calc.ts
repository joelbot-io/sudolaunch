import { clipboard } from 'electron'
import { evaluate } from 'mathjs'
import type { SearchResultItem } from '../../shared/types'

export function evaluateExpression(expression: string): string | null {
  if (!expression.trim()) return null
  try {
    const result = evaluate(expression)
    return typeof result === 'number' ? String(result) : String(result)
  } catch {
    return null
  }
}

export async function execute(item: SearchResultItem): Promise<void> {
  clipboard.writeText(item.value)
}
