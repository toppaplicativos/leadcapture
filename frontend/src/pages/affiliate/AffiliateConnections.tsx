import { WhatsAppIcon } from '@/components/icons'
import { WhatsAppInstancesPanel } from '@/components/whatsapp/WhatsAppInstancesPanel'
import type { AppContext } from '@/pages/affiliate/types'

export function AffiliateConnections({
  ctx,
  reloadToken,
}: {
  ctx: AppContext
  reloadToken?: number
}) {
  return (
    <div className="space-y-4 pb-4 min-w-0 overflow-x-clip">
      <div className="affiliate-card p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-green-50 grid place-items-center">
            <WhatsAppIcon size={18} className="text-green-600" />
          </div>
          <div>
            <p className="font-bold text-sm text-gray-900">WhatsApp</p>
            <p className="text-xs text-gray-400">
              Suas sessões — só você vê e gerencia as contas que criar aqui
            </p>
          </div>
        </div>

        <WhatsAppInstancesPanel
          showToast={ctx.showToast}
          reloadToken={reloadToken}
          mode="affiliate"
        />
      </div>
    </div>
  )
}