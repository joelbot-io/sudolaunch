import { describe, it, expect } from 'vitest'
import { splitNameAndArgs, parseArgs, substitute } from '../src/main/commands/custom'
import { parseWingetTable } from '../src/main/wingetManager'
import { parseGitPorcelainStatus } from '../src/main/gitStatus'

describe('Custom Command Argument Parser & Substitution (custom.ts)', () => {
  it('splits command name and argument tail accurately', () => {
    expect(splitNameAndArgs('deploy')).toEqual({ name: 'deploy', argsStr: '' })
    expect(splitNameAndArgs('deploy env=prod tag="v1.2.0"')).toEqual({
      name: 'deploy',
      argsStr: 'env=prod tag="v1.2.0"'
    })
  })

  it('parses unquoted, single-quoted, and double-quoted key=value pairs', () => {
    const parsed = parseArgs(`env=staging msg="Hello World" path='C:\\Program Files\\App'`)
    expect(parsed).toEqual({
      env: 'staging',
      msg: 'Hello World',
      path: 'C:\\Program Files\\App'
    })
  })

  it('substitutes all placeholder occurrences cleanly', () => {
    const template = 'Write-Host "Deploying {service} to {env} ({service})"'
    expect(substitute(template, { service: 'api-gateway', env: 'prod' })).toBe(
      'Write-Host "Deploying api-gateway to prod (api-gateway)"'
    )
  })
})

describe('WinGet CLI Fixed-Width Table Parser (wingetManager.ts)', () => {
  it('parses winget upgrade output with progress spinner carriage returns and footers', () => {
    const sampleStdout = [
      '   - \r   \\ \r   | \r',
      'Name                          Id                            Version      Available    Source',
      '----------------------------------------------------------------------------------------------',
      'Git                           Git.Git                       2.46.0       2.47.1       winget',
      'Microsoft PowerToys           Microsoft.PowerToys           0.85.0       0.86.0       winget',
      '2 upgrades available.'
    ].join('\n')

    const rows = parseWingetTable(sampleStdout)
    expect(rows).toEqual([
      {
        name: 'Git',
        id: 'Git.Git',
        version: '2.46.0',
        available: '2.47.1',
        source: 'winget'
      },
      {
        name: 'Microsoft PowerToys',
        id: 'Microsoft.PowerToys',
        version: '0.85.0',
        available: '0.86.0',
        source: 'winget'
      }
    ])
  })

  it('parses winget pin list output with Pin type and Pinned version columns', () => {
    const samplePins = [
      'Name           Id             Version Source Pin type Pinned version',
      '---------------------------------------------------------------------',
      'Node.js        OpenJS.NodeJS  20.11.0 winget Gating   20.*',
      'Docker Desktop Docker.Docker  4.30.0  winget Blocking'
    ].join('\n')

    const rows = parseWingetTable(samplePins)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      name: 'Node.js',
      id: 'OpenJS.NodeJS',
      'pin type': 'Gating',
      'pinned version': '20.*'
    })
    expect(rows[1]).toMatchObject({
      name: 'Docker Desktop',
      id: 'Docker.Docker',
      'pin type': 'Blocking',
      'pinned version': ''
    })
  })
})

describe('Git Status Porcelain v1 Parser (gitStatus.ts)', () => {
  it('parses branch, ahead/behind counts, and dirty state from porcelain output', () => {
    const out = [
      '## feat/scheduler...origin/feat/scheduler [ahead 3, behind 1]',
      ' M src/main/index.ts',
      '?? tests/new.test.ts'
    ].join('\n')

    expect(parseGitPorcelainStatus(out)).toEqual({
      branch: 'feat/scheduler',
      ahead: 3,
      behind: 1,
      dirty: true
    })
  })

  it('handles clean working trees, ahead-only, behind-only, and initial commits', () => {
    expect(parseGitPorcelainStatus('## main...origin/main\n')).toEqual({
      branch: 'main',
      ahead: 0,
      behind: 0,
      dirty: false
    })

    expect(parseGitPorcelainStatus('## main...origin/main [behind 4]\n')).toEqual({
      branch: 'main',
      ahead: 0,
      behind: 4,
      dirty: false
    })

    expect(parseGitPorcelainStatus('## No commits yet on develop\n?? README.md')).toEqual({
      branch: 'develop',
      ahead: 0,
      behind: 0,
      dirty: true
    })

    expect(parseGitPorcelainStatus('## HEAD (no branch)\n')).toEqual({
      branch: 'HEAD',
      ahead: 0,
      behind: 0,
      dirty: false
    })
  })
})

