<#
.SYNOPSIS
    Manages the Windows UAC Secure Desktop policy (PromptOnSecureDesktop).

.DESCRIPTION
    Controls whether User Account Control (UAC) elevation prompts appear on the
    isolated "Secure Desktop" or directly on the interactive user desktop.

    - Disabled (PromptOnSecureDesktop = 0):
      UAC prompts appear as normal elevated windows on the interactive desktop.
      This allows remote input tools (like SudoLaunch with uiAccess) to click "Yes" / "No"
      and type credentials without requiring a LocalSystem service or physical access.

    - Enabled (PromptOnSecureDesktop = 1):
      Windows default behavior. The screen dims and switches to the isolated Secure Desktop.

.PARAMETER Disable
    Disables the Secure Desktop so UAC prompts can be clicked remotely.

.PARAMETER Enable
    Enables the Secure Desktop (restores Windows default behavior).

.PARAMETER Status
    Queries and displays the current Secure Desktop setting.

.EXAMPLE
    .\scripts\manage-secure-desktop.ps1 -Status

.EXAMPLE
    .\scripts\manage-secure-desktop.ps1 -Disable

.EXAMPLE
    .\scripts\manage-secure-desktop.ps1 -Enable
#>

[CmdletBinding(DefaultParameterSetName = "Status")]
param(
    [Parameter(ParameterSetName = "Disable")]
    [switch]$Disable,

    [Parameter(ParameterSetName = "Enable")]
    [switch]$Enable,

    [Parameter(ParameterSetName = "Status")]
    [switch]$Status
)

$ErrorActionPreference = "Stop"

$regPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
$regName = "PromptOnSecureDesktop"

function Test-IsAdmin {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-SecureDesktopStatus {
    try {
        $val = Get-ItemPropertyValue -Path $regPath -Name $regName -ErrorAction SilentlyContinue
        if ($null -eq $val) {
            # Default Windows behavior when key is absent is enabled (1)
            return 1
        }
        return [int]$val
    } catch {
        return 1
    }
}

if ($Status -or (-not $Disable -and -not $Enable)) {
    $currentVal = Get-SecureDesktopStatus
    Write-Host "`n========================================================" -ForegroundColor Magenta
    Write-Host "         Windows UAC Secure Desktop Status              " -ForegroundColor White
    Write-Host "========================================================`n" -ForegroundColor Magenta

    if ($currentVal -eq 0) {
        Write-Host " Status: DISABLED (PromptOnSecureDesktop = 0)" -ForegroundColor Green
        Write-Host " Effect: UAC prompts appear on the normal desktop." -ForegroundColor Green
        Write-Host "         Remote input and elevated clicking are ALLOWED." -ForegroundColor Green
    } else {
        Write-Host " Status: ENABLED (PromptOnSecureDesktop = 1) [Default]" -ForegroundColor Yellow
        Write-Host " Effect: UAC prompts dim the screen and run on the isolated Secure Desktop." -ForegroundColor Yellow
        Write-Host "         Standard remote input tools cannot click on UAC prompts." -ForegroundColor Yellow
    }
    Write-Host ""
    exit 0
}

# Modifying registry requires elevation
if (-not (Test-IsAdmin)) {
    Write-Host "Elevated administrator privileges required to modify UAC policies." -ForegroundColor Yellow
    Write-Host "Requesting elevation..." -ForegroundColor Cyan

    $arg = if ($Disable) { "-Disable" } else { "-Enable" }
    $process = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"", $arg) -Verb RunAs -PassThru -Wait
    exit $process.ExitCode
}

if ($Disable) {
    Set-ItemProperty -Path $regPath -Name $regName -Value 0 -Type DWord -Force
    Write-Host "`n[v] Successfully DISABLED Secure Desktop (PromptOnSecureDesktop = 0)." -ForegroundColor Green
    Write-Host "    UAC prompts will now appear on the interactive desktop and can be clicked by SudoLaunch.`n" -ForegroundColor Cyan
} elseif ($Enable) {
    Set-ItemProperty -Path $regPath -Name $regName -Value 1 -Type DWord -Force
    Write-Host "`n[v] Successfully ENABLED Secure Desktop (PromptOnSecureDesktop = 1)." -ForegroundColor Green
    Write-Host "    UAC prompts will now appear on the isolated Secure Desktop (Windows default).`n" -ForegroundColor Cyan
}
