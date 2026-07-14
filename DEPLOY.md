# Deploy — leadcapture

## Servidor

- **VPS:** `187.127.5.179`
- **Domínio:** `https://app.leadcapture.online`
- **OS:** Ubuntu (systemd)
- **Acesso:** `ssh root@187.127.5.179`

## Processos PM2

```
leadcapture-api  -> node dist/index.js   (porta 3001)
leadcapture-web  -> serve frontend/dist  (porta 3051)
```

Comandos:
```bash
pm2 list
pm2 logs leadcapture-api
pm2 logs leadcapture-web
pm2 restart leadcapture-api leadcapture-web
pm2 save
```

## Reverse proxy (Caddy)

O Caddy serve TODOS os dominios com TLS automatico (Let's Encrypt).
Cada dominio precisa de um bloco no `/etc/caddy/Caddyfile`:

```
# Landing page (marketing)
leadcapture.online, www.leadcapture.online {
    handle {
        reverse_proxy 127.0.0.1:3001
    }
}

# App principal (admin, catalogo, API)
app.leadcapture.online {
    handle /socket.io/* { reverse_proxy 127.0.0.1:3001 }
    handle /api/*       { reverse_proxy 127.0.0.1:3001 }
    handle /uploads/*   { reverse_proxy 127.0.0.1:3001 }
    handle              { reverse_proxy 127.0.0.1:3001 }
}
```

> **IMPORTANTE:** se adicionar novo subdominio, criar bloco no Caddyfile
> e rodar `systemctl reload caddy`. Sem o bloco, o Caddy nao obtem
> certificado SSL e o browser mostra "conexao nao segura".

### Subdomínios oficiais

| Host | App |
|---|---|
| `app.leadcapture.online` | Admin + API |
| `adm.leadcapture.online` | Master |
| `parceiros.leadcapture.online` | Afiliados global |
| `mob.leadcapture.online` | Lead Capture Mob (entregadores + rastreio) |

Provisionar Mob (DNS A já apontando para a VPS):

```bash
node agent-tools/provision-mob-subdomain.mjs
```

## Variáveis de ambiente

`.env` na raiz do projeto. Importante:
```
PORT=3001
DATABASE_URL=postgresql://...@aws-1-us-east-2.pooler.supabase.com:5432/postgres
```

## Atualizar deploy (build local + envio)

```bash
# 1. Localmente — empacotar projeto
cd /c/Users/Public/Projetos/leadcapture
tar czf /tmp/leadcapture-deploy.tar.gz \
  --exclude='node_modules' --exclude='.git' --exclude='dist' \
  --exclude='frontend/node_modules' --exclude='frontend/dist' \
  --exclude='.claude' --exclude='uploads' .

# 2. Enviar
scp /tmp/leadcapture-deploy.tar.gz root@187.127.5.179:/root/leadcapture-deploy.tar.gz

# 3. Aplicar na VPS
ssh root@187.127.5.179 << 'REMOTE'
cd /root/leadcapture
tar xzf /root/leadcapture-deploy.tar.gz --exclude='node_modules'
rm /root/leadcapture-deploy.tar.gz

# Backend
npm install
npx tsc --skipLibCheck

# Frontend
cd frontend
npm install
npx vite build
cd ..

# Sync frontend build to public/ (API serves from public/)
cp frontend/dist/index.html public/index.html
cp -r frontend/dist/assets/* public/assets/

# Restart
pm2 restart leadcapture-api leadcapture-web
pm2 save
REMOTE
```

## Deploy parcial (build local + scp direto)

Alternativa rapida sem tar — compila localmente e envia apenas os artefatos:

```bash
cd /c/Users/Public/Projetos/leadcapture

# 1. Compilar backend + frontend
npx tsc
cd frontend && npx vite build && cd ..

# 2. Enviar backend compilado
scp -r dist/ root@187.127.5.179:/root/leadcapture/dist/

# 3. Enviar frontend compilado (AMBOS os destinos!)
scp -r frontend/dist/* root@187.127.5.179:/root/leadcapture/frontend/dist/
scp -r frontend/dist/* root@187.127.5.179:/root/leadcapture/public/

# 4. Reiniciar
ssh root@187.127.5.179 'pm2 restart leadcapture-api leadcapture-web'
```

> **IMPORTANTE — Frontend é servido de DOIS locais:**
> - `index.ts` (SPA catch-all) serve de `frontend/dist/` via `reactIndexPath`
> - `server.ts` serve static de `public/` via `express.static`
>
> Se voce so copiar para `public/`, o SPA fallback ainda serve o HTML antigo
> de `frontend/dist/index.html`. Copie para AMBOS.

## Uploads e imagens de produto

### Onde ficam os uploads

- **Rota:** `/uploads/` — servido por `express.static('../uploads')`
- **Diretorio no VPS:** `/root/leadcapture/uploads/`
- **Subpastas comuns:**
  - `uploads/images/` — imagens de produto (upload via admin)
  - `uploads/product-images/` — imagens de produto (formato legado)
  - `uploads/media-cache/` — cache de midias externas (campanhas)

### Armadilha: imagens que nao existem no disco

Se os arquivos de imagem forem perdidos (ex: redeploy limpo, migracao de VPS,
limpeza acidental), o sistema se comportava assim:

1. Browser pede `/uploads/images/xxx.jpg`
2. `express.static` nao encontra o arquivo → chama `next()`
3. O catch-all `app.get("*")` em `index.ts` serve `index.html` com status **200**
4. Browser recebe HTML como imagem → mostra icone quebrado
5. `<img onError>` **nao dispara** porque o HTTP status era 200

**Correcao aplicada (jun/2026):**
- `index.ts` catch-all agora retorna `404` para qualquer path `/uploads/*` inexistente
- Frontend tem `onError` em todos os `<img>` de produto com fallback visual (icone Package)

### Migracao de VPS — checklist de uploads

Ao migrar para nova VPS ou fazer redeploy limpo:

```bash
# Verificar se uploads existem
ls -la /root/leadcapture/uploads/images/
ls -la /root/leadcapture/uploads/product-images/

# Se nao existirem, copiar da VPS antiga:
scp -r root@VPS_ANTIGA:/root/leadcapture/uploads/ /root/leadcapture/uploads/

# Testar que imagens retornam conteudo real (nao HTML):
curl -sI https://app.leadcapture.online/uploads/images/QUALQUER_UUID.jpg
# Esperado: 404 (se nao existe) ou 200 com Content-Type: image/*
# ERRADO: 200 com Content-Type: text/html (= SPA fallback vazando)
```

### Re-upload de imagens via admin

Se os arquivos foram perdidos definitivamente, os usuarios podem
re-cadastrar as imagens editando cada produto no admin (Catalogo → clicar
no produto → trocar imagem). O fallback visual (icone de pacote) garante
que a UI nao quebra enquanto as imagens nao sao re-enviadas.

## Service Worker

O frontend registra um service worker (`public/service-worker.js`) que
cacheia agressivamente. Apos deploy, usuarios podem ver a versao antiga
ate o SW atualizar. Para forcar:

```javascript
// No console do browser:
const regs = await navigator.serviceWorker.getRegistrations();
for (const r of regs) await r.unregister();
location.reload();
```

## Health check

```bash
curl -sk -o /dev/null -w '%{http_code}\n' https://app.leadcapture.online/
# Esperado: 200

# Verificar que uploads nao vazam HTML:
curl -sI https://app.leadcapture.online/uploads/images/teste.jpg
# Esperado: 404 (nao 200 com text/html)
```
