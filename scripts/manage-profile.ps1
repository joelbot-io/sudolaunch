<#
.SYNOPSIS
    All-in-one SudoLaunch profile maintenance, diagnostics, and developer workspace suite.

.DESCRIPTION
    Unified manager for SudoLaunch profile backup, restore, validation, privacy scrubbing,
    native addon repair, enterprise Teams import, browser bookmarks import, git workspace scanner,
    command scaffolder, hotkey conflict diagnostic, app indexer, process cleaner, PowerShell profile sync,
    portable bundle migration, and directory navigation. Can be run interactively or via CLI subcommands.

.PARAMETER Command
    Subcommand to execute:
    'backup', 'restore', 'list', 'prune', 'validate', 'clean-history', 'repair-env',
    'import-teams', 'export-bundle', 'import-bundle', 'autostart', 'bookmarks',
    'scan-repos', 'new-cmd', 'check-hotkeys', 'reindex-apps', 'clean-procs', 'sync-shell',
    'create', 'init', 'open-profile', 'open-archive'.
    If omitted, an interactive menu is presented.

.PARAMETER Note
    Optional note for the backup subcommand.

.PARAMETER BackupFile
    Specific backup file to restore.

.PARAMETER Latest
    Switch for restore subcommand to pick the latest backup.

.PARAMETER KeepLast
    Number of recent backups to keep when pruning.

.PARAMETER BundlePath
    Path to bundle for export-bundle or import-bundle.

.PARAMETER CsvFile
    Path to CSV file for import-teams subcommand.

.PARAMETER Query
    Search query for reindex-apps.

.PARAMETER Name
    Command name for new-cmd.

.PARAMETER Kill
    Switch for clean-procs to terminate processes.

.PARAMETER Install
    Switch for sync-shell to install profile integration.

.PARAMETER Uninstall
    Switch for sync-shell to uninstall profile integration.

.PARAMETER ProfileDir
    Path to SudoLaunch profile directory. Defaults to ~/.sudolaunch.

.PARAMETER ArchiveDir
    Path to archives directory. Defaults to ~/.sudolaunch-archives.

.EXAMPLE
    .\scripts\manage-profile.ps1
    (Launches interactive management menu)

.EXAMPLE
    .\scripts\manage-profile.ps1 validate

.EXAMPLE
    .\scripts\manage-profile.ps1 scan-repos

.EXAMPLE
    .\scripts\manage-profile.ps1 bookmarks
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet(
        "backup", "restore", "list", "prune", "validate", "clean-history",
        "repair-env", "import-teams", "export-bundle", "import-bundle",
        "autostart", "bookmarks", "scan-repos", "new-cmd", "check-hotkeys",
        "reindex-apps", "clean-procs", "sync-shell", "create", "init",
        "open-profile", "open-archive", "menu", ""
    )]
    [string]$Command = "",

    [Parameter()]
    [string]$Note = "",

    [Parameter()]
    [string]$BackupFile = "",

    [Parameter()]
    [switch]$Latest,

    [Parameter()]
    [int]$KeepLast = 10,

    [Parameter()]
    [string]$TargetDir = "",

    [Parameter()]
    [string]$BundlePath = "",

    [Parameter()]
    [string]$CsvFile = "",

    [Parameter()]
    [string]$Query = "",

    [Parameter()]
    [string]$Name = "",

    [Parameter()]
    [switch]$Fix,

    [Parameter()]
    [switch]$Replace,

    [Parameter()]
    [switch]$Enable,

    [Parameter()]
    [switch]$Disable,

    [Parameter()]
    [switch]$Repair,

    [Parameter()]
    [switch]$Kill,

    [Parameter()]
    [switch]$Install,

    [Parameter()]
    [switch]$Uninstall,

    [Parameter()]
    [string]$ProfileDir = (Join-Path $env:USERPROFILE ".sudolaunch"),

    [Parameter()]
    [string]$ArchiveDir = (Join-Path $env:USERPROFILE ".sudolaunch-archives")
)

$ErrorActionPreference = "Stop"
$ScriptRoot = $PSScriptRoot

function Show-ArchiveList {
    if (-not (Test-Path $ArchiveDir)) {
        Write-Host "Archive directory does not exist yet: $ArchiveDir" -ForegroundColor Yellow
        return
    }

    $archives = Get-ChildItem -Path $ArchiveDir -Filter "*.zip" | Sort-Object LastWriteTime -Descending
    if ($archives.Count -eq 0) {
        Write-Host "No archives found in $ArchiveDir" -ForegroundColor Yellow
        return
    }

    $totalBytes = ($archives | Measure-Object -Property Length -Sum).Sum
    $totalMb = [Math]::Round($totalBytes / 1MB, 2)

    Write-Host "`n========================================================" -ForegroundColor Magenta
    Write-Host "       SudoLaunch Backups in $ArchiveDir" -ForegroundColor White
    Write-Host "========================================================`n" -ForegroundColor Magenta

    $results = @()
    foreach ($a in $archives) {
        $type = if ($a.Name -like "*prerestore*" -or $a.Name -like "*pre-restore*" -or $a.Name -like "*pre-import*") {
            "Safety Snapshot"
        } else {
            "User Backup"
        }
        $results += [PSCustomObject]@{
            "Archive Name" = $a.Name
            "Type"         = $type
            "Size (KB)"    = [Math]::Round($a.Length / 1KB, 1)
            "Date Modified"= $a.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
        }
    }

    $results | Format-Table -AutoSize
    Write-Host "Total: $($archives.Count) archives ($totalMb MB total space)`n" -ForegroundColor Gray
}

function Invoke-BackupAction {
    $script = Join-Path $ScriptRoot "backup-profile.ps1"
    & $script -Note $Note -ProfileDir $ProfileDir -ArchiveDir $ArchiveDir
}

function Invoke-RestoreAction {
    $script = Join-Path $ScriptRoot "restore-profile.ps1"
    $params = @{
        ProfileDir = $ProfileDir
        ArchiveDir = $ArchiveDir
    }
    if ($BackupFile) { $params["BackupFile"] = $BackupFile }
    if ($Latest) { $params["Latest"] = $true }
    & $script @params
}

function Invoke-PruneAction([int]$keep) {
    if (-not (Test-Path $ArchiveDir)) {
        Write-Host "Archive directory does not exist." -ForegroundColor Yellow
        return
    }
    $archives = Get-ChildItem -Path $ArchiveDir -Filter "*.zip" | Sort-Object LastWriteTime -Descending
    if ($archives.Count -le $keep) {
        Write-Host "Found $($archives.Count) archives. Already within retention limit of $keep. No action needed." -ForegroundColor Green
        return
    }

    $toRemove = $archives | Select-Object -Skip $keep
    Write-Host "`nPruning $($toRemove.Count) archive(s) beyond newest $($keep):" -ForegroundColor Yellow
    foreach ($item in $toRemove) {
        Write-Host "  [-] Removing: $($item.Name)" -ForegroundColor Gray
        Remove-Item -Path $item.FullName -Force
    }
    Write-Host "Pruning complete. $($keep) most recent archives retained.`n" -ForegroundColor Green
}

# CLI Subcommand Dispatch
switch ($Command.ToLowerInvariant()) {
    "backup" {
        Invoke-BackupAction
        exit 0
    }
    "restore" {
        Invoke-RestoreAction
        exit 0
    }
    "list" {
        Show-ArchiveList
        exit 0
    }
    "prune" {
        Invoke-PruneAction $KeepLast
        exit 0
    }
    "validate" {
        $script = Join-Path $ScriptRoot "validate-profile.ps1"
        $p = @{ ProfileDir = $ProfileDir }
        if ($Fix) { $p["Fix"] = $true }
        & $script @p
        exit 0
    }
    "clean-history" {
        $script = Join-Path $ScriptRoot "clean-history.ps1"
        & $script -ProfileDir $ProfileDir
        exit 0
    }
    "repair-env" {
        $script = Join-Path $ScriptRoot "repair-environment.ps1"
        & $script
        exit 0
    }
    "import-teams" {
        $script = Join-Path $ScriptRoot "import-team-links.ps1"
        $p = @{ ProfileDir = $ProfileDir }
        if ($CsvFile) { $p["SourcePath"] = $CsvFile }
        if ($Replace) { $p["Replace"] = $true }
        & $script @p
        exit 0
    }
    "export-bundle" {
        $script = Join-Path $ScriptRoot "export-profile.ps1"
        $p = @{ ProfileDir = $ProfileDir }
        if ($BundlePath) { $p["OutFile"] = $BundlePath }
        & $script @p
        exit 0
    }
    "import-bundle" {
        $script = Join-Path $ScriptRoot "import-profile.ps1"
        $p = @{ ProfileDir = $ProfileDir }
        if ($BundlePath) { $p["BundlePath"] = $BundlePath }
        if ($Replace) { $p["Replace"] = $true }
        & $script @p
        exit 0
    }
    "autostart" {
        $script = Join-Path $ScriptRoot "check-autostart.ps1"
        $p = @{ ProfileDir = $ProfileDir }
        if ($Enable) { $p["Enable"] = $true }
        if ($Disable) { $p["Disable"] = $true }
        if ($Repair) { $p["Repair"] = $true }
        & $script @p
        exit 0
    }
    "bookmarks" {
        $script = Join-Path $ScriptRoot "import-bookmarks.ps1"
        $p = @{ ProfileDir = $ProfileDir }
        if ($Replace) { $p["Replace"] = $true }
        & $script @p
        exit 0
    }
    "scan-repos" {
        $script = Join-Path $ScriptRoot "scan-git-repos.ps1"
        & $script -ProfileDir $ProfileDir
        exit 0
    }
    "new-cmd" {
        $script = Join-Path $ScriptRoot "new-command.ps1"
        $p = @{ ProfileDir = $ProfileDir }
        if ($Name) { $p["Name"] = $Name }
        & $script @p
        exit 0
    }
    "check-hotkeys" {
        $script = Join-Path $ScriptRoot "check-hotkey-conflicts.ps1"
        & $script -ProfileDir $ProfileDir
        exit 0
    }
    "reindex-apps" {
        $script = Join-Path $ScriptRoot "reindex-apps.ps1"
        $p = @{ ProfileDir = $ProfileDir }
        if ($Query) { $p["Query"] = $Query }
        & $script @p
        exit 0
    }
    "clean-procs" {
        $script = Join-Path $ScriptRoot "clean-processes.ps1"
        $p = @{}
        if ($Kill) { $p["Kill"] = $true }
        & $script @p
        exit 0
    }
    "sync-shell" {
        $script = Join-Path $ScriptRoot "sync-terminal-profile.ps1"
        $p = @{ ProfileDir = $ProfileDir }
        if ($Install) { $p["Install"] = $true }
        if ($Uninstall) { $p["Uninstall"] = $true }
        & $script @p
        exit 0
    }
    "create" {
        $target = if ($TargetDir) { $TargetDir } else { $ProfileDir }
        $script = Join-Path $ScriptRoot "create-profile.ps1"
        & $script -TargetDir $target
        exit 0
    }
    "init" {
        $target = if ($TargetDir) { $TargetDir } else { $ProfileDir }
        $script = Join-Path $ScriptRoot "create-profile.ps1"
        & $script -TargetDir $target
        exit 0
    }
    "open-profile" {
        if (-not (Test-Path $ProfileDir)) { New-Item -Path $ProfileDir -ItemType Directory -Force | Out-Null }
        Invoke-Item $ProfileDir
        exit 0
    }
    "open-archive" {
        if (-not (Test-Path $ArchiveDir)) { New-Item -Path $ArchiveDir -ItemType Directory -Force | Out-Null }
        Invoke-Item $ArchiveDir
        exit 0
    }
}

# Interactive Menu
while ($true) {
    Write-Host "`n========================================================" -ForegroundColor Magenta
    Write-Host "         SudoLaunch Master Maintenance Suite            " -ForegroundColor White
    Write-Host "========================================================" -ForegroundColor Magenta
    Write-Host "  Profile:  $ProfileDir" -ForegroundColor Gray
    Write-Host "  Archive:  $ArchiveDir`n" -ForegroundColor Gray

    Write-Host "  --- Backup & Archive ---" -ForegroundColor DarkGray
    Write-Host "  [1]  " -NoNewline -ForegroundColor Cyan; Write-Host "Backup profile to archive now"
    Write-Host "  [2]  " -NoNewline -ForegroundColor Cyan; Write-Host "Restore profile from archive"
    Write-Host "  [3]  " -NoNewline -ForegroundColor Cyan; Write-Host "List all available backup archives"
    Write-Host "  [4]  " -NoNewline -ForegroundColor Cyan; Write-Host "Prune old archives (retention cleanup)"

    Write-Host "  --- Health & Diagnostics ---" -ForegroundColor DarkGray
    Write-Host "  [5]  " -NoNewline -ForegroundColor Cyan; Write-Host "Validate profile health & JSON schemas"
    Write-Host "  [6]  " -NoNewline -ForegroundColor Cyan; Write-Host "Clean & scrub execution history"
    Write-Host "  [7]  " -NoNewline -ForegroundColor Cyan; Write-Host "Repair build environment & native addons"
    Write-Host "  [8]  " -NoNewline -ForegroundColor Cyan; Write-Host "Check / configure Windows auto-start"
    Write-Host "  [9]  " -NoNewline -ForegroundColor Cyan; Write-Host "Probe global hotkey conflicts & IME hooks"
    Write-Host "  [10] " -NoNewline -ForegroundColor Cyan; Write-Host "Check & terminate orphaned processes"

    Write-Host "  --- Workspace & Developer Tools ---" -ForegroundColor DarkGray
    Write-Host "  [11] " -NoNewline -ForegroundColor Cyan; Write-Host "Import browser bookmarks (Edge/Chrome/Brave)"
    Write-Host "  [12] " -NoNewline -ForegroundColor Cyan; Write-Host "Scan Git workspaces & generate /lookup repos"
    Write-Host "  [13] " -NoNewline -ForegroundColor Cyan; Write-Host "Scaffold new custom command wizard"
    Write-Host "  [14] " -NoNewline -ForegroundColor Cyan; Write-Host "Re-index applications & test search query"
    Write-Host "  [15] " -NoNewline -ForegroundColor Cyan; Write-Host "Integrate aliases into PowerShell `$PROFILE"

    Write-Host "  --- Migration & Enterprise ---" -ForegroundColor DarkGray
    Write-Host "  [16] " -NoNewline -ForegroundColor Cyan; Write-Host "Export portable profile bundle (.zip)"
    Write-Host "  [17] " -NoNewline -ForegroundColor Cyan; Write-Host "Import portable profile bundle (.zip)"
    Write-Host "  [18] " -NoNewline -ForegroundColor Cyan; Write-Host "Import enterprise Teams links from CSV"
    Write-Host "  [19] " -NoNewline -ForegroundColor Cyan; Write-Host "Create default profile at location"

    Write-Host "  --- Explorer ---" -ForegroundColor DarkGray
    Write-Host "  [20] " -NoNewline -ForegroundColor Cyan; Write-Host "Open active profile folder in Explorer"
    Write-Host "  [21] " -NoNewline -ForegroundColor Cyan; Write-Host "Open archive folder in Explorer"
    Write-Host "  [Q]  " -NoNewline -ForegroundColor Yellow; Write-Host "Quit"

    Write-Host ""
    $choice = Read-Host "Select an option"

    switch ($choice) {
        "1" {
            $userNote = Read-Host "Enter optional note/tag for this backup (press Enter to skip)"
            $script = Join-Path $ScriptRoot "backup-profile.ps1"
            & $script -Note $userNote -ProfileDir $ProfileDir -ArchiveDir $ArchiveDir
        }
        "2" {
            $script = Join-Path $ScriptRoot "restore-profile.ps1"
            & $script -ProfileDir $ProfileDir -ArchiveDir $ArchiveDir
        }
        "3" {
            Show-ArchiveList
        }
        "4" {
            $keepCount = Read-Host "Enter number of most recent archives to keep (default: 10)"
            $num = if ($keepCount -match '^\d+$') { [int]$keepCount } else { 10 }
            Invoke-PruneAction $num
        }
        "5" {
            $fixOpt = Read-Host "Auto-fix missing files/keys if found? (y/N)"
            $script = Join-Path $ScriptRoot "validate-profile.ps1"
            $p = @{ ProfileDir = $ProfileDir }
            if ($fixOpt -eq "y" -or $fixOpt -eq "Y") { $p["Fix"] = $true }
            & $script @p
        }
        "6" {
            $scrubOpt = Read-Host "Scrub sensitive commands like /pwd, /hash, tokens? (Y/n)"
            $script = Join-Path $ScriptRoot "clean-history.ps1"
            $p = @{ ProfileDir = $ProfileDir }
            if ($scrubOpt -ne "n" -and $scrubOpt -ne "N") { $p["ScrubSensitive"] = $true }
            & $script @p
        }
        "7" {
            $script = Join-Path $ScriptRoot "repair-environment.ps1"
            & $script
        }
        "8" {
            $script = Join-Path $ScriptRoot "check-autostart.ps1"
            & $script -ProfileDir $ProfileDir
        }
        "9" {
            $script = Join-Path $ScriptRoot "check-hotkey-conflicts.ps1"
            & $script -ProfileDir $ProfileDir
        }
        "10" {
            $script = Join-Path $ScriptRoot "clean-processes.ps1"
            & $script
        }
        "11" {
            $script = Join-Path $ScriptRoot "import-bookmarks.ps1"
            & $script -ProfileDir $ProfileDir
        }
        "12" {
            $script = Join-Path $ScriptRoot "scan-git-repos.ps1"
            & $script -ProfileDir $ProfileDir
        }
        "13" {
            $script = Join-Path $ScriptRoot "new-command.ps1"
            & $script -ProfileDir $ProfileDir
        }
        "14" {
            $q = Read-Host "Enter application search query to test (press Enter to list all)"
            $script = Join-Path $ScriptRoot "reindex-apps.ps1"
            $p = @{ ProfileDir = $ProfileDir }
            if ($q) { $p["Query"] = $q }
            & $script @p
        }
        "15" {
            $act = Read-Host "PowerShell profile integration: [I]nstall, [U]ninstall, or [S]tatus (default: S)"
            $script = Join-Path $ScriptRoot "sync-terminal-profile.ps1"
            $p = @{ ProfileDir = $ProfileDir }
            if ($act -match '^[Ii]') { $p["Install"] = $true }
            elseif ($act -match '^[Uu]') { $p["Uninstall"] = $true }
            else { $p["Status"] = $true }
            & $script @p
        }
        "16" {
            $out = Read-Host "Enter output bundle zip path (default: .\sudolaunch-portable-bundle.zip)"
            $script = Join-Path $ScriptRoot "export-profile.ps1"
            $p = @{ ProfileDir = $ProfileDir }
            if ($out) { $p["OutFile"] = $out }
            & $script @p
        }
        "17" {
            $bundleIn = Read-Host "Enter path to portable bundle .zip to import"
            if ($bundleIn) {
                $script = Join-Path $ScriptRoot "import-profile.ps1"
                & $script -BundlePath $bundleIn -ProfileDir $ProfileDir
            } else {
                Write-Host "No bundle path specified." -ForegroundColor Yellow
            }
        }
        "18" {
            $csvIn = Read-Host "Enter CSV path (default: resources/team_list.csv)"
            $script = Join-Path $ScriptRoot "import-team-links.ps1"
            $p = @{ ProfileDir = $ProfileDir }
            if ($csvIn) { $p["SourcePath"] = $csvIn }
            & $script @p
        }
        "19" {
            $target = Read-Host "Enter target path for new profile (default: $ProfileDir)"
            $dir = if ($target) { $target } else { $ProfileDir }
            $script = Join-Path $ScriptRoot "create-profile.ps1"
            & $script -TargetDir $dir
        }
        "20" {
            if (-not (Test-Path $ProfileDir)) { New-Item -Path $ProfileDir -ItemType Directory -Force | Out-Null }
            Invoke-Item $ProfileDir
        }
        "21" {
            if (-not (Test-Path $ArchiveDir)) { New-Item -Path $ArchiveDir -ItemType Directory -Force | Out-Null }
            Invoke-Item $ArchiveDir
        }
        { $_ -match '^[Qq]$' } {
            Write-Host "Exiting." -ForegroundColor Gray
            exit 0
        }
        default {
            Write-Host "Invalid selection. Please enter 1-21 or Q." -ForegroundColor Yellow
        }
    }
}
