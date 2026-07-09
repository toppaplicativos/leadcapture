# Deploy completo — backend dist inteiro + frontend + verify + smoke opcional
param(
  [string]$Vps = "root@187.127.5.179",
  [string]$RemoteRoot = "/root/leadcapture",
  [switch]$SkipBuild,
  [switch]$SkipSmoke
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent

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

if (-not $SkipBuild) {
  Write-Host ">> Bumping service worker cache (força refresh pós-deploy)"
  node "$PSScriptRoot\bump-service-worker.mjs"

  Write-Host ">> Build backend"
  Push-Location $Root
  npm run build
  Pop-Location

  Write-Host ">> Build frontend"
  Push-Location "$Root\frontend"
  npm run build
  Pop-Location
  Start-Sleep -Seconds 2
}

if (-not (Test-Path "$Root\frontend\dist\index.html")) {
  Write-Host "Build frontend primeiro: npm -C frontend run build"
  exit 1
}
if (-not (Test-Path "$Root\dist\index.js")) {
  Write-Host "Build backend primeiro: npm run build"
  exit 1
}

$frontendTar = Join-Path $PSScriptRoot "frontend-dist-full.tar.gz"
Remove-Item $frontendTar -Force -ErrorAction SilentlyContinue
Push-Location "$Root\frontend\dist"
tar -czf $frontendTar *
if ($LASTEXITCODE -ne 0) { throw "tar frontend falhou (exit $LASTEXITCODE)" }
Pop-Location

$backendTar = Join-Path $PSScriptRoot "backend-dist-full.tar.gz"
Remove-Item $backendTar -Force -ErrorAction SilentlyContinue
Push-Location "$Root\dist"
tar -czf $backendTar *
if ($LASTEXITCODE -ne 0) { throw "tar backend falhou (exit $LASTEXITCODE)" }
Pop-Location

Write-Host ">> Enviando backend dist completo"
scp $backendTar "${Vps}:${RemoteRoot}/backend-dist-full.tar.gz"

Write-Host ">> Enviando frontend completo"
scp $frontendTar "${Vps}:${RemoteRoot}/frontend-dist-full.tar.gz"

ssh $Vps @"
set -e
cd $RemoteRoot
mkdir -p dist frontend/dist public
rm -rf dist/*
tar -xzf backend-dist-full.tar.gz -C dist
mkdir -p frontend/dist
rm -rf frontend/dist/*
tar -xzf frontend-dist-full.tar.gz -C frontend/dist
rsync -a --delete frontend/dist/ public/
pm2 restart leadcapture-api leadcapture-web
pm2 save
echo OK deploy
"@

Write-Host ">> Aguardando serviços (25s)"
Start-Sleep -Seconds 25
Write-Host ">> Verificando deploy"
node "$PSScriptRoot\verify-deploy.mjs"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

node "$PSScriptRoot\smoke-app.mjs"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

function Invoke-SmokeWithRetry {
  param(
    [string]$Label,
    [string]$ScriptPath,
    [int]$MaxAttempts = 2
  )
  for ($i = 1; $i -le $MaxAttempts; $i++) {
    if ($i -gt 1) {
      $waitSec = if ($Label -eq "affiliate-ownership" -or $Label -eq "mobile") { 18 } else { 12 }
      Write-Host ">> Retry smoke $Label ($i/$MaxAttempts) após ${waitSec}s"
      Start-Sleep -Seconds $waitSec
    }
    node $ScriptPath
    if ($LASTEXITCODE -eq 0) { return }
  }
  exit $LASTEXITCODE
}

if (-not $SkipSmoke -and $env:SMOKE_EMAIL -and $env:SMOKE_PASSWORD) {
  Write-Host ">> Smoke autenticado (desktop)"
  Invoke-SmokeWithRetry -Label "desktop" -ScriptPath "$PSScriptRoot\smoke-authenticated.mjs"

  Write-Host ">> Smoke autenticado (mobile)"
  Invoke-SmokeWithRetry -Label "mobile" -ScriptPath "$PSScriptRoot\smoke-authenticated-mobile.mjs" -MaxAttempts 3

  if ($env:SMOKE_AFFILIATE_EMAIL -or $env:SMOKE_AFFILIATE_PASSWORD) {
    Write-Host ">> Smoke ownership afiliado"
    Invoke-SmokeWithRetry -Label "affiliate-ownership" -ScriptPath "$PSScriptRoot\smoke-affiliate-ownership.mjs" -MaxAttempts 3
  } else {
    Write-Host ">> Smoke ownership afiliado (credenciais padrão embutidas)"
    Invoke-SmokeWithRetry -Label "affiliate-ownership" -ScriptPath "$PSScriptRoot\smoke-affiliate-ownership.mjs" -MaxAttempts 3

    Write-Host ">> Smoke distribuição afiliado"
    Invoke-SmokeWithRetry -Label "affiliate-distribution" -ScriptPath "$PSScriptRoot\smoke-affiliate-distribution.mjs" -MaxAttempts 2
  }
} elseif (-not $SkipSmoke) {
  Write-Host ">> Smoke autenticado ignorado (defina SMOKE_EMAIL e SMOKE_PASSWORD)"
}

Write-Host ""
Write-Host "Pos-deploy: PWA aberto pode precisar hard refresh (Ctrl+Shift+R) ou reabrir o app."
Write-Host "Service worker versionado neste deploy."