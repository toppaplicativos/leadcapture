# LeadCapture — Modelo de Identidade

## Hierarquia

```
Users (conta autenticável)
├── consumer          Consumidor final (storefront; multi-brand)
├── org               Dono/operador de Organização  ← era role "admin"
├── staff             Equipe da org (gerente de estoque, atendente…)
├── affiliate         Afiliado / parceiro
└── platform          Admin Master (is_super_admin = true)

Organizações = brand_units (com seus brands / programas)
├── Gerente           stock_app_credentials + role manager / account_kind staff
├── Afiliado          affiliate_* + role affiliate
└── Admin da org      ownership (brand_units.user_id) + user_brand_roles slug=admin

Admin Master          users.is_super_admin + account_kind=platform
                      painel /api/master/* e host adm.*
```

## Campos

| Coluna | Valores | Significado |
|--------|---------|-------------|
| `users.account_kind` | `org`, `staff`, `affiliate`, `consumer`, `platform` | Tipo de principal |
| `users.role` | `org`, `manager`, `operator`, `affiliate`, `consumer`, `admin` | Papel operacional / JWT |
| `users.is_super_admin` | bool | **Somente** Admin Master |

### Migração legada

- Contas que se registraram no app com `role=admin` → `role=org`, `account_kind=org`
- Super admins → `account_kind=platform` (role permanece `admin` para o painel master)
- JWT antigo com `role=admin` ainda é aceito em `requireRole` (expandido para `org`)

## Jornadas de registro

| Fluxo | Endpoint | account_kind | role |
|-------|----------|--------------|------|
| Cadastro org (app) | `POST /api/auth/register` | `org` | `org` |
| Signup pago Stripe | webhook checkout | `org` | `org` |
| Gerente estoque | `POST /api/auth/stock-access` | `staff` | `manager` |
| Afiliado (marca) | affiliate-register / affiliate-access | `affiliate` | `affiliate` |
| Parceiros global | partners-register | `affiliate` | `affiliate` |
| Consumidor | *(futuro)* | `consumer` | `consumer` |
| Admin Master | CLI / Master UI | `platform` | `admin` + flag |

**Regras de segurança**

1. Cliente **não** pode enviar `role=admin` no register.
2. E-mail de org/master **não** pode ser rebaixado a gerente ou afiliado.
3. `requirePermission` **não** dá bypass cego por JWT `admin` em qualquer brand — só dono da brand, RBAC ou master.
4. Listagem global de usuários (`GET /api/auth/users`) é master-only.

## Permissões

```
is_super_admin / platform  →  acesso total (master)
brand_units.user_id        →  dono da org: acesso total à brand
user_brand_roles           →  equipe (gerente_estoque, atendente, …)
credential_type=estoque    →  app de estoque
credential_type=afiliado   →  central do afiliado
credential_type=parceiro   →  app parceiros global
```

## Código de referência

- `src/config/identity.ts` — constantes e helpers
- `src/services/identity.ts` — schema + migração boot
- `src/services/users.ts` — create/login/JWT
- `src/middleware/permissions.ts` — gates granulares
- `src/middleware/auth.ts` — `requireRole` com expand org↔admin
