<#
.SYNOPSIS
    Restores the SudoLaunch profile directory from an archive backup.

.DESCRIPTION
    Restores configurations, contacts, snippets, team links, history, custom commands,
    and lookups from a backup ZIP archive in ~/.sudolaunch-archives to ~/.sudolaunch.
    Automatically creates a pre-restore safety backup of the current profile before
    overwriting any files.

.PARAMETER BackupFile
    Path or filename of the specific backup ZIP to restore. If not provided,
    an interactive list of available backups is displayed.

.PARAMETER Latest
    Switch to automatically select the most recent backup without prompting.

.PARAMETER ProfileDir
    Path to the SudoLaunch profile directory. Defaults to ~/.sudolaunch.

.PARAMETER ArchiveDir
    Path to the archive directory. Defaults to ~/.sudolaunch-archives.

.PARAMETER Force
    Switch to bypass the confirmation prompt.

.PARAMETER NoSafetyBackup
    Switch to skip taking an automatic safety backup of current profile before restore.

.EXAMPLE
    .\scripts\restore-profile.ps1 -Latest

.EXAMPLE
    .\scripts\restore-profile.ps1 -BackupFile "sudolaunch-backup-2026-09-13_14-23-32-test-run.zip"
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$BackupFile = "",

    [Parameter()]
    [switch]$Latest,

    [Parameter()]
    [string]$ProfileDir = (Join-Path $env:USERPROFILE ".sudolaunch"),

    [Parameter()]
    [string]$ArchiveDir = (Join-Path $env:USERPROFILE ".sudolaunch-archives"),

    [Parameter()]
    [switch]$Force,

    [Parameter()]
    [switch]$NoSafetyBackup
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$message) {
    Write-Host " [+] $message" -ForegroundColor Cyan
}

function Write-Success([string]$message) {
    Write-Host " [v] $message" -ForegroundColor Green
}

function Write-WarningMsg([string]$message) {
    Write-Host " [!] $message" -ForegroundColor Yellow
}

function Write-ErrorMsg([string]$message) {
    Write-Host " [X] $message" -ForegroundColor Red
}

Write-Host "`n========================================================" -ForegroundColor Magenta
Write-Host "           SudoLaunch Profile Restore Tool             " -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Magenta

# 1. Validate Archive Directory
if (-not (Test-Path -Path $ArchiveDir -PathType Container)) {
    Write-ErrorMsg "Archive directory not found: $ArchiveDir"
    exit 1
}

# 2. Locate / Select Backup File
$chosenBackupPath = ""

if ($BackupFile) {
    if (Test-Path $BackupFile) {
        $chosenBackupPath = (Get-Item $BackupFile).FullName
    } else {
        $candidate = Join-Path $ArchiveDir $BackupFile
        if (Test-Path $candidate) {
            $chosenBackupPath = (Get-Item $candidate).FullName
        } else {
            Write-ErrorMsg "Specified backup file not found: $BackupFile"
            exit 1
        }
    }
} else {
    $archives = Get-ChildItem -Path $ArchiveDir -Filter "*.zip" | Sort-Object LastWriteTime -Descending

    if ($archives.Count -eq 0) {
        Write-ErrorMsg "No backup ZIP files found in $ArchiveDir"
        exit 1
    }

    if ($Latest) {
        $chosenBackupPath = $archives[0].FullName
    } else {
        Write-Host "Available Backups in $ArchiveDir`n" -ForegroundColor Cyan
        for ($i = 0; $i -lt $archives.Count; $i++) {
            $arch = $archives[$i]
            $sizeKb = [Math]::Round($arch.Length / 1KB, 1)
            $dateStr = $arch.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
            $num = "[$($i + 1)]".PadRight(5)
            Write-Host "  $num $($arch.Name)" -ForegroundColor White
            Write-Host "        Date: $dateStr | Size: $sizeKb KB" -ForegroundColor Gray
        }

        Write-Host ""
        $selection = Read-Host "Select backup number to restore (1-$($archives.Count)), [L]atest, or [Q]uit"
        if ($selection -match '^[Qq]$' -or -not $selection) {
            Write-Host "Operation cancelled." -ForegroundColor Yellow
            exit 0
        }

        if ($selection -match '^[Ll]$') {
            $chosenBackupPath = $archives[0].FullName
        } elseif ($selection -match '^\d+$' -and [int]$selection -ge 1 -and [int]$selection -le $archives.Count) {
            $chosenBackupPath = $archives[[int]$selection - 1].FullName
        } else {
            Write-ErrorMsg "Invalid selection."
            exit 1
        }
    }
}

$backupItem = Get-Item $chosenBackupPath
Write-Step "Selected Backup: $($backupItem.Name)"

# 3. Check for Active SudoLaunch Process
$runningProcesses = Get-Process | Where-Object { $_.ProcessName -like "*sudolaunch*" }
if ($runningProcesses) {
    Write-WarningMsg "SudoLaunch process is currently active (PID: $($runningProcesses.Id -join ', '))."
    Write-WarningMsg "It is strongly recommended to close SudoLaunch before restoring to prevent file lock issues."
    if (-not $Force) {
        $proceed = Read-Host "Do you want to continue anyway? (y/N)"
        if ($proceed -notmatch '^[Yy]$') {
            Write-Host "Operation aborted by user." -ForegroundColor Yellow
            exit 0
        }
    }
}

# 4. Confirmation Prompt
if (-not $Force) {
    Write-Host ""
    Write-WarningMsg "Restoring will replace configuration files in: $ProfileDir"
    $confirm = Read-Host "Proceed with restore? (y/N)"
    if ($confirm -notmatch '^[Yy]$') {
        Write-Host "Restore cancelled." -ForegroundColor Yellow
        exit 0
    }
}

# 5. Create Pre-Restore Safety Backup
if (-not $NoSafetyBackup -and (Test-Path $ProfileDir)) {
    $safetyTimestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $safetyName = "sudolaunch-prerestore-safety-$safetyTimestamp.zip"
    $safetyPath = Join-Path $ArchiveDir $safetyName
    Write-Step "Creating automatic pre-restore safety snapshot..."
    try {
        Compress-Archive -Path (Join-Path $ProfileDir "*") -DestinationPath $safetyPath -CompressionLevel Optimal
        Write-Success "Pre-restore safety snapshot saved to: $safetyName"
    } catch {
        Write-WarningMsg "Could not create safety snapshot: $_"
    }
}

# 6. Extract into Temporary Staging Area
$tempExtractDir = Join-Path ([System.IO.Path]::GetTempPath()) ("sudolaunch-restore-" + [System.Guid]::NewGuid().ToString("N"))
$null = New-Item -Path $tempExtractDir -ItemType Directory -Force

try {
    Write-Step "Extracting and validating archive..."
    Expand-Archive -Path $chosenBackupPath -DestinationPath $tempExtractDir -Force

    # Read manifest if present
    $manifestPath = Join-Path $tempExtractDir "backup-manifest.json"
    if (Test-Path $manifestPath) {
        try {
            $manifest = Get-Content -Path $manifestPath -Raw | ConvertFrom-Json
            Write-Host "  Backup Date:    $($manifest.Timestamp)" -ForegroundColor Gray
            Write-Host "  Source Machine: $($manifest.ComputerName)" -ForegroundColor Gray
            if ($manifest.Note) {
                Write-Host "  Backup Note:    $($manifest.Note)" -ForegroundColor Yellow
            }
            # Remove manifest so it doesn't clutter active profile
            Remove-Item -Path $manifestPath -Force
        } catch {
            # ignore parse errors
        }
    }

    # Ensure target profile dir exists
    if (-not (Test-Path $ProfileDir)) {
        $null = New-Item -Path $ProfileDir -ItemType Directory -Force
    }

    Write-Step "Restoring files to: $ProfileDir"
    Copy-Item -Path (Join-Path $tempExtractDir "*") -Destination $ProfileDir -Recurse -Force

    # 7. Post-Restore Verification
    $restoredFiles = Get-ChildItem -Path $ProfileDir -Recurse -File
    Write-Host ""
    Write-Success "Profile restored successfully!"
    Write-Host "  Target Profile:    $ProfileDir" -ForegroundColor White
    Write-Host "  Total Files:       $($restoredFiles.Count)" -ForegroundColor White
    Write-Host "  Restored From:     $($backupItem.Name)" -ForegroundColor Green

    # List core configuration files found
    $coreConfigs = @("settings.json", "contacts.json", "snippets.json", "teamLinks.json", "history.json")
    $presentCore = @()
    foreach ($cfg in $coreConfigs) {
        if (Test-Path (Join-Path $ProfileDir $cfg)) {
            $presentCore += $cfg
        }
    }
    Write-Host "  Core Configs:      $($presentCore -join ', ')" -ForegroundColor Gray

    if ($runningProcesses) {
        Write-Host ""
        Write-WarningMsg "Note: Please restart SudoLaunch for the restored configurations to take full effect."
    }

    Write-Host ""
}
finally {
    if (Test-Path $tempExtractDir) {
        Remove-Item -Path $tempExtractDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
