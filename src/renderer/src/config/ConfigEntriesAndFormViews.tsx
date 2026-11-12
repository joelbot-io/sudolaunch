import type { MutableRefObject, RefObject } from 'react'
import type { ConfigEntry, ConfigTypeDef } from '../../../shared/types'
import { TEAMS_MANAGER_ACTION_COUNT, type Level } from './configSettingsDefinitions'

export interface TeamsManagerItem {
  key: string
  typeDef: ConfigTypeDef
  originalIndex: number
  entry: ConfigEntry
  title: string
  subtitle: string
  badge: string
}

export interface ConfigEntriesAndFormViewsProps {
  level: Level
  setLevel: (level: Level) => void
  disableMouseInput: boolean
  activeIndex: number
  setActiveIndex: (idx: number) => void
  activeItemRef: RefObject<HTMLLIElement>
  firstFieldRef: MutableRefObject<any>
  targetFieldRef: MutableRefObject<any>
  contactsTypeDef: ConfigTypeDef
  teamLinksTypeDef: ConfigTypeDef
  filteredTeamsManagerItems: TeamsManagerItem[]
  pendingTeamsDeleteKey: string | null
  openNewTeamsEntry: (typeDef: ConfigTypeDef) => void
  openEditTeamsEntry: (typeDef: ConfigTypeDef, index: number, entry: ConfigEntry) => void
  requestTeamsItemDelete: (typeDef: ConfigTypeDef, index: number, itemKey: string) => void
  filteredEntries: Array<{ entry: ConfigEntry; originalIndex: number }>
  pendingDeleteIndex: number | null
  openNewEntry: (typeDef: ConfigTypeDef) => void
  openEditEntry: (typeDef: ConfigTypeDef, index: number) => void
  requestDelete: (typeDef: ConfigTypeDef, index: number) => void
  deleteTeamsItemAt: (typeDef: ConfigTypeDef, index: number) => Promise<void>
  deleteEntryAt: (typeDef: ConfigTypeDef, index: number) => Promise<void>
  backOneLevel: () => void
  saveDraft: () => Promise<void>
}

export function ConfigEntriesAndFormViews({
  level,
  setLevel,
  disableMouseInput,
  activeIndex,
  setActiveIndex,
  activeItemRef,
  firstFieldRef,
  targetFieldRef,
  contactsTypeDef,
  teamLinksTypeDef,
  filteredTeamsManagerItems,
  pendingTeamsDeleteKey,
  openNewTeamsEntry,
  openEditTeamsEntry,
  requestTeamsItemDelete,
  filteredEntries,
  pendingDeleteIndex,
  openNewEntry,
  openEditEntry,
  requestDelete,
  deleteTeamsItemAt,
  deleteEntryAt,
  backOneLevel,
  saveDraft
}: ConfigEntriesAndFormViewsProps): JSX.Element | null {
  if (level.kind === 'teamsManager') {
    return (
      <>
        <ul className={disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}>
          <li
            ref={activeIndex === 0 ? activeItemRef : undefined}
            className={activeIndex === 0 ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(0)}
            onClick={() => openNewTeamsEntry(contactsTypeDef)}
          >
            <span className="palette-item-text">
              <span className="palette-item-label">+ Add New Contact (Person)</span>
              <span className="palette-item-sublabel">
                Add a person by name and email for 1:1 Teams chat or call
              </span>
            </span>
            <span className="config-toggle-badge">New Person</span>
          </li>
          <li
            ref={activeIndex === 1 ? activeItemRef : undefined}
            className={activeIndex === 1 ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(1)}
            onClick={() => openNewTeamsEntry(teamLinksTypeDef)}
          >
            <span className="palette-item-text">
              <span className="palette-item-label">+ Add New Team / Channel Link</span>
              <span className="palette-item-sublabel">
                Add a Teams channel or group chat deep link
              </span>
            </span>
            <span className="config-toggle-badge">New Team</span>
          </li>
          {filteredTeamsManagerItems.map((item, idx) => {
            const rowIdx = idx + TEAMS_MANAGER_ACTION_COUNT
            const isPendingDelete = pendingTeamsDeleteKey === item.key
            return (
              <li
                key={item.key}
                ref={rowIdx === activeIndex ? activeItemRef : undefined}
                className={rowIdx === activeIndex ? 'palette-item active' : 'palette-item'}
                onMouseEnter={() => setActiveIndex(rowIdx)}
                onClick={() => openEditTeamsEntry(item.typeDef, item.originalIndex, item.entry)}
              >
                <span className="palette-item-text">
                  <span className="palette-item-label">{item.title}</span>
                  {item.subtitle && <span className="palette-item-sublabel">{item.subtitle}</span>}
                </span>
                <span className="config-toggle-badge" style={{ marginRight: 8 }}>
                  {item.badge}
                </span>
                <button
                  type="button"
                  className={
                    isPendingDelete
                      ? 'config-item-delete config-item-delete-confirm'
                      : 'config-item-delete'
                  }
                  title={isPendingDelete ? 'Click again to confirm delete' : 'Delete'}
                  onClick={(e) => {
                    e.stopPropagation()
                    requestTeamsItemDelete(item.typeDef, item.originalIndex, item.key)
                  }}
                >
                  {isPendingDelete ? 'Confirm?' : '✕'}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="config-footer-hints">
          <span>
            <kbd>↵</kbd> Add / Edit
          </span>
          <span>
            <kbd>Del</kbd> Delete
          </span>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> Navigate
          </span>
          <span>
            <kbd>Esc</kbd> Back to /teams
          </span>
        </div>
      </>
    )
  }

  if (level.kind === 'list') {
    return (
      <ul className={disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}>
        {filteredEntries.map(({ entry, originalIndex }, idx) => (
          <li
            key={originalIndex}
            ref={idx === activeIndex ? activeItemRef : undefined}
            className={idx === activeIndex ? 'palette-item active' : 'palette-item'}
            onMouseEnter={() => setActiveIndex(idx)}
            onClick={() => openEditEntry(level.typeDef, originalIndex)}
          >
            <span className="palette-item-text">
              <span className="palette-item-label">
                {String(entry[level.typeDef.titleField] ?? '(untitled)')}
              </span>
              {level.typeDef.subtitleField && (
                <span className="palette-item-sublabel">
                  {String(entry[level.typeDef.subtitleField] ?? '')}
                </span>
              )}
            </span>
            <button
              type="button"
              className={
                pendingDeleteIndex === originalIndex
                  ? 'config-item-delete config-item-delete-confirm'
                  : 'config-item-delete'
              }
              title={pendingDeleteIndex === originalIndex ? 'Click again to confirm delete' : 'Delete'}
              onClick={(e) => {
                e.stopPropagation()
                requestDelete(level.typeDef, originalIndex)
              }}
            >
              {pendingDeleteIndex === originalIndex ? 'Confirm?' : '✕'}
            </button>
          </li>
        ))}
        <li
          ref={activeIndex === filteredEntries.length ? activeItemRef : undefined}
          className={activeIndex === filteredEntries.length ? 'palette-item active' : 'palette-item'}
          onMouseEnter={() => setActiveIndex(filteredEntries.length)}
          onClick={() => openNewEntry(level.typeDef)}
        >
          <span className="palette-item-label">+ Add new</span>
        </li>
      </ul>
    )
  }

  if (level.kind === 'form') {
    return (
      <div className="config-form">
        {level.typeDef.fields.map((field, idx) => {
          const isTarget = level.focusFieldKey ? field.key === level.focusFieldKey : idx === 0
          const assignRef = (
            el: HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement | null
          ) => {
            if (idx === 0) firstFieldRef.current = el
            if (isTarget) targetFieldRef.current = el
          }
          return (
            <label key={field.key} className="config-field">
              <span className="config-field-label">{field.label}</span>
              {field.type === 'textarea' ? (
                <textarea
                  ref={assignRef}
                  className="config-field-input"
                  rows={3}
                  value={String(level.draft[field.key] ?? '')}
                  onChange={(e) =>
                    setLevel({
                      ...level,
                      draft: { ...level.draft, [field.key]: e.target.value }
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && e.currentTarget.value === '') {
                      e.preventDefault()
                      backOneLevel()
                    }
                  }}
                />
              ) : field.type === 'boolean' ? (
                <button
                  type="button"
                  ref={assignRef}
                  className={`config-toggle-badge config-toggle-button ${
                    Boolean(level.draft[field.key]) ? 'config-toggle-on' : 'config-toggle-off'
                  }`}
                  onClick={() =>
                    setLevel({
                      ...level,
                      draft: { ...level.draft, [field.key]: !Boolean(level.draft[field.key]) }
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault()
                      setLevel({
                        ...level,
                        draft: { ...level.draft, [field.key]: !Boolean(level.draft[field.key]) }
                      })
                    }
                  }}
                >
                  {Boolean(level.draft[field.key]) ? 'Enabled' : 'Disabled'}
                </button>
              ) : (
                <input
                  ref={assignRef}
                  type={field.type === 'number' ? 'number' : 'text'}
                  className="config-field-input"
                  value={String(level.draft[field.key] ?? '')}
                  onChange={(e) =>
                    setLevel({
                      ...level,
                      draft: {
                        ...level.draft,
                        [field.key]:
                          field.type === 'number' ? Number(e.target.value) : e.target.value
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
                      void saveDraft()
                    }
                  }}
                />
              )}
            </label>
          )
        })}
        <div className="config-form-actions">
          <button
            type="button"
            className="config-btn config-btn-primary"
            onClick={() => void saveDraft()}
          >
            Save
          </button>
          {level.index !== null && !level.typeDef.singleton && (
            <button
              type="button"
              className={
                pendingDeleteIndex === level.index
                  ? 'config-btn config-btn-danger config-btn-danger-confirm'
                  : 'config-btn config-btn-danger'
              }
              onClick={async () => {
                if (pendingDeleteIndex === level.index) {
                  if (level.returnToTeamsManager) {
                    await deleteTeamsItemAt(level.typeDef, level.index as number)
                    setLevel({ kind: 'teamsManager' })
                  } else {
                    await deleteEntryAt(level.typeDef, level.index as number)
                    setLevel({ kind: 'list', typeDef: level.typeDef })
                  }
                  return
                }
                requestDelete(level.typeDef, level.index as number)
              }}
            >
              {pendingDeleteIndex === level.index ? 'Confirm delete?' : 'Delete'}
            </button>
          )}
        </div>
      </div>
    )
  }

  return null
}
