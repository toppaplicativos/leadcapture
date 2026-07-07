# Deploy completo — evita tela branca (sempre envia dist inteiro + verify)
param(
  [string]$Vps = "root@187.127.5.179",
  [string]$RemoteRoot = "/root/leadcapture"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path "$Root\frontend\dist\index.html")) {
  Write-Host "Build frontend primeiro: npm -C frontend run build"
  exit 1
}
if (-not (Test-Path "$Root\dist\index.js")) {
  Write-Host "Build backend primeiro: npm run build"
  exit 1
}

$frontendTar = Join-Path $PSScriptRoot "frontend-dist-full.tar.gz"
Push-Location "$Root\frontend\dist"
tar -czf $frontendTar .
Pop-Location

$backendTar = Join-Path $PSScriptRoot "backend-dist-full.tar.gz"
Push-Location "$Root\dist"
tar -czf $backendTar .
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
node "$PSScriptRoot\smoke-app.mjs"