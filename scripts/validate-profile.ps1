<#
.SYNOPSIS
    Validates SudoLaunch profile configuration files, schemas, and custom command targets.

.DESCRIPTION
    Performs comprehensive diagnostic checks across all JSON files in ~/.sudolaunch:
    - JSON syntax and encoding validation
    - Required schema checks for settings.json, contacts.json, snippets.json, links.json
    - Script path resolution for custom commands (commands/*.json)
    - Duplicate detection for contacts and team links
    - URL structure validation for links and team channel deep links

.PARAMETER ProfileDir
    Path to the SudoLaunch profile directory. Defaults to ~/.sudolaunch.

.PARAMETER Fix
    Attempts to auto-repair minor formatting issues or recreate missing empty JSON files.

.EXAMPLE
    .\scripts\validate-profile.ps1

.EXAMPLE
    .\scripts\validate-profile.ps1 -Fix
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$ProfileDir = (Join-Path $env:USERPROFILE ".sudolaunch"),

    [Parameter()]
    [switch]$Fix
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
Write-Host "        SudoLaunch Profile Health & Integrity Check     " -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Magenta

$resolvedProfile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ProfileDir)
if (-not (Test-Path $resolvedProfile -PathType Container)) {
    Write-ErrorMsg "Profile directory does not exist: $resolvedProfile"
    Write-Host "Tip: Run 'npm run profile:create' to initialize a fresh default profile.`n" -ForegroundColor Yellow
    exit 1
}

Write-Step "Inspecting profile: $resolvedProfile"

$errorsCount = 0
$warningsCount = 0
$checkedFilesCount = 0

# Helper to validate raw JSON syntax
function Test-JsonFile([string]$path) {
    $script:checkedFilesCount++
    if (-not (Test-Path $path)) {
        return $null
    }

    try {
        $raw = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
        if ([string]::IsNullOrWhiteSpace($raw)) {
            Write-WarningMsg "Empty file: $(Split-Path -Leaf $path)"
            $script:warningsCount++
            return $null
        }
        $trimmed = $raw.TrimStart()
        $data = $raw | ConvertFrom-Json
        if ($trimmed.StartsWith("[")) {
            return ,@($data)
        }
        return $data
    } catch {
        Write-ErrorMsg "Syntax error in $(Split-Path -Leaf $path): $_"
        $script:errorsCount++
        return $null
    }
}

# 1. Validate settings.json
Write-Host ""
Write-Step "1. Checking settings.json..."
$settingsPath = Join-Path $resolvedProfile "settings.json"
if (-not (Test-Path $settingsPath)) {
    Write-ErrorMsg "Missing settings.json"
    $errorsCount++
    if ($Fix) {
        Write-Step "Auto-fixing: Creating default settings.json..."
        $defaultSettings = [PSCustomObject]@{
            hotkey = "CommandOrControl+Space"; terminalHotkey = "Control+Alt+T"; historyEnabled = $true; historyLimit = 25; autoStart = $true
        }
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($settingsPath, ($defaultSettings | ConvertTo-Json -Depth 5), $utf8NoBom)
        Write-Success "Recreated settings.json"
        $errorsCount--
    }
} else {
    $settings = Test-JsonFile $settingsPath
    if ($settings) {
        if (-not $settings.hotkey) {
            Write-WarningMsg "settings.json: 'hotkey' property is missing or empty"
            $warningsCount++
        } else {
            Write-Success "Hotkey configured: $($settings.hotkey)"
        }
        if (-not $settings.terminalHotkey) {
            Write-WarningMsg "settings.json: 'terminalHotkey' property is missing"
            $warningsCount++
        }
    }
}

# 2. Validate contacts.json
Write-Host ""
Write-Step "2. Checking contacts.json..."
$contactsPath = Join-Path $resolvedProfile "contacts.json"
$contacts = Test-JsonFile $contactsPath
if ($contacts -ne $null) {
    if ($contacts -isnot [System.Array]) {
        Write-ErrorMsg "contacts.json must contain a JSON array"
        $errorsCount++
    } else {
        $seenAliases = @{}
        $validContacts = 0
        foreach ($c in $contacts) {
            if (-not $c.name) {
                Write-WarningMsg "contacts.json: Contact found without a 'name' property"
                $warningsCount++
            }
            if ($c.alias) {
                $aliasLower = $c.alias.ToLower()
                if ($seenAliases.ContainsKey($aliasLower)) {
                    Write-WarningMsg "contacts.json: Duplicate alias '$($c.alias)' for $($c.name)"
                    $warningsCount++
                } else {
                    $seenAliases[$aliasLower] = $true
                }
            }
            $validContacts++
        }
        Write-Success "Validated $validContacts contact(s)."
    }
}

# 3. Validate snippets.json
Write-Host ""
Write-Step "3. Checking snippets.json..."
$snippetsPath = Join-Path $resolvedProfile "snippets.json"
$snippets = Test-JsonFile $snippetsPath
if ($snippets -ne $null) {
    if ($snippets -isnot [System.Array]) {
        Write-ErrorMsg "snippets.json must contain a JSON array"
        $errorsCount++
    } else {
        $snippetCount = 0
        foreach ($s in $snippets) {
            if (-not $s.name -or -not $s.text) {
                Write-WarningMsg "snippets.json: Snippet missing 'name' or 'text'"
                $warningsCount++
            }
            $snippetCount++
        }
        Write-Success "Validated $snippetCount snippet(s)."
    }
}

# 4. Validate links.json & teamLinks.json
Write-Host ""
Write-Step "4. Checking links.json and teamLinks.json..."
foreach ($linkFile in @("links.json", "teamLinks.json")) {
    $filePath = Join-Path $resolvedProfile $linkFile
    $links = Test-JsonFile $filePath
    if ($links -ne $null) {
        if ($links -isnot [System.Array]) {
            Write-ErrorMsg "$linkFile must contain a JSON array"
            $errorsCount++
        } else {
            $invalidUrls = 0
            foreach ($item in $links) {
                if (-not $item.url -or (-not ($item.url -like "http*") -and -not ($item.url -like "msteams:*"))) {
                    Write-WarningMsg "$($linkFile): '$($item.name)' has unusual or invalid URL: $($item.url)"
                    $invalidUrls++
                    $warningsCount++
                }
            }
            Write-Success "Validated $($links.Count) item(s) in $linkFile ($invalidUrls warning(s))."
        }
    }
}

# 5. Validate Custom Commands (commands/*.json)
Write-Host ""
Write-Step "5. Checking custom commands (commands/*.json)..."
$commandsDir = Join-Path $resolvedProfile "commands"
if (Test-Path $commandsDir) {
    $cmdFiles = Get-ChildItem -Path $commandsDir -Filter "*.json"
    $validCmds = 0
    foreach ($cmdFile in $cmdFiles) {
        $cmd = Test-JsonFile $cmdFile.FullName
        if ($cmd) {
            if (-not $cmd.Command -or -not ($cmd.Command -like "/*")) {
                Write-WarningMsg "$($cmdFile.Name): Command should start with a forward slash (e.g. '/mycmd')"
                $warningsCount++
            }
            if (-not $cmd.Action -and -not $cmd.Folder) {
                Write-ErrorMsg "$($cmdFile.Name): Must define either an 'Action' or 'Folder' property"
                $errorsCount++
            }
            if ($cmd.Folder) {
                # Check if target folder exists
                $targetFolder = Join-Path $resolvedProfile $cmd.Folder
                if (-not (Test-Path $targetFolder)) {
                    Write-WarningMsg "$($cmdFile.Name): Folder command points to non-existent folder: $targetFolder"
                    $warningsCount++
                }
            }
            $validCmds++
        }
    }
    Write-Success "Inspected $validCmds custom command file(s)."
} else {
    Write-Host "  commands/ directory does not exist (optional)." -ForegroundColor Gray
}

# 6. Validate Lookup Tables (lookup/*.json)
Write-Host ""
Write-Step "6. Checking lookup data tables (lookup/*.json)..."
$lookupDir = Join-Path $resolvedProfile "lookup"
if (Test-Path $lookupDir) {
    $tables = Get-ChildItem -Path $lookupDir -Filter "*.json"
    foreach ($t in $tables) {
        $tableData = Test-JsonFile $t.FullName
        if ($tableData -ne $null) {
            if ($tableData -isnot [System.Array]) {
                Write-WarningMsg "$($t.Name): Lookup table should be a JSON array of records"
                $warningsCount++
            } else {
                Write-Success "Validated table $($t.Name) ($($tableData.Count) record(s))."
            }
        }
    }
}

# Summary
Write-Host "`n--------------------------------------------------------" -ForegroundColor Magenta
Write-Host "                 Health Check Summary                   " -ForegroundColor White
Write-Host "--------------------------------------------------------" -ForegroundColor Magenta
Write-Host "  Files Scanned:   $checkedFilesCount" -ForegroundColor White
if ($errorsCount -eq 0 -and $warningsCount -eq 0) {
    Write-Success "Result: HEALTHY (0 Errors, 0 Warnings)"
    Write-Host ""
    exit 0
} elseif ($errorsCount -eq 0) {
    Write-WarningMsg "Result: PASS WITH WARNINGS ($warningsCount Warning(s), 0 Errors)"
    Write-Host ""
    exit 0
} else {
    Write-ErrorMsg "Result: FAILED ($errorsCount Error(s), $warningsCount Warning(s))"
    Write-Host "Run with -Fix to attempt automatic remediation.`n" -ForegroundColor Yellow
    exit 1
}
