# Módulo de Fluxos — Diagnóstico, Arquitetura e Plano

| Campo | Valor |
|---|---|
| **Status** | Fundação (Fase 1) em evolução |
| **Data auditoria** | 2026-07-16 |
| **Decisão de base** | Evoluir `flow_automations` + `FlowExecutorService` — **não** criar motor paralelo |
| **Rotas** | UI `/fluxos` · API `/api/flows` · skill `flow.builder` · feature `flow_builder` |

---

## 1. Diagnóstico do código atual

### 1.1 Quatro sistemas paralelos de “automação”

| Sistema | Persistência | UI | Runtime | Papel real |
|---|---|---|---|---|
| **Fluxos** (`flow_automations`) | grafo nodes/edges JSON | `/fluxos` | `FlowExecutorService` | Protótipo de grafo; **base do módulo Fluxos** |
| **Automações** (`automation_definitions`) | trigger + pipeline | `/automacoes` | `automationDefinitionRunner` | SoT event-driven (IG reply em consolidação) |
| **Catálogo** (`brand_automations`) | slugs + config | Hub Catálogo | `automationTasks` + scheduler | Tarefas agendadas / webhooks legados |
| **CRM sequences** (`crm_automation_*`) | rules + jobs + DLQ | `/api/automations` | `automationRuntime` | Sequências de prospecção (legado) |

Adicionalmente: **Campanhas** (blast + métricas), **Atendimento IA cognitivo** (conversa livre), **Inbox**.

### 1.2 O que já existe em Fluxos (evidências)

| Artefato | Caminho | Estado |
|---|---|---|
| Página + editor linear | `frontend/src/pages/FlowBuilderPage.tsx` | **Incompleto** — lista + faixa horizontal de nós, sem canvas livre |
| CRUD + executions API | `src/routes/flowBuilder.ts` | **Reutilizável** (casca REST) |
| Motor de execução | `src/services/flowExecutor.ts` | **Adaptar** — actions reais (WA, tag, score, webhook); delays cap 30s; sem wait-user |
| Templates agent | `src/services/adminAgent/flowTemplates.ts` | **Adaptar** — handles `default` vs `main` |
| Helpers agent | `src/services/flowAutomation.ts` | **Reutilizável** |
| Nav / agent / plan | `nav.ts`, `canvasPages`, `planEntitlements` | **Reutilizável sem alteração** |
| Fire points | `index.ts` (WA), `clients.ts`, `orders.ts` | **Reutilizável** |

### 1.3 Construtor de blocos “validado”

Não há React Flow / xyflow no projeto.

O **melhor construtor de blocos de mensagem** em produção é:

- `MessagePipelineComposer` + `schema.ts` (`MensagemStep`: texto, mídia, botões, lista, enquete)
- `ActionPipelineEditor` (pipeline ordenado de ações)

O Flow Builder atual **não** reutiliza esses componentes — é um editor linear próprio e mais pobre.

### 1.4 Classificação resumida

| Item | Classificação |
|---|---|
| `flow_automations` + executor + executions | **Reutilizável com adaptação** (sessão, brand, wait) |
| `FlowBuilderPage` UI | **Incompleto, aproveitável** (lista/CRUD); canvas deve evoluir |
| `MessagePipelineComposer` / schema | **Reutilizável sem alteração** (conteúdo de nós de mensagem) |
| `automation_definitions` | **Separado por design** — reações pontuais; integra via “disparar automação / iniciar fluxo” |
| Campaign engine | **Reutilizável** — campanha inicia fluxo; não é o runtime de jornada |
| Cognitive agent | **Reutilizável** — nó opcional / fallback, não substitui fluxo |
| CRM automation runtime | **Legado** — não estender para Fluxos |
| LandingFlowMockup | **Obsoleto para produto** (marketing) |
| React Flow | **Ausente** — introduzir só após runtime multi-turno sólido |

### 1.5 Lacunas críticas vs. visão de produto

| Capacidade | Antes da Fase 1 |
|---|---|
| Wait for user reply / session | Não |
| Resume após restart | Não (delay in-process) |
| brand_id multi-tenant | Não (só `user_id`) |
| Versionamento publish | Não (edita o mesmo JSON ativo) |
| Fases / métricas por fase | Templates têm phases; DB/UI não |
| Canvas grafo (zoom, edges) | Não |
| Coleta validada (email, CPF…) | Não |
| Handoff humano | Não |
| Simulador | Não |
| Prioridade vs cognitivo / automações | Todos competem no inbound WA |

---

## 2. Mapa de reaproveitamento

### Front-end
- Rota `/fluxos`, nav, agent canvas, skill `flow.builder`
- Padrões visuais de cards/modais de Automações e Campanhas
- `MessagePipelineComposer` / `WhatsAppInteractiveComposer` para nós de mensagem
- Tags de template (`{{nome}}`, etc.) de campanhas/automações

### Backend
- `FlowExecutorService.fire` + persistência de timeline
- Gatilhos já ligados: `message_received`, `new_lead`, `lead_status_change`, order events
- `InstanceManager.sendMessage` / send by JID
- Padrão de jobs/idempotência de `crm_automation_jobs` (referência, não fork)
- Notifications service (já usado em `send_notification`)

### Dados
- Manter `flow_automations` / `flow_automation_executions`
- **Estender** com `brand_id`, snapshot publicado, `flow_sessions`

---

## 3. Arquitetura proposta

### Posicionamento de produto

> **Automação** = reação pontual (1 gatilho → 1+ ações).  
> **Campanha** = operação com público, período e métricas.  
> **Fluxo** = jornada multi-turno com estado, espera e conclusão.

### Modelo de dados (evolutivo)

```
flow_automations          — definição (draft nodes + published snapshot)
flow_automation_executions — log de cada run
flow_sessions             — instância viva (waiting_user, current_node, vars)
```

**Versionamento mínimo (Fase 1):**  
- `nodes_json` / `connections_json` = rascunho  
- `published_nodes_json` / `published_connections_json` + `published_version`  
- Runtime **só** executa o snapshot publicado quando `status = active`  
- Execuções em curso guardam `published_version` e continuam na versão em que começaram

### Motor

```
Inbound message
  → resume flow_session(waiting_user) se match contact+channel
  → senão FlowExecutor.fire(trigger) em fluxos active
  → política de concorrência (default: 1 sessão waiting por contact)

Nó wait_reply / collect_input
  → persiste session waiting_user + last_node
  → retorna handle null (pausa)
  → próxima mensagem retoma no nó de coleta e segue edges
```

### Integrações

| De | Para Fluxos |
|---|---|
| Automação | Ação futura `start_flow` / gatilho `automation` |
| Campanha | Ação de follow-up `start_flow` ou reply → fluxo |
| Atendimento humano | Nó `handoff_agent` → inbox / attendance |
| IA | Nó controlado (classificar / gerar) dentro de limites |

### UI (fases)

1. **Fase 1:** evoluir editor linear + painel de nós + execuções + sessions  
2. **Fase 3:** `@xyflow/react` mapeando o **mesmo** JSON de nodes/edges  

---

## 4. Plano de implementação

| Fase | Entrega | Critério |
|---|---|---|
| **1 Fundação** | brand_id, publish snapshot, sessions, wait_reply, collect_input, resume inbound, fix handles, UI básico | Criar → publicar → iniciar → aguardar resposta → retomar → encerrar |
| **2 Mensagens ricas** | MessagePipelineComposer nos nós, botões/lista, canal awareness | Botões e coleta multi-campo |
| **3 Canvas** | xyflow, zoom, validação visual | Editor profissional no mesmo schema |
| **4 Fases + métricas** | phases_json, analytics por fase | Funil operacional |
| **5 IA controlada** | nós intent/extract com schema | Sem romper grafo |
| **6 Observabilidade** | simulador, timeline UI, alertas | Debug produção |
| **7 Integração total** | campanhas, automações, pedidos, estoque | Aceite §25 completo |

### Riscos

- **Double-reply** no WhatsApp (fluxo + cognitivo + definitions + catalog)  
- Delays longos: não usar `setTimeout` além de demo; jobs durables depois  
- Templates agent com `fromHandle: "default"` — normalizar para `main`  

---

## 5. Decisões estratégicas (confirmação opcional)

1. **Base = evoluir `flow_automations`** (não tabela nova `flows` greenfield) — **adotado**  
2. **Canvas xyflow adiado** até runtime multi-turno estável — **adotado**  
3. **Prioridade inbound:** session waiting > fluxo keyword > (demais stacks) — Fase 1 só resume session; política global completa em fase posterior  
4. **Automações continuam SoT de reply IG pontual** — Fluxos para jornadas multi-turno  

---

## 6. Aceite Fase 1 (mínimo utilizável)

- [x] Auditoria e doc (`docs/FLOWS_MODULE.md`)  
- [x] Publicar versão (`POST /api/flows/:id/publish` + snapshot)  
- [x] Execução real com `waiting_user` e resume (`flow_sessions` + `handleInboundMessage`)  
- [x] Variáveis de coleta no context (`collect_*` / `wait_reply`)  
- [x] Histórico de execução na UI  
- [x] brand_id no CRUD (header `x-brand-id`)  
- [x] Handles `main`/`default`/`yes`/`no` normalizados  
- [x] Handoff humano básico (`handoff_agent`)  
- [x] Simulação linear de caminho  
- [x] Canvas xyflow (Fase 3) — `@xyflow/react`, minimap, connect, posições em `data.ui`  
- [x] MessagePipelineComposer nos nós de mensagem (Fase 2 UI)  
- [x] UI product-grade (lista + editor canvas/lista + painel config + DS canônico)  
- [x] Integração Campanha (`replyStartFlowId`) + Automação (`iniciar_fluxo`)  
- [x] Anti double-reply: sessão de fluxo bloqueia IA cognitiva no inbox  
- [x] Métricas por status/fase + teste manual `POST /api/flows/:id/start`  
- [x] Espera interativa (botões/lista), ramos yes/no, validação de grafo/loop  
- [x] Smoke tests flowTypes + runtime (`scripts/test-flow-runtime.ts`)  
- [ ] Matriz completa de testes E2E §24  
