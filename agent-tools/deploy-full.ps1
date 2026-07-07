# Deploy completo — backend dist inteiro + frontend + verify + smoke opcional
param(
  [string]$Vps = "root@187.127.5.179",
  [string]$RemoteRoot = "/root/leadcapture",
  [switch]$SkipBuild,
  [switch]$SkipSmoke
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent

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

Write-Host ">> Aguardando serviços (15s)"
Start-Sleep -Seconds 15
Write-Host ">> Verificando deploy"
node "$PSScriptRoot\verify-deploy.mjs"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

node "$PSScriptRoot\smoke-app.mjs"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $SkipSmoke -and $env:SMOKE_EMAIL -and $env:SMOKE_PASSWORD) {
  Write-Host ">> Smoke autenticado (desktop)"
  node "$PSScriptRoot\smoke-authenticated.mjs"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Write-Host ">> Smoke autenticado (mobile)"
  node "$PSScriptRoot\smoke-authenticated-mobile.mjs"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} elseif (-not $SkipSmoke) {
  Write-Host ">> Smoke autenticado ignorado (defina SMOKE_EMAIL e SMOKE_PASSWORD)"
}

Write-Host ""
Write-Host "Pos-deploy: PWA aberto pode precisar hard refresh (Ctrl+Shift+R) ou reabrir o app."
Write-Host "Service worker versionado neste deploy."