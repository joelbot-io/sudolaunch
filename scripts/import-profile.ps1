<#
.SYNOPSIS
    Imports a portable SudoLaunch profile bundle (.zip) with automatic safety backups and merge/replace options.

.DESCRIPTION
    Extracts and imports configuration, commands, snippets, lookup tables, and links from a bundle
    created by export-profile.ps1. Supports non-destructive merging (default) or complete replacement.
    Automatically takes a safety snapshot in ~/.sudolaunch-archives before applying changes.

.PARAMETER BundlePath
    Path to the portable bundle ZIP file to import.

.PARAMETER ProfileDir
    Target SudoLaunch profile directory. Defaults to ~/.sudolaunch.

.PARAMETER Replace
    Completely replaces existing files with bundle contents instead of merging.

.PARAMETER NoSafetyBackup
    Skips automatic pre-import safety backup.

.PARAMETER DryRun
    Simulates the import and reports what would change without modifying files.

.EXAMPLE
    .\scripts\import-profile.ps1 -BundlePath ".\sudolaunch-portable-bundle.zip"

.EXAMPLE
    .\scripts\import-profile.ps1 -BundlePath ".\team-tools.zip" -Replace
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0, Mandatory = $true)]
    [string]$BundlePath,

    [Parameter()]
    [string]$ProfileDir = (Join-Path $env:USERPROFILE ".sudolaunch"),

    [Parameter()]
    [switch]$Replace,

    [Parameter()]
    [switch]$NoSafetyBackup,

    [Parameter()]
    [switch]$DryRun
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

function Read-JsonSafely([string]$filePath) {
    if (-not (Test-Path $filePath)) { return $null }
    try {
        $raw = Get-Content -Path $filePath -Raw -Encoding UTF8
        if ([string]::IsNullOrWhiteSpace($raw)) { return @() }
        $parsed = $raw | ConvertFrom-Json
        return ,@($parsed)
    } catch {
        Write-WarningMsg "Failed to parse JSON file $filePath`: $_"
        return $null
    }
}

Write-Host "`n========================================================" -ForegroundColor Magenta
Write-Host "         SudoLaunch Portable Profile Importer           " -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Magenta

# 1. Resolve paths
$resolvedBundle = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($BundlePath)
if (-not (Test-Path $resolvedBundle)) {
    Write-ErrorMsg "Bundle file not found: $resolvedBundle"
    exit 1
}

$resolvedProfile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ProfileDir)

if ($DryRun) {
    Write-WarningMsg "DRY-RUN MODE: No files will be modified.`n"
}

# 2. Check running processes
$runningProcesses = @(Get-Process -Name "sudolaunch", "electron" -ErrorAction SilentlyContinue |
    Where-Object {
        try {
            $_.Path -and ($_.Path -like "*sudolaunch*" -or $_.Path -like "*electron*")
        } catch { $false }
    })

if ($runningProcesses.Count -gt 0) {
    Write-WarningMsg "SudoLaunch appears to be currently running ($($runningProcesses.Count) process(es))."
    Write-WarningMsg "File locks may prevent updating active profile data."
    if (-not $DryRun) {
        $confirm = Read-Host "Proceed anyway? (y/N)"
        if ($confirm -ne "y" -and $confirm -ne "Y") {
            Write-Host "Import cancelled." -ForegroundColor Gray
            exit 0
        }
    }
}

# 3. Extract bundle to temporary staging area
$tempExtractDir = Join-Path ([System.IO.Path]::GetTempPath()) ("sudolaunch-import-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -Path $tempExtractDir -ItemType Directory -Force | Out-Null

try {
    Write-Step "Extracting bundle for inspection: $resolvedBundle"
    Expand-Archive -Path $resolvedBundle -DestinationPath $tempExtractDir -Force

    $manifestPath = Join-Path $tempExtractDir "bundle-manifest.json"
    if (Test-Path $manifestPath) {
        try {
            $manifest = Get-Content -Path $manifestPath -Raw | ConvertFrom-Json
            Write-Host "  Bundle Type:   $($manifest.BundleType)" -ForegroundColor White
            Write-Host "  Exported By:   $($manifest.ExportedBy) on $($manifest.ComputerName)" -ForegroundColor Gray
            Write-Host "  Export Date:   $($manifest.ExportDate)" -ForegroundColor Gray
            Write-Host "  Sanitized:     $($manifest.Sanitized)" -ForegroundColor Gray
        } catch {}
    } else {
        Write-WarningMsg "Bundle does not contain bundle-manifest.json (legacy or raw backup)."
    }

    # 4. Pre-import safety backup
    if ((Test-Path $resolvedProfile) -and (-not $NoSafetyBackup) -and (-not $DryRun)) {
        Write-Step "Creating automatic pre-import safety backup..."
        $archiveDir = Join-Path $env:USERPROFILE ".sudolaunch-archives"
        if (-not (Test-Path $archiveDir)) {
            New-Item -Path $archiveDir -ItemType Directory -Force | Out-Null
        }
        $timestamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
        $safetyZip = Join-Path $archiveDir "pre-import-safety-$timestamp.zip"
        Compress-Archive -Path (Join-Path $resolvedProfile "*") -DestinationPath $safetyZip -CompressionLevel Optimal
        Write-Success "Pre-import safety snapshot saved: $safetyZip"
    }

    if (-not (Test-Path $resolvedProfile) -and -not $DryRun) {
        New-Item -Path $resolvedProfile -ItemType Directory -Force | Out-Null
    }

    # 5. Import Execution
    $mode = if ($Replace) { "REPLACE (Overwrite)" } else { "MERGE (Non-destructive)" }
    Write-Step "Executing import in $mode mode..."

    $stats = [PSCustomObject]@{
        FilesCopied    = 0
        ItemsMerged    = 0
        CommandsAdded  = 0
        LookupsAdded   = 0
    }

    if ($Replace) {
        # Replace mode: copy everything from bundle directly into profile
        $items = Get-ChildItem -Path $tempExtractDir | Where-Object { $_.Name -ne "bundle-manifest.json" }
        foreach ($item in $items) {
            $destPath = Join-Path $resolvedProfile $item.Name
            Write-Host "  [>] Overwriting: $($item.Name)" -ForegroundColor Gray
            if (-not $DryRun) {
                if ($item.PSIsContainer) {
                    if (Test-Path $destPath) {
                        Remove-Item -Path $destPath -Recurse -Force
                    }
                    Copy-Item -Path $item.FullName -Destination $destPath -Recurse -Force
                } else {
                    Copy-Item -Path $item.FullName -Destination $destPath -Force
                }
            }
            $stats.FilesCopied++
        }
    } else {
        # Merge mode: intelligent non-destructive merge

        # A. Merge array JSON files (snippets, links, teamLinks)
        $arrayFiles = @(
            @{ File = "snippets.json"; Key = "name" },
            @{ File = "links.json"; Key = "name" },
            @{ File = "teamLinks.json"; Key = "name" }
        )

        foreach ($af in $arrayFiles) {
            $fName = $af.File
            $keyProp = $af.Key
            $bundleFile = Join-Path $tempExtractDir $fName
            $targetFile = Join-Path $resolvedProfile $fName

            if (Test-Path $bundleFile) {
                $bundleData = Read-JsonSafely $bundleFile
                if ($null -ne $bundleData) {
                    if (-not (Test-Path $targetFile)) {
                        Write-Host "  [+] Creating $fName with $($bundleData.Count) items" -ForegroundColor White
                        if (-not $DryRun) {
                            Copy-Item -Path $bundleFile -Destination $targetFile -Force
                        }
                        $stats.ItemsMerged += $bundleData.Count
                    } else {
                        $existingData = Read-JsonSafely $targetFile
                        $existingList = if ($existingData) { [System.Collections.ArrayList]@($existingData) } else { [System.Collections.ArrayList]@() }

                        $existingKeys = @{}
                        foreach ($it in $existingList) {
                            $k = if ($it.PSObject.Properties[$keyProp]) { "$($it.$keyProp)".Trim().ToLower() } else { "$it" }
                            if ($k) { $existingKeys[$k] = $true }
                        }

                        $addedCount = 0
                        foreach ($newItem in $bundleData) {
                            $nk = if ($newItem.PSObject.Properties[$keyProp]) { "$($newItem.$keyProp)".Trim().ToLower() } else { "$newItem" }
                            if (-not $existingKeys.ContainsKey($nk)) {
                                $existingList.Add($newItem) | Out-Null
                                $existingKeys[$nk] = $true
                                $addedCount++
                            }
                        }

                        Write-Host "  [+] $fName`: merged $addedCount new entries (total now $($existingList.Count))" -ForegroundColor White
                        if (-not $DryRun -and $addedCount -gt 0) {
                            $existingList | ConvertTo-Json -Depth 10 | Set-Content -Path $targetFile -Encoding UTF8
                        }
                        $stats.ItemsMerged += $addedCount
                    }
                }
            }
        }

        # B. Merge contacts.json
        $bundleContacts = Join-Path $tempExtractDir "contacts.json"
        $targetContacts = Join-Path $resolvedProfile "contacts.json"
        if (Test-Path $bundleContacts) {
            $bcData = Read-JsonSafely $bundleContacts
            if ($null -ne $bcData) {
                if (-not (Test-Path $targetContacts)) {
                    Write-Host "  [+] Creating contacts.json with $($bcData.Count) records" -ForegroundColor White
                    if (-not $DryRun) { Copy-Item -Path $bundleContacts -Destination $targetContacts -Force }
                    $stats.ItemsMerged += $bcData.Count
                } else {
                    $tcData = Read-JsonSafely $targetContacts
                    $tcList = if ($tcData) { [System.Collections.ArrayList]@($tcData) } else { [System.Collections.ArrayList]@() }
                    $contactKeys = @{}
                    foreach ($c in $tcList) {
                        $ck = if ($c.email) { "$($c.email)".ToLower() } else { "$($c.name)".ToLower() }
                        if ($ck) { $contactKeys[$ck] = $true }
                    }
                    $cAdded = 0
                    foreach ($c in $bcData) {
                        $ck = if ($c.email) { "$($c.email)".ToLower() } else { "$($c.name)".ToLower() }
                        if (-not $contactKeys.ContainsKey($ck)) {
                            $tcList.Add($c) | Out-Null
                            $contactKeys[$ck] = $true
                            $cAdded++
                        }
                    }
                    Write-Host "  [+] contacts.json: merged $cAdded new contacts" -ForegroundColor White
                    if (-not $DryRun -and $cAdded -gt 0) {
                        $tcList | ConvertTo-Json -Depth 10 | Set-Content -Path $targetContacts -Encoding UTF8
                    }
                    $stats.ItemsMerged += $cAdded
                }
            }
        }

        # C. Merge settings.json (preserve local settings, add missing keys)
        $bundleSettings = Join-Path $tempExtractDir "settings.json"
        $targetSettings = Join-Path $resolvedProfile "settings.json"
        if (Test-Path $bundleSettings) {
            if (-not (Test-Path $targetSettings)) {
                Write-Host "  [+] Creating settings.json from bundle" -ForegroundColor White
                if (-not $DryRun) { Copy-Item -Path $bundleSettings -Destination $targetSettings -Force }
            } else {
                try {
                    $bs = Get-Content -Path $bundleSettings -Raw | ConvertFrom-Json
                    $ts = Get-Content -Path $targetSettings -Raw | ConvertFrom-Json
                    $updated = $false

                    foreach ($prop in $bs.PSObject.Properties) {
                        if (-not $ts.PSObject.Properties[$prop.Name]) {
                            $ts | Add-Member -MemberType NoteProperty -Name $prop.Name -Value $prop.Value
                            $updated = $true
                        }
                    }

                    if ($updated -and -not $DryRun) {
                        $ts | ConvertTo-Json -Depth 10 | Set-Content -Path $targetSettings -Encoding UTF8
                        Write-Host "  [+] settings.json: populated missing default configuration keys" -ForegroundColor White
                    }
                } catch {}
            }
        }

        # D. Merge directories: commands, lookup, maintenance, gif
        $dirsToMerge = @("commands", "lookup", "maintenance", "gif")
        foreach ($dirName in $dirsToMerge) {
            $bundleSub = Join-Path $tempExtractDir $dirName
            $targetSub = Join-Path $resolvedProfile $dirName

            if (Test-Path $bundleSub) {
                if (-not (Test-Path $targetSub) -and -not $DryRun) {
                    New-Item -Path $targetSub -ItemType Directory -Force | Out-Null
                }

                $files = Get-ChildItem -Path $bundleSub -Recurse -File
                foreach ($f in $files) {
                    $relPath = $f.FullName.Substring($bundleSub.Length).TrimStart("\", "/")
                    $destFile = Join-Path $targetSub $relPath
                    $destFolder = Split-Path -Parent $destFile

                    if (-not (Test-Path $destFile)) {
                        Write-Host "  [+] New $dirName file: $relPath" -ForegroundColor White
                        if (-not $DryRun) {
                            if (-not (Test-Path $destFolder)) {
                                New-Item -Path $destFolder -ItemType Directory -Force | Out-Null
                            }
                            Copy-Item -Path $f.FullName -Destination $destFile -Force
                        }
                        if ($dirName -eq "commands") { $stats.CommandsAdded++ }
                        elseif ($dirName -eq "lookup") { $stats.LookupsAdded++ }
                        $stats.FilesCopied++
                    }
                }
            }
        }
    }

    Write-Host ""
    Write-Success "Bundle imported successfully!"
    Write-Host "  Mode:              $mode" -ForegroundColor White
    Write-Host "  Files Processed:   $($stats.FilesCopied)" -ForegroundColor Green
    Write-Host "  Entries Merged:    $($stats.ItemsMerged)" -ForegroundColor Green
    Write-Host "  Commands Added:    $($stats.CommandsAdded)" -ForegroundColor Green
    Write-Host "  Lookups Added:     $($stats.LookupsAdded)" -ForegroundColor Green
    Write-Host ""

    # 6. Optional profile validation
    $validatorScript = Join-Path $PSScriptRoot "validate-profile.ps1"
    if ((Test-Path $validatorScript) -and (-not $DryRun)) {
        Write-Step "Running health check on updated profile..."
        & $validatorScript -ProfileDir $resolvedProfile -Fix
    }
}
finally {
    if (Test-Path $tempExtractDir) {
        Remove-Item -Path $tempExtractDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
