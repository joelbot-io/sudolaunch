import type { ShortcutActionType } from '../../../shared/types'

export const ACTION_TYPE_BADGES: Record<
  ShortcutActionType,
  { label: string; color: string; bg: string; border: string }
> = {
  hotkey: {
    label: '⌨️ Keystroke',
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.12)',
    border: 'rgba(56, 189, 248, 0.28)'
  },
  powertoys: {
    label: '🧰 PowerToys',
    color: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.12)',
    border: 'rgba(168, 85, 247, 0.28)'
  },
  terminal: {
    label: '>_ Terminal',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.28)'
  },
  powershell: {
    label: '⚡ PowerShell',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.28)'
  },
  open: {
    label: '🚀 Launch',
    color: '#60a5fa',
    bg: 'rgba(96, 165, 250, 0.12)',
    border: 'rgba(96, 165, 250, 0.28)'
  },
  sudolaunch: {
    label: '⌘ SudoLaunch',
    color: '#f472b6',
    bg: 'rgba(244, 114, 182, 0.12)',
    border: 'rgba(244, 114, 182, 0.28)'
  }
}

export const QUICK_ICONS = [
  '⚡',
  '⌨️',
  '🧰',
  '🐳',
  '🪟',
  '💻',
  '🚀',
  '🌿',
  '🔍',
  '🎨',
  '📌',
  '✂️',
  '📁',
  '🌐',
  '🔒',
  '📊'
]

export function renderKeycaps(keysStr: string): JSX.Element {
  const trimmed = (keysStr || '').trim()
  if (!trimmed) {
    return <span style={{ fontSize: 10, color: '#64748b' }}>Click to Run</span>
  }

  // Split by '+' for modifier combinations while preserving sequences like 'Alt+D P'
  const groups = trimmed.split(/\s+/)
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        flexWrap: 'wrap',
        justifyContent: 'flex-end'
      }}
    >
      {groups.map((grp, gIdx) => {
        const parts = grp.split('+').filter(Boolean)
        return (
          <span key={gIdx} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            {parts.map((part, pIdx) => (
              <span key={pIdx} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <kbd
                  style={{
                    display: 'inline-block',
                    padding: '2px 7px',
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: '"Cascadia Mono", Consolas, monospace',
                    color: '#f1f5f9',
                    background:
                      'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))',
                    border: '1px solid rgba(255,255,255,0.22)',
                    borderBottomWidth: 2,
                    borderBottomColor: 'rgba(255,255,255,0.32)',
                    borderRadius: 5,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.35)',
                    lineHeight: 1.2
                  }}
                >
                  {part}
                </kbd>
                {pIdx < parts.length - 1 && (
                  <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>+</span>
                )}
              </span>
            ))}
          </span>
        )
      })}
    </div>
  )
}

