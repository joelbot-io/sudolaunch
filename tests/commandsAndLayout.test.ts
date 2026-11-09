import { describe, it, expect } from 'vitest'
import { evaluateExpression } from '../src/main/commands/calc'
import { search as searchChmod } from '../src/main/commands/chmod'
import { search as searchColor } from '../src/main/commands/color'
import { search as searchCase } from '../src/main/commands/case'
import { search as searchUnit } from '../src/main/commands/unit'
import { formatAccelerator } from '../src/renderer/src/accelerator'
import { reconcileCommandLayout } from '../src/main/commandLayout'
import { COMMANDS, DEFAULT_COMMAND_LAYOUT } from '../src/shared/types'

describe('Pure Developer Utility Commands (calc, chmod, color, case, unit)', () => {
  it('evaluates math expressions safely in calc.ts', () => {
    expect(evaluateExpression('2 + 2 * 10')).toBe('22')
    expect(evaluateExpression('sqrt(144)')).toBe('12')
    expect(evaluateExpression('')).toBeNull()
    expect(evaluateExpression('invalid syntax (((')).toBeNull()
  })

  it('converts between octal and symbolic permissions in chmod.ts', () => {
    const fromOctal = searchChmod('755')
    expect(fromOctal[0].label).toContain('chmod 755 (rwxr-xr-x)')
    expect(fromOctal[1].value).toBe('rwxr-xr-x')

    const fromSymbolic = searchChmod('-rw-r--r--')
    expect(fromSymbolic[0].label).toContain('chmod 644 (rw-r--r--)')
    expect(fromSymbolic[2].value).toBe('644')
  })

  it('converts HEX, RGB, HSL, and named colors in color.ts', () => {
    const hexResults = searchColor('#ff6347')
    expect(hexResults.some((r) => r.value === 'rgb(255, 99, 71)')).toBe(true)

    const namedResults = searchColor('rebeccapurple')
    expect(namedResults.some((r) => r.value.toLowerCase() === '#663399')).toBe(true)
  })

  it('converts identifier casing across 10 formats in case.ts', () => {
    const results = searchCase('userProfileId')
    const byValue = new Set(results.map((r) => r.value))
    expect(byValue.has('userProfileId')).toBe(true)
    expect(byValue.has('UserProfileId')).toBe(true)
    expect(byValue.has('user_profile_id')).toBe(true)
    expect(byValue.has('user-profile-id')).toBe(true)
    expect(byValue.has('USER_PROFILE_ID')).toBe(true)
    expect(byValue.has('User-Profile-Id')).toBe(true)
  })

  it('converts data sizes, temperatures, and number bases in unit.ts', () => {
    const dataRes = searchUnit('2 GB in MB')
    expect(dataRes[0].value).toBe('2048')

    const hexRes = searchUnit('0xFF')
    expect(hexRes[0].value).toBe('255')
    expect(hexRes[2].value).toBe('0b11111111')
  })

  it('formats Electron accelerator strings into Windows key labels', () => {
    expect(formatAccelerator('CommandOrControl+Space')).toBe('Ctrl+Space')
    expect(formatAccelerator('Control+Super+Alt+K')).toBe('Ctrl+Win+Alt+K')
  })
})

describe('Command Layout Migration & Reconciliation (commandLayout.ts)', () => {
  it('ensures every built-in and custom command is present exactly once after reconciliation', () => {
    const partialLayout = {
      rootOrder: ['folder:dev', 'teams', 'teams'], // duplicate 'teams', missing many commands
      folders: [
        {
          id: 'folder:dev',
          name: 'Dev Tools',
          icon: '🛠️',
          commands: ['git', 'docker']
        }
      ]
    }

    const reconciled = reconcileCommandLayout(partialLayout, ['my-custom-cmd'])

    // 'teams' should be deduplicated in rootOrder
    expect(reconciled.rootOrder.filter((id) => id === 'teams')).toHaveLength(1)

    // Commands inside folder:dev ('git', 'docker') should NOT also appear in rootOrder
    expect(reconciled.rootOrder.includes('git')).toBe(false)
    expect(reconciled.rootOrder.includes('docker')).toBe(false)

    // Newly added built-in commands (like 'jobs') and custom commands ('my-custom-cmd') must be appended to rootOrder
    expect(reconciled.rootOrder.includes('jobs')).toBe(true)
    expect(reconciled.rootOrder.includes('my-custom-cmd')).toBe(true)

    // Total unique commands across folders + rootOrder should equal all built-in + custom commands
    const folderCmds = reconciled.folders.flatMap((f) => f.commands)
    const rootCmds = reconciled.rootOrder.filter((id) => !id.startsWith('folder:'))
    const totalUnique = new Set([...folderCmds, ...rootCmds])
    expect(totalUnique.size).toBe(COMMANDS.length + 1)
  })

  it('validates that DEFAULT_COMMAND_LAYOUT covers all built-in COMMANDS without duplicates', () => {
    const reconciled = reconcileCommandLayout(DEFAULT_COMMAND_LAYOUT, [])
    const folderCmds = reconciled.folders.flatMap((f) => f.commands)
    const rootCmds = reconciled.rootOrder.filter((id) => !id.startsWith('folder:'))
    expect(new Set([...folderCmds, ...rootCmds]).size).toBe(COMMANDS.length)
  })
})

