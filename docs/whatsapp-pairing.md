# WhatsApp — Pareamento por código (pairing)

Guia para conectar instâncias via **Conectar com número de telefone** sem regressões.
Válido para **organização (admin)** e **afiliados** (Central + LeadCapture Parceiros).

---

## Fluxo no produto (mesmo em todos os apps)

1. Usuário cria ou escolhe uma sessão WhatsApp offline.
2. Informa celular com DDD (Brasil: **11 dígitos**, ex. `85996437477`).
3. Tela de **confirmação** mostra o E.164 que o WhatsApp usará.
4. Backend gera código de **8 caracteres** (Baileys `requestPairingCode`).
5. No celular: Configurações → Aparelhos conectados → Conectar aparelho → **Conectar com número de telefone**.
6. Digite o **mesmo número** exibido na tela e cole o código **sem hífen**.
7. Servidor **mantém o socket aberto** até o `pair-success` completo e só então reconecta.

### Onde o usuário faz isso

| Superfície | Caminho UI | Componentes |
|------------|------------|-------------|
| Org / admin | Configurações → WhatsApp (ou dock/modal) | `WhatsAppInstancesPanel` `mode=admin` → `WhatsAppConnectModal` → `WhatsAppPairingFlow` |
| Central do Afiliado | `/central-afiliado/:slug/painel` → aba **Conexões** | `AffiliateConnections` → mesmo panel `mode=affiliate` + modal |
| LeadCapture Parceiros | `/parceiros/painel/programa/:slug/painel` → **Conexões** | `PartnersProgramWorkspace` embute `AffiliateAppPage` (mesmo fluxo) |

**Regra de ouro:** um único fluxo de UI (`WhatsAppPairingFlow`) e um único pipeline Baileys (`InstanceManager.connectWithPairingCode`). Não criar implementação paralela de pairing.

---

## Paridade admin ↔ afiliado

| Camada | Compartilhado? | Detalhe |
|--------|----------------|---------|
| UI de código | Sim | `WhatsAppPairingFlow.tsx` |
| Modal | Sim | `WhatsAppConnectModal.tsx` |
| Headers HTTP | Sim (com escopo) | `getWhatsAppHeaders()` → admin JWT **ou** token afiliado |
| API | Sim | `POST /api/instances/:id/pairing-code`, `reset-pairing`, `GET /:id` |
| Baileys / socket | Sim | `src/core/instanceManager.ts` (processo único na VPS) |
| Ownership | Diferente | Afiliado só vê/age em `owner_type=affiliate` + `owner_actor_id` dele |

### Auth no frontend

```ts
// frontend/src/lib/whatsapp/headers.ts
getWhatsAppHeaders()
  → isAffiliateWhatsAppContext() ? getAffiliateHeaders() : getHeaders()
```

`isAffiliateWhatsAppContext()` cobre:

- `/central-afiliado/*`
- `/parceiros/painel/programa/*` (shell de parceiros com `AffiliateAppPage`)
- qualquer tela com token de afiliado em `localStorage`

### Auth no backend

- Escopo: `resolveInstanceAuthScope` + `instanceBelongsToScope` (`src/services/instanceOwnership.ts`)
- Criação afiliado: `owner_type = affiliate`, `owner_actor_id =` user do afiliado
- Rotas em `src/index.ts` (pairing-code / reset-pairing / GET instance) usam o **mesmo** `InstanceManager`

Smoke automatizado de afiliado:

```bash
node agent-tools/smoke-affiliate-pairing.mjs https://app.leadcapture.online
```

Ownership:

```bash
node agent-tools/smoke-affiliate-ownership.mjs
```

---

## Regras de normalização (Brasil +55)

| Entrada local | Situação | E.164 enviado ao Baileys | Botão Continuar |
|---------------|----------|--------------------------|-----------------|
| `85996437477` (11) | Celular padrão | `5585996437477` | Sim |
| `8599643747` (10, começa com `99` após DDD) | Prefixo incompleto | `558599643747` (não envia) | **Não** (aguarda 11º dígito) |
| `8596437477` (10, sem 9 móvel) | Legado | `5585996437477` | Sim |
| `859996437477` (9 duplicado) | Corrige para 11 | `5585996437477` | Sim |

**Frontend:** `frontend/src/lib/whatsapp/countryCodes.ts`  
**Backend:** `instanceManager.normalizePairingPhoneNumber()` em `src/core/instanceManager.ts`

Ambos devem produzir o mesmo E.164:

```bash
node agent-tools/test-pairing-phone-normalize.mjs
```

---

## Resolução do número no servidor

Antes de `requestPairingCode`, o backend tenta `onWhatsApp` nas variantes BR (com/sem 9 móvel), com timeout de 2,5s por variante. Se não resolver em ~6s, usa o E.164 normalizado.

---

## Código de pareamento (UX)

- Um código vale ~2 minutos; gerar outro **invalida** o anterior no aparelho.
- Use **Gerar novo código** apenas se expirou; não clique várias vezes seguidas.
- Copiar: 8 caracteres alfanuméricos, **sem hífen** (`ABNF6HHJ`, não `ABNF-6HHJ`).
- Digite no WhatsApp **na hora** — o socket do servidor precisa estar vivo.

---

## Invariantes Baileys (não regredir)

### 1. Browser = Ubuntu / Chrome

```ts
// makePairingSocket — OBRIGATÓRIO
browser: Browsers.ubuntu("Chrome")
```

**Proibido** para pairing: `Browsers.macOS("Desktop")` ou qualquer `Desktop`.

Efeito se errar: WhatsApp encerra com **status 428** e o celular mostra:

> Não foi possível conectar o dispositivo. Confira se inseriu o número de telefone correto…

### 2. Não reconectar em `registered = true` sozinho

No fluxo por **código**:

1. Usuário digita o código no celular  
2. Baileys recebe `link_code_companion_reg` → envia `companion_finish` → marca **`creds.registered = true` cedo**  
3. Ainda falta o **`pair-success`** (preenche `account` + `me.id` com device `:XX`)  
4. Só então o servidor pede restart (`restartRequired` / 515)  
5. Reconnect com credenciais **completas** → `connection = open`

**Proibido:** ao ver `registered = true`, chamar `cleanupSocket` + login imediatamente.

Efeito se errar: celular mostra *“Ocorreu um erro. Tente novamente.”* e o log:

```
Pairing creds registered for X — ensuring reconnect
Post-pairing reconnect closed for X: status=401
```

Credenciais incompletas no disco (exemplo de falha):

- `registered: true`
- `account: null`
- `me.id` sem device (`5585…@s.whatsapp.net` sem `:NN`)
- ainda com `pairingCode` no `creds.json`

### 3. Só reconectar quando `isPairingAuthReady(creds)`

```ts
// account presente OU me.id com device (":")
isPairingAuthReady(creds) === true
```

Implementação: `isPairingAuthReady`, `waitForPairingCredsReady`, `completePairingReconnect` em `instanceManager.ts`.

### 4. Uma sessão de pairing por vez

- Guard `pairingSessions` bloqueia reconnect/QR paralelo.
- `pairingCodeIssued` + `pairing_error` alimentam o frontend se o socket morrer após o código.

---

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| Confirmação no 10º dígito | Prefixo tratado como completo | `isBrazilLocalReadyToSubmit` |
| Celular rejeita o código | E.164 diferente do digitado | Conferir número na tela; `resolvePairingPhoneForRequest` |
| “Não foi possível conectar…” + log `428` | Browser `Desktop` | `Browsers.ubuntu("Chrome")` |
| Aceita código, depois “Ocorreu um erro” + log `401` | Reconnect antes do pair-success | Não reconectar só com `registered`; exigir `isPairingAuthReady` |
| Timeout ~90s ao gerar código | Socket instável | Reset pairing, aguardar 10s, um código por vez |
| Vários códigos falham | Códigos anteriores invalidados | Um código, ≤2 min, sem regenerar em loop |
| Afiliado: 404 na sessão | Ownership / token errado | Token afiliado + `x-brand-id`; sessão `owner_type=affiliate` dele |
| Parceiros: headers de admin | Contexto errado | `isAffiliateWhatsAppContext` + token via `enterBrand` |

### Logs úteis (VPS)

```bash
pm2 logs leadcapture-api --lines 100 --nostream | grep -iE 'pair|registered|401|428|515|reconnect'
```

Sequência **saudável**:

```
Pairing code generated for …
Pairing companion_finish … (registered early) — keeping socket open for pair-success
Pairing multi-device ready … (account/device)
Pairing restart … restartRequired
Instance connected after pairing reconnect: … (5585…)
```

---

## Deploy e verificação

```powershell
.\agent-tools\run-deploy-verified.ps1
```

Mínimo após mudança em pairing:

```bash
node agent-tools/test-pairing-phone-normalize.mjs
node agent-tools/smoke-affiliate-pairing.mjs https://app.leadcapture.online
# Opcional (org): node agent-tools/smoke-pairing.mjs https://app.leadcapture.online
```

Confirmar no dist deployado:

```bash
grep -n 'ubuntu("Chrome")\|macOS("Desktop")\|isPairingAuthReady\|companion_finish' dist/core/instanceManager.js
```

Deve existir `Browsers.ubuntu("Chrome")` e **não** `macOS("Desktop")` no `makePairingSocket`.

---

## Arquivos principais

| Arquivo | Papel |
|---------|--------|
| `src/core/instanceManager.ts` | Baileys, browser, guards, reconnect pós-código |
| `src/index.ts` | `POST pairing-code`, `reset-pairing`, `GET /instances/:id` |
| `src/routes/instances.ts` | Rotas alternativas de instância (mesmo escopo) |
| `src/services/instanceOwnership.ts` | Escopo admin vs afiliado |
| `frontend/src/components/whatsapp/WhatsAppPairingFlow.tsx` | UI do código (única) |
| `frontend/src/components/whatsapp/WhatsAppConnectModal.tsx` | Modal compartilhado |
| `frontend/src/components/whatsapp/WhatsAppInstancesPanel.tsx` | Lista admin/afiliado |
| `frontend/src/pages/affiliate/AffiliateConnections.tsx` | Aba Conexões do afiliado |
| `frontend/src/lib/whatsapp/headers.ts` | Headers multi-app |
| `frontend/src/lib/whatsapp/countryCodes.ts` | Normalização BR |
| `docs/whatsapp-ownership.md` | Ownership e quem vê o quê |
| `agent-tools/smoke-affiliate-pairing.mjs` | Smoke afiliado |
| `agent-tools/test-pairing-phone-normalize.mjs` | Teste de normalização |

---

## Checklist antes de merge (pairing)

- [ ] `makePairingSocket` usa `Browsers.ubuntu("Chrome")`
- [ ] Nenhum `setTimeout` reconecta só com `creds.registered` sem `isPairingAuthReady`
- [ ] `completePairingReconnect` espera account/device antes de `cleanupSocket` + login
- [ ] Admin e afiliado usam `WhatsAppPairingFlow` (sem fork)
- [ ] `getWhatsAppHeaders` / `isAffiliateWhatsAppContext` cobrem Central **e** Parceiros
- [ ] Smoke afiliado verde (`smoke-affiliate-pairing.mjs`)
- [ ] Normalização BR alinhada (teste de phone normalize)

## Incidentes resolvidos (2026-07)

| # | Sintoma no celular | Causa no servidor | Fix |
|---|--------------------|-------------------|-----|
| 1 | “Não foi possível conectar… confira o número” | `Browsers.macOS("Desktop")` → close **428** | `Browsers.ubuntu("Chrome")` |
| 2 | Aceita código, depois “Ocorreu um erro. Tente novamente.” | Reconnect em `registered=true` (companion_finish) sem pair-success → login **401** | Esperar `isPairingAuthReady` + reconnect só pós pair-success / 515 |

Confirmado manualmente no **app da organização**. Pipeline de afiliado validado por smoke API + UI compartilhada.
