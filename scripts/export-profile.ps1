<#
.SYNOPSIS
    Exports a portable, sanitized SudoLaunch profile bundle for sharing or migration.

.DESCRIPTION
    Creates a shareable .zip bundle containing custom commands, snippets, links, team links,
    lookup tables, and settings. By default (-Sanitize), strips machine-specific coordinates
    (barPosition, termPosition) and excludes private execution history.

.PARAMETER OutFile
    Destination path for the exported ZIP bundle. Defaults to .\sudolaunch-portable-bundle.zip.

.PARAMETER ProfileDir
    Path to the SudoLaunch profile directory. Defaults to ~/.sudolaunch.

.PARAMETER IncludeHistory
    Include execution history in the export (by default, history is excluded for privacy).

.PARAMETER KeepCoordinates
    Preserves exact window screen coordinates instead of resetting to defaults.

.EXAMPLE
    .\scripts\export-profile.ps1

.EXAMPLE
    .\scripts\export-profile.ps1 -OutFile "D:\Backups\team-tools.zip"
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$OutFile = ".\sudolaunch-portable-bundle.zip",

    [Parameter()]
    [string]$ProfileDir = (Join-Path $env:USERPROFILE ".sudolaunch"),

    [Parameter()]
    [switch]$IncludeHistory,

    [Parameter()]
    [switch]$KeepCoordinates
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
Write-Host "         SudoLaunch Portable Profile Exporter           " -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Magenta

$resolvedProfile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ProfileDir)
if (-not (Test-Path $resolvedProfile)) {
    Write-ErrorMsg "Source profile directory does not exist: $resolvedProfile"
    exit 1
}

$resolvedOut = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutFile)
$outDir = Split-Path -Parent $resolvedOut
if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -Path $outDir -ItemType Directory -Force | Out-Null
}

$stagingDir = Join-Path ([System.IO.Path]::GetTempPath()) ("sudolaunch-export-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -Path $stagingDir -ItemType Directory -Force | Out-Null

try {
    Write-Step "Gathering profile contents from: $resolvedProfile"

    # Core JSON files to export
    $filesToExport = @("settings.json", "contacts.json", "snippets.json", "links.json", "teamLinks.json")
    if ($IncludeHistory) {
        $filesToExport += "history.json"
    }

    foreach ($file in $filesToExport) {
        $src = Join-Path $resolvedProfile $file
        if (Test-Path $src) {
            $dest = Join-Path $stagingDir $file
            Copy-Item -Path $src -Destination $dest -Force

            # Sanitize settings if needed
            if ($file -eq "settings.json" -and -not $KeepCoordinates) {
                try {
                    $settingsObj = Get-Content -Path $dest -Raw | ConvertFrom-Json
                    $settingsObj.barPosition = $null
                    $settingsObj.termPosition = $null
                    $settingsObj.termWindowPosition = $null
                    $settingsObj | ConvertTo-Json -Depth 10 | Set-Content -Path $dest -Encoding UTF8
                } catch {
                    # ignore
                }
            }
        }
    }

    # Folders to export
    $foldersToExport = @("commands", "lookup", "maintenance", "gif")
    foreach ($folder in $foldersToExport) {
        $srcDir = Join-Path $resolvedProfile $folder
        if (Test-Path $srcDir) {
            $destDir = Join-Path $stagingDir $folder
            Copy-Item -Path $srcDir -Destination $destDir -Recurse -Force
        }
    }

    # Export Manifest
    $exportManifest = [PSCustomObject]@{
        BundleType       = "SudoLaunch-Portable-Bundle"
        ExportVersion    = "1.0"
        ExportDate       = (Get-Date).ToString("o")
        ExportedBy       = "$env:USERNAME"
        ComputerName     = $env:COMPUTERNAME
        Sanitized        = (-not $IncludeHistory -and -not $KeepCoordinates)
        IncludedHistory  = [bool]$IncludeHistory
        Files            = (Get-ChildItem -Path $stagingDir -Recurse -File | Select-Object -ExpandProperty Name)
    }
    $manifestPath = Join-Path $stagingDir "bundle-manifest.json"
    $exportManifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8

    Write-Step "Packaging bundle to: $resolvedOut"
    if (Test-Path $resolvedOut) {
        Remove-Item -Path $resolvedOut -Force
    }

    Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $resolvedOut -CompressionLevel Optimal

    $bundleItem = Get-Item $resolvedOut
    Write-Host ""
    Write-Success "Portable profile bundle created successfully!"
    Write-Host "  Location:         $($bundleItem.FullName)" -ForegroundColor White
    Write-Host "  Size:             $([Math]::Round($bundleItem.Length / 1KB, 1)) KB" -ForegroundColor Green
    $sanitizedDesc = if (-not $IncludeHistory) { "Yes (History excluded, window coordinates reset)" } else { "No" }
    Write-Host "  Sanitized:        $sanitizedDesc" -ForegroundColor Gray
    Write-Host "  To import:        .\scripts\import-profile.ps1 -BundlePath `"$resolvedOut`"" -ForegroundColor Yellow
    Write-Host ""
}
finally {
    if (Test-Path $stagingDir) {
        Remove-Item -Path $stagingDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
