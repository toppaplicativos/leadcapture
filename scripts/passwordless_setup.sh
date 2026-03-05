#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-all}"
TARGET_USER="${SUDO_USER:-$USER}"
TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
SSH_DIR="$TARGET_HOME/.ssh"
KEY_PATH="$SSH_DIR/id_ed25519"
SUDOERS_FILE="/etc/sudoers.d/$TARGET_USER-nopasswd"

print_help() {
  cat <<'EOF'
Uso:
  scripts/passwordless_setup.sh [modo]

Modos:
  ssh-key        Gera chave SSH e mostra chave pública para cadastro no Git (GitHub/GitLab/Bitbucket)
  local-ssh      Habilita login sem senha neste servidor para o usuário atual (authorized_keys)
  sudo-nopasswd  Remove pedido de senha para sudo do usuário atual (NOPASSWD)
  all            Executa os 3 passos acima (padrão)

Exemplos:
  scripts/passwordless_setup.sh ssh-key
  scripts/passwordless_setup.sh sudo-nopasswd
  scripts/passwordless_setup.sh all
EOF
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Comando obrigatório não encontrado: $1" >&2
    exit 1
  fi
}

ensure_ssh_key() {
  need_cmd ssh-keygen
  mkdir -p "$SSH_DIR"
  chmod 700 "$SSH_DIR"

  if [ ! -f "$KEY_PATH" ]; then
    echo "[ssh-key] Gerando chave $KEY_PATH..."
    ssh-keygen -t ed25519 -C "$TARGET_USER@$(hostname)" -f "$KEY_PATH" -N ""
  else
    echo "[ssh-key] Chave já existe em $KEY_PATH"
  fi

  chmod 600 "$KEY_PATH"
  chmod 644 "$KEY_PATH.pub"
  chown -R "$TARGET_USER":"$TARGET_USER" "$SSH_DIR"

  echo ""
  echo "[ssh-key] Chave pública (copie e cadastre no provedor Git):"
  cat "$KEY_PATH.pub"
  echo ""
  echo "Depois de cadastrar, teste com:"
  echo "  ssh -T git@github.com"
}

setup_local_ssh() {
  mkdir -p "$SSH_DIR"
  chmod 700 "$SSH_DIR"

  if [ ! -f "$KEY_PATH.pub" ]; then
    echo "[local-ssh] Chave pública não encontrada; gerando..."
    ensure_ssh_key
  fi

  touch "$SSH_DIR/authorized_keys"
  chmod 600 "$SSH_DIR/authorized_keys"

  if ! grep -q -F "$(cat "$KEY_PATH.pub")" "$SSH_DIR/authorized_keys"; then
    cat "$KEY_PATH.pub" >> "$SSH_DIR/authorized_keys"
    echo "[local-ssh] Chave adicionada em authorized_keys"
  else
    echo "[local-ssh] Chave já estava em authorized_keys"
  fi

  chown -R "$TARGET_USER":"$TARGET_USER" "$SSH_DIR"
}

setup_sudo_nopasswd() {
  need_cmd visudo

  if [ "$(id -u)" -ne 0 ]; then
    echo "[sudo-nopasswd] Elevando com sudo para gravar em /etc/sudoers.d..."
    sudo "$0" sudo-nopasswd
    return
  fi

  echo "$TARGET_USER ALL=(ALL) NOPASSWD:ALL" > "$SUDOERS_FILE"
  chmod 440 "$SUDOERS_FILE"
  visudo -cf "$SUDOERS_FILE" >/dev/null
  echo "[sudo-nopasswd] Regra criada: $SUDOERS_FILE"
}

case "$MODE" in
  -h|--help|help)
    print_help
    ;;
  ssh-key)
    ensure_ssh_key
    ;;
  local-ssh)
    setup_local_ssh
    ;;
  sudo-nopasswd)
    setup_sudo_nopasswd
    ;;
  all)
    ensure_ssh_key
    setup_local_ssh
    setup_sudo_nopasswd
    ;;
  *)
    echo "Modo inválido: $MODE" >&2
    print_help
    exit 1
    ;;
esac

echo "Concluído."
