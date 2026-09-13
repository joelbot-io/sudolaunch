<#
.SYNOPSIS
    Diagnoses, scans, and indexes installed applications and Start Menu shortcuts.

.DESCRIPTION
    Scans Windows Start Menu (user & common), desktop shortcuts, UWP packages, and PATH tools.
    Resolves .lnk shortcuts to target executables, tests query fuzzy matching, detects disabled
    apps in ~/.sudolaunch/settings.json, and exports an apps catalog to ~/.sudolaunch/lookup/apps.json.

.PARAMETER Query
    Optional test query to simulate SudoLaunch app search matching (e.g. -Query "terminal").

.PARAMETER ExportLookup
    Exports discovered application catalog to ~/.sudolaunch/lookup/apps.json for /lookup apps.

.PARAMETER ProfileDir
    Path to SudoLaunch profile directory. Defaults to ~/.sudolaunch.

.EXAMPLE
    .\scripts\reindex-apps.ps1

.EXAMPLE
    .\scripts\reindex-apps.ps1 -Query "terminal"

.EXAMPLE
    .\scripts\reindex-apps.ps1 -ExportLookup
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Query = "",

    [Parameter()]
    [switch]$ExportLookup,

    [Parameter()]
    [string]$ProfileDir = (Join-Path $env:USERPROFILE ".sudolaunch")
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

Write-Host "`n========================================================" -ForegroundColor Magenta
Write-Host "        SudoLaunch App & Shortcut Indexer               " -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Magenta

# Check settings for disabledApps
$resolvedProfile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ProfileDir)
$settingsPath = Join-Path $resolvedProfile "settings.json"
$disabledApps = @()
if (Test-Path $settingsPath) {
    try {
        $settings = Get-Content -Path $settingsPath -Raw | ConvertFrom-Json
        if ($settings.disabledApps) { $disabledApps = @($settings.disabledApps) }
    } catch {}
}

$wscript = New-Object -ComObject WScript.Shell

$shortcutDirs = @(
    [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs"),
    [System.IO.Path]::Combine($env:ProgramData, "Microsoft\Windows\Start Menu\Programs"),
    [System.IO.Path]::Combine($env:USERPROFILE, "Desktop"),
    "C:\Users\Public\Desktop"
)

Write-Step "Scanning Start Menu and Desktop shortcut directories..."

$discoveredShortcuts = @()
$seenNames = @{}

foreach ($dir in $shortcutDirs) {
    if (-not (Test-Path $dir)) { continue }
    $lnks = Get-ChildItem -Path $dir -Filter "*.lnk" -Recurse -File -ErrorAction SilentlyContinue
    foreach ($lnk in $lnks) {
        $cleanName = [System.IO.Path]::GetFileNameWithoutExtension($lnk.Name)
        # Skip uninstallers, help, and readmes
        if ($cleanName -match '(?i)uninstall|help|readme|documentation|license|website') { continue }

        $normKey = $cleanName.ToLower().Trim()
        if ($seenNames.ContainsKey($normKey)) { continue }
        $seenNames[$normKey] = $true

        $targetPath = ""
        $args = ""
        try {
            $sc = $wscript.CreateShortcut($lnk.FullName)
            $targetPath = $sc.TargetPath
            $args = $sc.Arguments
        } catch {}

        $isDisabled = $disabledApps -contains $cleanName

        $discoveredShortcuts += [PSCustomObject]@{
            "Name"       = $cleanName
            "TargetPath" = $targetPath
            "Arguments"  = $args
            "Shortcut"   = $lnk.FullName
            "Disabled"   = $isDisabled
            "Type"       = "Win32 Shortcut"
        }
    }
}

Write-Success "Found $($discoveredShortcuts.Count) Win32 application shortcuts."

# Also discover modern UWP / Store Apps via Get-StartApps if available
$uwpApps = @()
try {
    $startApps = Get-StartApps -ErrorAction SilentlyContinue
    foreach ($sa in $startApps) {
        $normKey = $sa.Name.ToLower().Trim()
        if (-not $seenNames.ContainsKey($normKey)) {
            $seenNames[$normKey] = $true
            $uwpApps += [PSCustomObject]@{
                "Name"       = $sa.Name
                "TargetPath" = $sa.AppID
                "Arguments"  = ""
                "Shortcut"   = "shell:AppsFolder\$($sa.AppID)"
                "Disabled"   = ($disabledApps -contains $sa.Name)
                "Type"       = "UWP / Packaged App"
            }
        }
    }
    Write-Success "Found $($uwpApps.Count) packaged modern/UWP applications."
} catch {}

$allApps = $discoveredShortcuts + $uwpApps
Write-Host "Total indexed applications: $($allApps.Count)" -ForegroundColor White

if ($disabledApps.Count -gt 0) {
    Write-WarningMsg "Currently disabled in settings.json ($($disabledApps.Count)): $($disabledApps -join ', ')"
}

# Simulate Search / Filter Query
if ($Query) {
    Write-Host "`n--- Search Simulation for query: '$Query' ---" -ForegroundColor Yellow
    $matches = @()
    foreach ($app in $allApps) {
        $score = 0
        if ($app.Name -eq $Query) { $score = 100 }
        elseif ($app.Name.StartsWith($Query, [System.StringComparison]::OrdinalIgnoreCase)) { $score = 80 }
        elseif ($app.Name -like "*$Query*") { $score = 60 }
        elseif ($app.TargetPath -like "*$Query*") { $score = 40 }

        if ($score -gt 0) {
            $matches += [PSCustomObject]@{
                "Score"      = $score
                "Name"       = $app.Name
                "Type"       = $app.Type
                "TargetPath" = $app.TargetPath
                "Status"     = if ($app.Disabled) { "DISABLED in settings" } else { "Enabled" }
            }
        }
    }

    $sortedMatches = $matches | Sort-Object -Property Score -Descending
    if ($sortedMatches.Count -gt 0) {
        $sortedMatches | Select-Object -First 15 | Format-Table -AutoSize
        Write-Host "Found $($sortedMatches.Count) match(es) in index.`n" -ForegroundColor Green
    } else {
        Write-WarningMsg "No applications matched '$Query'."
    }
}

# Export to lookup table if requested
if ($ExportLookup) {
    $lookupDir = Join-Path $resolvedProfile "lookup"
    if (-not (Test-Path $lookupDir)) { New-Item -Path $lookupDir -ItemType Directory -Force | Out-Null }
    $exportPath = Join-Path $lookupDir "apps.json"

    $exportData = @()
    foreach ($a in $allApps) {
        $exportData += [PSCustomObject]@{
            "Name"       = $a.Name
            "Type"       = $a.Type
            "Target"     = $a.TargetPath
            "Status"     = if ($a.Disabled) { "Disabled" } else { "Active" }
        }
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($exportPath, ($exportData | ConvertTo-Json -Depth 10), $utf8NoBom)
    Write-Success "Exported catalog to: $exportPath"
    Write-Host "  Search in SudoLaunch with: /lookup apps <query>`n" -ForegroundColor Gray
}
