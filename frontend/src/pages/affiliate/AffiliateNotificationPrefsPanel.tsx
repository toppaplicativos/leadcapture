import { Bell, Inbox } from 'lucide-react'
import { PushNotificationSettings } from '@/components/push/PushNotificationSettings'

type Props = {
  onOpenAlerts?: () => void
}

/**
 * Preferências de notificação — separado da caixa de alertas e do perfil.
 * Aqui o afiliado configura push/dispositivo; em Alertas ele lê as mensagens.
 */
export function AffiliateNotificationPrefsPanel({ onOpenAlerts }: Props) {
  return (
    <div className="space-y-4 pb-6">
      <div className="affiliate-card p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-900 text-white grid place-items-center shrink-0">
            <Bell size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-gray-900 tracking-tight">
              Preferências de notificação
            </p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Controle o que chega neste aparelho: push, som, horário silencioso e categorias.
              Para <strong>ler</strong> as notificações do programa, use a caixa de alertas.
            </p>
            {onOpenAlerts ? (
              <button
                type="button"
                onClick={onOpenAlerts}
                className="mt-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border bg-white text-xs font-semibold text-gray-800 active:scale-[0.98]"
              >
                <Inbox size={14} />
                Abrir caixa de alertas
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <PushNotificationSettings />
    </div>
  )
}
