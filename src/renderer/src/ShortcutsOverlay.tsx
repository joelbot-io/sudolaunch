import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type {
  ShortcutOverlayItem,
  ShortcutsOverlayData
} from '../../shared/types'
import { useGrowAnimation } from './useGrowAnimation'
import { ACTION_TYPE_BADGES, QUICK_ICONS, renderKeycaps } from './shortcuts/shortcutConstants'
import { ShortcutEditorModal } from './shortcuts/ShortcutEditorModal'
import { DockerContainersControlCenter } from './shortcuts/DockerContainersControlCenter'

export default function ShortcutsOverlay(): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [data, setData] = useState<ShortcutsOverlayData | null>(null)
  const [activeTab, setActiveTab] = useState<string>('favorites')
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [searchAllTabs, setSearchAllTabs] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [statusToast, setStatusToast] = useState<{ ok: boolean; text: string } | null>(null)
  const [dockGlowColor, setDockGlowColor] = useState<string>('')
  const [refreshingOverlay, setRefreshingOverlay] = useState(false)
  const [busyDockerAction, setBusyDockerAction] = useState<string | null>(null)

  // Add / Edit Shortcut Modal State
  const [editingItem, setEditingItem] = useState<ShortcutOverlayItem | null>(null)
  const [isRecordingKeys, setIsRecordingKeys] = useState(false)

  // Add Custom Tab Modal State
  const [addingTab, setAddingTab] = useState(false)
  const [newTabLabel, setNewTabLabel] = useState('')
  const [newTabIcon, setNewTabIcon] = useState('🗂️')

  const { growPhase, setGrowOrigin, setGrowPhase, growClassNames, growStyle, onGrowEnd } =
    useGrowAnimation()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const activeRowRef = useRef<HTMLDivElement>(null)

  const flashToast = useCallback((ok: boolean, text: string) => {
    setStatusToast({ ok, text })
    setTimeout(() => {
      setStatusToast((curr) => (curr?.text === text ? null : curr))
    }, 2800)
  }, [])

  const refreshData = useCallback(() => {
    setRefreshingOverlay(true)
    window.api
      .getShortcutsOverlayData?.()
      .then((res) => {
        if (res) setData(res)
      })
      .finally(() => {
        setRefreshingOverlay(false)
      })
  }, [])

  useEffect(() => {
    const loadSettings = (): void => {
      window.api.getSettings?.().then((s) => {
        if (typeof s?.dockGlowColor === 'string') setDockGlowColor(s.dockGlowColor.trim())
      })
    }
    loadSettings()
    refreshData()

    const unregConfig = window.api.onConfigChanged?.(() => {
      loadSettings()
      refreshData()
    })

    let pendingExpanded: boolean | null = null
    const unregExpanded = window.api.onShortcutsExpanded?.((isExp) => {
      pendingExpanded = isExp
      flushSync(() => setExpanded(isExp))
      if (isExp) {
        refreshData()
      }
    })

    const unregGrow = window.api.onShortcutsGrowOrigin?.((origin) => {
      flushSync(() => {
        if (pendingExpanded !== null) setExpanded(pendingExpanded)
        setGrowOrigin(origin)
        setGrowPhase('pending')
      })
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.api.shortcutsReady?.()
        })
      })
    })

    const unregCollapsing = window.api.onShortcutsCollapsing?.((origin) => {
      setGrowOrigin(origin)
      setGrowPhase('collapsing')
    })

    const unregSelectTab = window.api.onShortcutsSelectTab?.((tabId) => {
      if (tabId) {
        setActiveTab(tabId.toLowerCase())
        setSelectedIndex(0)
      }
    })

    return () => {
      unregConfig?.()
      unregExpanded?.()
      unregGrow?.()
      unregCollapsing?.()
      unregSelectTab?.()
    }
  }, [refreshData, setGrowOrigin, setGrowPhase])

  useEffect(() => {
    if (growPhase !== 'running') return
    const timer = setTimeout(() => {
      setGrowPhase(null)
      setGrowOrigin(null)
    }, 250)
    return () => clearTimeout(timer)
  }, [growPhase, setGrowOrigin, setGrowPhase])

  const tabs = useMemo(() => data?.tabs ?? [], [data])

  const filteredItems = useMemo(() => {
    const items = data?.items ?? []
    const q = deferredSearchQuery.trim().toLowerCase()

    return items.filter((item) => {
      const matchesTab =
        (q && searchAllTabs) ||
        (activeTab === 'favorites'
          ? Boolean(item.favorite || item.tab === 'favorites')
          : item.tab.toLowerCase() === activeTab.toLowerCase())

      if (!matchesTab) return false
      if (!q) return true

      return (
        item.label.toLowerCase().includes(q) ||
        item.keys.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.tab.toLowerCase().includes(q) ||
        item.actionPayload.toLowerCase().includes(q)
      )
    })
  }, [data, activeTab, deferredSearchQuery, searchAllTabs])

  useEffect(() => {
    setSelectedIndex((prev) => {
      if (filteredItems.length === 0) return 0
      return Math.min(prev, Math.max(0, filteredItems.length - 1))
    })
  }, [filteredItems.length, activeTab])

  useEffect(() => {
    if (activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedIndex])

  const handleExecute = useCallback(
    async (item: ShortcutOverlayItem, elevated?: boolean) => {
      const res = await window.api.executeShortcutItem?.(item, elevated)
      if (res) {
        flashToast(res.ok, res.message)
      }
    },
    [flashToast]
  )

  const handleToggleFavorite = useCallback(
    async (e: React.MouseEvent | null, id: string) => {
      e?.stopPropagation()
      const next = await window.api.toggleShortcutFavorite?.(id)
      if (next) setData(next)
    },
    []
  )

  // Key recorder inside the Add/Edit modal
  useEffect(() => {
    if (!isRecordingKeys || !editingItem) return

    function onRecordKeyDown(e: KeyboardEvent): void {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        setIsRecordingKeys(false)
        return
      }

      const modOnly = ['Control', 'Shift', 'Alt', 'Meta', 'OS'].includes(e.key)
      if (modOnly) return

      const parts: string[] = []
      if (e.metaKey) parts.push('Win')
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')

      let keyName = e.key
      if (keyName === ' ') keyName = 'Space'
      else if (keyName === 'ArrowLeft') keyName = 'Left'
      else if (keyName === 'ArrowRight') keyName = 'Right'
      else if (keyName === 'ArrowUp') keyName = 'Up'
      else if (keyName === 'ArrowDown') keyName = 'Down'
      else if (keyName.length === 1) keyName = keyName.toUpperCase()

      parts.push(keyName)
      const combo = parts.join('+')

      setEditingItem((prev) =>
        prev
          ? {
              ...prev,
              keys: combo,
              actionPayload:
                prev.actionType === 'hotkey' && (!prev.actionPayload || prev.actionPayload === prev.keys)
                  ? combo
                  : prev.actionPayload
            }
          : null
      )
      setIsRecordingKeys(false)
    }

    window.addEventListener('keydown', onRecordKeyDown, true)
    return () => window.removeEventListener('keydown', onRecordKeyDown, true)
  }, [isRecordingKeys, editingItem])

  // Keyboard navigation for the overlay
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (!expanded || editingItem || addingTab) return

      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      const inInput = tag === 'input' || tag === 'textarea' || tag === 'select'

      if (e.key === 'Escape') {
        e.preventDefault()
        if (searchQuery) {
          setSearchQuery('')
          return
        }
        window.api.shortcutsToggle?.()
        return
      }

      if (e.key === 'Tab' && tabs.length > 0) {
        e.preventDefault()
        const curIdx = tabs.findIndex((t) => t.id === activeTab)
        const nextIdx = e.shiftKey
          ? (curIdx - 1 + tabs.length) % tabs.length
          : (curIdx + 1) % tabs.length
        setActiveTab(tabs[nextIdx].id)
        setSelectedIndex(0)
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (filteredItems.length > 0) {
          setSelectedIndex((i) => (i + 1) % filteredItems.length)
        }
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (filteredItems.length > 0) {
          setSelectedIndex((i) => (i - 1 + filteredItems.length) % filteredItems.length)
        }
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        const item = filteredItems[selectedIndex]
        if (item) {
          handleExecute(item, e.ctrlKey || e.metaKey)
        }
        return
      }

      if (!inInput && (e.key === 'f' || e.key === 'F' || e.key === '*')) {
        const item = filteredItems[selectedIndex]
        if (item) {
          e.preventDefault()
          handleToggleFavorite(null, item.id)
        }
        return
      }

      if (!inInput && e.key === '/') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    expanded,
    editingItem,
    addingTab,
    searchQuery,
    tabs,
    activeTab,
    filteredItems,
    selectedIndex,
    handleExecute,
    handleToggleFavorite
  ])

  function openNewShortcutModal(): void {
    const defaultTab = activeTab === 'favorites' ? 'custom' : activeTab
    setEditingItem({
      id: `sc-${Date.now()}`,
      label: '',
      description: '',
      tab: defaultTab,
      icon: '⚡',
      keys: '',
      actionType: 'hotkey',
      actionPayload: '',
      elevated: false,
      favorite: activeTab === 'favorites',
      isBuiltIn: false
    })
  }

  async function handleSaveShortcut(): Promise<void> {
    if (!editingItem) return
    if (!editingItem.label.trim()) {
      flashToast(false, 'Shortcut title is required')
      return
    }
    const payload =
      editingItem.actionPayload.trim() ||
      (editingItem.actionType === 'hotkey' ? editingItem.keys.trim() : '')
    if (!payload) {
      flashToast(false, 'Shortcut key combination or command payload is required')
      return
    }
    const next = await window.api.saveShortcutItem?.({
      ...editingItem,
      actionPayload: payload
    })
    if (next) {
      setData(next)
      flashToast(true, `Saved shortcut "${editingItem.label}"`)
    }
    setEditingItem(null)
  }

  async function handleDeleteShortcut(e: React.MouseEvent, item: ShortcutOverlayItem): Promise<void> {
    e.stopPropagation()
    const next = await window.api.deleteShortcutItem?.(item.id)
    if (next) {
      setData(next)
      flashToast(true, item.isBuiltIn ? `Hidden "${item.label}"` : `Deleted "${item.label}"`)
    }
  }

  async function handleAddCustomTab(): Promise<void> {
    if (!newTabLabel.trim()) return
    const next = await window.api.addShortcutCustomTab?.(newTabLabel.trim(), newTabIcon)
    if (next) {
      setData(next)
      const createdId = newTabLabel.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-')
      setActiveTab(createdId)
      flashToast(true, `Created tab "${newTabLabel.trim()}"`)
    }
    setNewTabLabel('')
    setAddingTab(false)
  }

  async function handleDockerContainerAction(
    containerName: string,
    action: 'start' | 'stop' | 'restart' | 'shell' | 'logs' | 'inspect' | 'rm'
  ): Promise<void> {
    const actionKey = `${containerName}:${action}`
    setBusyDockerAction(actionKey)
    try {
      const res = await window.api.runDockerShortcutContainerAction?.(containerName, action)
      if (res) {
        setData(res.data)
        flashToast(res.ok, res.message)
      }
    } finally {
      setBusyDockerAction(null)
    }
  }

  function startResizeDrag(
    e: React.MouseEvent,
    direction: 'both' | 'width' | 'height' = 'both'
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.screenX
    const startY = e.screenY
    const startW = window.innerWidth
    const startH = window.innerHeight
    let rafId: number | null = null

    function onMouseMove(ev: MouseEvent): void {
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const nextW = direction === 'height' ? startW : startW + (ev.screenX - startX)
        const nextH = direction === 'width' ? startH : startH + (ev.screenY - startY)
        window.api.resizeShortcutsWindow?.(nextW, nextH)
      })
    }

    function onMouseUp(): void {
      if (rafId !== null) cancelAnimationFrame(rafId)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      refreshData()
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div
      className={['term-shell', expanded ? 'term-expanded' : 'term-collapsed', growClassNames]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          ...growStyle,
          position: 'relative',
          ...(dockGlowColor ? { '--dock-glow-color': dockGlowColor } : {}),
          ...(data?.grayscale ? { filter: 'grayscale(100%)' } : {})
        } as React.CSSProperties
      }
      onAnimationEnd={onGrowEnd}
    >
      {/* PowerShell-style Draggable Header */}
      <div className="term-header" title="Drag to move Shortcuts Overlay window">
        <div className="term-header-left">
          <span className="term-drag-handle" title="Drag to move window">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="6" r="2" />
              <circle cx="12" cy="6" r="2" />
              <circle cx="19" cy="6" r="2" />
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
              <circle cx="5" cy="18" r="2" />
              <circle cx="12" cy="18" r="2" />
              <circle cx="19" cy="18" r="2" />
            </svg>
          </span>
          <span className="term-header-label">Shortcuts Overlay</span>
          <span
            style={{
              fontSize: 10,
              padding: '1px 7px',
              borderRadius: 999,
              background: 'rgba(90, 160, 255, 0.14)',
              border: '1px solid rgba(90, 160, 255, 0.28)',
              color: '#93c5fd',
              fontWeight: 600
            }}
          >
            {filteredItems.length} shortcuts
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            WebkitAppRegion: 'no-drag'
          } as React.CSSProperties}
        >
          <button
            type="button"
            onClick={() => {
              const nextStayOpen = !(data?.stayOpen ?? true)
              window.api.setShortcutsStayOpen?.(nextStayOpen).then((res) => {
                if (res) setData(res)
              })
            }}
            title={
              data?.stayOpen !== false
                ? 'Pinned Open: Overlay stays visible after clicking a shortcut (click to switch to Auto-Close)'
                : 'Auto-Close: Overlay collapses after clicking a shortcut (click to Pin Open)'
            }
            style={{
              padding: '3px 8px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              border:
                data?.stayOpen !== false
                  ? '1px solid rgba(16, 185, 129, 0.35)'
                  : '1px solid rgba(255, 255, 255, 0.12)',
              background:
                data?.stayOpen !== false
                  ? 'rgba(16, 185, 129, 0.14)'
                  : 'rgba(255, 255, 255, 0.04)',
              color: data?.stayOpen !== false ? '#34d399' : '#94a3b8',
              cursor: 'pointer'
            }}
          >
            {data?.stayOpen !== false ? '📌 Stay Open' : '⚡ Auto-Close'}
          </button>

          <button
            type="button"
            onClick={() => {
              const nextGray = !data?.grayscale
              window.api.setShortcutsGrayscale?.(nextGray).then((res) => {
                if (res) setData(res)
              })
            }}
            title={
              data?.grayscale
                ? 'Grayscale Mode Active — Click to restore full color'
                : 'Toggle Monochrome / Grayscale mode'
            }
            style={{
              padding: '3px 8px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              border: data?.grayscale
                ? '1px solid rgba(226, 232, 240, 0.45)'
                : '1px solid rgba(255, 255, 255, 0.12)',
              background: data?.grayscale
                ? 'rgba(226, 232, 240, 0.16)'
                : 'rgba(255, 255, 255, 0.04)',
              color: data?.grayscale ? '#f8fafc' : '#94a3b8',
              cursor: 'pointer'
            }}
          >
            {data?.grayscale ? '◑ Grayscale' : '🎨 Color'}
          </button>

          <button
            type="button"
            onClick={openNewShortcutModal}
            title="Create a new custom shortcut or hotkey"
            style={{
              padding: '3px 9px',
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 6,
              border: '1px solid rgba(56, 189, 248, 0.4)',
              background: 'rgba(56, 189, 248, 0.16)',
              color: '#38bdf8',
              cursor: 'pointer'
            }}
          >
            + Shortcut
          </button>

          <button
            type="button"
            onClick={() => setAddingTab((v) => !v)}
            title="Add a custom category tab"
            style={{
              padding: '3px 8px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              border: '1px solid rgba(255, 255, 255, 0.14)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#cbd5e1',
              cursor: 'pointer'
            }}
          >
            + Tab
          </button>

          <button
            type="button"
            onClick={refreshData}
            disabled={refreshingOverlay}
            title="Refresh shortcuts & Docker containers"
            style={{
              padding: '3px 7px',
              fontSize: 11,
              borderRadius: 6,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(255, 255, 255, 0.04)',
              color: '#cbd5e1',
              cursor: refreshingOverlay ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            {refreshingOverlay ? <span className="sudo-spinner sudo-spinner-sm" /> : '🔄'}
          </button>

          <button
            className="term-collapse"
            title="Collapse Shortcuts Overlay (Esc)"
            onClick={() => window.api.shortcutsToggle?.()}
            aria-label="Collapse Shortcuts Overlay"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
      </div>

      {/* Category Tabs Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '8px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(0,0,0,0.22)',
          overflowX: 'auto',
          flexShrink: 0
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab.toLowerCase() === tab.id.toLowerCase()
          return (
            <div
              key={tab.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: 7,
                border: isActive
                  ? '1px solid rgba(90, 160, 255, 0.5)'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                background: isActive
                  ? 'rgba(90, 160, 255, 0.18)'
                  : 'rgba(255, 255, 255, 0.03)',
                overflow: 'hidden',
                flexShrink: 0
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setActiveTab(tab.id)
                  setSelectedIndex(0)
                  if (tab.id.toLowerCase() === 'docker') {
                    window.api.resizeShortcutsWindow?.(1040, 720).then((res) => {
                      if (res) setData(res)
                    })
                  }
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 10px',
                  fontSize: 11.5,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#f8fafc' : '#94a3b8',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span
                  style={{
                    fontSize: 10,
                    padding: '0 5px',
                    borderRadius: 999,
                    background: isActive ? 'rgba(90,160,255,0.28)' : 'rgba(255,255,255,0.07)',
                    color: isActive ? '#e0f2fe' : '#64748b'
                  }}
                >
                  {tab.count}
                </span>
              </button>
              {tab.isCustomTab && (
                <button
                  type="button"
                  title={`Delete custom tab "${tab.label}"`}
                  onClick={async (e) => {
                    e.stopPropagation()
                    const next = await window.api.deleteShortcutCustomTab?.(tab.id)
                    if (next) {
                      setData(next)
                      if (activeTab === tab.id) setActiveTab('favorites')
                    }
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#64748b',
                    padding: '4px 6px 4px 0',
                    fontSize: 11,
                    cursor: 'pointer'
                  }}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Add Custom Tab Inline Strip */}
      {addingTab && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: 'rgba(15, 23, 42, 0.85)',
            borderBottom: '1px solid rgba(56, 189, 248, 0.25)',
            flexShrink: 0
          }}
        >
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>New Tab:</span>
          <input
            type="text"
            value={newTabIcon}
            onChange={(e) => setNewTabIcon(e.target.value)}
            style={{
              width: 38,
              textAlign: 'center',
              padding: '4px 6px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'rgba(0,0,0,0.35)',
              color: '#f8fafc'
            }}
            title="Tab Icon Emoji"
          />
          <input
            type="text"
            placeholder="Tab Name (e.g. Kubernetes, Browser, Audio)..."
            value={newTabLabel}
            onChange={(e) => setNewTabLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddCustomTab()
            }}
            autoFocus
            style={{
              flex: 1,
              padding: '5px 10px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'rgba(0,0,0,0.35)',
              color: '#f8fafc',
              outline: 'none'
            }}
          />
          <button
            type="button"
            onClick={handleAddCustomTab}
            style={{
              padding: '5px 12px',
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 6,
              border: '1px solid rgba(56, 189, 248, 0.4)',
              background: 'rgba(56, 189, 248, 0.2)',
              color: '#38bdf8',
              cursor: 'pointer'
            }}
          >
            Create Tab
          </button>
          <button
            type="button"
            onClick={() => setAddingTab(false)}
            style={{
              padding: '5px 9px',
              fontSize: 11,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent',
              color: '#94a3b8',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Search / Filter Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(255,255,255,0.015)',
          flexShrink: 0
        }}
      >
        <span style={{ fontSize: 12, color: '#64748b' }}>⌕</span>
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setSelectedIndex(0)
          }}
          placeholder={`Filter ${activeTab} shortcuts or key combinations... (/ to focus)`}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#f1f5f9',
            fontSize: 12
          }}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchAllTabs((v) => !v)}
            style={{
              padding: '2px 8px',
              fontSize: 10.5,
              borderRadius: 5,
              border: searchAllTabs
                ? '1px solid rgba(56, 189, 248, 0.4)'
                : '1px solid rgba(255,255,255,0.12)',
              background: searchAllTabs ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.04)',
              color: searchAllTabs ? '#38bdf8' : '#94a3b8',
              cursor: 'pointer'
            }}
          >
            {searchAllTabs ? '🌐 All Tabs' : '📁 Current Tab'}
          </button>
        )}
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 13
            }}
          >
            ×
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            const next = await window.api.restoreDefaultShortcuts?.()
            if (next) {
              setData(next)
              flashToast(true, 'Restored default built-in shortcuts')
            }
          }}
          title="Restore any hidden or modified built-in shortcuts"
          style={{
            padding: '2px 7px',
            fontSize: 10.5,
            borderRadius: 5,
            border: '1px solid rgba(255,255,255,0.09)',
            background: 'rgba(255,255,255,0.03)',
            color: '#64748b',
            cursor: 'pointer'
          }}
        >
          ↺ Reset Built-ins
        </button>
      </div>

      {/* Status Toast Banner */}
      {statusToast && (
        <div
          style={{
            padding: '6px 12px',
            fontSize: 11.5,
            fontWeight: 600,
            background: statusToast.ok ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 68, 68, 0.18)',
            borderBottom: statusToast.ok
              ? '1px solid rgba(16, 185, 129, 0.35)'
              : '1px solid rgba(239, 68, 68, 0.35)',
            color: statusToast.ok ? '#34d399' : '#f87171',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0
          }}
        >
          <span>
            {statusToast.ok ? '✓ ' : '⚠️ '}
            {statusToast.text}
          </span>
          <button
            type="button"
            onClick={() => setStatusToast(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Main Content Area (Either Add/Edit Modal OR Shortcuts List) */}
      {editingItem ? (
        <ShortcutEditorModal
          editingItem={editingItem}
          setEditingItem={setEditingItem}
          isRecordingKeys={isRecordingKeys}
          setIsRecordingKeys={setIsRecordingKeys}
          tabs={tabs}
          handleSaveShortcut={handleSaveShortcut}
        />
      ) : (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}
        >
          {/* Live Docker Containers Control Center when on Docker tab */}
          {activeTab === 'docker' && data?.dockerAvailable && (data.dockerContainers?.length ?? 0) > 0 && (
            <DockerContainersControlCenter
              containers={data.dockerContainers}
              busyDockerAction={busyDockerAction}
              handleDockerContainerAction={handleDockerContainerAction}
            />
          )}

          {filteredItems.length === 0 ? (
            <div
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: '#64748b',
                fontSize: 12
              }}
            >
              No shortcuts found in this view. Click <strong>+ Shortcut</strong> in the header to add one!
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex
              const badgeMeta = ACTION_TYPE_BADGES[item.actionType] ?? ACTION_TYPE_BADGES.hotkey
              return (
                <div
                  key={item.id}
                  ref={isSelected ? activeRowRef : undefined}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={(e) => handleExecute(item, e.ctrlKey || e.metaKey)}
                  title={`Click to execute "${item.label}" (${item.keys || item.actionPayload})`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: isSelected
                      ? 'rgba(90, 160, 255, 0.15)'
                      : 'rgba(255, 255, 255, 0.025)',
                    border: isSelected
                      ? '1px solid rgba(90, 160, 255, 0.42)'
                      : '1px solid rgba(255, 255, 255, 0.06)',
                    cursor: 'pointer',
                    transition: 'background 0.12s ease, border-color 0.12s ease'
                  }}
                >
                  {/* Left: Star + Icon + Title & Description */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flex: 1 }}>
                    <button
                      type="button"
                      onClick={(e) => handleToggleFavorite(e, item.id)}
                      title={item.favorite ? 'Remove from Favorites (*)' : 'Add to Favorites (*)'}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 2,
                        fontSize: 14,
                        color: item.favorite ? '#fbbf24' : 'rgba(255,255,255,0.22)',
                        cursor: 'pointer',
                        flexShrink: 0,
                        lineHeight: 1
                      }}
                    >
                      {item.favorite ? '★' : '☆'}
                    </button>

                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 7,
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        flexShrink: 0
                      }}
                    >
                      {item.icon}
                    </span>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: '#f8fafc',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {item.label}
                        </span>
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: 4,
                            color: badgeMeta.color,
                            background: badgeMeta.bg,
                            border: `1px solid ${badgeMeta.border}`
                          }}
                        >
                          {badgeMeta.label}
                        </span>
                        {item.tab === 'powertoys' && item.installed === false && (
                          <span
                            style={{
                              fontSize: 9.5,
                              padding: '1px 5px',
                              borderRadius: 4,
                              color: '#f87171',
                              background: 'rgba(239, 68, 68, 0.14)',
                              border: '1px solid rgba(239, 68, 68, 0.3)'
                            }}
                          >
                            Not Installed
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: '#94a3b8',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          marginTop: 1
                        }}
                      >
                        {item.description}
                      </div>
                    </div>
                  </div>

                  {/* Right: Keycap Badges + Edit / Delete Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {renderKeycaps(item.keys)}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingItem({ ...item })
                        }}
                        title="Edit shortcut keys or command"
                        style={{
                          padding: '3px 6px',
                          fontSize: 11,
                          borderRadius: 5,
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: 'rgba(255,255,255,0.04)',
                          color: '#94a3b8',
                          cursor: 'pointer'
                        }}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteShortcut(e, item)}
                        title={item.isBuiltIn ? 'Hide built-in shortcut' : 'Delete custom shortcut'}
                        style={{
                          padding: '3px 6px',
                          fontSize: 11,
                          borderRadius: 5,
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: 'rgba(255,255,255,0.04)',
                          color: '#94a3b8',
                          cursor: 'pointer'
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Footer Hints */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(0,0,0,0.28)',
          fontSize: 10.5,
          color: '#64748b',
          flexShrink: 0,
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>
            <kbd className="palette-kbd">Click</kbd> or <kbd className="palette-kbd">↵</kbd> Execute
          </span>
          <span>
            <kbd className="palette-kbd">↑↓</kbd> Navigate
          </span>
          <span>
            <kbd className="palette-kbd">Tab</kbd> Switch Tab
          </span>
          <span>
            <kbd className="palette-kbd">*</kbd> Favorite
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>
            <kbd className="palette-kbd">Esc</kbd> Collapse
          </span>
          <span
            onMouseDown={(e) => startResizeDrag(e, 'both')}
            onDoubleClick={() => {
              window.api.resizeShortcutsWindow?.(1040, 720).then((res) => {
                if (res) setData(res)
                flashToast(true, 'Reset window size to 1040×720')
              })
            }}
            title="Drag corner to resize window · Double-click to reset to 1040×720"
            style={{
              cursor: 'nwse-resize',
              padding: '1px 5px',
              borderRadius: 4,
              color: '#94a3b8',
              fontSize: 11,
              lineHeight: 1,
              userSelect: 'none'
            }}
          >
            ◢
          </span>
        </div>
      </div>

      {/* Right & Bottom Edge Resize Handles */}
      <div
        onMouseDown={(e) => startResizeDrag(e, 'width')}
        title="Drag right edge to resize width"
        style={{
          position: 'absolute',
          top: 38,
          right: 0,
          bottom: 16,
          width: 6,
          cursor: 'ew-resize',
          zIndex: 40
        }}
      />
      <div
        onMouseDown={(e) => startResizeDrag(e, 'height')}
        title="Drag bottom edge to resize height"
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 0,
          height: 6,
          cursor: 'ns-resize',
          zIndex: 40
        }}
      />
      <div
        onMouseDown={(e) => startResizeDrag(e, 'both')}
        onDoubleClick={() => {
          window.api.resizeShortcutsWindow?.(1040, 720).then((res) => {
            if (res) setData(res)
            flashToast(true, 'Reset window size to 1040×720')
          })
        }}
        title="Drag corner to resize window · Double-click to reset to 1040×720"
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 16,
          height: 16,
          cursor: 'nwse-resize',
          zIndex: 45
        }}
      />
    </div>
  )
}

