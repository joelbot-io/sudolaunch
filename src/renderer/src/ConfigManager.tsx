import { useCallback, useEffect, useRef, useState } from 'react'
import { CONFIG_TYPES, type ConfigTypeDef, type ConfigEntry, type AppEntry } from '../../shared/types'

interface Props {
  onExit: () => void
}

type Level =
  | { kind: 'types' }
  | { kind: 'list'; typeDef: ConfigTypeDef }
  | { kind: 'apps' }
  | { kind: 'form'; typeDef: ConfigTypeDef; index: number | null; draft: ConfigEntry }

// The apps screen is appended after CONFIG_TYPES as one more row in the "types" list,
// rather than living in CONFIG_TYPES itself — its list isn't add/edit/delete entries,
// it's a fixed set of discovered shortcuts toggled on or off.
const APPS_ROW_LABEL = 'App Visibility'
const APPS_ROW_DESCRIPTION = 'Choose which apps appear in the app launcher'
const APPS_ROW_INDEX = CONFIG_TYPES.length
// The apps list is preceded by two action rows: "Select all" and "Select none".
const APPS_ACTION_COUNT = 2

function emptyDraft(typeDef: ConfigTypeDef): ConfigEntry {
  const draft: ConfigEntry = {}
  for (const field of typeDef.fields) {
    draft[field.key] = field.type === 'boolean' ? false : field.type === 'number' ? 0 : ''
  }
  return draft
}

export default function ConfigManager({ onExit }: Props): JSX.Element {
  const [level, setLevel] = useState<Level>({ kind: 'types' })
  const [entries, setEntries] = useState<ConfigEntry[]>([])
  const [apps, setApps] = useState<AppEntry[]>([])
  const [disabledApps, setDisabledApps] = useState<Set<string>>(new Set())
  const [activeIndex, setActiveIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const breadcrumbRef = useRef<HTMLInputElement>(null)
  const firstFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const activeItemRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (level.kind === 'form') {
      firstFieldRef.current?.focus()
    } else {
      breadcrumbRef.current?.focus()
    }
    // Deliberately keyed on level.kind (+ which form) rather than `level` itself —
    // every keystroke replaces `level.draft` with a new object, and re-running this
    // on that would steal focus back to the first field on every character typed.
  }, [level.kind, level.kind === 'form' ? level.typeDef.type : null, level.kind === 'form' ? level.index : null])

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const loadEntries = useCallback((typeDef: ConfigTypeDef) => {
    window.api.getConfigEntries(typeDef.type).then((list) => {
      setEntries(list)
      setActiveIndex(0)
    })
  }, [])

  useEffect(() => {
    if (level.kind === 'list') {
      loadEntries(level.typeDef)
    }
    // Deliberately keyed on `level` itself (a fresh object each time we enter list mode)
    // rather than `loadEntries`/`level.typeDef`, so re-entering the same type still refetches.
  }, [level, loadEntries])

  useEffect(() => {
    if (level.kind !== 'apps') return
    Promise.all([window.api.listApps(), window.api.getConfigEntries('settings')]).then(([appList, settingsList]) => {
      setApps(appList)
      const saved = settingsList[0]?.disabledApps
      setDisabledApps(new Set(Array.isArray(saved) ? (saved as string[]) : []))
      setActiveIndex(0)
    })
  }, [level])

  function openTypeList(typeDef: ConfigTypeDef): void {
    setError(null)
    if (typeDef.singleton) {
      window.api.getConfigEntries(typeDef.type).then((list) => {
        setLevel({ kind: 'form', typeDef, index: 0, draft: { ...list[0] } })
      })
      return
    }
    setLevel({ kind: 'list', typeDef })
  }

  function openAppsScreen(): void {
    setError(null)
    setLevel({ kind: 'apps' })
  }

  function toggleAppDisabled(path: string): void {
    setDisabledApps((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      window.api.saveConfigEntry('settings', { disabledApps: Array.from(next) }, 0)
      return next
    })
  }

  function setAllAppsDisabled(disabled: boolean): void {
    const next = disabled ? new Set(apps.map((a) => a.path)) : new Set<string>()
    setDisabledApps(next)
    window.api.saveConfigEntry('settings', { disabledApps: Array.from(next) }, 0)
  }

  function openNewEntry(typeDef: ConfigTypeDef): void {
    setError(null)
    setLevel({ kind: 'form', typeDef, index: null, draft: emptyDraft(typeDef) })
  }

  function openEditEntry(typeDef: ConfigTypeDef, index: number): void {
    setError(null)
    setLevel({ kind: 'form', typeDef, index, draft: { ...entries[index] } })
  }

  function backOneLevel(): void {
    setError(null)
    if (level.kind === 'form') {
      if (level.typeDef.singleton) {
        onExit()
        return
      }
      setLevel({ kind: 'list', typeDef: level.typeDef })
      return
    }
    if (level.kind === 'list' || level.kind === 'apps') {
      setLevel({ kind: 'types' })
      return
    }
    onExit()
  }

  async function saveDraft(): Promise<void> {
    if (level.kind !== 'form') return
    const { typeDef, index, draft } = level
    const titleValue = draft[typeDef.titleField]
    if (typeof titleValue === 'string' && titleValue.trim() === '') {
      const fieldLabel = typeDef.fields.find((f) => f.key === typeDef.titleField)?.label ?? 'Field'
      setError(`${fieldLabel} is required`)
      return
    }
    await window.api.saveConfigEntry(typeDef.type, draft, index)
    if (typeDef.singleton) {
      onExit()
      return
    }
    setLevel({ kind: 'list', typeDef })
  }

  async function deleteEntryAt(typeDef: ConfigTypeDef, index: number): Promise<void> {
    await window.api.deleteConfigEntry(typeDef.type, index)
    loadEntries(typeDef)
  }

  function handleRootKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      backOneLevel()
      return
    }
    // Backspace with nothing to delete means "go back" — for types/list levels the
    // breadcrumb input is read-only (nothing is ever deletable), so treat every
    // Backspace there as a back-navigation. Form-level fields handle their own
    // Backspace (delete text, or go back once the field is already empty).
    if (e.key === 'Backspace' && level.kind !== 'form') {
      e.preventDefault()
      backOneLevel()
      return
    }
    if (level.kind === 'types') {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, APPS_ROW_INDEX))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (activeIndex === APPS_ROW_INDEX) openAppsScreen()
        else openTypeList(CONFIG_TYPES[activeIndex])
      }
    } else if (level.kind === 'apps') {
      const lastIndex = apps.length + APPS_ACTION_COUNT - 1
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(lastIndex, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (activeIndex === 0) setAllAppsDisabled(false)
        else if (activeIndex === 1) setAllAppsDisabled(true)
        else {
          const entry = apps[activeIndex - APPS_ACTION_COUNT]
          if (entry) toggleAppDisabled(entry.path)
        }
      }
    } else if (level.kind === 'list') {
      const count = entries.length + 1 // +1 for "Add new"
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, count - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (activeIndex === entries.length) openNewEntry(level.typeDef)
        else openEditEntry(level.typeDef, activeIndex)
      } else if (e.key === 'Delete' && activeIndex < entries.length) {
        e.preventDefault()
        deleteEntryAt(level.typeDef, activeIndex)
      }
    }
  }

  const breadcrumb =
    '// ' +
    (level.kind === 'apps' ? APPS_ROW_LABEL : level.kind !== 'types' ? level.typeDef.label : '') +
    (level.kind === 'form' ? (level.index === null ? ' / New' : ' / Edit') : '')

  return (
    <div className="config-manager" onKeyDown={handleRootKeyDown}>
      <input ref={breadcrumbRef} className="palette-input" value={breadcrumb} readOnly />
      {error && <div className="palette-banner">{error}</div>}

      {level.kind === 'types' && (
        <ul className="palette-list">
          {CONFIG_TYPES.map((t, idx) => (
            <li
              key={t.type}
              ref={idx === activeIndex ? activeItemRef : undefined}
              className={idx === activeIndex ? 'palette-item active' : 'palette-item'}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => openTypeList(t)}
            >
              <span className="palette-item-text">
                <span className="palette-item-label">{t.label}</span>
                <span className="palette-item-sublabel">{t.description}</span>
              </span>
            </li>
          ))}
          <li
            ref={activeIndex === APPS_ROW_INDEX ? activeItemRef : undefined}
            className={activeIndex === APPS_ROW_INDEX ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(APPS_ROW_INDEX)}
            onClick={openAppsScreen}
          >
            <span className="palette-item-text">
              <span className="palette-item-label">{APPS_ROW_LABEL}</span>
              <span className="palette-item-sublabel">{APPS_ROW_DESCRIPTION}</span>
            </span>
          </li>
        </ul>
      )}

      {level.kind === 'apps' && (
        <ul className="palette-list">
          <li
            ref={activeIndex === 0 ? activeItemRef : undefined}
            className={activeIndex === 0 ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(0)}
            onClick={() => setAllAppsDisabled(false)}
          >
            <span className="palette-item-label">Select all</span>
          </li>
          <li
            ref={activeIndex === 1 ? activeItemRef : undefined}
            className={activeIndex === 1 ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(1)}
            onClick={() => setAllAppsDisabled(true)}
          >
            <span className="palette-item-label">Select none</span>
          </li>
          {apps.length === 0 && <li className="palette-empty">No apps found</li>}
          {apps.map((a, idx) => (
            <li
              key={a.path}
              ref={idx + APPS_ACTION_COUNT === activeIndex ? activeItemRef : undefined}
              className={idx + APPS_ACTION_COUNT === activeIndex ? 'palette-item active' : 'palette-item'}
              onMouseEnter={() => setActiveIndex(idx + APPS_ACTION_COUNT)}
              onClick={() => toggleAppDisabled(a.path)}
            >
              <span className="palette-item-text">
                <span className="palette-item-label">{a.name}</span>
                <span className="palette-item-sublabel">{a.path}</span>
              </span>
              <input
                type="checkbox"
                className="config-app-checkbox"
                checked={!disabledApps.has(a.path)}
                readOnly
                tabIndex={-1}
              />
            </li>
          ))}
        </ul>
      )}

      {level.kind === 'list' && (
        <ul className="palette-list">
          {entries.map((entry, idx) => (
            <li
              key={idx}
              ref={idx === activeIndex ? activeItemRef : undefined}
              className={idx === activeIndex ? 'palette-item active' : 'palette-item'}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => openEditEntry(level.typeDef, idx)}
            >
              <span className="palette-item-text">
                <span className="palette-item-label">{String(entry[level.typeDef.titleField] ?? '(untitled)')}</span>
                {level.typeDef.subtitleField && (
                  <span className="palette-item-sublabel">{String(entry[level.typeDef.subtitleField] ?? '')}</span>
                )}
              </span>
              <button
                type="button"
                className="config-item-delete"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteEntryAt(level.typeDef, idx)
                }}
              >
                ✕
              </button>
            </li>
          ))}
          <li
            ref={activeIndex === entries.length ? activeItemRef : undefined}
            className={activeIndex === entries.length ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(entries.length)}
            onClick={() => openNewEntry(level.typeDef)}
          >
            <span className="palette-item-label">+ Add new</span>
          </li>
        </ul>
      )}

      {level.kind === 'form' && (
        <div className="config-form">
          {level.typeDef.fields.map((field, idx) => (
            <label key={field.key} className="config-field">
              <span className="config-field-label">{field.label}</span>
              {field.type === 'textarea' ? (
                <textarea
                  ref={idx === 0 ? (firstFieldRef as React.RefObject<HTMLTextAreaElement>) : undefined}
                  className="config-field-input"
                  rows={3}
                  value={String(level.draft[field.key] ?? '')}
                  onChange={(e) => setLevel({ ...level, draft: { ...level.draft, [field.key]: e.target.value } })}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && e.currentTarget.value === '') {
                      e.preventDefault()
                      backOneLevel()
                    }
                  }}
                />
              ) : field.type === 'boolean' ? (
                <input
                  ref={idx === 0 ? (firstFieldRef as React.RefObject<HTMLInputElement>) : undefined}
                  type="checkbox"
                  checked={Boolean(level.draft[field.key])}
                  onChange={(e) =>
                    setLevel({ ...level, draft: { ...level.draft, [field.key]: e.target.checked } })
                  }
                />
              ) : (
                <input
                  ref={idx === 0 ? (firstFieldRef as React.RefObject<HTMLInputElement>) : undefined}
                  type={field.type === 'number' ? 'number' : 'text'}
                  className="config-field-input"
                  value={String(level.draft[field.key] ?? '')}
                  onChange={(e) =>
                    setLevel({
                      ...level,
                      draft: {
                        ...level.draft,
                        [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value
                      }
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && e.currentTarget.value === '') {
                      e.preventDefault()
                      backOneLevel()
                      return
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      saveDraft()
                    }
                  }}
                />
              )}
            </label>
          ))}
          <div className="config-form-actions">
            <button type="button" className="config-btn config-btn-primary" onClick={saveDraft}>
              Save
            </button>
            {level.index !== null && !level.typeDef.singleton && (
              <button
                type="button"
                className="config-btn config-btn-danger"
                onClick={async () => {
                  await deleteEntryAt(level.typeDef, level.index as number)
                  setLevel({ kind: 'list', typeDef: level.typeDef })
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
