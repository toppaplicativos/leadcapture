import { useEffect, useState } from 'react'
import { Volume2, Vibrate, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui'
import { PushNotificationSettings } from '@/components/push/PushNotificationSettings'
import { MobPageShell } from './MobPageShell'

const SOUND_KEY = 'mob-alert-sound'
const VIBRATE_KEY = 'mob-alert-vibrate'

function readFlag(key: string, fallback = true) {
  try {
    const v = localStorage.getItem(key)
    if (v == null) return fallback
    return v === '1' || v === 'true'
  } catch {
    return fallback
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function getMobSoundEnabled() {
  return readFlag(SOUND_KEY, true)
}

export function getMobVibrateEnabled() {
  return readFlag(VIBRATE_KEY, true)
}

export function MobAlertsPage({
  onBack,
  onToast,
}: {
  onBack: () => void
  onToast?: (msg: string, type?: 'ok' | 'err') => void
}) {
  const [sound, setSound] = useState(true)
  const [vibrate, setVibrate] = useState(true)

  useEffect(() => {
    setSound(readFlag(SOUND_KEY, true))
    setVibrate(readFlag(VIBRATE_KEY, true))
  }, [])

  function toggleSound(v: boolean) {
    setSound(v)
    writeFlag(SOUND_KEY, v)
    onToast?.(v ? 'Som de nova corrida ativado' : 'Som desativado', 'ok')
  }

  function toggleVibrate(v: boolean) {
    setVibrate(v)
    writeFlag(VIBRATE_KEY, v)
    onToast?.(v ? 'Vibração ativada' : 'Vibração desativada', 'ok')
  }

  function testSound() {
    try {
      const audio = new Audio('/sounds/mob-offer.wav')
      void audio.play().catch(() => undefined)
      if (vibrate && navigator.vibrate) navigator.vibrate([200, 80, 200])
      onToast?.('Teste de alerta disparado', 'ok')
    } catch {
      onToast?.('Não foi possível tocar o som', 'err')
    }
  }

  return (
    <MobPageShell
      title="Push e alertas"
      subtitle="Dispositivo, som e preferências"
      onBack={onBack}
    >
      <div className="mob-panel mob-panel--pad">
        <div className="flex items-center gap-2 mb-3">
          <div className="mob-row__icon !w-9 !h-9">
            <Volume2 size={16} strokeWidth={2.25} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-gray-900 m-0">Alertas de corrida no app</p>
            <p className="text-[11px] text-gray-600 m-0">Som e vibração ao receber oferta</p>
          </div>
        </div>

        <label className="mob-alert-toggle">
          <span className="flex items-center gap-2">
            <Volume2 size={15} strokeWidth={2.25} />
            Tocar som de nova corrida
          </span>
          <input type="checkbox" checked={sound} onChange={(e) => toggleSound(e.target.checked)} />
        </label>
        <label className="mob-alert-toggle">
          <span className="flex items-center gap-2">
            <Vibrate size={15} strokeWidth={2.25} />
            Vibrar ao receber alerta
          </span>
          <input
            type="checkbox"
            checked={vibrate}
            onChange={(e) => toggleVibrate(e.target.checked)}
          />
        </label>

        <Button fullWidth variant="secondary" className="mt-3" onClick={testSound}>
          Testar som / vibração
        </Button>
      </div>

      <div className="mob-panel mob-panel--pad !pb-2">
        <div className="flex items-center gap-2 mb-2">
          <div className="mob-row__icon !w-9 !h-9">
            <Smartphone size={16} strokeWidth={2.25} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-gray-900 m-0">Push do sistema</p>
            <p className="text-[11px] text-gray-600 m-0">
              Notificações do celular em segundo plano
            </p>
          </div>
        </div>
      </div>

      <PushNotificationSettings />
    </MobPageShell>
  )
}
