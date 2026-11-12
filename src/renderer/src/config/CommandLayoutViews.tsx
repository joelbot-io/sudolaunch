import type { RefObject } from 'react'
import { DEFAULT_COMMAND_LAYOUT, type CommandLayout } from '../../../shared/types'
import {
  COMMAND_LAYOUT_ACTION_COUNT,
  FOLDER_EDIT_ACTION_COUNT,
  type Level
} from './configSettingsDefinitions'

export interface CommandLayoutViewsProps {
  level: Level
  setLevel: (level: Level) => void
  disableMouseInput: boolean
  activeIndex: number
  setActiveIndex: (idx: number) => void
  activeItemRef: RefObject<HTMLLIElement>
  layout: CommandLayout
  saveLayout: (next: CommandLayout) => void
  filteredRootItems: string[]
  filteredFolderCommands: string[]
  allAvailableCommands: string[]
  getCommandDescription: (cmdName: string) => string
  moveRootItem: (idx: number, delta: -1 | 1) => void
  moveFolderCommand: (folderId: string, idx: number, delta: -1 | 1) => void
  removeCommandFromFolder: (folderId: string, cmdName: string) => void
  addCommandToFolder: (folderId: string, cmdName: string) => void
  deleteFolder: (folderId: string) => void
  newFolderName: string
  setNewFolderName: (val: string) => void
  newFolderIcon: string
  setNewFolderIcon: (val: string) => void
  createNewFolder: (name: string, icon: string) => void
}

export function CommandLayoutViews({
  level,
  setLevel,
  disableMouseInput,
  activeIndex,
  setActiveIndex,
  activeItemRef,
  layout,
  saveLayout,
  filteredRootItems,
  filteredFolderCommands,
  allAvailableCommands,
  getCommandDescription,
  moveRootItem,
  moveFolderCommand,
  removeCommandFromFolder,
  addCommandToFolder,
  deleteFolder,
  newFolderName,
  setNewFolderName,
  newFolderIcon,
  setNewFolderIcon,
  createNewFolder
}: CommandLayoutViewsProps): JSX.Element | null {
  if (level.kind === 'commandLayout') {
    return (
      <ul className={disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}>
        <li
          ref={activeIndex === 0 ? activeItemRef : undefined}
          className={activeIndex === 0 ? 'palette-item active' : 'palette-item'}
          onMouseEnter={() => setActiveIndex(0)}
          onClick={() => setLevel({ kind: 'newFolder' })}
        >
          <span className="palette-item-label">+ Create New Folder</span>
        </li>
        <li
          ref={activeIndex === 1 ? activeItemRef : undefined}
          className={activeIndex === 1 ? 'palette-item active' : 'palette-item'}
          onMouseEnter={() => setActiveIndex(1)}
          onClick={() => window.api.openCommandLayoutFile()}
        >
          <span className="palette-item-text">
            <span className="palette-item-label">📄 Open command-layout.json</span>
            <span className="palette-item-sublabel">Open raw configuration in text editor</span>
          </span>
        </li>
        <li
          ref={activeIndex === 2 ? activeItemRef : undefined}
          className={activeIndex === 2 ? 'palette-item active' : 'palette-item'}
          onMouseEnter={() => setActiveIndex(2)}
          onClick={() => saveLayout(JSON.parse(JSON.stringify(DEFAULT_COMMAND_LAYOUT)))}
        >
          <span className="palette-item-text">
            <span className="palette-item-label">↺ Reset Layout to Defaults</span>
            <span className="palette-item-sublabel">Restore default folders and order</span>
          </span>
        </li>
        {filteredRootItems.length === 0 && (
          <li className="palette-empty">No matching commands or folders</li>
        )}
        {filteredRootItems.map((item: string, idx: number) => {
          const folder = layout.folders.find((f) => f.id === item)
          const realIdx = layout.rootOrder.indexOf(item)
          const itemIdx = idx + COMMAND_LAYOUT_ACTION_COUNT
          const isActive = itemIdx === activeIndex
          if (folder) {
            return (
              <li
                key={folder.id}
                ref={isActive ? activeItemRef : undefined}
                className={isActive ? 'palette-item active' : 'palette-item'}
                onMouseEnter={() => setActiveIndex(itemIdx)}
                onClick={() => setLevel({ kind: 'folderEdit', folderId: folder.id })}
              >
                <span className="palette-item-text">
                  <span className="palette-item-label">
                    {folder.icon ?? '📁'} {folder.name}
                  </span>
                  <span className="palette-item-sublabel">
                    Folder ({folder.commands.length} commands) ·{' '}
                    {folder.commands
                      .slice(0, 4)
                      .map((c) => '/' + c)
                      .join(', ')}
                    {folder.commands.length > 4 ? '...' : ''}
                  </span>
                </span>
                <div className="config-item-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="config-action-btn"
                    title="Move Up (Alt+Up)"
                    disabled={realIdx === 0}
                    onClick={() => moveRootItem(realIdx, -1)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="config-action-btn"
                    title="Move Down (Alt+Down)"
                    disabled={realIdx === layout.rootOrder.length - 1}
                    onClick={() => moveRootItem(realIdx, 1)}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="config-action-btn"
                    title="Edit Folder"
                    onClick={() => setLevel({ kind: 'folderEdit', folderId: folder.id })}
                  >
                    Edit
                  </button>
                </div>
              </li>
            )
          }
          return (
            <li
              key={item}
              ref={isActive ? activeItemRef : undefined}
              className={isActive ? 'palette-item active' : 'palette-item'}
              onMouseEnter={() => setActiveIndex(itemIdx)}
              onClick={() => setLevel({ kind: 'commandAssignFolder', commandName: item })}
            >
              <span className="palette-item-text">
                <span className="palette-item-label">/{item}</span>
                <span className="palette-item-sublabel">{getCommandDescription(item)}</span>
              </span>
              <div className="config-item-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="config-action-btn"
                  title="Move Up (Alt+Up)"
                  disabled={realIdx === 0}
                  onClick={() => moveRootItem(realIdx, -1)}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="config-action-btn"
                  title="Move Down (Alt+Down)"
                  disabled={realIdx === layout.rootOrder.length - 1}
                  onClick={() => moveRootItem(realIdx, 1)}
                >
                  ▼
                </button>
                <button
                  type="button"
                  className="config-action-btn"
                  title="Move into Folder"
                  onClick={() => setLevel({ kind: 'commandAssignFolder', commandName: item })}
                >
                  Move to...
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    )
  }

  if (level.kind === 'folderEdit') {
    const folder = layout.folders.find((f) => f.id === level.folderId)
    if (!folder) return <div className="palette-empty">Folder not found</div>
    return (
      <ul className={disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}>
        <li
          ref={activeIndex === 0 ? activeItemRef : undefined}
          className={activeIndex === 0 ? 'palette-item active' : 'palette-item'}
          onMouseEnter={() => setActiveIndex(0)}
          onClick={() => setLevel({ kind: 'commandLayout' })}
        >
          <span className="palette-item-label">← Back to Command Layout</span>
        </li>
        <li
          ref={activeIndex === 1 ? activeItemRef : undefined}
          className={activeIndex === 1 ? 'palette-item active' : 'palette-item'}
          onMouseEnter={() => setActiveIndex(1)}
          onClick={() => setLevel({ kind: 'folderAddCommand', folderId: level.folderId })}
        >
          <span className="palette-item-label">+ Add Command to this Folder</span>
        </li>
        <li
          ref={activeIndex === 2 ? activeItemRef : undefined}
          className={activeIndex === 2 ? 'palette-item active' : 'palette-item'}
          onMouseEnter={() => setActiveIndex(2)}
          onClick={() => deleteFolder(level.folderId)}
        >
          <span className="palette-item-label" style={{ color: '#ff6b5b' }}>
            ✕ Dissolve Folder (Move commands to Root)
          </span>
        </li>
        {filteredFolderCommands.length === 0 && (
          <li className="palette-empty">This folder is empty. Click above to add commands.</li>
        )}
        {filteredFolderCommands.map((cmd: string, idx: number) => {
          const realIdx = folder.commands.indexOf(cmd)
          const itemIdx = idx + FOLDER_EDIT_ACTION_COUNT
          const isActive = itemIdx === activeIndex
          return (
            <li
              key={cmd}
              ref={isActive ? activeItemRef : undefined}
              className={isActive ? 'palette-item active' : 'palette-item'}
              onMouseEnter={() => setActiveIndex(itemIdx)}
            >
              <span className="palette-item-text">
                <span className="palette-item-label">/{cmd}</span>
                <span className="palette-item-sublabel">{getCommandDescription(cmd)}</span>
              </span>
              <div className="config-item-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="config-action-btn"
                  title="Move Up (Alt+Up)"
                  disabled={realIdx === 0}
                  onClick={() => moveFolderCommand(level.folderId, realIdx, -1)}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="config-action-btn"
                  title="Move Down (Alt+Down)"
                  disabled={realIdx === folder.commands.length - 1}
                  onClick={() => moveFolderCommand(level.folderId, realIdx, 1)}
                >
                  ▼
                </button>
                <button
                  type="button"
                  className="config-action-btn"
                  title="Remove from Folder"
                  onClick={() => removeCommandFromFolder(level.folderId, cmd)}
                >
                  Remove
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    )
  }

  if (level.kind === 'folderAddCommand') {
    return (
      <ul className={disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}>
        <li className="palette-item" style={{ opacity: 0.8, cursor: 'default' }}>
          <span className="palette-item-text">
            <span className="palette-item-label">Pick a command to add to folder:</span>
          </span>
        </li>
        {allAvailableCommands
          .filter((cmd: string) => {
            const currentFolder = layout.folders.find((f) => f.id === level.folderId)
            return currentFolder && !currentFolder.commands.includes(cmd)
          })
          .map((cmd: string, idx: number) => (
            <li
              key={cmd}
              ref={idx === activeIndex ? activeItemRef : undefined}
              className={idx === activeIndex ? 'palette-item active' : 'palette-item'}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => {
                addCommandToFolder(level.folderId, cmd)
                setLevel({ kind: 'folderEdit', folderId: level.folderId })
              }}
            >
              <span className="palette-item-text">
                <span className="palette-item-label">/{cmd}</span>
                <span className="palette-item-sublabel">{getCommandDescription(cmd)}</span>
              </span>
              <span className="config-toggle-badge config-toggle-off">+ Add</span>
            </li>
          ))}
      </ul>
    )
  }

  if (level.kind === 'commandAssignFolder') {
    return (
      <ul className={disableMouseInput ? 'palette-list ignore-mouse' : 'palette-list'}>
        <li className="palette-item" style={{ opacity: 0.8, cursor: 'default' }}>
          <span className="palette-item-text">
            <span className="palette-item-label">Move /{level.commandName} into:</span>
          </span>
        </li>
        <li
          ref={activeIndex === 0 ? activeItemRef : undefined}
          className={activeIndex === 0 ? 'palette-item active' : 'palette-item'}
          onMouseEnter={() => setActiveIndex(0)}
          onClick={() => {
            const nextFolders = layout.folders.map((f) => ({
              ...f,
              commands: f.commands.filter((c) => c !== level.commandName)
            }))
            const nextRoot = layout.rootOrder.includes(level.commandName)
              ? layout.rootOrder
              : [...layout.rootOrder, level.commandName]
            saveLayout({ ...layout, folders: nextFolders, rootOrder: nextRoot })
            setLevel({ kind: 'commandLayout' })
          }}
        >
          <span className="palette-item-text">
            <span className="palette-item-label">🏠 Root Level</span>
            <span className="palette-item-sublabel">Keep command outside of any folder</span>
          </span>
        </li>
        {layout.folders.map((f, fIdx) => {
          const itemIdx = fIdx + 1
          const isInThisFolder = f.commands.includes(level.commandName)
          return (
            <li
              key={f.id}
              ref={itemIdx === activeIndex ? activeItemRef : undefined}
              className={itemIdx === activeIndex ? 'palette-item active' : 'palette-item'}
              onMouseEnter={() => setActiveIndex(itemIdx)}
              onClick={() => {
                addCommandToFolder(f.id, level.commandName)
                setLevel({ kind: 'commandLayout' })
              }}
            >
              <span className="palette-item-text">
                <span className="palette-item-label">
                  {f.icon ?? '📁'} {f.name}
                </span>
                <span className="palette-item-sublabel">{f.commands.length} commands</span>
              </span>
              {isInThisFolder && (
                <span className="config-toggle-badge config-toggle-on">Current</span>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  if (level.kind === 'newFolder') {
    return (
      <div className="config-form">
        <label className="config-field">
          <span className="config-field-label">Folder Name</span>
          <input
            autoFocus
            className="config-field-input"
            placeholder="e.g. Work, Dev, Personal..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                createNewFolder(newFolderName, newFolderIcon)
              }
            }}
          />
        </label>
        <label className="config-field">
          <span className="config-field-label">Icon / Emoji</span>
          <input
            className="config-field-input"
            placeholder="📁, ⚡, 💬, 🛠️, 🚀..."
            value={newFolderIcon}
            onChange={(e) => setNewFolderIcon(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                createNewFolder(newFolderName, newFolderIcon)
              }
            }}
          />
        </label>
        <div className="config-form-actions">
          <button
            type="button"
            className="config-btn config-btn-primary"
            onClick={() => createNewFolder(newFolderName, newFolderIcon)}
          >
            Create Folder
          </button>
          <button
            type="button"
            className="config-btn"
            onClick={() => setLevel({ kind: 'commandLayout' })}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return null
}
