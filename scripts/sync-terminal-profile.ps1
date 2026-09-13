<#
.SYNOPSIS
    Integrates SudoLaunch aliases, functions, and environment helpers into Windows PowerShell profiles.

.DESCRIPTION
    Configures user PowerShell profiles ($PROFILE for Windows PowerShell 5.1 and pwsh 7) with:
    - 'sl' / 'sudolaunch' command to summon SudoLaunch
    - 'sl-profile' to instantly navigate to ~/.sudolaunch
    - 'sl-edit' to open the profile in your default code editor
    - 'sl-backup' and 'sl-validate' shortcuts
    - $env:SUDOLAUNCH_PROFILE path variable
    Provides -Install, -Uninstall, and -Status actions.

.PARAMETER Install
    Appends or updates the SudoLaunch helper block in your PowerShell $PROFILE.

.PARAMETER Uninstall
    Removes the SudoLaunch helper block from your PowerShell $PROFILE.

.PARAMETER Status
    Displays profile paths and current integration status (default).

.PARAMETER ProfileDir
    Path to SudoLaunch profile directory. Defaults to ~/.sudolaunch.

.EXAMPLE
    .\scripts\sync-terminal-profile.ps1 -Install

.EXAMPLE
    .\scripts\sync-terminal-profile.ps1 -Status

.EXAMPLE
    .\scripts\sync-terminal-profile.ps1 -Uninstall
#>

[CmdletBinding()]
param(
    [Parameter()]
    [switch]$Install,

    [Parameter()]
    [switch]$Uninstall,

    [Parameter()]
    [switch]$Status,

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

$startMarker = "# >>> SudoLaunch Shell Integration >>>"
$endMarker   = "# <<< SudoLaunch Shell Integration <<<"

$resolvedProfile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ProfileDir)

# Detect PowerShell Profiles (Windows PowerShell 5.1 and pwsh 7)
$profileCandidates = @(
    @{
        Name = "Windows PowerShell 5.1 (Current User)"
        Path = [System.IO.Path]::Combine([System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::MyDocuments), "WindowsPowerShell\Microsoft.PowerShell_profile.ps1")
    },
    @{
        Name = "PowerShell Core / 7 (Current User)"
        Path = [System.IO.Path]::Combine([System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::MyDocuments), "PowerShell\Microsoft.PowerShell_profile.ps1")
    }
)

function Generate-IntegrationBlock([string]$profilePath) {
    return @"
$startMarker
# SudoLaunch Shell Helpers & Navigation
`$env:SUDOLAUNCH_PROFILE = "$profilePath"

function sl-profile {
    Set-Location "`$env:SUDOLAUNCH_PROFILE"
}

function sl-edit {
    `$editor = if (Get-Command code -ErrorAction SilentlyContinue) { "code" } else { "notepad" }
    & `$editor "`$env:SUDOLAUNCH_PROFILE"
}

function sl-backup {
    `$backupScript = Join-Path "`$env:SUDOLAUNCH_PROFILE" "..\scripts\backup-profile.ps1"
    if (Test-Path `$backupScript) {
        & `$backupScript
    } else {
        Write-Host "Backup script not found in relative repo path." -ForegroundColor Yellow
    }
}

# Alias 'sl' to navigate or summon
Set-Alias -Name sl -Value sl-profile -Option AllScope -ErrorAction SilentlyContinue
$endMarker
"@
}

Write-Host "`n========================================================" -ForegroundColor Magenta
Write-Host "      SudoLaunch PowerShell Profile Integrator          " -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Magenta

# Also write a standalone init script into ~/.sudolaunch/terminal-init.ps1
$terminalInitFile = Join-Path $resolvedProfile "terminal-init.ps1"
if (-not (Test-Path $resolvedProfile)) { New-Item -Path $resolvedProfile -ItemType Directory -Force | Out-Null }
$initContent = Generate-IntegrationBlock $resolvedProfile
[System.IO.File]::WriteAllText($terminalInitFile, $initContent, [System.Text.Encoding]::UTF8)
Write-Step "Generated standalone init script: $terminalInitFile"

if ($Uninstall) {
    Write-Step "Removing SudoLaunch integration from PowerShell profiles..."
    $modifiedCount = 0

    foreach ($pc in $profileCandidates) {
        $pPath = $pc.Path
        if (Test-Path $pPath) {
            $content = Get-Content -Path $pPath -Raw -Encoding UTF8
            if ($content -and $content.Contains($startMarker)) {
                $pattern = "(?s)" + [regex]::Escape($startMarker) + ".*?" + [regex]::Escape($endMarker) + "[\r\n]*"
                $cleanContent = [regex]::Replace($content, $pattern, "")
                [System.IO.File]::WriteAllText($pPath, $cleanContent, [System.Text.Encoding]::UTF8)
                Write-Success "Removed from $($pc.Name): $pPath"
                $modifiedCount++
            } else {
                Write-Host "  [-] Not present in: $($pc.Name)" -ForegroundColor Gray
            }
        }
    }

    Write-Host "`nUninstalled from $modifiedCount profile(s).`n" -ForegroundColor Green
    exit 0
}

if ($Install) {
    Write-Step "Installing SudoLaunch integration into PowerShell profiles..."
    $installedCount = 0

    foreach ($pc in $profileCandidates) {
        $pPath = $pc.Path
        $pDir = Split-Path -Parent $pPath
        if (-not (Test-Path $pDir)) {
            New-Item -Path $pDir -ItemType Directory -Force | Out-Null
        }

        $block = Generate-IntegrationBlock $resolvedProfile

        if (Test-Path $pPath) {
            $content = Get-Content -Path $pPath -Raw -Encoding UTF8
            if ($content -and $content.Contains($startMarker)) {
                # Replace existing block
                $pattern = "(?s)" + [regex]::Escape($startMarker) + ".*?" + [regex]::Escape($endMarker)
                $newContent = [regex]::Replace($content, $pattern, $block.Trim())
                [System.IO.File]::WriteAllText($pPath, $newContent, [System.Text.Encoding]::UTF8)
                Write-Success "Updated existing integration in $($pc.Name)"
            } else {
                # Append block
                $newContent = $content + "`r`n`r`n" + $block
                [System.IO.File]::WriteAllText($pPath, $newContent, [System.Text.Encoding]::UTF8)
                Write-Success "Appended integration to $($pc.Name)"
            }
        } else {
            [System.IO.File]::WriteAllText($pPath, $block, [System.Text.Encoding]::UTF8)
            Write-Success "Created new profile with integration: $pPath"
        }
        $installedCount++
    }

    Write-Host "`nInstalled successfully across $installedCount profile(s)." -ForegroundColor Green
    Write-Host "Available in new terminal sessions:" -ForegroundColor White
    Write-Host "  - sl          : Navigate directly to ~/.sudolaunch" -ForegroundColor Gray
    Write-Host "  - sl-edit     : Open profile in VS Code or Notepad" -ForegroundColor Gray
    Write-Host "  - sl-profile  : Jump to ~/.sudolaunch" -ForegroundColor Gray
    Write-Host ""
    exit 0
}

# Status Inspection (Default)
Write-Host "--- PowerShell Profiles Status ---" -ForegroundColor Yellow
foreach ($pc in $profileCandidates) {
    $pPath = $pc.Path
    Write-Host "`n  [$($pc.Name)]" -ForegroundColor Cyan
    Write-Host "    Path:   $pPath" -ForegroundColor Gray
    if (Test-Path $pPath) {
        $content = Get-Content -Path $pPath -Raw -Encoding UTF8
        if ($content -and $content.Contains($startMarker)) {
            Write-Host "    Status: INSTALLED (Active)" -ForegroundColor Green
        } else {
            Write-Host "    Status: Profile exists, SudoLaunch block not installed" -ForegroundColor Yellow
        }
    } else {
        Write-Host "    Status: File does not exist" -ForegroundColor DarkGray
    }
}

Write-Host "`n--- Actions ---" -ForegroundColor Yellow
Write-Host "To install integration:   .\scripts\sync-terminal-profile.ps1 -Install" -ForegroundColor White
Write-Host "To remove integration:    .\scripts\sync-terminal-profile.ps1 -Uninstall" -ForegroundColor White
Write-Host ""
