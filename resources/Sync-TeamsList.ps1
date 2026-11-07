<#
.SYNOPSIS
    Retrieves all Microsoft Teams for the currently logged-in user, including the Teams Web URL,
    and automatically syncs them with the SudoLaunch app teams list (~/.sudolaunch/teamLinks.json).

.DESCRIPTION
    This script connects to both MicrosoftTeams and Microsoft Graph PowerShell modules, identifies
    the target user, queries all teams the user belongs to via MicrosoftTeams (Get-Team),
    and retrieves the direct Teams web deep-link URL (WebUrl) for each team via Microsoft Graph (Get-MgTeam).
    Optionally, it can also retrieve the associated SharePoint team site URL and export results to CSV.

    When invoked via CLI, the script interactively prompts for:
    - UserPrincipalName (or auto-detect logged-in user)
    - Whether to include SharePoint site URLs
    - Whether to export the results to CSV and the export file path
    - Whether to automatically sync results with the SudoLaunch app teams list (~/.sudolaunch/teamLinks.json)

.EXAMPLE
    .\Sync-TeamsList.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host " Microsoft Teams & Graph: User Teams & Web URLs Finder" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# -------------------------------------------------------------------------
# Interactive Prompts
# -------------------------------------------------------------------------
Write-Host "`n--- Configuration ---" -ForegroundColor Yellow

# Question 1: User Principal Name
$upnPrompt = Read-Host "Enter User Principal Name / email (leave blank to auto-detect logged-in user)"
$UserPrincipalName = if (-not [string]::IsNullOrWhiteSpace($upnPrompt)) { $upnPrompt.Trim() } else { $null }

# Question 2: Include SharePoint Site URL
$spPrompt = Read-Host "Include SharePoint site URL for each team? (Y/N) [Default: N]"
$IncludeSharePointUrl = ($spPrompt -match '^[Yy]')

# Question 3: Export to CSV
$csvPrompt = Read-Host "Export results to CSV? (Y/N or enter file path) [Default: .\teams.csv]"
if ([string]::IsNullOrWhiteSpace($csvPrompt)) {
    $ExportCsv = ".\teams.csv"
}
elseif ($csvPrompt -match '^[Nn]$') {
    $ExportCsv = $null
}
elseif ($csvPrompt -match '^[Yy]$') {
    $customPath = Read-Host "Enter CSV output file path [Default: .\teams.csv]"
    $ExportCsv = if (-not [string]::IsNullOrWhiteSpace($customPath)) { $customPath.Trim() } else { ".\teams.csv" }
}
else {
    $ExportCsv = $csvPrompt.Trim()
}

# Question 4: Sync with SudoLaunch App
$defaultTeamLinksPath = Join-Path $env:USERPROFILE ".sudolaunch\teamLinks.json"
$sudoPrompt = Read-Host "Automatically sync results with SudoLaunch app teams list? (Y/N) [Default: Y]"
$SyncSudoLaunch = ([string]::IsNullOrWhiteSpace($sudoPrompt) -or $sudoPrompt -match '^[Yy]')
$TeamLinksPath = $defaultTeamLinksPath
$ReplaceTeamLinks = $false

if ($SyncSudoLaunch) {
    $replacePrompt = Read-Host "Merge with existing SudoLaunch links or replace all? (M/R) [Default: M]"
    if ($replacePrompt -match '^[Rr]') {
        $ReplaceTeamLinks = $true
    }
}

Write-Host "---------------------`n" -ForegroundColor Yellow

# -------------------------------------------------------------------------
# 1. Verify and Import Required Modules
# -------------------------------------------------------------------------
$requiredModules = @('MicrosoftTeams', 'Microsoft.Graph.Authentication', 'Microsoft.Graph.Teams')
if ($IncludeSharePointUrl) {
    $requiredModules += 'Microsoft.Graph.Files' # for Get-MgGroupSite
}

foreach ($module in $requiredModules) {
    if (-not (Get-Module -ListAvailable -Name $module)) {
        Write-Host "Module '$module' is not installed. Installing '$module' (CurrentUser)..." -ForegroundColor Yellow
        if ($PSVersionTable.PSEdition -eq 'Desktop' -and -not (Get-PackageProvider -Name NuGet -ListAvailable -ErrorAction SilentlyContinue)) {
            Write-Host "Installing NuGet package provider..." -ForegroundColor Gray
            Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Scope CurrentUser -Force -Confirm:$false | Out-Null
        }
        Install-Module -Name $module -Scope CurrentUser -Repository PSGallery -Force -AllowClobber -Confirm:$false
        Write-Host "Installed module '$module'." -ForegroundColor Green
    } else {
        Write-Host "Module '$module' is already installed." -ForegroundColor Gray
    }
    Import-Module $module -ErrorAction SilentlyContinue
}

# -------------------------------------------------------------------------
# 2. Connect to Microsoft Graph PowerShell
# -------------------------------------------------------------------------
$graphScopes = @("Team.ReadBasic.All", "User.Read")
if ($IncludeSharePointUrl) {
    $graphScopes += "Sites.Read.All"
}

$mgContext = Get-MgContext -ErrorAction SilentlyContinue
if (-not $mgContext) {
    Write-Host "`nConnecting to Microsoft Graph PowerShell..." -ForegroundColor Yellow
    Connect-MgGraph -Scopes $graphScopes -NoWelcome
    $mgContext = Get-MgContext
}
else {
    Write-Host "`nAlready connected to Microsoft Graph as: $($mgContext.Account)" -ForegroundColor Green
}

# -------------------------------------------------------------------------
# 3. Connect to Microsoft Teams PowerShell
# -------------------------------------------------------------------------
$teamsConnected = $false
try {
    # Check if existing session is active
    $currentTenant = Get-CsTenant -ErrorAction Stop
    if ($currentTenant) {
        $teamsConnected = $true
        Write-Host "Already connected to MicrosoftTeams PowerShell." -ForegroundColor Green
    }
}
catch {
    $teamsConnected = $false
}

if (-not $teamsConnected) {
    Write-Host "`nConnecting to MicrosoftTeams PowerShell..." -ForegroundColor Yellow
    $teamsSession = Connect-MicrosoftTeams
    Write-Host "Successfully connected to MicrosoftTeams." -ForegroundColor Green
}

# -------------------------------------------------------------------------
# 4. Determine Target User (Logged-in user by default)
# -------------------------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($UserPrincipalName)) {
    if ($mgContext -and $mgContext.Account) {
        $UserPrincipalName = $mgContext.Account
    }
    elseif ($teamsSession -and $teamsSession.Account) {
        $UserPrincipalName = $teamsSession.Account
    }
    else {
        # Fallback: query 'me' from Graph
        $me = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/me" -ErrorAction SilentlyContinue
        if ($me -and $me.userPrincipalName) {
            $UserPrincipalName = $me.userPrincipalName
        }
    }
}

if ([string]::IsNullOrWhiteSpace($UserPrincipalName)) {
    throw "Unable to determine the logged-in user's identity. Please specify a User Principal Name when prompted."
}

Write-Host "`nRetrieving teams for user: " -NoNewline
Write-Host "$UserPrincipalName" -ForegroundColor Cyan

# -------------------------------------------------------------------------
# 5. Query Teams using MicrosoftTeams PowerShell (Get-Team)
# -------------------------------------------------------------------------
Write-Host "Fetching joined teams via MicrosoftTeams PowerShell..." -ForegroundColor Gray
$userTeams = @()

try {
    $userTeams = @(Get-Team -User $UserPrincipalName -ErrorAction Stop)
}
catch {
    Write-Warning "Get-Team -User failed: $_"
    Write-Host "Falling back to Microsoft Graph user joined teams..." -ForegroundColor Yellow
    $joined = Get-MgUserJoinedTeam -UserId $UserPrincipalName -All -ErrorAction Stop
    # Map to similar format
    $userTeams = $joined | ForEach-Object {
        [PSCustomObject]@{
            GroupId     = $_.Id
            DisplayName = $_.DisplayName
            Description = $_.Description
            Visibility  = $null
            Archived    = $_.IsArchived
        }
    }
}

if ($userTeams.Count -eq 0) {
    Write-Host "No teams found for user $UserPrincipalName." -ForegroundColor Yellow
    return
}

# Filter out any blank or null team entries
$userTeams = @($userTeams | Where-Object { 
        $_ -and (-not [string]::IsNullOrWhiteSpace($_.DisplayName)) -and (-not [string]::IsNullOrWhiteSpace($_.GroupId))
    })

Write-Host "Found $($userTeams.Count) team(s). Querying Web URLs via Microsoft Graph..." -ForegroundColor Green

# -------------------------------------------------------------------------
# 6. Retrieve Web URLs for each team via Microsoft Graph
# -------------------------------------------------------------------------
$results = [System.Collections.Generic.List[PSCustomObject]]::new()
$index = 0

foreach ($team in $userTeams) {
    $index++
    $percent = [math]::Round(($index / $userTeams.Count) * 100)
    Write-Progress -Activity "Retrieving Team Web URLs" `
        -Status "Processing team $index of $($userTeams.Count): $($team.DisplayName)" `
        -PercentComplete $percent

    $teamWebUrl = $null
    $spSiteUrl = $null

    # Fetch Microsoft Teams Web Link (deep-link) from Microsoft Graph
    try {
        $mgTeam = Get-MgTeam -TeamId $team.GroupId -ErrorAction Stop
        $teamWebUrl = $mgTeam.WebUrl
    }
    catch {
        Write-Warning "Could not retrieve Graph WebUrl for team '$($team.DisplayName)' ($($team.GroupId)): $_"
    }

    # Optionally fetch associated SharePoint Site URL
    if ($IncludeSharePointUrl) {
        try {
            $site = Get-MgGroupSite -GroupId $team.GroupId -ErrorAction Stop
            $spSiteUrl = $site.WebUrl
        }
        catch {
            # In some cases, site might not exist or access is restricted
            $spSiteUrl = $null
        }
    }

    # Clean strings to eliminate embedded line breaks and blank lines in CSV / table output
    $cleanDisplayName = if ($team.DisplayName) { ($team.DisplayName -replace "[\r\n]+", " ").Trim() } else { "" }
    $cleanDescription = if ($team.Description) { ($team.Description -replace "[\r\n]+", " ").Trim() } else { "" }

    $teamObj = [PSCustomObject]@{
        DisplayName       = $cleanDisplayName
        GroupId           = $team.GroupId
        TeamsWebUrl       = $teamWebUrl
        SharePointUrl     = $spSiteUrl
        Description       = $cleanDescription
        Visibility        = $team.Visibility
        Archived          = $team.Archived
        UserPrincipalName = $UserPrincipalName
    }

    # If SharePointUrl wasn't requested, omit it from the default output object
    if (-not $IncludeSharePointUrl) {
        $teamObj.PSObject.Properties.Remove('SharePointUrl')
    }

    $results.Add($teamObj)
}

Write-Progress -Activity "Retrieving Team Web URLs" -Completed
# -------------------------------------------------------------------------
# 7. Sync Summary & Counts
# -------------------------------------------------------------------------
Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host " Sync Summary" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Total Teams Found:     $($results.Count)" -ForegroundColor Green

# Export to CSV if specified
if (-not [string]::IsNullOrWhiteSpace($ExportCsv)) {
    try {
        $resolvedPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ExportCsv)
        $results | Export-Csv -Path $resolvedPath -NoTypeInformation -Encoding utf8
        Write-Host "  Exported to CSV:       $resolvedPath ($($results.Count) records)" -ForegroundColor Cyan
    }
    catch {
        Write-Error "Failed to export CSV: $_"
    }
}

# -------------------------------------------------------------------------
# 8. Sync with SudoLaunch (teamLinks.json)
# -------------------------------------------------------------------------
if ($SyncSudoLaunch -and -not [string]::IsNullOrWhiteSpace($TeamLinksPath)) {
    try {
        $resolvedTeamLinksPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($TeamLinksPath)
        $targetDir = [System.IO.Path]::GetDirectoryName($resolvedTeamLinksPath)
        if ($targetDir -and -not (Test-Path $targetDir)) {
            New-Item -Path $targetDir -ItemType Directory -Force | Out-Null
        }

        # Filter and map to SudoLaunch TeamLink schema: [{ name, url, description }]
        $teamLinkRecords = [System.Collections.Generic.List[PSCustomObject]]::new()
        foreach ($item in $results) {
            if (-not [string]::IsNullOrWhiteSpace($item.DisplayName) -and -not [string]::IsNullOrWhiteSpace($item.TeamsWebUrl)) {
                $teamLinkRecords.Add([PSCustomObject]@{
                    name        = [string]$item.DisplayName.Trim()
                    url         = [string]$item.TeamsWebUrl.Trim()
                    description = if ($item.Description) { [string]$item.Description.Trim() } else { "" }
                })
            }
        }

        $existingItems = [System.Collections.Generic.List[object]]::new()
        if ((Test-Path $resolvedTeamLinksPath) -and (-not $ReplaceTeamLinks)) {
            try {
                $rawExisting = [System.IO.File]::ReadAllText($resolvedTeamLinksPath, [System.Text.Encoding]::UTF8)
                if (-not [string]::IsNullOrWhiteSpace($rawExisting)) {
                    $parsed = $rawExisting | ConvertFrom-Json
                    if ($null -ne $parsed) {
                        if ($parsed -is [System.Collections.IEnumerable] -and -not ($parsed -is [string])) {
                            foreach ($sub in $parsed) {
                                if ($null -ne $sub) { $existingItems.Add($sub) }
                            }
                        } else {
                            $existingItems.Add($parsed)
                        }
                    }
                }
            } catch {
                Write-Warning "Could not parse existing '$resolvedTeamLinksPath'. File will be replaced with new entries."
            }
        }

        $finalItems = @()
        $addedCount = 0
        $updatedCount = 0

        if ($ReplaceTeamLinks -or $existingItems.Count -eq 0) {
            $finalItems = @($teamLinkRecords)
            $addedCount = $teamLinkRecords.Count
        } else {
            # Index existing by name (case-insensitive) to preserve existing manual links
            $dict = [System.Collections.Generic.Dictionary[string, object]]::new([System.StringComparer]::OrdinalIgnoreCase)
            foreach ($ex in $existingItems) {
                $exName = $null
                if ($null -ne $ex) {
                    if ($ex -is [System.Collections.IDictionary]) {
                        if ($ex.Contains('name') -and -not [string]::IsNullOrWhiteSpace($ex['name'])) {
                            $exName = [string]$ex['name']
                        }
                    } else {
                        $nameProp = $ex.PSObject.Properties['name']
                        if ($null -ne $nameProp -and $null -ne $nameProp.Value -and -not [string]::IsNullOrWhiteSpace($nameProp.Value)) {
                            $exName = [string]$nameProp.Value
                        }
                    }
                }
                if (-not [string]::IsNullOrWhiteSpace($exName)) {
                    $dict[$exName.Trim()] = $ex
                }
            }

            foreach ($newRec in $teamLinkRecords) {
                if ($dict.ContainsKey($newRec.name)) {
                    $dict[$newRec.name] = $newRec
                    $updatedCount++
                } else {
                    $dict[$newRec.name] = $newRec
                    $addedCount++
                }
            }

            $finalItems = @($dict.Values)
        }

        $jsonOutput = $finalItems | ConvertTo-Json -Depth 10
        [System.IO.File]::WriteAllText($resolvedTeamLinksPath, $jsonOutput, [System.Text.Encoding]::UTF8)

        Write-Host "  SudoLaunch Team Links: $resolvedTeamLinksPath" -ForegroundColor Green
        Write-Host "    Records Added:       $addedCount" -ForegroundColor Green
        Write-Host "    Records Updated:     $updatedCount" -ForegroundColor Yellow
        Write-Host "    Total In File:       $($finalItems.Count)" -ForegroundColor White
    } catch {
        Write-Error "Failed to update SudoLaunch team links JSON: $_"
    }
}

Write-Host "======================================================`n" -ForegroundColor Cyan