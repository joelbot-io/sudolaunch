<#
.SYNOPSIS
    Prunes and sanitizes SudoLaunch command execution history.

.DESCRIPTION
    Manages ~/.sudolaunch/history.json by pruning old entries, wiping execution logs,
    or scrubbing queries containing sensitive data (passwords, tokens, /pwd, /hash commands).

.PARAMETER KeepLast
    Number of most recent history entries to keep (e.g. -KeepLast 50).

.PARAMETER Days
    Removes entries older than the specified number of days (e.g. -Days 14).

.PARAMETER ScrubSensitive
    Detects and deletes history items associated with security commands (/pwd, /hash)
    or queries containing probable secrets, tokens, or passwords.

.PARAMETER ClearAll
    Completely wipes history.json to an empty array.

.PARAMETER DryRun
    Previews the changes without modifying history.json.

.PARAMETER ProfileDir
    Path to SudoLaunch profile directory. Defaults to ~/.sudolaunch.

.EXAMPLE
    .\scripts\clean-history.ps1 -ScrubSensitive

.EXAMPLE
    .\scripts\clean-history.ps1 -KeepLast 25

.EXAMPLE
    .\scripts\clean-history.ps1 -ClearAll -DryRun
#>

[CmdletBinding()]
param(
    [Parameter()]
    [int]$KeepLast = 0,

    [Parameter()]
    [int]$Days = 0,

    [Parameter()]
    [switch]$ScrubSensitive,

    [Parameter()]
    [switch]$ClearAll,

    [Parameter()]
    [switch]$DryRun,

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
Write-Host "         SudoLaunch History Privacy & Pruning Tool      " -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Magenta

$historyPath = Join-Path $ProfileDir "history.json"

if (-not (Test-Path $historyPath)) {
    Write-WarningMsg "history.json not found in $ProfileDir. Nothing to clean."
    exit 0
}

$raw = [System.IO.File]::ReadAllText($historyPath, [System.Text.Encoding]::UTF8)
$history = @()
try {
    if (-not [string]::IsNullOrWhiteSpace($raw)) {
        $parsed = $raw | ConvertFrom-Json
        $history = @($parsed)
    }
} catch {
    Write-WarningMsg "Could not parse history.json: $_"
    exit 1
}

$initialCount = $history.Count
$initialBytes = (Get-Item $historyPath).Length
Write-Step "Current history contains $initialCount records ($([Math]::Round($initialBytes / 1KB, 1)) KB)"

if ($ClearAll) {
    Write-WarningMsg "Option -ClearAll selected: All history will be deleted."
    $history = @()
} else {
    # 1. Scrub Sensitive Commands & Queries
    if ($ScrubSensitive) {
        Write-Step "Scrubbing sensitive commands and potential credential queries..."
        $sensitiveCommands = @("pwd", "hash")
        $filtered = @()
        $scrubbedCount = 0

        foreach ($entry in $history) {
            $isSensitive = $false
            if ($sensitiveCommands -contains $entry.command) {
                $isSensitive = $true
            } elseif ($entry.query -match '(?i)(token|bearer|password|secret|apikey|api_key|auth|passphrase)') {
                $isSensitive = $true
            } elseif ($entry.query -match '^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$') {
                # JWT token pattern
                $isSensitive = $true
            }

            if ($isSensitive) {
                $scrubbedCount++
            } else {
                $filtered += $entry
            }
        }

        Write-Host "  [-] Identified $scrubbedCount sensitive record(s)." -ForegroundColor Yellow
        $history = $filtered
    }

    # 2. Filter by Age (Days)
    if ($Days -gt 0) {
        Write-Step "Filtering records older than $Days day(s)..."
        $cutoff = (Get-Date).AddDays(-$Days)
        $filtered = @()
        $agedCount = 0

        foreach ($entry in $history) {
            $entryDate = [DateTime]::MinValue
            if ($entry.timestamp -and [DateTime]::TryParse($entry.timestamp, [ref]$entryDate)) {
                if ($entryDate -ge $cutoff) {
                    $filtered += $entry
                } else {
                    $agedCount++
                }
            } else {
                # Keep if no parsable timestamp
                $filtered += $entry
            }
        }

        Write-Host "  [-] Filtered $agedCount record(s) older than $Days days." -ForegroundColor Gray
        $history = $filtered
    }

    # 3. Cap by KeepLast
    if ($KeepLast -gt 0 -and $history.Count -gt $KeepLast) {
        Write-Step "Capping history to most recent $KeepLast record(s)..."
        $cappedCount = $history.Count - $KeepLast
        $history = @($history | Select-Object -First $KeepLast)
        Write-Host "  [-] Truncated $cappedCount older record(s)." -ForegroundColor Gray
    }
}

$removedCount = $initialCount - $history.Count

if ($DryRun) {
    Write-Host ""
    Write-WarningMsg "[DRY RUN] No files modified."
    Write-Host "  Records that would be removed: $removedCount" -ForegroundColor Yellow
    Write-Host "  Records that would remain:     $($history.Count)" -ForegroundColor Green
    Write-Host ""
    exit 0
}

# Write back to history.json
$jsonOut = $history | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($historyPath, $jsonOut, [System.Text.Encoding]::UTF8)

$finalBytes = (Get-Item $historyPath).Length
Write-Host ""
Write-Success "History cleaning complete!"
Write-Host "  Removed:  $removedCount record(s)" -ForegroundColor Yellow
Write-Host "  Retained: $($history.Count) record(s)" -ForegroundColor Green
Write-Host "  New Size: $([Math]::Round($finalBytes / 1KB, 1)) KB (was $([Math]::Round($initialBytes / 1KB, 1)) KB)" -ForegroundColor White
Write-Host ""
