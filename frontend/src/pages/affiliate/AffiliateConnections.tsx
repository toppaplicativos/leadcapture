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
  const brandName = ctx.brand?.name || null

  return (
    <div className="space-y-4 pb-4 min-w-0 overflow-x-clip">
      <div className="affiliate-card p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 grid place-items-center">
            <WhatsAppIcon size={18} className="text-green-600" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm text-gray-900">WhatsApp</p>
            <p className="text-xs text-gray-400">
              Sessões só desta organização
              {brandName ? (
                <> · <strong className="text-gray-600">{brandName}</strong></>
              ) : null}
            </p>
          </div>
        </div>

        <div className="mb-4 rounded-xl bg-[#f0fdf4] border border-emerald-100 px-3 py-2.5">
          <p className="text-[11px] text-emerald-900 leading-relaxed">
            Cada sessão recebe um <strong>código automático</strong> (ex.: marca-WA-001) e
            fica amarrada a <strong>{brandName || 'esta organização'}</strong>.
            Contatos enviados para este WhatsApp ficam rastreados como seus enquanto a sessão
            estiver ativa — em outro programa, use outra sessão.
          </p>
        </div>

        <WhatsAppInstancesPanel
          showToast={ctx.showToast}
          reloadToken={reloadToken}
          mode="affiliate"
          brandName={brandName}
        />
      </div>
    </div>
  )
}
