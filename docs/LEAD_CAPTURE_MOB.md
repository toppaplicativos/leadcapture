# Lead Capture Mob

Plataforma logística multiempresa integrada ao Lead Capture.

## Superfícies

| Superfície | URL | Quem usa |
|---|---|---|
| App do entregador | `https://mob.leadcapture.online` | Entregadores (conta global) |
| Gestão na org | `/entregas` no painel admin | Organização / operadores |
| Rastreio cliente | `/rastreio/:token` | Cliente final |

## Modelo mental

- **Pedido** continua em `commerce_orders` / pedidos da loja.
- **Entrega** é entidade separada (`mob_deliveries`), 1:N com o pedido (reentregas, parciais, trocas).
- **Entregador** tem conta **global** (`mob_couriers` + `users`).
- **Vínculo** é por organização (`mob_courier_memberships`): aprovação, regras e status por marca.

## APIs

```
POST   /api/mob/register
POST   /api/mob/login
GET    /api/mob/invite/:code
GET    /api/mob/track/:token

GET    /api/mob/app/me
POST   /api/mob/app/ops-status
GET    /api/mob/app/offers
POST   /api/mob/app/deliveries/:id/accept|reject|status
POST   /api/mob/app/location

GET    /api/mob/admin/settings
PATCH  /api/mob/admin/settings
GET    /api/mob/admin/couriers
POST   /api/mob/admin/invites
GET    /api/mob/admin/deliveries
POST   /api/mob/admin/deliveries
POST   /api/mob/admin/deliveries/:id/assign
GET    /api/mob/admin/map
GET    /api/mob/admin/reports
GET    /api/mob/admin/finance?days=14
POST   /api/mob/admin/quote

POST   /api/mob/app/upload-token
PUT    /api/mob/app/upload-signed
POST   /api/mob/app/deliveries/:id/proof
GET    /api/mob/app/vehicles
GET    /api/mob/app/shift
POST   /api/mob/app/shift/start
POST   /api/mob/app/shift/pause
POST   /api/mob/app/shift/resume
POST   /api/mob/app/shift/end
POST   /api/mob/app/sync

GET    /api/mob/admin/fleet/summary
GET    /api/mob/admin/fleet/vehicle-types
POST   /api/mob/admin/fleet/vehicle-types
GET    /api/mob/admin/fleet/vehicles
POST   /api/mob/admin/fleet/vehicles
POST   /api/mob/admin/fleet/compatibility

GET    /api/mob/admin/dispatch
GET    /api/mob/admin/dispatch/recommend/:deliveryId
POST   /api/mob/admin/dispatch/assign
POST   /api/mob/admin/dispatch/route

POST   /api/mob/admin/routes/plan
POST   /api/mob/admin/routes/:id/reoptimize
POST   /api/mob/admin/routes/:id/preview-insert
```

## Domínios

| Domínio | Entidades | Serviço |
|---|---|---|
| Entregas | delivery, offer, event, route, stop | `mobLogistics` |
| Frota | vehicle_type, vehicle, vehicle_document | `mobFleet` |
| Despacho | board, recommend, assign | `mobDispatch` |
| Roteirização | multi-objective, reoptimize | `mobRouting` |
| Operação | shifts, check-in, geofence | `mobOps` |
| Volumes | packages, QR scan conference | `mobPackages` |
| Offline | client outbox + batch sync | `mobSync` + `offlineQueue` |
| Bridge pedido | order → delivery | `mobOrderBridge` |


Admin exige JWT da org + header `X-Brand-Id`.

## Fase 1 (MVP) implementada

- Ativação e config por organização
- Preço fixo e por km
- Cadastro global de entregador + convite/aprovação
- Distribuição manual / atribuição direta
- Aceite, status controlado, PIN de entrega
- Geolocalização durante turno online
- Mapa operacional (lista + coords)
- Link público de acompanhamento
- Relatórios básicos

## Fases seguintes

Ver spec completa: zonas/polígonos, auto-dispatch, remuneração, marketplace, operadores externos.

## Push notifications

Contexto de app: `mob` (Web Push VAPID).

| Evento | Quem recebe |
|---|---|
| `delivery_offered` | Entregadores online da org |
| `delivery_assigned` | Entregador atribuído |
| `delivery_cancelled` | Entregador da entrega |
| `membership_approved` / suspenso | Entregador |
| `mob_delivery_created` / `completed` | Admin da org |

Registro: app Mob → **Mais** → Notificações push (mesmo componente do design system).

## Mapa operacional

Painel `/entregas` → aba **Mapa**: Leaflet + tiles Carto light, markers por status, refresh 12s, origem da operação + entregadores com GPS + entregas ativas.

App do entregador (entrega ativa): mapa compacto coleta → destino + posição atual.

## Distribuição sequencial / simultânea

Config em **Lead Capture Mob → Configuração → Distribuição**:

| Modo | Comportamento |
|---|---|
| `manual` / `direct` | Operador atribui; botão “Ofertar (auto)” opcional |
| `sequential` | Oferece a 1 entregador por vez; timeout (padrão 30s); recusa/expira → próximo |
| `simultaneous` / `auto` | Oferece a vários online; primeiro que aceitar fica com a entrega |

Worker a cada 5s: `runMobOfferCycle` expira ofertas e redistribui + push.

Push de oferta: vibração longa, `requireInteraction`, tag `mob-offer`, som custom `/sounds/mob-offer.wav` (precache + play via `postMessage` no app).

## Ranking por distância

Candidatos ordenados por score:

`distância(km até coleta) + 8×carga_ativa + penalidade_busy − 0,6×nota`

Capacidade: `max_concurrent_per_courier` (config). Entregadores sem GPS ficam no fim da fila.

## Multi-parada

- Tabelas `mob_routes` + `mob_route_stops`
- Algoritmo nearest-neighbor (coleta antes da entrega do mesmo pedido)
- Admin: selecionar N entregas → escolher entregador → **Criar rota otimizada**
- App: **Otimizar rota (N)** com lista ordenada de paradas + botão **Feito**
- APIs: `POST /api/mob/admin/routes`, `POST /api/mob/app/routes/optimize`, `POST .../stops/:id/complete`

## Integração com pedidos

Quando o módulo está **ativado** na organização:

1. Pedido **pago** (`commerce` / checkout / webhook) → cria `mob_deliveries` se ainda não existir.
2. Status do pedido (`pago` → `em_preparacao` → `em_entrega` → `entregue` / `cancelado`) sincroniza a máquina de estados da entrega **enquanto o entregador não avançou** o fluxo (não sobrescreve rota ativa).
3. Endpoint manual: `POST /api/mob/admin/from-order/:orderId`
4. Consulta: `GET /api/mob/admin/by-order/:orderId` → `tracking_url`

Bridge: `src/services/mobOrderBridge.ts`.

## Deploy DNS / Caddy

```bash
# 1. DNS A: mob.leadcapture.online → 187.127.5.179
# 2. Provisionar Caddy + TLS:
node agent-tools/provision-mob-subdomain.mjs
# dry-run:
node agent-tools/provision-mob-subdomain.mjs --check-only
```

SPA + API no mesmo reverse proxy (porta 3001), espelhando `parceiros.leadcapture.online`.
