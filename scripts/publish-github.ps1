# Run from normal PowerShell: .\scripts\publish-github.ps1
# Verifies the signed-in owner's existing, empty repository; never force-pushes.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$ghCommand = Get-Command gh -ErrorAction SilentlyContinue
$ghBinary = if ($ghCommand) { $ghCommand.Source } else { 'C:\Program Files\GitHub CLI\gh.exe' }
if (-not (Test-Path -LiteralPath $ghBinary)) { throw 'GitHub CLI was not found.' }
$owner = & $ghBinary api user --jq '.login'
if ($LASTEXITCODE -ne 0 -or -not $owner) { throw 'GitHub authentication failed. Run gh auth login in this terminal, then retry.' }
$repository = "$owner/Pressure-Drop_Abyssal-Protocol"
$metadata = & $ghBinary repo view $repository --json nameWithOwner,isEmpty,url
if ($LASTEXITCODE -ne 0) { throw 'Could not verify the existing repository.' }
$repo = $metadata | ConvertFrom-Json
if (-not $repo.isEmpty) { & (Join-Path $PSScriptRoot 'publish-existing-github.ps1'); return }
$remote = $null
$remoteNames = @(git remote)
if ($remoteNames -contains 'origin') { $remote = git remote get-url origin }
if ($remote -and $remote -ne ($repo.url + '.git') -and $remote -ne $repo.url) { throw 'Existing origin points elsewhere; review it before publishing.' }
git add .
if ($LASTEXITCODE -ne 0) { throw 'Could not stage files.' }
git diff --cached --stat
# Reject generated/private directories even if an ignore rule was accidentally changed.
$files = git diff --cached --name-only
$unsafe = $files | Where-Object { $_ -match '(^|/)(node_modules|artifacts|server/data|reference-abyssal-review|\.[^/]*-profile)(/|$)|\.zip$|\.sqlite($|-)' -or ($_ -match '(^|/)\.env($|\.)' -and $_ -ne '.env.example') }
if ($unsafe) { throw ('Excluded/private paths were staged: ' + ($unsafe -join ', ')) }
$commitCount = git rev-list --all --count
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect local Git history.' }
if ([int]$commitCount -gt 0) { throw 'Local commits already exist. Review them before rerunning; no upload was performed.' }
git commit -m 'Initial import of Pressure Drop: Abyssal Protocol'
if ($LASTEXITCODE -ne 0) { throw 'Commit failed. Check git user.name and user.email.' }
git branch -M main
if ($LASTEXITCODE -ne 0) { throw 'Could not set the branch name.' }
if (-not $remote) { git remote add origin ($repo.url + '.git'); if ($LASTEXITCODE -ne 0) { throw 'Could not configure origin.' } }
& $ghBinary auth setup-git
if ($LASTEXITCODE -ne 0) { throw 'GitHub Git authentication setup failed.' }
git push -u origin main
if ($LASTEXITCODE -ne 0) { throw 'Push failed. The local commit is preserved; do not force-push.' }
Write-Output ('Published: ' + $repo.url)
