<#
.SYNOPSIS
    Diagnoses, repairs, and rebuilds native addons and build tools for SudoLaunch.

.DESCRIPTION
    Automates environment diagnostics and native dependency recovery:
    - Verifies Node.js, npm, Python, Visual C++ Build Tools, and .NET csc.exe
    - Clears the NoDefaultCurrentDirectoryInExePath security variable that breaks node-pty's GetCommitHash.bat
    - Recompiles the Win32 sendkey.exe utility from source
    - Rebuilds native addons: node-window-manager, extract-file-icon, electron-clipboard-ex, node-pty
    - Verifies TypeScript build integrity

.PARAMETER Clean
    Removes node_modules/.vite and native build caches before rebuilding.

.PARAMETER SkipSendKey
    Skips recompiling resources/bin/sendkey.exe.

.EXAMPLE
    .\scripts\repair-environment.ps1

.EXAMPLE
    .\scripts\repair-environment.ps1 -Clean
#>

[CmdletBinding()]
param(
    [Parameter()]
    [switch]$Clean,

    [Parameter()]
    [switch]$SkipSendKey
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
Write-Host "     SudoLaunch Native Environment & Addon Repair       " -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Magenta

# 1. Environment Diagnostics
Write-Step "1. Checking environment prerequisites..."

# Node
try {
    $nodeVer = node --version
    Write-Success "Node.js: $nodeVer"
} catch {
    Write-ErrorMsg "Node.js is not found on PATH."
    exit 1
}

# npm
try {
    $npmVer = npm --version
    Write-Success "npm:     v$npmVer"
} catch {
    Write-ErrorMsg "npm is not found on PATH."
    exit 1
}

# Python
$pythonFound = $false
try {
    $pyVer = python --version 2>&1
    Write-Success "Python:  $pyVer"
    $pythonFound = $true
} catch {
    Write-WarningMsg "Python not found on PATH. (node-gyp native builds may require Python)"
}

# csc.exe (.NET C# compiler)
$cscCandidates = @(
    "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$cscPath = ""
foreach ($cand in $cscCandidates) {
    if (Test-Path $cand) {
        $cscPath = $cand
        break
    }
}
if ($cscPath) {
    Write-Success "csc.exe: $cscPath"
} else {
    Write-WarningMsg "csc.exe not found. Recompiling sendkey.exe will be skipped."
}

# 2. Fix NoDefaultCurrentDirectoryInExePath if present
if ($env:NoDefaultCurrentDirectoryInExePath) {
    Write-WarningMsg "Detected security variable 'NoDefaultCurrentDirectoryInExePath=$($env:NoDefaultCurrentDirectoryInExePath)'."
    Write-Step "Temporarily clearing for this session to allow node-pty's GetCommitHash.bat to run..."
    $env:NoDefaultCurrentDirectoryInExePath = $null
    Write-Success "Cleared NoDefaultCurrentDirectoryInExePath for current process."
}

# 3. Recompile sendkey.exe
if (-not $SkipSendKey -and $cscPath) {
    Write-Host ""
    Write-Step "2. Verifying and compiling Win32 sendkey and swaphook utilities..."
    $sendkeySource = Join-Path $PSScriptRoot "..\src\main\tools\sendkey.cs"
    $sendkeyBin = Join-Path $PSScriptRoot "..\resources\bin\sendkey.exe"

    if (Test-Path $sendkeySource) {
        $binDir = Split-Path -Parent $sendkeyBin
        if (-not (Test-Path $binDir)) { New-Item -Path $binDir -ItemType Directory -Force | Out-Null }

        & $cscPath /target:winexe /out:$sendkeyBin /optimize+ $sendkeySource | Out-Null
        if (Test-Path $sendkeyBin) {
            $binInfo = Get-Item $sendkeyBin
            Write-Success "sendkey.exe compiled ($([Math]::Round($binInfo.Length / 1KB, 1)) KB) -> $sendkeyBin"
        } else {
            Write-WarningMsg "sendkey.exe compilation did not produce an output file."
        }
    } else {
        Write-WarningMsg "sendkey.cs source not found at: $sendkeySource"
    }

    $swaphookSource = Join-Path $PSScriptRoot "..\src\main\tools\swaphook.cs"
    $swaphookBin = Join-Path $PSScriptRoot "..\resources\bin\swaphook.exe"
    $swaphookManifest = Join-Path $PSScriptRoot "..\src\main\tools\swaphook.manifest"

    if (Test-Path $swaphookSource) {
        $binDir = Split-Path -Parent $swaphookBin
        if (-not (Test-Path $binDir)) { New-Item -Path $binDir -ItemType Directory -Force | Out-Null }

        $cscArgs = @("/target:exe", "/out:$swaphookBin", "/optimize+")
        if (Test-Path $swaphookManifest) {
            $cscArgs += "/win32manifest:$swaphookManifest"
        }
        $cscArgs += $swaphookSource

        & $cscPath $cscArgs | Out-Null
        if (Test-Path $swaphookBin) {
            $binInfo = Get-Item $swaphookBin
            Write-Success "swaphook.exe compiled ($([Math]::Round($binInfo.Length / 1KB, 1)) KB) -> $swaphookBin"
        } else {
            Write-WarningMsg "swaphook.exe compilation did not produce an output file."
        }
    } else {
        Write-WarningMsg "swaphook.cs source not found at: $swaphookSource"
    }

}

# 4. Clean Caches if requested
if ($Clean) {
    Write-Host ""
    Write-Step "3. Cleaning build caches..."
    $cacheDirs = @(
        (Join-Path $PSScriptRoot "..\node_modules\.vite"),
        (Join-Path $PSScriptRoot "..\out"),
        (Join-Path $PSScriptRoot "..\dist")
    )
    foreach ($dir in $cacheDirs) {
        if (Test-Path $dir) {
            Remove-Item -Path $dir -Recurse -Force -ErrorAction SilentlyContinue
            Write-Success "Cleaned $(Split-Path -Leaf $dir)/"
        }
    }
}

# 5. Rebuild Native Modules
Write-Host ""
Write-Step "4. Rebuilding native Electron modules (node-window-manager, extract-file-icon, electron-clipboard-ex, node-pty)..."
$rebuildCmd = "npx electron-rebuild -f -w node-window-manager,extract-file-icon,electron-clipboard-ex,node-pty"
Write-Host "  Executing: $rebuildCmd`n" -ForegroundColor Gray

& cmd.exe /c $rebuildCmd

if ($LASTEXITCODE -eq 0) {
    Write-Success "Native modules rebuilt successfully!"
} else {
    Write-ErrorMsg "electron-rebuild exited with code $LASTEXITCODE."
    exit $LASTEXITCODE
}

# 6. Typecheck verification
Write-Host ""
Write-Step "5. Validating TypeScript compilation..."
npm run typecheck

Write-Host ""
Write-Success "Environment & Addon Repair Completed Successfully!"
Write-Host "You can now launch the application with: npm run dev`n" -ForegroundColor Green
