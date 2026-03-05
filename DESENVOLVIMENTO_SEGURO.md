# Desenvolvimento seguro (sem quebrar produção)

Objetivo: continuar evoluindo o projeto sem alterar diretamente a pasta que está em operação.

## 1) Criar workspace local isolado

```bash
cd /root/lead-system
bash scripts/create_local_workspace.sh /root/lead-system /root/lead-system-local
```

Esse comando:
- copia o projeto para `/root/lead-system-local`;
- não altera nada em `/root/lead-system`;
- ignora arquivos pesados e backups antigos;
- cria `.env` local a partir de `.env.example` (se necessário).

## 2) Trabalhar somente no local

```bash
cd /root/lead-system-local
git init 2>/dev/null || true
npm run build
```

Faça mudanças, valide build e testes **no local**.

## 3) Publicar em produção com checklist

Antes de copiar qualquer mudança para produção:

1. `npm run build` sem erros no local.
2. Snapshot da produção:

```bash
bash /root/lead-system/scripts/snapshot_vps.sh /root/lead-system /root/lead-system/snapshots
```

3. Conferir diff entre local e produção:

```bash
rsync -avun --delete /root/lead-system-local/ /root/lead-system/
```

Somente após checklist, aplicar cópia real de arquivos necessários.

## 4) Regras de segurança

- Nunca editar direto em `/root/lead-system`.
- Sempre manter snapshot antes de deploy.
- Fazer deploy em janela controlada.
- Manter `git` atualizado para rollback rápido.
