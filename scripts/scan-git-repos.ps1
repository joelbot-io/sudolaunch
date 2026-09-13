<#
.SYNOPSIS
    Scans developer workspaces for Git repositories and generates a SudoLaunch lookup table.

.DESCRIPTION
    Traverses search roots (e.g. D:\repo, C:\Projects, C:\Users\<user>\repos) for Git repositories,
    extracts branch names, uncommitted change states, and origin URLs, then generates
    ~/.sudolaunch/lookup/repos.json for instant search via /lookup repos in SudoLaunch.
    Optionally registers a /repo custom command.

.PARAMETER ScanRoots
    Array of root directories to search for Git repositories. Defaults to common dev folders.

.PARAMETER MaxDepth
    Maximum folder depth to recurse when locating .git directories (default: 4).

.PARAMETER SetupCommand
    Automatically creates/updates ~/.sudolaunch/commands/repo.json to enable /repo navigation.

.PARAMETER ProfileDir
    Path to SudoLaunch profile directory. Defaults to ~/.sudolaunch.

.EXAMPLE
    .\scripts\scan-git-repos.ps1

.EXAMPLE
    .\scripts\scan-git-repos.ps1 -ScanRoots "D:\repo", "C:\Users\username\Projects"

.EXAMPLE
    .\scripts\scan-git-repos.ps1 -SetupCommand
#>

[CmdletBinding()]
param(
    [Parameter()]
    [string[]]$ScanRoots,

    [Parameter()]
    [int]$MaxDepth = 4,

    [Parameter()]
    [switch]$SetupCommand,

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

Write-Host "`n========================================================" -ForegroundColor Magenta
Write-Host "         SudoLaunch Git Workspace Scanner               " -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Magenta

# Determine default scan roots if not provided
if (-not $ScanRoots -or $ScanRoots.Count -eq 0) {
    $ScanRoots = @()
    $commonRoots = @(
        "D:\repo",
        "C:\repo",
        "D:\Projects",
        "C:\Projects",
        (Join-Path $env:USERPROFILE "source\repos"),
        (Join-Path $env:USERPROFILE "repos"),
        (Join-Path $env:USERPROFILE "Projects"),
        (Join-Path $env:USERPROFILE "Documents\GitHub")
    )
    foreach ($cr in $commonRoots) {
        if (Test-Path $cr) {
            $ScanRoots += $cr
        }
    }
}

if ($ScanRoots.Count -eq 0) {
    $ScanRoots = @((Get-Location).Path)
}

Write-Step "Scanning search roots (depth limit: $MaxDepth):"
foreach ($r in $ScanRoots) {
    Write-Host "   - $r" -ForegroundColor Gray
}

function Find-GitRepositories([string]$dir, [int]$currentDepth, [int]$maxD, [System.Collections.ArrayList]$list) {
    if ($currentDepth -gt $maxD) { return }
    if (-not (Test-Path $dir)) { return }

    $gitDir = Join-Path $dir ".git"
    if (Test-Path $gitDir) {
        $list.Add($dir) | Out-Null
        # Do not recurse into child repositories of a repository
        return
    }

    try {
        $subDirs = Get-ChildItem -Path $dir -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -ne "node_modules" -and $_.Name -ne ".git" -and $_.Name -ne "bin" -and $_.Name -ne "obj" }
        foreach ($sub in $subDirs) {
            Find-GitRepositories $sub.FullName ($currentDepth + 1) $maxD $list
        }
    } catch {}
}

$discoveredRepoDirs = [System.Collections.ArrayList]@()
foreach ($root in $ScanRoots) {
    Find-GitRepositories $root 1 $MaxDepth $discoveredRepoDirs
}

Write-Host "`nDiscovered $($discoveredRepoDirs.Count) Git repositories. Gathering status..." -ForegroundColor White

$repoTable = @()
foreach ($repoPath in $discoveredRepoDirs) {
    $repoName = Split-Path -Leaf $repoPath
    $branch = "unknown"
    $statusSummary = "Clean"
    $originUrl = ""
    $lastCommit = ""

    try {
        $branch = (git -C $repoPath rev-parse --abbrev-ref HEAD 2>$null)
        if (-not $branch) { $branch = "detached" }

        $statusLines = @(git -C $repoPath status --porcelain 2>$null)
        if ($statusLines.Count -gt 0) {
            $statusSummary = "Dirty ($($statusLines.Count) modified/untracked file(s))"
        }

        $remote = (git -C $repoPath config --get remote.origin.url 2>$null)
        if ($remote) { $originUrl = "$remote".Trim() }

        $logMsg = (git -C $repoPath log -1 --format="%cd - %s" --date=short 2>$null)
        if ($logMsg) { $lastCommit = "$logMsg".Trim() }
    } catch {
        $statusSummary = "Error reading status"
    }

    $repoTable += [PSCustomObject]@{
        "Repository" = $repoName
        "Branch"     = $branch
        "Status"     = $statusSummary
        "Path"       = $repoPath
        "Remote"     = $originUrl
        "LastCommit" = $lastCommit
    }
}

# Write to ~/.sudolaunch/lookup/repos.json
$resolvedProfile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ProfileDir)
$lookupDir = Join-Path $resolvedProfile "lookup"
if (-not (Test-Path $lookupDir)) {
    New-Item -Path $lookupDir -ItemType Directory -Force | Out-Null
}

$lookupFile = Join-Path $lookupDir "repos.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($lookupFile, ($repoTable | ConvertTo-Json -Depth 10), $utf8NoBom)

Write-Success "Generated lookup table: $lookupFile ($($repoTable.Count) repositories indexed)"
Write-Host "  Search in SudoLaunch with: /lookup repos <query>`n" -ForegroundColor White

# Optional: Register /repo custom command
if ($SetupCommand) {
    Write-Step "Configuring custom /repo command in profile..."
    $commandsDir = Join-Path $resolvedProfile "commands"
    if (-not (Test-Path $commandsDir)) {
        New-Item -Path $commandsDir -ItemType Directory -Force | Out-Null
    }

    $repoCommand = [PSCustomObject]@{
        Command = "/repo"
        Label   = "Browse Git Repositories"
        Folder  = "lookup"
    }
    $repoCmdPath = Join-Path $commandsDir "repo.json"
    [System.IO.File]::WriteAllText($repoCmdPath, ($repoCommand | ConvertTo-Json -Depth 5), $utf8NoBom)
    Write-Success "Created commands/repo.json"
}

# Display top results
if ($repoTable.Count -gt 0) {
    Write-Host "Top Repositories Discovered:" -ForegroundColor Yellow
    $preview = $repoTable | Select-Object -First 10 | Select-Object Repository, Branch, Status, Path
    $preview | Format-Table -AutoSize
}
