# ============================================
# Setup SSH Key - Executar UMA VEZ
# Configura acesso sem senha ao VPS
# ============================================

$VPS_IP   = "187.77.230.211"
$VPS_USER = "root"
$KEY_PATH = "$env:USERPROFILE\.ssh\id_ed25519"

Write-Host "`n=== Setup SSH sem senha para $VPS_USER@$VPS_IP ===" -ForegroundColor Cyan

# 1. Gerar chave se nao existe
if (-not (Test-Path $KEY_PATH)) {
    Write-Host "`nGerando chave SSH..." -ForegroundColor Yellow
    ssh-keygen -t ed25519 -f $KEY_PATH -N '""' -C "leadcapture-vps"
} else {
    Write-Host "`nChave SSH ja existe em $KEY_PATH" -ForegroundColor Green
}

# 2. Copiar chave para o VPS (vai pedir senha pela ultima vez)
Write-Host "`nCopiando chave publica para o VPS..." -ForegroundColor Yellow
Write-Host "Sera pedida a senha do VPS pela ULTIMA vez.`n" -ForegroundColor Red

$PUB_KEY = Get-Content "$KEY_PATH.pub" -Raw
$CMD = "mkdir -p ~/.ssh; chmod 700 ~/.ssh; echo '$($PUB_KEY.Trim())' >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys; sort -u -o ~/.ssh/authorized_keys ~/.ssh/authorized_keys"
ssh "${VPS_USER}@${VPS_IP}" $CMD

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nChave copiada com sucesso!" -ForegroundColor Green
    Write-Host "Testando conexao sem senha..." -ForegroundColor Yellow
    ssh -o BatchMode=yes -o ConnectTimeout=5 "${VPS_USER}@${VPS_IP}" "echo 'Conexao sem senha OK!'"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`nPronto! Agora use: .\scripts\vps.ps1" -ForegroundColor Green
    } else {
        Write-Host "`nAlgo deu errado no teste. Verifique as permissoes no VPS." -ForegroundColor Red
    }
} else {
    Write-Host "`nFalha ao copiar chave. Verifique a senha e tente novamente." -ForegroundColor Red
}
