# 10 melhorias — app sincronizado, rastreável e robusto

Implementado em 2026-07-09 (esta rodada + governança anterior).

| # | Melhoria | Status | Onde |
|---|----------|--------|------|
| 1 | **Request ID** em toda request/response (`X-Request-Id`) | ✅ | `middleware/requestContext.ts` |
| 2 | **Health readiness** com ping de DB + versão | ✅ | `GET /api/health` |
| 3 | **Version handshake** público para FE/SW sync | ✅ | `GET /api/public/version` |
| 4 | **Envelope de erro** com `request_id` + codes estáveis | ✅ | `middleware/errorHandler.ts`, plan/platform guards |
| 5 | **Audit de denials** de plano/módulo (log + master_audit) | ✅ | `services/entitlementAudit.ts` |
| 6 | **Entitlements sync** com platform version + brand switch | ✅ | `/api/entitlements`, FE context |
| 7 | **FE ApiError** + toast em bloqueios de plano/módulo | ✅ | `lib/api-errors.ts`, `api-admin.ts` |
| 8 | **RBAC** em products, orders, leads, campaigns | ✅ | routes + owner bypass |
| 9 | **Platform tools / plans enforced** (kill-switch real) | ✅ | governança anterior |
| 10 | **Smoke + scripts** de certificação | ✅ | `npm run smoke:governance` |

## Como certificar

```bash
npm run typecheck
npm run smoke:governance:prod
# deploy verificado
powershell -File agent-tools/run-deploy-verified.ps1
```

## Critérios de robustez

- Toda resposta de erro de API carrega `request_id` para suporte
- Health 503 se DB down (LB não manda tráfego cego)
- FE e API compartilham versão via entitlements/version
- Bloqueios de plano/módulo são rastreáveis no audit master
- Multi-brand revalida entitlements ao trocar marca

## Evolução (stamp + smoke estável + rate-limit)

| Item | Status |
|------|--------|
| `dist/build-meta.json` com `git_sha` + `build_time` no deploy | ✅ `agent-tools/write-build-meta.mjs` |
| Smoke mobile IG/FB soft-skip se conta não conectada | ✅ |
| Rate-limit em `/api/ai`, lead-import, ai-campaign, video-studio | ✅ |
| APM / OpenTelemetry | backlog |
| Contract tests OpenAPI de erros | backlog |
