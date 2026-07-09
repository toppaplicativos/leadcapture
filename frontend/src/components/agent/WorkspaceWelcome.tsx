import {
  Search, Megaphone, ShoppingCart, Sparkles, Package, Images,
  Users, Building2, LayoutDashboard, Brain, BarChart3, Zap, Handshake,
} from 'lucide-react'
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from '@/components/icons'
import type { IconComponent } from '@/components/icons'
import { OBJECTIVE_TRIGGERS } from '@/lib/agent/workspaceTriggers'
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
  'campaigns.list': Megaphone,
  'crm.leads.table': Users,
  'crm.clients.table': Building2,
  'catalog.orders': ShoppingCart,
  'order.assisted': ShoppingCart,
  'skills.list': Brain,
  'catalog.products.create': Package,
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

export function WorkspaceWelcome({ brandName, brandLogoUrl, onTrigger }: Props) {
  const greeting = getTimeGreeting()
  const displayName = String(brandName || '').trim()
  const initial = (displayName || 'L').charAt(0).toUpperCase()

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
          Digite abaixo o que precisa ou escolha um atalho para começar.
        </p>

        <div className="workspace-welcome__shortcuts" role="list">
          {OBJECTIVE_TRIGGERS.map((item) => {
            const Icon = CARD_ICONS[item.skill] || Sparkles
            return (
              <button
                key={item.skill}
                type="button"
                role="listitem"
                className="workspace-welcome__shortcut"
                onClick={() => onTrigger(item.skill, {
                  label: item.userLabel,
                  assistantMessage: item.assistantMessage,
                  context: item.context,
                })}
              >
                <Icon
                  size={14}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className={
                    item.skill.startsWith('instagram.') ? 'brand-icon--ig'
                      : item.skill.startsWith('facebook.') ? 'brand-icon--fb'
                        : item.skill === 'messages.inbox' ? 'brand-icon--wa'
                          : undefined
                  }
                />
                <span>{item.userLabel}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}