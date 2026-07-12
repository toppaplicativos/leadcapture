# Mercado Pago — configuração da plataforma (OAuth multitenant)

## Visão geral

- **Uma** aplicação Mercado Pago do SaaS (LeadCapture).
- Cada **organização** (`brand_units`) autoriza a própria conta via OAuth + PKCE S256.
- Checkout **Pro** (redirect) — sem captura de cartão no nosso app.
- Tokens criptografados (AES-256-GCM); nunca expostos ao frontend.
- Webhook único da plataforma atualiza pedidos com isolamento por `organization_id` / `external_reference`.

## Variáveis de ambiente

```env
MERCADO_PAGO_ENABLED=true
MERCADO_PAGO_ENVIRONMENT=test
MERCADO_PAGO_CLIENT_ID=
MERCADO_PAGO_CLIENT_SECRET=
MERCADO_PAGO_PUBLIC_KEY=
MERCADO_PAGO_REDIRECT_URI=https://app.leadcapture.online/api/integrations/mercado-pago/oauth/callback
MERCADO_PAGO_WEBHOOK_URL=https://app.leadcapture.online/api/integrations/mercado-pago/webhook
MERCADO_PAGO_WEBHOOK_SECRET=
MERCADO_PAGO_TOKEN_ENCRYPTION_KEY=
MERCADO_PAGO_DEFAULT_CURRENCY=BRL
MERCADO_PAGO_PLATFORM_FEE_ENABLED=false
MERCADO_PAGO_PLATFORM_FEE_TYPE=percentage
MERCADO_PAGO_PLATFORM_FEE_VALUE=0
```

Use `PAYMENT_ENCRYPTION_KEY` ou `JWT_SECRET` como fallback de criptografia se `MERCADO_PAGO_TOKEN_ENCRYPTION_KEY` não estiver definida.

## Checklist no painel Developers (uma vez)

1. Criar aplicação no [Mercado Pago Developers](https://www.mercadopago.com.br/developers).
2. Habilitar **OAuth** e **PKCE**.
3. Cadastrar **Redirect URI** exatamente igual a `MERCADO_PAGO_REDIRECT_URI`.
4. Cadastrar **Webhook URL** (`MERCADO_PAGO_WEBHOOK_URL`) para teste e produção.
5. Eventos recomendados: `payment`, `mp-connect`, chargebacks/claims se disponíveis.
6. Copiar Client ID, Client Secret, (opcional) Public Key e secret do webhook para o `.env` do servidor.
7. Reiniciar a API.

## Fluxo do lojista

1. Admin → **Pagamentos**.
2. **Conectar Mercado Pago**.
3. Login/autorização no site oficial MP.
4. Retorno em `/pagamentos?provider=mercado_pago&connection=success`.
5. Cobranças: `POST /api/payments/mercado-pago/checkout` com `{ "order_id": "..." }` (valor lido do pedido no backend).

## Endpoints

| Método | Path | Auth |
|--------|------|------|
| GET | `/api/payments/mercado-pago/status` | JWT + brand |
| POST | `/api/payments/mercado-pago/connect` | JWT + brand + payments:write/owner |
| POST | `/api/payments/mercado-pago/reconnect` | idem |
| POST | `/api/payments/mercado-pago/disconnect` | idem |
| POST | `/api/payments/mercado-pago/checkout` | JWT + brand |
| GET | `/api/integrations/mercado-pago/oauth/callback` | público |
| POST/GET | `/api/integrations/mercado-pago/webhook` | público (assinatura) |

## Jobs

- A cada 1h: limpa OAuth attempts expirados + renova tokens próximos do vencimento (15 dias).

## Segurança

- PKCE S256 + state de uso único (10 min).
- Tokens só no backend, criptografados.
- Webhook: validação `x-signature` (ts+v1) quando secret configurado; sempre consulta API do pagamento.
- Idempotência em `payment_webhook_events.idempotency_key`.
- Retorno do browser **não** marca pedido como pago.

## Teste manual

1. Configurar env de **test**.
2. Conectar conta vendedora de teste.
3. Criar pedido e `POST .../checkout`.
4. Pagar no Checkout Pro (sandbox).
5. Confirmar webhook e status `paid` / pedido atualizado.
6. Reenviar webhook → sem duplicar.
7. Desconectar → novas cobranças bloqueadas.
8. Reconectar.

## Limitações (v1)

- Checkout Transparente não implementado.
- Comissão SaaS (`marketplace_fee`) opcional via env.
- Tabelas legadas MySQL/`payment_gateways` são espelhadas com o access token para adapters existentes.
