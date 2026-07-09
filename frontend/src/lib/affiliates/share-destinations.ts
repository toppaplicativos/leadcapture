import type { LucideIcon } from 'lucide-react'
import {
  MessageCircle, Smartphone, Users, Film, Link2, Share2, Search, Camera,
} from 'lucide-react'

export type ShareDestinationId =
  | 'whatsapp_dm'
  | 'whatsapp_status'
  | 'whatsapp_broadcast'
  | 'instagram_feed'
  | 'instagram_story'
  | 'instagram_reels'
  | 'instagram_bio'
  | 'seo_link'

export type ShareKitId = 'catalog' | 'product' | 'program' | 'material' | 'coupon'

export type ShareDestination = {
  id: ShareDestinationId
  label: string
  shortLabel: string
  icon: LucideIcon
  channel: 'whatsapp' | 'instagram' | 'geral'
  maxChars: number
  imageAspect: '1:1' | '4:5' | '9:16' | '16:9' | 'none'
  fields: Array<'seo_title' | 'headline' | 'subtitle' | 'body' | 'hashtags' | 'cta'>
  hint: string
}

export const SHARE_DESTINATIONS: ShareDestination[] = [
  {
    id: 'whatsapp_dm',
    label: 'WhatsApp — mensagem direta',
    shortLabel: 'WA direto',
    icon: MessageCircle,
    channel: 'whatsapp',
    maxChars: 520,
    imageAspect: '1:1',
    fields: ['headline', 'body', 'cta'],
    hint: 'Conversa 1:1 com cupom e link. Tom próximo, sem textão.',
  },
  {
    id: 'whatsapp_status',
    label: 'WhatsApp — status',
    shortLabel: 'Status',
    icon: Smartphone,
    channel: 'whatsapp',
    maxChars: 280,
    imageAspect: '9:16',
    fields: ['headline', 'body', 'cta'],
    hint: 'Texto curto para status com arte vertical.',
  },
  {
    id: 'whatsapp_broadcast',
    label: 'WhatsApp — lista / transmissão',
    shortLabel: 'Lista WA',
    icon: Users,
    channel: 'whatsapp',
    maxChars: 480,
    imageAspect: '1:1',
    fields: ['headline', 'subtitle', 'body', 'cta'],
    hint: 'Convite para lista com benefício claro e CTA.',
  },
  {
    id: 'instagram_feed',
    label: 'Instagram — feed',
    shortLabel: 'Feed',
    icon: Camera,
    channel: 'instagram',
    maxChars: 900,
    imageAspect: '4:5',
    fields: ['headline', 'subtitle', 'body', 'hashtags', 'cta'],
    hint: 'Legenda completa com gancho, valor e hashtags.',
  },
  {
    id: 'instagram_story',
    label: 'Instagram — stories',
    shortLabel: 'Stories',
    icon: Smartphone,
    channel: 'instagram',
    maxChars: 220,
    imageAspect: '9:16',
    fields: ['headline', 'body', 'cta'],
    hint: 'Frase de impacto + CTA para responder ou clicar.',
  },
  {
    id: 'instagram_reels',
    label: 'Instagram — reels',
    shortLabel: 'Reels',
    icon: Film,
    channel: 'instagram',
    maxChars: 420,
    imageAspect: '9:16',
    fields: ['headline', 'subtitle', 'body', 'hashtags', 'cta'],
    hint: 'Gancho na primeira linha + CTA para comentar.',
  },
  {
    id: 'instagram_bio',
    label: 'Link na bio',
    shortLabel: 'Bio',
    icon: Link2,
    channel: 'instagram',
    maxChars: 150,
    imageAspect: 'none',
    fields: ['headline', 'cta'],
    hint: 'Linha curta para bio com indicação do link.',
  },
  {
    id: 'seo_link',
    label: 'Link com preview (SEO)',
    shortLabel: 'Preview',
    icon: Search,
    channel: 'geral',
    maxChars: 320,
    imageAspect: '16:9',
    fields: ['seo_title', 'subtitle', 'body'],
    hint: 'Título e descrição otimizados para preview no WhatsApp.',
  },
]

export const SHARE_KITS: Array<{
  id: ShareKitId
  label: string
  desc: string
  icon: LucideIcon
}> = [
  { id: 'catalog', label: 'Catálogo', desc: 'Divulgar a loja completa com cupom', icon: Share2 },
  { id: 'product', label: 'Produto', desc: 'Destaque um item com link rastreado', icon: Share2 },
  { id: 'coupon', label: 'Cupom', desc: 'Foco no desconto e urgência leve', icon: Share2 },
  { id: 'program', label: 'Convite parceiro', desc: 'Chamar novos vendedores ao programa', icon: Users },
  { id: 'material', label: 'Material da marca', desc: 'Arte oficial + texto alinhado', icon: Share2 },
]

export function getShareDestination(id: ShareDestinationId): ShareDestination {
  return SHARE_DESTINATIONS.find((d) => d.id === id) || SHARE_DESTINATIONS[0]
}