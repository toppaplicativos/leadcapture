import {
  LayoutDashboard, Users, MessageSquare, Megaphone, ShoppingCart,
  Package, Palette, Search, Phone, Mail, Truck, Globe, Bot, Zap,
  BarChart3, Receipt, Ticket, Star, Sparkles, Film, Camera,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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
  '/criativos': 'criativos',
  '/creative': 'criativos',
  '/video-studio': 'video-studio',
  '/produtos': 'produtos',
  '/pedidos': 'pedidos',
  '/estoque': 'estoque',
  '/cupons': 'cupons',
  '/avaliacoes': 'avaliacoes',
  '/design': 'design',
  '/whatsapp': 'whatsapp',
  '/instagram': 'instagram',
  '/facebook': 'facebook',
  '/pagamentos': 'pagamentos',
  '/frete': 'frete',
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
  icon: LucideIcon
  label: string
  group: string
  badge?: string
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', path: '/admin', icon: LayoutDashboard, label: 'Painel', group: 'main' },
  { key: 'leads', path: '/leads', icon: Users, label: 'Leads', group: 'main' },
  { key: 'clientes', path: '/clientes', icon: Users, label: 'Clientes', group: 'main' },
  { key: 'busca', path: '/busca', icon: Search, label: 'Busca', group: 'main' },
  { key: 'mensagens', path: '/mensagens', icon: MessageSquare, label: 'Mensagens', group: 'main' },
  { key: 'campanhas', path: '/campanhas', icon: Megaphone, label: 'Campanhas', group: 'main' },
  { key: 'automacoes', path: '/automacoes', icon: Zap, label: 'Automações', group: 'main', badge: 'Novo' },
  { key: 'criativos', path: '/criativos', icon: Palette, label: 'Criativos IA', group: 'main', badge: 'Novo' },
  { key: 'video-studio', path: '/video-studio', icon: Film, label: 'Video Studio', group: 'main', badge: 'Novo' },
  { key: 'agente', path: '/agente', icon: Bot, label: 'Agente IA', group: 'main' },
  { key: 'whatsapp', path: '/whatsapp', icon: Phone, label: 'WhatsApp', group: 'main' },
  { key: 'instagram', path: '/instagram', icon: Camera, label: 'Instagram', group: 'main', badge: 'Beta' },
  { key: 'facebook', path: '/facebook', icon: Globe, label: 'Facebook', group: 'main', badge: 'Beta' },
  { key: 'produtos', path: '/produtos', icon: Package, label: 'Produtos', group: 'loja' },
  { key: 'pedidos', path: '/pedidos', icon: ShoppingCart, label: 'Pedidos', group: 'loja' },
  { key: 'tirar-pedido', path: '/tirar-pedido', icon: Receipt, label: 'Tirar Pedido', group: 'loja' },
  { key: 'estoque', path: '/estoque', icon: BarChart3, label: 'Estoque', group: 'loja' },
  { key: 'cupons', path: '/cupons', icon: Ticket, label: 'Cupons', group: 'loja' },
  { key: 'avaliacoes', path: '/avaliacoes', icon: Star, label: 'Avaliações', group: 'loja' },
  { key: 'design', path: '/design', icon: Palette, label: 'Design', group: 'loja' },
  { key: 'pagamentos', path: '/pagamentos', icon: ShoppingCart, label: 'Pagamentos', group: 'loja' },
  { key: 'frete', path: '/frete', icon: Truck, label: 'Frete', group: 'loja' },
  { key: 'dominio', path: '/dominio', icon: Globe, label: 'Dominio', group: 'loja' },
  { key: 'emails', path: '/emails', icon: Mail, label: 'Emails', group: 'config' },
  { key: 'provedores-ia', path: '/provedores-ia', icon: Sparkles, label: 'Provedores IA', group: 'config' },
]

export const MOBILE_NAV = ['dashboard', 'leads', 'busca', 'mensagens', 'campanhas']