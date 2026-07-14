# LeadCapture Connect — nativo completo

App Android companion: **slots nativos**, **multi-isolamento**, **disparo de conexões** para o Baileys no servidor.

**Não usa WebView / WhatsApp Web como motor.**

## Localização

```text
apps/android-connect/
src/routes/connect.ts
src/services/connectDevice.ts
docs/ANDROID_CONNECT.md
```

## Motores de isolamento

| Mode | O que faz | Limite Android |
|------|-----------|----------------|
| **HOST** | Abre package oficial (`com.whatsapp`, `w4b`…) | 1 install / package / perfil |
| **SIDECAR** | Package custom (APK clone sideload) | 1 por packageName |
| **WORK_PROFILE** | Tenta 2º perfil via `LauncherApps` | Precisa perfil secundário instalado |
| **VIRTUAL** | Pool mapper: multiplica slots alocando packages descobertos + sandbox local | Multiplica até esgotar packages no device |

### Motor VIRTUAL (v1-pool-mapper)

1. Descobre packages de mensageria (oficiais + heurística de clones)
2. Cada novo slot VIRTUAL pega o **próximo package livre**
3. Sandbox meta em `filesDir/virtual_spaces/{slotKey}/`
4. Com work profile, tenta alternar perfil em launches

> N installs do **mesmo** packageName no mesmo user **exigem** SIDECAR (APK reempacotado) ou app tipo Dual Space externo. O Connect multiplica com **packages distintos** + perfis.

## Fluxos

### Login + capabilities

1. `POST /api/auth/login`
2. `POST /api/connect/devices/register`
3. `POST /api/connect/devices/capabilities` — packages, work profile, max slots

### Bootstrap one-shot (app)

```http
POST /api/connect/bootstrap
{
  "device_id": "...",
  "local_clone_id": 3,
  "label": "Whats Comercial",
  "app_type": "WHATSAPP",
  "package_name": "com.whatsapp",
  "isolation_mode": "VIRTUAL",
  "enqueue_pairing": true,
  "phone": "85996437477"
}
```

Cria **instance Baileys** + **binding** + opcional comando `OPEN_PAIRING`.

### Disparo remoto (painel)

```http
POST /api/connect/dispatch
{
  "command_type": "OPEN_PAIRING",
  "instance_id": "<uuid>",
  "phone": "85996437477"
}
```

Comandos: `OPEN_PAIRING` | `SHOW_QR` | `OPEN_WHATSAPP_NATIVE` | `SYNC_NOW` | `PAUSE_SLOT` | `DELETE_BINDING` | …

App processa em poll ~8s.

## UI Android

- Login LeadCapture  
- Slots nativos (create com modo isolamento)  
- **+2 slots virtual** (pool)  
- Scan packages  
- Assistente: bootstrap + pairing / QR + copiar código  
- Sync: instâncias servidor ↔ bindings  

## API `/api/connect`

| Método | Path |
|--------|------|
| GET | `/me` |
| POST | `/devices/register` |
| POST | `/devices/heartbeat` |
| POST | `/devices/capabilities` |
| GET | `/sync?device_id=` |
| POST | `/bindings` |
| GET | `/bindings` |
| DELETE | `/bindings/:id` |
| POST | `/commands` |
| GET | `/commands` |
| POST | `/commands/:id/ack` |
| POST | `/dispatch` |
| POST | `/bootstrap` |
| GET | `/activity` |

## Build

Android Studio → open `apps/android-connect`  
`.env`: `API_BASE_URL=https://app.leadcapture.online/`

## Roadmap residual

- [ ] DPC próprio para **provisionar** work profile (hoje: detectar/usar se existir)
- [ ] Motor container tipo VirtualApp (N× mesmo APK) — epic separado / licença
- [ ] FCM push em vez de só poll
- [ ] Painel web “Dispositivos Connect”
