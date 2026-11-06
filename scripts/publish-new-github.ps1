param([ValidatePattern('^[A-Za-z0-9_.-]+$')][string]$RepositoryName = 'Pressure-Drop_Abyssal-Protocol-Game')
$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $sourceRoot
$command = Get-Command gh -ErrorAction SilentlyContinue
$ghBinary = if ($command) { $command.Source } else { 'C:\Program Files\GitHub CLI\gh.exe' }
$owner = & $ghBinary api user --jq '.login'
if ($LASTEXITCODE -ne 0 -or -not $owner) { throw 'Run gh auth login, then retry.' }
$trustedSource = $sourceRoot.Replace('\','/')
$files = @(git -c "safe.directory=$trustedSource" ls-files --cached --others --exclude-standard | Sort-Object -Unique)
if ($LASTEXITCODE -ne 0 -or -not $files.Count) { throw 'Could not list project files.' }
$unsafe = @($files | Where-Object { $_ -match '(^|/)(node_modules|artifacts|server/data|reference-abyssal-review|\.github-upload|\.local-tools|\.aws|\.codex|\.agents|\.[^/]*-profile)(/|$)|\.zip$|\.sqlite($|-)' -or ($_ -match '(^|/)\.env($|\.)' -and $_ -ne '.env.example') })
if ($unsafe.Count) { throw ('Private/generated files detected: ' + ($unsafe -join ', ')) }
foreach ($file in $files) { if ((Get-Item -LiteralPath (Join-Path $sourceRoot $file)).Length -gt 95MB) { throw ('File too large: ' + $file) } }
$checkout = Join-Path $sourceRoot ('.github-upload\new-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $checkout -Force | Out-Null
foreach ($file in $files) {
    $target = [IO.Path]::GetFullPath((Join-Path $checkout $file))
    if (-not $target.StartsWith($checkout + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid project path.' }
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination $target -Force
}
Push-Location -LiteralPath $checkout
try {
    git init -b main
    if ($LASTEXITCODE -ne 0) { throw 'Git initialization failed.' }
    foreach ($file in $files) {
        git add -f -- $file
        if ($LASTEXITCODE -ne 0) { throw ('Could not stage ' + $file) }
    }
    git diff --cached --stat
    git commit -m 'Initial import of Pressure Drop: Abyssal Protocol'
    if ($LASTEXITCODE -ne 0) { throw 'Commit failed. Check git user.name and user.email.' }
    & $ghBinary auth setup-git
    if ($LASTEXITCODE -ne 0) { throw 'GitHub authentication setup failed.' }
    & $ghBinary repo create "$owner/$RepositoryName" --public --source . --remote origin --push --description 'Pressure Drop: Abyssal Protocol - browser co-op deep-sea survival horror'
    if ($LASTEXITCODE -ne 0) { throw ('Creation/upload failed. No existing repository was modified. Local commit is preserved at ' + $checkout + '. If the new repository was created but pushing failed, retry git push -u origin main from that folder.') }
    Write-Output ('Published: https://github.com/' + $owner + '/' + $RepositoryName)
} finally { Pop-Location }
