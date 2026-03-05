# Checklist mobile e pré-deploy

Use este fluxo antes de qualquer deploy definitivo na VPS.

## 1) Validação mobile (obrigatória)

Abra o app no navegador com DevTools (modo dispositivo) e valide ao menos:

- 360x800 (Android pequeno)
- 390x844 (iPhone 12/13)
- 768x1024 (tablet)

Checklist visual e funcional:

- Não existe corte de conteúdo horizontal.
- Botões e campos ficam clicáveis sem zoom.
- Menu, cards e tabelas não quebram layout.
- Formulários enviam corretamente.
- Fluxos críticos (login, criação/edição, envio) funcionam no touch.
- Performance aceitável em 4G simulado (sem travamento perceptível).

## 2) Gate técnico antes do deploy

No servidor, execute:

```bash
cd /root/lead-system
chmod +x scripts/predeploy_check.sh
bash scripts/predeploy_check.sh /root/lead-system-local /root/lead-system
```

Esse gate faz:

- valida git limpo no local;
- roda build local;
- confirma artefato essencial;
- cria snapshot da produção;
- mostra dry-run completo do rsync.

## 3) Deploy somente após aprovação

Se o dry-run estiver correto:

```bash
rsync -avu --delete \
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
  /root/lead-system-local/ /root/lead-system/
```

## 4) Pós-deploy

- Verificar logs sem erro.
- Abrir o app em mobile real e desktop.
- Validar novamente fluxo crítico principal.
- Se necessário rollback, restaurar snapshot mais recente.
