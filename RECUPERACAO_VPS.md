# Recuperação e continuidade do projeto (VPS)

Status atual validado em 2026-03-05:

- Backend com fonte disponível em `src/` (TypeScript).
- Build do backend validado com sucesso via `npm run build`.
- Banco com estrutura em `migration.sql` e dumps em `backups/`.
- Frontend encontrado apenas em artefatos compilados (`frontend/dist` e `public/assets`).

## 1) Tornar o estado atual auditável

1. Criar snapshot:

```bash
bash scripts/snapshot_vps.sh /root/lead-system /root/lead-system/snapshots
```

2. Garantir cópia externa do arquivo `.tar.gz` gerado (outra VPS, object storage, etc).

## 2) Inicializar versionamento Git imediatamente

```bash
cd /root/lead-system
git init
git add .
git commit -m "chore: baseline recuperada da VPS"
```

Depois, vincular remoto privado e enviar:

```bash
git remote add origin <URL_DO_REPOSITORIO_PRIVADO>
git branch -M main
git push -u origin main
```

## 3) Definir fonte canônica

- Backend canônico: `src/`.
- Build backend: `dist/` (gerado por `npm run build`).
- Frontend canônico atual: **não encontrado em fonte**; apenas bundles compilados.

## 4) Como prosseguir sem interromper operação

1. Manter produção servindo `public/` atual.
2. Evoluir backend normalmente via `src/`.
3. Em paralelo, reconstruir frontend fonte em novo projeto (ex.: React + Vite), usando a UI atual como referência funcional.
4. Quando o novo frontend estiver estável, substituir build em `public/` por pipeline formal.

## 5) Rotina mínima de segurança (obrigatória)

- Snapshot diário (`cron`) com retenção.
- Dump diário do banco MySQL.
- Push Git após cada alteração relevante.
- Armazenamento externo dos backups.

Exemplo de cron diário (02:30):

```cron
30 2 * * * /bin/bash /root/lead-system/scripts/snapshot_vps.sh /root/lead-system /root/lead-system/snapshots >> /root/lead-system/server.log 2>&1
```

## 6) Riscos e mitigação

- Risco: não ter fonte de frontend limita manutenção fina.
  - Mitigação: reconstrução assistida e gradual do frontend fonte.
- Risco: sem Git remoto, perda futura por incidente operacional.
  - Mitigação: repositório privado + snapshots externos.
