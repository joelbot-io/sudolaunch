import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { shell } from 'electron'
import type {
  CleanupTargetItem,
  WindowsUpdateStatus,
  WindowsUpdateActionType,
  WindowsPendingUpdateItem,
  WindowsHotfixItem,
  SystemStorageVolumeItem,
  SystemPhysicalDiskItem,
  SystemPowerPlanItem,
  SystemSleepLockItem,
  SystemStorageAndPowerOverview,
  SystemBitLockerVolumeItem,
  SystemSecurityPosture,
  SystemEventLogItem
} from '../../shared/types'
import { runElevated } from '../elevation'
import { addNotification } from '../notifications'
import { openTerminal, runInTerminal } from '../terminalWindow'

const execFileAsync = promisify(execFile)

// ============================================================================
// 5. Disk & Dev Cache Cleanup
// ============================================================================

function getCacheDefinitions(): Array<{
  id: string
  name: string
  icon: string
  category: 'Developer Cache' | 'System Temp'
  description: string
  path: string
}> {
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
  const tempDir = process.env.TEMP || join(localAppData, 'Temp')
  return [
    {
      id: 'winget-temp',
      name: 'WinGet Installer Download Cache',
      icon: '🪽',
      category: 'Developer Cache',
      description: 'Cached installer binaries downloaded during WinGet package installs/updates',
      path: join(tempDir, 'WinGet')
    },
    {
      id: 'npm-cache',
      name: 'npm Package Cache',
      icon: '📦',
      category: 'Developer Cache',
      description: 'Cached tarballs and HTTP metadata for Node/npm packages',
      path: join(localAppData, 'npm-cache')
    },
    {
      id: 'pip-cache',
      name: 'Python pip Wheel & HTTP Cache',
      icon: '🐍',
      category: 'Developer Cache',
      description: 'Cached wheels and source archives from pip installs',
      path: join(localAppData, 'pip', 'Cache')
    },
    {
      id: 'uv-cache',
      name: 'Astral uv Package Cache',
      icon: '⚡',
      category: 'Developer Cache',
      description: 'Cached Python wheels and environments managed by uv',
      path: join(localAppData, 'uv', 'cache')
    },
    {
      id: 'go-build-cache',
      name: 'Go Build & Compiler Cache',
      icon: '🐹',
      category: 'Developer Cache',
      description: 'Cached Go build artifacts in AppData\\Local\\go-build',
      path: join(localAppData, 'go-build')
    },
    {
      id: 'crash-dumps',
      name: 'User Crash Dumps',
      icon: '💥',
      category: 'System Temp',
      description: 'Application crash memory dumps (.dmp) in AppData\\Local\\CrashDumps',
      path: join(localAppData, 'CrashDumps')
    },
    {
      id: 'user-temp',
      name: 'Windows User Temp Directory (%TEMP%)',
      icon: '🧹',
      category: 'System Temp',
      description: 'Temporary files created by applications (locked files are safely skipped)',
      path: tempDir
    }
  ]
}

export async function getCleanupTargets(): Promise<CleanupTargetItem[]> {
  const defs = getCacheDefinitions()
  try {
    const pathsJson = JSON.stringify(defs.map((d) => ({ id: d.id, path: d.path }))).replace(
      /'/g,
      "''"
    )
    const script = `
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
      $ErrorActionPreference = 'SilentlyContinue'
      $targets = '${pathsJson}' | ConvertFrom-Json
      $res = @()
      foreach ($t in $targets) {
        if (Test-Path -LiteralPath $t.path) {
          $files = Get-ChildItem -LiteralPath $t.path -Recurse -File -Force -ErrorAction SilentlyContinue
          $sum = ($files | Measure-Object -Property Length -Sum).Sum
          $count = ($files | Measure-Object).Count
          $res += [PSCustomObject]@{
            id = $t.id
            exists = $true
            sizeMb = [math]::Round(($sum / 1MB), 1)
            fileCount = [int]$count
          }
        } else {
          $res += [PSCustomObject]@{
            id = $t.id
            exists = $false
            sizeMb = 0
            fileCount = 0
          }
        }
      }
      $res | ConvertTo-Json -Compress
    `
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 20000, windowsHide: true }
    )
    const parsed = JSON.parse(stdout.trim() || '[]')
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    const sizeMap = new Map<string, { exists: boolean; sizeMb: number; fileCount: number }>()
    for (const item of arr) {
      if (item?.id) {
        sizeMap.set(String(item.id), {
          exists: Boolean(item.exists),
          sizeMb: Number(item.sizeMb || 0),
          fileCount: Number(item.fileCount || 0)
        })
      }
    }

    return defs.map((d) => {
      const stat = sizeMap.get(d.id)
      return {
        ...d,
        exists: stat?.exists ?? existsSync(d.path),
        sizeMb: stat?.sizeMb ?? 0,
        fileCount: stat?.fileCount ?? 0
      }
    })
  } catch {
    return defs.map((d) => ({
      ...d,
      exists: existsSync(d.path),
      sizeMb: 0,
      fileCount: 0
    }))
  }
}

export async function cleanSystemTargets(
  targetIds: string[]
): Promise<{ success: boolean; message: string; targets: CleanupTargetItem[] }> {
  const defs = getCacheDefinitions().filter((d) => targetIds.includes(d.id))
  if (defs.length === 0) {
    return {
      success: false,
      message: 'No cleanup targets selected',
      targets: await getCleanupTargets()
    }
  }

  const beforeTargets = await getCleanupTargets()
  const beforeMb = beforeTargets
    .filter((t) => targetIds.includes(t.id))
    .reduce((acc, t) => acc + t.sizeMb, 0)

  for (const def of defs) {
    if (!existsSync(def.path)) continue
    try {
      const safePath = def.path.replace(/'/g, "''")
      const cleanScript = `
        $ErrorActionPreference = 'SilentlyContinue'
        Get-ChildItem -LiteralPath '${safePath}' -Force -ErrorAction SilentlyContinue |
          Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
      `
      await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', cleanScript],
        { timeout: 20000, windowsHide: true }
      )
    } catch {
      // ignore locked files
    }
  }

  const afterTargets = await getCleanupTargets()
  const afterMb = afterTargets
    .filter((t) => targetIds.includes(t.id))
    .reduce((acc, t) => acc + t.sizeMb, 0)
  const reclaimed = Math.max(0, +(beforeMb - afterMb).toFixed(1))

  const msg = `Cleaned ${defs.length} target(s) • Reclaimed ~${reclaimed} MB`
  addNotification({
    title: 'System Cache Cleanup Complete',
    body: msg,
    type: 'success',
    commandName: 'system'
  })

  return {
    success: true,
    message: msg,
    targets: afterTargets
  }
}

// ============================================================================
// 6. Pending Reboot & Windows Update Status
// ============================================================================

let cachedWindowsUpdateStatus: WindowsUpdateStatus | null = null
let cachedPendingUpdates: WindowsPendingUpdateItem[] = []
let hasScannedPendingOnce = false

async function runElevatedWait(
  psScript: string,
  timeoutMs = 180000
): Promise<{ success: boolean; message: string }> {
  const encodedInner = Buffer.from(psScript, 'utf16le').toString('base64')
  const launcher = `
    $p = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','${encodedInner}') -Verb RunAs -Wait -PassThru -WindowStyle Hidden
    if ($p -and $p.ExitCode -eq 0) { exit 0 } else { exit 1 }
  `
  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', launcher], {
      timeout: timeoutMs,
      windowsHide: true
    })
    return { success: true, message: 'Completed elevated operation' }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Elevated operation failed or canceled'
    }
  }
}

export async function getWindowsUpdateStatus(options?: {
  force?: boolean
  scanPending?: boolean
  online?: boolean
}): Promise<WindowsUpdateStatus> {
  const scanPending = Boolean(options?.scanPending)
  const online = Boolean(options?.online)

  if (!options?.force && !scanPending && cachedWindowsUpdateStatus) {
    return cachedWindowsUpdateStatus
  }

  try {
    const script = `
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
      $ErrorActionPreference = 'SilentlyContinue'

      $reasons = @()
      if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending') {
        $reasons += 'Component Based Servicing (CBS RebootPending)'
      }
      if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired') {
        $reasons += 'Windows Update (Auto Update RebootRequired)'
      }
      $sm = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager' -Name PendingFileRenameOperations -ErrorAction SilentlyContinue
      if ($sm -and $sm.PendingFileRenameOperations -and $sm.PendingFileRenameOperations.Count -gt 0) {
        $reasons += "Pending File Rename Operations ($($sm.PendingFileRenameOperations.Count) entries)"
      }
      $updVolatile = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Updates' -Name UpdateExeVolatile -ErrorAction SilentlyContinue
      if ($updVolatile -and $updVolatile.UpdateExeVolatile -ne 0) {
        $reasons += 'Microsoft Updates (UpdateExeVolatile)'
      }

      $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
      $lastBootStr = ''
      $uptimeDays = 0
      $uptimeHours = 0
      if ($os -and $os.LastBootUpTime) {
        $lastBootStr = $os.LastBootUpTime.ToString('yyyy-MM-dd HH:mm')
        $span = (Get-Date) - $os.LastBootUpTime
        $uptimeDays = [int][math]::Floor($span.TotalDays)
        $uptimeHours = [int]$span.Hours
      }

      $wua = Get-Service -Name wuauserv -ErrorAction SilentlyContinue
      $wuaStatus = if ($wua) { $wua.Status.ToString() } else { 'Unknown' }

      $hotfixes = @()
      $hfList = Get-HotFix -ErrorAction SilentlyContinue | Sort-Object InstalledOn -Descending | Select-Object -First 12
      foreach ($hf in $hfList) {
        $dateStr = if ($hf.InstalledOn) { $hf.InstalledOn.ToString('yyyy-MM-dd') } else { 'Installed' }
        $hotfixes += [PSCustomObject]@{
          hotFixId = [string]$hf.HotFixID
          description = [string]$hf.Description
          installedOn = $dateStr
        }
      }

      $pending = @()
      $scanNote = ''
      $didScan = $${scanPending ? 'true' : 'false'}
      try {
        $session = New-Object -ComObject Microsoft.Update.Session
        $searcher = $session.CreateUpdateSearcher()

        if ($hotfixes.Count -lt 12) {
          try {
            $seenIds = @{}
            foreach ($h in $hotfixes) { $seenIds[$h.hotFixId] = $true }
            $histCount = $searcher.GetTotalHistoryCount()
            if ($histCount -gt 0) {
              $take = [math]::Min($histCount, 25)
              $histEntries = $searcher.QueryHistory(0, $take)
              foreach ($he in $histEntries) {
                if ($hotfixes.Count -ge 12) { break }
                if ($he.ResultCode -ne 2 -and $he.ResultCode -ne 3) { continue }
                $titleStr = [string]$he.Title
                if (-not $titleStr) { continue }
                $kbMatch = [regex]::Match($titleStr, 'KB\d{5,8}')
                $hfId = if ($kbMatch.Success) { $kbMatch.Value } else { 'WUA-Update' }
                $dedupKey = "$hfId-$titleStr"
                if ($seenIds[$hfId] -or $seenIds[$dedupKey]) { continue }
                $seenIds[$dedupKey] = $true
                $dateStr = if ($he.Date) { $he.Date.ToString('yyyy-MM-dd') } else { 'Installed' }
                $hotfixes += [PSCustomObject]@{
                  hotFixId = $hfId
                  description = $titleStr
                  installedOn = $dateStr
                }
              }
            }
          } catch {
            # Ignore history supplement errors
          }
        }

        if ($didScan) {
          if ($wua -and $wua.Status -ne 'Running') {
            Start-Service -Name wuauserv -ErrorAction SilentlyContinue
            $wua = Get-Service -Name wuauserv -ErrorAction SilentlyContinue
            $wuaStatus = if ($wua) { $wua.Status.ToString() } else { $wuaStatus }
          }
          $wantOnline = $${online ? 'true' : 'false'}
          $res = $null
          try {
            $searcher.Online = $wantOnline
            $res = $searcher.Search("IsInstalled=0 and IsHidden=0")
          } catch {
            $errMsg = $_.Exception.Message
            if ($wantOnline) {
              $scanNote = "Online scan fell back to local cache ($errMsg)"
              $searcher.Online = $false
              $res = $searcher.Search("IsInstalled=0 and IsHidden=0")
            } else {
              $scanNote = "Windows Update Agent scan note: $errMsg"
            }
          }
          if ($res -and $res.Updates) {
            foreach ($u in $res.Updates) {
              $kbs = @($u.KBArticleIDs | ForEach-Object { "KB$_" })
              $sizeMb = if ($u.MaxDownloadSize) { [math]::Round(($u.MaxDownloadSize / 1MB), 1) } else { 0 }
              $pending += [PSCustomObject]@{
                title = [string]$u.Title
                kbs = ($kbs -join ', ')
                isDownloaded = [bool]$u.IsDownloaded
                rebootRequired = [bool]$u.RebootRequired
                severity = if ($u.MsrcSeverity) { [string]$u.MsrcSeverity } else { 'Optional / Driver' }
                sizeMb = [double]$sizeMb
              }
            }
          }
        }
      } catch {
        $scanNote = $_.Exception.Message
      }

      [PSCustomObject]@{
        rebootPending = ($reasons.Count -gt 0)
        rebootReasons = $reasons
        osCaption = if ($os) { [string]$os.Caption } else { 'Microsoft Windows' }
        osVersion = if ($os) { [string]$os.Version } else { '' }
        osBuild = if ($os) { [string]$os.BuildNumber } else { '' }
        lastBootTime = $lastBootStr
        uptimeDays = $uptimeDays
        uptimeHours = $uptimeHours
        wuaServiceStatus = $wuaStatus
        recentHotfixes = $hotfixes
        pendingUpdates = $pending
        pendingScanned = $didScan
        scanNote = $scanNote
      } | ConvertTo-Json -Depth 4 -Compress
    `

    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: online ? 45000 : 20000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
    )

    const parsed = JSON.parse(stdout.trim() || '{}')
    const reasonsRaw = parsed.rebootReasons
    const rebootReasons: string[] = Array.isArray(reasonsRaw)
      ? reasonsRaw.map(String)
      : reasonsRaw
        ? [String(reasonsRaw)]
        : []

    const hfRaw = parsed.recentHotfixes
    const recentHotfixes: WindowsHotfixItem[] = (Array.isArray(hfRaw) ? hfRaw : hfRaw ? [hfRaw] : [])
      .filter((h) => h && h.hotFixId)
      .map((h) => ({
        hotFixId: String(h.hotFixId),
        description: String(h.description || 'Update'),
        installedOn: String(h.installedOn || '')
      }))

    if (scanPending) {
      const pendRaw = parsed.pendingUpdates
      cachedPendingUpdates = (Array.isArray(pendRaw) ? pendRaw : pendRaw ? [pendRaw] : [])
        .filter((u) => u && u.title)
        .map((u) => ({
          title: String(u.title),
          kbs: String(u.kbs || ''),
          isDownloaded: Boolean(u.isDownloaded),
          rebootRequired: Boolean(u.rebootRequired),
          severity: String(u.severity || 'Standard'),
          sizeMb: Number(u.sizeMb || 0)
        }))
      hasScannedPendingOnce = true
    }

    const status: WindowsUpdateStatus = {
      rebootPending: Boolean(parsed.rebootPending),
      rebootReasons,
      osCaption: String(parsed.osCaption || 'Microsoft Windows'),
      osVersion: String(parsed.osVersion || ''),
      osBuild: String(parsed.osBuild || ''),
      lastBootTime: String(parsed.lastBootTime || ''),
      uptimeDays: Number(parsed.uptimeDays || 0),
      uptimeHours: Number(parsed.uptimeHours || 0),
      wuaServiceStatus: String(parsed.wuaServiceStatus || 'Unknown'),
      recentHotfixes,
      pendingUpdates: cachedPendingUpdates,
      pendingScanned: hasScannedPendingOnce,
      lastCheckedAt: new Date().toLocaleTimeString(),
      scanNote: parsed.scanNote ? String(parsed.scanNote) : undefined
    }

    cachedWindowsUpdateStatus = status
    return status
  } catch (err) {
    return (
      cachedWindowsUpdateStatus ?? {
        rebootPending: false,
        rebootReasons: [],
        osCaption: 'Microsoft Windows',
        osVersion: '',
        osBuild: '',
        lastBootTime: '',
        uptimeDays: 0,
        uptimeHours: 0,
        wuaServiceStatus: 'Unknown',
        recentHotfixes: [],
        pendingUpdates: cachedPendingUpdates,
        pendingScanned: hasScannedPendingOnce,
        lastCheckedAt: new Date().toLocaleTimeString(),
        scanNote: err instanceof Error ? err.message : undefined
      }
    )
  }
}

export async function runWindowsUpdateAction(
  action: WindowsUpdateActionType,
  targetKbOrTitle?: string
): Promise<{ success: boolean; message: string; status?: WindowsUpdateStatus }> {
  try {
    if (action === 'open-settings') {
      await shell.openExternal('ms-settings:windowsupdate')
      return { success: true, message: 'Opened Windows Update Settings' }
    }
    if (action === 'open-history') {
      await shell.openExternal('ms-settings:windowsupdate-history')
      return { success: true, message: 'Opened Windows Update History' }
    }
    if (action === 'trigger-scan') {
      execFile('UsoClient.exe', ['StartInteractiveScan'], { windowsHide: true }, () => {})
      execFile('UsoClient.exe', ['StartScan'], { windowsHide: true }, () => {})
      const status = await getWindowsUpdateStatus({ force: true, scanPending: true, online: false })
      const count = status.pendingUpdates.length
      return {
        success: true,
        message:
          count > 0
            ? `OS Update Scan complete: ${count} pending update(s) ready`
            : 'Triggered Windows Update OS scan — system is up to date (0 pending updates)',
        status
      }
    }
    if (action === 'download-updates') {
      execFile('UsoClient.exe', ['StartDownload'], { windowsHide: true }, () => {})
      const filterStr = (targetKbOrTitle || '').replace(/'/g, "''").trim()
      const dlScript = `
        $ErrorActionPreference = 'Stop'
        $session = New-Object -ComObject Microsoft.Update.Session
        $searcher = $session.CreateUpdateSearcher()
        $searcher.Online = $false
        $res = $searcher.Search("IsInstalled=0 and IsHidden=0")
        $toDownload = New-Object -ComObject Microsoft.Update.UpdateColl
        foreach ($u in $res.Updates) {
          if ('${filterStr}' -ne '') {
            $kbs = ($u.KBArticleIDs | ForEach-Object { "KB$_" }) -join ' '
            if ($u.Title -notlike "*${filterStr}*" -and $kbs -notlike "*${filterStr}*") { continue }
          }
          if (-not $u.IsDownloaded) {
            if (-not $u.EulaAccepted) { $u.AcceptEula() }
            [void]$toDownload.Add($u)
          }
        }
        if ($toDownload.Count -gt 0) {
          $downloader = $session.CreateUpdateDownloader()
          $downloader.Updates = $toDownload
          [void]$downloader.Download()
        }
      `
      const elevRes = await runElevatedWait(dlScript, 180000)
      const status = await getWindowsUpdateStatus({ force: true, scanPending: true, online: false })
      return {
        success: elevRes.success,
        message: elevRes.success
          ? 'Downloaded pending Windows Updates into local cache'
          : `Triggered UsoClient StartDownload (${elevRes.message})`,
        status
      }
    }
    if (action === 'install-updates') {
      execFile('UsoClient.exe', ['StartDownload'], { windowsHide: true }, () => {})
      execFile('UsoClient.exe', ['StartInstall'], { windowsHide: true }, () => {})
      const filterStr = (targetKbOrTitle || '').replace(/'/g, "''").trim()
      const installScript = `
        $ErrorActionPreference = 'Stop'
        Start-Service -Name wuauserv -ErrorAction SilentlyContinue
        $session = New-Object -ComObject Microsoft.Update.Session
        $searcher = $session.CreateUpdateSearcher()
        $searcher.Online = $false
        $res = $searcher.Search("IsInstalled=0 and IsHidden=0")
        $toDownload = New-Object -ComObject Microsoft.Update.UpdateColl
        $toInstall = New-Object -ComObject Microsoft.Update.UpdateColl
        foreach ($u in $res.Updates) {
          if ('${filterStr}' -ne '') {
            $kbs = ($u.KBArticleIDs | ForEach-Object { "KB$_" }) -join ' '
            if ($u.Title -notlike "*${filterStr}*" -and $kbs -notlike "*${filterStr}*") { continue }
          }
          if (-not $u.EulaAccepted) { $u.AcceptEula() }
          if (-not $u.IsDownloaded) {
            [void]$toDownload.Add($u)
          }
          [void]$toInstall.Add($u)
        }
        if ($toDownload.Count -gt 0) {
          $downloader = $session.CreateUpdateDownloader()
          $downloader.Updates = $toDownload
          [void]$downloader.Download()
        }
        if ($toInstall.Count -gt 0) {
          $installer = $session.CreateUpdateInstaller()
          $installer.Updates = $toInstall
          $installRes = $installer.Install()
          if ($installRes.ResultCode -eq 2 -or $installRes.ResultCode -eq 3) { exit 0 } else { exit 1 }
        }
        exit 0
      `
      const elevRes = await runElevatedWait(installScript, 300000)
      const status = await getWindowsUpdateStatus({ force: true, scanPending: true, online: false })
      return {
        success: elevRes.success,
        message: elevRes.success
          ? targetKbOrTitle
            ? `Installed update "${targetKbOrTitle}"${status.rebootPending ? ' (Reboot Required)' : ''}`
            : `Downloaded & installed pending Windows Updates${status.rebootPending ? ' (Reboot Required)' : ''}`
          : `Windows Update install job finished with note: ${elevRes.message}`,
        status
      }
    }
    if (action === 'install-in-terminal') {
      const filterStr = (targetKbOrTitle || '').replace(/'/g, "''").trim()
      const termCmd = `$s = New-Object -ComObject Microsoft.Update.Session; $u = $s.CreateUpdateSearcher().Search('IsInstalled=0 and IsHidden=0').Updates${filterStr ? ` | Where-Object { $_.Title -like '*${filterStr}*' }` : ''}; Write-Host "Found $($u.Count) pending update(s)..." -ForegroundColor Cyan; UsoClient.exe StartInteractiveScan; UsoClient.exe StartDownload; UsoClient.exe StartInstall; foreach ($item in $u) { Write-Host " -> $($item.Title)" -ForegroundColor Yellow }`
      openTerminal()
      setTimeout(() => {
        runInTerminal(termCmd)
      }, 90)
      return {
        success: true,
        message: 'Started Windows Update scan/download/install stream in Terminal (>_)'
      }
    }
    if (action === 'schedule-reboot-60s') {
      await execFileAsync(
        'shutdown.exe',
        [
          '/r',
          '/t',
          '60',
          '/c',
          'SudoLaunch: System restart scheduled in 60 seconds. Use Cancel Reboot in SudoLaunch to abort.'
        ],
        { timeout: 5000, windowsHide: true }
      )
      return {
        success: true,
        message: 'System restart scheduled in 60 seconds (Click "Cancel Reboot" to abort)'
      }
    }
    if (action === 'cancel-reboot') {
      await execFileAsync('shutdown.exe', ['/a'], { timeout: 5000, windowsHide: true })
      return { success: true, message: 'Cancelled scheduled Windows restart' }
    }
    return { success: false, message: 'Unknown action' }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Action failed'
    }
  }
}

// ============================================================================
// 10. Storage SMART Health, Power Plans, Sleep Locks & Repair Toolkit
// ============================================================================

export async function getSystemStorageAndPower(): Promise<SystemStorageAndPowerOverview> {
  const script = `
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $ErrorActionPreference = 'SilentlyContinue'

    $vols = @()
    foreach ($v in (Get-Volume | Where-Object { $_.DriveLetter -and $_.Size -gt 0 } | Sort-Object DriveLetter)) {
      $totGb = [math]::Round($v.Size / 1GB, 1)
      $freeGb = [math]::Round($v.SizeRemaining / 1GB, 1)
      $usedGb = [math]::Round(($v.Size - $v.SizeRemaining) / 1GB, 1)
      $pct = 0
      if ($v.Size -gt 0) {
        $pct = [math]::Round((($v.Size - $v.SizeRemaining) / $v.Size) * 100, 1)
      }
      $vols += [PSCustomObject]@{
        driveLetter  = [string]$v.DriveLetter
        label        = [string]$v.FileSystemLabel
        fileSystem   = [string]$v.FileSystem
        healthStatus = [string]$v.HealthStatus
        totalGb      = $totGb
        freeGb       = $freeGb
        usedGb       = $usedGb
        usedPercent  = $pct
      }
    }

    $disks = @()
    foreach ($d in (Get-PhysicalDisk | Sort-Object DeviceId)) {
      $disks += [PSCustomObject]@{
        friendlyName      = [string]$d.FriendlyName
        mediaType         = [string]$d.MediaType
        busType           = [string]$d.BusType
        healthStatus      = [string]$d.HealthStatus
        operationalStatus = [string]$d.OperationalStatus
        sizeGb            = [math]::Round($d.Size / 1GB, 1)
      }
    }

    $plans = @()
    $planLines = powercfg.exe /list 2>$null
    foreach ($line in $planLines) {
      if ($line -match '([0-9a-fA-F-]{36})\s+\(([^)]+)\)(\s+\*)?') {
        $plans += [PSCustomObject]@{
          guid     = $matches[1]
          name     = $matches[2].Trim()
          isActive = [bool]$matches[3]
        }
      }
    }

    [PSCustomObject]@{
      volumes    = $vols
      disks      = $disks
      powerPlans = $plans
    } | ConvertTo-Json -Depth 4 -Compress
  `
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 10000, windowsHide: true }
    )
    const trimmed = stdout.trim()
    if (!trimmed) {
      return { volumes: [], disks: [], powerPlans: [], sleepLocks: [] }
    }
    const parsed = JSON.parse(trimmed)
    const rawVols = Array.isArray(parsed.volumes)
      ? parsed.volumes
      : parsed.volumes
        ? [parsed.volumes]
        : []
    const rawDisks = Array.isArray(parsed.disks)
      ? parsed.disks
      : parsed.disks
        ? [parsed.disks]
        : []
    const rawPlans = Array.isArray(parsed.powerPlans)
      ? parsed.powerPlans
      : parsed.powerPlans
        ? [parsed.powerPlans]
        : []

    const volumes: SystemStorageVolumeItem[] = rawVols
      .filter((v: Record<string, unknown>) => v && v.driveLetter)
      .map((v: Record<string, unknown>) => ({
        driveLetter: String(v.driveLetter),
        label: String(v.label || 'Local Disk'),
        fileSystem: String(v.fileSystem || 'NTFS'),
        healthStatus: String(v.healthStatus || 'Healthy'),
        totalGb: Number(v.totalGb || 0),
        freeGb: Number(v.freeGb || 0),
        usedGb: Number(v.usedGb || 0),
        usedPercent: Number(v.usedPercent || 0)
      }))

    const disks: SystemPhysicalDiskItem[] = rawDisks
      .filter((d: Record<string, unknown>) => d && d.friendlyName)
      .map((d: Record<string, unknown>) => ({
        friendlyName: String(d.friendlyName),
        mediaType: String(d.mediaType || 'SSD'),
        busType: String(d.busType || 'NVMe'),
        healthStatus: String(d.healthStatus || 'Healthy'),
        operationalStatus: String(d.operationalStatus || 'OK'),
        sizeGb: Number(d.sizeGb || 0)
      }))

    const powerPlans: SystemPowerPlanItem[] = rawPlans
      .filter((p: Record<string, unknown>) => p && p.guid)
      .map((p: Record<string, unknown>) => ({
        guid: String(p.guid),
        name: String(p.name || 'Power Plan'),
        isActive: Boolean(p.isActive)
      }))

    // Also attempt a non-elevated/fast check of powercfg /requests
    const sleepLocks: SystemSleepLockItem[] = []
    try {
      const { stdout: reqOut } = await execFileAsync('powercfg.exe', ['/requests'], {
        timeout: 4000,
        windowsHide: true
      })
      let curCat = ''
      const lines = (reqOut || '').split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i].trim()
        if (!ln) continue
        if (/^(DISPLAY|SYSTEM|AWAYMODE|EXECUTION|PERFBOOST|ACTIVELOCKSCREEN):$/i.test(ln)) {
          curCat = ln.replace(':', '')
          continue
        }
        if (curCat && ln !== 'None.' && ln.startsWith('[')) {
          const detail = (lines[i + 1] || '').trim()
          sleepLocks.push({
            category: curCat,
            requester: ln,
            details: detail !== 'None.' ? detail : ''
          })
        }
      }
    } catch {
      // powercfg /requests requires elevation on some Windows builds; ignore gracefully
    }

    return { volumes, disks, powerPlans, sleepLocks }
  } catch {
    return { volumes: [], disks: [], powerPlans: [], sleepLocks: [] }
  }
}

export async function runSystemPowerOrRepairAction(params: {
  action:
    | 'set-power-plan'
    | 'wsl-shutdown'
    | 'sfc-scannow'
    | 'dism-check'
    | 'dism-restore'
    | 'dism-cleanup'
    | 'wsreset'
    | 'battery-report'
  planGuid?: string
}): Promise<{ success: boolean; message: string }> {
  try {
    if (params.action === 'set-power-plan' && params.planGuid) {
      if (!/^[0-9a-fA-F-]{36}$/.test(params.planGuid)) {
        return { success: false, message: 'Invalid power scheme GUID' }
      }
      await execFileAsync('powercfg.exe', ['/setactive', params.planGuid], {
        timeout: 5000,
        windowsHide: true
      })
      return { success: true, message: 'Activated selected Windows Power Plan' }
    }
    if (params.action === 'wsl-shutdown') {
      await execFileAsync('wsl.exe', ['--shutdown'], { timeout: 8000, windowsHide: true })
      return {
        success: true,
        message: 'Shut down all WSL 2 distributions and reclaimed vmmemWSL memory'
      }
    }
    if (params.action === 'sfc-scannow') {
      runElevated('sfc.exe /scannow', 'System File Checker (sfc /scannow)', 'system')
      return { success: true, message: 'Started elevated System File Checker (sfc /scannow)' }
    }
    if (params.action === 'dism-check') {
      openTerminal()
      runInTerminal('DISM.exe /Online /Cleanup-Image /CheckHealth')
      return { success: true, message: 'Running DISM /CheckHealth in SudoLaunch Terminal' }
    }
    if (params.action === 'dism-restore') {
      runElevated(
        'DISM.exe /Online /Cleanup-Image /RestoreHealth',
        'DISM RestoreHealth',
        'system'
      )
      return { success: true, message: 'Started elevated DISM /RestoreHealth scan' }
    }
    if (params.action === 'dism-cleanup') {
      runElevated(
        'DISM.exe /Online /Cleanup-Image /StartComponentCleanup',
        'DISM WinSxS Component Store Cleanup',
        'system'
      )
      return { success: true, message: 'Started elevated DISM WinSxS Component Cleanup' }
    }
    if (params.action === 'wsreset') {
      execFile('wsreset.exe', [], { windowsHide: false }, () => {})
      return { success: true, message: 'Launched Microsoft Store Cache Reset (wsreset.exe)' }
    }
    if (params.action === 'battery-report') {
      const reportPath = join(homedir(), '.sudolaunch', 'battery-report.html')
      await execFileAsync('powercfg.exe', ['/batteryreport', '/output', reportPath], {
        timeout: 8000,
        windowsHide: true
      })
      await shell.openPath(reportPath)
      return { success: true, message: `Generated and opened Battery Report (${reportPath})` }
    }
    return { success: false, message: 'Unknown repair action' }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Action failed'
    }
  }
}

// ============================================================================
// 11. Security Posture (Defender, Exclusions, BitLocker, Local Admins) & Event Log
// ============================================================================

let cachedSecurityPosture: SystemSecurityPosture | null = null

export async function getSystemSecurityPosture(force = false): Promise<SystemSecurityPosture> {
  if (!force && cachedSecurityPosture) return cachedSecurityPosture

  const script = `
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $ErrorActionPreference = 'SilentlyContinue'

    $mp = Get-MpComputerStatus -ErrorAction SilentlyContinue
    $pref = Get-MpPreference -ErrorAction SilentlyContinue

    $sigUpdated = ''
    if ($mp -and $mp.AntivirusSignatureLastUpdated) {
      $sigUpdated = $mp.AntivirusSignatureLastUpdated.ToString('yyyy-MM-dd HH:mm')
    }

    $exPaths = @()
    if ($pref -and $pref.ExclusionPath) {
      $exPaths = @($pref.ExclusionPath | Where-Object { $_ } | ForEach-Object { [string]$_ })
    }
    $exProcs = @()
    if ($pref -and $pref.ExclusionProcess) {
      $exProcs = @($pref.ExclusionProcess | Where-Object { $_ } | ForEach-Object { [string]$_ })
    }

    $blList = @()
    $blVols = Get-BitLockerVolume -ErrorAction SilentlyContinue
    if ($blVols) {
      foreach ($b in $blVols) {
        $blList += [PSCustomObject]@{
          mountPoint        = [string]$b.MountPoint
          volumeStatus      = [string]$b.VolumeStatus
          protectionStatus  = [string]$b.ProtectionStatus
          encryptionPercent = [int]$b.EncryptionPercentage
        }
      }
    }

    $admins = @()
    $admMembers = Get-LocalGroupMember -Group 'Administrators' -ErrorAction SilentlyContinue
    foreach ($m in $admMembers) {
      $admins += [string]("$($m.Name) ($($m.PrincipalSource))")
    }

    [PSCustomObject]@{
      realtimeProtectionEnabled = [bool]($mp.RealTimeProtectionEnabled)
      antivirusEnabled          = [bool]($mp.AntivirusEnabled)
      tamperProtectionEnabled   = [bool]($mp.IsTamperProtected)
      behaviorMonitorEnabled    = [bool]($mp.BehaviorMonitorEnabled)
      signatureVersion          = [string]($mp.AntivirusSignatureVersion)
      signatureLastUpdated      = $sigUpdated
      quickScanAgeDays          = [int]($mp.QuickScanAge)
      exclusionPaths            = $exPaths
      exclusionProcesses        = $exProcs
      bitLockerVolumes          = $blList
      localAdmins               = $admins
    } | ConvertTo-Json -Depth 4 -Compress
  `
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 10000, windowsHide: true }
    )
    const trimmed = stdout.trim()
    if (!trimmed) {
      throw new Error('Empty output')
    }
    const parsed = JSON.parse(trimmed)
    const rawBl = Array.isArray(parsed.bitLockerVolumes)
      ? parsed.bitLockerVolumes
      : parsed.bitLockerVolumes
        ? [parsed.bitLockerVolumes]
        : []

    const posture: SystemSecurityPosture = {
      realtimeProtectionEnabled: Boolean(parsed.realtimeProtectionEnabled),
      antivirusEnabled: Boolean(parsed.antivirusEnabled),
      tamperProtectionEnabled: Boolean(parsed.tamperProtectionEnabled),
      behaviorMonitorEnabled: Boolean(parsed.behaviorMonitorEnabled),
      signatureVersion: String(parsed.signatureVersion || 'N/A'),
      signatureLastUpdated: String(parsed.signatureLastUpdated || ''),
      quickScanAgeDays: Number(parsed.quickScanAgeDays ?? 0),
      exclusionPaths: Array.isArray(parsed.exclusionPaths)
        ? parsed.exclusionPaths.map(String)
        : parsed.exclusionPaths
          ? [String(parsed.exclusionPaths)]
          : [],
      exclusionProcesses: Array.isArray(parsed.exclusionProcesses)
        ? parsed.exclusionProcesses.map(String)
        : parsed.exclusionProcesses
          ? [String(parsed.exclusionProcesses)]
          : [],
      bitLockerVolumes: rawBl
        .filter((b: Record<string, unknown>) => b && b.mountPoint)
        .map((b: Record<string, unknown>) => ({
          mountPoint: String(b.mountPoint),
          volumeStatus: String(b.volumeStatus || 'Unknown'),
          protectionStatus: String(b.protectionStatus || 'Unknown'),
          encryptionPercent: Number(b.encryptionPercent ?? 0)
        })),
      localAdmins: Array.isArray(parsed.localAdmins)
        ? parsed.localAdmins.map(String)
        : parsed.localAdmins
          ? [String(parsed.localAdmins)]
          : []
    }
    cachedSecurityPosture = posture
    return posture
  } catch {
    return (
      cachedSecurityPosture ?? {
        realtimeProtectionEnabled: true,
        antivirusEnabled: true,
        tamperProtectionEnabled: true,
        behaviorMonitorEnabled: true,
        signatureVersion: 'Unknown',
        signatureLastUpdated: '',
        quickScanAgeDays: 0,
        exclusionPaths: [],
        exclusionProcesses: [],
        bitLockerVolumes: [],
        localAdmins: []
      }
    )
  }
}

export async function runSystemSecurityAction(params: {
  action:
    | 'update-signatures'
    | 'quick-scan'
    | 'open-defender'
    | 'add-exclusion-path'
    | 'remove-exclusion-path'
  targetPath?: string
}): Promise<{ success: boolean; message: string; posture?: SystemSecurityPosture }> {
  try {
    if (params.action === 'open-defender') {
      await shell.openExternal('windowsdefender:')
      return { success: true, message: 'Opened Windows Security Center' }
    }
    if (params.action === 'update-signatures') {
      await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', 'Update-MpSignature'],
        { timeout: 25000, windowsHide: true }
      )
      const posture = await getSystemSecurityPosture(true)
      return {
        success: true,
        message: `Updated Windows Defender signatures (${posture.signatureVersion})`,
        posture
      }
    }
    if (params.action === 'quick-scan') {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', 'Start-MpScan -ScanType QuickScan'],
        { windowsHide: true },
        () => {}
      )
      return { success: true, message: 'Started Windows Defender Quick Scan in the background' }
    }
    if (
      (params.action === 'add-exclusion-path' || params.action === 'remove-exclusion-path') &&
      params.targetPath
    ) {
      const safePath = params.targetPath.trim().replace(/'/g, "''")
      const cmd =
        params.action === 'add-exclusion-path'
          ? `Add-MpPreference -ExclusionPath '${safePath}'`
          : `Remove-MpPreference -ExclusionPath '${safePath}'`
      runElevated(cmd, `Windows Defender Exclusion: ${params.targetPath}`, 'system')
      await new Promise((r) => setTimeout(r, 1500))
      const posture = await getSystemSecurityPosture(true)
      return {
        success: true,
        message: `Requested UAC to update Windows Defender Exclusion for "${params.targetPath}"`,
        posture
      }
    }
    return { success: false, message: 'Unknown security action' }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Security action failed'
    }
  }
}

export async function getSystemEventLogs(): Promise<SystemEventLogItem[]> {
  const script = `
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $ErrorActionPreference = 'SilentlyContinue'
    $since = (Get-Date).AddDays(-4)
    $evts = Get-WinEvent -FilterHashtable @{ LogName=@('Application','System'); Level=@(1,2); StartTime=$since } -MaxEvents 60 -ErrorAction SilentlyContinue
    $out = @()
    foreach ($e in $evts) {
      $msg = [string]$e.Message
      if ($msg.Length -gt 360) { $msg = $msg.Substring(0, 360) + '...' }
      $lvl = if ($e.Level -eq 1) { 'Critical' } elseif ($e.Level -eq 2) { 'Error' } else { 'Warning' }
      $out += [PSCustomObject]@{
        id           = [int]$e.Id
        recordId     = [long]$e.RecordId
        timeCreated  = $e.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss')
        logName      = [string]$e.LogName
        level        = $lvl
        providerName = [string]$e.ProviderName
        message      = ($msg -replace '\r?\n', ' ')
      }
    }
    $out | ConvertTo-Json -Compress
  `
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 10000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
    )
    const trimmed = stdout.trim()
    if (!trimmed) return []
    const parsed = JSON.parse(trimmed)
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    return arr
      .filter((e) => e && e.providerName)
      .map((e) => ({
        id: Number(e.id || 0),
        recordId: Number(e.recordId || 0),
        timeCreated: String(e.timeCreated || ''),
        logName: String(e.logName || 'Application'),
        level: (e.level === 'Critical' ? 'Critical' : 'Error') as 'Critical' | 'Error' | 'Warning',
        providerName: String(e.providerName || ''),
        message: String(e.message || '')
      }))
  } catch {
    return []
  }
}
