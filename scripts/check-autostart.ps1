<#
.SYNOPSIS
    Diagnoses, validates, enables, or disables SudoLaunch Windows startup registration.

.DESCRIPTION
    Inspects Windows Registry startup keys (HKCU/HKLM Run) and the Startup folder for SudoLaunch,
    cross-references against ~/.sudolaunch/settings.json ("autoStart" property), validates the target
    executable binary path, and provides options to enable, disable, or repair auto-start registration.

.PARAMETER Enable
    Enables Windows auto-start for SudoLaunch (registers in HKCU Run and updates settings.json).

.PARAMETER Disable
    Disables Windows auto-start for SudoLaunch (unregisters from HKCU Run and updates settings.json).

.PARAMETER Repair
    Validates and repairs a broken or outdated executable path in the startup registry key.

.PARAMETER ExecutablePath
    Explicit path to SudoLaunch.exe to register. If omitted, attempts auto-detection.

.PARAMETER ProfileDir
    Path to SudoLaunch profile directory. Defaults to ~/.sudolaunch.

.EXAMPLE
    .\scripts\check-autostart.ps1

.EXAMPLE
    .\scripts\check-autostart.ps1 -Enable

.EXAMPLE
    .\scripts\check-autostart.ps1 -Disable

.EXAMPLE
    .\scripts\check-autostart.ps1 -Repair
#>

[CmdletBinding()]
param(
    [Parameter()]
    [switch]$Enable,

    [Parameter()]
    [switch]$Disable,

    [Parameter()]
    [switch]$Repair,

    [Parameter()]
    [string]$ExecutablePath,

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

function Find-SudoLaunchBinary([string]$preferredPath) {
    if ($preferredPath -and (Test-Path $preferredPath)) {
        return (Resolve-Path $preferredPath).Path
    }

    # 1. Check running process
    $proc = Get-Process -Name "sudolaunch" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc -and $proc.Path -and (Test-Path $proc.Path) -and $proc.Path -like "*sudolaunch.exe*") {
        return $proc.Path
    }

    # 2. Check standard installed locations
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "Programs\sudolaunch\SudoLaunch.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\SudoLaunch\SudoLaunch.exe"),
        (Join-Path $env:LOCALAPPDATA "sudolaunch\SudoLaunch.exe"),
        (Join-Path $env:ProgramFiles "SudoLaunch\SudoLaunch.exe"),
        (Join-Path $PSScriptRoot "..\dist\win-unpacked\SudoLaunch.exe"),
        (Join-Path $PSScriptRoot "..\release\win-unpacked\SudoLaunch.exe")
    )

    foreach ($cand in $candidates) {
        if (Test-Path $cand) {
            return (Resolve-Path $cand).Path
        }
    }

    return $null
}

function Extract-ExecutableFromCommand([string]$cmd) {
    if ([string]::IsNullOrWhiteSpace($cmd)) { return $null }
    $cmd = $cmd.Trim()
    if ($cmd.StartsWith('"')) {
        $endQuote = $cmd.IndexOf('"', 1)
        if ($endQuote -gt 0) {
            return $cmd.Substring(1, $endQuote - 1)
        }
    }
    $parts = $cmd.Split(' ')
    return $parts[0]
}

Write-Host "`n========================================================" -ForegroundColor Magenta
Write-Host "       SudoLaunch Windows Auto-Start Diagnostic         " -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Magenta

$resolvedProfile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ProfileDir)
$settingsPath = Join-Path $resolvedProfile "settings.json"

$settingsAutoStart = $null
if (Test-Path $settingsPath) {
    try {
        $settingsObj = Get-Content -Path $settingsPath -Raw | ConvertFrom-Json
        if ($settingsObj.PSObject.Properties["autoStart"]) {
            $settingsAutoStart = [bool]$settingsObj.autoStart
        }
    } catch {
        Write-WarningMsg "Unable to read settings.json: $_"
    }
}

$regKeyPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$regValueName = "SudoLaunch"
$regItem = Get-ItemProperty -Path $regKeyPath -Name $regValueName -ErrorAction SilentlyContinue
$registeredCommand = if ($regItem -and $regItem.$regValueName) { $regItem.$regValueName } else { $null }

$hklmRegKeyPath = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run"
$hklmItem = Get-ItemProperty -Path $hklmRegKeyPath -Name $regValueName -ErrorAction SilentlyContinue
$hklmRegisteredCommand = if ($hklmItem -and $hklmItem.$regValueName) { $hklmItem.$regValueName } else { $null }

$startupFolder = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$startupShortcut = Join-Path $startupFolder "SudoLaunch.lnk"
$hasStartupShortcut = Test-Path $startupShortcut

# Actions Handling
if ($Enable) {
    Write-Step "Enabling SudoLaunch Windows auto-start..."

    $bin = Find-SudoLaunchBinary $ExecutablePath
    if (-not $bin) {
        Write-ErrorMsg "Could not locate SudoLaunch executable. Please build with 'npm run build:win' or specify -ExecutablePath."
        exit 1
    }

    $commandToSet = "`"$bin`""
    Set-ItemProperty -Path $regKeyPath -Name $regValueName -Value $commandToSet
    Write-Success "Registered in HKCU Run: $commandToSet"

    # Update settings.json
    if (Test-Path $settingsPath) {
        try {
            $settingsObj = Get-Content -Path $settingsPath -Raw | ConvertFrom-Json
            $settingsObj.autoStart = $true
            $settingsObj | ConvertTo-Json -Depth 10 | Set-Content -Path $settingsPath -Encoding UTF8
            Write-Success "Updated settings.json -> autoStart: true"
        } catch {
            Write-WarningMsg "Failed to update settings.json: $_"
        }
    }

    Write-Host "`nAuto-start enabled successfully.`n" -ForegroundColor Green
    exit 0
}

if ($Disable) {
    Write-Step "Disabling SudoLaunch Windows auto-start..."

    if ($registeredCommand) {
        Remove-ItemProperty -Path $regKeyPath -Name $regValueName -ErrorAction SilentlyContinue
        Write-Success "Removed registry key: $regKeyPath\$regValueName"
    } else {
        Write-Host "  Registry key was not present in HKCU Run." -ForegroundColor Gray
    }

    if ($hasStartupShortcut) {
        Remove-Item -Path $startupShortcut -Force -ErrorAction SilentlyContinue
        Write-Success "Removed Startup shortcut: $startupShortcut"
    }

    # Update settings.json
    if (Test-Path $settingsPath) {
        try {
            $settingsObj = Get-Content -Path $settingsPath -Raw | ConvertFrom-Json
            $settingsObj.autoStart = $false
            $settingsObj | ConvertTo-Json -Depth 10 | Set-Content -Path $settingsPath -Encoding UTF8
            Write-Success "Updated settings.json -> autoStart: false"
        } catch {
            Write-WarningMsg "Failed to update settings.json: $_"
        }
    }

    Write-Host "`nAuto-start disabled successfully.`n" -ForegroundColor Green
    exit 0
}

if ($Repair) {
    Write-Step "Repairing SudoLaunch auto-start registration..."

    $bin = Find-SudoLaunchBinary $ExecutablePath
    if (-not $bin) {
        Write-ErrorMsg "Cannot repair: Could not locate a valid SudoLaunch executable on disk."
        exit 1
    }

    $commandToSet = "`"$bin`""
    Set-ItemProperty -Path $regKeyPath -Name $regValueName -Value $commandToSet
    Write-Success "Repaired registry key to active binary: $commandToSet"

    if (Test-Path $settingsPath) {
        try {
            $settingsObj = Get-Content -Path $settingsPath -Raw | ConvertFrom-Json
            $settingsObj.autoStart = $true
            $settingsObj | ConvertTo-Json -Depth 10 | Set-Content -Path $settingsPath -Encoding UTF8
            Write-Success "Synced settings.json -> autoStart: true"
        } catch {}
    }

    Write-Host "`nAuto-start repaired successfully.`n" -ForegroundColor Green
    exit 0
}

# Diagnostic Report Mode
Write-Host "--- Profile Configuration ---" -ForegroundColor Yellow
$settingStr = if ($null -eq $settingsAutoStart) { "Not configured (defaults to false)" } elseif ($settingsAutoStart) { "True (Enabled)" } else { "False (Disabled)" }
Write-Host "  Profile Directory:      $resolvedProfile" -ForegroundColor Gray
Write-Host "  settings.json autoStart: $settingStr" -ForegroundColor White

Write-Host "`n--- Windows Auto-Start Registrations ---" -ForegroundColor Yellow
$isRegValid = $false
if ($registeredCommand) {
    Write-Host "  HKCU Run Key:           Present" -ForegroundColor Green
    Write-Host "    Registered Command:   $registeredCommand" -ForegroundColor White
    $exe = Extract-ExecutableFromCommand $registeredCommand
    if ($exe -and (Test-Path $exe)) {
        Write-Host "    Executable Status:    Valid ($exe)" -ForegroundColor Green
        $isRegValid = $true
    } else {
        Write-Host "    Executable Status:    MISSING / INVALID ($exe)" -ForegroundColor Red
    }
} else {
    Write-Host "  HKCU Run Key:           None" -ForegroundColor Gray
}

if ($hklmRegisteredCommand) {
    Write-Host "  HKLM Run Key:           $hklmRegisteredCommand" -ForegroundColor Cyan
}

if ($hasStartupShortcut) {
    Write-Host "  Startup Folder Shortcut: Present ($startupShortcut)" -ForegroundColor Cyan
}

# Auto-detected executable
$detectedBinary = Find-SudoLaunchBinary $ExecutablePath
Write-Host "`n--- Binary Detection ---" -ForegroundColor Yellow
if ($detectedBinary) {
    Write-Host "  Discovered Executable:  $detectedBinary" -ForegroundColor Green
    $fileInfo = Get-Item $detectedBinary
    Write-Host "  Binary Size:            $([Math]::Round($fileInfo.Length / 1MB, 2)) MB" -ForegroundColor Gray
    Write-Host "  Modified Date:          $($fileInfo.LastWriteTime)" -ForegroundColor Gray
} else {
    Write-Host "  Discovered Executable:  None found (packaged app not yet built or installed)" -ForegroundColor Yellow
}

# Verdict
Write-Host "`n--- Diagnostic Verdict ---" -ForegroundColor Yellow
if ($registeredCommand -and -not $isRegValid) {
    Write-ErrorMsg "BROKEN REGISTRATION: Registry points to a missing file path."
    Write-Host "  To fix, run: .\scripts\check-autostart.ps1 -Repair" -ForegroundColor Yellow
} elseif ($registeredCommand -and $settingsAutoStart -eq $false) {
    Write-WarningMsg "DESYNCHRONIZED: Registry has auto-start enabled, but settings.json has autoStart = false."
    Write-Host "  To sync, run: .\scripts\check-autostart.ps1 -Disable (or -Enable)" -ForegroundColor Yellow
} elseif (-not $registeredCommand -and $settingsAutoStart -eq $true) {
    Write-WarningMsg "DESYNCHRONIZED: settings.json has autoStart = true, but no registry startup entry exists."
    Write-Host "  To sync, run: .\scripts\check-autostart.ps1 -Enable" -ForegroundColor Yellow
} elseif ($registeredCommand -and $isRegValid) {
    Write-Success "HEALTHY: Auto-start is active and pointing to a valid executable."
} else {
    Write-Host " [i] Auto-start is currently disabled." -ForegroundColor Gray
    Write-Host "  To enable, run: .\scripts\check-autostart.ps1 -Enable" -ForegroundColor Cyan
}
Write-Host ""
