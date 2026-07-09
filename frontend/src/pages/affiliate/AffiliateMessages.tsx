import { MessageCircle } from 'lucide-react'
import { MessagesPage } from '@/pages/MessagesPage'
import { getAffiliateHeaders } from '@/lib/api-affiliate'
import type { AppContext } from '@/pages/affiliate/types'

export function AffiliateMessages({ ctx }: { ctx: AppContext }) {
  return (
    <div className="space-y-3 pb-4 min-w-0 overflow-x-clip">
      <div className="affiliate-card p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 grid place-items-center">
            <MessageCircle size={18} className="text-green-600" />
          </div>
          <div>
            <p className="font-bold text-sm text-gray-900">Mensagens</p>
            <p className="text-xs text-gray-400">
              Conversas das suas sessões WhatsApp — só o que pertence à sua conta
            </p>
          </div>
        </div>
        <div className="affiliate-inbox-embed rounded-xl overflow-hidden border border-gray-100 min-h-[420px]">
          <MessagesPage variant="inline-panel" getRequestHeaders={getAffiliateHeaders} />
        </div>
      </div>
      <p className="text-[11px] text-gray-400 px-1">
        Dúvidas sobre campanhas em massa? O admin dispara pelas contas do sistema; você responde pelo seu número.
      </p>
    </div>
  )
}