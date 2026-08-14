# Status da execução da auditoria — 09/08/2026

## Correções aplicadas

- Conversão afiliada explícita no servidor, com criação/atualização idempotente de cliente, venda/comissão opcional e retorno baseado no estado persistido.
- `client_event_id` em progresso e fila offline; reenvio do mesmo evento não duplica ação.
- Recuperação de itens `processing` abandonados, proteção contra oportunidade aberta duplicada e unicidade de venda por pedido.
- `channel_unavailable` respeita canais restantes; o contato só sai da fila quando o servidor confirma.
- Workspace sem marca selecionada não chama endpoints de Instagram/Facebook sem `brand_id` e não fica preso em hidratação.
- Menu de atalhos desktop corrigido; `/assistente` foi separado corretamente do canvas `/admin` nos smokes.
- Abas mobile de afiliado sem clipping e camada visual alinhada às cores da marca.
- Entry point legado `src/server.ts` não inicia segundo listener; produção usa `src/index.ts`.

## Evidências executadas

- `npm run typecheck`: aprovado.
- `npm run typecheck:fe`: aprovado.
- `npm run build`: aprovado.
- `frontend/npm run build`: aprovado; permanece apenas alerta de bundle grande.
- Smokes de runtime, inline edit e workspace triggers: aprovados.
- Deploy verificado no VPS `187.127.5.179`; `leadcapture-api` e `leadcapture-web` online.
- `verify-deploy.mjs` e `smoke-app.mjs`: aprovados para `/`, `/login`, `/admin` e `/inicio`, sem erro de chunk.
- `/api/health`: `status=ok`, `ready=true`, banco ativo, pool sem espera e 12 instâncias WhatsApp no último check.
- Smoke autenticado confirmou login e carregamento do workspace em desktop/mobile.

## Lacunas que exigem evidência ou decisão de negócio

- Gate B: comissão, PIX, termos, cancelamento/refund e payout com dados comerciais reais.
- Gate C: prova completa de parceiro/afiliado autenticado com marca e programa de teste selecionados.
- Gate D: backup/restore, concorrência real de claim e rollback em staging.
- Gate E: aprovação de termos, LGPD, SLA, cobrança, limites e suporte.

## Atualização final após correção de ambiente

- `NODE_ENV` do VPS corrigido de `development` para `production`, com backup do `.env` anterior.
- API reiniciada e novamente validada: `status=ok`, `ready=true`, banco `up`, rotas públicas e chunks aprovados.
- Após o restart, 12 registros WhatsApp permanecem no banco como `disconnected` e não há `creds.json` restaurável no VPS. O pareamento humano das sessões é obrigatório antes de liberar operação WhatsApp/comercial.

## Status de release

Deploy técnico realizado. Não marcar como “disponível para venda comercial” enquanto os gates B–E não tiverem evidência assinada pelo responsável do produto.
