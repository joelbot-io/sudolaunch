import { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue } from 'react'
import type {
  WingetPackageItem,
  WingetPinItem,
  WingetSearchResult,
  WingetOperationState,
  WingetPackageDetails,
  WingetSnapshotItem,
  EcosystemUpdateItem,
  DevRuntimeStatus,
  PathEntryHealth,
  SystemServiceItem,
  SystemStartupAppItem,
  SystemPortItem,
  SystemProcessItem,
  CleanupTargetItem,
  WindowsUpdateStatus,
  SystemEnvVarItem,
  SystemScheduledTaskItem,
  SystemHostEntryItem,
  SystemNetworkAdapterItem,
  SystemStorageAndPowerOverview,
  SystemSecurityPosture,
  SystemEventLogItem,
  ScheduledJobItem,
  ScheduledJobPreset
} from '../../shared/types'
import { RuntimesAndEnvPanel } from './system/RuntimesAndEnvPanel'
import { ScheduledJobsCategoryPanel } from './system/ScheduledJobsCategoryPanel'
import { ServicesAndTasksPanel } from './system/ServicesAndTasksPanel'
import { PortsAndNetworkPanel } from './system/PortsAndNetworkPanel'
import { CleanupAndStoragePanel } from './system/CleanupAndStoragePanel'
import { SecurityAndEventsPanel } from './system/SecurityAndEventsPanel'
import { WindowsUpdateSubPanel } from './system/WindowsUpdateSubPanel'
import { PackageInspectorPane } from './system/PackageInspectorPane'

export type WingetSubTab =
  | 'updates'
  | 'installed'
  | 'pins'
  | 'search'
  | 'ecosystem'
  | 'snapshots'
  | 'winupdate'
  | 'runtimes'
  | 'envvars'
  | 'services'
  | 'tasks'
  | 'jobs'
  | 'ports'
  | 'hosts'
  | 'network'
  | 'cleanup'
  | 'storage'
  | 'power'
  | 'security'
  | 'events'

type SystemCategory = 'winget' | 'jobs' | 'runtimes' | 'services' | 'ports' | 'cleanup' | 'security'
type WingetInnerTab =
  | 'updates'
  | 'installed'
  | 'pins'
  | 'search'
  | 'ecosystem'
  | 'snapshots'
  | 'winupdate'

export interface SystemPanelProps {
  initialWingetTab?: WingetSubTab
  onClose: () => void
  onBackToPalette: () => void
}

interface PinTargetState {
  id: string
  name: string
  version: string
  isPinned?: boolean
  currentPinType?: string
  currentPinnedVersion?: string
}

const POPULAR_SEARCH_CHIPS = [
  'PowerToys',
  'Git',
  'Node.js',
  'Python',
  '7zip',
  'Docker',
  'VSCode',
  'Sysinternals',
  'uv',
  'Ripgrep'
]

function suggestVersionWildcard(ver: string): string {
  const parts = ver.trim().split('.')
  if (parts.length >= 2) {
    return `${parts[0]}.${parts[1]}.*`
  }
  if (parts.length === 1 && parts[0]) {
    return `${parts[0]}.*`
  }
  return '*'
}

export function SystemManagementPanel({
  initialWingetTab = 'updates',
  onClose,
  onBackToPalette
}: SystemPanelProps): JSX.Element {
  const [activeCategory, setActiveCategory] = useState<SystemCategory>('winget')
  const [subTab, setSubTab] = useState<WingetInnerTab>('updates')
  const [elevateByDefault, setElevateByDefault] = useState(false)
  const [includePinnedInUpgrade, setIncludePinnedInUpgrade] = useState(false)

  // WinGet data states
  const [updates, setUpdates] = useState<WingetPackageItem[]>([])
  const [installed, setInstalled] = useState<WingetPackageItem[]>([])
  const [pins, setPins] = useState<WingetPinItem[]>([])
  const [searchResults, setSearchResults] = useState<WingetSearchResult[]>([])
  const [ecosystemUpdates, setEcosystemUpdates] = useState<EcosystemUpdateItem[]>([])
  const [snapshots, setSnapshots] = useState<WingetSnapshotItem[]>([])

  const [loadingUpdates, setLoadingUpdates] = useState(false)
  const [loadingInstalled, setLoadingInstalled] = useState(false)
  const [loadingPins, setLoadingPins] = useState(false)
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [loadingEcosystem, setLoadingEcosystem] = useState(false)
  const [loadingSnapshots, setLoadingSnapshots] = useState(false)

  const [installedLoadedOnce, setInstalledLoadedOnce] = useState(false)
  const [ecosystemLoadedOnce, setEcosystemLoadedOnce] = useState(false)
  const [snapshotsLoadedOnce, setSnapshotsLoadedOnce] = useState(false)

  // Filter & Search states
  const [filterText, setFilterText] = useState('')
  const [installedFilterChip, setInstalledFilterChip] = useState<'all' | 'winget' | 'outdated' | 'pinned'>('winget')
  const [ecosystemFilterChip, setEcosystemFilterChip] = useState<'all' | 'npm' | 'pip' | 'wsl'>('all')
  const [catalogQuery, setCatalogQuery] = useState('')

  // Multi-select Batch Queue state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Right-Hand Package Inspector state
  const [inspectedPkgId, setInspectedPkgId] = useState<string | null>(null)
  const [inspectedDetails, setInspectedDetails] = useState<WingetPackageDetails | null>(null)
  const [loadingInspector, setLoadingInspector] = useState(false)
  const [inspectorVersion, setInspectorVersion] = useState<string>('')
  const [inspectorScope, setInspectorScope] = useState<'default' | 'user' | 'machine'>('default')
  const [inspectorInteractive, setInspectorInteractive] = useState(false)
  const [inspectorForce, setInspectorForce] = useState(false)

  // Snapshots UI state
  const [newSnapshotName, setNewSnapshotName] = useState('')
  const [creatingSnapshot, setCreatingSnapshot] = useState(false)

  // Feedback & Live Operation state
  const [feedback, setFeedback] = useState<string | null>(null)
  const [opState, setOpState] = useState<WingetOperationState | null>(null)
  const [showOpLogs, setShowOpLogs] = useState(false)
  const prevOpStatusRef = useRef<string | null>(null)

  // Pin Editor state
  const [pinTarget, setPinTarget] = useState<PinTargetState | null>(null)
  const [pinModeChoice, setPinModeChoice] = useState<'standard' | 'blocking' | 'version'>('standard')
  const [pinVersionInput, setPinVersionInput] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [showAddPinById, setShowAddPinById] = useState(false)
  const [manualPinId, setManualPinId] = useState('')

  const [confirmUninstallId, setConfirmUninstallId] = useState<string | null>(null)
  const [confirmResetPins, setConfirmResetPins] = useState(false)

  // Category 2: Runtimes, PATH Doctor & Env Variables states
  const [runtimesView, setRuntimesView] = useState<'runtimes' | 'path' | 'envvars'>('runtimes')
  const [devRuntimes, setDevRuntimes] = useState<DevRuntimeStatus[]>([])
  const [pathEntries, setPathEntries] = useState<PathEntryHealth[]>([])
  const [envVars, setEnvVars] = useState<SystemEnvVarItem[]>([])
  const [loadingRuntimes, setLoadingRuntimes] = useState(false)
  const [runtimesLoadedOnce, setRuntimesLoadedOnce] = useState(false)

  // Category 3: Services, Startup, Windows Scheduled Tasks states
  const [servicesView, setServicesView] = useState<'services' | 'startup' | 'tasks'>('services')
  const [services, setServices] = useState<SystemServiceItem[]>([])
  const [startupApps, setStartupApps] = useState<SystemStartupAppItem[]>([])
  const [scheduledTasks, setScheduledTasks] = useState<SystemScheduledTaskItem[]>([])
  const [loadingServices, setLoadingServices] = useState(false)
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [servicesLoadedOnce, setServicesLoadedOnce] = useState(false)
  const [tasksLoadedOnce, setTasksLoadedOnce] = useState(false)

  // SudoLaunch In-App Scheduled Jobs state
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledJobItem[]>([])
  const [jobPresets, setJobPresets] = useState<ScheduledJobPreset[]>([])
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [jobsLoadedOnce, setJobsLoadedOnce] = useState(false)

  // Category 4: Ports, Processes, Hosts File & Network states
  const [portsView, setPortsView] = useState<'ports' | 'processes' | 'hosts' | 'network'>('ports')
  const [ports, setPorts] = useState<SystemPortItem[]>([])
  const [processes, setProcesses] = useState<SystemProcessItem[]>([])
  const [hostEntries, setHostEntries] = useState<SystemHostEntryItem[]>([])
  const [networkAdapters, setNetworkAdapters] = useState<SystemNetworkAdapterItem[]>([])
  const [loadingPorts, setLoadingPorts] = useState(false)
  const [portsLoadedOnce, setPortsLoadedOnce] = useState(false)

  // Category 5: Cleanup, Storage Health, Power Plans & Repair Toolkit states
  const [cleanupView, setCleanupView] = useState<'caches' | 'storage' | 'power'>('caches')
  const [cleanupTargets, setCleanupTargets] = useState<CleanupTargetItem[]>([])
  const [storageAndPower, setStorageAndPower] = useState<SystemStorageAndPowerOverview | null>(null)
  const [loadingCleanup, setLoadingCleanup] = useState(false)
  const [cleaningBusy, setCleaningBusy] = useState(false)
  const [cleanupLoadedOnce, setCleanupLoadedOnce] = useState(false)

  // Category 6: Security Posture (Defender, BitLocker, Admins) & Event Log Triage states
  const [securityView, setSecurityView] = useState<'posture' | 'events'>('posture')
  const [securityPosture, setSecurityPosture] = useState<SystemSecurityPosture | null>(null)
  const [eventLogs, setEventLogs] = useState<SystemEventLogItem[]>([])
  const [loadingSecurity, setLoadingSecurity] = useState(false)
  const [securityLoadedOnce, setSecurityLoadedOnce] = useState(false)

  // Windows Update & Pending Reboot states
  const [winUpdateStatus, setWinUpdateStatus] = useState<WindowsUpdateStatus | null>(null)
  const [loadingWinUpdate, setLoadingWinUpdate] = useState(false)
  const [scanningWinUpdate, setScanningWinUpdate] = useState(false)
  const [winUpdateActionBusy, setWinUpdateActionBusy] = useState<string | null>(null)

  // Per-action busy states for visual loading spinners
  const [ecosystemBusyKey, setEcosystemBusyKey] = useState<string | null>(null)

  // Deferred search value to prevent typing stutter over large lists
  const deferredFilterText = useDeferredValue(filterText)

  const flash = useCallback((msg: string): void => {
    setFeedback(msg)
    setTimeout(() => setFeedback((cur) => (cur === msg ? null : cur)), 4200)
  }, [])

  // Route initialWingetTab to either top-level category or WinGet subTab
  useEffect(() => {
    if (initialWingetTab === 'runtimes') {
      setActiveCategory('runtimes')
      setRuntimesView('runtimes')
    } else if (initialWingetTab === 'envvars') {
      setActiveCategory('runtimes')
      setRuntimesView('envvars')
    } else if (initialWingetTab === 'services') {
      setActiveCategory('services')
      setServicesView('services')
    } else if (initialWingetTab === 'tasks') {
      setActiveCategory('services')
      setServicesView('tasks')
    } else if (initialWingetTab === 'jobs') {
      setActiveCategory('jobs')
    } else if (initialWingetTab === 'ports') {
      setActiveCategory('ports')
      setPortsView('ports')
    } else if (initialWingetTab === 'hosts') {
      setActiveCategory('ports')
      setPortsView('hosts')
    } else if (initialWingetTab === 'network') {
      setActiveCategory('ports')
      setPortsView('network')
    } else if (initialWingetTab === 'cleanup') {
      setActiveCategory('cleanup')
      setCleanupView('caches')
    } else if (initialWingetTab === 'storage') {
      setActiveCategory('cleanup')
      setCleanupView('storage')
    } else if (initialWingetTab === 'power') {
      setActiveCategory('cleanup')
      setCleanupView('power')
    } else if (initialWingetTab === 'security') {
      setActiveCategory('security')
      setSecurityView('posture')
    } else if (initialWingetTab === 'events') {
      setActiveCategory('security')
      setSecurityView('events')
    } else {
      setActiveCategory('winget')
      setSubTab(initialWingetTab)
    }
  }, [initialWingetTab])

  // Clear batch selection when switching sub-tabs
  useEffect(() => {
    setSelectedIds(new Set())
  }, [subTab, activeCategory])

  // Data loaders
  const loadUpdatesAndPins = useCallback(
    async (force = false) => {
      setLoadingUpdates(true)
      setLoadingPins(true)
      try {
        const [uList, pList] = await Promise.all([
          window.api.getWingetUpdates?.(force) ?? [],
          window.api.getWingetPins?.(force) ?? []
        ])
        setUpdates(uList)
        setPins(pList)
      } catch (err) {
        flash(`Failed to query WinGet updates: ${err}`)
      } finally {
        setLoadingUpdates(false)
        setLoadingPins(false)
      }
    },
    [flash]
  )

  const loadInstalled = useCallback(
    async (force = false) => {
      setLoadingInstalled(true)
      try {
        const list = (await window.api.getWingetInstalled?.(force)) ?? []
        setInstalled(list)
        setInstalledLoadedOnce(true)
      } catch (err) {
        flash(`Failed to list installed packages: ${err}`)
      } finally {
        setLoadingInstalled(false)
      }
    },
    [flash]
  )

  const loadPinsOnly = useCallback(
    async (force = false) => {
      setLoadingPins(true)
      try {
        const pList = (await window.api.getWingetPins?.(force)) ?? []
        setPins(pList)
      } catch (err) {
        flash(`Failed to load pins: ${err}`)
      } finally {
        setLoadingPins(false)
      }
    },
    [flash]
  )

  const loadEcosystem = useCallback(
    async (force = false) => {
      setLoadingEcosystem(true)
      try {
        const items = (await window.api.getEcosystemUpdates?.(force)) ?? []
        setEcosystemUpdates(items)
        setEcosystemLoadedOnce(true)
      } catch (err) {
        flash(`Failed to check ecosystem updates: ${err}`)
      } finally {
        setLoadingEcosystem(false)
      }
    },
    [flash]
  )

  const loadSnapshots = useCallback(async () => {
    setLoadingSnapshots(true)
    try {
      const list = (await window.api.listWingetSnapshots?.()) ?? []
      setSnapshots(list)
      setSnapshotsLoadedOnce(true)
    } catch (err) {
      flash(`Failed to load snapshots: ${err}`)
    } finally {
      setLoadingSnapshots(false)
    }
  }, [flash])

  const loadRuntimesAndPath = useCallback(
    async (force = false) => {
      setLoadingRuntimes(true)
      try {
        const [rtList, pHealth, eVars] = await Promise.all([
          window.api.getDevRuntimesStatus?.(force) ?? [],
          window.api.getPathHealth?.() ?? [],
          window.api.getSystemEnvVars?.() ?? []
        ])
        setDevRuntimes(rtList)
        setPathEntries(pHealth)
        setEnvVars(eVars)
        setRuntimesLoadedOnce(true)
      } catch (err) {
        flash(`Failed to scan developer runtimes: ${err}`)
      } finally {
        setLoadingRuntimes(false)
      }
    },
    [flash]
  )

  const loadServicesAndStartup = useCallback(
    async (force = false) => {
      setLoadingServices(true)
      try {
        const [svcList, startList] = await Promise.all([
          window.api.getSystemServices?.(force) ?? [],
          window.api.getSystemStartupApps?.() ?? []
        ])
        setServices(svcList)
        setStartupApps(startList)
        setServicesLoadedOnce(true)
      } catch (err) {
        flash(`Failed to load Windows services: ${err}`)
      } finally {
        setLoadingServices(false)
      }
    },
    [flash]
  )

  const loadScheduledTasks = useCallback(
    async (force = false) => {
      setLoadingTasks(true)
      try {
        const tList = (await window.api.getSystemScheduledTasks?.(force)) ?? []
        setScheduledTasks(tList)
        setTasksLoadedOnce(true)
      } catch (err) {
        flash(`Failed to query Scheduled Tasks: ${err}`)
      } finally {
        setLoadingTasks(false)
      }
    },
    [flash]
  )

  const loadScheduledJobs = useCallback(async () => {
    setLoadingJobs(true)
    try {
      const [jList, pList] = await Promise.all([
        window.api.getScheduledJobs?.() ?? [],
        window.api.getScheduledJobPresets?.() ?? []
      ])
      setScheduledJobs(jList)
      setJobPresets(pList)
      setJobsLoadedOnce(true)
    } catch (err) {
      flash(`Failed to load SudoLaunch Scheduled Jobs: ${err}`)
    } finally {
      setLoadingJobs(false)
    }
  }, [flash])

  const loadPortsAndProcesses = useCallback(async () => {
    setLoadingPorts(true)
    try {
      const [portList, procList, hList, netList] = await Promise.all([
        window.api.getSystemPorts?.() ?? [],
        window.api.getSystemProcesses?.() ?? [],
        window.api.getSystemHostsEntries?.() ?? [],
        window.api.getSystemNetworkAdapters?.() ?? []
      ])
      setPorts(portList)
      setProcesses(procList)
      setHostEntries(hList)
      setNetworkAdapters(netList)
      setPortsLoadedOnce(true)
    } catch (err) {
      flash(`Failed to scan ports and network: ${err}`)
    } finally {
      setLoadingPorts(false)
    }
  }, [flash])

  const loadCleanup = useCallback(async () => {
    setLoadingCleanup(true)
    try {
      const [targets, sp] = await Promise.all([
        window.api.getCleanupTargets?.() ?? [],
        window.api.getSystemStorageAndPower?.() ?? null
      ])
      setCleanupTargets(targets)
      if (sp) setStorageAndPower(sp)
      setCleanupLoadedOnce(true)
    } catch (err) {
      flash(`Failed to scan cache and storage: ${err}`)
    } finally {
      setLoadingCleanup(false)
    }
  }, [flash])

  const loadSecurityAndEvents = useCallback(
    async (force = false) => {
      setLoadingSecurity(true)
      try {
        const [posture, evts] = await Promise.all([
          window.api.getSystemSecurityPosture?.(force) ?? null,
          window.api.getSystemEventLogs?.() ?? []
        ])
        if (posture) setSecurityPosture(posture)
        setEventLogs(evts)
        setSecurityLoadedOnce(true)
      } catch (err) {
        flash(`Failed to load Security & Event Logs: ${err}`)
      } finally {
        setLoadingSecurity(false)
      }
    },
    [flash]
  )

  const loadWindowsUpdateStatus = useCallback(
    async (options?: { force?: boolean; scanPending?: boolean; online?: boolean }) => {
      if (options?.scanPending) {
        setScanningWinUpdate(true)
        setWinUpdateActionBusy(options.online ? 'scan-online' : 'scan-local')
      } else {
        setLoadingWinUpdate(true)
        if (options?.force) setWinUpdateActionBusy('recheck')
      }
      try {
        const st = await window.api.getWindowsUpdateStatus?.(options)
        if (st) {
          setWinUpdateStatus(st)
          if (options?.scanPending) {
            flash(
              st.pendingUpdates.length > 0
                ? `Found ${st.pendingUpdates.length} pending Windows update(s)`
                : 'Scan complete: 0 pending Windows updates found'
            )
          }
        }
      } catch (err) {
        flash(`Failed to query Windows Update & Pending Reboot status: ${err}`)
      } finally {
        setLoadingWinUpdate(false)
        setScanningWinUpdate(false)
        setWinUpdateActionBusy(null)
      }
    },
    [flash]
  )

  // Initial mount & operation progress subscription
  useEffect(() => {
    void loadUpdatesAndPins(false)
    void loadWindowsUpdateStatus({ force: false, scanPending: false })
    void loadScheduledJobs()
    window.api.getWingetOperationState?.().then((st) => {
      if (st) {
        setOpState(st)
        prevOpStatusRef.current = st.status
      }
    })
    const unsubOp = window.api.onWingetOperationProgress?.((st) => {
      setOpState(st)
      const prev = prevOpStatusRef.current
      prevOpStatusRef.current = st?.status ?? null
      if (prev === 'running' && st && (st.status === 'success' || st.status === 'error')) {
        void loadUpdatesAndPins(true)
        void loadWindowsUpdateStatus({ force: true, scanPending: false })
        if (installedLoadedOnce) {
          void loadInstalled(true)
        }
      }
    })
    const unsubJobs = window.api.onScheduledJobsUpdated?.((jobs) => {
      setScheduledJobs(jobs)
      setJobsLoadedOnce(true)
    })
    return () => {
      unsubOp?.()
      unsubJobs?.()
    }
  }, [loadUpdatesAndPins, loadWindowsUpdateStatus, loadScheduledJobs, loadInstalled, installedLoadedOnce])

  // Lazy-load sub-tabs & categories on first visit
  useEffect(() => {
    if (activeCategory === 'winget') {
      if (subTab === 'installed' && !installedLoadedOnce && !loadingInstalled) {
        void loadInstalled(false)
      } else if (subTab === 'ecosystem' && !ecosystemLoadedOnce && !loadingEcosystem) {
        void loadEcosystem(false)
      } else if (subTab === 'snapshots' && !snapshotsLoadedOnce && !loadingSnapshots) {
        void loadSnapshots()
      }
    } else if (activeCategory === 'jobs') {
      if (!jobsLoadedOnce && !loadingJobs) {
        void loadScheduledJobs()
      }
    } else if (activeCategory === 'runtimes' && !runtimesLoadedOnce && !loadingRuntimes) {
      void loadRuntimesAndPath(false)
    } else if (activeCategory === 'services') {
      if (!servicesLoadedOnce && !loadingServices) {
        void loadServicesAndStartup(false)
      }
      if (servicesView === 'tasks' && !tasksLoadedOnce && !loadingTasks) {
        void loadScheduledTasks(false)
      }
    } else if (activeCategory === 'ports' && !portsLoadedOnce && !loadingPorts) {
      void loadPortsAndProcesses()
    } else if (activeCategory === 'cleanup' && !cleanupLoadedOnce && !loadingCleanup) {
      void loadCleanup()
    } else if (activeCategory === 'security' && !securityLoadedOnce && !loadingSecurity) {
      void loadSecurityAndEvents(false)
    }
  }, [
    activeCategory,
    subTab,
    servicesView,
    installedLoadedOnce,
    loadingInstalled,
    loadInstalled,
    ecosystemLoadedOnce,
    loadingEcosystem,
    loadEcosystem,
    snapshotsLoadedOnce,
    loadingSnapshots,
    loadSnapshots,
    runtimesLoadedOnce,
    loadingRuntimes,
    loadRuntimesAndPath,
    jobsLoadedOnce,
    loadingJobs,
    loadScheduledJobs,
    servicesLoadedOnce,
    loadingServices,
    loadServicesAndStartup,
    tasksLoadedOnce,
    loadingTasks,
    loadScheduledTasks,
    portsLoadedOnce,
    loadingPorts,
    loadPortsAndProcesses,
    cleanupLoadedOnce,
    loadingCleanup,
    loadCleanup,
    securityLoadedOnce,
    loadingSecurity,
    loadSecurityAndEvents
  ])

  // Load Package Inspector details when a package is clicked/inspected
  const handleInspectPackage = useCallback(
    async (pkgId: string) => {
      if (inspectedPkgId === pkgId) {
        setInspectedPkgId(null)
        setInspectedDetails(null)
        return
      }
      setInspectedPkgId(pkgId)
      setLoadingInspector(true)
      try {
        const details = await window.api.getWingetPackageDetails?.(pkgId)
        setInspectedDetails(details ?? null)
        setInspectorVersion(details?.availableVersions?.[0] || details?.version || '')
      } catch (err) {
        flash(`Failed to load package details: ${err}`)
      } finally {
        setLoadingInspector(false)
      }
    },
    [inspectedPkgId, flash]
  )

  async function handleRefreshCurrentView(): Promise<void> {
    if (activeCategory === 'winget') {
      if (subTab === 'updates') {
        await loadUpdatesAndPins(true)
        flash('Refreshed available updates and pins')
      } else if (subTab === 'installed') {
        await loadInstalled(true)
        flash('Refreshed installed packages')
      } else if (subTab === 'pins') {
        await loadPinsOnly(true)
        flash('Refreshed pinned packages')
      } else if (subTab === 'search' && catalogQuery.trim()) {
        await handleCatalogSearch(catalogQuery)
      } else if (subTab === 'ecosystem') {
        await loadEcosystem(true)
        flash('Refreshed npm, pip, and WSL updates')
      } else if (subTab === 'snapshots') {
        await loadSnapshots()
        flash('Refreshed WinGet snapshots')
      } else if (subTab === 'winupdate') {
        await loadWindowsUpdateStatus({ force: true, scanPending: false })
        flash('Refreshed Windows Update & Pending Reboot status')
      }
    } else if (activeCategory === 'jobs') {
      await loadScheduledJobs()
      flash('Refreshed SudoLaunch Scheduled Jobs and presets')
    } else if (activeCategory === 'runtimes') {
      await loadRuntimesAndPath(true)
      flash('Re-scanned developer runtimes, PATH, and Environment Variables')
    } else if (activeCategory === 'services') {
      if (servicesView === 'tasks') {
        await loadScheduledTasks(true)
        flash('Refreshed Windows Scheduled Tasks')
      } else {
        await loadServicesAndStartup(true)
        flash('Refreshed Windows Services and Startup apps')
      }
    } else if (activeCategory === 'ports') {
      await loadPortsAndProcesses()
      flash('Refreshed listening TCP ports, processes, hosts file, and network adapters')
    } else if (activeCategory === 'cleanup') {
      await loadCleanup()
      flash('Re-scanned caches, storage volumes, SMART health, and power plans')
    } else if (activeCategory === 'security') {
      await loadSecurityAndEvents(true)
      flash('Refreshed Windows Defender posture, BitLocker status, and Event Logs')
    }
  }

  async function handleCatalogSearch(queryOverride?: string): Promise<void> {
    const q = (queryOverride ?? catalogQuery).trim()
    if (!q) return
    setLoadingSearch(true)
    try {
      const res = (await window.api.searchWingetCatalog?.(q)) ?? []
      setSearchResults(res)
    } catch (err) {
      flash(`Search failed: ${err}`)
    } finally {
      setLoadingSearch(false)
    }
  }

  function openPinEditor(pkg: {
    id: string
    name: string
    version: string
    isPinned?: boolean
    pinType?: string
    pinnedVersion?: string
  }): void {
    setPinTarget({
      id: pkg.id,
      name: pkg.name,
      version: pkg.version,
      isPinned: pkg.isPinned,
      currentPinType: pkg.pinType,
      currentPinnedVersion: pkg.pinnedVersion
    })
    if (pkg.pinType === 'Blocking') {
      setPinModeChoice('blocking')
    } else if (pkg.pinType === 'Gating') {
      setPinModeChoice('version')
    } else {
      setPinModeChoice('standard')
    }
    setPinVersionInput(pkg.pinnedVersion || suggestVersionWildcard(pkg.version))
  }

  function applyUpdatedPinsLocally(updatedPins: WingetPinItem[]): void {
    setPins(updatedPins)
    const pinMap = new Map<string, WingetPinItem>()
    for (const p of updatedPins) {
      pinMap.set(p.id.toLowerCase(), p)
    }
    setUpdates((prev) =>
      prev.map((u) => {
        const pin = pinMap.get(u.id.toLowerCase())
        return {
          ...u,
          isPinned: Boolean(pin),
          pinType: pin?.pinType,
          pinnedVersion: pin?.pinnedVersion
        }
      })
    )
    setInstalled((prev) =>
      prev.map((item) => {
        const pin = pinMap.get(item.id.toLowerCase())
        return {
          ...item,
          isPinned: Boolean(pin),
          pinType: pin?.pinType,
          pinnedVersion: pin?.pinnedVersion
        }
      })
    )
  }

  async function handleSavePin(forceElevated = false): Promise<void> {
    if (!pinTarget) return
    if (pinModeChoice === 'version' && !pinVersionInput.trim()) {
      flash('Enter a version or wildcard pattern (e.g. 24.*)')
      return
    }
    setPinBusy(true)
    try {
      const res = await window.api.addWingetPin?.({
        id: pinTarget.id,
        mode: pinModeChoice,
        versionPattern: pinModeChoice === 'version' ? pinVersionInput.trim() : undefined,
        elevated: forceElevated || elevateByDefault
      })
      if (res) {
        applyUpdatedPinsLocally(res.pins)
        flash(res.success ? `Pinned ${pinTarget.name} (${pinModeChoice})` : res.message)
        if (res.success) setPinTarget(null)
      }
    } catch (err) {
      flash(`Pin failed: ${err}`)
    } finally {
      setPinBusy(false)
    }
  }

  async function handleRemovePin(id: string, name?: string, forceElevated = false): Promise<void> {
    setPinBusy(true)
    try {
      const res = await window.api.removeWingetPin?.(id, forceElevated || elevateByDefault)
      if (res) {
        applyUpdatedPinsLocally(res.pins)
        flash(res.success ? `Removed pin for ${name || id}` : res.message)
        if (pinTarget?.id.toLowerCase() === id.toLowerCase()) {
          setPinTarget(null)
        }
      }
    } catch (err) {
      flash(`Unpin failed: ${err}`)
    } finally {
      setPinBusy(false)
    }
  }

  async function handleResetAllPins(forceElevated = false): Promise<void> {
    if (!confirmResetPins) {
      setConfirmResetPins(true)
      setTimeout(() => setConfirmResetPins(false), 4000)
      return
    }
    setPinBusy(true)
    try {
      const res = await window.api.resetWingetPins?.(forceElevated || elevateByDefault)
      setConfirmResetPins(false)
      if (res) {
        applyUpdatedPinsLocally(res.pins)
        flash(res.success ? 'All WinGet pins have been reset' : res.message)
      }
    } catch (err) {
      flash(`Reset pins failed: ${err}`)
    } finally {
      setPinBusy(false)
    }
  }

  async function handleRunAction(params: {
    action: 'install' | 'upgrade' | 'upgrade-all' | 'uninstall'
    id?: string
    name?: string
    version?: string
    scope?: 'default' | 'user' | 'machine'
    interactive?: boolean
    force?: boolean
    forceElevated?: boolean
    includePinned?: boolean
    inTerminal?: boolean
  }): Promise<void> {
    if (params.action === 'uninstall' && params.id && !params.inTerminal) {
      if (confirmUninstallId !== params.id) {
        setConfirmUninstallId(params.id)
        setTimeout(() => setConfirmUninstallId((cur) => (cur === params.id ? null : cur)), 4000)
        return
      }
      setConfirmUninstallId(null)
    }

    try {
      const res = await window.api.runWingetAction?.({
        action: params.action,
        id: params.id,
        name: params.name,
        version: params.version,
        scope: params.scope,
        interactive: params.interactive,
        force: params.force,
        elevated: Boolean(params.forceElevated || elevateByDefault),
        includePinned: params.includePinned ?? includePinnedInUpgrade,
        inTerminal: params.inTerminal
      })
      if (res?.message) {
        flash(res.message)
      }
    } catch (err) {
      flash(`Operation failed: ${err}`)
    }
  }

  // Multi-select Batch Queue handlers
  function toggleSelectId(id: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBatchAction(
    action: 'upgrade' | 'uninstall' | 'pin',
    sourceList: WingetPackageItem[],
    forceElevated = false
  ): Promise<void> {
    const selectedPkgs = sourceList.filter((p) => selectedIds.has(p.id))
    if (selectedPkgs.length === 0) return

    if (action === 'pin') {
      setPinBusy(true)
      try {
        let lastPins = pins
        for (const p of selectedPkgs) {
          const res = await window.api.addWingetPin?.({
            id: p.id,
            mode: 'standard',
            elevated: forceElevated || elevateByDefault
          })
          if (res?.pins) lastPins = res.pins
        }
        applyUpdatedPinsLocally(lastPins)
        setSelectedIds(new Set())
        flash(`Pinned ${selectedPkgs.length} selected package(s)`)
      } finally {
        setPinBusy(false)
      }
      return
    }

    const res = await window.api.runWingetBatchAction?.({
      action,
      packages: selectedPkgs.map((p) => ({ id: p.id, name: p.name })),
      elevated: forceElevated || elevateByDefault,
      includePinned: true
    })
    if (res?.started) {
      setSelectedIds(new Set())
    }
    if (res?.message) {
      flash(res.message)
    }
  }

  function handleCopyText(text: string, label = 'Copied'): void {
    navigator.clipboard?.writeText(text).catch(() => {})
    flash(`${label}: ${text}`)
  }

  // Filtered lists for WinGet
  const filteredUpdates = useMemo(() => {
    const q = deferredFilterText.trim().toLowerCase()
    if (!q) return updates
    return updates.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q) ||
        u.version.toLowerCase().includes(q) ||
        (u.available && u.available.toLowerCase().includes(q))
    )
  }, [updates, deferredFilterText])

  const wingetSourceCount = useMemo(
    () => installed.filter((i) => i.source === 'winget').length,
    [installed]
  )
  const outdatedInstalledCount = useMemo(
    () => installed.filter((i) => Boolean(i.available)).length,
    [installed]
  )
  const pinnedInstalledCount = useMemo(
    () => installed.filter((i) => Boolean(i.isPinned)).length,
    [installed]
  )

  const filteredInstalled = useMemo(() => {
    let base = installed
    if (installedFilterChip === 'winget') {
      base = base.filter((i) => i.source === 'winget')
    } else if (installedFilterChip === 'outdated') {
      base = base.filter((i) => Boolean(i.available))
    } else if (installedFilterChip === 'pinned') {
      base = base.filter((i) => Boolean(i.isPinned))
    }
    const q = deferredFilterText.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q) ||
        i.version.toLowerCase().includes(q)
    )
  }, [installed, installedFilterChip, deferredFilterText])

  const filteredPins = useMemo(() => {
    const q = deferredFilterText.trim().toLowerCase()
    if (!q) return pins
    return pins.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.pinType.toLowerCase().includes(q)
    )
  }, [pins, deferredFilterText])

  const filteredEcosystem = useMemo(() => {
    let base = ecosystemUpdates
    if (ecosystemFilterChip !== 'all') {
      base = base.filter((e) => e.manager === ecosystemFilterChip)
    }
    const q = deferredFilterText.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)
    )
  }, [ecosystemUpdates, ecosystemFilterChip, deferredFilterText])

  // Counts for PATH Doctor & Runtimes badges
  const brokenPathCount = useMemo(
    () => pathEntries.filter((p) => !p.exists).length,
    [pathEntries]
  )
  const duplicatePathCount = useMemo(
    () => pathEntries.filter((p) => p.isDuplicate).length,
    [pathEntries]
  )
  const shadowConflictCount = useMemo(
    () => devRuntimes.filter((r) => r.hasShadowConflict).length,
    [devRuntimes]
  )

  const isOpRunning = opState?.status === 'running'
  const isAnyLoading =
    loadingUpdates ||
    loadingInstalled ||
    loadingPins ||
    loadingSearch ||
    loadingEcosystem ||
    loadingSnapshots ||
    loadingWinUpdate ||
    scanningWinUpdate ||
    Boolean(winUpdateActionBusy) ||
    loadingRuntimes ||
    loadingJobs ||
    loadingServices ||
    loadingTasks ||
    loadingPorts ||
    loadingCleanup ||
    cleaningBusy ||
    loadingSecurity

  return (
    <div className="shelf-module-panel system-panel">
      {/* Header */}
      <div className="shelf-panel-header">
        <div className="shelf-panel-title-group">
          <span className="shelf-panel-icon">{activeCategory === 'jobs' ? '⏰' : '🧰'}</span>
          <div>
            <h2 className="shelf-panel-title">
              {activeCategory === 'jobs'
                ? 'SudoLaunch Cron & Scheduled Jobs'
                : 'System Management Control Center'}
            </h2>
            <span className="shelf-panel-subtitle">
              {activeCategory === 'jobs'
                ? 'In-App Cron Expressions, Fixed Intervals, Lifecycle Hooks & Execution Logs'
                : 'WinGet, Windows Update, Runtimes & Env, Services & Tasks, Ports/Hosts/DNS, Storage/Power & Security'}
            </span>
          </div>
        </div>
        <div className="shelf-panel-header-actions">
          <button
            type="button"
            className={`system-admin-toggle-btn ${elevateByDefault ? 'is-elevated' : ''}`}
            onClick={() => setElevateByDefault((v) => !v)}
            title="Toggle Administrator (UAC) mode for operations (or hold Ctrl when clicking actions)"
          >
            <span>🛡️</span>
            <span>{elevateByDefault ? 'Admin: ON' : 'Admin: OFF'}</span>
          </button>
          <button
            type="button"
            className="shelf-panel-back-btn"
            onClick={() => window.api.termToggle?.()}
            title="Toggle Persistent Terminal (>_)"
          >
            &gt;_
          </button>
          <button
            type="button"
            className="shelf-panel-back-btn"
            onClick={onBackToPalette}
            title="Back to Command Palette (/)"
          >
            /
          </button>
          <button
            type="button"
            className="shelf-panel-close-btn"
            onClick={onClose}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Top-Level System Management Category Bar */}
      <div className="system-category-bar">
        <div className="system-category-pills-group">
          <button
            type="button"
            className={`system-category-pill ${activeCategory === 'winget' ? 'is-active' : ''}`}
            onClick={() => setActiveCategory('winget')}
          >
            <span>🪽 WinGet &amp; Updates</span>
            {updates.length > 0 && (
              <span className="system-category-badge">{updates.length}</span>
            )}
          </button>

          <button
            type="button"
            className={`system-category-pill ${activeCategory === 'jobs' ? 'is-active' : ''}`}
            onClick={() => setActiveCategory('jobs')}
          >
            <span>⏰ Cron &amp; Jobs</span>
            {scheduledJobs.filter((j) => j.enabled).length > 0 && (
              <span className="system-category-badge">
                {scheduledJobs.filter((j) => j.enabled).length}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`system-category-pill ${activeCategory === 'runtimes' ? 'is-active' : ''}`}
            onClick={() => setActiveCategory('runtimes')}
          >
            <span>🛠️ Runtimes &amp; Env</span>
            {(shadowConflictCount > 0 || brokenPathCount > 0) && (
              <span className="system-category-badge badge-warn">
                {shadowConflictCount + brokenPathCount}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`system-category-pill ${activeCategory === 'services' ? 'is-active' : ''}`}
            onClick={() => setActiveCategory('services')}
          >
            <span>⚙️ Services &amp; Tasks</span>
          </button>

          <button
            type="button"
            className={`system-category-pill ${activeCategory === 'ports' ? 'is-active' : ''}`}
            onClick={() => setActiveCategory('ports')}
          >
            <span>🔌 Ports &amp; Network</span>
            {portsLoadedOnce && ports.filter((p) => p.isCommonDevPort).length > 0 && (
              <span className="system-category-badge">
                {ports.filter((p) => p.isCommonDevPort).length} dev
              </span>
            )}
          </button>

          <button
            type="button"
            className={`system-category-pill ${activeCategory === 'cleanup' ? 'is-active' : ''}`}
            onClick={() => setActiveCategory('cleanup')}
          >
            <span>🧹 Disk &amp; Power</span>
          </button>

          <button
            type="button"
            className={`system-category-pill ${activeCategory === 'security' ? 'is-active' : ''}`}
            onClick={() => setActiveCategory('security')}
          >
            <span>🛡️ Security &amp; Logs</span>
            {securityLoadedOnce && eventLogs.filter((e) => e.level === 'Critical').length > 0 && (
              <span className="system-category-badge badge-warn">
                {eventLogs.filter((e) => e.level === 'Critical').length}
              </span>
            )}
          </button>
        </div>

        <div className="system-category-right">
          {winUpdateStatus?.rebootPending && (
            <button
              type="button"
              className="shelf-btn shelf-btn-warning shelf-btn-sm"
              onClick={() => {
                setActiveCategory('winget')
                setSubTab('winupdate')
              }}
              title={`Pending Reboot Required: ${winUpdateStatus.rebootReasons.join(' • ')}`}
            >
              ⚠️ Reboot Pending ({winUpdateStatus.rebootReasons.length})
            </button>
          )}
          <span className="system-category-hint">
            <kbd className="palette-kbd">Ctrl</kbd>+Click for UAC
          </span>
          <button
            type="button"
            className="shelf-btn shelf-btn-sm"
            disabled={isAnyLoading}
            onClick={handleRefreshCurrentView}
            title="Refresh current view"
          >
            {isAnyLoading ? (
              <>
                <span className="sudo-spinner sudo-spinner-sm" /> Refreshing…
              </>
            ) : (
              '🔄 Refresh'
            )}
          </button>
        </div>
      </div>

      {feedback && <div className="shelf-panel-status-banner">{feedback}</div>}

      {/* Live Operation Progress Drawer */}
      {opState && (
        <div className={`winget-op-drawer status-${opState.status}`}>
          <div className="winget-op-header">
            <div className="winget-op-title-row">
              {opState.status === 'running' ? (
                <span className="sudo-spinner sudo-spinner-sm" />
              ) : (
                <span className={`winget-op-dot status-${opState.status}`} />
              )}
              <span className="winget-op-title">
                {opState.status === 'running'
                  ? `Running ${opState.action}: ${opState.packageName}`
                  : opState.status === 'success'
                    ? `Completed ${opState.action}: ${opState.packageName}`
                    : `Failed ${opState.action}: ${opState.packageName}`}
              </span>
              {opState.batchTotal && opState.batchTotal > 1 && (
                <span className="winget-badge winget-badge-pinned">
                  Step {opState.batchCurrent ?? 1} / {opState.batchTotal}
                </span>
              )}
              {opState.elevated && <span className="winget-badge winget-badge-admin">🛡️ UAC</span>}
            </div>
            <div className="winget-op-actions">
              <button
                type="button"
                className="shelf-btn shelf-btn-sm"
                onClick={() => setShowOpLogs((v) => !v)}
              >
                {showOpLogs ? 'Hide Output' : 'Logs'}
              </button>
              {opState.status === 'running' && !opState.elevated ? (
                <button
                  type="button"
                  className="shelf-btn shelf-btn-danger shelf-btn-sm"
                  onClick={() => window.api.cancelWingetOperation?.()}
                >
                  Cancel
                </button>
              ) : (
                opState.status !== 'running' && (
                  <button
                    type="button"
                    className="shelf-btn shelf-btn-sm"
                    onClick={() => setOpState(null)}
                  >
                    ✕
                  </button>
                )
              )}
            </div>
          </div>
          <div className="winget-op-progress-line">{opState.progressText}</div>
          {showOpLogs && opState.logLines.length > 0 && (
            <pre className="winget-op-log-box">{opState.logLines.join('\n')}</pre>
          )}
        </div>
      )}

      {/* Inline Pin Configuration Drawer */}
      {pinTarget && (
        <div className="winget-pin-editor-card">
          <div className="winget-pin-editor-header">
            <div>
              <div className="winget-pin-editor-title">
                📌 Configure Package Pin: <strong>{pinTarget.name}</strong>
              </div>
              <div className="winget-pin-editor-sub">
                ID: <code>{pinTarget.id}</code> • Installed: <code>{pinTarget.version || 'N/A'}</code>
              </div>
            </div>
            <button
              type="button"
              className="shelf-btn shelf-btn-sm"
              onClick={() => setPinTarget(null)}
            >
              ✕ Close
            </button>
          </div>

          <div className="winget-pin-mode-options">
            <label
              className={`winget-pin-mode-card ${pinModeChoice === 'standard' ? 'is-selected' : ''}`}
              onClick={() => setPinModeChoice('standard')}
            >
              <input
                type="radio"
                name="pinMode"
                checked={pinModeChoice === 'standard'}
                onChange={() => setPinModeChoice('standard')}
              />
              <div>
                <div className="winget-pin-mode-name">📌 Standard Pin (Pinning)</div>
                <div className="winget-pin-mode-desc">
                  Skipped by <code>upgrade --all</code>, but can still be upgraded explicitly.
                </div>
              </div>
            </label>

            <label
              className={`winget-pin-mode-card ${pinModeChoice === 'blocking' ? 'is-selected' : ''}`}
              onClick={() => setPinModeChoice('blocking')}
            >
              <input
                type="radio"
                name="pinMode"
                checked={pinModeChoice === 'blocking'}
                onChange={() => setPinModeChoice('blocking')}
              />
              <div>
                <div className="winget-pin-mode-name">🛑 Blocking Pin (--blocking)</div>
                <div className="winget-pin-mode-desc">
                  Blocks all upgrades until the pin is explicitly removed.
                </div>
              </div>
            </label>

            <label
              className={`winget-pin-mode-card ${pinModeChoice === 'version' ? 'is-selected' : ''}`}
              onClick={() => setPinModeChoice('version')}
            >
              <input
                type="radio"
                name="pinMode"
                checked={pinModeChoice === 'version'}
                onChange={() => setPinModeChoice('version')}
              />
              <div>
                <div className="winget-pin-mode-name">🔒 Version-Gated Pin (--version)</div>
                <div className="winget-pin-mode-desc">
                  Allow updates only within a matching version range (e.g. <code>24.*</code>).
                </div>
              </div>
            </label>
          </div>

          {pinModeChoice === 'version' && (
            <div className="winget-pin-version-row">
              <span>Allowed version pattern:</span>
              <input
                type="text"
                className="winget-filter-input"
                style={{ width: '180px' }}
                placeholder="e.g. 2.56.* or 24.*"
                value={pinVersionInput}
                onChange={(e) => setPinVersionInput(e.target.value)}
              />
            </div>
          )}

          <div className="winget-pin-editor-footer">
            <button
              type="button"
              className="shelf-btn shelf-btn-primary shelf-btn-sm"
              disabled={pinBusy}
              onClick={(e) => handleSavePin(e.ctrlKey || e.metaKey)}
            >
              {pinBusy ? 'Saving...' : 'Save Pin'}
            </button>
            {pinTarget.isPinned && (
              <button
                type="button"
                className="shelf-btn shelf-btn-danger shelf-btn-sm"
                disabled={pinBusy}
                onClick={(e) => handleRemovePin(pinTarget.id, pinTarget.name, e.ctrlKey || e.metaKey)}
              >
                Remove Pin
              </button>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
         CATEGORY 1: WINGET & UPDATES (With Split-Pane Package Inspector)
         ==================================================================== */}
      {activeCategory === 'winget' && (
        <div className="system-winget-container">
          <div className="winget-toolbar-row">
            <div className="profile-tabs-bar" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <button
                type="button"
                className={`profile-tab-btn ${subTab === 'updates' ? 'is-active' : ''}`}
                onClick={() => setSubTab('updates')}
              >
                <span>⬆️ Updates</span>
                <span className="profile-tab-count">{updates.length}</span>
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${subTab === 'installed' ? 'is-active' : ''}`}
                onClick={() => setSubTab('installed')}
              >
                <span>📦 Installed</span>
                {installedLoadedOnce && <span className="profile-tab-count">{installed.length}</span>}
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${subTab === 'pins' ? 'is-active' : ''}`}
                onClick={() => setSubTab('pins')}
              >
                <span>📌 Pinned</span>
                <span className="profile-tab-count">{pins.length}</span>
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${subTab === 'search' ? 'is-active' : ''}`}
                onClick={() => setSubTab('search')}
              >
                <span>🔍 Search Catalog</span>
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${subTab === 'ecosystem' ? 'is-active' : ''}`}
                onClick={() => setSubTab('ecosystem')}
              >
                <span>🌐 npm / pip / WSL</span>
                {ecosystemLoadedOnce && (
                  <span className="profile-tab-count">{ecosystemUpdates.length}</span>
                )}
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${subTab === 'snapshots' ? 'is-active' : ''}`}
                onClick={() => setSubTab('snapshots')}
              >
                <span>📸 Snapshots</span>
                {snapshotsLoadedOnce && (
                  <span className="profile-tab-count">{snapshots.length}</span>
                )}
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${subTab === 'winupdate' ? 'is-active' : ''}`}
                onClick={() => setSubTab('winupdate')}
              >
                <span>🪟 Windows Update</span>
                {winUpdateStatus?.rebootPending ? (
                  <span
                    className="profile-tab-count"
                    style={{ background: 'rgba(245, 158, 11, 0.25)', color: '#fbbf24' }}
                  >
                    ⚠️ Reboot
                  </span>
                ) : winUpdateStatus?.pendingScanned &&
                  winUpdateStatus.pendingUpdates.length > 0 ? (
                  <span className="profile-tab-count">{winUpdateStatus.pendingUpdates.length}</span>
                ) : null}
              </button>
            </div>

            <div className="winget-toolbar-right">
              {subTab !== 'search' && subTab !== 'snapshots' && subTab !== 'winupdate' && (
                <input
                  type="text"
                  className="winget-filter-input"
                  placeholder={`Filter ${subTab}...`}
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                />
              )}
            </div>
          </div>

          <div className="winget-split-workspace">
            <div className="winget-main-column">
              {/* Multi-Select Batch Action Bar */}
              {selectedIds.size > 0 && (subTab === 'updates' || subTab === 'installed') && (
                <div className="winget-batch-bar">
                  <span className="winget-batch-count">
                    ✅ <strong>{selectedIds.size}</strong> package{selectedIds.size === 1 ? '' : 's'} selected
                  </span>
                  <div className="winget-batch-actions">
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-primary shelf-btn-sm"
                      disabled={isOpRunning}
                      onClick={(e) =>
                        handleBatchAction(
                          'upgrade',
                          subTab === 'updates' ? updates : installed,
                          e.ctrlKey || e.metaKey
                        )
                      }
                    >
                      🚀 Upgrade Selected ({selectedIds.size})
                    </button>
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-warning shelf-btn-sm"
                      disabled={pinBusy}
                      onClick={(e) =>
                        handleBatchAction(
                          'pin',
                          subTab === 'updates' ? updates : installed,
                          e.ctrlKey || e.metaKey
                        )
                      }
                    >
                      📌 Pin Selected ({selectedIds.size})
                    </button>
                    {subTab === 'installed' && (
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-danger shelf-btn-sm"
                        disabled={isOpRunning}
                        onClick={(e) =>
                          handleBatchAction('uninstall', installed, e.ctrlKey || e.metaKey)
                        }
                      >
                        🗑️ Uninstall Selected ({selectedIds.size})
                      </button>
                    )}
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-sm"
                      onClick={() => setSelectedIds(new Set())}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}

              {/* SUB-TAB 1: UPDATES AVAILABLE */}
              {subTab === 'updates' && (
                <div className="winget-tab-body">
                  {winUpdateStatus?.rebootPending && (
                    <div
                      className="winget-summary-bar"
                      style={{
                        background: 'rgba(245, 158, 11, 0.12)',
                        borderColor: 'rgba(245, 158, 11, 0.35)'
                      }}
                    >
                      <span className="winget-summary-text" style={{ color: '#fcd34d' }}>
                        ⚠️ <strong>System Reboot Pending:</strong>{' '}
                        {winUpdateStatus.rebootReasons.join(' • ')}
                      </span>
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-warning shelf-btn-sm"
                        onClick={() => setSubTab('winupdate')}
                      >
                        🪟 View Reboot &amp; Windows Update →
                      </button>
                    </div>
                  )}
                  <div className="winget-summary-bar">
                    <div className="winget-summary-left">
                      {filteredUpdates.length > 0 && (
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-sm"
                          onClick={() => {
                            if (selectedIds.size === filteredUpdates.length) {
                              setSelectedIds(new Set())
                            } else {
                              setSelectedIds(new Set(filteredUpdates.map((u) => u.id)))
                            }
                          }}
                        >
                          {selectedIds.size === filteredUpdates.length && filteredUpdates.length > 0
                            ? '☑ Deselect All'
                            : '☐ Select All'}
                        </button>
                      )}
                      <span className="winget-summary-text">
                        {loadingUpdates
                          ? 'Checking for package updates...'
                          : `${filteredUpdates.length} update${filteredUpdates.length === 1 ? '' : 's'} available`}
                      </span>
                      <label className="winget-checkbox-pill" title="Pass --include-pinned when upgrading all">
                        <input
                          type="checkbox"
                          checked={includePinnedInUpgrade}
                          onChange={(e) => setIncludePinnedInUpgrade(e.target.checked)}
                        />
                        <span>Include pinned</span>
                      </label>
                    </div>
                    <div className="winget-summary-actions">
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-primary shelf-btn-sm"
                        disabled={updates.length === 0 || isOpRunning}
                        onClick={(e) =>
                          handleRunAction({
                            action: 'upgrade-all',
                            forceElevated: e.ctrlKey || e.metaKey,
                            includePinned: includePinnedInUpgrade
                          })
                        }
                        title="Upgrade all outdated packages (Ctrl+Click for Elevated)"
                      >
                        🚀 Upgrade All ({updates.length})
                      </button>
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-sm"
                        disabled={updates.length === 0}
                        onClick={() =>
                          handleRunAction({
                            action: 'upgrade-all',
                            includePinned: includePinnedInUpgrade,
                            inTerminal: true
                          })
                        }
                        title="Run winget upgrade --all in SudoLaunch Terminal"
                      >
                        &gt;_ All in Terminal
                      </button>
                    </div>
                  </div>

                  <div className="winget-pkg-list">
                    {loadingUpdates && updates.length === 0 ? (
                      <div className="profile-empty-list">Scanning installed packages for updates...</div>
                    ) : filteredUpdates.length === 0 ? (
                      <div className="profile-empty-list">
                        {updates.length === 0
                          ? '🎉 All WinGet packages are up to date!'
                          : 'No updates match your filter.'}
                      </div>
                    ) : (
                      filteredUpdates.map((pkg) => (
                        <div
                          key={pkg.id}
                          className={`winget-pkg-row ${pkg.isPinned ? 'is-pinned' : ''} ${
                            inspectedPkgId === pkg.id ? 'is-inspected' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="winget-row-checkbox"
                            checked={selectedIds.has(pkg.id)}
                            onChange={() => toggleSelectId(pkg.id)}
                          />
                          <div
                            className="winget-pkg-main"
                            onClick={() => void handleInspectPackage(pkg.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <div className="winget-pkg-title-row">
                              <span className="winget-pkg-name" title={pkg.name}>
                                {pkg.name}
                              </span>
                              <button
                                type="button"
                                className="winget-pkg-id-btn"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCopyText(pkg.id, 'Copied Package ID')
                                }}
                                title="Click to copy Package ID"
                              >
                                {pkg.id}
                              </button>
                              {pkg.isPinned && (
                                <span
                                  className={`winget-badge ${
                                    pkg.pinType === 'Blocking'
                                      ? 'winget-badge-blocked'
                                      : pkg.pinType === 'Gating'
                                        ? 'winget-badge-gated'
                                        : 'winget-badge-pinned'
                                  }`}
                                >
                                  {pkg.pinType === 'Blocking'
                                    ? '🛑 Blocked'
                                    : pkg.pinType === 'Gating'
                                      ? `🔒 ${pkg.pinnedVersion || 'Gated'}`
                                      : '📌 Pinned'}
                                </span>
                              )}
                            </div>
                            <div className="winget-pkg-meta-row">
                              <span className="winget-version-diff">
                                <span className="winget-ver-old">{pkg.version}</span>
                                <span className="winget-ver-arrow">→</span>
                                <span className="winget-ver-new">{pkg.available}</span>
                              </span>
                              {pkg.source && <span className="winget-source-tag">{pkg.source}</span>}
                            </div>
                          </div>

                          <div className="winget-pkg-actions">
                            <button
                              type="button"
                              className="shelf-btn shelf-btn-primary shelf-btn-sm"
                              disabled={isOpRunning}
                              onClick={(e) =>
                                handleRunAction({
                                  action: 'upgrade',
                                  id: pkg.id,
                                  name: pkg.name,
                                  forceElevated: e.ctrlKey || e.metaKey,
                                  includePinned: pkg.isPinned ? true : includePinnedInUpgrade
                                })
                              }
                              title="Upgrade package (Ctrl+Click for UAC Admin)"
                            >
                              ⬆️ Update
                            </button>
                            <button
                              type="button"
                              className={`shelf-btn shelf-btn-sm ${pkg.isPinned ? 'shelf-btn-warning' : ''}`}
                              onClick={() => openPinEditor(pkg)}
                              title={pkg.isPinned ? 'Edit or remove pin' : 'Pin this package'}
                            >
                              {pkg.isPinned ? '📌 Pinned' : '📌 Pin'}
                            </button>
                            <button
                              type="button"
                              className={`shelf-btn shelf-btn-sm ${
                                inspectedPkgId === pkg.id ? 'shelf-btn-primary' : ''
                              }`}
                              onClick={() => void handleInspectPackage(pkg.id)}
                              title="Inspect package metadata, release notes, and versions"
                            >
                              ℹ️
                            </button>
                            <button
                              type="button"
                              className="shelf-btn shelf-btn-sm"
                              onClick={() =>
                                handleRunAction({
                                  action: 'upgrade',
                                  id: pkg.id,
                                  name: pkg.name,
                                  includePinned: pkg.isPinned,
                                  inTerminal: true
                                })
                              }
                              title="Run upgrade in SudoLaunch Terminal"
                            >
                              &gt;_
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* SUB-TAB 2: INSTALLED PACKAGES */}
              {subTab === 'installed' && (
                <div className="winget-tab-body">
                  <div className="winget-summary-bar">
                    <div className="winget-chip-group">
                      <button
                        type="button"
                        className={`winget-filter-chip ${installedFilterChip === 'winget' ? 'is-active' : ''}`}
                        onClick={() => setInstalledFilterChip('winget')}
                      >
                        WinGet Managed ({wingetSourceCount})
                      </button>
                      <button
                        type="button"
                        className={`winget-filter-chip ${installedFilterChip === 'all' ? 'is-active' : ''}`}
                        onClick={() => setInstalledFilterChip('all')}
                      >
                        All Installed ({installed.length})
                      </button>
                      <button
                        type="button"
                        className={`winget-filter-chip ${installedFilterChip === 'outdated' ? 'is-active' : ''}`}
                        onClick={() => setInstalledFilterChip('outdated')}
                      >
                        Has Update ({outdatedInstalledCount})
                      </button>
                      <button
                        type="button"
                        className={`winget-filter-chip ${installedFilterChip === 'pinned' ? 'is-active' : ''}`}
                        onClick={() => setInstalledFilterChip('pinned')}
                      >
                        Pinned ({pinnedInstalledCount})
                      </button>
                    </div>
                    <span className="winget-summary-text">{filteredInstalled.length} shown</span>
                  </div>

                  <div className="winget-pkg-list">
                    {loadingInstalled && installed.length === 0 ? (
                      <div className="profile-empty-list">Loading installed packages via WinGet...</div>
                    ) : filteredInstalled.length === 0 ? (
                      <div className="profile-empty-list">No installed packages match your filter.</div>
                    ) : (
                      filteredInstalled.slice(0, 180).map((pkg) => (
                        <div
                          key={`${pkg.id}-${pkg.version}`}
                          className={`winget-pkg-row ${
                            inspectedPkgId === pkg.id ? 'is-inspected' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="winget-row-checkbox"
                            checked={selectedIds.has(pkg.id)}
                            onChange={() => toggleSelectId(pkg.id)}
                          />
                          <div
                            className="winget-pkg-main"
                            onClick={() => void handleInspectPackage(pkg.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <div className="winget-pkg-title-row">
                              <span className="winget-pkg-name" title={pkg.name}>
                                {pkg.name}
                              </span>
                              <button
                                type="button"
                                className="winget-pkg-id-btn"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCopyText(pkg.id, 'Copied Package ID')
                                }}
                                title="Click to copy Package ID"
                              >
                                {pkg.id}
                              </button>
                              {pkg.isPinned && (
                                <span className="winget-badge winget-badge-pinned">
                                  📌 {pkg.pinType || 'Pinned'}
                                </span>
                              )}
                            </div>
                            <div className="winget-pkg-meta-row">
                              <span className="winget-ver-current">v{pkg.version}</span>
                              {pkg.available && (
                                <span className="winget-version-diff">
                                  <span className="winget-ver-arrow">→</span>
                                  <span className="winget-ver-new">{pkg.available} available</span>
                                </span>
                              )}
                              {pkg.source && <span className="winget-source-tag">{pkg.source}</span>}
                            </div>
                          </div>

                          <div className="winget-pkg-actions">
                            {pkg.available && (
                              <button
                                type="button"
                                className="shelf-btn shelf-btn-primary shelf-btn-sm"
                                disabled={isOpRunning}
                                onClick={(e) =>
                                  handleRunAction({
                                    action: 'upgrade',
                                    id: pkg.id,
                                    name: pkg.name,
                                    forceElevated: e.ctrlKey || e.metaKey,
                                    includePinned: true
                                  })
                                }
                              >
                                ⬆️ Update
                              </button>
                            )}
                            {(pkg.source === 'winget' || pkg.isPinned) && (
                              <button
                                type="button"
                                className={`shelf-btn shelf-btn-sm ${pkg.isPinned ? 'shelf-btn-warning' : ''}`}
                                onClick={() => openPinEditor(pkg)}
                              >
                                📌 {pkg.isPinned ? 'Edit Pin' : 'Pin'}
                              </button>
                            )}
                            {pkg.source === 'winget' && (
                              <button
                                type="button"
                                className={`shelf-btn shelf-btn-sm ${
                                  inspectedPkgId === pkg.id ? 'shelf-btn-primary' : ''
                                }`}
                                onClick={() => void handleInspectPackage(pkg.id)}
                                title="Inspect package metadata & versions"
                              >
                                ℹ️
                              </button>
                            )}
                            <button
                              type="button"
                              className={`shelf-btn shelf-btn-sm ${
                                confirmUninstallId === pkg.id ? 'shelf-btn-danger' : ''
                              }`}
                              disabled={isOpRunning}
                              onClick={(e) =>
                                handleRunAction({
                                  action: 'uninstall',
                                  id: pkg.id,
                                  name: pkg.name,
                                  forceElevated: e.ctrlKey || e.metaKey
                                })
                              }
                              title="Uninstall package (click twice to confirm)"
                            >
                              {confirmUninstallId === pkg.id ? 'Confirm?' : '🗑️'}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* SUB-TAB 3: PINNED PACKAGES */}
              {subTab === 'pins' && (
                <div className="winget-tab-body">
                  <div className="winget-summary-bar">
                    <span className="winget-summary-text">
                      {pins.length === 0
                        ? 'No package pins configured'
                        : `${pins.length} pinned package${pins.length === 1 ? '' : 's'}`}
                    </span>
                    <div className="winget-summary-actions">
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-primary shelf-btn-sm"
                        onClick={() => setShowAddPinById((v) => !v)}
                      >
                        + Pin by ID
                      </button>
                      {pins.length > 0 && (
                        <button
                          type="button"
                          className={`shelf-btn shelf-btn-sm ${confirmResetPins ? 'shelf-btn-danger' : ''}`}
                          disabled={pinBusy}
                          onClick={(e) => handleResetAllPins(e.ctrlKey || e.metaKey)}
                        >
                          {confirmResetPins ? '⚠️ Confirm Reset All?' : 'Reset All Pins'}
                        </button>
                      )}
                    </div>
                  </div>

                  {showAddPinById && (
                    <div className="winget-manual-pin-bar">
                      <input
                        type="text"
                        className="winget-filter-input"
                        style={{ flex: 1 }}
                        placeholder="Enter exact WinGet Package ID (e.g. Microsoft.Git or OpenJS.NodeJS.LTS)..."
                        value={manualPinId}
                        onChange={(e) => setManualPinId(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && manualPinId.trim()) {
                            openPinEditor({
                              id: manualPinId.trim(),
                              name: manualPinId.trim(),
                              version: ''
                            })
                            setShowAddPinById(false)
                            setManualPinId('')
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-primary shelf-btn-sm"
                        disabled={!manualPinId.trim()}
                        onClick={() => {
                          openPinEditor({
                            id: manualPinId.trim(),
                            name: manualPinId.trim(),
                            version: ''
                          })
                          setShowAddPinById(false)
                          setManualPinId('')
                        }}
                      >
                        Configure Pin...
                      </button>
                    </div>
                  )}

                  <div className="winget-pkg-list">
                    {loadingPins && pins.length === 0 ? (
                      <div className="profile-empty-list">Loading pinned packages...</div>
                    ) : filteredPins.length === 0 ? (
                      <div className="profile-empty-list">
                        No pinned packages. You can pin packages from the Updates or Installed tabs to hold back upgrades.
                      </div>
                    ) : (
                      filteredPins.map((p) => (
                        <div key={p.id} className="winget-pkg-row is-pinned">
                          <div
                            className="winget-pkg-main"
                            onClick={() => void handleInspectPackage(p.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <div className="winget-pkg-title-row">
                              <span className="winget-pkg-name">{p.name}</span>
                              <button
                                type="button"
                                className="winget-pkg-id-btn"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCopyText(p.id, 'Copied Package ID')
                                }}
                              >
                                {p.id}
                              </button>
                              <span
                                className={`winget-badge ${
                                  p.pinType === 'Blocking'
                                    ? 'winget-badge-blocked'
                                    : p.pinType === 'Gating'
                                      ? 'winget-badge-gated'
                                      : 'winget-badge-pinned'
                                }`}
                              >
                                {p.pinType === 'Blocking'
                                  ? '🛑 Blocking'
                                  : p.pinType === 'Gating'
                                    ? `🔒 Gating (${p.pinnedVersion || '*'})`
                                    : '📌 Standard Pin'}
                              </span>
                            </div>
                            <div className="winget-pkg-meta-row">
                              <span className="winget-ver-current">Installed: v{p.version}</span>
                              {p.pinnedVersion && (
                                <span className="winget-source-tag">Pinned range: {p.pinnedVersion}</span>
                              )}
                              {p.source && <span className="winget-source-tag">{p.source}</span>}
                            </div>
                          </div>

                          <div className="winget-pkg-actions">
                            <button
                              type="button"
                              className="shelf-btn shelf-btn-sm"
                              onClick={() =>
                                openPinEditor({
                                  id: p.id,
                                  name: p.name,
                                  version: p.version,
                                  isPinned: true,
                                  pinType: p.pinType,
                                  pinnedVersion: p.pinnedVersion
                                })
                              }
                            >
                              Edit Pin
                            </button>
                            <button
                              type="button"
                              className="shelf-btn shelf-btn-danger shelf-btn-sm"
                              disabled={pinBusy}
                              onClick={(e) => handleRemovePin(p.id, p.name, e.ctrlKey || e.metaKey)}
                            >
                              Unpin
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* SUB-TAB 4: SEARCH & INSTALL CATALOG */}
              {subTab === 'search' && (
                <div className="winget-tab-body">
                  <div className="winget-search-bar-row">
                    <input
                      type="text"
                      className="winget-search-input"
                      placeholder="Search WinGet repository by package name, ID, or tag (press Enter)..."
                      value={catalogQuery}
                      onChange={(e) => setCatalogQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          void handleCatalogSearch()
                        }
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-primary shelf-btn-sm"
                      disabled={!catalogQuery.trim() || loadingSearch}
                      onClick={() => void handleCatalogSearch()}
                    >
                      {loadingSearch ? 'Searching...' : '🔍 Search'}
                    </button>
                  </div>

                  <div className="winget-chip-group">
                    {POPULAR_SEARCH_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        className={`winget-filter-chip ${
                          catalogQuery.toLowerCase() === chip.toLowerCase() ? 'is-active' : ''
                        }`}
                        onClick={() => {
                          setCatalogQuery(chip)
                          void handleCatalogSearch(chip)
                        }}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>

                  <div className="winget-pkg-list">
                    {loadingSearch ? (
                      <div className="profile-empty-list">Searching WinGet catalog for "{catalogQuery}"...</div>
                    ) : searchResults.length === 0 ? (
                      <div className="profile-empty-list">
                        {catalogQuery.trim()
                          ? 'No packages found matching your search.'
                          : 'Enter a package name or click a tag above to search the WinGet catalog.'}
                      </div>
                    ) : (
                      searchResults.map((item) => (
                        <div
                          key={item.id}
                          className={`winget-pkg-row ${
                            inspectedPkgId === item.id ? 'is-inspected' : ''
                          }`}
                        >
                          <div
                            className="winget-pkg-main"
                            onClick={() => void handleInspectPackage(item.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <div className="winget-pkg-title-row">
                              <span className="winget-pkg-name" title={item.name}>
                                {item.name}
                              </span>
                              <button
                                type="button"
                                className="winget-pkg-id-btn"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCopyText(item.id, 'Copied Package ID')
                                }}
                                title="Click to copy Package ID"
                              >
                                {item.id}
                              </button>
                              {item.isInstalled && (
                                <span className="winget-badge winget-badge-installed">
                                  ✓ Installed{item.installedVersion ? ` (${item.installedVersion})` : ''}
                                </span>
                              )}
                            </div>
                            <div className="winget-pkg-meta-row">
                              <span className="winget-ver-current">Latest: v{item.version}</span>
                              {item.match && <span className="winget-source-tag">{item.match}</span>}
                              {item.source && <span className="winget-source-tag">{item.source}</span>}
                            </div>
                          </div>

                          <div className="winget-pkg-actions">
                            <button
                              type="button"
                              className="shelf-btn shelf-btn-primary shelf-btn-sm"
                              disabled={isOpRunning}
                              onClick={(e) =>
                                handleRunAction({
                                  action: 'install',
                                  id: item.id,
                                  name: item.name,
                                  forceElevated: e.ctrlKey || e.metaKey
                                })
                              }
                              title="Install package via WinGet (Ctrl+Click for UAC Admin)"
                            >
                              📥 {item.isInstalled ? 'Reinstall' : 'Install'}
                            </button>
                            <button
                              type="button"
                              className={`shelf-btn shelf-btn-sm ${
                                inspectedPkgId === item.id ? 'shelf-btn-primary' : ''
                              }`}
                              onClick={() => void handleInspectPackage(item.id)}
                              title="Inspect package details & choose version"
                            >
                              ℹ️
                            </button>
                            <button
                              type="button"
                              className="shelf-btn shelf-btn-sm"
                              onClick={() =>
                                handleRunAction({
                                  action: 'install',
                                  id: item.id,
                                  name: item.name,
                                  inTerminal: true
                                })
                              }
                              title="Run winget install in SudoLaunch Terminal"
                            >
                              &gt;_
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* SUB-TAB 5: ECOSYSTEM UPDATES (npm, pip, WSL) */}
              {subTab === 'ecosystem' && (
                <div className="winget-tab-body">
                  <div className="winget-summary-bar">
                    <div className="winget-chip-group">
                      <button
                        type="button"
                        className={`winget-filter-chip ${ecosystemFilterChip === 'all' ? 'is-active' : ''}`}
                        onClick={() => setEcosystemFilterChip('all')}
                      >
                        All ({ecosystemUpdates.length})
                      </button>
                      <button
                        type="button"
                        className={`winget-filter-chip ${ecosystemFilterChip === 'npm' ? 'is-active' : ''}`}
                        onClick={() => setEcosystemFilterChip('npm')}
                      >
                        📦 npm Global ({ecosystemUpdates.filter((e) => e.manager === 'npm').length})
                      </button>
                      <button
                        type="button"
                        className={`winget-filter-chip ${ecosystemFilterChip === 'pip' ? 'is-active' : ''}`}
                        onClick={() => setEcosystemFilterChip('pip')}
                      >
                        🐍 Python pip ({ecosystemUpdates.filter((e) => e.manager === 'pip').length})
                      </button>
                      <button
                        type="button"
                        className={`winget-filter-chip ${ecosystemFilterChip === 'wsl' ? 'is-active' : ''}`}
                        onClick={() => setEcosystemFilterChip('wsl')}
                      >
                        🐧 WSL ({ecosystemUpdates.filter((e) => e.manager === 'wsl').length})
                      </button>
                    </div>
                    <div className="winget-summary-actions">
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-primary shelf-btn-sm"
                        onClick={async () => {
                          const res = await window.api.runEcosystemUpdate?.({
                            manager: 'npm',
                            all: true,
                            inTerminal: true
                          })
                          if (res?.message) flash(res.message)
                        }}
                      >
                        📦 Update All npm Global (&gt;_)
                      </button>
                    </div>
                  </div>

                  <div className="winget-pkg-list">
                    {loadingEcosystem ? (
                      <div className="profile-empty-list">
                        Checking npm global packages, Python pip packages, and WSL status...
                      </div>
                    ) : filteredEcosystem.length === 0 ? (
                      <div className="profile-empty-list">
                        🎉 All checked ecosystem packages are up to date!
                      </div>
                    ) : (
                      filteredEcosystem.map((item) => (
                        <div key={`${item.manager}-${item.id}`} className="winget-pkg-row">
                          <div className="winget-pkg-main">
                            <div className="winget-pkg-title-row">
                              <span className="winget-badge winget-badge-installed">
                                {item.manager === 'npm'
                                  ? '📦 npm -g'
                                  : item.manager === 'pip'
                                    ? '🐍 pip'
                                    : '🐧 WSL'}
                              </span>
                              <span className="winget-pkg-name">{item.name}</span>
                            </div>
                            <div className="winget-pkg-meta-row">
                              <span className="winget-version-diff">
                                <span className="winget-ver-old">{item.currentVersion}</span>
                                <span className="winget-ver-arrow">→</span>
                                <span className="winget-ver-new">{item.latestVersion}</span>
                              </span>
                            </div>
                          </div>
                          <div className="winget-pkg-actions">
                            <button
                              type="button"
                              className="shelf-btn shelf-btn-primary shelf-btn-sm"
                              disabled={ecosystemBusyKey !== null}
                              onClick={async () => {
                                const key = `${item.manager}:${item.id}`
                                setEcosystemBusyKey(key)
                                flash(`Updating ${item.name}...`)
                                try {
                                  const res = await window.api.runEcosystemUpdate?.({
                                    manager: item.manager,
                                    id: item.id,
                                    inTerminal: item.manager === 'wsl'
                                  })
                                  if (res?.message) flash(res.message)
                                  await loadEcosystem(true)
                                } finally {
                                  setEcosystemBusyKey(null)
                                }
                              }}
                            >
                              {ecosystemBusyKey === `${item.manager}:${item.id}` ? (
                                <>
                                  <span className="sudo-spinner sudo-spinner-sm" /> Updating…
                                </>
                              ) : (
                                '⬆️ Update'
                              )}
                            </button>
                            <button
                              type="button"
                              className="shelf-btn shelf-btn-sm"
                              onClick={async () => {
                                const res = await window.api.runEcosystemUpdate?.({
                                  manager: item.manager,
                                  id: item.id,
                                  inTerminal: true
                                })
                                if (res?.message) flash(res.message)
                              }}
                              title="Run update in SudoLaunch Terminal"
                            >
                              &gt;_
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* SUB-TAB 6: WORKSTATION SNAPSHOTS (Export / Import) */}
              {subTab === 'snapshots' && (
                <div className="winget-tab-body">
                  <div className="winget-search-bar-row">
                    <input
                      type="text"
                      className="winget-search-input"
                      placeholder="Snapshot label (e.g. Pre-Upgrade Workstation or Dev Stack)..."
                      value={newSnapshotName}
                      onChange={(e) => setNewSnapshotName(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && !creatingSnapshot) {
                          setCreatingSnapshot(true)
                          const res = await window.api.createWingetSnapshot?.(
                            newSnapshotName || undefined
                          )
                          setCreatingSnapshot(false)
                          if (res) {
                            setSnapshots(res.snapshots)
                            setNewSnapshotName('')
                            flash(res.message)
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-primary shelf-btn-sm"
                      disabled={creatingSnapshot}
                      onClick={async () => {
                        setCreatingSnapshot(true)
                        const res = await window.api.createWingetSnapshot?.(
                          newSnapshotName || undefined
                        )
                        setCreatingSnapshot(false)
                        if (res) {
                          setSnapshots(res.snapshots)
                          setNewSnapshotName('')
                          flash(res.message)
                        }
                      }}
                    >
                      {creatingSnapshot ? (
                        <>
                          <span className="sudo-spinner sudo-spinner-sm" /> Saving…
                        </>
                      ) : (
                        '📸 Save Snapshot'
                      )}
                    </button>
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-sm"
                      onClick={() => window.api.openWingetSnapshotsFolder?.()}
                      title="Open ~/.sudolaunch/winget-snapshots in File Explorer"
                    >
                      📂 Open Folder
                    </button>
                  </div>

                  <div className="winget-pkg-list">
                    {loadingSnapshots ? (
                      <div className="profile-empty-list">Loading WinGet workstation snapshots...</div>
                    ) : snapshots.length === 0 ? (
                      <div className="profile-empty-list">
                        No WinGet snapshots yet. Click "📸 Save Snapshot" above to export your installed WinGet packages and pin rules!
                      </div>
                    ) : (
                      snapshots.map((snap) => (
                        <div key={snap.filename} className="winget-pkg-row">
                          <div className="winget-pkg-main">
                            <div className="winget-pkg-title-row">
                              <span className="winget-pkg-name">📸 {snap.name}</span>
                              <span className="winget-badge winget-badge-installed">
                                {snap.packageCount} packages
                              </span>
                              <span className="winget-badge winget-badge-pinned">
                                {snap.pinCount} pins
                              </span>
                            </div>
                            <div className="winget-pkg-meta-row">
                              <span className="winget-ver-current">{snap.createdAt}</span>
                              <span className="winget-source-tag">{snap.filename}</span>
                              <span className="winget-source-tag">{snap.sizeKb} KB</span>
                            </div>
                          </div>

                          <div className="winget-pkg-actions">
                            <button
                              type="button"
                              className="shelf-btn shelf-btn-warning shelf-btn-sm"
                              onClick={async () => {
                                const res = await window.api.restoreWingetSnapshot?.(
                                  snap.filename,
                                  'pins-only'
                                )
                                if (res) {
                                  flash(res.message)
                                  void loadUpdatesAndPins(true)
                                }
                              }}
                              title="Restore only the WinGet package pin rules from this snapshot"
                            >
                              📌 Restore Pins
                            </button>
                            <button
                              type="button"
                              className="shelf-btn shelf-btn-primary shelf-btn-sm"
                              onClick={async () => {
                                const res = await window.api.restoreWingetSnapshot?.(
                                  snap.filename,
                                  'full-import'
                                )
                                if (res) flash(res.message)
                              }}
                              title="Restore pins and run winget import in SudoLaunch Terminal"
                            >
                              📦 Import All (&gt;_)
                            </button>
                            <button
                              type="button"
                              className="shelf-btn shelf-btn-danger shelf-btn-sm"
                              onClick={async () => {
                                const next = await window.api.deleteWingetSnapshot?.(snap.filename)
                                if (next) {
                                  setSnapshots(next)
                                  flash(`Deleted snapshot ${snap.name}`)
                                }
                              }}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* SUB-TAB 7: WINDOWS UPDATE & PENDING REBOOT STATUS */}
              {subTab === 'winupdate' && (
                <WindowsUpdateSubPanel
                  winUpdateStatus={winUpdateStatus}
                  setWinUpdateStatus={setWinUpdateStatus}
                  loadingWinUpdate={loadingWinUpdate}
                  scanningWinUpdate={scanningWinUpdate}
                  winUpdateActionBusy={winUpdateActionBusy}
                  setWinUpdateActionBusy={setWinUpdateActionBusy}
                  loadWindowsUpdateStatus={loadWindowsUpdateStatus}
                  flash={flash}
                  handleCopyText={handleCopyText}
                />
              )}
            </div>

            {/* RIGHT-HAND PACKAGE INSPECTOR DRAWER */}
            {inspectedPkgId && (
              <PackageInspectorPane
                inspectedPkgId={inspectedPkgId}
                inspectedDetails={inspectedDetails}
                loadingInspector={loadingInspector}
                inspectorVersion={inspectorVersion}
                setInspectorVersion={setInspectorVersion}
                inspectorScope={inspectorScope}
                setInspectorScope={setInspectorScope}
                inspectorInteractive={inspectorInteractive}
                setInspectorInteractive={setInspectorInteractive}
                inspectorForce={inspectorForce}
                setInspectorForce={setInspectorForce}
                isOpRunning={isOpRunning}
                onCloseInspector={() => {
                  setInspectedPkgId(null)
                  setInspectedDetails(null)
                }}
                handleCopyText={handleCopyText}
                handleRunAction={handleRunAction}
                openPinEditor={openPinEditor}
                suggestVersionWildcard={suggestVersionWildcard}
              />
            )}
          </div>
        </div>
      )}

      {/* CATEGORY 2: DEV RUNTIMES, PATH DOCTOR & PERSISTENT ENV VARIABLES */}
      {activeCategory === 'runtimes' && (
        <RuntimesAndEnvPanel
          runtimesView={runtimesView}
          setRuntimesView={setRuntimesView}
          devRuntimes={devRuntimes}
          pathEntries={pathEntries}
          envVars={envVars}
          setEnvVars={setEnvVars}
          loadingRuntimes={loadingRuntimes}
          brokenPathCount={brokenPathCount}
          duplicatePathCount={duplicatePathCount}
          elevateByDefault={elevateByDefault}
          flash={flash}
          handleCopyText={handleCopyText}
          onUpgradeOrInstallRuntime={({ action, id, name, forceElevated }) => {
            setActiveCategory('winget')
            void handleRunAction({
              action,
              id,
              name,
              forceElevated
            })
          }}
        />
      )}

      {/* CATEGORY 1B: SUDOLAUNCH CRON & SCHEDULED JOBS */}
      {activeCategory === 'jobs' && (
        <ScheduledJobsCategoryPanel
          scheduledJobs={scheduledJobs}
          setScheduledJobs={setScheduledJobs}
          jobPresets={jobPresets}
          loadingJobs={loadingJobs}
          flash={flash}
        />
      )}

      {/* CATEGORY 3: WINDOWS SERVICES, STARTUP APPS & OS SCHEDULED TASKS */}
      {activeCategory === 'services' && (
        <ServicesAndTasksPanel
          servicesView={servicesView}
          setServicesView={setServicesView}
          services={services}
          setServices={setServices}
          startupApps={startupApps}
          scheduledTasks={scheduledTasks}
          setScheduledTasks={setScheduledTasks}
          loadingServices={loadingServices}
          loadingTasks={loadingTasks}
          tasksLoadedOnce={tasksLoadedOnce}
          elevateByDefault={elevateByDefault}
          flash={flash}
          handleCopyText={handleCopyText}
        />
      )}

      {/* CATEGORY 4: PORTS, PROCESSES, HOSTS FILE & NETWORK / DNS */}
      {activeCategory === 'ports' && (
        <PortsAndNetworkPanel
          portsView={portsView}
          setPortsView={setPortsView}
          ports={ports}
          processes={processes}
          hostEntries={hostEntries}
          setHostEntries={setHostEntries}
          networkAdapters={networkAdapters}
          loadingPorts={loadingPorts}
          elevateByDefault={elevateByDefault}
          flash={flash}
          handleCopyText={handleCopyText}
          loadPortsAndProcesses={loadPortsAndProcesses}
        />
      )}

      {/* CATEGORY 5: DISK CACHES, STORAGE SMART HEALTH, POWER PLANS & REPAIR */}
      {activeCategory === 'cleanup' && (
        <CleanupAndStoragePanel
          cleanupView={cleanupView}
          setCleanupView={setCleanupView}
          cleanupTargets={cleanupTargets}
          setCleanupTargets={setCleanupTargets}
          storageAndPower={storageAndPower}
          loadingCleanup={loadingCleanup}
          cleaningBusy={cleaningBusy}
          setCleaningBusy={setCleaningBusy}
          flash={flash}
          loadCleanup={loadCleanup}
        />
      )}

      {/* CATEGORY 6: SECURITY POSTURE (DEFENDER, BITLOCKER, ADMINS) & EVENT LOGS */}
      {activeCategory === 'security' && (
        <SecurityAndEventsPanel
          securityView={securityView}
          setSecurityView={setSecurityView}
          securityPosture={securityPosture}
          setSecurityPosture={setSecurityPosture}
          eventLogs={eventLogs}
          loadingSecurity={loadingSecurity}
          flash={flash}
          handleCopyText={handleCopyText}
        />
      )}
    </div>
  )
}
