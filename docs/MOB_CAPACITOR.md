# Lead Capture Mob — empacotamento nativo (Capacitor)

O app Mob já é PWA instalável em `mob.leadcapture.online`.  
Para **background location** real (Android/iOS), use Capacitor.

## Status atual

| Camada | Estado |
|---|---|
| PWA + Web Geolocation | Produção |
| Bridge `nativeLocation.ts` | Detecta Capacitor e usa `@capacitor/geolocation` se existir |
| Anti-fraude GPS | Ativo (warn/block) |
| Projeto Capacitor no monorepo | Scaffold de documentação (sem bloquear o build web) |

## Passos de empacotamento

```bash
cd frontend
npm i @capacitor/core @capacitor/cli @capacitor/geolocation @capacitor/app @capacitor/haptics
npx cap init "Lead Capture Mob" online.leadcapture.mob --web-dir=dist
npx cap add android
# opcional:
# npx cap add ios

# build web + sync
npm run build
npx cap sync
npx cap open android
```

### Background location (Android)

1. Instale um plugin de background, por exemplo:
   - `@capacitor-community/background-geolocation` **ou**
   - solução comercial (Transistorsoft) para produção pesada
2. Adicione permissões em `AndroidManifest.xml`:
   - `ACCESS_FINE_LOCATION`
   - `ACCESS_BACKGROUND_LOCATION` (Android 10+)
   - `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_LOCATION`
3. No app, mantenha o turno **online** e a entrega **ativa** — o bridge envia `device_id` + `recorded_at` para o anti-fraude.

### iOS

- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription`
- Background Modes → Location updates

## Integração no código

`frontend/src/lib/mob/nativeLocation.ts`:

```ts
import { watchMobLocation } from '@/lib/mob/nativeLocation'

const handle = watchMobLocation({
  highAccuracy: true,
  onFix: (fix) => mobApi.location({ ...fix, delivery_id }),
})
// handle.stop()
```

A tela `MobAppPage` **já usa** `watchMobLocation` (web hoje; Capacitor Geolocation quando o app for empacotado).

## Upload assinado

Provas e assinaturas podem usar:

1. `POST /api/mob/app/upload-token` → grant HMAC  
2. `PUT /api/mob/app/upload-signed?token=...` → grava em `/uploads/mob-*`  

Quando `AWS_S3_BUCKET` + credenciais estiverem no `.env`, o grant pode ser estendido para presign S3 sem mudar o app.

## Checklist de release nativo

- [ ] Ícones 1024 / adaptive  
- [ ] Deep link `https://mob.leadcapture.online`  
- [ ] Push FCM/APNs (além de Web Push)  
- [ ] Política de privacidade de localização  
- [ ] Teste anti-fraude com mock GPS desligado  
