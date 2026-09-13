<#
.SYNOPSIS
    Diagnoses global hotkey conflicts and active keyboard hook collisions for SudoLaunch.

.DESCRIPTION
    Inspects SudoLaunch's configured hotkeys (Ctrl+Space, Ctrl+Alt+T, Ctrl+Win+/, F1),
    detects running third-party launchers (PowerToys Run, Flow Launcher, Wox, AutoHotkey),
    checks Windows IME hotkey registry settings (e.g. Chinese/Japanese IME toggle on Ctrl+Space),
    and performs a live Win32 RegisterHotKey availability probe to verify registration success.

.PARAMETER ProfileDir
    Path to SudoLaunch profile directory. Defaults to ~/.sudolaunch.

.EXAMPLE
    .\scripts\check-hotkey-conflicts.ps1
#>

[CmdletBinding()]
param(
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
Write-Host "       SudoLaunch Global Hotkey Conflict Diagnostic     " -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Magenta

# 1. Read SudoLaunch Settings
$resolvedProfile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ProfileDir)
$settingsFile = Join-Path $resolvedProfile "settings.json"

$mainHotkey = "CommandOrControl+Space"
$termHotkey = "Control+Alt+T"

if (Test-Path $settingsFile) {
    try {
        $settings = Get-Content -Path $settingsFile -Raw | ConvertFrom-Json
        if ($settings.hotkey) { $mainHotkey = $settings.hotkey }
        if ($settings.terminalHotkey) { $termHotkey = $settings.terminalHotkey }
    } catch {}
}

Write-Step "Configured SudoLaunch Hotkeys:"
Write-Host "  - Palette Hotkey:           $mainHotkey" -ForegroundColor White
Write-Host "  - Terminal Hotkey:          $termHotkey" -ForegroundColor White
Write-Host "  - Fixed Terminal Hotkeys:   Ctrl+Win+/, F1" -ForegroundColor Gray

# 2. Check for Competing Background Launchers & Hotkey Interceptors
Write-Host "`n--- Checking Competing Applications ---" -ForegroundColor Yellow

$competingApps = @(
    @{ Process = "PowerToys.PowerLauncher"; Name = "PowerToys Run"; Typical = "Alt+Space" },
    @{ Process = "PowerToys";              Name = "Microsoft PowerToys"; Typical = "Win+Shift+T, Alt+Space, etc." },
    @{ Process = "Flow.Launcher";          Name = "Flow Launcher"; Typical = "Alt+Space" },
    @{ Process = "Wox";                    Name = "Wox Launcher"; Typical = "Alt+Space" },
    @{ Process = "keypirinha";             Name = "Keypirinha"; Typical = "Ctrl+1, Alt+Space" },
    @{ Process = "AutoHotkey";             Name = "AutoHotkey"; Typical = "Custom scripts" },
    @{ Process = "AutoHotkey64";           Name = "AutoHotkey 64-bit"; Typical = "Custom scripts" },
    @{ Process = "Listary";                Name = "Listary"; Typical = "Double-Ctrl" },
    @{ Process = "Everything";             Name = "Voidtools Everything"; Typical = "Custom" }
)

$runningConflicts = @()
foreach ($app in $competingApps) {
    $p = Get-Process -Name $app.Process -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($p) {
        $runningConflicts += $app
        Write-WarningMsg "Detected active $($app.Name) (Process: $($app.Process).exe) - Default hotkey: $($app.Typical)"
    }
}

if ($runningConflicts.Count -eq 0) {
    Write-Success "No competing launcher processes detected."
}

# 3. Check Windows IME Hotkeys in Registry
Write-Host "`n--- Checking Windows Input Method (IME) Keybindings ---" -ForegroundColor Yellow

$imeConflictFound = $false
$imeKeyPath = "HKCU:\Control Panel\Input Method\Hot Keys"
if (Test-Path $imeKeyPath) {
    $imeSubKeys = Get-ChildItem -Path $imeKeyPath -ErrorAction SilentlyContinue
    foreach ($k in $imeSubKeys) {
        $mod = (Get-ItemProperty -Path $k.PSPath -Name "Key Modifiers" -ErrorAction SilentlyContinue)."Key Modifiers"
        $vk = (Get-ItemProperty -Path $k.PSPath -Name "Virtual Key" -ErrorAction SilentlyContinue)."Virtual Key"

        # Check for Ctrl+Space: Modifiers = 0x02 (Ctrl), Virtual Key = 0x20 (Space)
        if ($mod -and $vk -and ($mod[0] -band 2) -and ($vk[0] -eq 0x20)) {
            $imeConflictFound = $true
            Write-WarningMsg "Windows IME toggle is mapped to Ctrl+Space at: $($k.PSChildName)"
            Write-Host "    This may swallow Ctrl+Space before SudoLaunch can receive it." -ForegroundColor Gray
            Write-Host "    To fix: Open Windows Settings -> Time & Language -> Language & Region -> Typing -> Advanced keyboard settings -> Input language hot keys." -ForegroundColor Gray
        }
    }
}

if (-not $imeConflictFound) {
    Write-Success "No Windows IME collisions detected on Ctrl+Space."
}

# 4. Win32 Live Hotkey Probe via Temporary Native Window
Write-Host "`n--- Live Win32 Hotkey Availability Probe ---" -ForegroundColor Yellow

$probeCode = @"
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class HotKeyProbe : Form {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    public const uint MOD_ALT = 0x0001;
    public const uint MOD_CONTROL = 0x0002;
    public const uint MOD_SHIFT = 0x0004;
    public const uint MOD_WIN = 0x0008;
    public const uint MOD_NOREPEAT = 0x4000;

    public static int TestHotkey(uint modifiers, uint vk) {
        using (var probe = new HotKeyProbe()) {
            IntPtr handle = probe.Handle; // forces handle creation
            bool registered = RegisterHotKey(handle, 9999, modifiers | MOD_NOREPEAT, vk);
            int err = Marshal.GetLastWin32Error();
            if (registered) {
                UnregisterHotKey(handle, 9999);
                return 0; // Available
            }
            return err; // Error code (1409 = ERROR_HOTKEY_ALREADY_REGISTERED)
        }
    }
}
"@

$probeAvailable = $false
try {
    Add-Type -TypeDefinition $probeCode -ReferencedAssemblies "System.Windows.Forms.dll", "System.Drawing.dll" -ErrorAction SilentlyContinue
    $probeAvailable = $true
} catch {
    # If Add-Type fails or already added
    if ([System.Management.Automation.PSTypeName]'HotKeyProbe'.Type) {
        $probeAvailable = $true
    }
}

if ($probeAvailable) {
    # Test 1: Ctrl+Space (Modifiers: MOD_CONTROL = 2, VK_SPACE = 0x20)
    $resCtrlSpace = [HotKeyProbe]::TestHotkey(2, 0x20)
    if ($resCtrlSpace -eq 0) {
        Write-Success "Ctrl+Space is AVAILABLE for registration."
    } elseif ($resCtrlSpace -eq 1409) {
        # If SudoLaunch is already running, it registered it!
        $sudolaunchRunning = (Get-Process -Name "sudolaunch", "electron" -ErrorAction SilentlyContinue).Count -gt 0
        if ($sudolaunchRunning) {
            Write-Success "Ctrl+Space is actively registered (held by running SudoLaunch/Electron session)."
        } else {
            Write-ErrorMsg "Ctrl+Space is LOCKED by another process (Error 1409: ERROR_HOTKEY_ALREADY_REGISTERED)."
        }
    } else {
        Write-WarningMsg "Ctrl+Space probe returned code $resCtrlSpace"
    }

    # Test 2: Ctrl+Alt+T (Modifiers: MOD_CONTROL | MOD_ALT = 3, VK_T = 0x54)
    $resTerm = [HotKeyProbe]::TestHotkey(3, 0x54)
    if ($resTerm -eq 0) {
        Write-Success "Ctrl+Alt+T is AVAILABLE for registration."
    } elseif ($resTerm -eq 1409) {
        Write-Host " [i] Ctrl+Alt+T is actively held by a running process." -ForegroundColor Cyan
    }

    # Test 3: F1 (Modifiers: 0, VK_F1 = 0x70)
    $resF1 = [HotKeyProbe]::TestHotkey(0, 0x70)
    if ($resF1 -eq 0) {
        Write-Success "F1 is AVAILABLE for global registration."
    } else {
        Write-Host " [i] F1 is held or managed by active application." -ForegroundColor Gray
    }
} else {
    Write-WarningMsg "Win32 probe could not be loaded in current environment."
}

Write-Host "`n--- Summary ---" -ForegroundColor Yellow
Write-Host "Diagnostic completed. If hotkeys fail to register, modify 'hotkey' in /settings or settings.json.`n" -ForegroundColor Gray
