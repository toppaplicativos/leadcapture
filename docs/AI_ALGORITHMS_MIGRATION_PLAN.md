# Plano de migração — Master · Algoritmos (IA global)

**Status:** proposta de implementação  
**Data:** 2026-07-10  
**Objetivo:** centralizar no **Admin Master** a escolha de **qual modelo/provider** roda em cada ação de IA do SaaS, separando **texto · imagem · vídeo**. Providers (chaves API) continuam em Providers IA; **algoritmos** são o roteamento de funções.

---

## 1. Problema atual

| Situação | Efeito |
|----------|--------|
| Preferências em `integrations` provider=`__preferences__` **por org/usuário** | Cada marca escolhe modelo; SaaS não tem política global única |
| `platform_tools.default_ai_preferences` existe no master | **Não é lido** pelo `aiRouter` (morto) |
| Catálogo em `src/config/ai-models.ts` | Bom, mas só 3 buckets (text/image/video), não por **função** |
| ~40% das ações usam `aiRouter` | Preferências org funcionam |
| ~60% forçam Gemini / env / hardcode | Provedores IA da org **não afetam** campanhas, creative text simples, video, etc. |
| Video prefs salvas na UI | Geração real usa só `VEO_VIDEO_MODEL` + chave Gemini |
| Kling/Runway no catálogo | Sem pipeline de geração |

**Direção desejada:**  
**Master → Algoritmos** define o “mapa função → modelo”.  
**Master → Providers** só chaves globais.  
Org pode no máximo **usar chave própria** (opcional, fase 2), **não** redefinir algoritmo de plataforma (salvo feature flag futura).

---

## 2. Modelo conceitual

```
┌─────────────────────────────────────────────────────────────┐
│ MASTER                                                      │
│  Providers IA     → chaves __global__ (openai, gemini, …)   │
│  Algoritmos       → function_key → { modality, provider,    │
│                                     model, fallback?, … }   │
└───────────────────────────┬─────────────────────────────────┘
                            │ resolveAlgorithm(functionKey)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ aiRouter / AlgorithmRegistry (única porta de saída)         │
│  1. algorithm global (master)                               │
│  2. fallback modality default (text|image|video)            │
│  3. DEFAULT_PREFERENCES código                              │
│  + chave: brand → user → __global__ → env                   │
└─────────────────────────────────────────────────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
       TEXT LLM         IMAGE GEN          VIDEO GEN
```

### Separação de responsabilidades

| Superfície | Responsabilidade |
|------------|------------------|
| **Algoritmos** (novo) | Qual **função** usa qual **provider+model** (política SaaS) |
| **Providers** (existente) | Credenciais / teste de conexão |
| **Org Provedores IA** (legado) | Fase 1: **somente chaves** da org. Preferências de modelo **descontinuadas** ou read-only apontando para global |

---

## 3. Inventário de funções (function_key)

Cada linha vira um card no Master · Algoritmos.

### 3.1 Texto (`modality: text`)

| # | function_key | Nome UX | Código hoje | Roteamento atual |
|---|--------------|---------|-------------|------------------|
| T01 | `text.router.default` | Texto genérico (router) | `aiRouter.generateText/Json` | Prefs org |
| T02 | `text.cognitive.reason` | WhatsApp · raciocínio | `cognitive/reasoner` | Prefs |
| T03 | `text.cognitive.compose` | WhatsApp · composição | `cognitive/composer` | Prefs |
| T04 | `text.whatsapp.legacy` | WhatsApp agent legado | `whatsappAgent` | Prefs/Gemini |
| T05 | `text.campaign.message` | Campanha · mensagem | `campaignEngine` + `gemini.generateMessage` | **Gemini hard** |
| T06 | `text.message.analyze` | Analisar mensagem | `ai.analyzeMessage` | Gemini hard |
| T07 | `text.message.improve` | Melhorar mensagem | `ai.improveMessage` | Gemini hard |
| T08 | `text.message.variations` | Variações em massa | `ai.generateBulkVariations` | Gemini hard |
| T09 | `text.memory.update` | Memory engine | `memoryEngine` | Gemini + env |
| T10 | `text.response.classify` | Classificar resposta | `responseIntelligence` | Gemini hard |
| T11 | `text.prospect.match` | Match prospecção | `prospectionMatch` | **hardcode gemini-2.0-flash** |
| T12 | `text.admin.orchestrator` | Admin agent · orquestração | `adminAgent/orchestrator` | Prefs |
| T13 | `text.admin.memory` | Admin agent · memória | `adminAgent/memory` | Prefs |
| T14 | `text.admin.summary` | Admin agent · resumo | `adminAgent/sessionSummary` | Prefs |
| T15 | `text.admin.product_draft` | Admin agent · rascunho produto | `adminAgent/actions` | Prefs |
| T16 | `text.campaign.squad` | Squad campanha IA | `aiCampaignSquad` | Prefs |
| T17 | `text.automation.tasks` | Automações IA | `automationTasks` | Prefs |
| T18 | `text.skill.trainer` | Treino de skill | `skillTrainerSquad` | Prefs |
| T19 | `text.skill.templates` | Templates de skill | `skillTemplates` | Prefs |
| T20 | `text.lead.ideas` | Ideias de lead | `routes/leadIdeas` | Prefs |
| T21 | `text.import.extract` | Import inteligente | `smartLeadImport/aiExtractor` | Prefs→Gemini |
| T22 | `text.followup.narrative` | Follow-up ruler | `followupRuler` | Prefs→Gemini |
| T23 | `text.composition.director` | Direção de composição | `compositionDirector` | Prefs |
| T24 | `text.affiliate.program_fill` | Afiliados · preencher programa | `affiliateProgramAiFill` | Prefs |
| T25 | `text.affiliate.product_learn` | Afiliados · aprendizado produto | `affiliateProductLearning` | Prefs |
| T26 | `text.instagram.reply` | IG · resposta IA | `instagramReplyHelpers` | Prefs |
| T27 | `text.instagram.caption` | IG · legenda/copy | `creativeStudio.generateText` via IG | **Env Gemini** |
| T28 | `text.creative.copy` | Criativos · copy | `creativeStudio.generateText` | **Env Gemini** |
| T29 | `text.product.description` | Produto · descrição | `products` / `commerce` | Gemini plain |
| T30 | `text.storefront.compose` | Loja · página AI | `storefront` | Gemini JSON |
| T31 | `text.video.spec` | Video studio · spec JSON | `videoComposer` | **hardcode flash** |
| T32 | `text.landing.chat` | Landing Mira (público) | `landingChat` | master_settings |
| T33 | `text.skill.vision_ocr` | Skill · OCR/intake vision | `skillTrainerSquad` stepIntake | Gemini vision |

### 3.2 Imagem (`modality: image`)

| # | function_key | Nome UX | Código hoje | Roteamento atual |
|---|--------------|---------|-------------|------------------|
| I01 | `image.product.studio` | Estúdio de produto | `generateProductStudioImages` + autoCompose | Prefs imagem ✓ |
| I02 | `image.creative.simple` | Criativo simples | `creativeStudio.generateImage` | Env Gemini |
| I03 | `image.creative.remix` | Remix / edição | `creativeStudio.remixImage` | Env Gemini |
| I04 | `image.admin.product` | Admin agent · imagem produto | `adminAgent/actions` | Studio env |
| I05 | `image.vision.analyze` | Análise / OCR / legendas | `routes/images` + import | Gemini vision |
| I06 | `image.import.extract` | Import leads de imagem | `smartLeadImport` vision | Gemini |

### 3.3 Vídeo (`modality: video`)

| # | function_key | Nome UX | Código hoje | Roteamento atual |
|---|--------------|---------|-------------|------------------|
| V01 | `video.generate.veo` | Geração Veo (long-running) | `startVideoGeneration` | Env Veo + Gemini key |
| V02 | `video.studio.remotion` | Video Studio Remotion | compose/refine spec (texto) | ver T31 |
| V03 | `video.generate.grok` | Imagine Video (futuro) | catálogo only | **não implementado** |
| V04 | `video.generate.kling` | Kling (futuro) | catálogo only | **não implementado** |

### 3.4 Fora de escopo imediato (registrar, não implementar)

| function_key | Nota |
|--------------|------|
| `embed.search` | Embeddings — não existe |
| `audio.stt` / `audio.tts` | Não existe |

**Total mapeado para v1:** ~33 text + 6 image + 2 video ativos = **41 algoritmos** (V03/V04 como “coming soon” no UI).

---

## 4. Schema de dados (novo)

### 4.1 Tabela `ai_algorithms` (global)

```sql
CREATE TABLE IF NOT EXISTS ai_algorithms (
  function_key   VARCHAR(80) PRIMARY KEY,   -- ex: text.campaign.message
  modality       VARCHAR(16) NOT NULL,      -- text | image | video | vision
  label          VARCHAR(160) NOT NULL,
  description    TEXT NULL,
  group_name     VARCHAR(80) NULL,          -- WhatsApp, Campanhas, Criativos…
  provider       VARCHAR(40) NOT NULL,      -- openai | gemini | grok | veo | kling
  model          VARCHAR(120) NOT NULL,
  fallback_provider VARCHAR(40) NULL,
  fallback_model    VARCHAR(120) NULL,
  temperature    NUMERIC(4,2) NULL,
  max_tokens     INT NULL,
  is_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  is_system      BOOLEAN NOT NULL DEFAULT TRUE, -- seed do código
  metadata       JSONB NULL,                -- timeouts, aspect ratios, etc.
  updated_by     VARCHAR(36) NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_algorithms_modality ON ai_algorithms (modality);
CREATE INDEX IF NOT EXISTS idx_ai_algorithms_group ON ai_algorithms (group_name);
```

### 4.2 Tabela `ai_algorithm_audit` (histórico)

```sql
CREATE TABLE IF NOT EXISTS ai_algorithm_audit (
  id             VARCHAR(36) PRIMARY KEY,
  function_key   VARCHAR(80) NOT NULL,
  actor_user_id  VARCHAR(36) NULL,
  actor_email    VARCHAR(255) NULL,
  before_json    JSONB NULL,
  after_json     JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4.3 Seed registry (código)

`src/config/ai-algorithms.ts` — lista canônica de `function_key` + defaults.  
Boot: `algorithmService.ensureSchema()` + upsert seed **sem sobrescrever** overrides manuais do master (`is_system` + flag `locked_by_admin` ou: seed só se row não existe).

### 4.4 Resolução (ordem)

```
resolve(functionKey, scope):
  1. row ai_algorithms[functionKey] if is_enabled
  2. modality default (text.router.default | image.product.studio | video.generate.veo)
  3. DEFAULT_PREFERENCES[modality]
  4. key = IntegrationService chain (brand → user → __global__ → env)
  5. if !key && fallback_provider → tentar fallback
  6. else throw ALGORITHM_PROVIDER_KEY_MISSING
```

---

## 5. API Master

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/api/master/algorithms` | Lista (filtro modality, group, search) |
| GET | `/api/master/algorithms/:functionKey` | Detalhe + last runs (opcional) |
| PUT | `/api/master/algorithms/:functionKey` | Atualiza provider/model/fallback/enabled |
| POST | `/api/master/algorithms/seed` | Re-seed missing keys only |
| POST | `/api/master/algorithms/:functionKey/test` | Gera prompt mínimo de smoke |
| GET | `/api/master/algorithms/catalog` | AI_MODELS + providers com key global OK |
| GET | `/api/master/algorithms/audit` | Últimas N alterações |

### Payload PUT

```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "fallback_provider": "openai",
  "fallback_model": "gpt-4.1-mini",
  "temperature": 0.4,
  "is_enabled": true
}
```

Validar: `model` ∈ catálogo do `provider` para a `modality` (ou allowlist).

---

## 6. UI Master · Algoritmos

### Nav

```
MasterShell: … | Providers IA | Algoritmos | Integrações | …
```

### Layout (3 abas)

1. **Texto** — grupos: WhatsApp, Campanhas, CRM/Leads, Admin Agent, Afiliados, Instagram, Loja, Sistema  
2. **Imagem** — Estúdio produto, Criativos, Visão/OCR  
3. **Vídeo** — Geração, Video Studio  

Cada linha:

- Nome + function_key (mono)
- Provider badge + model
- Status: ativo / desligado / sem chave global
- Ações: Editar · Testar · Histórico

Drawer de edição:

- Select provider (só os com chave global configurada, com warning se sem chave)
- Select model (filtrado por catálogo)
- Fallback opcional
- Temperature / max tokens (avançado)
- “Usado em:” link para docs internos

### O que **não** fica mais na org

- Página tenant **Provedores IA** → renomear/sub-copy: **“Chaves de API da organização”**  
- Remover tabs de escolha de modelo (ou mostrar read-only: “Definido pelo Master · Algoritmos”)  
- Migração de dados: `__preferences__` org **ignorado** na resolução (fase 1) ou usado só como override se `platform_tools.allow_org_algorithm_override` (fase 3)

---

## 7. Código — mudanças por camada

### 7.1 Novo serviço

`src/services/algorithms.ts`

- `ensureSchema`, `list`, `get`, `upsert`, `seedFromRegistry`
- `resolve(functionKey, scope)` → `{ provider, model, key, temperature, source }`
- Cache TTL 60s + invalidate on PUT

### 7.2 `aiRouter` (evoluir)

```ts
// Antes
getPreferences(scope) → modality prefs org

// Depois
resolveAlgorithm(functionKey, scope) → algorithm global + key chain
generateText(prompt, scope, { functionKey: 'text.campaign.message' })
generateJson(..., { functionKey })
getImageProvider(scope, { functionKey: 'image.product.studio' })
```

Compat: se `functionKey` omitido → `text.router.default` / `image.product.studio`.

### 7.3 Migrar call sites (ordem de PRs)

| PR | Escopo | function_keys |
|----|--------|---------------|
| **PR0** | Schema + seed + Master UI + API (sem mudar runtime) | — |
| **PR1** | `aiRouter` resolve global; orgs paramam de escrever prefs de modelo | T01 + defaults |
| **PR2** | WhatsApp cognitive + agent | T02–T04 |
| **PR3** | Campanhas + message analyze/improve | T05–T08 |
| **PR4** | Memory, classify, prospect | T09–T11 |
| **PR5** | Admin agent + squads + automations + skills | T12–T19 |
| **PR6** | Leads/import/followup/composition | T20–T23 |
| **PR7** | Afiliados + IG reply | T24–T26 |
| **PR8** | Creative studio text+image (sair de env hard) | T27–T28, I02–I04 |
| **PR9** | Product studio já usa prefs → apontar functionKey | I01 |
| **PR10** | Vision analyze + import image | I05–I06 |
| **PR11** | Video Veo + videoComposer | V01, T31 |
| **PR12** | Landing chat unificado | T32 |
| **PR13** | Deprecar UI modelo na org; docs; cleanup | — |

Cada PR: greps de `gemini.generate` / `config.creatives` / hardcode model devem **diminuir**.

### 7.4 Providers vs Algoritmos

| MasterProviders | MasterAlgoritmos |
|-----------------|------------------|
| Chaves + test | function → model |
| priority/active | is_enabled |
| Não escolhe função | Não edita chave |

---

## 8. Plano de migração de dados

1. **Deploy PR0** — cria tabelas, seed 41 rows com defaults atuais (`DEFAULT_PREFERENCES` + hardcodes conhecidos).  
2. **Inventário prod** — script `scripts/audit-ai-algorithms.mjs` lista call sites vs registry.  
3. **Cutover PR1** — `getPreferences` passa a ler **global** (`ai_algorithms` modality defaults) em vez de `__preferences__` org.  
4. **Snapshot** — export `__preferences__` org para JSON (backup 30 dias) em `master_settings.ai_org_prefs_backup`.  
5. **Org UI** — banner: “Modelos definidos globalmente no Master”.  
6. **Hard paths** — PRs 2–12 substituem Gemini direto por `aiRouter.*({ functionKey })`.  
7. **Observabilidade** — log estruturado `algorithm_resolved: { functionKey, provider, model, source }`.  
8. **Rollback** — flag `platform_tools.algorithms_v1_enabled=false` restaura prefs org + DEFAULT.

---

## 9. Segurança e multi-tenant

- Só `requireSuperAdmin` muta algoritmos.  
- Keys: nunca retornar plaintext no GET algorithms (só “has_key: true”).  
- Test endpoint: rate limit + sem PII no prompt.  
- Org **não** pode forçar modelo mais caro (fase 1).  
- Audit log em `ai_algorithm_audit` + `master_audit_log`.

---

## 10. Métricas de sucesso

| Métrica | Alvo |
|---------|------|
| % ações IA passando por `resolveAlgorithm` | ≥ 95% em 4 semanas |
| Call sites Gemini hardcode fora do router | 0 em paths de produção |
| Org UI sem seletor de modelo | 100% |
| Tempo médio para mudar modelo de campanha | < 30s no Master |
| Test smoke por modality | 3 tests verdes no CI/deploy |

---

## 11. Checklist de auditoria (≥ 20 pontos)

Usar em review/PR e smoke pós-deploy.

| # | Ponto de auditoria | Como verificar | Critério de aceite |
|---|-------------------|----------------|--------------------|
| A01 | Registry completo vs inventário | Diff `ai-algorithms.ts` × tabela §3 | 100% function_keys presentes no seed |
| A02 | Seed idempotente | Rodar seed 2× | Sem duplicar; overrides master preservados |
| A03 | Coluna brand_id / schema | `ensureSchema` boot | Tabelas criadas sem erro |
| A04 | Master GET lista | `/api/master/algorithms` | 200, ≥ 30 rows, groupadas |
| A05 | Master PUT valida modelo | PUT model inválido | 400 `invalid_model` |
| A06 | Master PUT valida modality | openai model de image em text | 400 |
| A07 | Só super_admin muta | JWT org comum | 403 |
| A08 | Audit trail | PUT + select audit | before/after + actor |
| A09 | Cache invalidation | PUT + resolve imediato | Novo model em < 1s |
| A10 | Resolve sem chave | Provider sem key global | Erro claro `ALGORITHM_PROVIDER_KEY_MISSING` |
| A11 | Fallback provider | Primary fail / no key | Usa fallback se configurado |
| A12 | Campanha usa algorithm | Enviar 1 msg campanha + logs | `function_key=text.campaign.message` |
| A13 | Product studio image | Gerar 1 imagem produto | `image.product.studio` + provider master |
| A14 | Creative simple image | Path I02 | Não ignora algorithm (pós PR8) |
| A15 | Video Veo | start job | `video.generate.veo` model do master |
| A16 | Landing chat | Chat público | `text.landing.chat` ou settings legados documentados |
| A17 | Org não sobrescreve modelo | Org muda prefs antigas | Runtime **ignora** (pós PR1) |
| A18 | Org ainda resolve chave própria | Org com OpenAI key | Chain brand→global ainda funciona |
| A19 | Providers page inalterada | Master Providers | Salvar key Gemini OK |
| A20 | UI Algoritmos 3 abas | Manual | Texto / Imagem / Vídeo filtráveis |
| A21 | Grep residual hardcode | `rg "gemini-2.0-flash\|creatives.textModel"` | Só em seed/legacy documentado |
| A22 | platform_tools.default_ai_preferences | Deprecar ou sincronizar | Documentado; não duas fontes de verdade |
| A23 | Entitlements module gate | Flag módulo IA off | Algoritmos ainda configuráveis (master), execução bloqueada no tenant |
| A24 | Rate limit test endpoint | 20 tests/min | 429 após limite |
| A25 | Rollback flag | `algorithms_v1_enabled=false` | Volta comportamento pré-PR1 |
| A26 | Performance resolve | 100 resolve em loop | p95 < 20ms com cache |
| A27 | Multi-brand mesma org | 2 brands, mesma key | Mesmo algorithm; keys por brand se existirem |
| A28 | Super admin impersonate | Impersonate + gerar texto | Usa algorithm global + keys do tenant |
| A29 | Log PII | Logs de algorithm | Prompt não logado em full (truncate) |
| A30 | Docs PRODUCT/DESIGN | Atualizar DESIGN.md | Algoritmos descritos como console ops |

---

## 12. Cronograma sugerido

| Semana | Entrega |
|--------|---------|
| **S1** | PR0: schema, seed, API, UI Master Algoritmos (read/write, sem runtime) |
| **S1** | PR1: resolve global no aiRouter + flag + audit A01–A11, A17–A20 |
| **S2** | PR2–PR5: WhatsApp, campanhas, memory, admin/squads |
| **S2** | Audit A12, A21 parcial |
| **S3** | PR6–PR9: leads, afiliados, IG, creatives image |
| **S3** | Audit A13–A14 |
| **S4** | PR10–PR13: vision, video, landing, deprecar UI org, cleanup |
| **S4** | Audit A15–A16, A22–A30 + smoke deploy |

---

## 13. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Quebrar campanhas em produção | PR3 com feature flag por function_key |
| Master escolhe modelo sem key | UI só lista providers com `has_key` + warning |
| Dupla fonte de verdade | Deprecar `default_ai_preferences` em platform_tools após PR1 |
| Orgs com prefs custom caras | Backup JSON; comunicação; opcional fase 3 “override pago” |
| Video Kling sem adapter | UI “Em breve”; não oferecer save até adapter existir |

---

## 14. Definição de pronto (DoD)

- [ ] Seção **Algoritmos** no Master com texto/imagem/vídeo  
- [ ] ≥ 40 function_keys seedados e editáveis  
- [ ] `aiRouter.resolveAlgorithm` é a porta padrão  
- [ ] Campanhas, product studio, creatives e video leem algorithm global  
- [ ] Org UI sem seletor de modelo (só chaves)  
- [ ] 30 pontos de auditoria A01–A30 verificados em checklist  
- [ ] Rollback flag testada uma vez em staging/prod  

---

## 15. Próximo passo de implementação (quando aprovado)

1. Criar `src/config/ai-algorithms.ts` (registry)  
2. Criar `src/services/algorithms.ts` + rotas master  
3. `MasterAlgoritmos.tsx` + nav  
4. PR1 wire `aiRouter`  
5. Migrar call sites por onda (PRs 2–12)

---

*Documento gerado a partir do inventário de código (ai-models, aiRouter, integrations, creativeStudio, campaignEngine, adminAgent, master Providers/Integrations).*
