# Lead Capture Mob — Plano operacional (20+ próximos passos)

Roadmap de robustez da operação logística: pagamento, confirmação, rastreio no catálogo e controle na organização.

## Já entregue (base)

1. Entrega separada do pedido multi-tenant  
2. App entregador + push + GPS  
3. Oferta sequencial/simultânea + ranking por distância  
4. Multi-parada nearest-neighbor  
5. Rastreio público por token  
6. Bridge pedido pago → entrega  

---

## Próximos 24 passos (priorizados)

### A. Pagamento e liberação logística (1–5)

1. **Confirmação de pagamento canônica** — `pago` sempre gera/atualiza entrega Mob e grava evento `payment_confirmed` com snapshot financeiro.  
2. **Gate de despacho** — não oferecer a entregador se `payment_status !== paid` (exceto “pagar na entrega”).  
3. **Modo “dinheiro na entrega”** — flag na entrega; confirmação de cobrança no app do entregador.  
4. **Reconciliação PIX/cartão** — webhook Mercado Pago → status + notificação loja + cliente.  
5. **Estorno/cancelamento** — cancelar entrega Mob + notificar entregador se em rota.

### B. Confirmação de entrega (6–10)

6. **Política de comprovação** — PIN / foto / PIN+foto configurável por org.  
7. **Validação de PIN com tentativas** — lock após N erros + auditoria.  
8. **Upload de foto de comprovante** — storage + watermark opcional.  
9. **Assinatura digital do cliente** (canvas) como prova adicional.  
10. **Código OTP SMS/WhatsApp** no momento da entrega (alternativa ao PIN fixo).

### C. Visão do cliente no catálogo (11–15)

11. **Card de logística em `/pedido`** — status Mob, ETA, PIN, link de rastreio.  
12. **Mapa ao vivo no catálogo** — pin do entregador + destino (respeitando privacidade).  
13. **Linha do tempo unificada** pedido + eventos logísticos.  
14. **Polling/SSE 10–15s** enquanto entrega ativa.  
15. **CTA WhatsApp loja** e “ligar com máscara” (sem expor celular do entregador).

### D. Controle na organização (16–20)

16. **Painel entregadores ativos** — online, ocupado, bateria, última posição, carga.  
17. **Mapa com pins de rota** — origem, coletas, destinos, polylines multi-parada.  
18. **Filtros mapa** — unidade, status, atraso, veículo.  
19. **SLA e alertas** — atraso vs ETA, sem GPS > X min, oferta expirada em loop.  
20. **Atribuição em massa / reatribuir** com histórico e motivo.

### E. Robustez e compliance (21–24)

21. **Anti-fraude de localização** — salto impossível, mock GPS, multi-device.  
22. **Retenção LGPD** — apagar trilhas GPS após N dias; token de rastreio com TTL.  
23. **Relatório financeiro diário** — taxas, payouts, frete grátis, reentregas.  
24. **Empacotamento nativo** (Capacitor) para background location em Android/iOS.

---

## Sprints concluídas

| Sprint | Itens | Status |
|---|---|---|
| Track catálogo + gate pagamento + mapa org | 1–5 | feito |
| PIN lock, foto real, COD, filtros/SLA | 6–8, 16–19 (parcial) | feito |

### Nesta sprint (detalhe)

- **PIN**: tentativas contadas, bloqueio após N (config 3–10), desbloqueio no painel, auditoria em `mob_delivery_events`
- **Foto**: `POST /api/mob/app/deliveries/:id/proof` (multer → `/uploads/mob-proofs/`), UI camera/galeria no app
- **COD**: `cod_required` se pagamento dinheiro; `collect-cod` obrigatório antes de `delivered`
- **Comprovação**: `proof_mode` = pin | photo | pin_and_photo
- **SLA**: `default_sla_minutes` + `sla_deadline_at` na entrega; flags `is_late` no mapa
- **Mapa org**: filtros (status, veículo, atrasadas, sem entregador) + KPIs online/atrasadas

### Sprint OTP + assinatura + anti-fraude (feito)

- **OTP WhatsApp**: `issueDeliveryOtp` / `verifyDeliveryOtp`, envio via InstanceManager, TTL 5 min
- **Assinatura**: canvas no app → PNG em `/uploads/mob-signatures/`
- **Anti-fraude GPS**: saltos/velocidade impossível, accuracy ruim, device switch; modos `warn|block|off`
- Config org: `require_otp`, `require_signature`, `geo_fraud_mode`

### Sprint finance + signed upload + Capacitor bridge (feito)

- **Financeiro**: `GET /api/mob/admin/finance` + aba **Financeiro** (taxas, COD, km, payout est., por dia e por entregador) — UI impeccable (skeleton, empty states, margem)
- **Upload assinado**: HMAC `upload-token` + `PUT upload-signed` + `attachProofUrl` no app
- **Capacitor**: `nativeLocation.ts` + `docs/MOB_CAPACITOR.md` (bridge web/nativo sem quebrar PWA)

### Sprint LGPD + cancel/refund cascade (feito)

- **LGPD GPS**: `gps_retention_days` em settings + purge horário de `mob_location_points` + invalidação de tokens de rastreio expirados
- **Cancel/estorno**: `commerce.updateOrderStatus` (cancelado/estornado/abandonado) → cancela entrega Mob, encerra ofertas e push ao entregador

### Sprint frota (fundação plataforma logística — feito)

Domínio separado `mobFleet` (não misturado com pedidos):

- **Tipos de veículo**: catálogo sistema (a pé → caminhão refrigerado + custom) com capacidade, CNH, flags (frio, frágil, multi-parada…)
- **Veículos**: entidade independente do entregador (placa, capacidade, ownership, status operacional)
- **Documentos**: CRLV/seguro/etc., validade, aprovação; bloqueio `docs_expired` + job horário
- **Compatibilidade explicável**: peso/volume/distância/refrigeração → `reasons` + `blockers` + score
- **APIs admin**: `/api/mob/admin/fleet/*` (types, vehicles, documents, compatibility, summary)
- **Assign com veículo**: `vehicle_id` + gate de incompatibilidade (force_vehicle opcional)
- **UI org**: aba **Frota** (`MobFleetPanel`)
- **App entregador**: lista "Meus veículos" em Mais

### Sprint central de despacho (feito)

- **Board** `GET /api/mob/admin/dispatch` — KPIs (sem entregador, oferecidas, em rota, atrasadas, disponíveis, veículos) + filas
- **Recomendação explicável** `GET .../dispatch/recommend/:id` — score ponderado (proximidade, carga, avaliação, aceite, veículo, custo) com `reasons` / `warnings` + veículo compatível
- **Assign rápido** `POST .../dispatch/assign` (courier + vehicle)
- **Rota multi** `POST .../dispatch/route`
- **UI** aba **Despacho** (`MobDispatchPanel`) com auto-refresh 12s

### Sprint roteirização multi-objetivo (feito)

- **Motor** `mobRouting`: objetivos ponderados (distância, tempo, custo, pontualidade, urgência)
- **Pickup-before-dropoff** + **preserva paradas completed** na reotimização
- **APIs**: `POST /routes/plan`, `POST /routes/:id/reoptimize` (dry_run), `POST /routes/:id/preview-insert`
- **createOrUpdateRoute** grava `optimized_json` com reasons, ETA e custo est.
- **UI Despacho**: rotas ativas, presets de objetivo, Simular / Reotimizar, lista de paradas

### Sprint manutenção de frota (feito)

- **Tabela** `mob_vehicle_maintenances` (preventiva/corretiva/emergencial/óleo/pneus/…)
- **Ciclo**: scheduled → in_progress → completed | overdue | cancelled
- **Bloqueio**: `blocks_vehicle` coloca veículo em `maintenance`; conclui libera se não houver outra OS aberta
- **Job horário**: `refreshOverdueMaintenances`
- **UI Frota → Manutenção**: listar, criar, iniciar, concluir

### Sprint turnos + check-in + geofencing (feito)

- **Turnos** `mob_shifts`: start (check-in), pause, resume, end (bloqueia se houver entrega ativa)
- **Check-in**: identidade, GPS, internet, push, kit, veículo, combustível/bateria, veículo da frota
- **Geofence** em cada `POST /location`: arrive_pickup / near_dropoff / arrive_dropoff
- **Auto-status** opcional: `courier_at_pickup`, `near_destination`, `at_destination` — **nunca** `delivered`
- **Config org**: raios coleta/destino, auto-status, exigir check-in
- **App**: sheet de check-in + pausar/retomar + banner de evento geo

### Sprint volumes / QR (feito)

- **Tabela** `mob_packages`: código único, QR payload, peso, dims, lacre, status
- **Conferência** coleta e entrega: scan código/QR, marcar ausente, confirmar carga
- **Gate**: `picked_up` e `delivered` exigem scan completo se `require_package_scan` ou package_count > 0
- **App**: painel Volumes na entrega ativa
- **Org**: config “exigir conferência de volumes” + botão **Gerar volumes/QR** na lista de entregas
- **APIs**: admin create/list; app scan/status/confirm-load

### Sprint offline outbox (feito)

- **Fila local** `localStorage` (`mob-offline-outbox-v1`): location, status, package_scan/status
- **Idempotência** `client_event_id` + tabela `mob_client_events`
- **Batch** `POST /api/mob/app/sync` + fallback sequencial
- **Auto-flush** online / visibility / a cada 12s
- **UI**: banner offline + contador + botão Sincronizar
- Location em burst: dedupe 15s por delivery

Próximas camadas: escalas/plantões, trânsito real, cache de mapa offline, marketplace.

Restantes opcionais: plugin background commercial, FCM nativo, S3 presign completo com AWS SDK, SSE mapa catálogo.
