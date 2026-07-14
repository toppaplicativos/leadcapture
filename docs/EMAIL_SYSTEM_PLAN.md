# Plano — Sistema de E-mails LeadCapture

## Objetivos

1. Templates com design system (neutros, cards, CTAs, ícones emoji/HTML-safe)
2. Escopos: **system** (marca LeadCapture) e **tenant** (marca do cliente)
3. Catálogo completo seedado + atualizável por versão
4. Envios reais ligados a eventos de produto

## Design tokens (e-mail)

| Token | Valor |
|-------|--------|
| ink | `#171717` |
| muted | `#6b6b6b` |
| canvas | `#f5f5f5` |
| surface | `#ffffff` |
| border | `#e5e5e5` |
| brand dark | `#0a0a0a` |
| success | `#10b981` |
| danger | `#ef4444` |
| warning | `#f59e0b` |
| radius card | 16–20px |
| CTA | h44-ish, solid ink, rounded 12px |

## Catálogo (resumo)

### System (LeadCapture)
welcome-owner, welcome-team, payment-failed, subscription-canceled, password-reset, trial-ending, invoice-paid, security-alert

### Tenant (loja / brand)
welcome-customer, welcome-customer-b2b, welcome-customer-retail, welcome-customer-service, welcome-affiliate, affiliate-approved, affiliate-commission, order-confirmed-buyer, order-received-seller, order-paid-buyer, order-shipped-buyer, order-delivered-buyer, order-canceled-buyer, order-canceled-seller, payment-pending-buyer, cart-abandoned, followup-lead, review-request, aniversario, recuperacao-cliente, lembrete-agendamento, novo-produto

## Gatilhos

| Evento | Template | Escopo |
|--------|----------|--------|
| Stripe signup OK | welcome-owner | system |
| Invoice paid | invoice-paid | system |
| Invoice failed | payment-failed | system |
| Sub canceled | subscription-canceled | system |
| Cliente criado (+email) | welcome-customer* | tenant |
| Afiliado criado/aprovado | welcome-affiliate / affiliate-approved | tenant |
| Pedido criado | order-received-seller + order-confirmed-buyer | tenant |
| Pedido pago | order-paid-buyer | tenant |
| Checkout expirado | cart-abandoned | tenant |

## Versionamento

`master_settings.email_catalog_version` — ao mudar, re-seed atualiza HTML dos defaults (sem brand_id).
