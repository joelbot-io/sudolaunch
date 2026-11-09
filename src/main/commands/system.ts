import type { SearchResultItem } from '../../shared/types'

export function search(query: string): SearchResultItem[] {
  const q = query.trim().toLowerCase()
  const items: SearchResultItem[] = [
    {
      label: '🧰 Open System Management Control Center',
      sublabel: 'Manage WinGet packages, updates, pins, dev runtimes, services, ports, and disk cleanup',
      value: '__openSystemPanel::updates'
    },
    {
      label: '⬆️ WinGet: Available Updates & Batch Queue',
      sublabel: 'Inspect outdated packages, selective batch upgrade, package inspector, and pins',
      value: '__openSystemPanel::updates'
    },
    {
      label: '📦 WinGet: Installed Packages',
      sublabel: 'Browse and filter installed packages, inspect details, pin versions, or uninstall',
      value: '__openSystemPanel::installed'
    },
    {
      label: '📌 WinGet: Pinned Packages',
      sublabel: 'View and configure standard, blocking, and version-gated package pins',
      value: '__openSystemPanel::pins'
    },
    {
      label: '🔍 WinGet: Search & Install Catalog',
      sublabel: 'Search the WinGet repository, inspect versions, and install applications',
      value: '__openSystemPanel::search'
    },
    {
      label: '🌐 Ecosystem Updates (npm Global, Python pip, WSL)',
      sublabel: 'Check and update global npm packages, Python pip packages, and WSL kernel',
      value: '__openSystemPanel::ecosystem'
    },
    {
      label: '🪟 Windows Update & Pending Reboot Status',
      sublabel: 'Check pending system reboot flags (CBS / Windows Update), uptime, recent KB hotfixes, and scan pending updates',
      value: '__openSystemPanel::winupdate'
    },
    {
      label: '📸 WinGet Workstation Snapshots (Export / Import)',
      sublabel: 'Save or restore installed WinGet package lists and pin configurations',
      value: '__openSystemPanel::snapshots'
    },
    {
      label: '🛠️ Dev Runtimes & PATH Doctor',
      sublabel: 'Inspect Node, Python, Git, Go, Rust, .NET, Java & detect PATH shadowing or broken directories',
      value: '__openSystemPanel::runtimes'
    },
    {
      label: '🔑 Persistent Environment Variables (User & Machine)',
      sublabel: 'View, create, edit, mask secrets, and delete persistent Registry environment variables',
      value: '__openSystemPanel::envvars'
    },
    {
      label: '⚙️ Windows Services & Startup Apps',
      sublabel: 'Start, stop, restart, pin favorite dev services, and inspect Windows startup items',
      value: '__openSystemPanel::services'
    },
    {
      label: '⏰ SudoLaunch Scheduled Jobs & Lifecycle Hooks',
      sublabel: 'Schedule recurring cron scripts, intervals, and startup/unlock/wake/network hooks',
      value: '__openSystemPanel::jobs'
    },
    {
      label: '📅 Scheduled Tasks Inspector',
      sublabel: 'Inspect, run now, enable, or disable user, developer, and third-party Windows Scheduled Tasks',
      value: '__openSystemPanel::tasks'
    },
    {
      label: '🔌 Active Listening Ports & Top Processes',
      sublabel: 'Monitor listening TCP dev ports, open localhost, allow firewall rules, and kill processes',
      value: '__openSystemPanel::ports'
    },
    {
      label: '📝 Hosts File Editor (C:\\Windows\\System32\\drivers\\etc\\hosts)',
      sublabel: 'Toggle active/commented host mappings, add local domains, and flush DNS with UAC',
      value: '__openSystemPanel::hosts'
    },
    {
      label: '🌐 Network Adapters & Quick DNS Switcher',
      sublabel: 'Inspect IPv4/MAC/Gateway, flush DNS, reset Winsock, or switch to Cloudflare/Google/Quad9/DHCP DNS',
      value: '__openSystemPanel::network'
    },
    {
      label: '🧹 Disk & Developer Cache Cleanup',
      sublabel: 'Scan and reclaim space from WinGet, npm, Go build, pip, uv caches, CrashDumps, and %TEMP%',
      value: '__openSystemPanel::cleanup'
    },
    {
      label: '💾 Storage Volumes & Physical Disk SMART Health',
      sublabel: 'Inspect drive capacity bars, free space, NVMe/SSD media types, and SMART health status',
      value: '__openSystemPanel::storage'
    },
    {
      label: '🔋 Power Plans, Sleep Locks & Windows Repair Toolkit',
      sublabel: 'Switch power schemes, inspect powercfg /requests sleep locks, shutdown WSL, and run SFC / DISM',
      value: '__openSystemPanel::power'
    },
    {
      label: '🛡️ Security Posture: Windows Defender, Exclusions & BitLocker',
      sublabel: 'Check Defender real-time status, dev folder exclusions, BitLocker encryption, and local Admins',
      value: '__openSystemPanel::security'
    },
    {
      label: '🚨 System & Application Event Log Triage (Event Viewer Lite)',
      sublabel: 'Inspect recent Critical and Error events from Windows Application and System logs',
      value: '__openSystemPanel::events'
    }
  ]

  if (!q) return items
  return items.filter(
    (it) =>
      it.label.toLowerCase().includes(q) ||
      (it.sublabel && it.sublabel.toLowerCase().includes(q))
  )
}

export async function execute(_item: SearchResultItem): Promise<void> {
  // Handled in CommandPalette.tsx by switching activeModuleView to 'system'
}
