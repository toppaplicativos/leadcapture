# WhatsApp — Pareamento por código (pairing)

Guia para conectar instâncias via **Conectar com número de telefone** sem erros de normalização ou código inválido.

## Fluxo no produto

1. Usuário informa celular com DDD (Brasil: **11 dígitos**, ex. `85996437477`).
2. Tela de **confirmação** mostra o número formatado e o E.164 que o WhatsApp usará.
3. Backend gera código de **8 caracteres** (Baileys `requestPairingCode`).
4. No celular: Configurações → Aparelhos conectados → Conectar aparelho → **Conectar com número de telefone**.
5. Digite o **mesmo número** exibido na tela (`+55 (85) 9 9643-7477`) e cole o código **sem hífen**.

## Regras de normalização (Brasil +55)

| Entrada local | Situação | E.164 enviado ao Baileys | Botão Continuar |
|---------------|----------|--------------------------|-----------------|
| `85996437477` (11) | Celular padrão | `5585996437477` | Sim |
| `8599643747` (10, começa com `99` após DDD) | Prefixo incompleto | `558599643747` (não envia) | **Não** (aguarda 11º dígito) |
| `8596437477` (10, sem 9 móvel) | Legado | `5585996437477` | Sim |
| `859996437477` (9 duplicado) | Corrige para 11 | `5585996437477` | Sim |

**Frontend:** `frontend/src/lib/whatsapp/countryCodes.ts`  
**Backend:** `instanceManager.normalizePairingPhoneNumber()` em `src/core/instanceManager.ts`

Ambos devem produzir o mesmo E.164. Validar com:

```bash
node agent-tools/test-pairing-phone-normalize.mjs
```

## Resolução do número no servidor

Antes de `requestPairingCode`, o backend tenta `onWhatsApp` nas variantes BR (com/sem 9 móvel), com timeout de 2,5s por variante. Se não resolver em ~6s, usa o E.164 normalizado.

Isso evita o erro no celular: *"Não foi possível conectar o dispositivo…"* quando a conta está registrada no formato legado de 10 dígitos.

## UI — quando abre confirmação automática

- **Só** se já existir número salvo na instância (`defaultPhone`) e o usuário **não editou** o campo.
- Digitação manual **nunca** dispara confirmação no 10º dígito; exige 11 dígitos ou legado 10 sem 9 após DDD.

Arquivo: `frontend/src/components/whatsapp/WhatsAppPairingFlow.tsx`

## Código de pareamento

- Um código vale ~2 minutos; gerar outro **invalida** o anterior no aparelho.
- Use **Gerar novo código** apenas se expirou; não clique várias vezes seguidas.
- Copiar: 8 caracteres alfanuméricos, **sem hífen** (`ABNF6HHJ`, não `ABNF-6HHJ`).

## Deploy verificado

```powershell
.\agent-tools\run-deploy-verified.ps1
```

Requisitos: `agent-tools/.env.smoke` com `SMOKE_EMAIL` e `SMOKE_PASSWORD`.

Smoke de pairing (afiliado):

```bash
node agent-tools/smoke-affiliate-pairing.mjs https://app.leadcapture.online
```

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| Confirmação no 10º dígito | Prefixo tratado como completo | Atualizar frontend (`isBrazilLocalReadyToSubmit`) |
| Celular rejeita o código | E.164 diferente do digitado no app | Conferir número exibido na tela; redeploy backend com `resolvePairingPhoneForRequest` |
| Timeout ~90s ao gerar | Socket instável | Reset pairing, aguardar 10s, um código por vez |
| Vários códigos falham | Códigos anteriores invalidados | Um código, aguardar 2 min, não regenerar em loop |

## Arquivos principais

- `frontend/src/lib/whatsapp/countryCodes.ts` — normalização e exibição
- `frontend/src/components/whatsapp/WhatsAppPairingFlow.tsx` — fluxo UI
- `src/core/instanceManager.ts` — pairing Baileys, guards, reconnect
- `src/routes/instances.ts` — `POST /:id/pairing-code`, `POST /:id/reset-pairing`
- `agent-tools/smoke-affiliate-pairing.mjs` — smoke automatizado