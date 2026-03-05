#!/usr/bin/env bash
set -euo pipefail

LOCAL_DIR="${1:-$PWD}"
PROD_DIR="${2:-/root/lead-system}"

if [ ! -f "$LOCAL_DIR/package.json" ]; then
  echo "package.json não encontrado em: $LOCAL_DIR" >&2
  exit 1
fi

if [ "$LOCAL_DIR" = "$PROD_DIR" ]; then
  echo "LOCAL_DIR e PROD_DIR não podem ser o mesmo diretório." >&2
  echo "Use este script a partir do workspace local isolado (ex: /root/lead-system-local)." >&2
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync não encontrado." >&2
  exit 1
fi

echo "[1/6] Conferindo git limpo no workspace local..."
if [ -d "$LOCAL_DIR/.git" ]; then
  if [ -n "$(cd "$LOCAL_DIR" && git status --porcelain)" ]; then
    echo "Workspace local possui alterações não commitadas." >&2
    echo "Faça commit antes do deploy para garantir rollback confiável." >&2
    exit 1
  fi
else
  echo "Aviso: workspace local sem .git; recomendável versionar antes de deploy."
fi

echo "[2/6] Build local..."
(cd "$LOCAL_DIR" && npm run build)

echo "[3/6] Validando artefatos essenciais..."
if [ ! -f "$LOCAL_DIR/dist/index.js" ]; then
  echo "Artefato esperado não encontrado: $LOCAL_DIR/dist/index.js" >&2
  exit 1
fi

if [ ! -f "$LOCAL_DIR/.env" ]; then
  echo "Aviso: .env não encontrado no local ($LOCAL_DIR/.env)."
fi

echo "[4/6] Snapshot de produção antes do deploy..."
if [ -x "$PROD_DIR/scripts/snapshot_vps.sh" ]; then
  bash "$PROD_DIR/scripts/snapshot_vps.sh" "$PROD_DIR" "$PROD_DIR/snapshots"
else
  echo "Script de snapshot não encontrado em $PROD_DIR/scripts/snapshot_vps.sh" >&2
  exit 1
fi

echo "[5/6] Dry-run do rsync (nada será alterado)..."
rsync -avun \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude 'auth_whatsapp' \
  --exclude 'uploads' \
  --exclude '*.log' \
  --exclude 'snapshots' \
  --exclude 'backup' \
  --exclude 'backups' \
  --exclude 'deploy_backup_*' \
  --exclude 'dist.bak_*' \
  --exclude 'dist.backup_*' \
  --exclude 'public.bak_*' \
  --exclude 'public.deploybak_*' \
  "$LOCAL_DIR/" "$PROD_DIR/"

echo "[6/6] Checklist concluído."
echo "Se o dry-run estiver correto, aplique o deploy com:"
echo "rsync -avu --exclude '.git' --exclude 'node_modules' --exclude '.env' --exclude 'auth_whatsapp' --exclude 'uploads' --exclude '*.log' --exclude 'snapshots' --exclude 'backup' --exclude 'backups' --exclude 'deploy_backup_*' --exclude 'dist.bak_*' --exclude 'dist.backup_*' --exclude 'public.bak_*' --exclude 'public.deploybak_*' \"$LOCAL_DIR/\" \"$PROD_DIR/\""
