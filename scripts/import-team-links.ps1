<#
.SYNOPSIS
    Imports Teams channels, contacts, or links from CSV or JSON into SudoLaunch profile.

.DESCRIPTION
    Parses enterprise exports (CSV, TSV, or JSON) of Microsoft Teams channels, employee directories,
    or bookmark lists and imports/merges them into ~/.sudolaunch/teamLinks.json, contacts.json,
    or links.json. Supports auto-mapping columns (DisplayName, WebUrl, Description, Email, etc.).

.PARAMETER SourcePath
    Path to the source CSV or JSON file. Defaults to .\resources\team_list.csv if present.

.PARAMETER Target
    Target configuration collection: 'teamLinks' (default), 'contacts', or 'links'.

.PARAMETER Replace
    Overwrites the target collection instead of merging with existing entries.

.PARAMETER ProfileDir
    Path to SudoLaunch profile directory. Defaults to ~/.sudolaunch.

.EXAMPLE
    .\scripts\import-team-links.ps1

.EXAMPLE
    .\scripts\import-team-links.ps1 -SourcePath ".\my-teams.csv" -Target "teamLinks"

.EXAMPLE
    .\scripts\import-team-links.ps1 -SourcePath ".\employees.csv" -Target "contacts"
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$SourcePath = "",

    [Parameter()]
    [ValidateSet("teamLinks", "contacts", "links")]
    [string]$Target = "teamLinks",

    [Parameter()]
    [switch]$Replace,

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

function Write-ErrorMsg([string]$message) {
    Write-Host " [X] $message" -ForegroundColor Red
}

Write-Host "`n========================================================" -ForegroundColor Magenta
Write-Host "         SudoLaunch Data & Team Links Importer          " -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Magenta

# 1. Resolve Source Path
if (-not $SourcePath) {
    $defaultCandidate = Join-Path $PSScriptRoot "..\resources\team_list.csv"
    if (Test-Path $defaultCandidate) {
        $SourcePath = $defaultCandidate
    } else {
        Write-ErrorMsg "No SourcePath specified and default resources\team_list.csv not found."
        exit 1
    }
}

if (-not (Test-Path $SourcePath)) {
    Write-ErrorMsg "Source file not found: $SourcePath"
    exit 1
}

$resolvedSource = (Get-Item $SourcePath).FullName
Write-Step "Reading source: $resolvedSource"
Write-Step "Target collection: $Target"

# 2. Parse Source Records (Auto-detect JSON array vs delimited CSV)
$rawContent = [System.IO.File]::ReadAllText($resolvedSource, [System.Text.Encoding]::UTF8).Trim()
$importedRecords = @()

if ($rawContent.StartsWith("[") -or $rawContent.StartsWith("{")) {
    Write-Step "Detected JSON data format..."
    try {
        $parsed = $rawContent | ConvertFrom-Json
        $importedRecords = @($parsed)
    } catch {
        Write-ErrorMsg "Failed to parse JSON content: $_"
        exit 1
    }
} else {
    Write-Step "Detected CSV/delimited data format..."
    try {
        $importedRecords = @(Import-Csv -Path $resolvedSource)
    } catch {
        Write-ErrorMsg "Failed to parse CSV content: $_"
        exit 1
    }
}

Write-Host "  Loaded $($importedRecords.Count) raw record(s) from source." -ForegroundColor Gray

# 3. Transform Records According to Target Type
$standardizedItems = @()

switch ($Target) {
    "teamLinks" {
        foreach ($r in $importedRecords) {
            $name = if ($r.DisplayName) { $r.DisplayName } elseif ($r.name) { $r.name } elseif ($r.Title) { $r.Title } else { "" }
            $url = if ($r.WebUrl) { $r.WebUrl } elseif ($r.url) { $r.url } elseif ($r.Link) { $r.Link } else { "" }
            $desc = if ($r.Description) { $r.Description } elseif ($r.description) { $r.description } else { "" }

            if ($name -and $url) {
                $standardizedItems += [PSCustomObject]@{
                    name        = [string]$name.Trim()
                    url         = [string]$url.Trim()
                    description = [string]$desc.Trim()
                }
            }
        }
    }
    "contacts" {
        foreach ($r in $importedRecords) {
            $name = if ($r.DisplayName) { $r.DisplayName } elseif ($r.name) { $r.name } elseif ($r.FullName) { $r.FullName } else { "" }
            $email = if ($r.email) { $r.email } elseif ($r.EmailAddress) { $r.EmailAddress } elseif ($r.Mail) { $r.Mail } else { "" }
            $teamsId = if ($r.teamsId) { $r.teamsId } elseif ($email) { $email } else { "" }
            $alias = if ($r.alias) { $r.alias } elseif ($email) { $email.Split('@')[0].ToLower() } else { $name.ToLower() -replace '\s+', '.' }

            if ($name -and ($email -or $teamsId)) {
                $standardizedItems += [PSCustomObject]@{
                    name    = [string]$name.Trim()
                    alias   = [string]$alias.Trim()
                    email   = [string]$email.Trim()
                    teamsId = [string]$teamsId.Trim()
                }
            }
        }
    }
    "links" {
        foreach ($r in $importedRecords) {
            $name = if ($r.name) { $r.name } elseif ($r.DisplayName) { $r.DisplayName } elseif ($r.Title) { $r.Title } else { "" }
            $url = if ($r.url) { $r.url } elseif ($r.WebUrl) { $r.WebUrl } elseif ($r.Link) { $r.Link } else { "" }

            if ($name -and $url) {
                $standardizedItems += [PSCustomObject]@{
                    name = [string]$name.Trim()
                    url  = [string]$url.Trim()
                }
            }
        }
    }
}

Write-Step "Transformed into $($standardizedItems.Count) valid $Target item(s)."

# 4. Load Existing Target File
$targetFile = Join-Path $ProfileDir "$Target.json"
$existingItems = @()

if ((Test-Path $targetFile) -and (-not $Replace)) {
    try {
        $existingRaw = [System.IO.File]::ReadAllText($targetFile, [System.Text.Encoding]::UTF8)
        if (-not [string]::IsNullOrWhiteSpace($existingRaw)) {
            $existingItems = @($existingRaw | ConvertFrom-Json)
        }
    } catch {
        Write-WarningMsg "Could not parse existing $Target.json, will replace with imported entries."
    }
}

# 5. Merge or Replace
$finalItems = @()
$addedCount = 0
$updatedCount = 0

if ($Replace -or $existingItems.Count -eq 0) {
    $finalItems = $standardizedItems
    $addedCount = $standardizedItems.Count
} else {
    # Index existing by name
    $dict = [System.Collections.Generic.Dictionary[string, object]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($item in $existingItems) {
        if ($item.name) {
            $dict[$item.name] = $item
        }
    }

    foreach ($item in $standardizedItems) {
        if ($dict.ContainsKey($item.name)) {
            $dict[$item.name] = $item
            $updatedCount++
        } else {
            $dict[$item.name] = $item
            $addedCount++
        }
    }

    $finalItems = @($dict.Values)
}

# 6. Save Target File
if (-not (Test-Path $ProfileDir)) {
    New-Item -Path $ProfileDir -ItemType Directory -Force | Out-Null
}

$outputJson = $finalItems | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($targetFile, $outputJson, [System.Text.Encoding]::UTF8)

Write-Host ""
Write-Success "Import completed successfully!"
Write-Host "  Target File:     $targetFile" -ForegroundColor White
Write-Host "  Records Added:   $addedCount" -ForegroundColor Green
Write-Host "  Records Updated: $updatedCount" -ForegroundColor Yellow
Write-Host "  Total In File:   $($finalItems.Count)" -ForegroundColor White
Write-Host ""
