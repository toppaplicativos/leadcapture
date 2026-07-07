import {
  Search, MessageSquare, Megaphone, ShoppingCart, Sparkles, Package, Images,
  Users, Building2, LayoutDashboard, Brain, Camera, BarChart3, Globe, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { OBJECTIVE_TRIGGERS } from '@/lib/agent/workspaceTriggers'
import type { TriggerSkillOptions } from '@/lib/agent/types'

const CARD_ICONS: Record<string, LucideIcon> = {
  'dashboard.overview': LayoutDashboard,
  'lead.prospect': Search,
  'messages.inbox': MessageSquare,
  'catalog.products': Package,
  'gallery.open': Images,
  'instagram.open': Camera,
  'instagram.post.create': Camera,
  'instagram.analyze': BarChart3,
  'facebook.open': Globe,
  'facebook.post.create': Globe,
  'facebook.analyze': BarChart3,
  'automation.open': Zap,
  'automation.create': Zap,
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
                <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
                <span>{item.userLabel}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}