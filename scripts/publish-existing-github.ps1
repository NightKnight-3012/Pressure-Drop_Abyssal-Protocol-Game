# Upload the current game on a review branch based on the existing remote history.
$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $sourceRoot
$command = Get-Command gh -ErrorAction SilentlyContinue
$ghBinary = if ($command) { $command.Source } else { 'C:\Program Files\GitHub CLI\gh.exe' }
$owner = & $ghBinary api user --jq '.login'
if ($LASTEXITCODE -ne 0 -or -not $owner) { throw 'Run gh auth login in normal PowerShell, then retry.' }
$repository = "$owner/Pressure-Drop_Abyssal-Protocol"
$json = & $ghBinary repo view $repository --json nameWithOwner,url,isEmpty,defaultBranchRef
if ($LASTEXITCODE -ne 0) { throw 'Could not read the existing repository.' }
$repo = $json | ConvertFrom-Json
if ($repo.isEmpty -or -not $repo.defaultBranchRef.name) { throw 'This script requires an existing default branch.' }
$trustedSource = $sourceRoot.Replace('\','/')
$files = @(git -c "safe.directory=$trustedSource" ls-files --cached --others --exclude-standard | Sort-Object -Unique)
if ($LASTEXITCODE -ne 0 -or -not $files.Count) { throw 'Could not list project files.' }
$unsafe = @($files | Where-Object { $_ -match '(^|/)(node_modules|artifacts|server/data|reference-abyssal-review|\.github-upload|\.local-tools|\.aws|\.codex|\.agents|\.[^/]*-profile)(/|$)|\.zip$|\.sqlite($|-)' -or ($_ -match '(^|/)\.env($|\.)' -and $_ -ne '.env.example') })
if ($unsafe.Count) { throw ('Private/generated paths found: ' + ($unsafe -join ', ')) }
foreach ($file in $files) { if ((Get-Item -LiteralPath (Join-Path $sourceRoot $file)).Length -gt 95MB) { throw ('File too large for this upload: ' + $file) } }
Write-Output ('Preparing ' + $files.Count + ' files for ' + $repo.nameWithOwner)
& $ghBinary auth setup-git
if ($LASTEXITCODE -ne 0) { throw 'Git authentication setup failed.' }
$stamp = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + ([guid]::NewGuid().ToString('N').Substring(0,6))
$checkout = Join-Path $sourceRoot ('.github-upload\' + $stamp)
New-Item -ItemType Directory -Path (Split-Path -Parent $checkout) -Force | Out-Null
git clone -- ($repo.url + '.git') $checkout
if ($LASTEXITCODE -ne 0) { throw 'Clone failed. Your original project remains untouched.' }
Push-Location -LiteralPath $checkout
try {
    $branch = 'game-import-' + $stamp
    git checkout -b $branch
    if ($LASTEXITCODE -ne 0) { throw 'Could not create review branch.' }
    foreach ($file in $files) {
        $target = [IO.Path]::GetFullPath((Join-Path $checkout $file))
        if (-not $target.StartsWith($checkout + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid project path.' }
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination $target -Force
    }
    # Stage precisely the reviewed source list, including files ignored by an older remote .gitignore.
    foreach ($file in $files) {
        git add -f -- $file
        if ($LASTEXITCODE -ne 0) { throw ('Could not stage ' + $file) }
    }
    git diff --cached --stat
    git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) { Write-Output 'The existing repository already matches these project files.'; return }
    if ($LASTEXITCODE -ne 1) { throw 'Could not inspect staged changes.' }
    git commit -m 'Import current Pressure Drop game'
    if ($LASTEXITCODE -ne 0) { throw 'Commit failed. Check git user.name and user.email.' }
    git push -u origin $branch
    if ($LASTEXITCODE -ne 0) { throw 'Push failed. The separate local checkout is preserved for retry.' }
    & $ghBinary pr create --repo $repo.nameWithOwner --base $repo.defaultBranchRef.name --head $branch --draft --title 'Import current Pressure Drop game' --body 'Adds the current browser game on top of the existing repository history. Local databases, environment secrets, browser profiles, dependencies, generated test artifacts and ZIP archives are excluded. Existing remote-only files are retained; review them and any overlapping file changes before merging. The default branch has not been changed.'
    if ($LASTEXITCODE -ne 0) { throw ('The branch was uploaded, but PR creation failed. Open a pull request for ' + $branch + ' on GitHub.') }
} finally { Pop-Location }
