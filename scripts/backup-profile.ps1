<#
.SYNOPSIS
    Backs up the SudoLaunch profile directory to a timestamped ZIP archive.

.DESCRIPTION
    Creates a compressed archive of the SudoLaunch profile folder (~/.sudolaunch)
    including all configuration files, contacts, snippets, team links, history,
    custom commands, lookups, and assets. Includes an embedded metadata manifest
    and supports automatic archive retention management.

.PARAMETER ProfileDir
    Path to the SudoLaunch profile directory. Defaults to ~/.sudolaunch.

.PARAMETER ArchiveDir
    Path to the archive directory where backups are stored. Defaults to ~/.sudolaunch-archives.

.PARAMETER Note
    Optional descriptive tag/note added to the backup filename (e.g. "pre-upgrade", "clean-state").

.PARAMETER KeepLast
    Optional number of most recent backups to retain in ArchiveDir. Older backups will be pruned.

.EXAMPLE
    .\scripts\backup-profile.ps1

.EXAMPLE
    .\scripts\backup-profile.ps1 -Note "before-work-migration" -KeepLast 10
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Note = "",

    [Parameter()]
    [string]$ProfileDir = (Join-Path $env:USERPROFILE ".sudolaunch"),

    [Parameter()]
    [string]$ArchiveDir = (Join-Path $env:USERPROFILE ".sudolaunch-archives"),

    [Parameter()]
    [int]$KeepLast = 0
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
Write-Host "           SudoLaunch Profile Backup Tool              " -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Magenta

# 1. Validate Profile Directory
if (-not (Test-Path -Path $ProfileDir -PathType Container)) {
    Write-ErrorMsg "Profile directory not found: $ProfileDir"
    exit 1
}

$profileItems = Get-ChildItem -Path $ProfileDir -Recurse -File
if ($profileItems.Count -eq 0) {
    Write-WarningMsg "Profile directory exists but is empty ($ProfileDir). Nothing to back up."
    exit 0
}

# 2. Ensure Archive Directory Exists
if (-not (Test-Path -Path $ArchiveDir -PathType Container)) {
    Write-Step "Creating archive directory: $ArchiveDir"
    $null = New-Item -Path $ArchiveDir -ItemType Directory -Force
}

# 3. Formulate Backup Filename
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$cleanNote = if ($Note) {
    "-" + ($Note.Trim() -replace '[^\w\.\-]', '_')
} else {
    ""
}
$archiveName = "sudolaunch-backup-$timestamp$cleanNote.zip"
$archivePath = Join-Path $ArchiveDir $archiveName

# Temporary staging directory to inject manifest without polluting active profile
$stagingDir = Join-Path ([System.IO.Path]::GetTempPath()) ("sudolaunch-staging-" + [System.Guid]::NewGuid().ToString("N"))

try {
    Write-Step "Preparing files from: $ProfileDir"
    $null = New-Item -Path $stagingDir -ItemType Directory -Force

    # Copy profile contents into staging
    Copy-Item -Path (Join-Path $ProfileDir "*") -Destination $stagingDir -Recurse -Force

    # Compute uncompressed size and relative file list
    $stagedFiles = Get-ChildItem -Path $stagingDir -Recurse -File
    $uncompressedBytes = ($stagedFiles | Measure-Object -Property Length -Sum).Sum
    $fileList = @()
    foreach ($file in $stagedFiles) {
        $relPath = $file.FullName.Substring($stagingDir.Length).TrimStart('\', '/')
        $fileList += [PSCustomObject]@{
            Path  = $relPath
            Bytes = $file.Length
        }
    }

    # Generate metadata manifest
    $manifest = [PSCustomObject]@{
        BackupVersion      = "1.0"
        Timestamp          = (Get-Date).ToString("o")
        ComputerName       = $env:COMPUTERNAME
        Username           = $env:USERNAME
        OriginalProfileDir = $ProfileDir
        ArchiveName        = $archiveName
        Note               = $Note
        FileCount          = $fileList.Count
        UncompressedBytes  = $uncompressedBytes
        Files              = $fileList
    }

    $manifestPath = Join-Path $stagingDir "backup-manifest.json"
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8

    Write-Step "Compressing into archive: $archiveName"
    if (Test-Path $archivePath) {
        Remove-Item -Path $archivePath -Force
    }

    # Use Compress-Archive (PowerShell built-in)
    Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $archivePath -CompressionLevel Optimal

    $archiveFileInfo = Get-Item $archivePath
    $compressedBytes = $archiveFileInfo.Length
    $ratio = if ($uncompressedBytes -gt 0) {
        [Math]::Round((1 - ($compressedBytes / $uncompressedBytes)) * 100, 1)
    } else {
        0
    }

    $compressedKb = [Math]::Round($compressedBytes / 1KB, 2)
    $uncompressedKb = [Math]::Round($uncompressedBytes / 1KB, 2)

    Write-Host ""
    Write-Success "Backup created successfully!"
    Write-Host "  Location:           $archivePath" -ForegroundColor Gray
    Write-Host "  Files Backed Up:    $($fileList.Count)" -ForegroundColor White
    Write-Host "  Uncompressed Size:  $uncompressedKb KB ($uncompressedBytes bytes)" -ForegroundColor White
    Write-Host "  Compressed Size:    $compressedKb KB ($compressedBytes bytes)" -ForegroundColor Green
    Write-Host "  Compression Ratio:  $ratio% saved" -ForegroundColor Green
    if ($Note) {
        Write-Host "  Note:               $Note" -ForegroundColor Yellow
    }

    # 4. Optional Retention Pruning
    if ($KeepLast -gt 0) {
        Write-Host ""
        Write-Step "Checking retention policy (Keep last $KeepLast backups)..."
        $allBackups = Get-ChildItem -Path $ArchiveDir -Filter "sudolaunch-backup-*.zip" | Sort-Object LastWriteTime -Descending
        if ($allBackups.Count -gt $KeepLast) {
            $toRemove = $allBackups | Select-Object -Skip $KeepLast
            foreach ($oldBackup in $toRemove) {
                Write-WarningMsg "Pruning old backup: $($oldBackup.Name)"
                Remove-Item -Path $oldBackup.FullName -Force
            }
            Write-Success "Pruned $($toRemove.Count) old backup(s)."
        } else {
            Write-Host "  Total backups ($($allBackups.Count)) within limit of $KeepLast." -ForegroundColor Gray
        }
    }

    Write-Host ""
}
finally {
    # Clean up staging directory
    if (Test-Path $stagingDir) {
        Remove-Item -Path $stagingDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
