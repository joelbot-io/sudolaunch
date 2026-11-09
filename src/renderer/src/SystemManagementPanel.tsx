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
  ScheduledJobInput,
  ScheduledJobPreset,
  ScheduledJobTriggerType,
  ScheduledJobActionType,
  ScheduledJobNotifyMode
} from '../../shared/types'

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
  const [pathFilterChip, setPathFilterChip] = useState<'all' | 'broken' | 'duplicate' | 'user' | 'machine'>('all')
  const [pathSearchText, setPathSearchText] = useState('')
  const [envFilterChip, setEnvFilterChip] = useState<'all' | 'User' | 'Machine' | 'secrets'>('all')
  const [revealedEnvKeys, setRevealedEnvKeys] = useState<Set<string>>(new Set())
  const [newEnvName, setNewEnvName] = useState('')
  const [newEnvValue, setNewEnvValue] = useState('')
  const [newEnvScope, setNewEnvScope] = useState<'User' | 'Machine'>('User')
  const [envBusy, setEnvBusy] = useState(false)

  // Category 3: Services, Startup, Windows Scheduled Tasks states
  const [servicesView, setServicesView] = useState<'services' | 'startup' | 'tasks'>('services')
  const [services, setServices] = useState<SystemServiceItem[]>([])
  const [startupApps, setStartupApps] = useState<SystemStartupAppItem[]>([])
  const [scheduledTasks, setScheduledTasks] = useState<SystemScheduledTaskItem[]>([])
  const [loadingServices, setLoadingServices] = useState(false)
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [servicesLoadedOnce, setServicesLoadedOnce] = useState(false)
  const [tasksLoadedOnce, setTasksLoadedOnce] = useState(false)
  const [serviceFilterChip, setServiceFilterChip] = useState<'pinned' | 'running' | 'stopped' | 'all'>('pinned')
  const [taskFilterChip, setTaskFilterChip] = useState<'custom' | 'ready' | 'disabled' | 'all'>('custom')
  const [serviceSearchText, setServiceSearchText] = useState('')
  const [serviceBusyName, setServiceBusyName] = useState<string | null>(null)
  const [taskBusyKey, setTaskBusyKey] = useState<string | null>(null)

  // SudoLaunch In-App Scheduled Jobs state
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledJobItem[]>([])
  const [jobPresets, setJobPresets] = useState<ScheduledJobPreset[]>([])
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [jobsLoadedOnce, setJobsLoadedOnce] = useState(false)
  const [jobFilterChip, setJobFilterChip] = useState<'all' | 'enabled' | 'cron' | 'events' | 'custom'>('all')
  const [jobBusyId, setJobBusyId] = useState<string | null>(null)
  const [expandedJobLogIds, setExpandedJobLogIds] = useState<Set<string>>(new Set())
  const [showJobForm, setShowJobForm] = useState(false)
  const [editingJobId, setEditingJobId] = useState<string | null>(null)
  const [jobFormName, setJobFormName] = useState('')
  const [jobFormDesc, setJobFormDesc] = useState('')
  const [jobFormTrigger, setJobFormTrigger] = useState<ScheduledJobTriggerType>('cron')
  const [jobFormSchedule, setJobFormSchedule] = useState('0 * * * *')
  const [jobFormActionType, setJobFormActionType] = useState<ScheduledJobActionType>('powershell')
  const [jobFormCommand, setJobFormCommand] = useState('')
  const [jobFormCwd, setJobFormCwd] = useState('')
  const [jobFormElevated, setJobFormElevated] = useState(false)
  const [jobFormNotify, setJobFormNotify] = useState<ScheduledJobNotifyMode>('error')
  const [jobFormEnabled, setJobFormEnabled] = useState(true)

  // Category 4: Ports, Processes, Hosts File & Network states
  const [portsView, setPortsView] = useState<'ports' | 'processes' | 'hosts' | 'network'>('ports')
  const [ports, setPorts] = useState<SystemPortItem[]>([])
  const [processes, setProcesses] = useState<SystemProcessItem[]>([])
  const [hostEntries, setHostEntries] = useState<SystemHostEntryItem[]>([])
  const [networkAdapters, setNetworkAdapters] = useState<SystemNetworkAdapterItem[]>([])
  const [loadingPorts, setLoadingPorts] = useState(false)
  const [portsLoadedOnce, setPortsLoadedOnce] = useState(false)
  const [portFilterChip, setPortFilterChip] = useState<'dev' | 'all'>('dev')
  const [portSearchText, setPortSearchText] = useState('')
  const [processSortBy, setProcessSortBy] = useState<'memory' | 'cpu'>('memory')
  const [confirmKillPid, setConfirmKillPid] = useState<number | null>(null)
  const [newHostIp, setNewHostIp] = useState('127.0.0.1')
  const [newHostName, setNewHostName] = useState('')
  const [newHostComment, setNewHostComment] = useState('')
  const [hostBusy, setHostBusy] = useState(false)

  // Category 5: Cleanup, Storage Health, Power Plans & Repair Toolkit states
  const [cleanupView, setCleanupView] = useState<'caches' | 'storage' | 'power'>('caches')
  const [cleanupTargets, setCleanupTargets] = useState<CleanupTargetItem[]>([])
  const [storageAndPower, setStorageAndPower] = useState<SystemStorageAndPowerOverview | null>(null)
  const [selectedCleanupIds, setSelectedCleanupIds] = useState<Set<string>>(
    new Set(['winget-temp', 'user-temp', 'crash-dumps'])
  )
  const [loadingCleanup, setLoadingCleanup] = useState(false)
  const [cleaningBusy, setCleaningBusy] = useState(false)
  const [cleanupLoadedOnce, setCleanupLoadedOnce] = useState(false)

  // Category 6: Security Posture (Defender, BitLocker, Admins) & Event Log Triage states
  const [securityView, setSecurityView] = useState<'posture' | 'events'>('posture')
  const [securityPosture, setSecurityPosture] = useState<SystemSecurityPosture | null>(null)
  const [eventLogs, setEventLogs] = useState<SystemEventLogItem[]>([])
  const [loadingSecurity, setLoadingSecurity] = useState(false)
  const [securityLoadedOnce, setSecurityLoadedOnce] = useState(false)
  const [newExclusionPath, setNewExclusionPath] = useState('')
  const [eventFilterChip, setEventFilterChip] = useState<'all' | 'Application' | 'System' | 'Critical'>('all')
  const [eventSearchText, setEventSearchText] = useState('')

  // Windows Update & Pending Reboot states
  const [winUpdateStatus, setWinUpdateStatus] = useState<WindowsUpdateStatus | null>(null)
  const [loadingWinUpdate, setLoadingWinUpdate] = useState(false)
  const [scanningWinUpdate, setScanningWinUpdate] = useState(false)
  const [winUpdateActionBusy, setWinUpdateActionBusy] = useState<string | null>(null)
  const [confirmScheduleReboot, setConfirmScheduleReboot] = useState(false)
  const [rebootScheduled, setRebootScheduled] = useState(false)

  // Per-action busy states for visual loading spinners
  const [ecosystemBusyKey, setEcosystemBusyKey] = useState<string | null>(null)
  const [repairActionBusy, setRepairActionBusy] = useState<string | null>(null)
  const [securityActionBusy, setSecurityActionBusy] = useState<string | null>(null)

  // Deferred search values to prevent typing stutter over large lists
  const deferredFilterText = useDeferredValue(filterText)
  const deferredPathSearchText = useDeferredValue(pathSearchText)
  const deferredServiceSearchText = useDeferredValue(serviceSearchText)
  const deferredPortSearchText = useDeferredValue(portSearchText)
  const deferredEventSearchText = useDeferredValue(eventSearchText)

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

  // Filtered lists for PATH Doctor
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

  const filteredPathEntries = useMemo(() => {
    let base = pathEntries
    if (pathFilterChip === 'broken') base = base.filter((p) => !p.exists)
    else if (pathFilterChip === 'duplicate') base = base.filter((p) => p.isDuplicate)
    else if (pathFilterChip === 'user') base = base.filter((p) => p.scope === 'User')
    else if (pathFilterChip === 'machine') base = base.filter((p) => p.scope === 'Machine')
    const q = deferredPathSearchText.trim().toLowerCase()
    if (!q) return base
    return base.filter((p) => p.path.toLowerCase().includes(q))
  }, [pathEntries, pathFilterChip, deferredPathSearchText])

  const filteredEnvVars = useMemo(() => {
    let base = envVars
    if (envFilterChip === 'User' || envFilterChip === 'Machine') {
      base = base.filter((e) => e.scope === envFilterChip)
    } else if (envFilterChip === 'secrets') {
      base = base.filter((e) => e.isSecret)
    }
    const q = deferredPathSearchText.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (e) => e.name.toLowerCase().includes(q) || e.value.toLowerCase().includes(q)
    )
  }, [envVars, envFilterChip, deferredPathSearchText])

  // Filtered lists for Services & Scheduled Tasks
  const filteredServices = useMemo(() => {
    let base = services
    if (serviceFilterChip === 'pinned') base = base.filter((s) => s.isPinned)
    else if (serviceFilterChip === 'running') base = base.filter((s) => s.status === 'Running')
    else if (serviceFilterChip === 'stopped') base = base.filter((s) => s.status !== 'Running')
    const q = deferredServiceSearchText.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.displayName.toLowerCase().includes(q)
    )
  }, [services, serviceFilterChip, deferredServiceSearchText])

  const filteredScheduledTasks = useMemo(() => {
    let base = scheduledTasks
    if (taskFilterChip === 'custom') base = base.filter((t) => !t.isSystemTask)
    else if (taskFilterChip === 'ready')
      base = base.filter((t) => t.state === 'Ready' || t.state === 'Running')
    else if (taskFilterChip === 'disabled') base = base.filter((t) => t.state === 'Disabled')
    const q = deferredServiceSearchText.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.path.toLowerCase().includes(q) ||
        t.author.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    )
  }, [scheduledTasks, taskFilterChip, deferredServiceSearchText])

  const filteredScheduledJobs = useMemo(() => {
    let base = scheduledJobs
    if (jobFilterChip === 'enabled') {
      base = base.filter((j) => j.enabled)
    } else if (jobFilterChip === 'cron') {
      base = base.filter((j) => j.triggerType === 'cron' || j.triggerType === 'interval')
    } else if (jobFilterChip === 'events') {
      base = base.filter(
        (j) =>
          j.triggerType === 'startup' ||
          j.triggerType === 'unlock' ||
          j.triggerType === 'resume' ||
          j.triggerType === 'network-change'
      )
    } else if (jobFilterChip === 'custom') {
      base = base.filter((j) => j.source === 'custom-command')
    }
    const q = deferredServiceSearchText.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (j) =>
        j.name.toLowerCase().includes(q) ||
        (j.description && j.description.toLowerCase().includes(q)) ||
        j.command.toLowerCase().includes(q) ||
        j.scheduleSummary.toLowerCase().includes(q)
    )
  }, [scheduledJobs, jobFilterChip, deferredServiceSearchText])

  function openNewJobForm(preset?: ScheduledJobPreset): void {
    setEditingJobId(null)
    if (preset) {
      setJobFormName(preset.name)
      setJobFormDesc(preset.description)
      setJobFormTrigger(preset.suggestedTriggerType)
      setJobFormSchedule(preset.suggestedSchedule)
      setJobFormActionType(preset.actionType)
      setJobFormCommand(preset.command)
      setJobFormCwd('')
      setJobFormElevated(false)
      setJobFormNotify('error')
      setJobFormEnabled(true)
    } else {
      setJobFormName('')
      setJobFormDesc('')
      setJobFormTrigger('cron')
      setJobFormSchedule('0 * * * *')
      setJobFormActionType('powershell')
      setJobFormCommand('')
      setJobFormCwd('')
      setJobFormElevated(false)
      setJobFormNotify('error')
      setJobFormEnabled(true)
    }
    setShowJobForm(true)
  }

  function openEditJobForm(job: ScheduledJobItem): void {
    setEditingJobId(job.id)
    setJobFormName(job.name)
    setJobFormDesc(job.description || '')
    setJobFormTrigger(job.triggerType)
    setJobFormSchedule(job.schedule || '0 * * * *')
    setJobFormActionType(job.actionType)
    setJobFormCommand(job.command)
    setJobFormCwd(job.cwd || '')
    setJobFormElevated(Boolean(job.elevated))
    setJobFormNotify(job.notifyOn)
    setJobFormEnabled(job.enabled)
    setShowJobForm(true)
  }

  async function handleSaveScheduledJob(runImmediately = false): Promise<void> {
    if (!jobFormName.trim() || !jobFormCommand.trim()) {
      flash('Job Name and Command / Script Path are required')
      return
    }
    const payload: ScheduledJobInput = {
      id: editingJobId || undefined,
      name: jobFormName.trim(),
      description: jobFormDesc.trim() || undefined,
      enabled: jobFormEnabled,
      triggerType: jobFormTrigger,
      schedule: jobFormSchedule.trim(),
      actionType: jobFormActionType,
      command: jobFormCommand.trim(),
      cwd: jobFormCwd.trim() || undefined,
      elevated: jobFormElevated,
      notifyOn: jobFormNotify,
      runImmediately
    }
    const updatedJobs = await window.api.saveScheduledJob?.(payload)
    if (updatedJobs) {
      setScheduledJobs(updatedJobs)
      setShowJobForm(false)
      setEditingJobId(null)
      flash(
        runImmediately
          ? `Saved and triggered "${payload.name}"`
          : `Saved scheduled job "${payload.name}"`
      )
    }
  }

  // Filtered lists for Event Logs
  const filteredEventLogs = useMemo(() => {
    let base = eventLogs
    if (eventFilterChip === 'Application' || eventFilterChip === 'System') {
      base = base.filter((e) => e.logName === eventFilterChip)
    } else if (eventFilterChip === 'Critical') {
      base = base.filter((e) => e.level === 'Critical')
    }
    const q = deferredEventSearchText.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (e) =>
        e.providerName.toLowerCase().includes(q) ||
        e.message.toLowerCase().includes(q) ||
        String(e.id).includes(q)
    )
  }, [eventLogs, eventFilterChip, deferredEventSearchText])

  // Filtered lists for Ports & Processes
  const filteredPorts = useMemo(() => {
    let base = ports
    if (portFilterChip === 'dev') base = base.filter((p) => p.isCommonDevPort)
    const q = deferredPortSearchText.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (p) =>
        String(p.port).includes(q) ||
        p.processName.toLowerCase().includes(q) ||
        String(p.pid).includes(q)
    )
  }, [ports, portFilterChip, deferredPortSearchText])

  const filteredProcesses = useMemo(() => {
    const q = deferredPortSearchText.trim().toLowerCase()
    const base = q
      ? processes.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            String(p.pid).includes(q) ||
            (p.windowTitle && p.windowTitle.toLowerCase().includes(q))
        )
      : processes
    return [...base].sort((a, b) =>
      processSortBy === 'memory' ? b.memoryMb - a.memoryMb : b.cpuSec - a.cpuSec
    )
  }, [processes, deferredPortSearchText, processSortBy])

  const totalCleanupMb = useMemo(
    () =>
      cleanupTargets
        .filter((t) => selectedCleanupIds.has(t.id))
        .reduce((acc, t) => acc + t.sizeMb, 0)
        .toFixed(1),
    [cleanupTargets, selectedCleanupIds]
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
                <div className="winget-tab-body">
                  {/* Live Job Running Spinner Banner */}
                  {(loadingWinUpdate || scanningWinUpdate || winUpdateActionBusy) && (
                    <div className="sudo-job-running-banner">
                      <span className="sudo-spinner sudo-spinner-lg" />
                      <span>
                        {winUpdateActionBusy === 'scan-online'
                          ? 'Querying Microsoft Update online servers for cumulative, security, and driver updates (this may take 10–30 seconds)...'
                          : winUpdateActionBusy === 'scan-local'
                            ? 'Scanning locally cached Windows Update catalog via Microsoft.Update.Session...'
                            : winUpdateActionBusy === 'trigger-scan'
                              ? 'Running Windows Update Orchestrator scan (UsoClient StartInteractiveScan) & refreshing pending updates...'
                              : winUpdateActionBusy === 'install-all'
                                ? 'Downloading & installing all pending Windows Updates via elevated Windows Update Agent (UAC)...'
                                : winUpdateActionBusy === 'download-all'
                                  ? 'Downloading pending Windows Updates into local cache via elevated Windows Update Agent...'
                                  : winUpdateActionBusy?.startsWith('install-kb:')
                                    ? `Downloading & installing update (${winUpdateActionBusy.replace('install-kb:', '')}) via elevated Windows Update Agent...`
                                    : 'Checking Windows Reboot & Update registry indicators and hotfix history...'}
                      </span>
                    </div>
                  )}

                  {/* Pending Reboot & OS Health Card */}
                  <div
                    className="winget-pin-editor-card"
                    style={{
                      margin: 0,
                      borderColor: winUpdateStatus?.rebootPending
                        ? 'rgba(245, 158, 11, 0.45)'
                        : 'rgba(34, 197, 94, 0.35)',
                      background: winUpdateStatus?.rebootPending
                        ? 'rgba(245, 158, 11, 0.08)'
                        : 'rgba(34, 197, 94, 0.06)'
                    }}
                  >
                    <div className="winget-pin-editor-header">
                      <div>
                        <div className="winget-pin-editor-title">
                          {loadingWinUpdate && !winUpdateStatus ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <span className="sudo-spinner sudo-spinner-sm" />
                              Checking Windows Reboot &amp; Update Registry Indicators...
                            </span>
                          ) : winUpdateStatus?.rebootPending ? (
                            <span style={{ color: '#fbbf24' }}>
                              ⚠️ System Reboot Required ({winUpdateStatus.rebootReasons.length}{' '}
                              indicator{winUpdateStatus.rebootReasons.length === 1 ? '' : 's'}{' '}
                              active)
                            </span>
                          ) : (
                            <span style={{ color: '#4ade80' }}>
                              ✅ No Pending System Reboot Detected
                            </span>
                          )}
                        </div>
                        <div className="winget-pin-editor-sub" style={{ marginTop: 4 }}>
                          {winUpdateStatus ? (
                            <>
                              🪟 <strong>{winUpdateStatus.osCaption || 'Windows'}</strong>
                              {winUpdateStatus.osBuild
                                ? ` (Build ${winUpdateStatus.osBuild} • v${winUpdateStatus.osVersion})`
                                : ''}{' '}
                              • ⏱️ Uptime:{' '}
                              <strong>
                                {winUpdateStatus.uptimeDays}d {winUpdateStatus.uptimeHours}h
                              </strong>
                              {winUpdateStatus.lastBootTime
                                ? ` (Booted ${winUpdateStatus.lastBootTime})`
                                : ''}{' '}
                              • ⚙️ wuauserv: <code>{winUpdateStatus.wuaServiceStatus}</code>
                              {winUpdateStatus.lastCheckedAt
                                ? ` • Checked ${winUpdateStatus.lastCheckedAt}`
                                : ''}
                            </>
                          ) : (
                            'Querying Component-Based Servicing (CBS), WindowsUpdate Auto Update, and Session Manager registry keys...'
                          )}
                        </div>
                      </div>

                      <div className="winget-summary-actions">
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-sm"
                          onClick={async () => {
                            const res =
                              await window.api.runWindowsUpdateAction?.('open-settings')
                            if (res?.message) flash(res.message)
                          }}
                          title="Open Windows Update in Windows Settings (ms-settings:windowsupdate)"
                        >
                          ⚙️ Windows Update Settings
                        </button>
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-sm"
                          onClick={async () => {
                            const res = await window.api.runWindowsUpdateAction?.('open-history')
                            if (res?.message) flash(res.message)
                          }}
                          title="Open Windows Update History (ms-settings:windowsupdate-history)"
                        >
                          📜 Update History
                        </button>
                      </div>
                    </div>

                    {winUpdateStatus?.rebootPending && (
                      <div
                        className="winget-chip-group"
                        style={{ marginTop: 8, marginBottom: 4 }}
                      >
                        {winUpdateStatus.rebootReasons.map((reason) => (
                          <span
                            key={reason}
                            className="winget-badge winget-badge-blocked"
                            style={{ fontSize: '11.5px', padding: '3px 8px' }}
                          >
                            🔔 {reason}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="winget-pin-editor-footer" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className={`shelf-btn shelf-btn-sm ${
                          confirmScheduleReboot ? 'shelf-btn-danger' : 'shelf-btn-warning'
                        }`}
                        onClick={async () => {
                          if (!confirmScheduleReboot) {
                            setConfirmScheduleReboot(true)
                            setTimeout(() => setConfirmScheduleReboot(false), 4500)
                            return
                          }
                          setConfirmScheduleReboot(false)
                          const res =
                            await window.api.runWindowsUpdateAction?.('schedule-reboot-60s')
                          if (res?.success) {
                            setRebootScheduled(true)
                          }
                          if (res?.message) flash(res.message)
                        }}
                        title="Schedule a graceful Windows restart in 60 seconds (shutdown /r /t 60)"
                      >
                        {confirmScheduleReboot
                          ? '⚠️ Click Again to Schedule Restart in 60s'
                          : '🔄 Schedule Restart (60s)'}
                      </button>

                      {rebootScheduled && (
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-danger shelf-btn-sm"
                          onClick={async () => {
                            const res =
                              await window.api.runWindowsUpdateAction?.('cancel-reboot')
                            setRebootScheduled(false)
                            if (res?.message) flash(res.message)
                          }}
                          title="Abort scheduled Windows restart (shutdown /a)"
                        >
                          ⏹️ Cancel Scheduled Restart (shutdown /a)
                        </button>
                      )}

                      <button
                        type="button"
                        className="shelf-btn shelf-btn-sm"
                        disabled={loadingWinUpdate || scanningWinUpdate || Boolean(winUpdateActionBusy)}
                        onClick={() =>
                          void loadWindowsUpdateStatus({ force: true, scanPending: false })
                        }
                      >
                        {loadingWinUpdate || winUpdateActionBusy === 'recheck' ? (
                          <>
                            <span className="sudo-spinner sudo-spinner-sm" /> Checking…
                          </>
                        ) : (
                          '🔄 Re-check Reboot Flags'
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Pending Windows & Driver Updates Scanner & Trigger Bar */}
                  <div className="winget-summary-bar">
                    <div className="winget-summary-left">
                      <span className="winget-summary-text">
                        {scanningWinUpdate || winUpdateActionBusy ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span className="sudo-spinner sudo-spinner-sm" />
                            <span>
                              {winUpdateActionBusy === 'install-all' ||
                              winUpdateActionBusy?.startsWith('install-kb:')
                                ? 'Installing Windows Updates...'
                                : 'Querying Windows Update Agent (Microsoft.Update.Session)...'}
                            </span>
                          </span>
                        ) : winUpdateStatus?.pendingScanned ? (
                          `${winUpdateStatus.pendingUpdates.length} pending Windows / Driver update${
                            winUpdateStatus.pendingUpdates.length === 1 ? '' : 's'
                          } found`
                        ) : (
                          'Pending Windows & Driver Updates (click Scan to query Windows Update Agent)'
                        )}
                      </span>
                    </div>
                    <div className="winget-summary-actions">
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-primary shelf-btn-sm"
                        disabled={scanningWinUpdate || Boolean(winUpdateActionBusy)}
                        onClick={() =>
                          void loadWindowsUpdateStatus({
                            force: true,
                            scanPending: true,
                            online: false
                          })
                        }
                        title="Fast scan of locally cached Windows Update catalog (~3-8s)"
                      >
                        {winUpdateActionBusy === 'scan-local' ? (
                          <>
                            <span className="sudo-spinner sudo-spinner-sm" /> Scanning Cache…
                          </>
                        ) : (
                          '🔍 Scan Pending (Local Cache)'
                        )}
                      </button>
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-sm"
                        disabled={scanningWinUpdate || Boolean(winUpdateActionBusy)}
                        onClick={() =>
                          void loadWindowsUpdateStatus({
                            force: true,
                            scanPending: true,
                            online: true
                          })
                        }
                        title="Query Microsoft Update servers online for latest cumulative & driver updates"
                      >
                        {winUpdateActionBusy === 'scan-online' ? (
                          <>
                            <span className="sudo-spinner sudo-spinner-sm" /> Scanning Online…
                          </>
                        ) : (
                          '🌐 Scan Online'
                        )}
                      </button>
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-sm"
                        disabled={scanningWinUpdate || Boolean(winUpdateActionBusy)}
                        onClick={async () => {
                          setWinUpdateActionBusy('trigger-scan')
                          try {
                            const res = await window.api.runWindowsUpdateAction?.('trigger-scan')
                            if (res?.status) setWinUpdateStatus(res.status)
                            if (res?.message) flash(res.message)
                          } finally {
                            setWinUpdateActionBusy(null)
                          }
                        }}
                        title="Trigger Windows Update Orchestrator scan (UsoClient StartInteractiveScan + StartScan) and refresh pending list"
                      >
                        {winUpdateActionBusy === 'trigger-scan' ? (
                          <>
                            <span className="sudo-spinner sudo-spinner-sm" /> Triggering Scan…
                          </>
                        ) : (
                          '⚡ Trigger OS Scan'
                        )}
                      </button>
                      {(winUpdateStatus?.pendingUpdates.length ?? 0) > 0 && (
                        <>
                          <button
                            type="button"
                            className="shelf-btn shelf-btn-primary shelf-btn-sm"
                            disabled={scanningWinUpdate || Boolean(winUpdateActionBusy)}
                            onClick={async () => {
                              setWinUpdateActionBusy('install-all')
                              try {
                                const res =
                                  await window.api.runWindowsUpdateAction?.('install-updates')
                                if (res?.status) setWinUpdateStatus(res.status)
                                if (res?.message) flash(res.message)
                              } finally {
                                setWinUpdateActionBusy(null)
                              }
                            }}
                            title="Download & install all pending Windows Updates via elevated Windows Update Agent (UAC)"
                          >
                            {winUpdateActionBusy === 'install-all' ? (
                              <>
                                <span className="sudo-spinner sudo-spinner-sm" /> Installing…
                              </>
                            ) : (
                              `⬇️ Install All (${winUpdateStatus?.pendingUpdates.length})`
                            )}
                          </button>
                          <button
                            type="button"
                            className="shelf-btn shelf-btn-sm"
                            disabled={scanningWinUpdate || Boolean(winUpdateActionBusy)}
                            onClick={async () => {
                              const res =
                                await window.api.runWindowsUpdateAction?.('install-in-terminal')
                              if (res?.message) flash(res.message)
                            }}
                            title="Run Windows Update scan, download, and install stream in SudoLaunch Terminal (>_)"
                          >
                            &gt;_ Install in Terminal
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {winUpdateStatus?.scanNote && (
                    <div
                      style={{
                        padding: '6px 10px',
                        fontSize: 11,
                        borderRadius: 6,
                        background: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        color: '#fbbf24'
                      }}
                    >
                      ℹ️ {winUpdateStatus.scanNote}
                    </div>
                  )}

                  {/* Pending Updates List (when scanned) */}
                  {winUpdateStatus?.pendingScanned && (
                    <div
                      className="winget-pkg-list"
                      style={{ maxHeight: 165, flexShrink: 0 }}
                    >
                      {winUpdateStatus.pendingUpdates.length === 0 ? (
                        <div className="profile-empty-list" style={{ padding: '14px' }}>
                          🎉 No pending Windows or Driver updates detected by the Windows Update
                          Agent!
                        </div>
                      ) : (
                        winUpdateStatus.pendingUpdates.map((u, idx) => {
                          const targetKey = u.kbs || u.title
                          const isInstallingThis =
                            winUpdateActionBusy === `install-kb:${targetKey}` ||
                            winUpdateActionBusy === 'install-all'
                          return (
                            <div key={`${u.title}-${idx}`} className="winget-pkg-row">
                              <div className="winget-pkg-main">
                                <div className="winget-pkg-title-row">
                                  <span className="winget-pkg-name">{u.title}</span>
                                  {u.kbs && (
                                    <button
                                      type="button"
                                      className="winget-pkg-id-btn"
                                      onClick={() => handleCopyText(u.kbs, 'Copied KB ID')}
                                      title="Click to copy KB ID"
                                    >
                                      {u.kbs}
                                    </button>
                                  )}
                                  {u.isDownloaded && (
                                    <span className="winget-badge winget-badge-installed">
                                      ✓ Downloaded
                                    </span>
                                  )}
                                  {u.rebootRequired && (
                                    <span className="winget-badge winget-badge-blocked">
                                      🔄 Needs Reboot
                                    </span>
                                  )}
                                </div>
                                <div className="winget-pkg-meta-row">
                                  <span className="winget-source-tag">Severity: {u.severity}</span>
                                  {u.sizeMb > 0 && (
                                    <span className="winget-ver-current">{u.sizeMb} MB</span>
                                  )}
                                </div>
                              </div>
                              <div className="winget-pkg-actions">
                                <button
                                  type="button"
                                  className="shelf-btn shelf-btn-primary shelf-btn-sm"
                                  disabled={scanningWinUpdate || Boolean(winUpdateActionBusy)}
                                  onClick={async () => {
                                    setWinUpdateActionBusy(`install-kb:${targetKey}`)
                                    try {
                                      const res = await window.api.runWindowsUpdateAction?.(
                                        'install-updates',
                                        targetKey
                                      )
                                      if (res?.status) setWinUpdateStatus(res.status)
                                      if (res?.message) flash(res.message)
                                    } finally {
                                      setWinUpdateActionBusy(null)
                                    }
                                  }}
                                  title="Download & install this update directly via elevated Windows Update Agent (UAC)"
                                >
                                  {isInstallingThis ? (
                                    <>
                                      <span className="sudo-spinner sudo-spinner-sm" /> Installing…
                                    </>
                                  ) : (
                                    '⬇️ Install Update'
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="shelf-btn shelf-btn-sm"
                                  onClick={() =>
                                    void window.api.runWindowsUpdateAction?.('open-settings')
                                  }
                                  title="Open Windows Update Settings (ms-settings:windowsupdate)"
                                >
                                  🪟 Settings
                                </button>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}

                  {/* Recently Installed KB Hotfixes (Get-HotFix) */}
                  <div className="winget-summary-bar">
                    <span className="winget-summary-text">
                      📜 Recently Installed Windows KB Hotfixes (
                      {winUpdateStatus?.recentHotfixes.length ?? 0})
                    </span>
                  </div>

                  <div className="winget-pkg-list">
                    {!winUpdateStatus ? (
                      <div className="profile-empty-list">
                        Loading installed Windows KB hotfixes...
                      </div>
                    ) : winUpdateStatus.recentHotfixes.length === 0 ? (
                      <div className="profile-empty-list">
                        No KB hotfix entries returned by Get-HotFix.
                      </div>
                    ) : (
                      winUpdateStatus.recentHotfixes.map((hf) => (
                        <div key={hf.hotFixId} className="winget-pkg-row">
                          <div className="winget-pkg-main">
                            <div className="winget-pkg-title-row">
                              <span className="winget-pkg-name">
                                {hf.description || 'Windows Update'} — {hf.hotFixId}
                              </span>
                              <button
                                type="button"
                                className="winget-pkg-id-btn"
                                onClick={() => handleCopyText(hf.hotFixId, 'Copied HotFix ID')}
                                title="Click to copy KB ID"
                              >
                                {hf.hotFixId}
                              </button>
                            </div>
                            <div className="winget-pkg-meta-row">
                              {hf.installedOn && (
                                <span className="winget-ver-current">
                                  Installed: {hf.installedOn}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="winget-pkg-actions">
                            <button
                              type="button"
                              className="shelf-btn shelf-btn-sm"
                              onClick={() => {
                                const num = hf.hotFixId.replace(/^KB/i, '')
                                void window.api.openExternalUrl?.(
                                  `https://support.microsoft.com/help/${num}`
                                )
                              }}
                              title={`Open Microsoft Support documentation for ${hf.hotFixId}`}
                            >
                              🌐 KB Info
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT-HAND PACKAGE INSPECTOR DRAWER */}
            {inspectedPkgId && (
              <div className="winget-inspector-pane">
                <div className="winget-inspector-header">
                  <span className="winget-inspector-title">ℹ️ Package Inspector</span>
                  <button
                    type="button"
                    className="shelf-btn shelf-btn-sm"
                    onClick={() => {
                      setInspectedPkgId(null)
                      setInspectedDetails(null)
                    }}
                  >
                    ✕
                  </button>
                </div>

                {loadingInspector ? (
                  <div className="profile-empty-list">
                    Querying <code>winget show {inspectedPkgId}</code>...
                  </div>
                ) : !inspectedDetails ? (
                  <div className="profile-empty-list">No details found for {inspectedPkgId}.</div>
                ) : (
                  <div className="winget-inspector-body">
                    <div className="winget-inspector-pkg-name">{inspectedDetails.name}</div>
                    <div
                      className="winget-inspector-pkg-id"
                      onClick={() => handleCopyText(inspectedDetails.id, 'Copied ID')}
                      title="Click to copy Package ID"
                    >
                      {inspectedDetails.id} 📋
                    </div>

                    <div className="winget-inspector-meta-grid">
                      {inspectedDetails.publisher && (
                        <div>
                          <span className="inspector-label">Publisher:</span>{' '}
                          <strong>{inspectedDetails.publisher}</strong>
                        </div>
                      )}
                      {inspectedDetails.license && (
                        <div>
                          <span className="inspector-label">License:</span>{' '}
                          <span>{inspectedDetails.license}</span>
                        </div>
                      )}
                      {inspectedDetails.installerType && (
                        <div>
                          <span className="inspector-label">Installer:</span>{' '}
                          <span className="winget-source-tag">{inspectedDetails.installerType}</span>
                        </div>
                      )}
                    </div>

                    {inspectedDetails.description && (
                      <div className="winget-inspector-desc">{inspectedDetails.description}</div>
                    )}

                    {/* External Links */}
                    <div className="winget-inspector-links">
                      {inspectedDetails.homepage && (
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-sm"
                          onClick={() => window.api.openExternalUrl?.(inspectedDetails.homepage!)}
                        >
                          🌐 Homepage
                        </button>
                      )}
                      {inspectedDetails.releaseNotesUrl && (
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-sm"
                          onClick={() =>
                            window.api.openExternalUrl?.(inspectedDetails.releaseNotesUrl!)
                          }
                        >
                          📝 Release Notes
                        </button>
                      )}
                      {inspectedDetails.publisherUrl && (
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-sm"
                          onClick={() =>
                            window.api.openExternalUrl?.(inspectedDetails.publisherUrl!)
                          }
                        >
                          🏢 Publisher
                        </button>
                      )}
                    </div>

                    {/* Version Selector & Installer Switches */}
                    <div className="winget-inspector-controls">
                      <label className="inspector-control-row">
                        <span>Target Version:</span>
                        <select
                          className="winget-inspector-select"
                          value={inspectorVersion}
                          onChange={(e) => setInspectorVersion(e.target.value)}
                        >
                          {inspectedDetails.availableVersions.slice(0, 40).map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="inspector-control-row">
                        <span>Install Scope:</span>
                        <select
                          className="winget-inspector-select"
                          value={inspectorScope}
                          onChange={(e) =>
                            setInspectorScope(e.target.value as 'default' | 'user' | 'machine')
                          }
                        >
                          <option value="default">Default</option>
                          <option value="user">User (--scope user)</option>
                          <option value="machine">Machine (--scope machine)</option>
                        </select>
                      </label>

                      <div className="inspector-checkbox-row">
                        <label className="winget-checkbox-pill">
                          <input
                            type="checkbox"
                            checked={inspectorInteractive}
                            onChange={(e) => setInspectorInteractive(e.target.checked)}
                          />
                          <span>Interactive UI</span>
                        </label>
                        <label className="winget-checkbox-pill">
                          <input
                            type="checkbox"
                            checked={inspectorForce}
                            onChange={(e) => setInspectorForce(e.target.checked)}
                          />
                          <span>Force (--force)</span>
                        </label>
                      </div>

                      <div className="inspector-action-buttons">
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-primary shelf-btn-sm"
                          disabled={isOpRunning}
                          onClick={(e) =>
                            handleRunAction({
                              action: 'install',
                              id: inspectedDetails.id,
                              name: inspectedDetails.name,
                              version: inspectorVersion || undefined,
                              scope: inspectorScope,
                              interactive: inspectorInteractive,
                              force: inspectorForce,
                              forceElevated: e.ctrlKey || e.metaKey
                            })
                          }
                        >
                          📥 Install v{inspectorVersion || inspectedDetails.version}
                        </button>
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-warning shelf-btn-sm"
                          onClick={() =>
                            openPinEditor({
                              id: inspectedDetails.id,
                              name: inspectedDetails.name,
                              version: inspectorVersion || inspectedDetails.version,
                              pinType: 'Gating',
                              pinnedVersion: suggestVersionWildcard(
                                inspectorVersion || inspectedDetails.version
                              )
                            })
                          }
                        >
                          🔒 Gate-Pin Version
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
         CATEGORY 2: DEV RUNTIMES, PATH DOCTOR & PERSISTENT ENV VARIABLES
         ==================================================================== */}
      {activeCategory === 'runtimes' && (
        <div className="winget-tab-body">
          <div className="winget-toolbar-row">
            <div className="profile-tabs-bar" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <button
                type="button"
                className={`profile-tab-btn ${runtimesView === 'runtimes' ? 'is-active' : ''}`}
                onClick={() => setRuntimesView('runtimes')}
              >
                <span>🛠️ Developer Runtimes</span>
                <span className="profile-tab-count">
                  {devRuntimes.filter((r) => r.installed).length}/{devRuntimes.length}
                </span>
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${runtimesView === 'path' ? 'is-active' : ''}`}
                onClick={() => setRuntimesView('path')}
              >
                <span>🩺 PATH Doctor</span>
                {(brokenPathCount > 0 || duplicatePathCount > 0) && (
                  <span className="profile-tab-count">
                    {brokenPathCount + duplicatePathCount} issues
                  </span>
                )}
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${runtimesView === 'envvars' ? 'is-active' : ''}`}
                onClick={() => setRuntimesView('envvars')}
              >
                <span>🔑 Env Variables</span>
                <span className="profile-tab-count">{envVars.length}</span>
              </button>
            </div>
            {(runtimesView === 'path' || runtimesView === 'envvars') && (
              <input
                type="text"
                className="winget-filter-input"
                placeholder={
                  runtimesView === 'path'
                    ? 'Search PATH directories...'
                    : 'Search variable name or value...'
                }
                value={pathSearchText}
                onChange={(e) => setPathSearchText(e.target.value)}
              />
            )}
          </div>

          {runtimesView === 'runtimes' ? (
            <div className="winget-pkg-list">
              {loadingRuntimes && devRuntimes.length === 0 ? (
                <div className="profile-empty-list">Scanning installed developer runtimes and PATH...</div>
              ) : (
                <div className="system-runtimes-grid">
                  {devRuntimes.map((rt) => (
                    <div
                      key={rt.id}
                      className={`system-runtime-card ${!rt.installed ? 'is-missing' : ''} ${
                        rt.hasShadowConflict ? 'has-conflict' : ''
                      }`}
                    >
                      <div className="system-runtime-top">
                        <div className="system-runtime-title-group">
                          <span className="system-runtime-icon">{rt.icon}</span>
                          <div>
                            <div className="system-runtime-name">{rt.name}</div>
                            <div className="system-runtime-ver">{rt.version}</div>
                          </div>
                        </div>
                        {rt.hasShadowConflict ? (
                          <span
                            className="winget-badge winget-badge-pinned"
                            title={`Multiple binaries on PATH:\n${rt.allPaths.join('\n')}`}
                          >
                            ⚠️ {rt.allPaths.length} in PATH
                          </span>
                        ) : rt.installed ? (
                          <span className="winget-badge winget-badge-installed">✓ Ready</span>
                        ) : (
                          <span className="winget-badge winget-badge-blocked">Missing</span>
                        )}
                      </div>

                      {rt.activePath && (
                        <div
                          className="system-runtime-path"
                          title={rt.allPaths.join('\n')}
                          onClick={() => handleCopyText(rt.activePath, 'Copied Binary Path')}
                        >
                          {rt.activePath}
                        </div>
                      )}

                      {rt.hasShadowConflict && rt.allPaths.length > 1 && (
                        <div className="system-runtime-shadow-box">
                          Shadowed: <code>{rt.allPaths.slice(1).join(' • ')}</code>
                        </div>
                      )}

                      <div className="system-runtime-actions">
                        {rt.activePath && (
                          <button
                            type="button"
                            className="shelf-btn shelf-btn-sm"
                            onClick={() => window.api.revealPathInExplorer?.(rt.activePath)}
                          >
                            📂 Reveal
                          </button>
                        )}
                        {rt.wingetId && (
                          <button
                            type="button"
                            className="shelf-btn shelf-btn-primary shelf-btn-sm"
                            onClick={(e) => {
                              setActiveCategory('winget')
                              void handleRunAction({
                                action: rt.installed ? 'upgrade' : 'install',
                                id: rt.wingetId,
                                name: rt.name,
                                forceElevated: e.ctrlKey || e.metaKey
                              })
                            }}
                          >
                            {rt.installed ? '⬆️ Upgrade' : '📥 Install via WinGet'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : runtimesView === 'path' ? (
            <div className="winget-tab-body">
              <div className="winget-summary-bar">
                <div className="winget-chip-group">
                  <button
                    type="button"
                    className={`winget-filter-chip ${pathFilterChip === 'all' ? 'is-active' : ''}`}
                    onClick={() => setPathFilterChip('all')}
                  >
                    All Entries ({pathEntries.length})
                  </button>
                  <button
                    type="button"
                    className={`winget-filter-chip ${pathFilterChip === 'broken' ? 'is-active' : ''}`}
                    onClick={() => setPathFilterChip('broken')}
                  >
                    ⚠️ Missing Folders ({brokenPathCount})
                  </button>
                  <button
                    type="button"
                    className={`winget-filter-chip ${pathFilterChip === 'duplicate' ? 'is-active' : ''}`}
                    onClick={() => setPathFilterChip('duplicate')}
                  >
                    🔁 Duplicates ({duplicatePathCount})
                  </button>
                  <button
                    type="button"
                    className={`winget-filter-chip ${pathFilterChip === 'user' ? 'is-active' : ''}`}
                    onClick={() => setPathFilterChip('user')}
                  >
                    User PATH ({pathEntries.filter((p) => p.scope === 'User').length})
                  </button>
                  <button
                    type="button"
                    className={`winget-filter-chip ${pathFilterChip === 'machine' ? 'is-active' : ''}`}
                    onClick={() => setPathFilterChip('machine')}
                  >
                    Machine PATH ({pathEntries.filter((p) => p.scope === 'Machine').length})
                  </button>
                </div>
              </div>

              <div className="winget-pkg-list">
                {filteredPathEntries.map((entry, idx) => (
                  <div
                    key={`${entry.scope}-${entry.path}-${idx}`}
                    className={`winget-pkg-row ${!entry.exists ? 'is-pinned' : ''}`}
                  >
                    <div className="winget-pkg-main">
                      <div className="winget-pkg-title-row">
                        <span className="winget-source-tag">{entry.scope}</span>
                        <span
                          className="winget-pkg-name"
                          style={{ maxWidth: '580px', fontFamily: 'Cascadia Mono, Consolas, monospace', fontSize: '11.5px' }}
                        >
                          {entry.path}
                        </span>
                        {!entry.exists && (
                          <span className="winget-badge winget-badge-blocked">
                            ⚠️ Folder Not Found
                          </span>
                        )}
                        {entry.isDuplicate && (
                          <span className="winget-badge winget-badge-pinned">🔁 Duplicate</span>
                        )}
                      </div>
                    </div>
                    <div className="winget-pkg-actions">
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-sm"
                        onClick={() => handleCopyText(entry.path, 'Copied PATH entry')}
                      >
                        📋 Copy
                      </button>
                      {entry.exists && (
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-sm"
                          onClick={() => window.api.revealPathInExplorer?.(entry.path)}
                        >
                          📂 Open
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* SUB-VIEW 3: PERSISTENT ENVIRONMENT VARIABLES (User & Machine) */
            <div className="winget-tab-body">
              <div className="winget-search-bar-row">
                <input
                  type="text"
                  className="winget-filter-input"
                  style={{ width: 210 }}
                  placeholder="Variable Name (e.g. GOPATH)"
                  value={newEnvName}
                  onChange={(e) => setNewEnvName(e.target.value)}
                />
                <input
                  type="text"
                  className="winget-search-input"
                  style={{ flex: 1 }}
                  placeholder="Variable Value..."
                  value={newEnvValue}
                  onChange={(e) => setNewEnvValue(e.target.value)}
                />
                <select
                  className="winget-inspector-select"
                  style={{ width: 115 }}
                  value={newEnvScope}
                  onChange={(e) => setNewEnvScope(e.target.value as 'User' | 'Machine')}
                >
                  <option value="User">User Scope</option>
                  <option value="Machine">Machine (UAC)</option>
                </select>
                <button
                  type="button"
                  className="shelf-btn shelf-btn-primary shelf-btn-sm"
                  disabled={envBusy || !newEnvName.trim()}
                  onClick={async (e) => {
                    setEnvBusy(true)
                    const res = await window.api.setSystemEnvVar?.({
                      name: newEnvName.trim(),
                      value: newEnvValue,
                      scope: newEnvScope,
                      elevated: e.ctrlKey || e.metaKey || elevateByDefault
                    })
                    setEnvBusy(false)
                    if (res) {
                      setEnvVars(res.items)
                      if (res.success) {
                        setNewEnvName('')
                        setNewEnvValue('')
                      }
                      flash(res.message)
                    }
                  }}
                >
                  {envBusy ? 'Saving...' : '💾 Save Variable'}
                </button>
              </div>

              <div className="winget-summary-bar">
                <div className="winget-chip-group">
                  <button
                    type="button"
                    className={`winget-filter-chip ${envFilterChip === 'all' ? 'is-active' : ''}`}
                    onClick={() => setEnvFilterChip('all')}
                  >
                    All ({envVars.length})
                  </button>
                  <button
                    type="button"
                    className={`winget-filter-chip ${envFilterChip === 'User' ? 'is-active' : ''}`}
                    onClick={() => setEnvFilterChip('User')}
                  >
                    👤 User ({envVars.filter((v) => v.scope === 'User').length})
                  </button>
                  <button
                    type="button"
                    className={`winget-filter-chip ${envFilterChip === 'Machine' ? 'is-active' : ''}`}
                    onClick={() => setEnvFilterChip('Machine')}
                  >
                    🖥️ Machine ({envVars.filter((v) => v.scope === 'Machine').length})
                  </button>
                  <button
                    type="button"
                    className={`winget-filter-chip ${envFilterChip === 'secrets' ? 'is-active' : ''}`}
                    onClick={() => setEnvFilterChip('secrets')}
                  >
                    🔒 Secrets / Keys ({envVars.filter((v) => v.isSecret).length})
                  </button>
                </div>
                <span className="winget-summary-text">{filteredEnvVars.length} shown</span>
              </div>

              <div className="winget-pkg-list">
                {filteredEnvVars.length === 0 ? (
                  <div className="profile-empty-list">No environment variables match your filter.</div>
                ) : (
                  filteredEnvVars.map((ev) => {
                    const keyId = `${ev.scope}:${ev.name}`
                    const isRevealed = !ev.isSecret || revealedEnvKeys.has(keyId)
                    return (
                      <div key={keyId} className="winget-pkg-row">
                        <div className="winget-pkg-main">
                          <div className="winget-pkg-title-row">
                            <span className="winget-source-tag">{ev.scope}</span>
                            <span
                              className="winget-pkg-name"
                              style={{ fontFamily: 'Cascadia Mono, Consolas, monospace' }}
                            >
                              {ev.name}
                            </span>
                            {ev.isSecret && (
                              <span className="winget-badge winget-badge-pinned">🔒 Secret</span>
                            )}
                          </div>
                          <div className="winget-pkg-meta-row">
                            <span
                              className="winget-ver-current"
                              style={{
                                fontFamily: 'Cascadia Mono, Consolas, monospace',
                                maxWidth: '680px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {isRevealed ? ev.value : '••••••••••••••••••••••••'}
                            </span>
                          </div>
                        </div>
                        <div className="winget-pkg-actions">
                          {ev.isSecret && (
                            <button
                              type="button"
                              className="shelf-btn shelf-btn-sm"
                              onClick={() => {
                                setRevealedEnvKeys((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(keyId)) next.delete(keyId)
                                  else next.add(keyId)
                                  return next
                                })
                              }}
                            >
                              {isRevealed ? '🙈 Hide' : '👁️ Reveal'}
                            </button>
                          )}
                          <button
                            type="button"
                            className="shelf-btn shelf-btn-sm"
                            onClick={() => {
                              setNewEnvName(ev.name)
                              setNewEnvValue(ev.value)
                              setNewEnvScope(ev.scope)
                            }}
                            title="Load into editor bar above"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            className="shelf-btn shelf-btn-sm"
                            onClick={() => handleCopyText(ev.value, `Copied ${ev.name}`)}
                          >
                            📋 Copy
                          </button>
                          <button
                            type="button"
                            className="shelf-btn shelf-btn-danger shelf-btn-sm"
                            disabled={envBusy}
                            onClick={async (e) => {
                              setEnvBusy(true)
                              const res = await window.api.deleteSystemEnvVar?.({
                                name: ev.name,
                                scope: ev.scope,
                                elevated: e.ctrlKey || e.metaKey || elevateByDefault
                              })
                              setEnvBusy(false)
                              if (res) {
                                setEnvVars(res.items)
                                flash(res.message)
                              }
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
         CATEGORY 1B: SUDOLAUNCH CRON & SCHEDULED JOBS (Top-Level Tab Next to Updates)
         ==================================================================== */}
      {activeCategory === 'jobs' && (
        <div className="winget-tab-body">
          <div className="winget-toolbar-row">
            <div className="profile-tabs-bar" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <button type="button" className="profile-tab-btn is-active">
                <span>⏰ SudoLaunch Cron &amp; Scheduled Jobs</span>
                <span className="profile-tab-count">
                  {scheduledJobs.filter((j) => j.enabled).length}/{scheduledJobs.length}
                </span>
              </button>
            </div>
            <input
              type="text"
              className="winget-filter-input"
              placeholder="Search SudoLaunch jobs..."
              value={serviceSearchText}
              onChange={(e) => setServiceSearchText(e.target.value)}
            />
          </div>

          <div className="winget-tab-body">
            <div className="winget-summary-bar">
              <div className="winget-chip-group">
                <button
                  type="button"
                  className={`winget-filter-chip ${jobFilterChip === 'all' ? 'is-active' : ''}`}
                  onClick={() => setJobFilterChip('all')}
                >
                  All ({scheduledJobs.length})
                </button>
                <button
                  type="button"
                  className={`winget-filter-chip ${jobFilterChip === 'enabled' ? 'is-active' : ''}`}
                  onClick={() => setJobFilterChip('enabled')}
                >
                  🟢 Enabled ({scheduledJobs.filter((j) => j.enabled).length})
                </button>
                <button
                  type="button"
                  className={`winget-filter-chip ${jobFilterChip === 'cron' ? 'is-active' : ''}`}
                  onClick={() => setJobFilterChip('cron')}
                >
                  ⏱️ Cron &amp; Interval (
                  {
                    scheduledJobs.filter(
                      (j) => j.triggerType === 'cron' || j.triggerType === 'interval'
                    ).length
                  }
                  )
                </button>
                <button
                  type="button"
                  className={`winget-filter-chip ${jobFilterChip === 'events' ? 'is-active' : ''}`}
                  onClick={() => setJobFilterChip('events')}
                >
                  ⚡ Lifecycle Events (
                  {
                    scheduledJobs.filter(
                      (j) =>
                        j.triggerType === 'startup' ||
                        j.triggerType === 'unlock' ||
                        j.triggerType === 'resume' ||
                        j.triggerType === 'network-change'
                    ).length
                  }
                  )
                </button>
                <button
                  type="button"
                  className={`winget-filter-chip ${jobFilterChip === 'custom' ? 'is-active' : ''}`}
                  onClick={() => setJobFilterChip('custom')}
                >
                  🧩 Custom Commands ({scheduledJobs.filter((j) => j.source === 'custom-command').length})
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="winget-summary-text">{filteredScheduledJobs.length} shown</span>
                <button
                  type="button"
                  className="shelf-btn shelf-btn-primary shelf-btn-sm"
                  onClick={() => {
                    if (showJobForm && !editingJobId) {
                      setShowJobForm(false)
                    } else {
                      openNewJobForm()
                    }
                  }}
                >
                  {showJobForm && !editingJobId ? '✕ Cancel' : '＋ New Scheduled Job'}
                </button>
              </div>
            </div>

            {showJobForm && (
              <div
                className="winget-pkg-row"
                style={{
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: '10px',
                  padding: '12px 14px',
                  marginBottom: '8px',
                  border: '1px solid rgba(99, 179, 237, 0.35)',
                  background: 'rgba(20, 28, 42, 0.72)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="winget-pkg-name">
                    {editingJobId ? '✏️ Edit Scheduled Job' : '⏰ Create SudoLaunch Scheduled Job'}
                  </span>
                  <button
                    type="button"
                    className="shelf-btn shelf-btn-sm"
                    onClick={() => {
                      setShowJobForm(false)
                      setEditingJobId(null)
                    }}
                  >
                    ✕ Close
                  </button>
                </div>

                {!editingJobId && jobPresets.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className="winget-summary-text" style={{ fontSize: '11px' }}>
                      Quick Fill from Maintenance Scripts (`~/.sudolaunch/maintenance`), Custom Commands, or Templates:
                    </span>
                    <div className="winget-chip-group" style={{ flexWrap: 'wrap' }}>
                      {jobPresets.slice(0, 10).map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className="winget-filter-chip"
                          onClick={() => openNewJobForm(preset)}
                          title={preset.description}
                        >
                          {preset.icon} {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <input
                    type="text"
                    className="winget-filter-input"
                    style={{ width: '100%' }}
                    placeholder="Job Name (e.g. Daily Repo Fetch)"
                    value={jobFormName}
                    onChange={(e) => setJobFormName(e.target.value)}
                  />
                  <input
                    type="text"
                    className="winget-filter-input"
                    style={{ width: '100%' }}
                    placeholder="Optional description..."
                    value={jobFormDesc}
                    onChange={(e) => setJobFormDesc(e.target.value)}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 180px', gap: '8px' }}>
                  <select
                    className="winget-filter-input"
                    style={{ width: '100%' }}
                    value={jobFormTrigger}
                    onChange={(e) => {
                      const next = e.target.value as ScheduledJobTriggerType
                      setJobFormTrigger(next)
                      if (next === 'interval' && !/^\d+$/.test(jobFormSchedule)) {
                        setJobFormSchedule('30')
                      } else if (next === 'cron' && /^\d+$/.test(jobFormSchedule)) {
                        setJobFormSchedule('0 * * * *')
                      }
                    }}
                  >
                    <option value="cron">⏱️ Cron Expression</option>
                    <option value="interval">🔄 Fixed Interval (min)</option>
                    <option value="startup">🚀 On SudoLaunch Startup</option>
                    <option value="unlock">🔓 On Workstation Unlock</option>
                    <option value="resume">⚡ On Wake from Sleep</option>
                    <option value="network-change">🌐 On Network / IP Change</option>
                  </select>

                  {jobFormTrigger === 'cron' || jobFormTrigger === 'interval' ? (
                    <input
                      type="text"
                      className="winget-filter-input"
                      style={{ width: '100%' }}
                      placeholder={
                        jobFormTrigger === 'cron'
                          ? '5-field cron (e.g. */15 * * * * or 0 9 * * 1-5 or @daily)'
                          : 'Interval in minutes (e.g. 15, 60, 240)'
                      }
                      value={jobFormSchedule}
                      onChange={(e) => setJobFormSchedule(e.target.value)}
                    />
                  ) : (
                    <div
                      className="winget-source-tag"
                      style={{ display: 'flex', alignItems: 'center', padding: '0 10px' }}
                    >
                      Triggered automatically on system event: {jobFormTrigger}
                    </div>
                  )}

                  <select
                    className="winget-filter-input"
                    style={{ width: '100%' }}
                    value={jobFormActionType}
                    onChange={(e) => setJobFormActionType(e.target.value as ScheduledJobActionType)}
                  >
                    <option value="powershell">⚡ PowerShell Command</option>
                    <option value="script">📜 Script File (.ps1 / .py / .bat)</option>
                    <option value="terminal">&gt;_ Visible SudoLaunch Terminal</option>
                  </select>
                </div>

                {jobFormTrigger === 'cron' && (
                  <div className="winget-chip-group" style={{ flexWrap: 'wrap' }}>
                    {[
                      { label: 'Every 5m', expr: '*/5 * * * *' },
                      { label: 'Every 15m', expr: '*/15 * * * *' },
                      { label: 'Every 30m', expr: '*/30 * * * *' },
                      { label: 'Hourly', expr: '0 * * * *' },
                      { label: 'Weekdays 9 AM', expr: '0 9 * * 1-5' },
                      { label: 'Daily Midnight', expr: '0 0 * * *' }
                    ].map((p) => (
                      <button
                        key={p.expr}
                        type="button"
                        className={`winget-filter-chip ${jobFormSchedule.trim() === p.expr ? 'is-active' : ''}`}
                        onClick={() => setJobFormSchedule(p.expr)}
                      >
                        {p.label} ({p.expr})
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                  <input
                    type="text"
                    className="winget-filter-input"
                    style={{ width: '100%', fontFamily: 'monospace' }}
                    placeholder={
                      jobFormActionType === 'script'
                        ? 'Path to .ps1 / .py / .cmd script (and optional args)'
                        : 'PowerShell command or script block to execute...'
                    }
                    value={jobFormCommand}
                    onChange={(e) => setJobFormCommand(e.target.value)}
                  />
                  <input
                    type="text"
                    className="winget-filter-input"
                    style={{ width: '100%', fontFamily: 'monospace' }}
                    placeholder="Working directory (optional cwd)"
                    value={jobFormCwd}
                    onChange={(e) => setJobFormCwd(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={jobFormEnabled}
                        onChange={(e) => setJobFormEnabled(e.target.checked)}
                      />
                      <span>Enabled immediately</span>
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={jobFormElevated}
                        onChange={(e) => setJobFormElevated(e.target.checked)}
                      />
                      <span>🛡️ Run Elevated (Admin)</span>
                    </label>
                    <select
                      className="winget-filter-input"
                      style={{ width: '185px', padding: '4px 8px' }}
                      value={jobFormNotify}
                      onChange={(e) => setJobFormNotify(e.target.value as ScheduledJobNotifyMode)}
                    >
                      <option value="error">🔔 Notify on Error Only</option>
                      <option value="always">🔔 Notify on Every Run</option>
                      <option value="never">🔕 Silent (No Toast)</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-sm"
                      onClick={() => void handleSaveScheduledJob(true)}
                    >
                      💾 Save &amp; Run Now
                    </button>
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-primary shelf-btn-sm"
                      onClick={() => void handleSaveScheduledJob(false)}
                    >
                      💾 Save Job
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="winget-pkg-list">
              {loadingJobs && scheduledJobs.length === 0 ? (
                <div className="profile-empty-list">Loading SudoLaunch Scheduled Jobs...</div>
              ) : filteredScheduledJobs.length === 0 ? (
                <div className="profile-empty-list">
                  No scheduled jobs match your filter. Click &ldquo;＋ New Scheduled Job&rdquo; or add a{' '}
                  <code>&quot;Schedule&quot;: &quot;0 * * * *&quot;</code> field to any{' '}
                  <code>~/.sudolaunch/commands/*.json</code> file.
                </div>
              ) : (
                filteredScheduledJobs.map((job) => {
                  const isRunning = job.status === 'running'
                  const isBusy = jobBusyId === job.id
                  const logsOpen = expandedJobLogIds.has(job.id)
                  return (
                    <div
                      key={job.id}
                      className="winget-pkg-row"
                      style={{ flexDirection: 'column', alignItems: 'stretch', gap: '6px' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                        <div className="winget-pkg-main">
                          <div className="winget-pkg-title-row">
                            <span className="winget-pkg-name">{job.name}</span>
                            <span
                              className={`winget-badge ${
                                isRunning
                                  ? 'winget-badge-installed'
                                  : !job.enabled
                                    ? 'winget-badge-blocked'
                                    : job.status === 'error'
                                      ? 'winget-badge-blocked'
                                      : 'winget-badge-installed'
                              }`}
                            >
                              {isRunning
                                ? '🔄 Running'
                                : !job.enabled
                                  ? '⏸️ Paused'
                                  : job.status === 'error'
                                    ? '🔴 Last Failed'
                                    : '🟢 Active'}
                            </span>
                            <span className="winget-source-tag">
                              {job.triggerType === 'cron'
                                ? `⏱️ ${job.schedule}`
                                : job.triggerType === 'interval'
                                  ? `🔄 Every ${job.schedule}m`
                                  : `⚡ Event: ${job.triggerType}`}
                            </span>
                            <span className="winget-source-tag">{job.scheduleSummary}</span>
                            {job.sourceCommandName && (
                              <span className="winget-badge winget-badge-pinned">
                                🧩 /{job.sourceCommandName}
                              </span>
                            )}
                            {job.elevated && (
                              <span className="winget-source-tag" title="Runs with UAC Elevation">
                                🛡️ Admin
                              </span>
                            )}
                          </div>

                          <div className="winget-pkg-meta-row">
                            <span
                              className="winget-ver-current"
                              style={{
                                fontFamily: 'monospace',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '520px'
                              }}
                              title={job.command}
                            >
                              {job.command}
                            </span>
                            {job.nextRunAt && job.enabled && (
                              <span className="winget-source-tag">
                                Next: {new Date(job.nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                            {job.lastRunAt && (
                              <span className="winget-ver-current">
                                Last: {new Date(job.lastRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                {job.lastDurationMs != null
                                  ? ` (${(job.lastDurationMs / 1000).toFixed(1)}s)`
                                  : ''}
                                {job.lastExitCode !== undefined && job.lastExitCode !== null
                                  ? ` [exit ${job.lastExitCode}]`
                                  : ''}
                              </span>
                            )}
                            <span className="winget-source-tag">Runs: {job.runCount}</span>
                          </div>
                        </div>

                        <div className="winget-pkg-actions" style={{ flexWrap: 'wrap' }}>
                          {isRunning ? (
                            <button
                              type="button"
                              className="shelf-btn shelf-btn-danger shelf-btn-sm"
                              disabled={isBusy}
                              onClick={async () => {
                                setJobBusyId(job.id)
                                const updated = await window.api.stopScheduledJob?.(job.id)
                                setJobBusyId(null)
                                if (updated) {
                                  setScheduledJobs(updated)
                                  flash(`Stopped "${job.name}"`)
                                }
                              }}
                            >
                              ⏹️ Stop
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="shelf-btn shelf-btn-primary shelf-btn-sm"
                              disabled={isBusy}
                              onClick={async () => {
                                setJobBusyId(job.id)
                                const updated = await window.api.runScheduledJobNow?.(job.id)
                                setJobBusyId(null)
                                if (updated) {
                                  setScheduledJobs(updated)
                                  flash(`Triggered "${job.name}"`)
                                }
                              }}
                              title="Trigger this job immediately in the background"
                            >
                              ▶️ Run Now
                            </button>
                          )}

                          <button
                            type="button"
                            className={`shelf-btn shelf-btn-sm ${
                              job.enabled ? 'shelf-btn-warning' : 'shelf-btn-primary'
                            }`}
                            disabled={isBusy}
                            onClick={async () => {
                              setJobBusyId(job.id)
                              const updated = await window.api.toggleScheduledJob?.(job.id)
                              setJobBusyId(null)
                              if (updated) {
                                setScheduledJobs(updated)
                                flash(`${job.enabled ? 'Paused' : 'Enabled'} "${job.name}"`)
                              }
                            }}
                          >
                            {job.enabled ? '⏸️ Pause' : '🟢 Enable'}
                          </button>

                          <button
                            type="button"
                            className="shelf-btn shelf-btn-sm"
                            onClick={async () => {
                              await window.api.openScheduledJobInTerminal?.(job.id)
                              flash(`Sent "${job.name}" to SudoLaunch Terminal`)
                            }}
                            title="Run interactively inside SudoLaunch Terminal (>_)"
                          >
                            &gt;_
                          </button>

                          <button
                            type="button"
                            className="shelf-btn shelf-btn-sm"
                            onClick={() => {
                              setExpandedJobLogIds((prev) => {
                                const next = new Set(prev)
                                if (next.has(job.id)) next.delete(job.id)
                                else next.add(job.id)
                                return next
                              })
                            }}
                            title="Toggle recent stdout/stderr execution logs"
                          >
                            📜 Logs ({job.logLines.length})
                          </button>

                          <button
                            type="button"
                            className="shelf-btn shelf-btn-sm"
                            onClick={() => openEditJobForm(job)}
                            title="Edit schedule or command"
                          >
                            ✏️
                          </button>

                          {job.source !== 'custom-command' && (
                            <button
                              type="button"
                              className="shelf-btn shelf-btn-danger shelf-btn-sm"
                              disabled={isBusy}
                              onClick={async () => {
                                setJobBusyId(job.id)
                                const updated = await window.api.deleteScheduledJob?.(job.id)
                                setJobBusyId(null)
                                if (updated) {
                                  setScheduledJobs(updated)
                                  flash(`Deleted scheduled job "${job.name}"`)
                                }
                              }}
                              title="Delete scheduled job"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>

                      {logsOpen && (
                        <div
                          style={{
                            marginTop: '4px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            background: 'rgba(0, 0, 0, 0.45)',
                            border: '1px solid rgba(255, 255, 255, 0.08)'
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: '4px'
                            }}
                          >
                            <span className="winget-summary-text" style={{ fontSize: '11px' }}>
                              Recent Execution Output ({job.logLines.length} lines)
                            </span>
                            {job.logLines.length > 0 && (
                              <button
                                type="button"
                                className="shelf-btn shelf-btn-sm"
                                onClick={async () => {
                                  const res = await window.api.clearScheduledJobLogs?.(job.id)
                                  if (res) setScheduledJobs(res)
                                }}
                              >
                                🧹 Clear Logs
                              </button>
                            )}
                          </div>
                          <pre
                            style={{
                              margin: 0,
                              maxHeight: '160px',
                              overflowY: 'auto',
                              fontSize: '11px',
                              lineHeight: 1.4,
                              fontFamily: 'monospace',
                              whiteSpace: 'pre-wrap',
                              color: '#d1d5db'
                            }}
                          >
                            {job.logLines.length > 0
                              ? job.logLines.join('\n')
                              : 'No output recorded yet. Click "▶ Run Now" to execute and capture logs.'}
                          </pre>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
         CATEGORY 3: WINDOWS SERVICES, STARTUP APPS & OS SCHEDULED TASKS
         ==================================================================== */}
      {activeCategory === 'services' && (
        <div className="winget-tab-body">
          <div className="winget-toolbar-row">
            <div className="profile-tabs-bar" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <button
                type="button"
                className={`profile-tab-btn ${servicesView === 'services' ? 'is-active' : ''}`}
                onClick={() => setServicesView('services')}
              >
                <span>⚙️ Windows Services</span>
                <span className="profile-tab-count">{services.length}</span>
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${servicesView === 'startup' ? 'is-active' : ''}`}
                onClick={() => setServicesView('startup')}
              >
                <span>🚀 Startup Apps</span>
                <span className="profile-tab-count">{startupApps.length}</span>
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${servicesView === 'tasks' ? 'is-active' : ''}`}
                onClick={() => setServicesView('tasks')}
              >
                <span>📅 OS Task Scheduler</span>
                {tasksLoadedOnce && (
                  <span className="profile-tab-count">{scheduledTasks.length}</span>
                )}
              </button>
            </div>
            {(servicesView === 'services' || servicesView === 'tasks') && (
              <input
                type="text"
                className="winget-filter-input"
                placeholder={
                  servicesView === 'services'
                    ? 'Search services...'
                    : 'Search OS scheduled tasks...'
                }
                value={serviceSearchText}
                onChange={(e) => setServiceSearchText(e.target.value)}
              />
            )}
          </div>

          {servicesView === 'services' ? (
            <div className="winget-tab-body">
              <div className="winget-summary-bar">
                <div className="winget-chip-group">
                  <button
                    type="button"
                    className={`winget-filter-chip ${serviceFilterChip === 'pinned' ? 'is-active' : ''}`}
                    onClick={() => setServiceFilterChip('pinned')}
                  >
                    ⭐ Pinned Services ({services.filter((s) => s.isPinned).length})
                  </button>
                  <button
                    type="button"
                    className={`winget-filter-chip ${serviceFilterChip === 'running' ? 'is-active' : ''}`}
                    onClick={() => setServiceFilterChip('running')}
                  >
                    🟢 Running ({services.filter((s) => s.status === 'Running').length})
                  </button>
                  <button
                    type="button"
                    className={`winget-filter-chip ${serviceFilterChip === 'stopped' ? 'is-active' : ''}`}
                    onClick={() => setServiceFilterChip('stopped')}
                  >
                    🔴 Stopped ({services.filter((s) => s.status !== 'Running').length})
                  </button>
                  <button
                    type="button"
                    className={`winget-filter-chip ${serviceFilterChip === 'all' ? 'is-active' : ''}`}
                    onClick={() => setServiceFilterChip('all')}
                  >
                    All ({services.length})
                  </button>
                </div>
                <span className="winget-summary-text">{filteredServices.length} shown</span>
              </div>

              <div className="winget-pkg-list">
                {loadingServices && services.length === 0 ? (
                  <div className="profile-empty-list">Loading Windows Services...</div>
                ) : filteredServices.length === 0 ? (
                  <div className="profile-empty-list">No services match your filter.</div>
                ) : (
                  filteredServices.slice(0, 120).map((svc) => {
                    const isRunning = svc.status === 'Running'
                    const isBusy = serviceBusyName === svc.name
                    return (
                      <div key={svc.name} className="winget-pkg-row">
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-sm"
                          style={{ padding: '3px 7px' }}
                          onClick={async () => {
                            const updated = await window.api.togglePinSystemService?.(svc.name)
                            if (updated) setServices(updated)
                          }}
                          title={svc.isPinned ? 'Unpin service' : 'Pin service to Favorites'}
                        >
                          {svc.isPinned ? '⭐' : '☆'}
                        </button>
                        <div className="winget-pkg-main">
                          <div className="winget-pkg-title-row">
                            <span className="winget-pkg-name">{svc.displayName}</span>
                            <button
                              type="button"
                              className="winget-pkg-id-btn"
                              onClick={() => handleCopyText(svc.name, 'Copied Service Name')}
                            >
                              {svc.name}
                            </button>
                            <span
                              className={`winget-badge ${
                                isRunning ? 'winget-badge-installed' : 'winget-badge-blocked'
                              }`}
                            >
                              {isRunning ? '🟢 Running' : '🔴 Stopped'}
                            </span>
                            <span className="winget-source-tag">Startup: {svc.startType}</span>
                          </div>
                        </div>

                        <div className="winget-pkg-actions">
                          {isRunning ? (
                            <>
                              <button
                                type="button"
                                className="shelf-btn shelf-btn-primary shelf-btn-sm"
                                disabled={isBusy}
                                onClick={async (e) => {
                                  setServiceBusyName(svc.name)
                                  const res = await window.api.runSystemServiceAction?.({
                                    name: svc.name,
                                    action: 'restart',
                                    elevated: e.ctrlKey || e.metaKey || elevateByDefault
                                  })
                                  setServiceBusyName(null)
                                  if (res) {
                                    setServices(res.services)
                                    flash(res.message)
                                  }
                                }}
                              >
                                🔄 Restart
                              </button>
                              <button
                                type="button"
                                className="shelf-btn shelf-btn-danger shelf-btn-sm"
                                disabled={isBusy}
                                onClick={async (e) => {
                                  setServiceBusyName(svc.name)
                                  const res = await window.api.runSystemServiceAction?.({
                                    name: svc.name,
                                    action: 'stop',
                                    elevated: e.ctrlKey || e.metaKey || elevateByDefault
                                  })
                                  setServiceBusyName(null)
                                  if (res) {
                                    setServices(res.services)
                                    flash(res.message)
                                  }
                                }}
                              >
                                ⏹️ Stop
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="shelf-btn shelf-btn-primary shelf-btn-sm"
                              disabled={isBusy}
                              onClick={async (e) => {
                                setServiceBusyName(svc.name)
                                const res = await window.api.runSystemServiceAction?.({
                                  name: svc.name,
                                  action: 'start',
                                  elevated: e.ctrlKey || e.metaKey || elevateByDefault
                                })
                                setServiceBusyName(null)
                                if (res) {
                                  setServices(res.services)
                                  flash(res.message)
                                }
                              }}
                            >
                              ▶️ Start
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          ) : servicesView === 'startup' ? (
            <div className="winget-pkg-list">
              {startupApps.length === 0 ? (
                <div className="profile-empty-list">No startup entries found.</div>
              ) : (
                startupApps.map((app, idx) => (
                  <div key={`${app.location}-${app.name}-${idx}`} className="winget-pkg-row">
                    <div className="winget-pkg-main">
                      <div className="winget-pkg-title-row">
                        <span className="winget-pkg-name">{app.name}</span>
                        <span className="winget-source-tag">{app.location}</span>
                      </div>
                      <div className="winget-pkg-meta-row">
                        <span
                          className="winget-ver-current"
                          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '720px' }}
                        >
                          {app.command}
                        </span>
                      </div>
                    </div>
                    <div className="winget-pkg-actions">
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-sm"
                        onClick={() => handleCopyText(app.command, 'Copied Startup Command')}
                      >
                        📋 Copy Cmd
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            /* SUB-VIEW 3: SCHEDULED TASKS INSPECTOR */
            <div className="winget-tab-body">
              <div className="winget-summary-bar">
                <div className="winget-chip-group">
                  <button
                    type="button"
                    className={`winget-filter-chip ${taskFilterChip === 'custom' ? 'is-active' : ''}`}
                    onClick={() => setTaskFilterChip('custom')}
                  >
                    ⚡ User &amp; 3rd-Party ({scheduledTasks.filter((t) => !t.isSystemTask).length})
                  </button>
                  <button
                    type="button"
                    className={`winget-filter-chip ${taskFilterChip === 'ready' ? 'is-active' : ''}`}
                    onClick={() => setTaskFilterChip('ready')}
                  >
                    🟢 Ready / Running (
                    {
                      scheduledTasks.filter(
                        (t) => t.state === 'Ready' || t.state === 'Running'
                      ).length
                    }
                    )
                  </button>
                  <button
                    type="button"
                    className={`winget-filter-chip ${taskFilterChip === 'disabled' ? 'is-active' : ''}`}
                    onClick={() => setTaskFilterChip('disabled')}
                  >
                    ⏸️ Disabled ({scheduledTasks.filter((t) => t.state === 'Disabled').length})
                  </button>
                  <button
                    type="button"
                    className={`winget-filter-chip ${taskFilterChip === 'all' ? 'is-active' : ''}`}
                    onClick={() => setTaskFilterChip('all')}
                  >
                    All ({scheduledTasks.length})
                  </button>
                </div>
                <span className="winget-summary-text">{filteredScheduledTasks.length} shown</span>
              </div>

              <div className="winget-pkg-list">
                {loadingTasks && scheduledTasks.length === 0 ? (
                  <div className="profile-empty-list">
                    Querying Windows Task Scheduler (Get-ScheduledTask)...
                  </div>
                ) : filteredScheduledTasks.length === 0 ? (
                  <div className="profile-empty-list">No scheduled tasks match your filter.</div>
                ) : (
                  filteredScheduledTasks.map((task) => {
                    const key = `${task.path}${task.name}`
                    const isBusy = taskBusyKey === key
                    const isDisabled = task.state === 'Disabled'
                    return (
                      <div key={key} className="winget-pkg-row">
                        <div className="winget-pkg-main">
                          <div className="winget-pkg-title-row">
                            <span className="winget-pkg-name">{task.name}</span>
                            <span
                              className={`winget-badge ${
                                task.state === 'Running'
                                  ? 'winget-badge-installed'
                                  : isDisabled
                                    ? 'winget-badge-blocked'
                                    : 'winget-badge-pinned'
                              }`}
                            >
                              {task.state}
                            </span>
                            <span className="winget-source-tag">{task.path}</span>
                          </div>
                          <div className="winget-pkg-meta-row">
                            {task.lastRunTime && (
                              <span className="winget-ver-current">
                                Last Run: {task.lastRunTime}
                              </span>
                            )}
                            {task.lastResult && (
                              <span className="winget-source-tag">Result: {task.lastResult}</span>
                            )}
                            {task.nextRunTime && (
                              <span className="winget-ver-current">Next: {task.nextRunTime}</span>
                            )}
                            {task.author && (
                              <span className="winget-source-tag">By: {task.author}</span>
                            )}
                          </div>
                        </div>
                        <div className="winget-pkg-actions">
                          <button
                            type="button"
                            className="shelf-btn shelf-btn-primary shelf-btn-sm"
                            disabled={isBusy || isDisabled}
                            onClick={async (e) => {
                              setTaskBusyKey(key)
                              const res = await window.api.runSystemScheduledTaskAction?.({
                                taskPath: task.path,
                                taskName: task.name,
                                action: 'run',
                                elevated: e.ctrlKey || e.metaKey || elevateByDefault
                              })
                              setTaskBusyKey(null)
                              if (res) {
                                setScheduledTasks(res.tasks)
                                flash(res.message)
                              }
                            }}
                          >
                            ▶️ Run Now
                          </button>
                          <button
                            type="button"
                            className={`shelf-btn shelf-btn-sm ${
                              isDisabled ? 'shelf-btn-primary' : 'shelf-btn-warning'
                            }`}
                            disabled={isBusy}
                            onClick={async (e) => {
                              setTaskBusyKey(key)
                              const res = await window.api.runSystemScheduledTaskAction?.({
                                taskPath: task.path,
                                taskName: task.name,
                                action: isDisabled ? 'enable' : 'disable',
                                elevated: e.ctrlKey || e.metaKey || elevateByDefault
                              })
                              setTaskBusyKey(null)
                              if (res) {
                                setScheduledTasks(res.tasks)
                                flash(res.message)
                              }
                            }}
                          >
                            {isDisabled ? '🟢 Enable' : '⏸️ Disable'}
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
         CATEGORY 4: PORTS, PROCESSES, HOSTS FILE & NETWORK / DNS
         ==================================================================== */}
      {activeCategory === 'ports' && (
        <div className="winget-tab-body">
          <div className="winget-toolbar-row">
            <div className="profile-tabs-bar" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <button
                type="button"
                className={`profile-tab-btn ${portsView === 'ports' ? 'is-active' : ''}`}
                onClick={() => setPortsView('ports')}
              >
                <span>🔌 Listening TCP Ports</span>
                <span className="profile-tab-count">{ports.length}</span>
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${portsView === 'processes' ? 'is-active' : ''}`}
                onClick={() => setPortsView('processes')}
              >
                <span>📊 Top Processes</span>
                <span className="profile-tab-count">{processes.length}</span>
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${portsView === 'hosts' ? 'is-active' : ''}`}
                onClick={() => setPortsView('hosts')}
              >
                <span>📝 Hosts File</span>
                <span className="profile-tab-count">{hostEntries.length}</span>
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${portsView === 'network' ? 'is-active' : ''}`}
                onClick={() => setPortsView('network')}
              >
                <span>🌐 Network &amp; DNS</span>
                <span className="profile-tab-count">{networkAdapters.length}</span>
              </button>
            </div>
            {(portsView === 'ports' || portsView === 'processes') && (
              <input
                type="text"
                className="winget-filter-input"
                placeholder={
                  portsView === 'ports'
                    ? 'Filter port (e.g. 3000) or process...'
                    : 'Filter process name or PID...'
                }
                value={portSearchText}
                onChange={(e) => setPortSearchText(e.target.value)}
              />
            )}
          </div>

          {portsView === 'ports' ? (
            <div className="winget-tab-body">
              <div className="winget-summary-bar">
                <div className="winget-chip-group">
                  <button
                    type="button"
                    className={`winget-filter-chip ${portFilterChip === 'dev' ? 'is-active' : ''}`}
                    onClick={() => setPortFilterChip('dev')}
                  >
                    ⚡ Dev &amp; Web Ports ({ports.filter((p) => p.isCommonDevPort).length})
                  </button>
                  <button
                    type="button"
                    className={`winget-filter-chip ${portFilterChip === 'all' ? 'is-active' : ''}`}
                    onClick={() => setPortFilterChip('all')}
                  >
                    All Listening Ports ({ports.length})
                  </button>
                </div>
                <span className="winget-summary-text">{filteredPorts.length} shown</span>
              </div>

              <div className="winget-pkg-list">
                {loadingPorts && ports.length === 0 ? (
                  <div className="profile-empty-list">Scanning active TCP listening ports...</div>
                ) : filteredPorts.length === 0 ? (
                  <div className="profile-empty-list">No listening ports match your filter.</div>
                ) : (
                  filteredPorts.map((p) => (
                    <div key={`${p.port}-${p.pid}`} className="winget-pkg-row">
                      <div className="winget-pkg-main">
                        <div className="winget-pkg-title-row">
                          <span className="winget-badge winget-badge-installed">:{p.port}</span>
                          <span className="winget-pkg-name">{p.processName}</span>
                          <button
                            type="button"
                            className="winget-pkg-id-btn"
                            onClick={() => handleCopyText(String(p.pid), 'Copied PID')}
                          >
                            PID {p.pid}
                          </button>
                          {p.memoryMb !== undefined && (
                            <span className="winget-source-tag">{p.memoryMb} MB</span>
                          )}
                          <span className="winget-source-tag">{p.localAddress}</span>
                        </div>
                      </div>
                      <div className="winget-pkg-actions">
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-sm"
                          onClick={() =>
                            window.api.openExternalUrl?.(`http://localhost:${p.port}`)
                          }
                        >
                          🌐 localhost:{p.port}
                        </button>
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-sm"
                          onClick={async () => {
                            const res = await window.api.runSystemNetworkAction?.({
                              action: 'allow-port-firewall',
                              port: p.port
                            })
                            if (res?.message) flash(res.message)
                          }}
                          title={`Add Windows Defender Firewall inbound allow rule for TCP port ${p.port} (UAC)`}
                        >
                          🧱 Allow Firewall
                        </button>
                        <button
                          type="button"
                          className={`shelf-btn shelf-btn-sm ${
                            confirmKillPid === p.pid ? 'shelf-btn-danger' : ''
                          }`}
                          onClick={async (e) => {
                            if (confirmKillPid !== p.pid) {
                              setConfirmKillPid(p.pid)
                              setTimeout(
                                () => setConfirmKillPid((cur) => (cur === p.pid ? null : cur)),
                                4000
                              )
                              return
                            }
                            setConfirmKillPid(null)
                            const res = await window.api.killSystemProcess?.(
                              p.pid,
                              e.ctrlKey || e.metaKey || elevateByDefault
                            )
                            if (res) {
                              flash(res.message)
                              void loadPortsAndProcesses()
                            }
                          }}
                        >
                          {confirmKillPid === p.pid ? '⚠️ Confirm Kill?' : '🛑 Kill Process'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : portsView === 'processes' ? (
            <div className="winget-tab-body">
              <div className="winget-summary-bar">
                <div className="winget-chip-group">
                  <button
                    type="button"
                    className={`winget-filter-chip ${processSortBy === 'memory' ? 'is-active' : ''}`}
                    onClick={() => setProcessSortBy('memory')}
                  >
                    Sort by Memory (MB)
                  </button>
                  <button
                    type="button"
                    className={`winget-filter-chip ${processSortBy === 'cpu' ? 'is-active' : ''}`}
                    onClick={() => setProcessSortBy('cpu')}
                  >
                    Sort by CPU Time (s)
                  </button>
                </div>
              </div>

              <div className="winget-pkg-list">
                {filteredProcesses.map((proc) => (
                  <div key={proc.pid} className="winget-pkg-row">
                    <div className="winget-pkg-main">
                      <div className="winget-pkg-title-row">
                        <span className="winget-pkg-name">{proc.name}</span>
                        <button
                          type="button"
                          className="winget-pkg-id-btn"
                          onClick={() => handleCopyText(String(proc.pid), 'Copied PID')}
                        >
                          PID {proc.pid}
                        </button>
                        <span className="winget-badge winget-badge-pinned">
                          {proc.memoryMb} MB RAM
                        </span>
                        <span className="winget-source-tag">{proc.cpuSec}s CPU</span>
                      </div>
                      {proc.windowTitle && (
                        <div className="winget-pkg-meta-row">
                          <span className="winget-ver-current">{proc.windowTitle}</span>
                        </div>
                      )}
                    </div>
                    <div className="winget-pkg-actions">
                      {proc.path && (
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-sm"
                          onClick={() => window.api.revealPathInExplorer?.(proc.path!)}
                        >
                          📂 Reveal
                        </button>
                      )}
                      <button
                        type="button"
                        className={`shelf-btn shelf-btn-sm ${
                          confirmKillPid === proc.pid ? 'shelf-btn-danger' : ''
                        }`}
                        onClick={async (e) => {
                          if (confirmKillPid !== proc.pid) {
                            setConfirmKillPid(proc.pid)
                            setTimeout(
                              () => setConfirmKillPid((cur) => (cur === proc.pid ? null : cur)),
                              4000
                            )
                            return
                          }
                          setConfirmKillPid(null)
                          const res = await window.api.killSystemProcess?.(
                            proc.pid,
                            e.ctrlKey || e.metaKey || elevateByDefault
                          )
                          if (res) {
                            flash(res.message)
                            void loadPortsAndProcesses()
                          }
                        }}
                      >
                        {confirmKillPid === proc.pid ? '⚠️ Confirm?' : '🛑 Kill'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : portsView === 'hosts' ? (
            /* SUB-VIEW 3: HOSTS FILE EDITOR (C:\Windows\System32\drivers\etc\hosts) */
            <div className="winget-tab-body">
              <div className="winget-search-bar-row">
                <input
                  type="text"
                  className="winget-filter-input"
                  style={{ width: 150 }}
                  placeholder="IP (127.0.0.1)"
                  value={newHostIp}
                  onChange={(e) => setNewHostIp(e.target.value)}
                />
                <input
                  type="text"
                  className="winget-search-input"
                  style={{ flex: 1 }}
                  placeholder="Hostname (e.g. api.local.dev or staging.internal)..."
                  value={newHostName}
                  onChange={(e) => setNewHostName(e.target.value)}
                />
                <input
                  type="text"
                  className="winget-filter-input"
                  style={{ width: 180 }}
                  placeholder="Optional # comment"
                  value={newHostComment}
                  onChange={(e) => setNewHostComment(e.target.value)}
                />
                <button
                  type="button"
                  className="shelf-btn shelf-btn-primary shelf-btn-sm"
                  disabled={hostBusy || !newHostName.trim()}
                  onClick={async () => {
                    setHostBusy(true)
                    const res = await window.api.saveSystemHostEntry?.({
                      action: 'add',
                      ip: newHostIp.trim() || '127.0.0.1',
                      hostname: newHostName.trim(),
                      comment: newHostComment.trim()
                    })
                    setHostBusy(false)
                    if (res) {
                      setHostEntries(res.entries)
                      if (res.success) {
                        setNewHostName('')
                        setNewHostComment('')
                      }
                      flash(res.message)
                    }
                  }}
                >
                  ➕ Add Mapping (UAC)
                </button>
                <button
                  type="button"
                  className="shelf-btn shelf-btn-sm"
                  onClick={async () => {
                    const res = await window.api.runSystemNetworkAction?.({
                      action: 'open-hosts-folder'
                    })
                    if (res?.message) flash(res.message)
                  }}
                >
                  📂 Open etc\hosts
                </button>
              </div>

              <div className="winget-pkg-list">
                {hostEntries.length === 0 ? (
                  <div className="profile-empty-list">
                    No custom host mappings found in C:\Windows\System32\drivers\etc\hosts. Add a local domain above!
                  </div>
                ) : (
                  hostEntries.map((h) => (
                    <div key={`${h.lineIndex}-${h.hostname}`} className="winget-pkg-row">
                      <div className="winget-pkg-main">
                        <div className="winget-pkg-title-row">
                          <span
                            className={`winget-badge ${
                              h.enabled ? 'winget-badge-installed' : 'winget-badge-blocked'
                            }`}
                          >
                            {h.enabled ? '🟢 Active' : '⚪ Commented (#)'}
                          </span>
                          <span
                            className="winget-pkg-name"
                            style={{ fontFamily: 'Cascadia Mono, Consolas, monospace' }}
                          >
                            {h.hostname}
                          </span>
                          <span className="winget-source-tag">→ {h.ip}</span>
                          {h.comment && (
                            <span className="winget-ver-current"># {h.comment}</span>
                          )}
                        </div>
                      </div>
                      <div className="winget-pkg-actions">
                        <button
                          type="button"
                          className={`shelf-btn shelf-btn-sm ${
                            h.enabled ? 'shelf-btn-warning' : 'shelf-btn-primary'
                          }`}
                          disabled={hostBusy}
                          onClick={async () => {
                            setHostBusy(true)
                            const res = await window.api.saveSystemHostEntry?.({
                              action: 'toggle',
                              lineIndex: h.lineIndex
                            })
                            setHostBusy(false)
                            if (res) {
                              setHostEntries(res.entries)
                              flash(res.message)
                            }
                          }}
                        >
                          {h.enabled ? '⏸️ Disable' : '🟢 Enable'}
                        </button>
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-danger shelf-btn-sm"
                          disabled={hostBusy}
                          onClick={async () => {
                            setHostBusy(true)
                            const res = await window.api.saveSystemHostEntry?.({
                              action: 'delete',
                              lineIndex: h.lineIndex
                            })
                            setHostBusy(false)
                            if (res) {
                              setHostEntries(res.entries)
                              flash(res.message)
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
          ) : (
            /* SUB-VIEW 4: NETWORK ADAPTERS & QUICK DNS SWITCHER */
            <div className="winget-tab-body">
              <div className="winget-summary-bar">
                <span className="winget-summary-text">
                  🌐 Active Network Interfaces ({networkAdapters.length})
                </span>
                <div className="winget-summary-actions">
                  <button
                    type="button"
                    className="shelf-btn shelf-btn-primary shelf-btn-sm"
                    onClick={async () => {
                      const res = await window.api.runSystemNetworkAction?.({
                        action: 'flush-dns'
                      })
                      if (res?.message) flash(res.message)
                    }}
                  >
                    ⚡ Flush DNS Cache (ipconfig /flushdns)
                  </button>
                  <button
                    type="button"
                    className="shelf-btn shelf-btn-warning shelf-btn-sm"
                    onClick={async () => {
                      const res = await window.api.runSystemNetworkAction?.({
                        action: 'reset-winsock'
                      })
                      if (res?.message) flash(res.message)
                    }}
                  >
                    🔄 Reset Winsock &amp; TCP Stack (UAC)
                  </button>
                </div>
              </div>

              <div className="winget-pkg-list">
                {networkAdapters.length === 0 ? (
                  <div className="profile-empty-list">Loading active network adapters...</div>
                ) : (
                  networkAdapters.map((nic) => (
                    <div key={nic.name} className="winget-pkg-row">
                      <div className="winget-pkg-main">
                        <div className="winget-pkg-title-row">
                          <span className="winget-badge winget-badge-installed">{nic.status}</span>
                          <span className="winget-pkg-name">{nic.name}</span>
                          <span className="winget-source-tag">{nic.description}</span>
                        </div>
                        <div className="winget-pkg-meta-row">
                          {nic.ipv4 && (
                            <span
                              className="winget-ver-current"
                              style={{ cursor: 'pointer' }}
                              onClick={() => handleCopyText(nic.ipv4, 'Copied IPv4')}
                            >
                              IPv4: <strong>{nic.ipv4}</strong> 📋
                            </span>
                          )}
                          {nic.gateway && (
                            <span className="winget-source-tag">GW: {nic.gateway}</span>
                          )}
                          {nic.macAddress && (
                            <span className="winget-source-tag">MAC: {nic.macAddress}</span>
                          )}
                          <span className="winget-source-tag">
                            DNS: {nic.dnsServers.length > 0 ? nic.dnsServers.join(', ') : 'Auto'}
                          </span>
                        </div>
                      </div>
                      <div className="winget-pkg-actions">
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-sm"
                          onClick={async () => {
                            const res = await window.api.runSystemNetworkAction?.({
                              action: 'set-dns',
                              adapterName: nic.name,
                              dnsPreset: 'cloudflare'
                            })
                            if (res?.message) flash(res.message)
                            setTimeout(() => void loadPortsAndProcesses(), 1600)
                          }}
                          title="Set DNS to Cloudflare 1.1.1.1 / 1.0.0.1 (UAC)"
                        >
                          ☁️ 1.1.1.1
                        </button>
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-sm"
                          onClick={async () => {
                            const res = await window.api.runSystemNetworkAction?.({
                              action: 'set-dns',
                              adapterName: nic.name,
                              dnsPreset: 'google'
                            })
                            if (res?.message) flash(res.message)
                            setTimeout(() => void loadPortsAndProcesses(), 1600)
                          }}
                          title="Set DNS to Google 8.8.8.8 / 8.8.4.4 (UAC)"
                        >
                          🔍 8.8.8.8
                        </button>
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-sm"
                          onClick={async () => {
                            const res = await window.api.runSystemNetworkAction?.({
                              action: 'set-dns',
                              adapterName: nic.name,
                              dnsPreset: 'quad9'
                            })
                            if (res?.message) flash(res.message)
                            setTimeout(() => void loadPortsAndProcesses(), 1600)
                          }}
                          title="Set DNS to Quad9 Security 9.9.9.9 (UAC)"
                        >
                          🛡️ 9.9.9.9
                        </button>
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-sm"
                          onClick={async () => {
                            const res = await window.api.runSystemNetworkAction?.({
                              action: 'set-dns',
                              adapterName: nic.name,
                              dnsPreset: 'dhcp'
                            })
                            if (res?.message) flash(res.message)
                            setTimeout(() => void loadPortsAndProcesses(), 1600)
                          }}
                          title="Reset DNS servers to automatic DHCP (UAC)"
                        >
                          🔄 DHCP
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
         CATEGORY 5: DISK CACHES, STORAGE SMART HEALTH, POWER PLANS & REPAIR
         ==================================================================== */}
      {activeCategory === 'cleanup' && (
        <div className="winget-tab-body">
          <div className="winget-toolbar-row">
            <div className="profile-tabs-bar" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <button
                type="button"
                className={`profile-tab-btn ${cleanupView === 'caches' ? 'is-active' : ''}`}
                onClick={() => setCleanupView('caches')}
              >
                <span>🧹 Dev &amp; System Caches</span>
                <span className="profile-tab-count">{totalCleanupMb} MB</span>
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${cleanupView === 'storage' ? 'is-active' : ''}`}
                onClick={() => setCleanupView('storage')}
              >
                <span>💾 Storage &amp; SMART Health</span>
                {storageAndPower && (
                  <span className="profile-tab-count">{storageAndPower.volumes.length} drives</span>
                )}
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${cleanupView === 'power' ? 'is-active' : ''}`}
                onClick={() => setCleanupView('power')}
              >
                <span>🔋 Power Plans &amp; OS Repair</span>
              </button>
            </div>
          </div>

          {cleanupView === 'caches' ? (
            <div className="winget-tab-body">
              <div className="winget-summary-bar">
                <span className="winget-summary-text">
                  {loadingCleanup
                    ? 'Calculating developer & system cache sizes...'
                    : `Selected reclaimable space: ~${totalCleanupMb} MB`}
                </span>
                <div className="winget-summary-actions">
                  <button
                    type="button"
                    className="shelf-btn shelf-btn-primary shelf-btn-sm"
                    disabled={cleaningBusy || selectedCleanupIds.size === 0}
                    onClick={async () => {
                      setCleaningBusy(true)
                      const res = await window.api.cleanSystemTargets?.([...selectedCleanupIds])
                      setCleaningBusy(false)
                      if (res) {
                        setCleanupTargets(res.targets)
                        flash(res.message)
                      }
                    }}
                  >
                    {cleaningBusy ? (
                      <>
                        <span className="sudo-spinner sudo-spinner-sm" /> Cleaning…
                      </>
                    ) : (
                      `🧹 Clean Selected (${totalCleanupMb} MB)`
                    )}
                  </button>
                </div>
              </div>

              <div className="winget-pkg-list">
                {loadingCleanup && cleanupTargets.length === 0 ? (
                  <div className="profile-empty-list">Scanning cache directories...</div>
                ) : (
                  cleanupTargets.map((target) => (
                    <div key={target.id} className="winget-pkg-row">
                      <input
                        type="checkbox"
                        className="winget-row-checkbox"
                        checked={selectedCleanupIds.has(target.id)}
                        onChange={() => {
                          setSelectedCleanupIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(target.id)) next.delete(target.id)
                            else next.add(target.id)
                            return next
                          })
                        }}
                      />
                      <div className="winget-pkg-main">
                        <div className="winget-pkg-title-row">
                          <span>{target.icon}</span>
                          <span className="winget-pkg-name">{target.name}</span>
                          <span className="winget-badge winget-badge-pinned">
                            {target.sizeMb} MB
                          </span>
                          {target.fileCount !== undefined && target.fileCount > 0 && (
                            <span className="winget-source-tag">{target.fileCount} files</span>
                          )}
                          <span className="winget-source-tag">{target.category}</span>
                        </div>
                        <div className="winget-pkg-meta-row">
                          <span className="winget-ver-current">{target.description}</span>
                        </div>
                      </div>
                      <div className="winget-pkg-actions">
                        {target.exists && (
                          <button
                            type="button"
                            className="shelf-btn shelf-btn-sm"
                            onClick={() => window.api.revealPathInExplorer?.(target.path)}
                          >
                            📂 Folder
                          </button>
                        )}
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-primary shelf-btn-sm"
                          disabled={cleaningBusy || target.sizeMb === 0}
                          onClick={async () => {
                            setCleaningBusy(true)
                            const res = await window.api.cleanSystemTargets?.([target.id])
                            setCleaningBusy(false)
                            if (res) {
                              setCleanupTargets(res.targets)
                              flash(res.message)
                            }
                          }}
                        >
                          Clean Now
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : cleanupView === 'storage' ? (
            /* SUB-VIEW 2: STORAGE VOLUMES & PHYSICAL DISK SMART HEALTH */
            <div className="winget-tab-body">
              <div className="winget-summary-bar">
                <span className="winget-summary-text">
                  💾 Logical Drive Volumes ({storageAndPower?.volumes.length ?? 0}) &amp; Physical
                  Disks ({storageAndPower?.disks.length ?? 0})
                </span>
              </div>

              <div className="winget-pkg-list">
                {!storageAndPower ? (
                  <div className="profile-empty-list">Scanning volumes and physical SMART status...</div>
                ) : (
                  <>
                    {storageAndPower.volumes.map((vol) => (
                      <div key={vol.driveLetter} className="winget-pkg-row">
                        <div className="winget-pkg-main">
                          <div className="winget-pkg-title-row">
                            <span className="winget-badge winget-badge-installed">
                              {vol.driveLetter}:
                            </span>
                            <span className="winget-pkg-name">
                              {vol.label || 'Local Volume'} ({vol.driveLetter}:)
                            </span>
                            <span className="winget-source-tag">{vol.fileSystem}</span>
                            <span
                              className={`winget-badge ${
                                vol.healthStatus === 'Healthy'
                                  ? 'winget-badge-installed'
                                  : 'winget-badge-blocked'
                              }`}
                            >
                              {vol.healthStatus}
                            </span>
                          </div>
                          <div className="winget-pkg-meta-row" style={{ marginTop: 4 }}>
                            <div
                              style={{
                                width: 220,
                                height: 7,
                                background: 'rgba(255,255,255,0.1)',
                                borderRadius: 4,
                                overflow: 'hidden'
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.min(100, vol.usedPercent)}%`,
                                  height: '100%',
                                  background:
                                    vol.usedPercent > 88
                                      ? '#ef4444'
                                      : vol.usedPercent > 75
                                        ? '#f59e0b'
                                        : '#06b6d4'
                                }}
                              />
                            </div>
                            <span className="winget-ver-current">
                              {vol.usedGb} GB used of {vol.totalGb} GB ({vol.freeGb} GB free •{' '}
                              {vol.usedPercent}%)
                            </span>
                          </div>
                        </div>
                        <div className="winget-pkg-actions">
                          <button
                            type="button"
                            className="shelf-btn shelf-btn-sm"
                            onClick={() =>
                              window.api.revealPathInExplorer?.(`${vol.driveLetter}:\\`)
                            }
                          >
                            📂 Open {vol.driveLetter}:
                          </button>
                        </div>
                      </div>
                    ))}

                    {storageAndPower.disks.map((d, idx) => (
                      <div key={`${d.friendlyName}-${idx}`} className="winget-pkg-row">
                        <div className="winget-pkg-main">
                          <div className="winget-pkg-title-row">
                            <span className="winget-badge winget-badge-pinned">
                              💽 {d.mediaType} ({d.busType})
                            </span>
                            <span className="winget-pkg-name">{d.friendlyName}</span>
                            <span className="winget-source-tag">{d.sizeGb} GB</span>
                            <span
                              className={`winget-badge ${
                                d.healthStatus === 'Healthy'
                                  ? 'winget-badge-installed'
                                  : 'winget-badge-blocked'
                              }`}
                            >
                              SMART: {d.healthStatus} ({d.operationalStatus})
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          ) : (
            /* SUB-VIEW 3: POWER PLANS, SLEEP LOCKS & SYSTEM REPAIR TOOLKIT */
            <div className="winget-tab-body">
              <div className="winget-summary-bar">
                <span className="winget-summary-text">
                  ⚡ Windows Power Schemes (powercfg /list)
                </span>
                <div className="winget-summary-actions">
                  <button
                    type="button"
                    className="shelf-btn shelf-btn-sm"
                    onClick={async () => {
                      const res = await window.api.runSystemPowerOrRepairAction?.({
                        action: 'battery-report'
                      })
                      if (res?.message) flash(res.message)
                    }}
                  >
                    🔋 Generate Battery Health Report
                  </button>
                </div>
              </div>

              <div className="winget-pkg-list" style={{ maxHeight: 155, flexShrink: 0 }}>
                {storageAndPower?.powerPlans.map((plan) => (
                  <div key={plan.guid} className="winget-pkg-row">
                    <div className="winget-pkg-main">
                      <div className="winget-pkg-title-row">
                        <span className="winget-pkg-name">{plan.name}</span>
                        <span className="winget-source-tag">{plan.guid}</span>
                        {plan.isActive && (
                          <span className="winget-badge winget-badge-installed">⚡ Active Plan</span>
                        )}
                      </div>
                    </div>
                    <div className="winget-pkg-actions">
                      {!plan.isActive && (
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-primary shelf-btn-sm"
                          onClick={async () => {
                            const res = await window.api.runSystemPowerOrRepairAction?.({
                              action: 'set-power-plan',
                              planGuid: plan.guid
                            })
                            if (res?.message) flash(res.message)
                            void loadCleanup()
                          }}
                        >
                          ⚡ Activate
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="winget-summary-bar">
                <span className="winget-summary-text">
                  🔧 Windows System Maintenance, WSL Memory Reclaim &amp; DISM / SFC Repair Toolkit
                </span>
              </div>

              <div className="system-runtimes-grid" style={{ padding: '4px 0' }}>
                <div className="system-runtime-card">
                  <div className="system-runtime-top">
                    <div className="system-runtime-title-group">
                      <span className="system-runtime-icon">🐧</span>
                      <div>
                        <div className="system-runtime-name">Shutdown WSL 2 VM</div>
                        <div className="system-runtime-ver">wsl --shutdown (Reclaim vmmemWSL RAM)</div>
                      </div>
                    </div>
                  </div>
                  <div className="system-runtime-actions">
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-primary shelf-btn-sm"
                      onClick={async () => {
                        const res = await window.api.runSystemPowerOrRepairAction?.({
                          action: 'wsl-shutdown'
                        })
                        if (res?.message) flash(res.message)
                      }}
                    >
                      🐧 Shutdown WSL Now
                    </button>
                  </div>
                </div>

                <div className="system-runtime-card">
                  <div className="system-runtime-top">
                    <div className="system-runtime-title-group">
                      <span className="system-runtime-icon">🔍</span>
                      <div>
                        <div className="system-runtime-name">System File Checker (SFC)</div>
                        <div className="system-runtime-ver">sfc /scannow (Verify OS Integrity)</div>
                      </div>
                    </div>
                  </div>
                  <div className="system-runtime-actions">
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-primary shelf-btn-sm"
                      onClick={async () => {
                        const res = await window.api.runSystemPowerOrRepairAction?.({
                          action: 'sfc-scannow'
                        })
                        if (res?.message) flash(res.message)
                      }}
                    >
                      🛡️ Run sfc /scannow (UAC)
                    </button>
                  </div>
                </div>

                <div className="system-runtime-card">
                  <div className="system-runtime-top">
                    <div className="system-runtime-title-group">
                      <span className="system-runtime-icon">🛠️</span>
                      <div>
                        <div className="system-runtime-name">DISM Image Health &amp; Repair</div>
                        <div className="system-runtime-ver">DISM /CheckHealth &amp; /RestoreHealth</div>
                      </div>
                    </div>
                  </div>
                  <div className="system-runtime-actions">
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-sm"
                      onClick={async () => {
                        const res = await window.api.runSystemPowerOrRepairAction?.({
                          action: 'dism-check'
                        })
                        if (res?.message) flash(res.message)
                      }}
                    >
                      &gt;_ CheckHealth
                    </button>
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-primary shelf-btn-sm"
                      onClick={async () => {
                        const res = await window.api.runSystemPowerOrRepairAction?.({
                          action: 'dism-restore'
                        })
                        if (res?.message) flash(res.message)
                      }}
                    >
                      🛡️ RestoreHealth (UAC)
                    </button>
                  </div>
                </div>

                <div className="system-runtime-card">
                  <div className="system-runtime-top">
                    <div className="system-runtime-title-group">
                      <span className="system-runtime-icon">🧹</span>
                      <div>
                        <div className="system-runtime-name">WinSxS &amp; Store Cache Reset</div>
                        <div className="system-runtime-ver">DISM /StartComponentCleanup &amp; wsreset</div>
                      </div>
                    </div>
                  </div>
                  <div className="system-runtime-actions">
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-primary shelf-btn-sm"
                      onClick={async () => {
                        const res = await window.api.runSystemPowerOrRepairAction?.({
                          action: 'dism-cleanup'
                        })
                        if (res?.message) flash(res.message)
                      }}
                    >
                      🧹 Clean WinSxS (UAC)
                    </button>
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-sm"
                      onClick={async () => {
                        const res = await window.api.runSystemPowerOrRepairAction?.({
                          action: 'wsreset'
                        })
                        if (res?.message) flash(res.message)
                      }}
                    >
                      🛍️ wsreset
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
         CATEGORY 6: SECURITY POSTURE (DEFENDER, BITLOCKER, ADMINS) & EVENT LOGS
         ==================================================================== */}
      {activeCategory === 'security' && (
        <div className="winget-tab-body">
          <div className="winget-toolbar-row">
            <div className="profile-tabs-bar" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <button
                type="button"
                className={`profile-tab-btn ${securityView === 'posture' ? 'is-active' : ''}`}
                onClick={() => setSecurityView('posture')}
              >
                <span>🛡️ Defender, Exclusions &amp; BitLocker</span>
              </button>
              <button
                type="button"
                className={`profile-tab-btn ${securityView === 'events' ? 'is-active' : ''}`}
                onClick={() => setSecurityView('events')}
              >
                <span>🚨 Event Log &amp; Crash Triage</span>
                <span className="profile-tab-count">{eventLogs.length}</span>
              </button>
            </div>
            {securityView === 'events' && (
              <input
                type="text"
                className="winget-filter-input"
                placeholder="Search provider, Event ID, or message..."
                value={eventSearchText}
                onChange={(e) => setEventSearchText(e.target.value)}
              />
            )}
          </div>

          {securityView === 'posture' ? (
            <div className="winget-tab-body">
              {/* Defender Overview Card */}
              <div className="winget-pin-editor-card" style={{ margin: 0 }}>
                <div className="winget-pin-editor-header">
                  <div>
                    <div className="winget-pin-editor-title">
                      🛡️ Microsoft Defender Antivirus &amp; Endpoint Protection
                    </div>
                    <div className="winget-pin-editor-sub" style={{ marginTop: 4 }}>
                      {securityPosture ? (
                        <>
                          Real-Time:{' '}
                          <strong
                            style={{
                              color: securityPosture.realtimeProtectionEnabled
                                ? '#4ade80'
                                : '#f87171'
                            }}
                          >
                            {securityPosture.realtimeProtectionEnabled ? 'ON' : 'OFF'}
                          </strong>{' '}
                          • Tamper Protection:{' '}
                          <strong>
                            {securityPosture.tamperProtectionEnabled ? 'Enabled' : 'Off'}
                          </strong>{' '}
                          • Signatures: <code>{securityPosture.signatureVersion}</code>
                          {securityPosture.signatureLastUpdated
                            ? ` (Updated ${securityPosture.signatureLastUpdated})`
                            : ''}{' '}
                          • Local Admins: <strong>{securityPosture.localAdmins.length}</strong>
                        </>
                      ) : (
                        'Querying Get-MpComputerStatus, Get-MpPreference, and BitLocker status...'
                      )}
                    </div>
                  </div>
                  <div className="winget-summary-actions">
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-primary shelf-btn-sm"
                      disabled={securityActionBusy !== null}
                      onClick={async () => {
                        setSecurityActionBusy('update-signatures')
                        flash('Updating Microsoft Defender signatures...')
                        try {
                          const res = await window.api.runSystemSecurityAction?.({
                            action: 'update-signatures'
                          })
                          if (res?.posture) setSecurityPosture(res.posture)
                          if (res?.message) flash(res.message)
                        } finally {
                          setSecurityActionBusy(null)
                        }
                      }}
                    >
                      {securityActionBusy === 'update-signatures' ? (
                        <>
                          <span className="sudo-spinner sudo-spinner-sm" /> Updating…
                        </>
                      ) : (
                        '🔄 Update Signatures'
                      )}
                    </button>
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-sm"
                      disabled={securityActionBusy !== null}
                      onClick={async () => {
                        setSecurityActionBusy('quick-scan')
                        try {
                          const res = await window.api.runSystemSecurityAction?.({
                            action: 'quick-scan'
                          })
                          if (res?.message) flash(res.message)
                        } finally {
                          setSecurityActionBusy(null)
                        }
                      }}
                    >
                      {securityActionBusy === 'quick-scan' ? (
                        <>
                          <span className="sudo-spinner sudo-spinner-sm" /> Scanning…
                        </>
                      ) : (
                        '🔍 Quick Scan'
                      )}
                    </button>
                    <button
                      type="button"
                      className="shelf-btn shelf-btn-sm"
                      onClick={async () => {
                        await window.api.runSystemSecurityAction?.({
                          action: 'open-defender'
                        })
                      }}
                    >
                      🛡️ Windows Security
                    </button>
                  </div>
                </div>

                {/* Add Defender Folder Exclusion Row */}
                <div className="winget-search-bar-row" style={{ marginTop: 8 }}>
                  <input
                    type="text"
                    className="winget-search-input"
                    style={{ flex: 1 }}
                    placeholder="Add developer workspace folder exclusion (e.g. A:\dev\repo) via UAC..."
                    value={newExclusionPath}
                    onChange={(e) => setNewExclusionPath(e.target.value)}
                  />
                  <button
                    type="button"
                    className="shelf-btn shelf-btn-warning shelf-btn-sm"
                    disabled={!newExclusionPath.trim()}
                    onClick={async () => {
                      const res = await window.api.runSystemSecurityAction?.({
                        action: 'add-exclusion-path',
                        targetPath: newExclusionPath.trim()
                      })
                      if (res?.posture) setSecurityPosture(res.posture)
                      if (res?.message) flash(res.message)
                      setNewExclusionPath('')
                    }}
                  >
                    ➕ Add Folder Exclusion (UAC)
                  </button>
                </div>
              </div>

              <div className="winget-pkg-list">
                {/* BitLocker Volumes */}
                {securityPosture?.bitLockerVolumes.map((bl) => (
                  <div key={bl.mountPoint} className="winget-pkg-row">
                    <div className="winget-pkg-main">
                      <div className="winget-pkg-title-row">
                        <span className="winget-badge winget-badge-installed">
                          🔐 BitLocker {bl.mountPoint}
                        </span>
                        <span className="winget-pkg-name">
                          Volume {bl.mountPoint} — {bl.volumeStatus} ({bl.encryptionPercent}%
                          Encrypted)
                        </span>
                        <span
                          className={`winget-badge ${
                            bl.protectionStatus === 'On'
                              ? 'winget-badge-installed'
                              : 'winget-badge-pinned'
                          }`}
                        >
                          Protection: {bl.protectionStatus}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Defender Exclusions */}
                {securityPosture?.exclusionPaths.map((exPath) => (
                  <div key={exPath} className="winget-pkg-row">
                    <div className="winget-pkg-main">
                      <div className="winget-pkg-title-row">
                        <span className="winget-badge winget-badge-pinned">
                          📂 Defender Exclusion
                        </span>
                        <span
                          className="winget-pkg-name"
                          style={{ fontFamily: 'Cascadia Mono, Consolas, monospace' }}
                        >
                          {exPath}
                        </span>
                      </div>
                    </div>
                    <div className="winget-pkg-actions">
                      <button
                        type="button"
                        className="shelf-btn shelf-btn-danger shelf-btn-sm"
                        onClick={async () => {
                          const res = await window.api.runSystemSecurityAction?.({
                            action: 'remove-exclusion-path',
                            targetPath: exPath
                          })
                          if (res?.posture) setSecurityPosture(res.posture)
                          if (res?.message) flash(res.message)
                        }}
                      >
                        🗑️ Remove (UAC)
                      </button>
                    </div>
                  </div>
                ))}

                {/* Local Administrators Group Members */}
                {securityPosture?.localAdmins.map((adm) => (
                  <div key={adm} className="winget-pkg-row">
                    <div className="winget-pkg-main">
                      <div className="winget-pkg-title-row">
                        <span className="winget-source-tag">👑 Local Administrator</span>
                        <span className="winget-pkg-name">{adm}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* SUB-VIEW 2: EVENT LOG & CRASH TRIAGE */
            <div className="winget-tab-body">
              <div className="winget-summary-bar">
                <div className="winget-chip-group">
                  <button
                    type="button"
                    className={`winget-filter-chip ${eventFilterChip === 'all' ? 'is-active' : ''}`}
                    onClick={() => setEventFilterChip('all')}
                  >
                    All Critical &amp; Errors ({eventLogs.length})
                  </button>
                  <button
                    type="button"
                    className={`winget-filter-chip ${
                      eventFilterChip === 'Application' ? 'is-active' : ''
                    }`}
                    onClick={() => setEventFilterChip('Application')}
                  >
                    📦 Application ({eventLogs.filter((e) => e.logName === 'Application').length})
                  </button>
                  <button
                    type="button"
                    className={`winget-filter-chip ${
                      eventFilterChip === 'System' ? 'is-active' : ''
                    }`}
                    onClick={() => setEventFilterChip('System')}
                  >
                    ⚙️ System ({eventLogs.filter((e) => e.logName === 'System').length})
                  </button>
                  <button
                    type="button"
                    className={`winget-filter-chip ${
                      eventFilterChip === 'Critical' ? 'is-active' : ''
                    }`}
                    onClick={() => setEventFilterChip('Critical')}
                  >
                    🔴 Critical ({eventLogs.filter((e) => e.level === 'Critical').length})
                  </button>
                </div>
                <span className="winget-summary-text">{filteredEventLogs.length} shown</span>
              </div>

              <div className="winget-pkg-list">
                {loadingSecurity && eventLogs.length === 0 ? (
                  <div className="profile-empty-list">
                    Querying recent Critical and Error events from Windows Event Log...
                  </div>
                ) : filteredEventLogs.length === 0 ? (
                  <div className="profile-empty-list">
                    🎉 No recent Critical or Error events matching your filter!
                  </div>
                ) : (
                  filteredEventLogs.map((ev, idx) => (
                    <div key={`${ev.logName}-${ev.recordId}-${idx}`} className="winget-pkg-row">
                      <div className="winget-pkg-main">
                        <div className="winget-pkg-title-row">
                          <span
                            className={`winget-badge ${
                              ev.level === 'Critical'
                                ? 'winget-badge-blocked'
                                : 'winget-badge-pinned'
                            }`}
                          >
                            {ev.level === 'Critical' ? '🔴 Critical' : '🟠 Error'}
                          </span>
                          <span className="winget-source-tag">{ev.logName}</span>
                          <span className="winget-pkg-name">{ev.providerName}</span>
                          <span className="winget-source-tag">Event ID {ev.id}</span>
                          <span className="winget-ver-current">{ev.timeCreated}</span>
                        </div>
                        <div className="winget-pkg-meta-row">
                          <span
                            className="winget-ver-current"
                            style={{
                              maxWidth: '780px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                            title={ev.message}
                          >
                            {ev.message}
                          </span>
                        </div>
                      </div>
                      <div className="winget-pkg-actions">
                        <button
                          type="button"
                          className="shelf-btn shelf-btn-sm"
                          onClick={() =>
                            handleCopyText(
                              `[${ev.timeCreated}] [${ev.logName}/${ev.level}] ${ev.providerName} (Event ${ev.id}): ${ev.message}`,
                              'Copied Event Log Entry'
                            )
                          }
                        >
                          📋 Copy
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

