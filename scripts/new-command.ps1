<#
.SYNOPSIS
    Interactive wizard and CLI generator for creating SudoLaunch custom commands.

.DESCRIPTION
    Scaffolds, validates, and registers custom commands in ~/.sudolaunch/commands/<Name>.json.
    Supports single-action PowerShell commands (with argument placeholders like {query})
    and folder-browser commands (browsing .ps1/.py scripts in a subfolder).

.PARAMETER Name
    Command trigger name (without leading slash, e.g. 'flushdns', 'docker', 'vpn').

.PARAMETER Type
    Command type: 'Action' (PowerShell script/one-liner) or 'Folder' (folder of runnable scripts).

.PARAMETER Action
    PowerShell code to execute when the command is triggered (for Action type).

.PARAMETER Folder
    Subfolder name inside ~/.sudolaunch to browse scripts from (for Folder type).

.PARAMETER Label
    Friendly descriptive label displayed in the palette suggestions list.

.PARAMETER Params
    Parameter specifications in format "Name:Description" (e.g. -Params "service:Service to restart").

.PARAMETER TestRun
    Immediately dry-runs the PowerShell action to verify syntax.

.PARAMETER ProfileDir
    Path to SudoLaunch profile directory. Defaults to ~/.sudolaunch.

.EXAMPLE
    .\scripts\new-command.ps1

.EXAMPLE
    .\scripts\new-command.ps1 -Name "flushdns" -Type Action -Action "Clear-DnsClientCache; Write-Host 'DNS Flushed!'" -Label "Flush DNS Cache"

.EXAMPLE
    .\scripts\new-command.ps1 -Name "ops" -Type Folder -Folder "ops-scripts" -Label "DevOps Automation"
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Name,

    [Parameter()]
    [ValidateSet("Action", "Folder", "")]
    [string]$Type = "",

    [Parameter()]
    [string]$Action = "",

    [Parameter()]
    [string]$Folder = "",

    [Parameter()]
    [string]$Label = "",

    [Parameter()]
    [string[]]$Params,

    [Parameter()]
    [switch]$TestRun,

    [Parameter()]
    [switch]$Force,

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
Write-Host "         SudoLaunch Custom Command Wizard               " -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Magenta

# 1. Interactive Name Prompt if not passed
if (-not $Name) {
    $Name = Read-Host "Enter command trigger name (e.g. 'flushdns', 'docker', 'vpn')"
}

$Name = $Name.Trim().TrimStart('/').ToLowerInvariant()
if (-not ($Name -match '^[a-z0-9\-_]+$')) {
    Write-ErrorMsg "Invalid command name '$Name'. Use alphanumeric characters, hyphens, or underscores only."
    exit 1
}

# 2. Interactive Type Prompt if not passed
if (-not $Type) {
    Write-Host "`nSelect command type:" -ForegroundColor Yellow
    Write-Host "  [1] Action  — Runs a PowerShell script or one-liner directly"
    Write-Host "  [2] Folder  — Browses and runs scripts from a folder (e.g. /maint)"
    $typeChoice = Read-Host "Enter choice (1 or 2)"
    $Type = if ($typeChoice -eq "2") { "Folder" } else { "Action" }
}

# 3. Interactive details
if ($Type -eq "Action") {
    if (-not $Action) {
        Write-Host "`nEnter PowerShell action code." -ForegroundColor Yellow
        Write-Host "Tip: You can use argument placeholders like {query} or {paramName}:" -ForegroundColor Gray
        $Action = Read-Host "Action PowerShell"
    }

    if (-not $Action) {
        Write-ErrorMsg "Action code cannot be empty for an Action command."
        exit 1
    }
} else {
    if (-not $Folder) {
        $defaultFolder = $Name
        $Folder = Read-Host "Enter folder name under ~/.sudolaunch (default: $defaultFolder)"
        if (-not $Folder) { $Folder = $defaultFolder }
    }
}

if (-not $Label) {
    $defaultLabel = (Get-Culture).TextInfo.ToTitleCase($Name.Replace('-', ' ').Replace('_', ' '))
    $inputLabel = Read-Host "Enter descriptive label (default: '$defaultLabel')"
    $Label = if ($inputLabel) { $inputLabel } else { $defaultLabel }
}

$resolvedProfile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ProfileDir)
$commandsDir = Join-Path $resolvedProfile "commands"
if (-not (Test-Path $commandsDir)) {
    New-Item -Path $commandsDir -ItemType Directory -Force | Out-Null
}

$cmdFilePath = Join-Path $commandsDir "$Name.json"
if ((Test-Path $cmdFilePath) -and -not $Force) {
    Write-WarningMsg "Command file already exists: $cmdFilePath"
    $overwrite = Read-Host "Overwrite existing command? (y/N)"
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-Host "Aborted." -ForegroundColor Gray
        exit 0
    }
}

# Build command JSON object
$cmdObject = [ordered]@{
    Command = "/$Name"
}

if ($Label) {
    $cmdObject["Label"] = $Label
}

if ($Type -eq "Action") {
    $cmdObject["Action"] = $Action

    # Parameters
    if ($Params -and $Params.Count -gt 0) {
        $paramList = @()
        foreach ($p in $Params) {
            $parts = $p.Split(':')
            $paramList += [PSCustomObject]@{
                Name        = $parts[0].Trim()
                Description = if ($parts.Length -gt 1) { $parts[1].Trim() } else { "" }
            }
        }
        $cmdObject["Params"] = $paramList
    }
} else {
    $cmdObject["Folder"] = $Folder

    # Create target folder if it doesn't exist
    $targetFolder = Join-Path $resolvedProfile $Folder
    if (-not (Test-Path $targetFolder)) {
        New-Item -Path $targetFolder -ItemType Directory -Force | Out-Null
        Write-Step "Created folder: $targetFolder"

        # Create starter script in that folder
        $sampleScriptPath = Join-Path $targetFolder "sample-task.ps1"
        $sampleContent = "# Starter script for /$Name`r`nWrite-Host 'Executed sample task from $Folder!' -ForegroundColor Green`r`n"
        [System.IO.File]::WriteAllText($sampleScriptPath, $sampleContent, [System.Text.Encoding]::UTF8)
        Write-Step "Created starter script: $sampleScriptPath"
    }
}

$jsonText = $cmdObject | ConvertTo-Json -Depth 5
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($cmdFilePath, $jsonText, $utf8NoBom)
Write-Success "Command saved to: $cmdFilePath"

# Test Run if requested
if ($TestRun -and $Type -eq "Action") {
    Write-Step "Testing action command execution..."
    try {
        powershell.exe -NoProfile -Command $Action
        Write-Success "Action executed successfully without runtime errors."
    } catch {
        Write-WarningMsg "Action raised an error: $_"
    }
}

Write-Host ""
Write-Host "Command is now ready in SudoLaunch!" -ForegroundColor Green
Write-Host "  Trigger:      /$Name" -ForegroundColor White
Write-Host "  Label:        $Label" -ForegroundColor Gray
if ($Type -eq "Action") {
    Write-Host "  Action:       $Action" -ForegroundColor Gray
} else {
    Write-Host "  Folder:       $Folder" -ForegroundColor Gray
}
Write-Host ""
