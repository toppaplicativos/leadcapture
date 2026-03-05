#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${1:-/root/lead-system}"
SNAPSHOT_ROOT="${2:-$PROJECT_DIR/snapshots}"
STAMP="$(date +%Y%m%d_%H%M%S)"
SNAPSHOT_DIR="$SNAPSHOT_ROOT/$STAMP"

mkdir -p "$SNAPSHOT_DIR"

echo "[1/4] Copiando código e artefatos úteis..."
rsync -a \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'snapshots' \
  --exclude 'backup' \
  --exclude 'backups' \
  --exclude 'deploy_backup_*' \
  --exclude 'dist.bak_*' \
  --exclude 'dist.backup_*' \
  --exclude 'public.bak_*' \
  --exclude 'public.deploybak_*' \
  "$PROJECT_DIR/" "$SNAPSHOT_DIR/project/"

echo "[2/4] Salvo package-lock e package.json..."
cp -f "$PROJECT_DIR/package.json" "$SNAPSHOT_DIR/" 2>/dev/null || true
cp -f "$PROJECT_DIR/package-lock.json" "$SNAPSHOT_DIR/" 2>/dev/null || true

echo "[3/4] Compactando snapshot..."
tar -C "$SNAPSHOT_ROOT" -czf "$SNAPSHOT_ROOT/lead-system_$STAMP.tar.gz" "$STAMP"

echo "[4/4] Gerando checksum..."
sha256sum "$SNAPSHOT_ROOT/lead-system_$STAMP.tar.gz" > "$SNAPSHOT_ROOT/lead-system_$STAMP.tar.gz.sha256"

echo "Snapshot criado: $SNAPSHOT_ROOT/lead-system_$STAMP.tar.gz"
echo "Checksum:        $SNAPSHOT_ROOT/lead-system_$STAMP.tar.gz.sha256"
