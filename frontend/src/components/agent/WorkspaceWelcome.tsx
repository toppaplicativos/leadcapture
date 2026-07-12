import { useState } from 'react'
import {
  Search, Megaphone, ShoppingCart, Sparkles, Package, Images,
  Users, Building2, LayoutDashboard, Brain, BarChart3, Zap, Handshake,
  MessageSquare, Settings, ChevronRight, Headphones, MoreHorizontal,
  Film, Ticket, Truck, Mail, Bell, Store,
} from 'lucide-react'
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from '@/components/icons'
import type { IconComponent } from '@/components/icons'
import {
  OBJECTIVE_GROUPS,
  QUICK_STARTERS,
  type ObjectiveGroupId,
  type WorkspaceTrigger,
} from '@/lib/agent/workspaceTriggers'
import type { TriggerSkillOptions } from '@/lib/agent/types'

const CARD_ICONS: Record<string, IconComponent> = {
  'dashboard.overview': LayoutDashboard,
  'lead.prospect': Search,
  'messages.inbox': WhatsAppIcon,
  'catalog.products': Package,
  'gallery.open': Images,
  'instagram.open': InstagramIcon,
  'instagram.post.create': InstagramIcon,
  'instagram.analyze': BarChart3,
  'facebook.open': FacebookIcon,
  'facebook.post.create': FacebookIcon,
  'facebook.analyze': BarChart3,
  'automation.open': Zap,
  'automation.create': Zap,
  'affiliate.open': Handshake,
  'affiliate.create': Handshake,
  'affiliate.config': Handshake,
  'campaigns.list': Megaphone,
  'crm.leads.table': Users,
  'crm.clients.table': Building2,
  'catalog.orders': ShoppingCart,
  'order.assisted': ShoppingCart,
  'skills.list': Brain,
  'catalog.products.create': Package,
  'whatsapp.connect': WhatsAppIcon,
  'settings.open': Settings,
  'creative.generate': Sparkles,
  'video.create': Film,
  'flow.builder': Zap,
  'design.edit': Store,
  'workspace.overview': Brain,
  'nav.cupons': Ticket,
  'nav.frete': Truck,
  'nav.emails': Mail,
  'nav.notificacoes': Bell,
  'nav.estoque': Package,
  'nav.pagamentos': ShoppingCart,
  'nav.avaliacoes': Sparkles,
  'nav.dominio': Settings,
  'nav.atendente': Headphones,
  'nav.provedores-ia': Sparkles,
}

const GROUP_ICONS: Record<ObjectiveGroupId, IconComponent> = {
  atender: Headphones,
  captar: Search,
  vender: ShoppingCart,
  marca: Sparkles,
  mais: MoreHorizontal,
}

function getTimeGreeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'Bom dia'
  if (hour >= 12 && hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

type Props = {
  brandName?: string
  brandLogoUrl?: string | null
  onTrigger: (skill: string, opts?: TriggerSkillOptions) => void
}

function fireTrigger(
  onTrigger: Props['onTrigger'],
  item: WorkspaceTrigger,
) {
  onTrigger(item.skill, {
    label: item.userLabel,
    assistantMessage: item.assistantMessage,
    context: item.context,
  })
}

export function WorkspaceWelcome({ brandName, brandLogoUrl, onTrigger }: Props) {
  const greeting = getTimeGreeting()
  const displayName = String(brandName || '').trim()
  const initial = (displayName || 'L').charAt(0).toUpperCase()
  const [openGroup, setOpenGroup] = useState<ObjectiveGroupId | null>(null)

  const activeGroup = OBJECTIVE_GROUPS.find((g) => g.id === openGroup) || null

  return (
    <div className="workspace-welcome">
      <div className="workspace-welcome__center">
        <div className="workspace-welcome__brand" aria-hidden="true">
          {brandLogoUrl ? (
            <img
              src={brandLogoUrl}
              alt=""
              className="workspace-welcome__logo"
            />
          ) : (
            <span className="workspace-welcome__logo workspace-welcome__logo--fallback">
              {initial}
            </span>
          )}
        </div>

        <p className="workspace-welcome__greeting">{greeting}</p>
        <h2 className="workspace-welcome__title">
          {displayName ? (
            <>Bem-vindo, <span className="workspace-welcome__brand-name">{displayName}</span></>
          ) : (
            'Bem-vindo ao seu comando central'
          )}
        </h2>
        <p className="workspace-welcome__subtitle">
          Chat comanda · painel à direita executa. Escolha um atalho rápido ou um grupo de trabalho.
        </p>

        {/* ≤5 quick starters — job diário */}
        <div className="workspace-welcome__quick" role="list" aria-label="Atalhos rápidos">
          {QUICK_STARTERS.map((item) => {
            const Icon = CARD_ICONS[item.skill] || Sparkles
            return (
              <button
                key={item.skill}
                type="button"
                role="listitem"
                className="workspace-welcome__shortcut workspace-welcome__shortcut--primary"
                onClick={() => fireTrigger(onTrigger, item)}
              >
                <Icon
                  size={14}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className={
                    item.skill.startsWith('instagram.') ? 'brand-icon--ig'
                      : item.skill.startsWith('facebook.') ? 'brand-icon--fb'
                        : item.skill === 'messages.inbox' || item.skill === 'whatsapp.connect'
                          ? 'brand-icon--wa'
                          : undefined
                  }
                />
                <span>{item.userLabel}</span>
              </button>
            )
          })}
        </div>

        {/* Grupos em grade 2 colunas — progressive disclosure */}
        <div className="workspace-welcome__groups" role="list" aria-label="Áreas de trabalho">
          {OBJECTIVE_GROUPS.map((group) => {
            const Icon = GROUP_ICONS[group.id]
            const isOpen = openGroup === group.id
            return (
              <button
                key={group.id}
                type="button"
                role="listitem"
                className={`workspace-welcome__group${isOpen ? ' is-open' : ''}`}
                aria-expanded={isOpen}
                onClick={() => setOpenGroup(isOpen ? null : group.id)}
              >
                <span className="workspace-welcome__group-icon" aria-hidden>
                  <Icon size={16} strokeWidth={1.75} />
                </span>
                <span className="workspace-welcome__group-text">
                  <span className="workspace-welcome__group-label">{group.label}</span>
                  <span className="workspace-welcome__group-hint">{group.hint}</span>
                </span>
                <ChevronRight
                  size={14}
                  className={`workspace-welcome__group-chevron${isOpen ? ' is-open' : ''}`}
                  aria-hidden
                />
              </button>
            )
          })}

          {activeGroup && (
            <div
              className="workspace-welcome__group-panel"
              role="region"
              aria-label={`Ações: ${activeGroup.label}`}
            >
              <p className="workspace-welcome__group-panel-title">{activeGroup.label}</p>
              <div className="workspace-welcome__group-items">
                {activeGroup.items.map((item) => {
                  const Icon = CARD_ICONS[item.skill] || Sparkles
                  return (
                    <button
                      key={`${activeGroup.id}-${item.skill}-${item.userLabel}`}
                      type="button"
                      className="workspace-welcome__group-item"
                      onClick={() => fireTrigger(onTrigger, item)}
                    >
                      <Icon size={14} strokeWidth={1.75} aria-hidden />
                      <span>{item.userLabel}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <p className="workspace-welcome__model-hint">
          <MessageSquare size={12} aria-hidden />
          Ou digite abaixo — o painel abre à direita no desktop.
        </p>
      </div>
    </div>
  )
}
