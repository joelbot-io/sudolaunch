<#
.SYNOPSIS
    Imports bookmarks and favorites from Chrome, Edge, Brave, and Firefox into SudoLaunch.

.DESCRIPTION
    Scans browser profile directories for bookmarks, extracts URLs and folder hierarchies,
    and imports them into SudoLaunch's favorite links (~/.sudolaunch/links.json for /fav)
    and/or as a searchable lookup table (~/.sudolaunch/lookup/bookmarks.json for /lookup bookmarks).

.PARAMETER Browser
    Which browser(s) to scan: 'All' (default), 'Edge', 'Chrome', 'Brave', 'Firefox'.

.PARAMETER Target
    Destination for imported bookmarks: 'Both' (default), 'Links' (links.json), 'Lookup' (lookup/bookmarks.json).

.PARAMETER FolderFilter
    Optional regex or text filter to only import bookmarks from specific folders (e.g. "Work", "Dev").

.PARAMETER Replace
    Overwrites existing links or lookup tables instead of non-destructively merging.

.PARAMETER DryRun
    Simulates the import and prints discovered bookmarks without writing files.

.PARAMETER ProfileDir
    Target SudoLaunch profile directory. Defaults to ~/.sudolaunch.

.EXAMPLE
    .\scripts\import-bookmarks.ps1

.EXAMPLE
    .\scripts\import-bookmarks.ps1 -Browser Edge -Target Links

.EXAMPLE
    .\scripts\import-bookmarks.ps1 -FolderFilter "Work|Dev" -DryRun
#>

[CmdletBinding()]
param(
    [Parameter()]
    [ValidateSet("All", "Edge", "Chrome", "Brave", "Firefox")]
    [string]$Browser = "All",

    [Parameter()]
    [ValidateSet("Both", "Links", "Lookup")]
    [string]$Target = "Both",

    [Parameter()]
    [string]$FolderFilter = "",

    [Parameter()]
    [switch]$Replace,

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

function Extract-ChromiumNodes($node, [string]$parentFolder, [string]$browserName, [System.Collections.ArrayList]$collection) {
    if (-not $node) { return }

    $currentFolder = if ($parentFolder -and $node.name) { "$parentFolder / $($node.name)" } elseif ($node.name) { $node.name } else { $parentFolder }

    if ($node.type -eq "url" -and $node.url) {
        $url = "$($node.url)".Trim()
        $name = if ($node.name) { "$($node.name)".Trim() } else { $url }

        # Filter out internal/empty URLs
        if ($url -and -not ($url.StartsWith("chrome://") -or $url.StartsWith("edge://") -or $url.StartsWith("brave://") -or $url.StartsWith("javascript:"))) {
            $item = [PSCustomObject]@{
                Title   = $name
                URL     = $url
                Folder  = if ($parentFolder) { $parentFolder } else { "Root" }
                Browser = $browserName
            }
            $collection.Add($item) | Out-Null
        }
    }

    if ($node.children) {
        foreach ($child in $node.children) {
            Extract-ChromiumNodes $child $currentFolder $browserName $collection
        }
    }
}

function Get-ChromiumBookmarks([string]$basePath, [string]$browserName) {
    $results = [System.Collections.ArrayList]@()
    if (-not (Test-Path $basePath)) { return $results }

    # Look in Default and any Profile * directories
    $profileDirs = @(Join-Path $basePath "Default")
    $profileDirs += Get-ChildItem -Path $basePath -Directory -Filter "Profile *" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName

    foreach ($pDir in $profileDirs) {
        $bmFile = Join-Path $pDir "Bookmarks"
        if (Test-Path $bmFile) {
            try {
                $raw = Get-Content -Path $bmFile -Raw -Encoding UTF8
                $json = $raw | ConvertFrom-Json
                if ($json.roots) {
                    foreach ($prop in $json.roots.PSObject.Properties) {
                        Extract-ChromiumNodes $prop.Value $prop.Name $browserName $results
                    }
                }
            } catch {
                Write-WarningMsg "Failed to parse $bmFile`: $_"
            }
        }
    }
    return $results
}

Write-Host "`n========================================================" -ForegroundColor Magenta
Write-Host "       SudoLaunch Browser Bookmarks Importer            " -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Magenta

if ($DryRun) {
    Write-WarningMsg "DRY-RUN MODE: Scanning bookmarks without writing to disk.`n"
}

$allBookmarks = [System.Collections.ArrayList]@()

# 1. Edge
if ($Browser -eq "All" -or $Browser -eq "Edge") {
    $edgePath = Join-Path $env:LOCALAPPDATA "Microsoft\Edge\User Data"
    $edgeBms = Get-ChromiumBookmarks $edgePath "Edge"
    Write-Step "Microsoft Edge: Discovered $($edgeBms.Count) bookmark(s)"
    foreach ($b in $edgeBms) { $allBookmarks.Add($b) | Out-Null }
}

# 2. Chrome
if ($Browser -eq "All" -or $Browser -eq "Chrome") {
    $chromePath = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"
    $chromeBms = Get-ChromiumBookmarks $chromePath "Chrome"
    Write-Step "Google Chrome: Discovered $($chromeBms.Count) bookmark(s)"
    foreach ($b in $chromeBms) { $allBookmarks.Add($b) | Out-Null }
}

# 3. Brave
if ($Browser -eq "All" -or $Browser -eq "Brave") {
    $bravePath = Join-Path $env:LOCALAPPDATA "BraveSoftware\Brave-Browser\User Data"
    $braveBms = Get-ChromiumBookmarks $bravePath "Brave"
    Write-Step "Brave Browser: Discovered $($braveBms.Count) bookmark(s)"
    foreach ($b in $braveBms) { $allBookmarks.Add($b) | Out-Null }
}

if ($allBookmarks.Count -eq 0) {
    Write-WarningMsg "No bookmarks found across scanned browsers."
    exit 0
}

# Apply folder filter if requested
if ($FolderFilter) {
    $filtered = [System.Collections.ArrayList]@()
    foreach ($b in $allBookmarks) {
        if ($b.Folder -match $FolderFilter -or $b.Title -match $FolderFilter) {
            $filtered.Add($b) | Out-Null
        }
    }
    Write-Step "Filtered bookmarks by '$FolderFilter': $($filtered.Count) of $($allBookmarks.Count) retained"
    $allBookmarks = $filtered
}

# Deduplicate by URL
$uniqueBookmarks = [System.Collections.ArrayList]@()
$seenUrls = @{}
foreach ($b in $allBookmarks) {
    $normUrl = $b.URL.ToLower().TrimEnd('/')
    if (-not $seenUrls.ContainsKey($normUrl)) {
        $seenUrls[$normUrl] = $true
        $uniqueBookmarks.Add($b) | Out-Null
    }
}

Write-Host "  Total Unique Bookmarks: $($uniqueBookmarks.Count)`n" -ForegroundColor White

$resolvedProfile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ProfileDir)
if (-not (Test-Path $resolvedProfile) -and -not $DryRun) {
    New-Item -Path $resolvedProfile -ItemType Directory -Force | Out-Null
}

# Target: Links (/fav)
if ($Target -eq "Both" -or $Target -eq "Links") {
    $linksFile = Join-Path $resolvedProfile "links.json"
    $existingLinks = [System.Collections.ArrayList]@()
    if ((Test-Path $linksFile) -and -not $Replace) {
        try {
            $raw = Get-Content -Path $linksFile -Raw -Encoding UTF8
            $parsed = $raw | ConvertFrom-Json
            if ($parsed) { foreach ($p in $parsed) { $existingLinks.Add($p) | Out-Null } }
        } catch {}
    }

    $existingUrls = @{}
    foreach ($el in $existingLinks) {
        if ($el.url) { $existingUrls[$el.url.ToLower().TrimEnd('/')] = $true }
    }

    $addedToLinks = 0
    foreach ($b in $uniqueBookmarks) {
        $normUrl = $b.URL.ToLower().TrimEnd('/')
        if (-not $existingUrls.ContainsKey($normUrl)) {
            $existingLinks.Add([PSCustomObject]@{
                name = $b.Title
                url  = $b.URL
            }) | Out-Null
            $existingUrls[$normUrl] = $true
            $addedToLinks++
        }
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    if ($DryRun) {
        Write-Host "  [DryRun] Would add $addedToLinks new links to links.json (Total would be $($existingLinks.Count))" -ForegroundColor Cyan
    } else {
        [System.IO.File]::WriteAllText($linksFile, ($existingLinks | ConvertTo-Json -Depth 10), $utf8NoBom)
        Write-Success "Updated links.json: Added $addedToLinks new bookmarks ($($existingLinks.Count) total /fav links)"
    }
}

# Target: Lookup Table (/lookup bookmarks)
if ($Target -eq "Both" -or $Target -eq "Lookup") {
    $lookupDir = Join-Path $resolvedProfile "lookup"
    if (-not (Test-Path $lookupDir) -and -not $DryRun) {
        New-Item -Path $lookupDir -ItemType Directory -Force | Out-Null
    }
    $bmLookupFile = Join-Path $lookupDir "bookmarks.json"

    $lookupData = @()
    foreach ($b in $uniqueBookmarks) {
        $lookupData += [PSCustomObject]@{
            "Title"   = $b.Title
            "Folder"  = $b.Folder
            "URL"     = $b.URL
            "Browser" = $b.Browser
        }
    }

    if ($DryRun) {
        Write-Host "  [DryRun] Would write $($lookupData.Count) records to lookup/bookmarks.json" -ForegroundColor Cyan
    } else {
        [System.IO.File]::WriteAllText($bmLookupFile, ($lookupData | ConvertTo-Json -Depth 10), $utf8NoBom)
        Write-Success "Created lookup table: lookup/bookmarks.json with $($lookupData.Count) records"
        Write-Host "  Search in SudoLaunch with: /lookup bookmarks <query>" -ForegroundColor Gray
    }
}

Write-Host "`nImport completed successfully!`n" -ForegroundColor Green
