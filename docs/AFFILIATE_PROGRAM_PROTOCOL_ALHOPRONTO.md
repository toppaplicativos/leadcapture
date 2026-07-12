# Protocolo — Programa de Afiliados Alho Pronto (não CE)

**Marca:** Alho Pronto · `slug=alhopronto` · `brand_id=dc8f901e-857b-4cfb-b353-86cd5146d1fd`  
**Domínio loja:** alhopronto.online  
**App parceiros:** parceiros.alhopronto.online / `/central-afiliado/alhopronto`  
**Mercado multi-marca:** `/parceiros`  
**Última configuração aplicada:** script `agent-tools/configure-alhopronto-affiliates.mjs`  
**Objetivo:** programa completo, pronto para receber candidatos com onboarding, regras, aprendizado e repasse PIX diário.

---

## 1. Mapa da estrutura (o que existe na plataforma)

| Camada | Onde fica | Função |
|--------|-----------|--------|
| Config legada da marca | `affiliate_program_config` · Admin → Afiliados → **Configurações** | Liga/desliga programa, comissão default, cookie, saque mín., termos/treino legados, share |
| Programa / campanha | `affiliate_programs` · Admin → **Programas** | Termos, políticas, orientação, repasse, elegibilidade, marketplace |
| Onboarding | `affiliate_program_steps` + `trainings` + progresso | Aceite termos/políticas, treino, liberação de link/cupom |
| Aprendizado app | `affiliate_learning_modules` · Admin → **Aprendizado** | Aba **Aprender** do afiliado (conteúdo contínuo) |
| Materiais | `affiliate_materials` · Admin → **Materiais** | Copies e mídias oficiais |
| Ofertas | `affiliate_program_offers` | Produtos em destaque no detalhe da campanha |
| Distribuição de leads | `lead_distribution_rules` · Admin → **Distribuição** | Fila, elegibilidade (WA, treino, termos, PIX), templates |
| Parceiros / credenciais | `affiliates` + access | Login, código, cupom, PIX, status |
| Financeiro | `affiliate_sales` + `affiliate_payouts` | Comissões, aprovação, saques PIX |
| Candidatura pública | Mercado Parceiros + invite links | Entrada de candidatos |

### Jornada do candidato → parceiro ativo

```
Descobre (mercado / convite / indicação)
  → Cria conta em /parceiros
  → Candidata-se ao programa Alho Pronto
  → Admin aprova (auto_approve=false)
  → Onboarding: termos → políticas → orientação → treinamentos
  → Liberação de link + cupom
  → Cadastra PIX
  → (Opcional) Conecta WhatsApp → elegível à distribuição
  → Divulga / recebe leads → vendas → comissão → saque PIX diário
```

---

## 2. Decisões de negócio já configuradas (Alho Pronto)

| Campo | Valor definido |
|-------|----------------|
| Nome do programa | **Parceiros Alho Pronto** |
| Status / mercado | `active` + marketplace visível |
| Comissão | **R$ 1,00 / kg** (`fixed_per_kg`) |
| Cookie de atribuição | **30 dias** |
| Forma de repasse | **PIX direto** (`pix_direct`) |
| Periodicidade | **Diária** (`daily`) |
| Prazo de referência | **1 dia** após confirmação do pagamento |
| Mínimo de saque | **R$ 20,00** |
| Aceita candidaturas | **Sim** |
| Auto-aprovação | **Não** (revisão manual) |
| Distribuição | Ligada; exige WA + treino + termos + **PIX** |
| Máx. leads/dia por afiliado | 20 |

> Alterar comissão, mínimo ou auto-aprovação: Admin → **Programas** (e espelho em **Configurações**).

---

## 3. Protocolo — o que deve estar preenchido (checklist mestre)

Use esta lista para considerar o programa **“pronto para candidatos”**.  
Itens **[C]** são críticos. A Visão geral do admin mostra o mesmo checklist em tempo real.

### A. Fundação da marca **[C]**

- [x] Brand **Alho Pronto** (não CE) ativa
- [x] Logo e cores da marca
- [x] Domínio / catálogo com produtos ativos (9 SKUs)
- [x] WhatsApp da marca cadastrado
- [ ] Redes sociais da marca preenchidas (Instagram etc.) — **opcional, recomendado**
- [ ] Capa de compartilhamento (`share_image_url`) — **pendente upload**

### B. Configuração comercial **[C]**

- [x] Programa da marca **ativo**
- [x] Campanha no **mercado**
- [x] Modelo e valor de comissão
- [x] Regras comerciais de comissão (texto)
- [x] Cookie days
- [x] Mínimo de saque + payment_days
- [x] Payout method + frequency + notes (PIX diário)

### C. Jurídico e conduta **[C]**

- [x] `terms_html` — Termos do programa (atribuição, comissão, repasse, LGPD, proibições)
- [x] `policies_html` — Políticas de conduta (canais, spam, preço, leads, marca)
- [x] `orientation_html` — Preparação / checklist inicial
- [x] Elegibilidade (`eligibility_rules`)

**Revisão humana recomendada (jurídico/operacional):**

- [ ] Validar textos com advogado / responsável legal
- [ ] Confirmar regiões de entrega reais nas promessas de venda
- [ ] Confirmar se auto-aprovação deve permanecer **off**

### D. Onboarding e preparação **[C]**

- [x] Step: Aceite de termos
- [x] Step: Políticas de conduta
- [x] Step: Orientação
- [x] Step: Treinamento obrigatório
- [x] Step: Liberação de recursos (link/cupom)
- [x] 3 treinamentos com conteúdo (produto, link/cupom, PIX/leads)

### E. Área de aprendizado (app) **[C]**

| Módulo | Publicado | Obrigatório |
|--------|-----------|-------------|
| O que é o programa | sim | sim |
| Como funciona | sim | sim |
| Produtos | sim | sim |
| Entrega e pós-venda | sim | não |
| Comissões e saques | sim | sim |
| FAQ | sim | não |

### F. Ofertas e materiais

- [x] 6 ofertas de produto no programa
- [x] 4 copies (WhatsApp / Instagram)
- [ ] Imagens/stories oficiais na galeria (upload visual) — **pendente**
- [ ] Vídeo curto de treinamento (opcional)

### G. Distribuição de leads

- [x] Regras ativas
- [x] Template mensagem inicial
- [x] Template follow-up (24/48/72h)
- [x] Exigir WhatsApp conectado
- [x] Exigir treino + termos + PIX
- [ ] Ajustar `allowed_regions_json` se quiser restringir praça

### H. Operação financeira (processo humano)

- [x] Modelo de liberação documentado (após confirmação)
- [ ] Rotina diária: aprovar comissões de pedidos pagos (Admin → Comissões)
- [ ] Rotina diária: marcar saques PIX como pagos (Admin → Saques)
- [ ] Responsável financeiro + conta PIX de saída definidos
- [ ] SLA interno de pagamento (ex.: até 18h nos dias úteis)

### I. Comunicação e aquisição de candidatos

- [ ] Landing/invite de parceiros testado (`/parceiros` e convite por programa)
- [ ] Mensagem de recrutamento pronta (WhatsApp/grupos)
- [ ] E-mails de fluxo (welcome / approved) revisados se habilitados
- [ ] Smoke: candidatura → aprovação → onboarding → link → PIX

### J. Qualidade e compliance contínuos

- [ ] Monitorar spam e auto-compra
- [ ] Revisar materiais a cada campanha de preço
- [ ] Atualizar FAQ quando mudar frete/prazo
- [ ] Não misturar configs da marca **Alho Pronto CE**

---

## 4. Pipeline de ações para criar / ativar (ordem recomendada)

### Fase 0 — Escopo (1×)

1. Confirmar marca correta (**Alho Pronto**, não CE).
2. Definir comissão, repasse, mínimo, cookie, auto-aprovação.
3. Listar SKUs prioritários e praças de atuação.

### Fase 1 — Fundação no admin

4. **Configurações:** programa ON, comissão, saque, share texts.  
5. **Programas:** campanha principal, repasse PIX diário, termos/políticas/orientação.  
6. **Programas → etapas** de onboarding + treinamentos.  
7. **Programas → ofertas** (produtos).  
8. **Aprendizado:** publicar módulos ricos.  
9. **Materiais:** copies + mídias.  
10. **Distribuição:** regras + templates + exigências.

### Fase 2 — Ativação de mercado

11. Status `active` + “Ativar no mercado”.  
12. Gerar **convite** (invite link) se quiser captação controlada.  
13. Abrir candidaturas (`accept_applications=true`).

### Fase 3 — Dry-run (obrigatório antes de escala)

14. Criar candidato teste em `/parceiros`.  
15. Aprovar candidatura.  
16. Completar onboarding e verificar liberação de link/cupom.  
17. Cadastrar PIX de teste.  
18. Fazer pedido teste com cupom → ver comissão.  
19. Aprovar comissão → solicitar saque → marcar pago.  
20. (Opcional) Conectar WA e receber lead de distribuição.

### Fase 4 — Go-live

21. Checklist de prontidão **100% nos críticos** (painel Visão geral).  
22. Divulgar link de candidatura / convite.  
23. Operar filas diárias: candidaturas · comissões · saques.  
24. Revisar semanalmente top parceiros e bloqueios.

### Comando de reaplicação de conteúdo (dev/ops)

```bash
node agent-tools/configure-alhopronto-affiliates.mjs
node agent-tools/probe-alhopronto-affiliates.mjs
```

> O configure é **idempotente** (não duplica steps/ofertas por slug/título/product_id).

---

## 5. Campos a preencher — dicionário operacional

### 5.1 Configurações da marca (`affiliate_program_config`)

| Campo | Obrigatório | Observação |
|-------|-------------|------------|
| `is_enabled` | sim | Publica programa principal no mercado |
| `default_commission_mode` / `value` | sim | Alho Pronto: `fixed_per_kg` / 1 |
| `commission_rules` | sim | Texto livre espelhado ao parceiro |
| `cookie_days` | sim | 30 |
| `min_withdrawal` | sim | 20 |
| `payment_days` | sim | 1 (após confirmação) |
| `terms_html` | sim | Legado + fallback |
| `training_html` | recomendado | Treino resumido legado |
| `share_title` / `share_description` | sim | Recrutamento |
| `share_image_url` | recomendado | OG / WhatsApp preview |
| `promotion_tone` | recomendado | Tom para IA/materiais |
| `accept_new_affiliates` | sim | |
| `auto_approve_affiliates` | decisão | Hoje **false** |
| `app_subdomain` | sim | `parceiros.alhopronto.online` |

### 5.2 Programa multi (`affiliate_programs`)

| Campo | Obrigatório |
|-------|-------------|
| `name`, `description`, `status` | sim |
| `commission_*`, `commission_rules` | sim |
| `terms_html`, `policies_html`, `orientation_html` | sim (onboarding) |
| `eligibility_rules` | recomendado |
| `payout_method`, `payout_frequency`, `payout_min_amount`, `payout_notes` | sim |
| `payment_days`, `cookie_days` | sim |
| `accept_applications`, `auto_approve_applications` | sim |
| `is_marketplace_visible` | sim se quiser candidaturas abertas |

### 5.3 Onboarding

| Tipo de step | Conteúdo necessário |
|--------------|---------------------|
| `terms_accept` | HTML em `terms_html` |
| `policy_accept` | HTML em `policies_html` |
| `orientation` | HTML em `orientation_html` |
| `training` | Registros em `affiliate_program_trainings` |
| `resource_unlock` | Automático após steps required |

### 5.4 Aprendizado / materiais / distribuição

| Entidade | Campos-chave |
|-----------|--------------|
| Learning module | `title`, `content_html`, `is_published`, `is_required` |
| Material | `title`, `copy_text` ou `media_url`, `channel`, `is_published` |
| Dist. rules | `is_enabled`, templates, `require_*`, `max_daily_per_affiliate` |

---

## 6. Papéis e rotinas pós-ativação

| Papel | Rotina |
|-------|--------|
| Gestor do programa | Aprovar/reprovar candidaturas; suspender conduta; atualizar termos |
| Financeiro | Aprovar comissões de pedidos pagos; executar PIX; marcar saques `paid` |
| Operações / logística | Manter prazos de entrega verdadeiros no aprendizado |
| Marketing | Atualizar materiais e tom; campanhas sazonais |
| Parceiro | Onboarding, PIX, divulgação ética, atendimento de leads |

---

## 7. Critério de “pronto”

O programa está **pronto para receber candidatos** quando:

1. Todos os itens **[C]** do §3 estão OK.  
2. Dry-run da Fase 3 passou sem bloqueio.  
3. Há responsável nomeado para candidaturas e para PIX diário.  
4. Painel **Visão geral → Checklist** não lista críticos abertos.

**Estado após configure (snapshot):**

- Termos / políticas / orientação: preenchidos  
- PIX diário + mín. R$ 20 + 1 dia  
- 6 módulos de aprendizado publicados  
- 3 treinamentos + 5 steps de onboarding  
- 6 ofertas + 4 materiais de copy  
- Distribuição com templates e PIX obrigatório  
- Auto-aprovação desligada  

**Pendências conscientes (não bloqueiam candidatos, melhoram conversão):**

1. Upload de `share_image_url` e criativos de imagem/vídeo.  
2. Preencher Instagram/Facebook da brand.  
3. Validação jurídica formal dos textos.  
4. Smoke ponta a ponta com pedido real/test e PIX real.  
5. Definir SLA e responsável financeiro diário.

---

## 8. Não fazer

- Não configurar em **Alho Pronto CE** por engano.  
- Não prometer entrega/preço fora do catálogo.  
- Não liberar anúncios pagos com marca sem aprovação.  
- Não reativar `auto_approve` sem processo de review se a rede crescer rápido.  
- Não pagar comissão de pedido cancelado/estornado.

---

## 9. Referências de código

| Área | Path |
|------|------|
| Service programas | `src/services/affiliatePrograms.ts` |
| Service afiliados | `src/services/affiliates.ts` |
| Distribuição | `src/services/affiliateDistribution.ts` |
| Admin UI | `frontend/src/pages/AffiliatesPage.tsx` |
| Checklist prontidão | `frontend/src/pages/admin/affiliates/AffiliateReadinessPanel.tsx` |
| Onboarding afiliado | `frontend/src/pages/affiliate/AffiliateProgramOnboarding.tsx` |
| Mercado parceiros | `frontend/src/pages/partners/*` |
| Seed conteúdo AP | `agent-tools/configure-alhopronto-affiliates.mjs` |
| Probe estado | `agent-tools/probe-alhopronto-affiliates.mjs` |
