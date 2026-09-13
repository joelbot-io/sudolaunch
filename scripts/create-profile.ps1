<#
.SYNOPSIS
    Creates and scaffolds a default SudoLaunch profile folder at a specified location.

.DESCRIPTION
    Initializes a complete, ready-to-use SudoLaunch profile directory at any target path
    (defaulting to ~/.sudolaunch). Creates all core configuration JSON files (settings,
    contacts, snippets, links, team links, history), subdirectories (commands, lookup,
    maintenance, gif), and working sample scripts.

.PARAMETER TargetDir
    The target directory path where the profile folder should be created.
    Defaults to ~/.sudolaunch ($env:USERPROFILE\.sudolaunch).

.PARAMETER Force
    Overwrites existing configuration files if they already exist in TargetDir.
    By default, existing files are preserved to prevent accidental data loss.

.PARAMETER Clean
    Empties the target directory before creating the fresh default profile.
    Requires confirmation unless -Force is specified.

.PARAMETER Minimal
    Creates minimal empty JSON arrays without seed sample contacts or sample custom commands.

.EXAMPLE
    .\scripts\create-profile.ps1

.EXAMPLE
    .\scripts\create-profile.ps1 -TargetDir "D:\Profiles\SudoLaunchWork"

.EXAMPLE
    .\scripts\create-profile.ps1 -TargetDir "C:\Testing\.sudolaunch-clean" -Clean -Force
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$TargetDir = (Join-Path $env:USERPROFILE ".sudolaunch"),

    [Parameter()]
    [switch]$Force,

    [Parameter()]
    [switch]$Clean,

    [Parameter()]
    [switch]$Minimal
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
Write-Host "        SudoLaunch Default Profile Generator           " -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Magenta

# 1. Resolve Target Directory Path
$resolvedTarget = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($TargetDir)
Write-Step "Target profile directory: $resolvedTarget"

# 2. Handle Clean Flag
if (Test-Path $resolvedTarget) {
    $existingItems = Get-ChildItem -Path $resolvedTarget -Recurse -File
    if ($existingItems.Count -gt 0) {
        if ($Clean) {
            if (-not $Force) {
                Write-WarningMsg "Target directory is not empty ($($existingItems.Count) files found)."
                $confirm = Read-Host "Are you sure you want to completely erase and recreate this profile? (y/N)"
                if ($confirm -notmatch '^[Yy]$') {
                    Write-Host "Operation cancelled." -ForegroundColor Yellow
                    exit 0
                }
            }
            Write-Step "Cleaning existing files in target directory..."
            Get-ChildItem -Path $resolvedTarget -Recurse | Remove-Item -Recurse -Force
            Write-Success "Target directory cleaned."
        } else {
            Write-Host "  Directory exists with $($existingItems.Count) files. Existing files will be preserved (use -Force to overwrite).`n" -ForegroundColor Gray
        }
    }
}

# 3. Create Required Directory Structure
$directories = @(
    $resolvedTarget,
    (Join-Path $resolvedTarget "commands"),
    (Join-Path $resolvedTarget "lookup"),
    (Join-Path $resolvedTarget "maintenance"),
    (Join-Path $resolvedTarget "gif")
)

foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        $null = New-Item -Path $dir -ItemType Directory -Force
        $leaf = Split-Path -Leaf $dir
        if (-not $leaf) { $leaf = $dir }
        Write-Step "Created directory: $leaf"
    }
}

# Helper to write JSON configuration files safely
function Write-ConfigFile([string]$filename, [object]$data, [string]$description) {
    $filePath = Join-Path $resolvedTarget $filename
    $alreadyExists = Test-Path $filePath

    if ($alreadyExists -and -not $Force) {
        Write-Host "  [-] Skipped existing: $filename ($description)" -ForegroundColor DarkGray
        return $false
    }

    $jsonContent = $data | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($filePath, $jsonContent, [System.Text.Encoding]::UTF8)
    $action = if ($alreadyExists) { "Overwrote" } else { "Created" }
    Write-Success "$action $filename - $description"
    return $true
}

# 4. Default Configurations
$defaultSettings = [PSCustomObject]@{
    hotkey                 = "CommandOrControl+Space"
    terminalHotkey         = "Control+Alt+T"
    historyEnabled         = $true
    historyLimit           = 25
    autoStart              = $true
    disableMouseInput      = $false
    defaultCommand         = ""
    disabledApps           = @()
    teamsShortcut          = "t"
    favShortcut            = "f"
    snippetShortcut        = "s"
    searchExcludedCommands = @()
    hiddenCommands         = @()
    gifFolder              = "gif"
    lookupFolder           = "lookup"
    barEnabled             = $true
    barPosition            = $null
    termPosition           = $null
    termWindowPosition     = $null
}

$defaultContacts = if ($Minimal) {
    @()
} else {
    @(
        [PSCustomObject]@{
            name    = "$env:USERNAME"
            alias   = "$env:USERNAME".ToLower()
            email   = "$env:USERNAME@example.com"
            teamsId = "$env:USERNAME@example.com"
        }
    )
}

$defaultSnippets = if ($Minimal) {
    @()
} else {
    @(
        [PSCustomObject]@{
            name = "Welcome / Hello"
            text = "Hello! Thanks for reaching out. Let me look into this right now."
        },
        [PSCustomObject]@{
            name = "Current Date ISO"
            text = (Get-Date -Format "yyyy-MM-dd")
        }
    )
}

$defaultLinks = if ($Minimal) {
    @()
} else {
    @(
        [PSCustomObject]@{
            name = "GitHub"
            url  = "https://github.com"
        },
        [PSCustomObject]@{
            name = "Microsoft 365 / Teams"
            url  = "https://teams.microsoft.com"
        }
    )
}

$defaultTeamLinks = @()
$defaultHistory = @()

Write-Host ""
Write-Step "Writing core configuration files..."
$null = Write-ConfigFile "settings.json" $defaultSettings "Core application preferences and hotkeys"
$null = Write-ConfigFile "contacts.json" $defaultContacts "Teams and Mail contact directory"
$null = Write-ConfigFile "snippets.json" $defaultSnippets "Quick text snippets for clipboard paste"
$null = Write-ConfigFile "links.json" $defaultLinks "Favorite bookmarks (/fav command)"
$null = Write-ConfigFile "teamLinks.json" $defaultTeamLinks "Direct channel deep links"
$null = Write-ConfigFile "history.json" $defaultHistory "Execution history records"

# 5. Sample Commands and Maintenance Scripts
if (-not $Minimal) {
    Write-Host ""
    Write-Step "Writing sample custom commands and scripts..."

    # /example command
    $exampleCommand = [PSCustomObject]@{
        Command = "/example"
        Action  = "Invoke-WebRequest 'https://www.google.com'"
    }
    $exampleCmdPath = Join-Path $resolvedTarget "commands\example.json"
    if (-not (Test-Path $exampleCmdPath) -or $Force) {
        $exampleCommand | ConvertTo-Json -Depth 5 | Set-Content -Path $exampleCmdPath -Encoding UTF8
        Write-Success "Created commands\example.json - Custom /example action command"
    }

    # /maint folder command
    $maintCommand = [PSCustomObject]@{
        Command = "/maint"
        Label   = "Maintenance"
        Folder  = "maintenance"
    }
    $maintCmdPath = Join-Path $resolvedTarget "commands\maint.json"
    if (-not (Test-Path $maintCmdPath) -or $Force) {
        $maintCommand | ConvertTo-Json -Depth 5 | Set-Content -Path $maintCmdPath -Encoding UTF8
        Write-Success "Created commands\maint.json - Folder-browser custom command (/maint)"
    }

    # maintenance script
    $maintScriptLines = @(
        '# SudoLaunch Maintenance Task - Update PowerShell Modules',
        '# Run via SudoLaunch using: /maint example-update-modules',
        'Get-Module -ListAvailable | ForEach-Object { Update-Module -Name $_.Name -Force -ErrorAction SilentlyContinue }',
        'Write-Host "Module update check complete." -ForegroundColor Green'
    )
    $maintScriptContent = $maintScriptLines -join "`r`n"
    $maintScriptPath = Join-Path $resolvedTarget "maintenance\example-update-modules.ps1"
    if (-not (Test-Path $maintScriptPath) -or $Force) {
        [System.IO.File]::WriteAllText($maintScriptPath, $maintScriptContent, [System.Text.Encoding]::UTF8)
        Write-Success "Created maintenance\example-update-modules.ps1 - Sample PowerShell maintenance task"
    }

    # sample lookup table
    $lookupSample = @(
        [PSCustomObject]@{
            "System"      = "Production API Gateway"
            "Status"      = "Healthy"
            "Endpoint"    = "https://api.example.com"
            "Environment" = "Production"
        },
        [PSCustomObject]@{
            "System"      = "Staging Auth Cluster"
            "Status"      = "Maintenance"
            "Endpoint"    = "https://auth-stage.example.com"
            "Environment" = "Staging"
        }
    )
    $lookupSamplePath = Join-Path $resolvedTarget "lookup\systems.json"
    if (-not (Test-Path $lookupSamplePath) -or $Force) {
        $lookupSample | ConvertTo-Json -Depth 5 | Set-Content -Path $lookupSamplePath -Encoding UTF8
        Write-Success "Created lookup\systems.json - Sample searchable data table (/lookup systems)"
    }
}

# 6. Profile Metadata
$metadata = [PSCustomObject]@{
    ProfileVersion = "1.0"
    CreatedDate    = (Get-Date).ToString("o")
    CreatedBy      = "$env:USERDOMAIN\$env:USERNAME"
    ComputerName   = $env:COMPUTERNAME
    TargetDir      = $resolvedTarget
    Minimal        = [bool]$Minimal
}
$metaPath = Join-Path $resolvedTarget "profile-metadata.json"
$metadata | ConvertTo-Json -Depth 5 | Set-Content -Path $metaPath -Encoding UTF8

# 7. Summary Report
$allFinalFiles = Get-ChildItem -Path $resolvedTarget -Recurse -File
$totalBytes = ($allFinalFiles | Measure-Object -Property Length -Sum).Sum
$totalKb = [Math]::Round($totalBytes / 1KB, 2)

Write-Host ""
Write-Success "Profile initialized successfully!"
Write-Host "  Location:      $resolvedTarget" -ForegroundColor White
Write-Host "  Total Files:   $($allFinalFiles.Count) files ($($totalKb) KB)" -ForegroundColor White
Write-Host "  Directories:   commands, lookup, maintenance, gif" -ForegroundColor Gray
Write-Host ""
Write-Host "To use this profile with SudoLaunch:" -ForegroundColor Cyan
if ($resolvedTarget -eq (Join-Path $env:USERPROFILE ".sudolaunch")) {
    Write-Host "  This is the default profile location. SudoLaunch will load it automatically on launch." -ForegroundColor Gray
} else {
    Write-Host "  To make this your active profile, you can copy or restore it to ~/.sudolaunch:" -ForegroundColor Gray
    Write-Host ('  Copy-Item -Path "' + $resolvedTarget + '\*" -Destination "$env:USERPROFILE\.sudolaunch" -Recurse -Force') -ForegroundColor Yellow
}
Write-Host ""
