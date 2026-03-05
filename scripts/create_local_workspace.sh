#!/usr/bin/env bash
set -euo pipefail

PROD_DIR="${1:-/root/lead-system}"
LOCAL_DIR="${2:-/root/lead-system-local}"

if [ ! -d "$PROD_DIR" ]; then
  echo "Diretório de produção não encontrado: $PROD_DIR" >&2
  exit 1
fi

if [ "$PROD_DIR" = "$LOCAL_DIR" ]; then
  echo "LOCAL_DIR não pode ser igual ao PROD_DIR" >&2
  exit 1
fi

echo "[1/4] Criando diretório local isolado..."
mkdir -p "$LOCAL_DIR"

echo "[2/4] Sincronizando código de forma segura (sem tocar na produção)..."
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude 'snapshots' \
  --exclude 'backup' \
  --exclude 'backups' \
  --exclude 'deploy_backup_*' \
  --exclude 'dist.bak_*' \
  --exclude 'dist.backup_*' \
  --exclude 'public.bak_*' \
  --exclude 'public.deploybak_*' \
  "$PROD_DIR/" "$LOCAL_DIR/"

echo "[3/4] Preparando ambiente local..."
if [ -f "$PROD_DIR/.env.example" ] && [ ! -f "$LOCAL_DIR/.env" ]; then
  cp "$PROD_DIR/.env.example" "$LOCAL_DIR/.env"
  echo "Arquivo .env local criado a partir de .env.example"
fi

if [ -f "$LOCAL_DIR/package.json" ]; then
  (cd "$LOCAL_DIR" && npm install)
fi

echo "[4/4] Finalizado."
echo "Workspace local pronto em: $LOCAL_DIR"
echo "Próximos passos:"
echo "  cd $LOCAL_DIR"
echo "  npm run build"
echo "  (opcional) npm run dev"
