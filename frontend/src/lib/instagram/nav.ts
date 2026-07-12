import type { LucideIcon } from 'lucide-react'
import {
  Sparkles, LayoutGrid, BarChart3, Zap, Bot, CalendarDays, MessageCircle,
} from 'lucide-react'
import { InstagramIcon, type IconComponent } from '@/components/icons'

export type InstagramTabKey =
  | 'overview'
  | 'create'
  | 'posts'
  | 'performance'
  | 'automations'
  | 'ai'
  | 'calendar'
  | 'messages'

export type InstagramNavItem = {
  key: InstagramTabKey
  label: string
  shortLabel: string
  icon: IconComponent | LucideIcon
  description?: string
  mobilePrimary?: boolean
}

export const IG_NAV_GROUPS: Array<{ id: string; label: string; items: InstagramNavItem[] }> = [
  {
    id: 'content',
    label: 'Conteúdo',
    items: [
      { key: 'overview', label: 'Visão geral', shortLabel: 'Início', icon: InstagramIcon, description: 'Resumo da conta e atalhos', mobilePrimary: true },
      { key: 'create', label: 'Criar post', shortLabel: 'Criar', icon: Sparkles, description: 'Gerar e publicar conteúdo', mobilePrimary: true },
      { key: 'posts', label: 'Posts', shortLabel: 'Posts', icon: LayoutGrid, description: 'Instagram e fila local', mobilePrimary: true },
    ],
  },
  {
    id: 'insights',
    label: 'Análise',
    items: [
      { key: 'performance', label: 'Performance', shortLabel: 'Métricas', icon: BarChart3, description: 'Histórico e engajamento' },
      { key: 'calendar', label: 'Calendário', shortLabel: 'Agenda', icon: CalendarDays, description: 'Posts por data' },
    ],
  },
  {
    id: 'engage',
    label: 'Engajamento',
    items: [
      { key: 'messages', label: 'Mensagens', shortLabel: 'DMs', icon: MessageCircle, description: 'Direct do Instagram' },
      { key: 'automations', label: 'Automações IG', shortLabel: 'Auto', icon: Zap, description: 'Espelho das automações que usam Instagram' },
      { key: 'ai', label: 'Atendimento IA', shortLabel: 'IA', icon: Bot, description: 'Persona e respostas' },
    ],
  },
]

export const IG_NAV_ITEMS: InstagramNavItem[] = IG_NAV_GROUPS.flatMap((g) => g.items)

export const IG_MOBILE_PRIMARY = IG_NAV_ITEMS.filter((t) => t.mobilePrimary)

export function findNavItem(key: InstagramTabKey): InstagramNavItem | undefined {
  return IG_NAV_ITEMS.find((t) => t.key === key)
}