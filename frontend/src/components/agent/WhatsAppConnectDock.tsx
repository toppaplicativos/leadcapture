import { AlertCircle } from 'lucide-react'
import { useWhatsAppHealth } from '@/lib/hooks/useWhatsAppHealth'
import { useWhatsAppConnectOptional } from '@/lib/whatsapp/WhatsAppConnectContext'
import { WhatsAppPairingFlow } from '@/components/whatsapp/WhatsAppPairingFlow'

export function WhatsAppConnectDock({ onConnected }: { onConnected?: () => void }) {
  const { hasCritical, primaryCritical, refresh } = useWhatsAppHealth()
  const connectCtx = useWhatsAppConnectOptional()

  if (!hasCritical || !primaryCritical) return null
  if (connectCtx?.isOpen) return null

  return (
    <div className="workspace-chat__wa-dock">
      <div className="workspace-chat__wa-dock-head">
        <AlertCircle size={14} className="text-rose-500 shrink-0" />
        <div className="min-w-0">
          <p className="workspace-chat__wa-dock-title">WhatsApp desconectado</p>
          <p className="workspace-chat__wa-dock-sub">
            {primaryCritical.name} — vincule pelo número do celular
          </p>
        </div>
      </div>
      <WhatsAppPairingFlow
        instanceId={primaryCritical.id}
        instanceName={primaryCritical.name}
        defaultPhone={primaryCritical.phone}
        compact
        onConnected={() => {
          refresh()
          onConnected?.()
        }}
      />
    </div>
  )
}