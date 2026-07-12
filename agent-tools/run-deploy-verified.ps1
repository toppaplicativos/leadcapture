# Deploy com verificacao de build antes do tar
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$LockFile = Join-Path $PSScriptRoot ".deploy.lock"

function Acquire-DeployLock {
  if (Test-Path $LockFile) {
    $age = (Get-Date) - (Get-Item $LockFile).LastWriteTime
    if ($age.TotalMinutes -lt 45) {
      $owner = Get-Content $LockFile -ErrorAction SilentlyContinue
      Write-Host "ABORT: outro deploy em andamento (pid $owner, ha $([int]$age.TotalMinutes) min)"
      exit 1
    }
    Remove-Item $LockFile -Force
  }
  Set-Content -Path $LockFile -Value $PID -NoNewline
}

function Release-DeployLock {
  if (-not (Test-Path $LockFile)) { return }
  $owner = Get-Content $LockFile -ErrorAction SilentlyContinue
  if ("$owner" -eq "$PID") { Remove-Item $LockFile -Force }
}

function Import-SmokeEnv {
  $smokeFile = Join-Path $PSScriptRoot ".env.smoke"
  if (-not (Test-Path $smokeFile)) { return }
  Get-Content $smokeFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    if ($line -match '^([^=]+)=(.*)$') {
      $name = $matches[1].Trim()
      $value = $matches[2].Trim().Trim('"').Trim("'")
      if (-not [string]::IsNullOrWhiteSpace($name) -and -not (Get-Item "Env:$name" -ErrorAction SilentlyContinue)) {
        Set-Item -Path "Env:$name" -Value $value
      }
    }
  }
}

Import-SmokeEnv
Acquire-DeployLock

try {
if (-not $env:SMOKE_EMAIL -or -not $env:SMOKE_PASSWORD) {
  Write-Host "ABORT: defina SMOKE_EMAIL e SMOKE_PASSWORD (ou crie agent-tools/.env.smoke)"
  exit 1
}

Write-Host ">> Bumping service worker cache"
node "$PSScriptRoot\bump-service-worker.mjs"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ">> Build backend"
Push-Location $Root
npm run build
$backendExit = $LASTEXITCODE
Pop-Location
if ($backendExit -ne 0) {
  Write-Host "ABORT: backend build falhou (exit $backendExit)"
  exit $backendExit
}
if (-not (Test-Path "$Root\dist\index.js")) {
  Write-Host "ABORT: dist\index.js nao encontrado apos build backend"
  exit 1
}
Write-Host ">> Write build-meta (git sha + build time)"
node "$PSScriptRoot\write-build-meta.mjs"
if ($LASTEXITCODE -ne 0) {
  Write-Host "ABORT: write-build-meta falhou"
  exit $LASTEXITCODE
}
Write-Host "OK    backend build"

Write-Host ">> Build frontend"
Push-Location "$Root\frontend"
npm run build
$frontendExit = $LASTEXITCODE
Pop-Location
if ($frontendExit -ne 0) {
  Write-Host "ABORT: frontend build falhou (exit $frontendExit)"
  exit $frontendExit
}
if (-not (Test-Path "$Root\frontend\dist\index.html")) {
  Write-Host "ABORT: frontend\dist\index.html nao encontrado apos build"
  exit 1
}
Write-Host "OK    frontend build"

$swPath = "$Root\frontend\dist\service-worker.js"
if (-not (Test-Path $swPath)) {
  Write-Host "ABORT: service-worker.js ausente em frontend\dist"
  exit 1
}
$swContent = Get-Content $swPath -Raw
if ($swContent -match 'lead-system-shell-v(\d+)-(\d+)') {
  Write-Host "OK    dist SW shell=v$($Matches[1]) stamp=$($Matches[2])"
} else {
  Write-Host "ABORT: versao SW nao encontrada em frontend\dist\service-worker.js"
  exit 1
}

Write-Host ">> Builds OK - iniciando tar/scp/deploy"
& "$PSScriptRoot\deploy-full.ps1" -SkipBuild
exit $LASTEXITCODE
} finally {
  Release-DeployLock
}