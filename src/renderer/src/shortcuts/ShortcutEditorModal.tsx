import type { ShortcutActionType, ShortcutOverlayItem, ShortcutsOverlayData } from '../../../shared/types'
import { QUICK_ICONS } from './shortcutConstants'

export interface ShortcutEditorModalProps {
  editingItem: ShortcutOverlayItem
  setEditingItem: (item: ShortcutOverlayItem | null) => void
  isRecordingKeys: boolean
  setIsRecordingKeys: (fn: boolean | ((prev: boolean) => boolean)) => void
  tabs: ShortcutsOverlayData['tabs']
  handleSaveShortcut: () => void
}

export function ShortcutEditorModal({
  editingItem,
  setEditingItem,
  isRecordingKeys,
  setIsRecordingKeys,
  tabs,
  handleSaveShortcut
}: ShortcutEditorModalProps): JSX.Element {
  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
          {editingItem.isBuiltIn ? `Customize Built-in Shortcut` : `Configure Shortcut`}
        </span>
        <button
          type="button"
          onClick={() => {
            setIsRecordingKeys(false)
            setEditingItem(null)
          }}
          style={{
            padding: '3px 9px',
            fontSize: 11,
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.04)',
            color: '#cbd5e1',
            cursor: 'pointer'
          }}
        >
          ✕ Close
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr 140px', gap: 8 }}>
        <div>
          <label style={{ fontSize: 10.5, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
            Icon
          </label>
          <input
            type="text"
            value={editingItem.icon}
            onChange={(e) => setEditingItem({ ...editingItem, icon: e.target.value })}
            style={{
              width: '100%',
              textAlign: 'center',
              padding: '6px',
              fontSize: 14,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'rgba(0,0,0,0.3)',
              color: '#f8fafc'
            }}
          />
        </div>

        <div>
          <label style={{ fontSize: 10.5, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
            Shortcut Name / Label
          </label>
          <input
            type="text"
            placeholder="e.g. Color Picker, Restart API, Snap Left..."
            value={editingItem.label}
            onChange={(e) => setEditingItem({ ...editingItem, label: e.target.value })}
            style={{
              width: '100%',
              padding: '7px 10px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'rgba(0,0,0,0.3)',
              color: '#f8fafc'
            }}
          />
        </div>

        <div>
          <label style={{ fontSize: 10.5, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
            Tab Category
          </label>
          <input
            type="text"
            list="shortcut-tabs-list"
            value={editingItem.tab}
            onChange={(e) => setEditingItem({ ...editingItem, tab: e.target.value })}
            placeholder="powertoys, docker..."
            style={{
              width: '100%',
              padding: '7px 10px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'rgba(0,0,0,0.3)',
              color: '#f8fafc'
            }}
          />
          <datalist id="shortcut-tabs-list">
            {tabs
              .filter((t) => t.id !== 'favorites')
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
          </datalist>
        </div>
      </div>

      {/* Quick Icon Picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: '#64748b', marginRight: 4 }}>Quick Icons:</span>
        {QUICK_ICONS.map((ic) => (
          <button
            key={ic}
            type="button"
            onClick={() => setEditingItem({ ...editingItem, icon: ic })}
            style={{
              padding: '2px 6px',
              fontSize: 12,
              borderRadius: 5,
              border:
                editingItem.icon === ic
                  ? '1px solid rgba(56, 189, 248, 0.5)'
                  : '1px solid rgba(255,255,255,0.08)',
              background:
                editingItem.icon === ic
                  ? 'rgba(56, 189, 248, 0.2)'
                  : 'rgba(255,255,255,0.03)',
              cursor: 'pointer'
            }}
          >
            {ic}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 8 }}>
        <div>
          <label style={{ fontSize: 10.5, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
            Keyboard Combination Badge (e.g. Win+Shift+C, Ctrl+Shift+P)
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              placeholder="Win+Shift+C or Alt+D P"
              value={editingItem.keys}
              onChange={(e) => {
                const val = e.target.value
                setEditingItem({
                  ...editingItem,
                  keys: val,
                  actionPayload:
                    editingItem.actionType === 'hotkey' &&
                    (!editingItem.actionPayload || editingItem.actionPayload === editingItem.keys)
                      ? val
                      : editingItem.actionPayload
                })
              }}
              style={{
                flex: 1,
                padding: '7px 10px',
                fontSize: 12,
                fontFamily: '"Cascadia Mono", Consolas, monospace',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.16)',
                background: 'rgba(0,0,0,0.3)',
                color: '#f8fafc'
              }}
            />
            <button
              type="button"
              onClick={() => setIsRecordingKeys((v) => !v)}
              style={{
                padding: '6px 10px',
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 6,
                border: isRecordingKeys
                  ? '1px solid rgba(244, 63, 94, 0.6)'
                  : '1px solid rgba(56, 189, 248, 0.35)',
                background: isRecordingKeys
                  ? 'rgba(244, 63, 94, 0.22)'
                  : 'rgba(56, 189, 248, 0.14)',
                color: isRecordingKeys ? '#fda4af' : '#38bdf8',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {isRecordingKeys ? '🔴 Press Keys...' : '🎹 Record Keys'}
            </button>
          </div>
        </div>

        <div>
          <label style={{ fontSize: 10.5, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
            Click Execution Action
          </label>
          <select
            value={editingItem.actionType}
            onChange={(e) =>
              setEditingItem({
                ...editingItem,
                actionType: e.target.value as ShortcutActionType
              })
            }
            style={{
              width: '100%',
              padding: '7px 8px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.16)',
              background: '#0f172a',
              color: '#f8fafc'
            }}
          >
            <option value="hotkey">⌨️ Simulate Keystroke</option>
            <option value="terminal">&gt;_ Run in PowerShell Terminal</option>
            <option value="powershell">⚡ Background PowerShell</option>
            <option value="open">🚀 Launch App / File / URL</option>
            <option value="sudolaunch">⌘ SudoLaunch Module</option>
            <option value="powertoys">🧰 PowerToys Tool</option>
          </select>
        </div>
      </div>

      <div>
        <label style={{ fontSize: 10.5, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
          {editingItem.actionType === 'hotkey'
            ? 'Key Combination to Send (e.g. Win+Shift+C, Ctrl+Shift+P, Win+.)'
            : editingItem.actionType === 'terminal' || editingItem.actionType === 'powershell'
              ? 'PowerShell / CLI Command to Execute'
              : editingItem.actionType === 'open'
                ? 'Executable Path, Folder, ms-settings: URI, or https:// URL'
                : 'SudoLaunch Module (bar, term, system, git, focus, notify, settings)'}
        </label>
        <input
          type="text"
          value={editingItem.actionPayload}
          onChange={(e) => setEditingItem({ ...editingItem, actionPayload: e.target.value })}
          placeholder={
            editingItem.actionType === 'hotkey'
              ? editingItem.keys || 'Win+Shift+C'
              : 'docker compose up -d'
          }
          style={{
            width: '100%',
            padding: '7px 10px',
            fontSize: 12,
            fontFamily: '"Cascadia Mono", Consolas, monospace',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.16)',
            background: 'rgba(0,0,0,0.3)',
            color: '#f8fafc'
          }}
        />
      </div>

      <div>
        <label style={{ fontSize: 10.5, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
          Description
        </label>
        <input
          type="text"
          value={editingItem.description}
          onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
          placeholder="Short description of what this shortcut does..."
          style={{
            width: '100%',
            padding: '7px 10px',
            fontSize: 12,
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.16)',
            background: 'rgba(0,0,0,0.3)',
            color: '#f8fafc'
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 4
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: '#cbd5e1',
              cursor: 'pointer'
            }}
          >
            <input
              type="checkbox"
              checked={Boolean(editingItem.favorite)}
              onChange={(e) => setEditingItem({ ...editingItem, favorite: e.target.checked })}
            />
            <span>⭐ Show in Favorites Tab</span>
          </label>

          {editingItem.actionType === 'powershell' && (
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: '#fcd34d',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={Boolean(editingItem.elevated)}
                onChange={(e) => setEditingItem({ ...editingItem, elevated: e.target.checked })}
              />
              <span>🛡️ Run as Administrator (UAC)</span>
            </label>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => setEditingItem(null)}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.04)',
              color: '#cbd5e1',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveShortcut}
            style={{
              padding: '6px 16px',
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 6,
              border: '1px solid rgba(56, 189, 248, 0.5)',
              background: 'rgba(56, 189, 248, 0.22)',
              color: '#38bdf8',
              cursor: 'pointer'
            }}
          >
            💾 Save Shortcut
          </button>
        </div>
      </div>
    </div>
  )
}
