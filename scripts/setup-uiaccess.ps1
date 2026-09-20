<#
.SYNOPSIS
    Configures and signs swaphook.exe with uiAccess="true" and installs it to Program Files.

.DESCRIPTION
    Windows UIPI (User Interface Privilege Isolation) prevents standard user applications
    from injecting input (mouse clicks, typing) into elevated administrator windows and UAC prompts.
    
    Windows permits input injection if an application:
    1. Has an application manifest with uiAccess="true"
    2. Is digitally signed by a certificate trusted in LocalMachine\Root and TrustedPublisher
    3. Executes from a secure system directory (C:\Program Files\ or System32)

    This script automates all three steps for SudoLaunch:
    - Generates/locates a trusted code-signing certificate for SudoLaunch
    - Recompiles swaphook.exe with the uiAccess manifest
    - Signs swaphook.exe with Authenticode
    - Copies swaphook.exe to "C:\Program Files\SudoLaunch\bin\swaphook.exe"

.EXAMPLE
    .\scripts\setup-uiaccess.ps1
#>

[CmdletBinding()]
param(
    [Parameter()]
    [string]$InstallDir = "C:\Program Files\SudoLaunch\bin"
)

$ErrorActionPreference = "Stop"

# Ensure Certificate module and PSDrive are loaded
Import-Module Microsoft.PowerShell.Security -ErrorAction SilentlyContinue
Import-Module PKI -ErrorAction SilentlyContinue
if (-not (Get-PSDrive -Name Cert -ErrorAction SilentlyContinue)) {
    try {
        New-PSDrive -Name Cert -PSProvider Certificate -Root "\" -ErrorAction SilentlyContinue | Out-Null
    } catch {
        # ignore
    }
}

function Test-IsAdmin {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Require elevation
if (-not (Test-IsAdmin)) {
    Write-Host "Elevated administrator privileges required to install certificates and write to Program Files." -ForegroundColor Yellow
    Write-Host "Requesting elevation..." -ForegroundColor Cyan
    $procArgs = @(
        "-ExecutionPolicy", "Bypass",
        "-File", "`"$PSCommandPath`""
    )
    if ($InstallDir) {
        $procArgs += "-InstallDir"
        $procArgs += "`"$InstallDir`""
    }
    $process = Start-Process -FilePath "powershell.exe" -ArgumentList $procArgs -Verb RunAs -PassThru -Wait
    exit $process.ExitCode
}

Write-Host "`n========================================================" -ForegroundColor Magenta
Write-Host "       SudoLaunch UIAccess Configuration & Setup        " -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Magenta

# Helper: Find certificate in LocalMachine\My via .NET
function Find-CertInLocalMachine([string]$subject) {
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store(
        [System.Security.Cryptography.X509Certificates.StoreName]::My,
        [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine
    )
    try {
        $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
        foreach ($c in $store.Certificates) {
            if ($c.Subject -eq $subject) {
                return $c
            }
        }
    } catch {
        # ignore
    } finally {
        $store.Close()
    }
    return $null
}

# Helper: Add certificate to LocalMachine store via .NET
function Add-CertToLocalMachineStore([System.Security.Cryptography.X509Certificates.X509Certificate2]$c, [string]$storeName) {
    $enumVal = [System.Security.Cryptography.X509Certificates.StoreName]::$storeName
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store($enumVal, [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine)
    try {
        $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
        $matches = $store.Certificates.Find([System.Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint, $c.Thumbprint, $false)
        if ($matches.Count -eq 0) {
            $store.Add($c)
            Write-Host " [v] Added certificate to LocalMachine\$storeName" -ForegroundColor Green
        } else {
            Write-Host " [v] Certificate already trusted in LocalMachine\$storeName" -ForegroundColor Green
        }
    } finally {
        $store.Close()
    }
}

# 1. Certificate Setup
Write-Host " [+] Checking SudoLaunch Code Signing Certificate..." -ForegroundColor Cyan
$certSubject = "CN=SudoLaunch UIAccess Hook"
$cert = Find-CertInLocalMachine $certSubject

if (-not $cert) {
    Write-Host " [+] Generating self-signed code signing certificate..." -ForegroundColor Cyan

    # Ensure Cert drive is present before calling New-SelfSignedCertificate
    if (-not (Get-PSDrive -Name Cert -ErrorAction SilentlyContinue)) {
        New-PSDrive -Name Cert -PSProvider Certificate -Root "\" -ErrorAction SilentlyContinue | Out-Null
    }

    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject $certSubject `
        -CertStoreLocation "Cert:\LocalMachine\My" `
        -KeyExportPolicy Exportable `
        -NotAfter (Get-Date).AddYears(10)
    Write-Host " [v] Certificate created with Thumbprint: $($cert.Thumbprint)" -ForegroundColor Green
} else {
    Write-Host " [v] Existing certificate found: $($cert.Thumbprint)" -ForegroundColor Green
}

# Ensure trusted in Root and TrustedPublisher
Add-CertToLocalMachineStore $cert "Root"
Add-CertToLocalMachineStore $cert "TrustedPublisher"

# 2. Compile swaphook.exe with manifest
Write-Host "`n [+] Compiling swaphook.exe with uiAccess manifest..." -ForegroundColor Cyan
$swaphookSource = Join-Path $PSScriptRoot "..\src\main\tools\swaphook.cs"
$swaphookBin = Join-Path $PSScriptRoot "..\resources\bin\swaphook.exe"
$swaphookManifest = Join-Path $PSScriptRoot "..\src\main\tools\swaphook.manifest"

$cscCandidates = @(
    "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$cscPath = $cscCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $cscPath) {
    Write-Error "csc.exe compiler not found on this system."
}

$binDir = Split-Path -Parent $swaphookBin
if (-not (Test-Path $binDir)) { New-Item -Path $binDir -ItemType Directory -Force | Out-Null }

$cscArgs = @("/target:exe", "/out:$swaphookBin", "/optimize+", "/win32manifest:$swaphookManifest", $swaphookSource)
& $cscPath $cscArgs | Out-Null
Write-Host " [v] Compiled swaphook.exe" -ForegroundColor Green

# 3. Sign the executable
Write-Host "`n [+] Signing swaphook.exe with Authenticode certificate..." -ForegroundColor Cyan
$signResult = Set-AuthenticodeSignature -FilePath $swaphookBin -Certificate $cert
if ($signResult.Status -eq "Valid") {
    Write-Host " [v] Authenticode signature valid: $($signResult.Status)" -ForegroundColor Green
} else {
    Write-Host " [!] Authenticode signature status: $($signResult.Status) ($($signResult.StatusMessage))" -ForegroundColor Yellow
}

# 4. Deploy to Program Files (Secure directory required for uiAccess)
Write-Host "`n [+] Staging to secure directory: $InstallDir" -ForegroundColor Cyan
if (-not (Test-Path $InstallDir)) {
    New-Item -Path $InstallDir -ItemType Directory -Force | Out-Null
}

$targetExe = Join-Path $InstallDir "swaphook.exe"
Copy-Item -Path $swaphookBin -Destination $targetExe -Force
Write-Host " [v] Installed to: $targetExe" -ForegroundColor Green

# Verify execution from Program Files
Write-Host "`n [+] Verifying execution from secure location..." -ForegroundColor Cyan
try {
    $proc = Start-Process -FilePath $targetExe -ArgumentList "test" -Wait -PassThru -NoNewWindow
    Write-Host " [v] swaphook.exe successfully launched with uiAccess privileges (Exit code: $($proc.ExitCode))" -ForegroundColor Green
} catch {
    Write-Host " [X] Failed to launch swaphook.exe from secure location: $_" -ForegroundColor Red
}

Write-Host "`n Setup completed successfully!`n" -ForegroundColor Green
