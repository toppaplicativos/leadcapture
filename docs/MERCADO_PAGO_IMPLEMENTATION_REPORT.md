# Relatório técnico — Mercado Pago OAuth multitenant

## Resumo da implementação

Integração **Mercado Pago Checkout Pro** via **OAuth Authorization Code + PKCE S256**, multitenant por organização (`brand_units`).

- Plataforma = 1 app MP (credenciais em env).
- Cada org conecta a própria conta sem copiar tokens.
- Tokens AES-256-GCM; refresh automático; webhook assinado + consulta à API.
- UI em **Admin → Pagamentos** com “Conectar Mercado Pago”.

## Arquitetura reutilizada

| Existente | Uso |
|-----------|-----|
| `brand_units` | Organização (organization_id) |
| `account_id = userId::brandId` | Escopo de `payment_*` legado |
| `PaymentConfigService` encrypt/decrypt + gateways | Espelho do access token em `payment_gateways` |
| `MercadoPagoGatewayAdapter` | Preferências Checkout Pro (token-based) |
| `payment_transactions` | Cobranças locais |
| `requireBrandContext` + JWT | Auth multitenant |
| `permissionsService` | `payments:write` / owner / super_admin |
| Express routes pattern | `/api/payments/*` e público |

## Arquivos criados

- `src/services/mercadoPagoOAuth.ts` — OAuth, tokens, checkout, webhook, jobs
- `src/routes/mercadoPago.ts` — endpoints
- `docs/MERCADO_PAGO_SETUP.md` — operação
- `docs/MERCADO_PAGO_IMPLEMENTATION_REPORT.md` — este relatório
- `scripts/test-mercado-pago-oauth.mjs` — testes unitários crypto/fee

## Arquivos modificados

- `src/index.ts` — mount routes + schema boot + job 1h
- `src/middleware/platformGuard.ts` — bypass público OAuth/webhook
- `src/config/index.ts` — bloco `mercadoPago`
- `src/services/permissions.ts` — payments:refund, payments:manage
- `frontend/src/pages/admin/payments/PaymentConfigView.tsx` — UI OAuth

## Migrations (DDL no boot)

Tabelas (PostgreSQL):

- `payment_provider_connections`
- `payment_oauth_attempts`
- `payment_webhook_events`
- Colunas opcionais em `payment_transactions`: `provider_preference_id`, `external_reference`, `platform_fee_amount`, `organization_id`

## Endpoints

| Método | Path |
|--------|------|
| GET | `/api/payments/mercado-pago/status` |
| POST | `/api/payments/mercado-pago/connect` |
| POST | `/api/payments/mercado-pago/reconnect` |
| POST | `/api/payments/mercado-pago/disconnect` |
| POST | `/api/payments/mercado-pago/checkout` `{ order_id }` |
| GET | `/api/integrations/mercado-pago/oauth/callback` |
| POST/GET | `/api/integrations/mercado-pago/webhook` |

## Permissões

- `payments:read` — status
- `payments:write` / `payments:manage` — connect/disconnect/checkout
- Owner da brand e super_admin sempre permitidos

## Variáveis necessárias

Ver `docs/MERCADO_PAGO_SETUP.md`.

## Configuração manual no Mercado Pago

1. Criar app + OAuth + PKCE  
2. Redirect URI estática = `MERCADO_PAGO_REDIRECT_URI`  
3. Webhooks = `MERCADO_PAGO_WEBHOOK_URL` (payment, mp-connect)  
4. Env no servidor + restart  

## Fluxos testados

| Fluxo | Como |
|-------|------|
| PKCE S256 / state / fee | `node scripts/test-mercado-pago-oauth.mjs` → OK |
| Typecheck backend | `tsc --noEmit` |
| OAuth E2E real | Requer Client ID/Secret de teste no env |

## Riscos / limitações

- Checkout Transparente **não** implementado (só Checkout Pro).
- Assinatura de webhook exige `MERCADO_PAGO_WEBHOOK_SECRET`; em test sem secret, comportamento permissivo.
- `marketplace_fee` depende de elegibilidade da conta MP.
- Atualização de status de pedido tenta `pedidos` / `commerce_orders` best-effort conforme schema.

## Próximos passos

1. Preencher env de teste e rodar fluxo OAuth manual.
2. Checkout Transparente (fase 2).
3. UI “cobrança de teste” com pedido dummy.
4. Alertas de `reauthorization_required` no dashboard.
5. Refund API com `payments:refund`.
