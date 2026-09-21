<#
.SYNOPSIS
    Bundles the repository source code into a clean ZIP archive without dependencies or build outputs.

.DESCRIPTION
    Packages all source code, assets, scripts, and configuration files into a redistributable
    or backup ZIP file. Automatically excludes:
    - node_modules (dependencies)
    - out, dist, dist.zip, and *.zip (build/package outputs)
    - .git (version control metadata)
    - .vite, *.tsbuildinfo (cache files)
    - scratch, *.log, test logs (temporary files)
    - .vscode, .idea (editor configurations)
    - .env, .env.* (environment secrets)

    When -IncludeNative is passed, bundles pre-compiled Windows x64 native binaries
    (node-pty, node-window-manager) into resources/native-prebuilds so target machines
    without Visual Studio C++ compilers can run immediately via npm install.

.PARAMETER OutFile
    Destination path for the generated ZIP file. Defaults to .\sudolaunch-v<version>-source.zip.

.PARAMETER IncludeNative
    Includes pre-compiled Windows x64 native binaries for node-pty and node-window-manager.
    Enables instant setup on target machines without requiring Visual Studio C++ build tools.

.PARAMETER IncludeGit
    Include the .git directory in the bundle (default is excluded).

.PARAMETER ShowFiles
    List every included file during packaging.

.EXAMPLE
    npm run bundle

.EXAMPLE
    npm run bundle:native -- -OutFile "D:\repo\backups\sudolaunch.zip"

.EXAMPLE
    .\scripts\bundle-repo.ps1 -IncludeNative -OutFile "C:\Backups\sudolaunch-snapshot.zip"
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$OutFile,

    [Parameter()]
    [switch]$IncludeNative,

    [Parameter()]
    [switch]$IncludeGit,

    [Parameter()]
    [switch]$ShowFiles
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

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

# Read package.json version
$pkgJsonPath = Join-Path $repoRoot "package.json"
$appVersion = "source"
if (Test-Path $pkgJsonPath) {
    try {
        $pkg = Get-Content -Path $pkgJsonPath -Raw | ConvertFrom-Json
        if ($pkg.version) {
            $appVersion = "v$($pkg.version)"
        }
    } catch {
        # ignore
    }
}

if (-not $OutFile) {
    $suffix = if ($IncludeNative) { "portable" } else { "source" }
    $OutFile = Join-Path $repoRoot "sudolaunch-$appVersion-$suffix.zip"
}

$resolvedOut = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutFile)
$outDir = Split-Path -Parent $resolvedOut
if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -Path $outDir -ItemType Directory -Force | Out-Null
}

Write-Host "`n========================================================" -ForegroundColor Magenta
Write-Host "         SudoLaunch Source Repository Bundler           " -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Magenta

Write-Step "Scanning repository at: $repoRoot"

# If -IncludeNative is requested, ensure resources/native-prebuilds is up to date
$prebuildDir = Join-Path $repoRoot "resources\native-prebuilds\win32-x64"
if ($IncludeNative) {
    Write-Step "Harvesting pre-compiled native binaries (node-pty, node-window-manager)..."
    $ptyRelease = Join-Path $repoRoot "node_modules\node-pty\build\Release"
    $wmRelease = Join-Path $repoRoot "node_modules\node-window-manager\build\Release"

    $ptyDest = Join-Path $prebuildDir "node-pty"
    $wmDest = Join-Path $prebuildDir "node-window-manager"

    if (Test-Path $ptyRelease) {
        if (-not (Test-Path $ptyDest)) { New-Item -Path $ptyDest -ItemType Directory -Force | Out-Null }
        Copy-Item (Join-Path $ptyRelease "*.node") $ptyDest -Force -ErrorAction SilentlyContinue
        Copy-Item (Join-Path $ptyRelease "winpty.dll") $ptyDest -Force -ErrorAction SilentlyContinue
        Copy-Item (Join-Path $ptyRelease "winpty-agent.exe") $ptyDest -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path $wmRelease) {
        if (-not (Test-Path $wmDest)) { New-Item -Path $wmDest -ItemType Directory -Force | Out-Null }
        Copy-Item (Join-Path $wmRelease "addon.node") $wmDest -Force -ErrorAction SilentlyContinue
    }

    Write-Success "Native binaries bundled for Windows x64 (no C++ compiler needed on target machine)."
}

$excludeDirs = @("node_modules", "out", "dist", ".vite", "scratch", ".vscode", ".idea")
if (-not $IncludeGit) {
    $excludeDirs += ".git"
}

$excludeFilePatterns = @(
    "*.zip",
    "*.tar.gz",
    "*.tgz",
    "*.tsbuildinfo",
    "*.log",
    "*_test_log.txt",
    "raw_and_hook_test.txt",
    "warp_filter_test.txt",
    "freeze_test_log.txt",
    ".DS_Store",
    "Thumbs.db",
    ".env",
    ".env.*"
)

# Collect matching files
$allFiles = Get-ChildItem -Path $repoRoot -Recurse -File | Where-Object {
    $rel = $_.FullName.Substring($repoRoot.Length).TrimStart("\", "/")
    
    # If not including native, skip native-prebuilds directory
    if (-not $IncludeNative -and $rel -match "(?i)resources[\\/]native-prebuilds") {
        return $false
    }

    $topDir = ($rel -split "[\\/]")[0]
    if ($excludeDirs -contains $topDir) {
        return $false
    }
    foreach ($pat in $excludeFilePatterns) {
        if ($_.Name -like $pat) {
            return $false
        }
    }
    return $true
}

$fileCount = $allFiles.Count
$totalBytes = ($allFiles | Measure-Object -Property Length -Sum).Sum
$totalMB = [math]::Round($totalBytes / 1MB, 2)

Write-Step "Found $fileCount files ($totalMB MB uncompressed) to package."

# Create temporary staging directory
$stagingDir = Join-Path ([System.IO.Path]::GetTempPath()) ("sudolaunch-bundle-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -Path $stagingDir -ItemType Directory -Force | Out-Null

try {
    Write-Step "Staging files into clean directory tree..."
    foreach ($file in $allFiles) {
        $relPath = $file.FullName.Substring($repoRoot.Length).TrimStart("\", "/")
        if ($ShowFiles) {
            Write-Host "     -> $relPath" -ForegroundColor DarkGray
        }
        $targetPath = Join-Path $stagingDir $relPath
        $targetDir = Split-Path -Parent $targetPath
        if (-not (Test-Path $targetDir)) {
            New-Item -Path $targetDir -ItemType Directory -Force | Out-Null
        }
        Copy-Item -Path $file.FullName -Destination $targetPath -Force
    }

    Write-Step "Creating ZIP archive: $resolvedOut"
    if (Test-Path $resolvedOut) {
        Remove-Item -Path $resolvedOut -Force
    }

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $resolvedOut -CompressionLevel Optimal
    $sw.Stop()

    $zipItem = Get-Item $resolvedOut
    $zipMB = [math]::Round($zipItem.Length / 1MB, 2)
    $elapsedSec = [math]::Round($sw.Elapsed.TotalSeconds, 1)

    Write-Host ""
    Write-Success "Repository bundled successfully!"
    Write-Host "     Destination   : $resolvedOut" -ForegroundColor Cyan
    Write-Host "     File Count    : $fileCount files" -ForegroundColor White
    Write-Host "     Source Size   : $totalMB MB" -ForegroundColor White
    Write-Host "     ZIP Size      : $zipMB MB" -ForegroundColor Green
    Write-Host "     Native Prebuilts : $(if ($IncludeNative) { 'Included (Windows x64)' } else { 'Excluded (Source-only)' })" -ForegroundColor Yellow
    Write-Host "     Duration      : $elapsedSec s`n" -ForegroundColor DarkGray
}
finally {
    if (Test-Path $stagingDir) {
        Remove-Item -Path $stagingDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
