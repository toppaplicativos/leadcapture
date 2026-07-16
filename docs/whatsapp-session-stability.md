# WhatsApp — Estabilidade de sessão

Blindagem contra desconexões e flapping. Complementa `whatsapp-pairing.md` e `whatsapp-ownership.md`.

## Sintomas observados (prod)

| Log | Significado |
|-----|-------------|
| `ZOMBIE DETECTED … 4 consecutive ack timeouts` | Reconnect forçado por ACK lento (carga), não por socket morto |
| `Connection closed … Status: 503` | WhatsApp temporariamente indisponível |
| `Connection closed … Status: 428` | Precondition / fingerprint ou auth parcial |
| `logged out (401)` + limpa auth | Sessão invalidada (muitas vezes **após** reconnect agressivo) |
| `drift reverso` a cada 2 min | DB `disconnected` com socket vivo (sync incompleto / path pós-pairing frágil) |

## Causas raiz

1. **Zombie recovery agressivo** — 4 ACK timeouts derrubavam sessão viva → reconnect em loop → **401**.
2. **Fingerprint inconsistente** — pairing usava Ubuntu/Chrome; connect normal usava `Lead System` → 428.
3. **Pós-pairing sem handlers de reconnect** — sessão vinculada por código caía e não subia com a lógica completa.
4. **Pairing global bloqueava reconnect de outras sessões** e timers cancelados não eram retomados.
5. **Health só corrigia DB**, sem `ensureStableConnection`.
6. **Auto-connect após 401** gerava loop 428 com auth já apagada.

## Fronteira sagrada: pairing por código

O fluxo **Conectar com número / código** está validado em produção e **não deve ser refatorado** neste trabalho de estabilidade:

- `makePairingSocket` (config própria)
- `connectWithPairingCode` / `connectWithPairingCodeInternal`
- `bootstrapPairingSocket`
- `completePairingReconnect` até `connection = open` (handshake pair-success)
- `isPairingAuthReady` / `waitForPairingCredsReady` / não reconectar em `registered` cedo

Estabilidade age **depois** do vínculo (sessão já `connected`) ou em reconnect de sessão salva.

Ver `docs/whatsapp-pairing.md`.

## Blindagem implementada (pós-vínculo)

### InstanceManager (`src/core/instanceManager.ts`)

| Controle | Valor / comportamento |
|----------|------------------------|
| ACK timeout | 20s (env `WHATSAPP_ACK_TIMEOUT_MS`) |
| Zombie threshold | 8 timeouts consecutivos |
| Zombie cooldown | 10 min por instância |
| Zombie min uptime | 90s após connect |
| Zombie soft | se socket vivo → **não** reconnect, só zera contador |
| Browser (sessão autenticada) | `makeStableSocket` → Ubuntu/Chrome |
| Browser (pairing) | `makePairingSocket` — **intocado** |
| Pós-open por código | se cair depois de linked → `ensureStableConnection` (sem mexer no handshake) |
| Reconnect 515 (sessão normal) | imediato (~1,5s) |
| Backoff 503/428 | mínimo 15–20s |
| Após 401 | limpa auth, **não** auto-QR; usuário reconecta no painel |
| Pairing guard | só bloqueia a **mesma** sessão; ao terminar, retoma offline |
| API pública | `ensureStableConnection`, `getRuntimeStatus` |

### Health (`src/services/whatsappHealth.ts`)

A cada 2 min:

1. Corrige drift DB ↔ runtime  
2. Chama `ensureStableConnection` se offline com creds  
3. Só marca campanha “morta” se runtime continuar offline  

## Logs saudáveis

```
Instance connected: …
# ocasional
Connection closed … Status: 503
Scheduling reconnect … (status=503)
Instance connected: …
# NÃO deve aparecer em rajada
ZOMBIE RECOVERY: Forcing reconnect
logged out (401)
```

## Checklist de regressão

- [ ] `makeStableSocket` / connect e pairing usam Ubuntu Chrome  
- [ ] Zombie não força reconnect com socket vivo  
- [ ] Pós-pairing usa `connectInstance` (não socket “só pairing”)  
- [ ] Health chama `ensureStableConnection`  
- [ ] 401 não dispara auto-connect sem creds  

## Comandos

```bash
pm2 logs leadcapture-api --lines 200 --nostream | grep -iE 'ZOMBIE|Connection closed|connected|drift|ensureStable|401|428|503'
```

```powershell
# deploy backend após mudanças no InstanceManager
npm run build
# copiar dist/core/instanceManager.js + dist/services/whatsappHealth.js e restart pm2
```
