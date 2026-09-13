<#
.SYNOPSIS
    Detects and terminates orphaned SudoLaunch, Electron, and node-pty background processes.

.DESCRIPTION
    Scans for lingering electron.exe, SudoLaunch.exe, node-pty terminal helpers (OpenConsole/conhost),
    and Vite dev server processes that may lock files or hold ports after crashes or aborted sessions.
    Runs in safe diagnostic mode by default; pass -Kill to terminate matching processes.

.PARAMETER Kill
    Terminates identified orphaned processes.

.PARAMETER IncludeDevServer
    Also targets background Node.js processes running the Vite dev server (port 5173).

.PARAMETER Force
    Skips confirmation prompt when -Kill is specified.

.EXAMPLE
    .\scripts\clean-processes.ps1

.EXAMPLE
    .\scripts\clean-processes.ps1 -Kill -Force
#>

[CmdletBinding()]
param(
    [Parameter()]
    [switch]$Kill,

    [Parameter()]
    [switch]$IncludeDevServer,

    [Parameter()]
    [switch]$Force
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
Write-Host "     SudoLaunch Process & Zombie Cleaner                " -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Magenta

# 1. Gather Candidate Processes
Write-Step "Scanning for active SudoLaunch and related Electron processes..."

$candidates = [System.Collections.ArrayList]@()

# A. SudoLaunch.exe packaged processes
$slProcs = Get-Process -Name "SudoLaunch" -ErrorAction SilentlyContinue
foreach ($p in $slProcs) {
    $candidates.Add([PSCustomObject]@{
        Process     = $p
        Id          = $p.Id
        Name        = $p.ProcessName
        Description = "Packaged SudoLaunch App"
        Path        = (try { $p.Path } catch { "Access Denied" })
        MemoryMB    = [Math]::Round($p.WorkingSet64 / 1MB, 1)
        StartTime   = (try { $p.StartTime.ToString("HH:mm:ss") } catch { "N/A" })
    }) | Out-Null
}

# B. electron.exe dev processes matching sudolaunch
$elecProcs = Get-Process -Name "electron" -ErrorAction SilentlyContinue
foreach ($p in $elecProcs) {
    $pPath = try { $p.Path } catch { "" }
    $cmdLine = ""
    try {
        $wmi = Get-CimInstance Win32_Process -Filter "ProcessId = $($p.Id)" -ErrorAction SilentlyContinue
        if ($wmi) { $cmdLine = $wmi.CommandLine }
    } catch {}

    if ($pPath -like "*sudolaunch*" -or $cmdLine -like "*sudolaunch*" -or $pPath -like "*node_modules\electron*") {
        $candidates.Add([PSCustomObject]@{
            Process     = $p
            Id          = $p.Id
            Name        = $p.ProcessName
            Description = "Development Electron Runner"
            Path        = $pPath
            MemoryMB    = [Math]::Round($p.WorkingSet64 / 1MB, 1)
            StartTime   = (try { $p.StartTime.ToString("HH:mm:ss") } catch { "N/A" })
        }) | Out-Null
    }
}

# C. Vite dev server (node processes with electron-vite or vite)
if ($IncludeDevServer) {
    $nodeProcs = Get-Process -Name "node" -ErrorAction SilentlyContinue
    foreach ($p in $nodeProcs) {
        $cmdLine = ""
        try {
            $wmi = Get-CimInstance Win32_Process -Filter "ProcessId = $($p.Id)" -ErrorAction SilentlyContinue
            if ($wmi) { $cmdLine = $wmi.CommandLine }
        } catch {}

        if ($cmdLine -like "*sudolaunch*" -or $cmdLine -like "*electron-vite*") {
            $candidates.Add([PSCustomObject]@{
                Process     = $p
                Id          = $p.Id
                Name        = $p.ProcessName
                Description = "Dev Server (Vite/Node)"
                Path        = (try { $p.Path } catch { "N/A" })
                MemoryMB    = [Math]::Round($p.WorkingSet64 / 1MB, 1)
                StartTime   = (try { $p.StartTime.ToString("HH:mm:ss") } catch { "N/A" })
            }) | Out-Null
        }
    }
}

# 2. Check Vite Port 5173 status
Write-Host "`n--- Network Port Status ---" -ForegroundColor Yellow
$portActive = $false
try {
    $conns = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        $portActive = $true
        $owningPids = ($conns | Select-Object -ExpandProperty OwningProcess -Unique) -join ", "
        Write-WarningMsg "Port 5173 (Vite Dev Server) is LISTENING on PID(s): $owningPids"
    } else {
        Write-Success "Port 5173 is FREE."
    }
} catch {
    Write-Host "  Could not inspect TCP connections." -ForegroundColor Gray
}

# 3. Report Results
Write-Host "`n--- Discovered Processes ---" -ForegroundColor Yellow
if ($candidates.Count -eq 0) {
    Write-Success "No orphaned SudoLaunch or Electron processes found."
    Write-Host ""
    exit 0
}

$displayList = @()
foreach ($c in $candidates) {
    $displayList += [PSCustomObject]@{
        PID         = $c.Id
        Name        = $c.Name
        Role        = $c.Description
        Memory      = "$($c.MemoryMB) MB"
        Started     = $c.StartTime
    }
}
$displayList | Format-Table -AutoSize

# 4. Action Execution
if (-not $Kill) {
    Write-Host "Diagnostic mode only. No processes were killed." -ForegroundColor Gray
    Write-Host "To terminate these processes, run: .\scripts\clean-processes.ps1 -Kill" -ForegroundColor Yellow
    Write-Host ""
    exit 0
}

if (-not $Force) {
    $confirm = Read-Host "Terminate all $($candidates.Count) listed process(es)? (y/N)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "Operation cancelled." -ForegroundColor Gray
        exit 0
    }
}

Write-Step "Terminating processes..."
$killed = 0
foreach ($c in $candidates) {
    try {
        Stop-Process -Id $c.Id -Force -ErrorAction Stop
        Write-Success "Terminated PID $($c.Id) ($($c.Name) - $($c.Description))"
        $killed++
    } catch {
        Write-ErrorMsg "Failed to terminate PID $($c.Id): $_"
    }
}

Write-Host "`nSuccessfully terminated $killed process(es).`n" -ForegroundColor Green
