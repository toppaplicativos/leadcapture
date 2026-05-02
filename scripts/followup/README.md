# Régua Reev de Follow-up — Protocolo de Criação

Sistema reutilizável para criar sequências de 8 campanhas de follow-up sincronizadas baseadas no **framework Reev Outbound**, adaptável para qualquer brand.

---

## 🎯 Visão Geral

Cada brand ganha uma régua com:

| # | Campanha | Delay | Framework Reev |
|---|----------|-------|---------------|
| FU0 | Abertura | D+0 | Grande Ideia + Problema 1 |
| FU1 | Check-in | D+2 | Contexto + Problema 2 |
| FU2 | Consciência | D+5 | Implicação 1 + Futuro Positivo |
| FU3 | Prova Social | D+8 | Implicação 2 + Prova Social |
| FU4 | Educação | D+12 | Grande Ideia + Educação |
| FU5 | Caso Real | D+16 | Storytelling + Futuro Positivo |
| FU6 | Valor Puro | D+20 | Problema + Conteúdo |
| FU7 | Break-up | D+25 | Grande Ideia + Escassez |

---

## 🏷️ Sistema de Tags

**Avanço** (adicionadas após cada envio via `finalActions.addTags`):

```
FU0 → +fu0_enviada
FU1 → +fu1_enviada
...
FU7 → +fu7_enviada (fim)
```

**Saídas** (excluem de TODAS as campanhas):

```
respondeu   → handoff humano (status=replied)
opt_out     → bloqueou/descadastrou (status=lost)
convertido  → virou cliente (status=converted)
```

**Filtros por campanha** (aplicados automaticamente):

```
FU(n):
  tagsInclude: [fu(n-1)_enviada]        ← só pega quem recebeu a anterior
  tagsExclude: [fu(n)_enviada,
                respondeu,
                opt_out,
                convertido]              ← exits
  statuses:    [new, contacted]          ← não envia pra quem respondeu
```

---

## 🚀 Como Usar

### 1. Criar um novo brand

```bash
# Copie o template
cp scripts/followup/profiles/_TEMPLATE.json scripts/followup/profiles/meu-brand.json

# Edite com os dados do brand
code scripts/followup/profiles/meu-brand.json
```

Campos **obrigatórios**:

- `brandId`, `userId`, `instanceId` — identificadores do sistema
- `agent.name`, `agent.role` — persona que envia mensagens
- `company.name`, `company.description` — identidade
- `product.*` — mainBenefits, targetPains, costsOfInaction, futureGains
- `target.segments`, `target.region` — público-alvo
- `socialProof.metrics`, `socialProof.miniCases`, `socialProof.stories` — prova social real
- `techEducation` — informações técnicas que educam
- `freeContentOffers` — materiais gratuitos (FU6)
- `exitSurveyOptions` — razões de não-interesse (FU7)

### 2. Dry-run (validar sem gravar)

```bash
node scripts/followup/run.js meu-brand --dry-run
```

Mostra o plano completo sem tocar no banco.

### 3. Criar as 8 campanhas

```bash
node scripts/followup/run.js meu-brand
```

Cria as 8 campanhas em status `draft`. Idempotente — se já existe, pula.

### 4. Atualizar todas (se mudou o profile)

```bash
node scripts/followup/run.js meu-brand --force-update
```

### 5. Ativar e agendar automaticamente

```bash
node scripts/followup/run.js meu-brand --activate
```

- FU0 → status `running` (envia imediatamente)
- FU1 → status `scheduled`, inicia em D+2
- FU2 → status `scheduled`, inicia em D+5
- ...
- FU7 → status `scheduled`, inicia em D+25

### 6. Overrides opcionais

```bash
# Override da instância WhatsApp
node scripts/followup/run.js meu-brand --instance=<uuid>

# Copiar settings (mídia, agendamento, anti-block) de campanha existente
node scripts/followup/run.js meu-brand --source=<campaign-id>
```

---

## 📦 Arquivos

```
scripts/followup/
├── README.md              # Este arquivo
├── builder.js             # Engine: cria/atualiza campanhas
├── templates.js           # Templates Reev parametrizados (FU0-FU7)
├── run.js                 # CLI
└── profiles/
    ├── _TEMPLATE.json     # Modelo com comentários
    └── alho-pronto.json   # Exemplo: Alho Pronto
```

---

## 🧠 Arquitetura

### Fluxo de criação

```
profile.json ──→ validateProfile() ──→ buildSequence(profile)
                                       │
                                       └─→ [FU0, FU1, ..., FU7] com aiPrompt + fallback
                                           │
                                           └─→ for each step:
                                               - insertCampaign() OR
                                               - updateCampaign() (forceUpdate)
                                               - skip (já existe)
```

### Parametrização

Os templates em `templates.js` usam interpolação baseada no profile:

- `${p.agent.name}` → "Elenice"
- `${p.company.name}` → "Alho Pronto"
- `${list(p.product.mainBenefits)}` → lista formatada com bullets
- `${segmentMention(p)}` → "restaurantes e buffets"

Um novo brand com profile bem preenchido gera 8 prompts estratégicos totalmente adaptados sem tocar no código.

### Fallbacks

Cada FU tem um `fallback` text-only que é usado quando a IA falha. Você pode sobrescrever em `profile.templates.fuN` para cada etapa.

---

## ✅ Validação

O builder valida os campos obrigatórios antes de criar qualquer coisa. Se faltar algo:

```
Error: Profile invalido. Campos faltando: product.mainBenefits, socialProof.miniCases
```

---

## 🛡️ Segurança dos Filtros

- Tags de exit (`respondeu`, `opt_out`, `convertido`) sempre excluem leads de TODAS as campanhas
- Leads com status `replied` nunca recebem follow-up (não está em `['new', 'contacted']`)
- `opt_out` já é filtrado globalmente pelo `filterLeadsByBrand` do engine
- Uma vez que o lead avança (tem tag `fu(n)_enviada`), não volta pra etapa anterior

---

## 🔄 Idempotência

O builder é seguro para rodar múltiplas vezes:

- Busca campanhas existentes por nome (`FU0 — Abertura`, `FU1 — Check-in`, etc.)
- Se existe e não passou `--force-update`: **pula**
- Se existe e passou `--force-update`: **atualiza** (preserva `id`, zera `sent_count`? **não**, mantém)
- Se não existe: **cria**

---

## 📝 Exemplo completo — criar um novo brand

1. Criar profile em `profiles/petshop-happy.json`:

```json
{
  "brandId": "...", "userId": "...", "instanceId": "...",
  "agent": { "name": "Carla", "role": "consultora de vendas" },
  "company": { "name": "PetShop Happy", "description": "delivery de ração premium pra pets" },
  "product": {
    "category": "pet",
    "name": "ração premium com entrega recorrente",
    "mainBenefits": ["entrega automática", "desconto de assinatura", "curadoria veterinária"],
    "targetPains": ["tutor esquece de comprar ração", "ir até o pet shop toda semana", "ração acabou no domingo"],
    "costsOfInaction": ["ração batata quando falta o bom", "pet estranhando troca abrupta"],
    "futureGains": ["pet alimentado no horário sem stress do tutor", "economia de até 15% vs varejo"]
  },
  "target": {
    "segments": ["tutores de cachorro", "tutores de gato"],
    "region": "Sao Paulo capital e ABC",
    "commonSegment": "tutor de pet"
  },
  "socialProof": {
    "clientCount": "800+ tutores",
    "metrics": ["800+ tutores ativos", "entrega em 24h", "15% mais barato que varejo"],
    "miniCases": ["tutora em Moema economizou R$200/mes", "familia no ABC tem 2 caes, nao se preocupa mais com ração"],
    "stories": ["uma tutora nos chamou porque sempre esquecia de comprar ração no sabado — hoje tem entrega automatica"]
  },
  "techEducation": [
    "Trocas abruptas de ração causam diarreia em 40% dos pets",
    "Ração premium tem densidade nutricional 2x maior — o pet come menos e se nutre mais"
  ],
  "freeContentOffers": [
    "Calculadora de quantidade ideal de ração por peso do pet",
    "Guia de transição de ração sem causar problemas"
  ],
  "exitSurveyOptions": ["pet recusa ração premium", "prefere comprar na loja fisica", "ja tem assinatura em outro lugar", "nao e prioridade agora"]
}
```

2. Rodar dry-run:

```bash
node scripts/followup/run.js petshop-happy --dry-run
```

3. Criar e ativar:

```bash
node scripts/followup/run.js petshop-happy --activate
```

Pronto — régua completa rodando para PetShop Happy.

---

## 🔧 Customização avançada

### Override de fallbacks

No profile, em `templates.fuN`, você pode definir o fallback exato usado se a IA falhar. Isso **não substitui** o `aiPrompt` — apenas o texto pronto.

### Override de filtros

Edite `builder.js` → função `buildStepFilter()` para customizar regras por etapa (ex: excluir tags específicas do brand).

### Override de templates

Edite `templates.js` → adicione variáveis novas no profile schema e use nos prompts.
