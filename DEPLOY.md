# Deploy — leadcapture

## Servidor

- **VPS:** `109.176.198.123`
- **Domínio:** `https://app.leadcapture.online`
- **OS:** Ubuntu (systemd)

## Usuário (IMPORTANTE: usar SEMPRE o user `leadcapture`, NUNCA root)

```bash
ssh -i ~/.ssh/id_ed25519_leadcapture leadcapture@109.176.198.123
# ou via alias
ssh leadcapture-vps
```

- **User:** `leadcapture` (sudo NOPASSWD)
- **Home:** `/home/leadcapture`
- **Projeto:** `/home/leadcapture/leadcapture`
- **Chave SSH local:** `~/.ssh/id_ed25519_leadcapture`

> ⚠️ **Não tocar em nada do user `root`** — a VPS hospeda outros projetos
> independentes (n8n, evolution, ollama, portainer, etc) que NÃO têm relação
> com o leadcapture. Trabalhar SEMPRE como `leadcapture`.

## Processos PM2 (rodam como user `leadcapture`)

```
leadcapture-api  -> node dist/index.js   (porta 3001)
leadcapture-web  -> serve frontend/dist  (porta 3051)
```

Comandos:
```bash
pm2 list
pm2 logs leadcapture-api
pm2 logs leadcapture-web
pm2 restart leadcapture-api
pm2 save                  # persistir entre reboots
```

Auto-start no boot via `systemd` unit `pm2-leadcapture.service`.

## Reverse proxy: Caddy (Docker)

A VPS usa **Caddy** (container `n8n-caddy-1`) como reverse proxy nas portas
80/443 com TLS automático. **Não usar Nginx**, mesmo que esteja instalado.

- Caddyfile no host: `/root/n8n/deploy/Caddyfile`
- Bloco do leadcapture aponta para `172.17.0.1:3001` (API) e `172.17.0.1:3051` (web)
- Reload: `sudo docker exec n8n-caddy-1 caddy reload --config /etc/caddy/Caddyfile`

## Variáveis de ambiente

`.env` na raiz do projeto. Importante:
```
PORT=3001
DATABASE_URL=postgresql://...@aws-1-us-east-2.pooler.supabase.com:5432/postgres
```

> Banco é **Supabase PostgreSQL** (não MySQL). O código tem adapter
> MySQL→PostgreSQL em `src/config/database.ts`.

## Atualizar deploy (build local + envio)

```bash
# 1. Localmente — empacotar projeto (sem node_modules / .git / dist)
cd /c/Users/Public/Projetos/leadcapture
tar czf /tmp/leadcapture-deploy.tar.gz \
  --exclude='node_modules' --exclude='.git' --exclude='dist' \
  --exclude='frontend/node_modules' --exclude='frontend/dist' \
  --exclude='.claude' --exclude='uploads' .

# 2. Enviar
scp -i ~/.ssh/id_ed25519_leadcapture /tmp/leadcapture-deploy.tar.gz \
  leadcapture@109.176.198.123:/home/leadcapture/leadcapture-deploy.tar.gz

# 3. Aplicar na VPS
ssh -i ~/.ssh/id_ed25519_leadcapture leadcapture@109.176.198.123 << 'REMOTE'
cd /home/leadcapture/leadcapture
tar xzf /home/leadcapture/leadcapture-deploy.tar.gz --exclude='node_modules'
rm /home/leadcapture/leadcapture-deploy.tar.gz

# Backend
npm install
npx tsc --skipLibCheck

# Frontend
cd frontend
npm install
npx vite build
cd ..

# Restart
pm2 restart leadcapture-api leadcapture-web
pm2 save
REMOTE
```

## Health check

```bash
curl -sk -o /dev/null -w '%{http_code}\n' https://app.leadcapture.online/
# Esperado: 200
```
