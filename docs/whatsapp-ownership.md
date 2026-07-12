# WhatsApp — Ownership (admin vs afiliado)

## Modelo

| Campo | Significado |
|-------|-------------|
| `created_by` | Dono do tenant (admin da marca / `users.id`) |
| `brand_id` | Marca à qual a sessão pertence |
| `owner_type` | `admin` = conta coringa do sistema · `affiliate` = conta do afiliado |
| `owner_actor_id` | Quem criou: ID do admin ou do afiliado (`users.id`) |

## Quem vê o quê

- **Painel admin:** todas as sessões da marca (`created_by` + `brand_id`), com badge em contas de afiliado.
- **App afiliado:** só `owner_type = affiliate` **e** `owner_actor_id =` afiliado logado.
- **Campanhas / disparos / distribuição:** usam contas `admin` (coringa). Afiliado não acessa Instagram no app.

## Criação

- Admin em Configurações → WhatsApp: `owner_type = admin`, `owner_actor_id =` user admin.
- Afiliado em Conexões: `owner_type = affiliate`, `owner_actor_id =` affiliate user, `created_by =` brand owner.

## API

- Escopo: `resolveInstanceAuthScope` em `src/services/instanceOwnership.ts`
- Listagem: `GET /api/instances` aplica `buildInstanceAccessFilter`
- Inbox: `resolveInboxInstanceScope` filtra conversas pela mesma regra

## Migração automática

No boot: `ensureWhatsAppInstanceOwnerSchema()` adiciona colunas e preenche legado com `owner_type = admin`, `owner_actor_id = created_by`.

## Smokes e manutenção

```bash
node agent-tools/smoke-affiliate-ownership.mjs
node agent-tools/cleanup-smoke-instances.mjs
```

O deploy verificado (`run-deploy-verified.ps1`) roda o smoke de ownership após os smokes admin.

## App afiliado

- **Conexões** — criar/gerenciar sessões próprias
- **Mensagens** (menu Mais) — inbox filtrado pelas sessões do afiliado
- Sem Instagram
- **Pareamento por código** — mesmo pipeline da org (`WhatsAppPairingFlow` + `InstanceManager`). Ver `docs/whatsapp-pairing.md` (paridade admin ↔ afiliado, invariantes Baileys).

## Admin

- Filtros na lista WhatsApp: **Todas** | **Sistema** | **Afiliados**
- Campanhas e rotação de instâncias usam só `owner_type = admin`

## Arquivos

- `src/services/instanceOwnership.ts`
- `src/core/instanceManager.ts`
- `src/index.ts` (rotas `/api/instances`)
- `src/routes/inbox.ts`
- `frontend/src/components/whatsapp/WhatsAppInstancesPanel.tsx`
- `frontend/src/pages/affiliate/AffiliateConnections.tsx`