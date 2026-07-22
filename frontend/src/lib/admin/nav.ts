import {
  LayoutDashboard, Megaphone, ShoppingCart,
  Package, Palette, Search, Mail, Truck, Globe, Bot, Zap,
  BarChart3, Receipt, Ticket, Star, Sparkles, Film, Images,
  GitBranch, Brain, Headphones, Bell, Settings, Handshake, Store,
  MessageSquare, ContactRound, UserRound, CreditCard, UserCog, Bike,
} from 'lucide-react'
import { FacebookIcon, InstagramIcon, WhatsAppIcon } from '@/components/icons'
import type { IconComponent } from '@/components/icons'

export const ROUTE_MAP: Record<string, string> = {
  '/admin': 'dashboard',
  '/dashboard': 'dashboard',
  '/leads': 'leads',
  '/clientes': 'clientes',
  '/busca': 'busca',
  '/mensagens': 'mensagens',
  '/notificacoes': 'notificacoes',
  '/campanhas': 'campanhas',
  '/campanha': 'campanhas',
  '/automacoes': 'automacoes',
  '/fluxos': 'fluxos',
  '/habilidades': 'habilidades',
  '/skills': 'habilidades',
  '/atendente': 'atendente',
  '/criativos': 'criativos',
  '/creative': 'criativos',
  '/galeria': 'galeria',
  '/video-studio': 'video-studio',
  '/produtos': 'produtos',
  '/pedidos': 'pedidos',
  '/estoque': 'estoque',
  '/afiliados': 'afiliados',
  '/cupons': 'cupons',
  '/avaliacoes': 'avaliacoes',
  '/loja': 'loja',
  '/design': 'loja',
  '/whatsapp': 'whatsapp',
  '/instagram': 'instagram',
  '/facebook': 'facebook',
  '/pagamentos': 'pagamentos',
  '/frete': 'frete',
  '/entregas': 'entregas',
  '/mob': 'entregas',
  '/dominio': 'dominio',

  '/agente': 'agente',
  '/configuracoes': 'configuracoes',
  '/provedores-ia': 'provedores-ia',
  '/emails': 'emails',
  '/tirar-pedido': 'tirar-pedido',
}

export function resolveSection(pathname: string): string {
  return ROUTE_MAP[pathname] || 'dashboard'
}

export type NavItem = {
  key: string
  path: string
  icon: IconComponent
  label: string
  group: string
  badge?: string
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', path: '/admin', icon: LayoutDashboard, label: 'Painel', group: 'main' },
  { key: 'leads', path: '/leads', icon: UserRound, label: 'Leads', group: 'main' },
  { key: 'clientes', path: '/clientes', icon: ContactRound, label: 'Clientes', group: 'main' },
  { key: 'busca', path: '/busca', icon: Search, label: 'Busca', group: 'main' },
  { key: 'mensagens', path: '/mensagens', icon: MessageSquare, label: 'Mensagens', group: 'main' },
  { key: 'campanhas', path: '/campanhas', icon: Megaphone, label: 'Campanhas', group: 'main' },
  { key: 'automacoes', path: '/automacoes', icon: Zap, label: 'Automações', group: 'main', badge: 'Novo' },
  { key: 'fluxos', path: '/fluxos', icon: GitBranch, label: 'Fluxos', group: 'main' },
  { key: 'habilidades', path: '/habilidades', icon: Brain, label: 'Habilidades', group: 'main' },
  { key: 'criativos', path: '/criativos', icon: Palette, label: 'Criativos IA', group: 'main', badge: 'Novo' },
  { key: 'galeria', path: '/galeria', icon: Images, label: 'Galeria', group: 'main' },
  { key: 'video-studio', path: '/video-studio', icon: Film, label: 'Video Studio', group: 'main', badge: 'Novo' },
  { key: 'agente', path: '/agente', icon: Bot, label: 'Agente IA', group: 'main' },
  { key: 'atendente', path: '/atendente', icon: Headphones, label: 'Atendente', group: 'main' },
  { key: 'notificacoes', path: '/notificacoes', icon: Bell, label: 'Notificações', group: 'main' },
  { key: 'instagram', path: '/instagram', icon: InstagramIcon, label: 'Instagram', group: 'main', badge: 'Beta' },
  { key: 'facebook', path: '/facebook', icon: FacebookIcon, label: 'Facebook', group: 'main', badge: 'Beta' },
  { key: 'produtos', path: '/produtos', icon: Package, label: 'Produtos', group: 'loja' },
  { key: 'pedidos', path: '/pedidos', icon: ShoppingCart, label: 'Pedidos', group: 'loja' },
  { key: 'tirar-pedido', path: '/tirar-pedido', icon: Receipt, label: 'Tirar Pedido', group: 'loja' },
  { key: 'estoque', path: '/estoque', icon: UserCog, label: 'Gestores de estoque', group: 'loja' },
  { key: 'afiliados', path: '/afiliados', icon: Handshake, label: 'Afiliados', group: 'loja', badge: 'Novo' },
  { key: 'cupons', path: '/cupons', icon: Ticket, label: 'Cupons', group: 'loja' },
  { key: 'avaliacoes', path: '/avaliacoes', icon: Star, label: 'Avaliações', group: 'loja' },
  { key: 'loja', path: '/loja', icon: Store, label: 'Loja', group: 'loja' },
  { key: 'pagamentos', path: '/pagamentos', icon: CreditCard, label: 'Pagamentos', group: 'loja' },
  { key: 'frete', path: '/frete', icon: Truck, label: 'Frete & entrega', group: 'loja' },
  { key: 'entregas', path: '/entregas', icon: Bike, label: 'Lead Capture Mob', group: 'loja', badge: 'Novo' },
  { key: 'dominio', path: '/dominio', icon: Globe, label: 'Dominio', group: 'loja' },
  { key: 'whatsapp', path: '/whatsapp', icon: WhatsAppIcon, label: 'WhatsApp', group: 'config' },
  { key: 'configuracoes', path: '/configuracoes', icon: Settings, label: 'Configurações', group: 'config' },
  { key: 'emails', path: '/emails', icon: Mail, label: 'Emails', group: 'config' },
  { key: 'provedores-ia', path: '/provedores-ia', icon: Sparkles, label: 'Provedores IA', group: 'config' },
]

export const MOBILE_NAV = ['dashboard', 'leads', 'mensagens', 'whatsapp', 'configuracoes']
