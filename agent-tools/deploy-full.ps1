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

$tar = Join-Path $PSScriptRoot "frontend-dist-full.tar.gz"
Push-Location "$Root\frontend\dist"
tar -czf $tar .
Pop-Location

Write-Host ">> Enviando backend dist/index.js"
scp "$Root\dist\index.js" "${Vps}:${RemoteRoot}/dist/index.js"

Write-Host ">> Enviando frontend completo"
scp $tar "${Vps}:${RemoteRoot}/frontend-dist-full.tar.gz"

ssh $Vps @"
set -e
cd $RemoteRoot
mkdir -p frontend/dist public
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