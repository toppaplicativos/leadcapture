# Platform Governance — Plano de Implementação

> Fonte da verdade para enforcement de planos, módulos, organizações e Master.
> Status: implementado (2026-07-09) — Fases A–D core no código.

## Objetivo

Transformar o Master de “painel cosmético” em **controle real** da plataforma:

1. Kill-switches e módulos (`platform_tools`) **enforced** em API + UI
2. Planos com **features e limites** enforced
3. Organização (`brand_units`) com status **active | suspended | archived**
4. Master operacional: assign plan, impersonation, usage, health
5. RBAC montado e aplicado em rotas críticas
6. Content hub básico (galeria ↔ materiais ↔ packs master)

## Fases

| Fase | Escopo | Entrega |
|------|--------|----------|
| **A** | Enforcement | platformTools, planEntitlements, middlewares, signup flags, FE gates |
| **B** | Master ops | assign plan, brand_id sub, impersonate, usage, health |
| **C** | RBAC | mount `/api/roles`, fix userId, permissions em rotas chave |
| **D** | Conteúdo | content-hub master + bridge materials/gallery |
| **E** | Hardening | smoke, status enum brand, cache tools |

## Modelo efetivo de entitlement

```
effective = platform_modules ∩ plan.features ∩ brand.status==active ∩ !maintenance
```

Super-admin bypassa maintenance e módulos (para operar o Master).

## Mapeamento módulo → feature de plano

| platform module | plan feature key |
|-----------------|------------------|
| prospect_radar | radar |
| campaigns | campaigns |
| automations | automations |
| ai_creatives | creative_ai |
| video_studio | creative_ai |
| instagram / facebook | meta_integration |
| affiliates | (plan module affiliates — default true se catalog) |
| custom_domain | custom_domain |
| multi_brand | multi_brand |
| agent_workspace | (platform only) |
| flow_builder | automations |
| lead_import | smart_import |
| catalog | crm (or always on) |
| whatsapp | always on (core) |

## Rotas novas Master

- `GET /api/master/entitlements/preview?user_id=`
- `POST /api/master/organizations/:id/assign-plan`
- `POST /api/master/impersonate`
- `GET /api/master/organizations/:id/usage`
- `GET /api/master/health`
- `GET /api/master/content-packs`
- `GET /api/public/platform-status` (sem auth)

## Rotas tenant

- `GET /api/entitlements` — plano + modules + usage para o FE
