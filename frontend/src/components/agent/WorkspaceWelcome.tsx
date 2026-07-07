import { Search, MessageSquare, Megaphone, ShoppingCart, Sparkles, Package, Images, Users, Building2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { OBJECTIVE_TRIGGERS } from '@/lib/agent/workspaceTriggers'
import type { TriggerSkillOptions } from '@/lib/agent/types'

const CARD_ICONS: Record<string, LucideIcon> = {
  'lead.prospect': Search,
  'messages.inbox': MessageSquare,
  'catalog.products': Package,
  'gallery.open': Images,
  'campaigns.list': Megaphone,
  'crm.leads.table': Users,
  'crm.clients.table': Building2,
  'catalog.orders': ShoppingCart,
  'order.assisted': ShoppingCart,
}

const CARD_HINTS: Record<string, string> = {
  'lead.prospect': 'Mapa · segmento + cidade',
  'messages.inbox': 'WhatsApp · responder agora',
  'catalog.products': 'Catálogo · criar e editar',
  'gallery.open': 'Mídia · upload no chat',
  'campaigns.list': 'Campanhas · ver e criar',
  'crm.leads.table': 'Leads · CRM e importação',
  'crm.clients.table': 'Clientes · base convertida',
  'catalog.orders': 'Pedidos · vendas e status',
  'order.assisted': 'PDV · montar pedido',
}

type Props = {
  brandName?: string
  onTrigger: (skill: string, opts?: TriggerSkillOptions) => void
}

export function WorkspaceWelcome({ brandName, onTrigger }: Props) {
  return (
    <div className="workspace-welcome">
      <div className="workspace-welcome__hero">
        <div className="workspace-welcome__mark">
          <Sparkles size={14} strokeWidth={1.75} />
        </div>
        <h2 className="workspace-welcome__title">
          {brandName ? `Pronto, ${brandName}` : 'Seu comando central'}
        </h2>
        <p className="workspace-welcome__subtitle">
          Toque num atalho ou diga o que precisa. No celular as ferramentas abrem aqui; no desktop, no canvas à direita.
        </p>
      </div>

      <div className="workspace-welcome__grid">
        {OBJECTIVE_TRIGGERS.map((item) => {
          const Icon = CARD_ICONS[item.skill] || Sparkles
          return (
            <button
              key={item.skill}
              type="button"
              className="workspace-welcome__card"
              onClick={() => onTrigger(item.skill, {
                label: item.userLabel,
                assistantMessage: item.assistantMessage,
                context: item.context,
              })}
            >
              <span className="workspace-welcome__card-icon">
                <Icon size={16} strokeWidth={1.75} />
              </span>
              <span className="workspace-welcome__card-body">
                <span className="workspace-welcome__card-label">{item.userLabel}</span>
                <span className="workspace-welcome__card-hint">{CARD_HINTS[item.skill] || ''}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}